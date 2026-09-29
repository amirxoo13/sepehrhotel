/** SQL used by the server and by database tests. One statement = one transaction. */

export type SqlCall = { text: string; values: unknown[] };

export function expirePendingSql(holdMinutes: number): SqlCall {
  return {
    text: `
      with old as (
        update reservations
           set status = 'EXPIRED', updated_at = now()
         where status = 'PENDING'
           and created_at < now() - make_interval(mins => $1::int)
        returning id, room_id
      ),
      freed as (
        delete from room_nights n
         using old
         where n.reservation_id = old.id
        returning n.room_id
      ),
      rooms_back as (
        update rooms r
           set status = 'AVAILABLE'
          from old
         where r.id = old.room_id
           and r.status = 'RESERVED'
           and not exists (
             select 1 from room_nights rn
              where rn.room_id = r.id
           )
        returning r.id
      )
      select
        (select count(*)::int from old) as expired,
        (select count(*)::int from freed) as nights
    `,
    values: [holdMinutes],
  };
}

export function bookRoomSql(input: {
  roomType: string;
  userId: string;
  code: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  guestName: string;
  guestPhone: string | null;
  notes: string | null;
  idempotencyKey: string;
  nights: string[];
  today: string;
  nightlyRate: number | null;
  status: "PENDING" | "CONFIRMED";
}): SqlCall {
  const nightList = input.nights.join(",");
  return {
    text: `
      with candidate as (
        select r.id, r.room_type_code, r.number
          from rooms r
         where r.room_type_code = $1
           and r.status not in ('OUT_OF_SERVICE', 'BLOCKED', 'MAINTENANCE')
           and r.capacity >= $2
           and not exists (
             select 1 from room_nights n
              where n.room_id = r.id
                and n.night = any (string_to_array($3, ',')::date[])
           )
         order by r.number
         limit 1
         for update skip locked
      ),
      ins as (
        insert into reservations (
          code, user_id, room_id, room_type_code, check_in, check_out,
          adults, children, status, nightly_rate_toman, guest_name, guest_phone,
          notes, idempotency_key
        )
        select
          $4, $5, c.id, c.room_type_code, $6::date, $7::date,
          $8, $9, $10, $11, $12, $13, $14, $15
          from candidate c
        returning id, code, room_id, status, nightly_rate_toman, check_in, check_out
      ),
      nights as (
        insert into room_nights (room_id, night, reservation_id)
        select ins.room_id, d::date, ins.id
          from ins
          cross join unnest(string_to_array($3, ',')::date[]) as d
        returning night
      ),
      marked as (
        update rooms r
           set status = case
             when $16::date <= $17::date and r.status = 'AVAILABLE' then 'RESERVED'
             else r.status
           end
          from ins
         where r.id = ins.room_id
        returning r.id, r.number, r.status
      ),
      audited as (
        insert into audit_logs (actor_user_id, action, entity_type, entity_id, new_value)
        select $5, 'reservation.create', 'reservation', ins.id::text,
               jsonb_build_object('code', ins.code, 'status', ins.status, 'nights', $3)
          from ins
        returning id
      )
      select ins.id, ins.code, ins.room_id, ins.status, ins.nightly_rate_toman,
             ins.check_in, ins.check_out,
             (select number from marked) as room_number,
             (select count(*)::int from nights) as night_count
        from ins
    `,
    values: [
      input.roomType,
      input.adults + input.children,
      nightList,
      input.code,
      input.userId,
      input.checkIn,
      input.checkOut,
      input.adults,
      input.children,
      input.status,
      input.nightlyRate,
      input.guestName,
      input.guestPhone,
      input.notes,
      input.idempotencyKey,
      input.checkIn,
      input.today,
    ],
  };
}

