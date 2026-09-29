// @ts-nocheck
import { randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";
import {
  canTransitionOrder,
  canTransitionRoom,
  departmentScope,
  eachNight,
  extensionDecision,
  guestCanCancelOrder,
  hasPermission,
  isDateOnly,
  orderIsPriced,
  tehranToday,
} from "./domain";
import { FixedWindowLimiter, shouldRunSweep } from "./rate-limit";
import {
  bookRoomSql,
  checkInSql,
  checkOutSql,
  confirmReservationSql,
  expirePendingSql,
  extendStaySql,
  placeOrderSql,
  releaseReservationSql,
  transitionOrderSql,
} from "./statements";

export function hotel(code) {
	const err = /* @__PURE__ */ new Error(`HOTEL:${code}`);
	err.name = "HotelError";
	return err;
}
// Per-process limiter with bounded memory (expired keys are swept); see rate-limit.ts.
const limiter = new FixedWindowLimiter();
function limit(key, max, windowMs) {
	if (!limiter.hit(key, max, windowMs)) throw hotel("rate_limited");
}
function log(action, fields) {
	console.log(JSON.stringify({
		ts: (/* @__PURE__ */ new Date()).toISOString(),
		scope: "hotel",
		action,
		...fields
	}));
}
async function db() {
	return getSql();
}
function refCode(prefix) {
	return `${prefix}${randomBytes(4).toString("hex").toUpperCase()}`;
}
function isUnique(err) {
	const e = err;
	return e?.code === "23505" || /duplicate key|unique/i.test(e?.message ?? "");
}
async function actorOf(sql, userId) {
	const roles = await sql`
    select role_code from user_roles where user_id = ${userId}
  `;
	const perms = await sql`
    select distinct rp.permission_code
      from user_roles ur
      join role_permissions rp on rp.role_code = ur.role_code
     where ur.user_id = ${userId}
  `;
	return {
		userId,
		roles: roles.map((r) => r.role_code),
		perms: perms.map((p) => p.permission_code)
	};
}
function need(actor, permission) {
	if (!hasPermission(actor.perms, permission)) throw hotel("forbidden");
}
async function setting(sql, key) {
	return (await sql`select value from hotel_settings where key = ${key}`)[0]?.value ?? "";
}
// The lazy hold-expiry sweep is an UPDATE. The public availability search runs
// it too, so without a throttle every anonymous search would write to the
// database; at most one sweep per EXPIRE_SWEEP_MS per process is plenty for a
// 30-minute hold. Booking and the staff list force a fresh sweep.
const EXPIRE_SWEEP_MS = 30_000;
let lastExpireAt = 0;
async function expire(sql, force = false) {
	const now = Date.now();
	if (!force && !shouldRunSweep(lastExpireAt, now, EXPIRE_SWEEP_MS)) return;
	lastExpireAt = now;
	const q = expirePendingSql(Number(await setting(sql, "pending_hold_minutes")) || 30);
	await sql.query(q.text, q.values);
}
function cleanName(value) {
	const name = value.trim().replace(/\s+/g, " ");
	if (name.length < 2 || name.length > 120) throw hotel("validation");
	return name;
}
function cleanPhone(value) {
	if (!value) return null;
	const phone = value.trim();
	if (!/^[0-9+\-\s()]{6,24}$/.test(phone)) throw hotel("validation");
	return phone;
}
function cleanKey(value) {
	if (!/^[A-Za-z0-9_-]{8,80}$/.test(value)) throw hotel("validation");
	return value;
}
export async function bootstrapUser(userId) {
	const sql = await db();
	await sql`
    insert into profiles (user_id, full_name)
    select id, name from "user" where id = ${userId}
    on conflict (user_id) do nothing
  `;
	await sql`
    insert into user_roles (user_id, role_code)
    select ${userId}, 'GUEST'
     where exists (select 1 from "user" u where u.id = ${userId})
    on conflict do nothing
  `;
}
export async function publicHotel() {
	const sql = await db();
	const [facts, settings, policies, media, types, amenities, offerings] = await Promise.all([
		sql`select key, value_en, value_fa from hotel_facts where key in ('name','phone','units','about','lobby') order by key`,
		sql`select key, value from hotel_settings where key in ('address_en','address_fa','geo_lat','geo_lng','announcement_en','announcement_fa','breakfast_hours','coffee_hours','check_in_time','check_out_time') order by key`,
		sql`select code, title_en, title_fa, body_en, body_fa from hotel_policies order by code`,
		sql`select id, category, title_en, title_fa, url from hotel_media where active = true order by sort_order`,
		sql`
      select code, name_en, name_fa, capacity, description_en, description_fa, base_rate_toman, image_url
        from room_types order by sort_order
    `,
		sql`
      select rta.room_type_code, a.code, a.name_en, a.name_fa,
             (a.verification_status = 'group_site' or a.code = 'KITCHENETTE') as listed
        from room_type_amenities rta
        join amenities a on a.code = rta.amenity_code
       order by a.code
    `,
		sql`select scope, name_en, name_fa, offered, highlight from hotel_offerings order by scope, sort_order`
	]);
	const roomCount = await sql`select count(*)::int as n from rooms`;
	return {
		facts,
		settings,
		policies,
		media,
		types,
		amenities,
		offerings,
		roomCount: roomCount[0]?.n ?? 0,
		today: tehranToday()
	};
}
export async function searchAvailability(input) {
	if (!isDateOnly(input.checkIn) || !isDateOnly(input.checkOut)) throw hotel("invalid_dates");
	const nights = eachNight(input.checkIn, input.checkOut);
	if (nights.length < 1 || nights.length > 366) throw hotel("invalid_dates");
	if (input.checkIn < tehranToday()) throw hotel("invalid_dates");
	if (input.guests < 1 || input.guests > 8) throw hotel("validation");
	const sql = await db();
	await expire(sql);
	const rows = await sql.query(`
      select rt.code, rt.name_en, rt.name_fa, rt.capacity, rt.description_en, rt.description_fa,
             rt.base_rate_toman, rt.rate_verification, rt.capacity_verification,
             (
               select count(*)::int from rooms r
                where r.room_type_code = rt.code
                  and r.status not in ('OUT_OF_SERVICE','BLOCKED','MAINTENANCE')
                  and r.capacity >= $1
                  and not exists (
                    select 1 from room_nights n
                     where n.room_id = r.id
                       and n.night = any (string_to_array($2, ',')::date[])
                  )
             ) as available
        from room_types rt
       order by rt.sort_order
    `, [input.guests, nights.join(",")]);
	return {
		nights: nights.length,
		checkIn: input.checkIn,
		checkOut: input.checkOut,
		guests: input.guests,
		types: rows
	};
}
export async function sessionContext(userId) {
	await bootstrapUser(userId);
	const sql = await db();
	const actor = await actorOf(sql, userId);
	const profile = await sql`select * from profiles where user_id = ${userId}`;
	const user = await sql`select name, email from "user" where id = ${userId}`;
	const stay = await sql`
    select s.id, s.status, s.room_id, rm.number as room_number, rm.floor, rm.qr_code,
           r.id as reservation_id, r.code, r.check_in, r.check_out, r.guest_name, r.nightly_rate_toman,
           rt.name_en as type_en, rt.name_fa as type_fa
      from stays s
      join rooms rm on rm.id = s.room_id
      join reservations r on r.id = s.reservation_id
      join room_types rt on rt.code = r.room_type_code
     where s.user_id = ${userId} and s.status in ('ACTIVE','CHECKOUT_PENDING')
     order by s.id desc
     limit 1
  `;
	const unread = await unreadCount(sql, userId, actor.roles);
	const adminExists = await sql`
    select count(*)::int as n from user_roles where role_code in ('HOTEL_ADMIN','SUPER_ADMIN')
  `;
	return {
		userId,
		name: user[0]?.name ?? "",
		email: user[0]?.email ?? "",
		roles: actor.roles,
		permissions: actor.perms,
		profile: profile[0] ?? null,
		activeStay: stay[0] ?? null,
		unread,
		adminExists: (adminExists[0]?.n ?? 0) > 0,
		today: tehranToday()
	};
}
async function unreadCount(sql, userId, roles) {
	return (await sql.query(`
      select count(*)::int as n
        from notifications n
       where (
         n.recipient_user_id = $1
         or n.recipient_role = any($2::text[])
       )
         and not exists (
           select 1 from notification_receipts r
            where r.notification_id = n.id and r.user_id = $1
         )
    `, [userId, roles]))[0]?.n ?? 0;
}
export async function saveProfile(userId, input) {
	const sql = await db();
	await bootstrapUser(userId);
	const fullName = cleanName(input.fullName);
	const phone = cleanPhone(input.phone);
	const nationality = input.nationality?.trim().slice(0, 80) || null;
	const dob = input.dateOfBirth && isDateOnly(input.dateOfBirth) ? input.dateOfBirth : null;
	const docType = input.idDocType?.trim().slice(0, 40) || null;
	const last4 = input.idDocLast4?.trim() || null;
	if (last4 && !/^\d{4}$/.test(last4)) throw hotel("validation");
	await sql`
    update profiles
       set full_name = ${fullName},
           phone = ${phone},
           nationality = ${nationality},
           date_of_birth = ${dob},
           id_doc_type = ${docType},
           id_doc_last4 = ${last4},
           locale = ${input.locale === "en" ? "en" : "fa"}
     where user_id = ${userId}
  `;
	await sql`update "user" set name = ${fullName} where id = ${userId}`;
	log("profile.update", { userId });
	return { ok: true };
}
export async function claimAdmin(userId) {
	limit(`claim:${userId}`, 5, 6e4);
	const sql = await db();
	await bootstrapUser(userId);
	// First-come claim is open to every signed-in account unless the owner pins
	// it to one address with BOOTSTRAP_ADMIN_EMAIL (compared case-insensitively).
	const allowed = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
	if (allowed) {
		const me = (await sql`select lower(email) as email from "user" where id = ${userId}`)[0];
		if (!me || me.email !== allowed) throw hotel("claim_restricted");
	}
	if (!(await sql.query(`
      with upd as (
        update hotel_settings
           set value = $1
         where key = 'bootstrap_admin'
           and not exists (
             select 1 from user_roles where role_code in ('HOTEL_ADMIN','SUPER_ADMIN')
           )
        returning key
      ),
      role as (
        insert into user_roles (user_id, role_code)
        select $1, 'HOTEL_ADMIN' from upd
        on conflict do nothing
        returning user_id
      ),
      audited as (
        insert into audit_logs (actor_user_id, action, entity_type, entity_id, new_value)
        select $1, 'admin.claim', 'user', $1, jsonb_build_object('role','HOTEL_ADMIN')
          from role
        returning id
      )
      select user_id from role
    `, [userId]))[0]) throw hotel("claim_closed");
	log("admin.claim", { userId });
	return { ok: true };
}
export async function createReservation(userId, input) {
	limit(`book:${userId}`, 8, 6e4);
	if (!isDateOnly(input.checkIn) || !isDateOnly(input.checkOut)) throw hotel("invalid_dates");
	const nights = eachNight(input.checkIn, input.checkOut);
	if (nights.length < 1 || nights.length > 366) throw hotel("invalid_dates");
	if (input.checkIn < tehranToday()) throw hotel("invalid_dates");
	const adults = input.adults;
	const children = input.children || 0;
	if (adults < 1 || adults > 8 || children < 0 || adults + children > 8) throw hotel("validation");
	const guestName = cleanName(input.guestName);
	const guestPhone = cleanPhone(input.guestPhone);
	const key = cleanKey(input.idempotencyKey);
	const notes = input.notes?.trim().slice(0, 500) || null;
	const sql = await db();
	await bootstrapUser(userId);
	await expire(sql, true);
	const existing = await sql`
    select id, code, status from reservations
     where user_id = ${userId} and idempotency_key = ${key}
  `;
	if (existing[0]) return existing[0];
	const type = (await sql`
    select code, base_rate_toman, capacity from room_types where code = ${input.roomType}
  `)[0];
	if (!type) throw hotel("validation");
	if (adults + children > type.capacity) throw hotel("capacity");
	const status = type.base_rate_toman != null ? "CONFIRMED" : "PENDING";
	const call = bookRoomSql({
		roomType: type.code,
		userId,
		code: refCode("SP"),
		checkIn: input.checkIn,
		checkOut: input.checkOut,
		adults,
		children,
		guestName,
		guestPhone,
		notes,
		idempotencyKey: key,
		nights,
		today: tehranToday(),
		nightlyRate: type.base_rate_toman,
		status
	});
	try {
		const rows = await sql.query(call.text, call.values);
		if (!rows[0]) throw hotel("room_unavailable");
		log("reservation.create", {
			userId,
			id: rows[0].id,
			status: rows[0].status
		});
		return rows[0];
	} catch (err) {
		if (!isUnique(err)) throw err;
		const again = await sql`
      select id, code, status from reservations where user_id = ${userId} and idempotency_key = ${key}
    `;
		if (again[0]) return again[0];
		throw hotel("room_unavailable");
	}
}
export async function myReservations(userId) {
	return (await db())`
    select r.id, r.code, r.status, r.check_in, r.check_out, r.adults, r.children,
           r.nightly_rate_toman, r.guest_name, r.created_at, rm.number as room_number,
           rt.name_en, rt.name_fa
      from reservations r
      left join rooms rm on rm.id = r.room_id
      join room_types rt on rt.code = r.room_type_code
     where r.user_id = ${userId}
     order by r.id desc
     limit 50
  `;
}
export async function cancelMyReservation(userId, reservationId) {
	const sql = await db();
	const call = releaseReservationSql({
		reservationId,
		actorId: userId,
		nextStatus: "CANCELLED",
		ownerOnly: true
	});
	if (!(await sql.query(call.text, call.values))[0]) throw hotel("bad_transition");
	log("reservation.cancel", {
		userId,
		id: reservationId
	});
	return { ok: true };
}
export async function myStay(userId) {
	return (await sessionContext(userId)).activeStay;
}
export async function listServices() {
	return (await db())`
    select sv.id, sv.code, sv.name_en, sv.name_fa, sv.description_en, sv.description_fa,
           sv.price_toman, sv.complimentary, sv.verification_status, sv.requires_note,
           sv.category_code, sc.department_code, sc.name_en as category_en, sc.name_fa as category_fa,
           sc.verification_status as category_verification
      from services sv
      join service_categories sc on sc.code = sv.category_code
     where sv.active = true
     order by sc.code, sv.id
  `;
}
export async function placeOrder(userId, input) {
	limit(`order:${userId}`, 20, 6e4);
	const quantity = input.quantity;
	if (quantity < 1 || quantity > 20) throw hotel("validation");
	const key = cleanKey(input.idempotencyKey);
	const notes = input.notes?.trim().slice(0, 500) || null;
	const sql = await db();
	const existing = await sql`
    select id, code, department_code from orders where user_id = ${userId} and idempotency_key = ${key}
  `;
	if (existing[0]) return existing[0];
	const stay = await sql`
    select id, status from stays
     where user_id = ${userId} and status = 'ACTIVE'
     order by id desc limit 1
  `;
	if (!stay[0]) throw hotel("stay_inactive");
	const svc = await sql`
    select sv.id, sv.requires_note, sc.department_code, sv.category_code
      from services sv
      join service_categories sc on sc.code = sv.category_code
     where sv.id = ${input.serviceId} and sv.active = true
  `;
	if (!svc[0]) throw hotel("validation");
	if (svc[0].requires_note && !notes) throw hotel("validation");
	if (svc[0].department_code === "PARKING" && !input.plate?.trim()) throw hotel("validation");
	const serviceDate = input.serviceDate && isDateOnly(input.serviceDate) ? input.serviceDate : null;
	const call = placeOrderSql({
		code: refCode("SO"),
		stayId: stay[0].id,
		userId,
		serviceId: svc[0].id,
		quantity,
		notes,
		idempotencyKey: key,
		priority: svc[0].department_code === "MAINTENANCE" ? "HIGH" : "NORMAL",
		serviceDate,
		serviceTime: input.serviceTime?.trim().slice(0, 8) || null,
		guestCount: input.guestCount && input.guestCount > 0 ? Math.min(input.guestCount, 8) : null,
		laundryLabel: notes,
		plate: input.plate?.trim().slice(0, 20) || null,
		vehicleType: input.vehicleType?.trim().slice(0, 40) || null,
		issueCode: input.issueCode?.trim().slice(0, 40) || svc[0].category_code
	});
	try {
		const rows = await sql.query(call.text, call.values);
		if (!rows[0]) throw hotel("stay_inactive");
		log("order.create", {
			userId,
			id: rows[0].id,
			department: rows[0].department_code
		});
		return rows[0];
	} catch (err) {
		if (!isUnique(err)) throw err;
		const again = await sql`
      select id, code, department_code from orders where user_id = ${userId} and idempotency_key = ${key}
    `;
		if (again[0]) return again[0];
		throw hotel("validation");
	}
}
export async function myOrders(userId) {
	return (await db())`
    select o.id, o.code, o.status, o.department_code, o.notes, o.created_at, o.priority,
           o.service_date, o.service_time, rm.number as room_number,
           oi.name_en, oi.name_fa, oi.quantity, oi.unit_price_toman, oi.complimentary
      from orders o
      join rooms rm on rm.id = o.room_id
      join order_items oi on oi.order_id = o.id
     where o.user_id = ${userId}
     order by o.id desc
     limit 80
  `;
}
export async function cancelMyOrder(userId, orderId) {
	const sql = await db();
	const order = (await sql`
    select status, department_code from orders where id = ${orderId} and user_id = ${userId}
  `)[0];
	if (!order) throw hotel("not_found");
	if (!guestCanCancelOrder(order.status)) throw hotel("bad_transition");
	const call = transitionOrderSql({
		orderId,
		actorId: userId,
		from: order.status,
		to: "CANCELLED",
		department: null
	});
	if (!(await sql.query(call.text, call.values))[0]) throw hotel("bad_transition");
	log("order.cancel", {
		userId,
		id: orderId
	});
	return { ok: true };
}
export async function myFolio(userId) {
	const sql = await db();
	const folio = await sql`
    select f.id, f.status, f.currency, s.id as stay_id, s.status as stay_status, r.code, rm.number as room_number
      from folios f
      join stays s on s.id = f.stay_id
      join reservations r on r.id = f.reservation_id
      join rooms rm on rm.id = s.room_id
     where f.user_id = ${userId}
     order by f.id desc
     limit 1
  `;
	if (!folio[0]) return {
		folio: null,
		items: [],
		payments: [],
		balance: 0
	};
	const id = folio[0].id;
	const items = await sql`
    select id, source_type, source_id, description_en, description_fa, amount_toman, quantity, voided, created_at
      from folio_items where folio_id = ${id} order by id
  `;
	const payments = await sql`
    select id, amount_toman, method, status, reference, created_at
      from payments where folio_id = ${id} order by id
  `;
	const charges = items.filter((i) => !i.voided).reduce((s, i) => s + i.amount_toman, 0);
	const paid = payments.filter((p) => p.status === "RECORDED").reduce((s, p) => s + p.amount_toman, 0);
	return {
		folio: folio[0],
		items,
		payments,
		balance: charges - paid
	};
}
export async function requestExtension(userId, requestedCheckOut) {
	if (!isDateOnly(requestedCheckOut)) throw hotel("invalid_dates");
	const sql = await db();
	const current = (await sql`
    select s.id, s.room_id, r.check_out, r.nightly_rate_toman, r.id as reservation_id
      from stays s
      join reservations r on r.id = s.reservation_id
     where s.user_id = ${userId} and s.status = 'ACTIVE'
     order by s.id desc limit 1
  `)[0];
	if (!current) throw hotel("stay_inactive");
	if (current.nightly_rate_toman == null) throw hotel("rate_required");
	const nights = eachNight(current.check_out, requestedCheckOut);
	if (!nights.length) throw hotel("invalid_dates");
	const conflicts = await sql.query(`select night::text as night from room_nights
      where room_id = $1 and night = any(string_to_array($2, ',')::date[]) and reservation_id <> $3`, [
		current.room_id,
		nights.join(","),
		current.reservation_id
	]);
	const decision = extensionDecision({
		currentCheckOut: current.check_out,
		requestedCheckOut,
		conflictingNights: conflicts.map((c) => c.night)
	});
	const auto = await setting(sql, "extension_auto_approve") === "true";
	const call = extendStaySql({
		stayId: current.id,
		actorId: userId,
		requestedCheckOut,
		nights: decision.ok ? decision.nights : nights,
		nightlyRate: current.nightly_rate_toman,
		auto: auto && decision.ok
	});
	const rows = await sql.query(call.text, call.values);
	if (!rows[0]) throw hotel("stay_inactive");
	log("extension.request", {
		userId,
		status: rows[0].status,
		id: rows[0].id
	});
	return rows[0];
}
export async function requestCheckout(userId) {
	if (!(await (await db()).query(`
      with stay as (
        update stays
           set status = 'CHECKOUT_PENDING'
         where user_id = $1 and status = 'ACTIVE'
        returning id, room_id
      ),
      room as (
        update rooms rm
           set status = 'CHECKOUT_PENDING'
          from stay
         where rm.id = stay.room_id and rm.status = 'OCCUPIED'
        returning rm.id
      ),
      hist as (
        insert into room_status_history (room_id, from_status, to_status, actor_user_id, reason)
        select stay.room_id, 'OCCUPIED', 'CHECKOUT_PENDING', $1, 'guest checkout request'
          from stay
         where exists (select 1 from room)
        returning id
      ),
      note as (
        insert into notifications (recipient_role, type, title_en, title_fa, body_en, body_fa, entity_type, entity_id)
        select 'RECEPTION', 'HOTEL_ANNOUNCEMENT', 'Checkout requested', 'درخواست خروج',
               'A guest asked to check out', 'مهمان درخواست خروج ثبت کرد', 'stay', stay.id::text
          from stay
        returning id
      )
      select id, room_id from stay
    `, [userId]))[0]) throw hotel("bad_transition");
	return { ok: true };
}
export async function cancelCheckoutRequest(userId) {
	if (!(await (await db()).query(`
      with stay as (
        update stays
           set status = 'ACTIVE'
         where user_id = $1 and status = 'CHECKOUT_PENDING'
        returning id, room_id
      ),
      room as (
        update rooms rm
           set status = 'OCCUPIED'
          from stay
         where rm.id = stay.room_id and rm.status = 'CHECKOUT_PENDING'
        returning rm.id
      ),
      hist as (
        insert into room_status_history (room_id, from_status, to_status, actor_user_id, reason)
        select stay.room_id, 'CHECKOUT_PENDING', 'OCCUPIED', $1, 'guest withdrew checkout request'
          from stay
         where exists (select 1 from room)
        returning id
      ),
      note as (
        insert into notifications (recipient_role, type, title_en, title_fa, body_en, body_fa, entity_type, entity_id)
        select 'RECEPTION', 'HOTEL_ANNOUNCEMENT', 'Checkout request withdrawn', 'درخواست خروج پس گرفته شد',
               'The guest is staying on', 'مهمان به اقامت ادامه می‌دهد', 'stay', stay.id::text
          from stay
        returning id
      )
      select id, room_id from stay
    `, [userId]))[0]) throw hotel("bad_transition");
	return { ok: true };
}
export async function myNotifications(userId) {
	const sql = await db();
	const actor = await actorOf(sql, userId);
	return await sql.query(`
      select n.id, n.type, n.title_en, n.title_fa, n.body_en, n.body_fa, n.entity_type, n.entity_id, n.created_at,
             exists (
               select 1 from notification_receipts r
                where r.notification_id = n.id and r.user_id = $1
             ) as read
        from notifications n
       where n.recipient_user_id = $1
          or n.recipient_role = any($2::text[])
       order by n.id desc
       limit 40
    `, [userId, actor.roles]);
}
export async function markNotificationsRead(userId, ids) {
	const clean = ids.filter((id) => Number.isInteger(id) && id > 0).slice(0, 40);
	if (!clean.length) return { ok: true };
	await (await db()).query(`
      insert into notification_receipts (notification_id, user_id)
      select n.id, $1
        from notifications n
       where n.id = any($2::int[])
         and (
           n.recipient_user_id = $1
           or n.recipient_role in (select role_code from user_roles where user_id = $1)
         )
      on conflict do nothing
    `, [userId, clean]);
	return { ok: true };
}
export async function roomCard(code, userId) {
	const sql = await db();
	const room = (await sql`
    select rm.id, rm.number, rm.floor, rm.qr_code, rt.name_en, rt.name_fa
      from rooms rm
      join room_types rt on rt.code = rm.room_type_code
     where rm.qr_code = ${code}
  `)[0];
	if (!room) throw hotel("not_found");
	let matchesStay = false;
	if (userId) {
		const stay = await sql`
      select id from stays
       where user_id = ${userId} and room_id = ${room.id} and status in ('ACTIVE','CHECKOUT_PENDING')
    `;
		matchesStay = Boolean(stay[0]);
	}
	return {
		room,
		matchesStay
	};
}
export async function qrSvg(code, origin) {
	const rooms = await (await db())`
    select qr_code, number from rooms where qr_code = ${code}
  `;
	if (!rooms[0]) throw hotel("not_found");
	const svg = await (await import("qrcode")).default.toString(`${origin}/room/${rooms[0].qr_code}`, {
		type: "svg",
		margin: 1,
		color: {
			dark: "#1c1915",
			light: "#fbf8f3"
		}
	});
	const trimmed = String(svg).trim();
	if (!trimmed.startsWith("<svg") || /<script|on\w+\s*=/i.test(trimmed)) throw hotel("validation");
	return {
		svg: trimmed,
		number: rooms[0].number,
		code: rooms[0].qr_code
	};
}
async function staff(userId, permission) {
	const sql = await db();
	const actor = await actorOf(sql, userId);
	need(actor, permission);
	return {
		sql,
		actor
	};
}
export async function opsSnapshot(userId) {
	const { sql, actor } = await staff(userId, "room.read");
	const today = tehranToday();
	const scope = departmentScope(actor.roles);
	return {
		today,
		scope,
		metrics: (await sql.query(`
      select
        (select count(*)::int from rooms) as rooms,
        (select count(*)::int from rooms where status = 'OCCUPIED') as occupied,
        (select count(*)::int from rooms where status = 'AVAILABLE') as available,
        (select count(*)::int from rooms where status = 'CLEANING') as cleaning,
        (select count(*)::int from reservations where status = 'CONFIRMED' and check_in = $1::date) as arrivals,
        (select count(*)::int from reservations where status = 'CHECKED_IN' and check_out = $1::date) as departures,
        (select count(*)::int from orders where status in ('PENDING','ACCEPTED','PREPARING','READY','DELIVERING')
            and ($2::text is null or department_code = $2)) as open_orders,
        (select count(*)::int from maintenance_tickets where status not in ('RESOLVED','CANCELLED')) as open_maint,
        (select count(*)::int from orders where department_code = 'LAUNDRY' and status not in ('COMPLETED','CANCELLED','REJECTED')) as laundry,
        (select avg(extract(epoch from (accepted_at - created_at)))::int from orders where accepted_at is not null) as response_seconds,
        (select coalesce(sum(amount_toman),0)::bigint from payments
          where status = 'RECORDED' and timezone('Asia/Tehran', created_at)::date = $1::date) as collected_today,
        (select coalesce(sum(b.balance),0)::bigint from (
            select
              coalesce((select sum(amount_toman) from folio_items fi where fi.folio_id = f.id and not fi.voided),0)
              - coalesce((select sum(amount_toman) from payments p where p.folio_id = f.id and p.status = 'RECORDED'),0)
              as balance
              from folios f where f.status = 'OPEN'
         ) b) as outstanding
    `, [today, scope === "NONE" ? "__none__" : scope]))[0]
	};
}
export async function staffReservations(userId) {
	const { sql } = await staff(userId, "reservation.read");
	await expire(sql, true);
	return sql`
    select r.id, r.code, r.status, r.check_in, r.check_out, r.adults, r.children,
           r.nightly_rate_toman, r.guest_name, r.guest_phone, r.created_at,
           rm.number as room_number, rt.name_en, rt.name_fa, rt.code as type_code
      from reservations r
      left join rooms rm on rm.id = r.room_id
      join room_types rt on rt.code = r.room_type_code
     order by r.check_in, r.id
     limit 100
  `;
}
export async function staffConfirm(userId, reservationId, nightlyRate) {
	const { sql } = await staff(userId, "reservation.update");
	if (!Number.isInteger(nightlyRate) || nightlyRate < 0 || nightlyRate > 5e8) throw hotel("validation");
	const call = confirmReservationSql({
		reservationId,
		actorId: userId,
		nightlyRate
	});
	const rows = await sql.query(call.text, call.values);
	if (!rows[0]) throw hotel("bad_transition");
	await sql`
    insert into notifications (recipient_user_id, type, title_en, title_fa, body_en, body_fa, entity_type, entity_id)
    values (
      ${rows[0].user_id}, 'HOTEL_ANNOUNCEMENT',
      ${"Reservation confirmed " + rows[0].code},
      ${"رزرو تأیید شد " + rows[0].code},
      'Reception confirmed the nightly rate.',
      'پذیرش نرخ شبانه را تأیید کرد.',
      'reservation', ${String(rows[0].id)}
    )
  `;
	log("reservation.confirm", {
		userId,
		id: reservationId
	});
	return { ok: true };
}
export async function staffCheckIn(userId, reservationId) {
	const { sql } = await staff(userId, "reservation.checkin");
	const call = checkInSql({
		reservationId,
		actorId: userId,
		today: tehranToday()
	});
	const rows = await sql.query(call.text, call.values);
	if (!rows[0]) throw hotel("bad_transition");
	log("stay.check_in", {
		userId,
		stay: rows[0].stay_id
	});
	return rows[0];
}
export async function staffCheckOut(userId, stayId) {
	const sql = await db();
	const actor = await actorOf(sql, userId);
	need(actor, "reservation.checkout");
	const balance = (await sql`
    select
      (coalesce((select sum(fi.amount_toman) from folio_items fi where fi.folio_id = f.id and not fi.voided),0)
      - coalesce((select sum(p.amount_toman) from payments p where p.folio_id = f.id and p.status = 'RECORDED'),0))::bigint
      as balance,
      s.status
      from stays s
      join folios f on f.stay_id = s.id
     where s.id = ${stayId}
  `)[0]?.balance ?? 0;
	const allow = balance > 0 && hasPermission(actor.perms, "reservation.checkout_override");
	if (balance > 0 && !allow) throw hotel("balance_due");
	const call = checkOutSql({
		stayId,
		actorId: userId,
		allowBalance: allow
	});
	const rows = await sql.query(call.text, call.values);
	if (!rows[0]) throw hotel("bad_transition");
	log("stay.check_out", {
		userId,
		stay: stayId
	});
	return rows[0];
}
export async function staffNoShow(userId, reservationId) {
	const { sql } = await staff(userId, "reservation.cancel");
	const call = releaseReservationSql({
		reservationId,
		actorId: userId,
		nextStatus: "NO_SHOW",
		ownerOnly: false
	});
	if (!(await sql.query(call.text, call.values))[0]) throw hotel("bad_transition");
	return { ok: true };
}
export async function staffCancel(userId, reservationId) {
	const { sql } = await staff(userId, "reservation.cancel");
	const call = releaseReservationSql({
		reservationId,
		actorId: userId,
		nextStatus: "CANCELLED",
		ownerOnly: false
	});
	if (!(await sql.query(call.text, call.values))[0]) throw hotel("bad_transition");
	return { ok: true };
}
export async function staffRooms(userId) {
	const { sql } = await staff(userId, "room.read");
	return sql`
    select rm.id, rm.number, rm.floor, rm.status, rm.capacity, rm.qr_code, rm.type_assignment,
           rm.description_en, rm.description_fa, rt.code as type_code, rt.name_en, rt.name_fa,
           s.id as stay_id, s.status as stay_status, r.guest_name, r.check_out
      from rooms rm
      join room_types rt on rt.code = rm.room_type_code
      left join stays s on s.room_id = rm.id and s.status in ('ACTIVE','CHECKOUT_PENDING')
      left join reservations r on r.id = s.reservation_id
     order by rm.number
  `;
}
export async function staffUpdateRoom(userId, input) {
	const sql = await db();
	const actor = await actorOf(sql, userId);
	const room = (await sql`select id, status from rooms where id = ${input.roomId}`)[0];
	if (!room) throw hotel("not_found");
	if (input.status && input.status !== room.status) {
		need(actor, input.status === "BLOCKED" || room.status === "BLOCKED" ? "room.block" : input.status === "MAINTENANCE" || input.status === "OUT_OF_SERVICE" ? "room.maintenance" : "room.update");
		const active = await sql`
      select id from stays where room_id = ${input.roomId} and status in ('ACTIVE','CHECKOUT_PENDING')
    `;
		if (!canTransitionRoom(room.status, input.status, Boolean(active[0]))) throw hotel("bad_transition");
		await sql`
      update rooms set status = ${input.status} where id = ${input.roomId}
    `;
		await sql`
      insert into room_status_history (room_id, from_status, to_status, actor_user_id, reason)
      values (${input.roomId}, ${room.status}, ${input.status}, ${userId}, 'staff update')
    `;
	} else need(actor, "room.update");
	if (input.roomType) {
		need(actor, "room.update");
		await sql`update rooms set room_type_code = ${input.roomType}, type_assignment = 'staff_verified' where id = ${input.roomId}`;
	}
	if (input.capacity) {
		need(actor, "room.update");
		if (input.capacity < 1 || input.capacity > 8) throw hotel("validation");
		await sql`update rooms set capacity = ${input.capacity} where id = ${input.roomId}`;
	}
	if (input.descriptionEn != null || input.descriptionFa != null) {
		need(actor, "content.update");
		await sql`
      update rooms
         set description_en = coalesce(${input.descriptionEn ?? null}, description_en),
             description_fa = coalesce(${input.descriptionFa ?? null}, description_fa)
       where id = ${input.roomId}
    `;
	}
	await sql`
    insert into audit_logs (actor_user_id, action, entity_type, entity_id, new_value)
    values (${userId}, 'room.update', 'room', ${String(input.roomId)}, ${JSON.stringify(input)}::jsonb)
  `;
	return { ok: true };
}
export async function staffOrders(userId) {
	const { sql, actor } = await staff(userId, "order.queue");
	const scope = departmentScope(actor.roles);
	if (scope === "NONE") throw hotel("forbidden");
	return sql.query(`
      select o.id, o.code, o.status, o.department_code, o.priority, o.notes, o.created_at,
             o.service_date, o.service_time, o.guest_count,
             rm.number as room_number, r.guest_name,
             oi.id as item_id, oi.name_en, oi.name_fa, oi.quantity, oi.unit_price_toman, oi.complimentary,
             pr.plate, pr.vehicle_type, pr.status as parking_status, pr.slot_label,
             mt.issue_code, mt.status as ticket_status
        from orders o
        join rooms rm on rm.id = o.room_id
        join reservations r on r.id = (select reservation_id from stays s where s.id = o.stay_id)
        join order_items oi on oi.order_id = o.id
        left join parking_requests pr on pr.order_id = o.id
        left join maintenance_tickets mt on mt.order_id = o.id
       where ($1::text is null or o.department_code = $1)
       order by o.id desc
       limit 80
    `, [scope]);
}
export async function staffTransition(userId, orderId, to) {
	const sql = await db();
	const actor = await actorOf(sql, userId);
	need(actor, to === "ACCEPTED" ? "order.accept" : to === "REJECTED" ? "order.reject" : to === "PREPARING" || to === "READY" ? "order.prepare" : to === "DELIVERING" || to === "DELIVERED" ? "order.deliver" : to === "COMPLETED" ? "order.complete" : to === "CANCELLED" ? "order.reject" : "order.queue");
	const order = (await sql`
    select status, department_code from orders where id = ${orderId}
  `)[0];
	if (!order) throw hotel("not_found");
	const scope = departmentScope(actor.roles);
	if (scope === "NONE") throw hotel("forbidden");
	if (scope && scope !== order.department_code) throw hotel("forbidden");
	if (!canTransitionOrder(order.status, to)) throw hotel("bad_transition");
	if (to === "DELIVERED") {
		const items = await sql`
      select unit_price_toman, complimentary, quantity from order_items where order_id = ${orderId}
    `;
		if (!orderIsPriced(items.map((item) => ({
			unitPrice: item.unit_price_toman,
			complimentary: item.complimentary,
			quantity: item.quantity
		})))) throw hotel("unpriced");
	}
	const call = transitionOrderSql({
		orderId,
		actorId: userId,
		from: order.status,
		to,
		department: scope
	});
	let rows;
	try {
		rows = await sql.query(call.text, call.values);
	} catch (err) {
		console.error("order.transition.fail", err);
		throw err;
	}
	if (!rows[0]) throw hotel("bad_transition");
	if (to === "DELIVERED" || to === "COMPLETED" || to === "CANCELLED" || to === "REJECTED") {
		await sql`
      update maintenance_tickets
         set status = case when ${to} in ('CANCELLED','REJECTED') then 'CANCELLED' else 'RESOLVED' end,
             resolved_at = case when ${to} in ('DELIVERED','COMPLETED') then now() else resolved_at end
       where order_id = ${orderId}
    `;
		await sql`
      update parking_requests
         set status = case
           when ${to} = 'ACCEPTED' then 'ACCEPTED'
           when ${to} = 'DELIVERED' then 'PARKED'
           when ${to} = 'COMPLETED' then 'CLOSED'
           when ${to} in ('CANCELLED','REJECTED') then 'CANCELLED'
           else status end
       where order_id = ${orderId}
    `;
	}
	log("order.transition", {
		userId,
		id: orderId,
		to
	});
	return { ok: true };
}
export async function staffSetPrice(userId, itemId, price) {
	const { sql, actor } = await staff(userId, "order.price");
	if (!Number.isInteger(price) || price < 0 || price > 5e8) throw hotel("validation");
	const scope = departmentScope(actor.roles);
	if (!(await sql.query(`
      update order_items oi
         set unit_price_toman = $2
        from orders o
       where oi.id = $1
         and oi.order_id = o.id
         and o.status in ('PENDING','ACCEPTED','PREPARING','READY','DELIVERING')
         and ($3::text is null or o.department_code = $3)
      returning oi.id
    `, [
		itemId,
		price,
		scope
	]))[0]) throw hotel("bad_transition");
	await sql`
    insert into audit_logs (actor_user_id, action, entity_type, entity_id, new_value)
    values (${userId}, 'order.price', 'order_item', ${String(itemId)}, ${JSON.stringify({ price })}::jsonb)
  `;
	return { ok: true };
}
export async function staffPayment(userId, input) {
	const { sql } = await staff(userId, "payment.record");
	if (!Number.isInteger(input.amount) || input.amount < 1) throw hotel("validation");
	const status = input.method === "GATEWAY" ? "PENDING_GATEWAY" : "RECORDED";
	const rows = await sql`
    insert into payments (folio_id, amount_toman, method, status, reference, recorded_by, note)
    select ${input.folioId}, ${input.amount}, ${input.method}, ${status}, ${input.reference?.slice(0, 80) ?? null}, ${userId},
           case when ${input.method} = 'GATEWAY' then 'Awaiting external payment gateway. Not collected.' else null end
     where exists (select 1 from folios where id = ${input.folioId})
    returning id, status
  `;
	if (!rows[0]) throw hotel("not_found");
	if (status === "RECORDED") {
		const folio = await sql`select user_id from folios where id = ${input.folioId}`;
		if (folio[0]) await sql`
        insert into notifications (recipient_user_id, type, title_en, title_fa, body_en, body_fa, entity_type, entity_id)
        values (
          ${folio[0].user_id}, 'PAYMENT_RECEIVED',
          'Payment recorded', 'پرداخت ثبت شد',
          'A payment was posted to your folio.', 'یک پرداخت در صورتحساب شما ثبت شد.',
          'folio', ${String(input.folioId)}
        )
      `;
	}
	await sql`
    insert into audit_logs (actor_user_id, action, entity_type, entity_id, new_value)
    values (${userId}, 'payment.record', 'folio', ${String(input.folioId)}, ${JSON.stringify({
		amount: input.amount,
		method: input.method,
		status
	})}::jsonb)
  `;
	log("payment.record", {
		userId,
		folio: input.folioId,
		status
	});
	return rows[0];
}
export async function staffFolio(userId, stayId) {
	const { sql } = await staff(userId, "billing.read");
	const folio = await sql`
    select id, user_id from folios where stay_id = ${stayId}
  `;
	if (!folio[0]) throw hotel("not_found");
	const items = await sql`select * from folio_items where folio_id = ${folio[0].id} order by id`;
	const payments = await sql`select * from payments where folio_id = ${folio[0].id} order by id`;
	return {
		folio: folio[0],
		items,
		payments
	};
}
export async function staffAdjust(userId, input) {
	const { sql } = await staff(userId, "billing.create");
	if (!Number.isInteger(input.amount) || input.amount === 0) throw hotel("validation");
	const source = `adj-${refCode("A")}`;
	if (!(await sql`
    insert into folio_items (folio_id, source_type, source_id, description_en, description_fa, amount_toman, quantity)
    select ${input.folioId}, 'ADJUSTMENT', ${source}, ${input.descriptionEn.slice(0, 160)}, ${input.descriptionFa.slice(0, 160)}, ${input.amount}, 1
     where exists (select 1 from folios where id = ${input.folioId})
    returning id
  `)[0]) throw hotel("not_found");
	return { ok: true };
}
export async function staffHousekeeping(userId) {
	const { sql } = await staff(userId, "housekeeping.update");
	return sql`
    select t.id, t.kind, t.priority, t.status, t.notes, t.created_at, rm.number as room_number, rm.status as room_status,
           r.guest_name, r.check_out
      from housekeeping_tasks t
      join rooms rm on rm.id = t.room_id
      left join stays s on s.id = t.stay_id
      left join reservations r on r.id = s.reservation_id
     where t.status <> 'CANCELLED'
     order by case t.priority when 'HIGH' then 0 else 1 end, t.id desc
     limit 80
  `;
}
export async function staffHousekeepingUpdate(userId, taskId, status) {
	const { sql } = await staff(userId, "housekeeping.update");
	if (!(await sql.query(`
      with upd as (
        update housekeeping_tasks
           set status = $2,
               assigned_user_id = case when $2 = 'ASSIGNED' then $3 else assigned_user_id end,
               completed_at = case when $2 = 'DONE' then now() else completed_at end
         where id = $1 and status <> 'DONE'
        returning id, room_id
      ),
      room as (
        update rooms rm
           set status = 'AVAILABLE'
          from upd
         where $2 = 'DONE'
           and rm.id = upd.room_id
           and rm.status = 'CLEANING'
           and not exists (
             select 1 from stays s
              where s.room_id = rm.id and s.status in ('ACTIVE','CHECKOUT_PENDING')
           )
        returning rm.id
      )
      select id from upd
    `, [
		taskId,
		status,
		userId
	]))[0]) throw hotel("bad_transition");
	return { ok: true };
}
export async function staffExtensions(userId) {
	const { sql } = await staff(userId, "extension.decide");
	return sql`
    select e.id, e.status, e.requested_check_out, e.quoted_amount_toman, e.created_at,
           r.code, r.check_out, rm.number as room_number, r.guest_name, e.stay_id
      from extension_requests e
      join reservations r on r.id = e.reservation_id
      join rooms rm on rm.id = r.room_id
     order by e.id desc
     limit 40
  `;
}
export async function staffDecideExtension(userId, requestId, approve) {
	const { sql } = await staff(userId, "extension.decide");
	const rows = await sql.query(`
      with req as (
        select e.*, r.room_id, r.check_out, r.nightly_rate_toman, r.user_id, s.status as stay_status
          from extension_requests e
          join reservations r on r.id = e.reservation_id
          join stays s on s.id = e.stay_id
         where e.id = $1 and e.status = 'PENDING'
         for update
      ),
      conflict as (
        select 1
          from room_nights n, req
         where n.room_id = req.room_id
           and n.reservation_id <> req.reservation_id
           and n.night >= req.check_out
           and n.night < req.requested_check_out
      ),
      approved as (
        update extension_requests e
           set status = 'APPROVED', decided_by = $2
          from req
         where e.id = req.id
           and $3::boolean = true
           and not exists (select 1 from conflict)
           and req.nightly_rate_toman is not null
           and req.stay_status = 'ACTIVE'
           and req.requested_check_out > req.check_out
        returning e.id, e.reservation_id, e.stay_id, e.requested_check_out, e.quoted_amount_toman
      ),
      res as (
        update reservations r
           set check_out = approved.requested_check_out, updated_at = now()
          from approved
         where r.id = approved.reservation_id
        returning r.room_id, r.id, r.check_out as old_out
      ),
      nights as (
        insert into room_nights (room_id, night, reservation_id)
        select req.room_id, d::date, req.reservation_id
          from req
          join approved on approved.id = req.id
          cross join generate_series(req.check_out, (approved.requested_check_out - interval '1 day')::date, interval '1 day') as d
        returning night
      ),
      charge as (
        insert into folio_items (folio_id, source_type, source_id, description_en, description_fa, amount_toman, quantity)
        select f.id, 'ROOM', 'ext-' || approved.id::text,
               'Stay extension to ' || approved.requested_check_out::text,
               'تمدید اقامت تا ' || approved.requested_check_out::text,
               coalesce(approved.quoted_amount_toman, 0),
               (select count(*) from nights)
          from approved
          join folios f on f.stay_id = approved.stay_id
         where exists (select 1 from nights)
        on conflict (source_type, source_id) do nothing
        returning id
      ),
      rejected as (
        update extension_requests e
           set status = 'REJECTED', decided_by = $2, reason = 'unavailable or declined'
          from req
         where e.id = req.id
           and not exists (select 1 from approved)
        returning e.id
      )
      select
        coalesce((select id from approved), (select id from rejected)) as id,
        case when exists (select 1 from approved) then 'APPROVED' else 'REJECTED' end as status
    `, [
		requestId,
		userId,
		approve
	]);
	if (!rows[0]) throw hotel("bad_transition");
	return rows[0];
}
export async function staffParking(userId) {
	const { sql } = await staff(userId, "parking.update");
	return sql`
    select pr.id, pr.plate, pr.vehicle_type, pr.status, pr.slot_label, pr.created_at,
           rm.number as room_number, o.code
      from parking_requests pr
      join rooms rm on rm.id = pr.room_id
      left join orders o on o.id = pr.order_id
     order by pr.id desc
     limit 40
  `;
}
export async function staffParkingUpdate(userId, id, slot, status) {
	const { sql } = await staff(userId, "parking.update");
	if (![
		"REQUESTED",
		"ACCEPTED",
		"PARKED",
		"CLOSED",
		"CANCELLED"
	].includes(status)) throw hotel("validation");
	if (!(await sql`
    update parking_requests
       set slot_label = ${slot.trim().slice(0, 40) || null}, status = ${status}
     where id = ${id}
    returning id
  `)[0]) throw hotel("not_found");
	return { ok: true };
}
export async function staffMaintenance(userId) {
	const { sql } = await staff(userId, "maintenance.update");
	return sql`
    select mt.id, mt.issue_code, mt.description, mt.priority, mt.status, mt.created_at,
           rm.number as room_number, o.code
      from maintenance_tickets mt
      join rooms rm on rm.id = mt.room_id
      left join orders o on o.id = mt.order_id
     order by mt.id desc
     limit 40
  `;
}
export async function staffDirectory(userId) {
	const { sql } = await staff(userId, "staff.assign");
	return sql`
    select u.id, u.name, u.email,
           u."emailVerified" as email_verified,
           u."createdAt" as created_at,
           coalesce(string_agg(ur.role_code, ',' order by ur.role_code), '') as roles
      from "user" u
      left join user_roles ur on ur.user_id = u.id
     group by u.id, u.name, u.email, u."emailVerified", u."createdAt"
     order by u.email
     limit 100
  `;
}
export async function staffAssignRole(userId, targetUserId, role, grant) {
	const { sql, actor } = await staff(userId, "staff.assign");
	if (![
		"HOTEL_ADMIN",
		"RECEPTION",
		"HOUSEKEEPING",
		"LAUNDRY",
		"KITCHEN",
		"COFFEE_SHOP",
		"PARKING",
		"MAINTENANCE",
		"ACCOUNTING",
		"GUEST",
		"SUPER_ADMIN"
	].includes(role)) throw hotel("validation");
	if (role === "SUPER_ADMIN" && !actor.roles.includes("SUPER_ADMIN")) throw hotel("forbidden");
	// Looked up by id (chosen from staffDirectory), not by e-mail: e-mails are
	// self-declared and unverified at sign-up.
	const users = await sql`select id from "user" where id = ${String(targetUserId).trim()}`;
	if (!users[0]) throw hotel("not_found");
	if (!grant && (role === "HOTEL_ADMIN" || role === "SUPER_ADMIN")) {
		// Never remove the last administrator: with none left, nobody could
		// grant roles again and the hotel would be locked out of /ops.
		const others = await sql`
      select count(*)::int as n from user_roles
       where role_code in ('HOTEL_ADMIN','SUPER_ADMIN')
         and not (user_id = ${users[0].id} and role_code = ${role})
    `;
		if ((others[0]?.n ?? 0) === 0) throw hotel("last_admin");
	}
	if (grant) await sql`
      insert into user_roles (user_id, role_code) values (${users[0].id}, ${role})
      on conflict do nothing
    `;
	else await sql`delete from user_roles where user_id = ${users[0].id} and role_code = ${role}`;
	await sql`
    insert into audit_logs (actor_user_id, action, entity_type, entity_id, new_value)
    values (${userId}, 'staff.role', 'user', ${users[0].id}, ${JSON.stringify({
		role,
		grant
	})}::jsonb)
  `;
	return { ok: true };
}
export async function staffAudit(userId) {
	const { sql } = await staff(userId, "audit.read");
	return sql`
    select id, actor_user_id, action, entity_type, entity_id, created_at
      from audit_logs
     order by id desc
     limit 80
  `;
}
export async function staffUpdateSetting(userId, key, value) {
	const { sql } = await staff(userId, "settings.update");
	if (![
		"check_in_time",
		"check_out_time",
		"tax_bps",
		"pending_hold_minutes",
		"extension_auto_approve",
		"breakfast_hours",
		"coffee_hours",
		"announcement_en",
		"announcement_fa",
		"address_en",
		"address_fa",
		"geo_lat",
		"geo_lng"
	].includes(key)) throw hotel("validation");
	if (key === "tax_bps" || key === "pending_hold_minutes") {
		if (!/^\d{1,5}$/.test(value)) throw hotel("validation");
	}
	if (key === "geo_lat" || key === "geo_lng") {
		if (!/^-?\d{1,3}(\.\d{1,8})?$/.test(value)) throw hotel("validation");
		const n = Number(value);
		if (key === "geo_lat" && (n < -90 || n > 90)) throw hotel("validation");
		if (key === "geo_lng" && (n < -180 || n > 180)) throw hotel("validation");
	}
	if (key === "extension_auto_approve" && value !== "true" && value !== "false") throw hotel("validation");
	await sql`
    update hotel_settings
       set value = ${value.slice(0, 500)}, verification_status = 'staff_configured'
     where key = ${key}
  `;
	await sql`
    insert into audit_logs (actor_user_id, action, entity_type, entity_id, new_value)
    values (${userId}, 'settings.update', 'setting', ${key}, ${JSON.stringify({ value: value.slice(0, 500) })}::jsonb)
  `;
	return { ok: true };
}
export async function staffUpdateService(userId, input) {
	const { sql } = await staff(userId, "content.update");
	if (input.price != null && (!Number.isInteger(input.price) || input.price < 0)) throw hotel("validation");
	await sql`
    update services
       set price_toman = ${input.price},
           complimentary = coalesce(${input.complimentary ?? null}, complimentary),
           active = coalesce(${input.active ?? null}, active),
           verification_status = 'staff_configured'
     where id = ${input.id}
  `;
	return { ok: true };
}
export async function staffSetMedia(userId, id, url) {
	const { sql } = await staff(userId, "content.update");
	const trimmed = url.trim();
	if (trimmed && !/^https:\/\/[^\s]+$/i.test(trimmed)) throw hotel("validation");
	await sql`
    update hotel_media
       set url = ${trimmed || null},
           verification_status = ${trimmed ? "hotel_provided" : "missing_license_not_copied"},
           source = ${trimmed ? "hotel_staff" : null}
     where id = ${id}
  `;
	return { ok: true };
}
export async function staffAnnounce(userId, en, fa) {
	const { sql } = await staff(userId, "announcement.create");
	await sql`update hotel_settings set value = ${en.slice(0, 400)} where key = 'announcement_en'`;
	await sql`update hotel_settings set value = ${fa.slice(0, 400)} where key = 'announcement_fa'`;
	await sql`
    insert into notifications (recipient_user_id, type, title_en, title_fa, body_en, body_fa, entity_type)
    select distinct s.user_id, 'HOTEL_ANNOUNCEMENT', 'Hotel announcement', 'اطلاعیه هتل',
           ${en.slice(0, 400)}, ${fa.slice(0, 400)}, 'announcement'
      from stays s
     where s.status in ('ACTIVE','CHECKOUT_PENDING')
       and ${en.trim()} <> ''
  `;
	return { ok: true };
}
export async function liveRoles(userId) {
	const sql = await db();
	return (await actorOf(sql, userId)).roles;
}
export async function liveSince(userId, afterId, roles) {
	const sql = await db();
	// Roles are resolved once per stream by /api/live; fall back to a lookup.
	const actor = roles ? { roles } : await actorOf(sql, userId);
	return sql.query(`
      select n.id, n.type, n.title_en, n.title_fa, n.body_en, n.body_fa, n.created_at
        from notifications n
       where n.id > $2
         and (n.recipient_user_id = $1 or n.recipient_role = any($3::text[]))
       order by n.id
       limit 20
    `, [
		userId,
		afterId,
		actor.roles
	]);
}
export async function health() {
	return {
		ok: (await (await db())`select 1 as ok`)[0]?.ok === 1,
		time: (/* @__PURE__ */ new Date()).toISOString(),
		timezone: "Asia/Tehran"
	};
}