export function releaseReservationSql(input: {
  reservationId: number;
  actorId: string;
  nextStatus: "CANCELLED" | "NO_SHOW" | "EXPIRED";
  ownerOnly: boolean;
}): SqlCall {
  return {
    text: `
      with upd as (
        update reservations
           set status = $3, updated_at = now()
         where id = $1
           and status in ('PENDING', 'CONFIRMED')
           and ($4::boolean = false or user_id = $2)
        returning id, room_id, user_id, code
      ),
      freed as (
        delete from room_nights n
         using upd
         where n.reservation_id = upd.id
        returning n.night
      ),
      roomupd as (
        update rooms r
           set status = 'AVAILABLE'
          from upd
         where r.id = upd.room_id
           and r.status = 'RESERVED'
           and not exists (
             select 1 from room_nights rn where rn.room_id = r.id
           )
        returning r.id
      ),
      audited as (
        insert into audit_logs (actor_user_id, action, entity_type, entity_id, new_value)
        select $2, 'reservation.' || lower($3), 'reservation', upd.id::text,
               jsonb_build_object('code', upd.code)
          from upd
        returning id
      )
      select upd.id, upd.code, (select count(*)::int from freed) as released
        from upd
    `,
    values: [input.reservationId, input.actorId, input.nextStatus, input.ownerOnly],
  };
}

export function confirmReservationSql(input: {
  reservationId: number;
  actorId: string;
  nightlyRate: number;
}): SqlCall {
  return {
    text: `
      with upd as (
        update reservations
           set status = 'CONFIRMED',
               nightly_rate_toman = $3,
               updated_at = now()
         where id = $1
           and status = 'PENDING'
        returning id, code, user_id, room_id
      ),
      audited as (
        insert into audit_logs (actor_user_id, action, entity_type, entity_id, new_value)
        select $2, 'reservation.confirm', 'reservation', upd.id::text,
               jsonb_build_object('nightly_rate_toman', $3, 'code', upd.code)
          from upd
        returning id
      )
      select id, code, user_id, room_id from upd
    `,
    values: [input.reservationId, input.actorId, input.nightlyRate],
  };
}

export function checkInSql(input: { reservationId: number; actorId: string; today: string }): SqlCall {
  return {
    text: `
      with res as (
        select r.*
          from reservations r
          join rooms rm on rm.id = r.room_id
         where r.id = $1
           and r.status = 'CONFIRMED'
           and r.nightly_rate_toman is not null
           and r.check_in <= $3::date
           -- the room must be sellable and empty: no second in-house stay
           and rm.status not in ('MAINTENANCE', 'OUT_OF_SERVICE', 'BLOCKED')
           and not exists (
             select 1 from stays s
              where s.room_id = r.room_id
                and s.status in ('ACTIVE', 'CHECKOUT_PENDING')
           )
         for update of r
      ),
      stay_ins as (
        insert into stays (reservation_id, room_id, user_id, status, checked_in_at, checked_in_by)
        select res.id, res.room_id, res.user_id, 'ACTIVE', now(), $2
          from res
        returning id, reservation_id, room_id, user_id
      ),
      res_upd as (
        update reservations r
           set status = 'CHECKED_IN', updated_at = now()
          from stay_ins
         where r.id = stay_ins.reservation_id
        returning r.id, r.code, r.nightly_rate_toman, r.check_in, r.check_out, r.guest_name
      ),
      room_upd as (
        update rooms rm
           set status = 'OCCUPIED'
          from stay_ins
         where rm.id = stay_ins.room_id
        returning rm.number
      ),
      folio_ins as (
        insert into folios (stay_id, reservation_id, user_id, status)
        select s.id, s.reservation_id, s.user_id, 'OPEN' from stay_ins s
        returning id, stay_id
      ),
      nights as (
        select count(*)::int as n from room_nights rn join res on res.id = rn.reservation_id
      ),
      charge as (
        insert into folio_items (
          folio_id, source_type, source_id, description_en, description_fa, amount_toman, quantity
        )
        select
          f.id,
          'ROOM',
          res_upd.id::text,
          'Accommodation ' || res_upd.check_in::text || ' → ' || res_upd.check_out::text,
          'اقامت از ' || res_upd.check_in::text || ' تا ' || res_upd.check_out::text,
          res_upd.nightly_rate_toman * (select n from nights),
          (select n from nights)
          from folio_ins f, res_upd
        returning id, amount_toman
      ),
      audited as (
        insert into audit_logs (actor_user_id, action, entity_type, entity_id, new_value)
        select $2, 'stay.check_in', 'stay', stay_ins.id::text,
               jsonb_build_object('reservation', res_upd.code, 'room', (select number from room_upd))
          from stay_ins, res_upd
        returning id
      )
      select stay_ins.id as stay_id, res_upd.code, (select number from room_upd) as room_number,
             (select amount_toman from charge) as accommodation
        from stay_ins, res_upd
    `,
    values: [input.reservationId, input.actorId, input.today],
  };
}

export function checkOutSql(input: { stayId: number; actorId: string; allowBalance: boolean }): SqlCall {
  return {
    text: `
      with stay as (
        select s.*, r.code as reservation_code, r.id as res_id
          from stays s
          join reservations r on r.id = s.reservation_id
         where s.id = $1
           and s.status in ('ACTIVE', 'CHECKOUT_PENDING')
         for update
      ),
      bal as (
        select
          (coalesce((
            select sum(fi.amount_toman) from folio_items fi
              join folios f on f.id = fi.folio_id
             where f.stay_id = stay.id and fi.voided = false
          ), 0)
          -
          coalesce((
            select sum(p.amount_toman) from payments p
              join folios f on f.id = p.folio_id
             where f.stay_id = stay.id and p.status = 'RECORDED'
          ), 0))::bigint as balance
          from stay
      ),
      closed as (
        update stays s
           set status = 'CLOSED', checked_out_at = now(), checked_out_by = $2
          from stay, bal
         where s.id = stay.id
           and (bal.balance <= 0 or $3::boolean = true)
        returning s.id, s.room_id, s.reservation_id, s.user_id
      ),
      res as (
        update reservations r
           set status = 'CHECKED_OUT', updated_at = now()
          from closed
         where r.id = closed.reservation_id
        returning r.code
      ),
      room as (
        update rooms rm
           set status = 'CLEANING'
          from closed
         where rm.id = closed.room_id
        returning rm.number, rm.id
      ),
      task as (
        insert into housekeeping_tasks (room_id, stay_id, kind, priority, status, notes)
        select closed.room_id, closed.id, 'CHECKOUT_CLEAN', 'HIGH', 'OPEN', 'Checkout clean'
          from closed
        returning id
      ),
      folio as (
        update folios f
           set status = case when (select balance from bal) <= 0 then 'SETTLED' else 'OPEN' end
          from closed
         where f.stay_id = closed.id
        returning f.id
      ),
      audited as (
        insert into audit_logs (actor_user_id, action, entity_type, entity_id, new_value)
        select $2, 'stay.check_out', 'stay', closed.id::text,
               jsonb_build_object('balance', (select balance from bal), 'room', (select number from room))
          from closed
        returning id
      )
      select closed.id as stay_id, (select code from res) as code,
             (select number from room) as room_number,
             (select balance from bal) as balance,
             (select id from task) as task_id
        from closed
    `,
    values: [input.stayId, input.actorId, input.allowBalance],
  };
}

export function placeOrderSql(input: {
  code: string;
  stayId: number;
  userId: string;
  serviceId: number;
  quantity: number;
  notes: string | null;
  idempotencyKey: string;
  priority: string;
  serviceDate: string | null;
  serviceTime: string | null;
  guestCount: number | null;
  laundryLabel: string | null;
  plate: string | null;
  vehicleType: string | null;
  issueCode: string | null;
}): SqlCall {
  return {
    text: `
      with stay as (
        select s.id, s.room_id, s.user_id, s.status, rm.number as room_number
          from stays s
          join rooms rm on rm.id = s.room_id
         where s.id = $1
           and s.user_id = $2
           and s.status = 'ACTIVE'
         for update
      ),
      svc as (
        select sv.id, sv.price_toman, sv.complimentary, sv.name_en, sv.name_fa,
               sv.category_code, sc.department_code, sv.bill_on_status, sv.active
          from services sv
          join service_categories sc on sc.code = sv.category_code
         where sv.id = $3
           and sv.active = true
      ),
      ins as (
        insert into orders (
          code, stay_id, room_id, user_id, department_code, status, priority, notes,
          idempotency_key, service_date, service_time, guest_count
        )
        select
          $4, stay.id, stay.room_id, stay.user_id, svc.department_code, 'PENDING', $5, $6,
          $7, $8::date, $9, $10
          from stay, svc
        returning id, code, department_code, room_id, stay_id, user_id
      ),
      item as (
        insert into order_items (
          order_id, service_id, quantity, unit_price_toman, complimentary, name_en, name_fa
        )
        select ins.id, svc.id, $11, svc.price_toman, svc.complimentary, svc.name_en, svc.name_fa
          from ins, svc
        returning id
      ),
      hist as (
        insert into order_status_history (order_id, from_status, to_status, actor_user_id)
        select ins.id, null, 'PENDING', $2 from ins
        returning id
      ),
      laundry as (
        insert into laundry_details (order_id, item_label, quantity, service_kind)
        select ins.id, coalesce($12, 'Laundry'), $11, 'WASH'
          from ins, svc
         where svc.department_code = 'LAUNDRY'
        returning id
      ),
      park as (
        insert into parking_requests (order_id, stay_id, room_id, plate, vehicle_type, status)
        select ins.id, ins.stay_id, ins.room_id, $13, $14, 'REQUESTED'
          from ins, svc
         where svc.department_code = 'PARKING'
           and $13::text is not null
        returning id
      ),
      maint as (
        insert into maintenance_tickets (order_id, room_id, stay_id, issue_code, description, priority, status)
        select ins.id, ins.room_id, ins.stay_id, coalesce($15, 'OTHER'), $6, $5, 'OPEN'
          from ins, svc
         where svc.department_code = 'MAINTENANCE'
        returning id
      ),
      note as (
        insert into notifications (
          recipient_role, department_code, type, title_en, title_fa, body_en, body_fa,
          entity_type, entity_id
        )
        select
          case ins.department_code
            when 'HOUSEKEEPING' then 'HOUSEKEEPING'
            when 'LAUNDRY' then 'LAUNDRY'
            when 'KITCHEN' then 'KITCHEN'
            when 'COFFEE_SHOP' then 'COFFEE_SHOP'
            when 'PARKING' then 'PARKING'
            when 'MAINTENANCE' then 'MAINTENANCE'
            else 'RECEPTION'
          end,
          ins.department_code,
          'NEW_ORDER',
          'New order ' || ins.code,
          'سفارش جدید ' || ins.code,
          'Room ' || stay.room_number::text || ' · ' || svc.name_en,
          'اتاق ' || stay.room_number::text || ' · ' || svc.name_fa,
          'order',
          ins.id::text
          from ins, stay, svc
        returning id
      ),
      audited as (
        insert into audit_logs (actor_user_id, action, entity_type, entity_id, new_value)
        select $2, 'order.create', 'order', ins.id::text,
               jsonb_build_object('code', ins.code, 'department', ins.department_code, 'qty', $11)
          from ins
        returning id
      )
      select ins.id, ins.code, ins.department_code,
             (select room_number from stay) as room_number
        from ins
    `,
    values: [
      input.stayId,
      input.userId,
      input.serviceId,
      input.code,
      input.priority,
      input.notes,
      input.idempotencyKey,
      input.serviceDate,
      input.serviceTime,
      input.guestCount,
      input.quantity,
      input.laundryLabel,
      input.plate,
      input.vehicleType,
      input.issueCode,
    ],
  };
}

export function transitionOrderSql(input: {
  orderId: number;
  actorId: string;
  from: string;
  to: string;
  department: string | null;
}): SqlCall {
  return {
    text: `
      with upd as (
        update orders o
           set status = $4,
               accepted_at = case when $4 = 'ACCEPTED' then coalesce(o.accepted_at, now()) else o.accepted_at end,
               preparing_at = case when $4 = 'PREPARING' then coalesce(o.preparing_at, now()) else o.preparing_at end,
               ready_at = case when $4 = 'READY' then coalesce(o.ready_at, now()) else o.ready_at end,
               delivering_at = case when $4 = 'DELIVERING' then coalesce(o.delivering_at, now()) else o.delivering_at end,
               delivered_at = case when $4 = 'DELIVERED' then coalesce(o.delivered_at, now()) else o.delivered_at end,
               completed_at = case when $4 = 'COMPLETED' then coalesce(o.completed_at, now()) else o.completed_at end,
               cancelled_at = case when $4 in ('CANCELLED', 'REJECTED') then now() else o.cancelled_at end
         where o.id = $1
           and o.status = $3
           and ($5::text is null or o.department_code = $5)
           and (
             $4 <> 'DELIVERED'
             or not exists (
               select 1 from order_items oi
                where oi.order_id = o.id
                  and oi.complimentary = false
                  and oi.unit_price_toman is null
             )
           )
        returning o.*
      ),
      hist as (
        insert into order_status_history (order_id, from_status, to_status, actor_user_id)
        select upd.id, $3, $4, $2 from upd
        returning id
      ),
      priced as (
        select bool_and(oi.complimentary or oi.unit_price_toman is not null) as ok
          from order_items oi
          join upd on upd.id = oi.order_id
      ),
      charge as (
        insert into folio_items (
          folio_id, source_type, source_id, description_en, description_fa, amount_toman, quantity
        )
        select
          f.id,
          'SERVICE_ORDER',
          oi.id::text,
          oi.name_en || ' × ' || oi.quantity::text,
          oi.name_fa || ' × ' || oi.quantity::text,
          case when oi.complimentary then 0 else oi.unit_price_toman * oi.quantity end,
          oi.quantity
          from upd
          join order_items oi on oi.order_id = upd.id
          join folios f on f.stay_id = upd.stay_id
          join services sv on sv.id = oi.service_id
         where $4 = 'DELIVERED'
           and upd.status = 'DELIVERED'
           and sv.bill_on_status = 'DELIVERED'
           and (oi.complimentary or oi.unit_price_toman is not null)
           and (select ok from priced)
        on conflict (source_type, source_id) do nothing
        returning id
      ),
      guest_note as (
        insert into notifications (
          recipient_user_id, type, title_en, title_fa, body_en, body_fa, entity_type, entity_id
        )
        select
          upd.user_id,
          case $4
            when 'ACCEPTED' then 'ORDER_ACCEPTED'
            when 'PREPARING' then 'ORDER_PREPARING'
            when 'READY' then 'ORDER_READY'
            when 'DELIVERED' then 'ORDER_DELIVERED'
            when 'COMPLETED' then 'ORDER_DELIVERED'
            else 'ORDER_ACCEPTED'
          end,
          'Order ' || upd.code || ' · ' || $4,
          'سفارش ' || upd.code || ' · ' || $4,
          'Status is now ' || $4,
          'وضعیت سفارش: ' || $4,
          'order',
          upd.id::text
          from upd
        returning id
      ),
      audited as (
        insert into audit_logs (actor_user_id, action, entity_type, entity_id, old_value, new_value)
        select $2, 'order.transition', 'order', upd.id::text,
               jsonb_build_object('status', $3),
               jsonb_build_object('status', $4, 'charged_lines', (select count(*) from charge))
          from upd
        returning id
      )
      select upd.id, upd.code, upd.status, upd.user_id,
             (select ok from priced) as priced,
             (select count(*)::int from charge) as charges
        from upd
    `,
    values: [input.orderId, input.actorId, input.from, input.to, input.department],
  };
}

export function extendStaySql(input: {
  stayId: number;
  actorId: string;
  requestedCheckOut: string;
  nights: string[];
  nightlyRate: number;
  auto: boolean;
}): SqlCall {
  const nightList = input.nights.join(",");
  return {
    text: `
      with stay as (
        select s.*, r.check_out, r.nightly_rate_toman, r.code, r.room_id as res_room, r.status as res_status
          from stays s
          join reservations r on r.id = s.reservation_id
         where s.id = $1
           and s.user_id = $2
           and s.status = 'ACTIVE'
           and r.status = 'CHECKED_IN'
         for update
      ),
      conflict as (
        select n.night
          from room_nights n, stay
         where n.room_id = stay.room_id
           and n.night = any (string_to_array($3, ',')::date[])
           and n.reservation_id <> stay.reservation_id
      ),
      req as (
        insert into extension_requests (
          stay_id, reservation_id, requested_check_out, status, quoted_amount_toman, decided_by
        )
        select
          stay.id,
          stay.reservation_id,
          $4::date,
          case when $5::boolean and not exists (select 1 from conflict) then 'APPROVED' else
            case when exists (select 1 from conflict) then 'REJECTED' else 'PENDING' end
          end,
          case when exists (select 1 from conflict) then null else $6::bigint * cardinality(string_to_array($3, ',')) end,
          case when $5::boolean and not exists (select 1 from conflict) then $2 else null end
          from stay
        returning id, status, reservation_id, stay_id, quoted_amount_toman, requested_check_out
      ),
      res as (
        update reservations r
           set check_out = req.requested_check_out, updated_at = now()
          from req, stay
         where req.status = 'APPROVED'
           and r.id = req.reservation_id
        returning r.id
      ),
      nights as (
        insert into room_nights (room_id, night, reservation_id)
        select stay.room_id, d::date, stay.reservation_id
          from stay
          join req on req.status = 'APPROVED'
          cross join unnest(string_to_array($3, ',')::date[]) as d
        returning night
      ),
      charge as (
        insert into folio_items (
          folio_id, source_type, source_id, description_en, description_fa, amount_toman, quantity
        )
        select
          f.id,
          'ROOM',
          'ext-' || req.id::text,
          'Stay extension to ' || req.requested_check_out::text,
          'تمدید اقامت تا ' || req.requested_check_out::text,
          req.quoted_amount_toman,
          cardinality(string_to_array($3, ','))
          from req
          join folios f on f.stay_id = req.stay_id
         where req.status = 'APPROVED'
           and req.quoted_amount_toman is not null
        returning id
      ),
      note as (
        insert into notifications (
          recipient_user_id, recipient_role, type, title_en, title_fa, body_en, body_fa, entity_type, entity_id
        )
        select
          case when req.status = 'PENDING' then null else stay.user_id end,
          case when req.status = 'PENDING' then 'RECEPTION' else null end,
          case req.status
            when 'APPROVED' then 'EXTENSION_APPROVED'
            when 'REJECTED' then 'EXTENSION_REJECTED'
            else 'EXTENSION_REQUEST'
          end,
          'Extension ' || req.status,
          'تمدید ' || req.status,
          'Checkout requested ' || req.requested_check_out::text,
          'تاریخ خروج درخواستی ' || req.requested_check_out::text,
          'extension',
          req.id::text
          from req, stay
        returning id
      )
      select req.id, req.status, req.quoted_amount_toman,
             (select count(*)::int from conflict) as conflicts,
             (select count(*)::int from nights) as added_nights
        from req
    `,
    values: [
      input.stayId,
      input.actorId,
      nightList,
      input.requestedCheckOut,
      input.auto,
      input.nightlyRate,
    ],
  };
}
