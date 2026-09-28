import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useLiveRefresh } from "@/components/hotel/shell";
import {
  assignRole,
  checkInReservation,
  checkOutStay,
  claimHotelAdmin,
  confirmReservation,
  decideExtension,
  getAudit,
  getDirectory,
  getExtensions,
  getHousekeeping,
  getMaintenance,
  getOpsSnapshot,
  getParking,
  getSessionContext,
  getStaffOrders,
  getStaffReservations,
  getStaffRooms,
  noShowReservation,
  publishAnnouncement,
  recordPayment,
  setMediaUrl,
  setOrderPrice,
  staffCancelReservation,
  transitionOrder,
  updateHousekeeping,
  updateParking,
  updateRoom,
  updateService,
  updateSetting,
  listServices,
  getPublicHotel,
} from "@/lib/hotel/api";
import { money, showDate } from "@/lib/hotel/format";
import { hotelMessage, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/ops")({
  component: OpsPage,
});

type Panel = "board" | "reservations" | "queue" | "housekeeping" | "parking" | "maintenance" | "admin";

function OpsPage() {
  const { t, locale } = useI18n();
  const { user, isPending } = useCurrentUserState();
  const [panel, setPanel] = useState<Panel>("board");
  const [error, setError] = useState<string | null>(null);
  const [ctx, setCtx] = useState<Awaited<ReturnType<typeof getSessionContext>> | null>(null);
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof getOpsSnapshot>> | null>(null);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [reservations, setReservations] = useState<ResRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [parking, setParking] = useState<ParkRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [extensions, setExtensions] = useState<ExtRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [directory, setDirectory] = useState<DirRow[]>([]);
  const [services, setServices] = useState<SvcRow[]>([]);
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [rate, setRate] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  const perms = new Set((ctx?.permissions as string[] | undefined) ?? []);
  const can = (permission: string) => perms.has(permission);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const session = await getSessionContext();
      setCtx(session);
      const allowed = new Set(session.permissions as string[]);
      if (!allowed.has("room.read") && !allowed.has("order.queue")) {
        setError(null);
        return;
      }
      const jobs: Promise<unknown>[] = [];
      if (allowed.has("room.read")) {
        jobs.push(getOpsSnapshot().then(setSnapshot), getStaffRooms().then((rows) => setRooms(rows as RoomRow[])));
      }
      if (allowed.has("reservation.read")) {
        jobs.push(
          getStaffReservations().then((rows) => setReservations(rows as ResRow[])),
          allowed.has("extension.decide") ? getExtensions().then((rows) => setExtensions(rows as ExtRow[])) : Promise.resolve(),
        );
      }
      if (allowed.has("order.queue")) jobs.push(getStaffOrders().then((rows) => setOrders(rows as OrderRow[])));
      if (allowed.has("housekeeping.update")) jobs.push(getHousekeeping().then((rows) => setTasks(rows as TaskRow[])));
      if (allowed.has("parking.update")) jobs.push(getParking().then((rows) => setParking(rows as ParkRow[])));
      if (allowed.has("maintenance.update")) jobs.push(getMaintenance().then((rows) => setTickets(rows as TicketRow[])));
      if (allowed.has("audit.read")) jobs.push(getAudit().then((rows) => setAudit(rows as AuditRow[])));
      if (allowed.has("staff.assign")) jobs.push(getDirectory().then((rows) => setDirectory(rows as DirRow[])));
      if (allowed.has("content.update")) {
        jobs.push(listServices().then((rows) => setServices(rows as SvcRow[])), getPublicHotel().then((hotel) => setMedia(hotel.media as MediaRow[])));
      }
      await Promise.all(jobs);
      setError(null);
    } catch (err) {
      setError(hotelMessage(err, t));
    }
  }, [user, t]);

  useEffect(() => {
    void load();
  }, [load]);
  const live = useLiveRefresh(Boolean(user && ctx && (can("room.read") || can("order.queue"))), () => void load());

  async function act(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      await load();
    } catch (err) {
      setError(hotelMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  if (isPending) return <main className="wrap py-10">{t.loading}</main>;
  if (!user) {
    return (
      <main className="wrap py-10">
        <Link to="/login" className="btn btn-primary">
          {t.signIn}
        </Link>
      </main>
    );
  }

  const staff = can("room.read") || can("order.queue") || can("billing.read");
  const metrics = snapshot?.metrics as
    | {
        rooms: number;
        occupied: number;
        available: number;
        cleaning: number;
        arrivals: number;
        departures: number;
        open_orders: number;
        open_maint: number;
        laundry: number;
        response_seconds: number | null;
        collected_today: number;
        outstanding: number;
      }
    | undefined;

  const panels: { id: Panel; label: string; show: boolean }[] = [
    { id: "board", label: t.board, show: can("room.read") },
    { id: "reservations", label: t.reservations, show: can("reservation.read") },
    { id: "queue", label: t.desk, show: can("order.queue") },
    { id: "housekeeping", label: t.housekeeping, show: can("housekeeping.update") },
    { id: "parking", label: t.parking, show: can("parking.update") },
    { id: "maintenance", label: t.maintenance, show: can("maintenance.update") },
    { id: "admin", label: t.admin, show: can("settings.update") || can("staff.assign") || can("content.update") || can("audit.read") },
  ];

  return (
    <main id="main" className="wrap grid gap-4 pb-16">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl">{t.ops}</h1>
          <p className="muted text-sm">{(ctx?.roles as string[] | undefined)?.join(" · ")}</p>
        </div>
        {staff ? <span className="chip">{live ? t.live : t.liveDown}</span> : null}
      </div>
      {error ? (
        <p className="danger" role="alert">
          {error}
        </p>
      ) : null}
      {!staff ? (
        <section className="card grid gap-3">
          <p>{t.opsClosed}</p>
          {!ctx?.adminExists ? (
            <>
              <p>{t.claimWarn}</p>
              <button className="btn btn-brass" disabled={busy} onClick={() => act(() => claimHotelAdmin())}>
                {t.claim}
              </button>
            </>
          ) : (
            <p className="muted">{t.claimWarn}</p>
          )}
        </section>
      ) : (
        <>
          <div className="tabs" role="tablist">
            {panels
              .filter((item) => item.show)
              .map((item) => (
                <button key={item.id} className="tab" role="tab" aria-selected={panel === item.id} onClick={() => setPanel(item.id)}>
                  {item.label}
                </button>
              ))}
          </div>
          {panel === "board" && metrics ? (
            <section className="grid gap-3 sm:grid-cols-3">
              <Metric label={locale === "fa" ? "اشغال" : "Occupied"} value={String(metrics.occupied)} />
              <Metric label={locale === "fa" ? "آزاد" : "Available"} value={String(metrics.available)} />
              <Metric label={locale === "fa" ? "نظافت" : "Cleaning"} value={String(metrics.cleaning)} />
              <Metric label={locale === "fa" ? "ورود امروز" : "Arrivals"} value={String(metrics.arrivals)} />
              <Metric label={locale === "fa" ? "خروج امروز" : "Departures"} value={String(metrics.departures)} />
              <Metric label={locale === "fa" ? "سفارش باز" : "Open orders"} value={String(metrics.open_orders)} />
              <Metric label={locale === "fa" ? "تعمیرات باز" : "Open maintenance"} value={String(metrics.open_maint)} />
              <Metric label={locale === "fa" ? "صف لاندری" : "Laundry queue"} value={String(metrics.laundry)} />
              <Metric
                label={locale === "fa" ? "میانگین پذیرش سفارش" : "Mean accept time"}
                value={metrics.response_seconds == null ? t.noData : `${metrics.response_seconds}s`}
              />
              <Metric label={locale === "fa" ? "وصول امروز" : "Collected today"} value={money(metrics.collected_today, locale)} />
              <Metric label={locale === "fa" ? "مانده باز" : "Outstanding"} value={money(metrics.outstanding, locale)} />
              <div className="card sm:col-span-3">
                <h2 className="mb-2 text-2xl">{locale === "fa" ? "وضعیت اتاق‌ها" : "Room board"}</h2>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                  {rooms.map((room) => (
                    <div key={room.id} className="card p-2 text-center">
                      <div className="stat text-lg">{room.number}</div>
                      <div className="text-xs">{room.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}
          {panel === "reservations" ? (
            <section className="grid gap-3">
              {reservations.map((reservation) => (
                <article key={reservation.id} className="card grid gap-2">
                  <h2 className="text-xl">
                    {reservation.code} · {reservation.guest_name}
                  </h2>
                  <p>
                    {showDate(reservation.check_in, locale)} → {showDate(reservation.check_out, locale)} · {reservation.status}
                    {reservation.room_number ? ` · ${reservation.room_number}` : ""}
                  </p>
                  <p>{money(reservation.nightly_rate_toman, locale)}</p>
                  {reservation.status === "PENDING" && can("reservation.update") ? (
                    <div className="flex flex-wrap gap-2">
                      <input
                        className="field"
                        inputMode="numeric"
                        value={rate[reservation.id] ?? ""}
                        onChange={(e) => setRate({ ...rate, [reservation.id]: e.target.value })}
                        aria-label={t.confirmRate}
                      />
                      <button
                        className="btn btn-primary"
                        disabled={busy}
                        onClick={() =>
                          act(() =>
                            confirmReservation({
                              data: { reservationId: reservation.id, nightlyRate: Number(rate[reservation.id] || 0) },
                            }),
                          )
                        }
                      >
                        {t.confirmRate}
                      </button>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {reservation.status === "CONFIRMED" && can("reservation.checkin") ? (
                      <button className="btn btn-primary" disabled={busy} onClick={() => act(() => checkInReservation({ data: { reservationId: reservation.id } }))}>
                        {t.checkInAction}
                      </button>
                    ) : null}
                    {can("reservation.cancel") && (reservation.status === "PENDING" || reservation.status === "CONFIRMED") ? (
                      <>
                        <button className="btn btn-danger" disabled={busy} onClick={() => act(() => staffCancelReservation({ data: { reservationId: reservation.id } }))}>
                          {t.cancel}
                        </button>
                        <button className="btn" disabled={busy} onClick={() => act(() => noShowReservation({ data: { reservationId: reservation.id } }))}>
                          {t.noShow}
                        </button>
                      </>
                    ) : null}
                  </div>
                </article>
              ))}
              {extensions.map((request) => (
                <article key={request.id} className="card">
                  <h3>
                    {request.code} · {request.room_number} · {request.status}
                  </h3>
                  <p>
                    {showDate(request.check_out, locale)} → {showDate(request.requested_check_out, locale)}
                  </p>
                  {request.status === "PENDING" ? (
                    <div className="mt-2 flex gap-2">
                      <button className="btn btn-primary" disabled={busy} onClick={() => act(() => decideExtension({ data: { requestId: request.id, approve: true } }))}>
                        {locale === "fa" ? "تأیید" : "Approve"}
                      </button>
                      <button className="btn btn-danger" disabled={busy} onClick={() => act(() => decideExtension({ data: { requestId: request.id, approve: false } }))}>
                        {t.reject}
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
              <InHouse rooms={rooms} canCheckout={can("reservation.checkout")} busy={busy} onCheckout={(stayId) => act(() => checkOutStay({ data: { stayId } }))} />
            </section>
          ) : null}
          {panel === "queue" ? (
            <Queue orders={orders} busy={busy} locale={locale} canPrice={can("order.price")} act={act} />
          ) : null}
          {panel === "housekeeping" ? (
            <section className="grid gap-3">
              {tasks.length === 0 ? <p className="card">{t.empty}</p> : null}
              {tasks.map((task) => (
                <article key={task.id} className="card">
                  <h2>
                    {task.room_number} · {task.kind} · {task.priority}
                  </h2>
                  <p className="chip">{task.status}</p>
                  {task.guest_name ? <p>{task.guest_name}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {task.status === "OPEN" ? (
                      <button className="btn" disabled={busy} onClick={() => act(() => updateHousekeeping({ data: { taskId: task.id, status: "ASSIGNED" } }))}>
                        {locale === "fa" ? "اختصاص" : "Assign"}
                      </button>
                    ) : null}
                    {task.status !== "DONE" && task.status !== "IN_PROGRESS" ? (
                      <button className="btn" disabled={busy} onClick={() => act(() => updateHousekeeping({ data: { taskId: task.id, status: "IN_PROGRESS" } }))}>
                        {locale === "fa" ? "شروع" : "Start"}
                      </button>
                    ) : null}
                    {task.status !== "DONE" ? (
                      <button className="btn btn-primary" disabled={busy} onClick={() => act(() => updateHousekeeping({ data: { taskId: task.id, status: "DONE" } }))}>
                        {t.complete}
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </section>
          ) : null}
          {panel === "parking" ? (
            <section className="grid gap-3">
              {parking.map((row) => (
                <ParkCard key={row.id} row={row} busy={busy} onSave={(slot, status) => act(() => updateParking({ data: { id: row.id, slot, status } }))} />
              ))}
              {parking.length === 0 ? <p className="card">{t.empty}</p> : null}
            </section>
          ) : null}
          {panel === "maintenance" ? (
            <section className="grid gap-3">
              {tickets.map((ticket) => (
                <article key={ticket.id} className="card">
                  <h2>
                    {ticket.room_number} · {ticket.issue_code}
                  </h2>
                  <p>{ticket.description}</p>
                  <p className="chip">{ticket.status}</p>
                </article>
              ))}
              {tickets.length === 0 ? <p className="card">{t.empty}</p> : null}
            </section>
          ) : null}
          {panel === "admin" ? (
            <Admin
              rooms={rooms}
              services={services}
              media={media}
              directory={directory}
              audit={audit}
              busy={busy}
              act={act}
            />
          ) : null}
        </>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="card">
      <p className="muted text-sm">{label}</p>
      <p className="stat font-display text-3xl">{value}</p>
    </article>
  );
}

function InHouse({
  rooms,
  canCheckout,
  busy,
  onCheckout,
}: {
  rooms: RoomRow[];
  canCheckout: boolean;
  busy: boolean;
  onCheckout: (stayId: number) => void;
}) {
  const { t } = useI18n();
  const staying = rooms.filter((room) => room.stay_id && (room.stay_status === "ACTIVE" || room.stay_status === "CHECKOUT_PENDING"));
  if (!staying.length) return null;
  return (
    <div className="grid gap-3">
      <h2 className="text-2xl">{t.checkOutAction}</h2>
      {staying.map((room) => (
        <article key={room.id} className="card flex items-center justify-between gap-3">
          <p>
            {room.number} · {room.guest_name} · {room.stay_status}
          </p>
          {canCheckout && room.stay_id ? (
            <button className="btn btn-primary" disabled={busy} onClick={() => onCheckout(room.stay_id as number)}>
              {t.checkOutAction}
            </button>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function Queue({
  orders,
  busy,
  locale,
  canPrice,
  act,
}: {
  orders: OrderRow[];
  busy: boolean;
  locale: "fa" | "en";
  canPrice: boolean;
  act: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const { t } = useI18n();
  const [prices, setPrices] = useState<Record<number, string>>({});
  if (!orders.length) return <p className="card">{t.empty}</p>;
  return (
    <section className="grid gap-3">
      {orders.map((order) => (
        <article key={order.id} className="card grid gap-2">
          <h2 className="text-xl">
            {order.room_number} · {order.code}
          </h2>
          <p>
            {locale === "fa" ? order.name_fa : order.name_en} × {order.quantity}
          </p>
          <p className="chip">
            {order.department_code} · {order.status} · {order.priority}
          </p>
          {order.notes ? <p>{order.notes}</p> : null}
          {order.plate ? <p>{order.plate}</p> : null}
          {canPrice && order.unit_price_toman == null && !order.complimentary ? (
            <div className="flex gap-2">
              <input
                inputMode="numeric"
                aria-label={t.price}
                value={prices[order.item_id] ?? ""}
                onChange={(e) => setPrices({ ...prices, [order.item_id]: e.target.value })}
              />
              <button
                className="btn"
                disabled={busy}
                onClick={() => act(() => setOrderPrice({ data: { itemId: order.item_id, price: Number(prices[order.item_id] || 0) } }))}
              >
                {t.price}
              </button>
            </div>
          ) : (
            <p>{order.complimentary ? "—" : money(order.unit_price_toman, locale)}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {order.status === "PENDING" ? (
              <button className="btn btn-primary" disabled={busy} onClick={() => act(() => transitionOrder({ data: { orderId: order.id, to: "ACCEPTED" } }))}>
                {t.accept}
              </button>
            ) : null}
            {order.status === "ACCEPTED" ? (
              <button className="btn" disabled={busy} onClick={() => act(() => transitionOrder({ data: { orderId: order.id, to: "PREPARING" } }))}>
                {t.prepare}
              </button>
            ) : null}
            {order.status === "PREPARING" ? (
              <button className="btn" disabled={busy} onClick={() => act(() => transitionOrder({ data: { orderId: order.id, to: "READY" } }))}>
                {locale === "fa" ? "آماده" : "Ready"}
              </button>
            ) : null}
            {order.status === "READY" || order.status === "DELIVERING" ? (
              <button className="btn btn-primary" disabled={busy} onClick={() => act(() => transitionOrder({ data: { orderId: order.id, to: "DELIVERED" } }))}>
                {t.deliver}
              </button>
            ) : null}
            {order.status === "DELIVERED" ? (
              <button className="btn" disabled={busy} onClick={() => act(() => transitionOrder({ data: { orderId: order.id, to: "COMPLETED" } }))}>
                {t.complete}
              </button>
            ) : null}
            {["PENDING", "ACCEPTED", "PREPARING", "READY", "DELIVERING"].includes(order.status) ? (
              <button className="btn btn-danger" disabled={busy} onClick={() => act(() => transitionOrder({ data: { orderId: order.id, to: "REJECTED" } }))}>
                {t.reject}
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </section>
  );
}

function ParkCard({ row, busy, onSave }: { row: ParkRow; busy: boolean; onSave: (slot: string, status: string) => void }) {
  const [slot, setSlot] = useState(row.slot_label ?? "");
  const [status, setStatus] = useState(row.status);
  return (
    <article className="card grid gap-2">
      <h2>
        {row.room_number} · {row.plate}
      </h2>
      <p>{row.vehicle_type}</p>
      <label className="field">
        Slot
        <input value={slot} onChange={(e) => setSlot(e.target.value)} />
      </label>
      <label className="field">
        Status
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {["REQUESTED", "ACCEPTED", "PARKED", "CLOSED", "CANCELLED"].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <button className="btn btn-primary" disabled={busy} onClick={() => onSave(slot, status)}>
        Save
      </button>
    </article>
  );
}

function Admin({
  rooms,
  services,
  media,
  directory,
  audit,
  busy,
  act,
}: {
  rooms: RoomRow[];
  services: SvcRow[];
  media: MediaRow[];
  directory: DirRow[];
  audit: AuditRow[];
  busy: boolean;
  act: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("RECEPTION");
  const [payStay, setPayStay] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [announceEn, setAnnounceEn] = useState("");
  const [announceFa, setAnnounceFa] = useState("");
  const [settingKey, setSettingKey] = useState("check_in_time");
  const [settingValue, setSettingValue] = useState("");
  return (
    <section className="grid gap-4">
      <p className="muted text-sm">{t.gateway}</p>
      <form
        className="card grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void act(() => assignRole({ data: { email, role, grant: true } }));
        }}
      >
        <h2 className="text-2xl">{locale === "fa" ? "نقش کارکنان" : "Staff role"}</h2>
        <p className="muted text-sm">{locale === "fa" ? "شخص باید قبلاً حساب ساخته باشد." : "The person must already have an account."}</p>
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label={t.email} />
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          {["RECEPTION", "HOUSEKEEPING", "LAUNDRY", "KITCHEN", "COFFEE_SHOP", "PARKING", "MAINTENANCE", "ACCOUNTING", "HOTEL_ADMIN"].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <button className="btn btn-primary" disabled={busy}>
          {t.save}
        </button>
        <ul className="text-sm">
          {directory.map((person) => (
            <li key={person.id}>
              {person.email} · {person.roles || "—"}
            </li>
          ))}
        </ul>
      </form>
      <form
        className="card grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const room = rooms.find((item) => String(item.number) === payStay);
          if (!room?.stay_id) return;
          void act(async () => {
            const { getStaffFolio } = await import("@/lib/hotel/api");
            const folio = await getStaffFolio({ data: { stayId: room.stay_id as number } });
            const folioId = (folio.folio as { id: number }).id;
            await recordPayment({ data: { folioId, amount: Number(payAmount), method: "CASH" } });
          });
        }}
      >
        <h2 className="text-2xl">{t.pay}</h2>
        <input required inputMode="numeric" value={payStay} onChange={(e) => setPayStay(e.target.value)} aria-label="room" />
        <input required inputMode="numeric" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} aria-label={t.pay} />
        <button className="btn btn-primary" disabled={busy}>
          {t.pay}
        </button>
      </form>
      <form
        className="card grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void act(() => updateSetting({ data: { key: settingKey, value: settingValue } }));
        }}
      >
        <h2 className="text-2xl">{locale === "fa" ? "تنظیمات" : "Settings"}</h2>
        <select value={settingKey} onChange={(e) => setSettingKey(e.target.value)}>
          {["check_in_time", "check_out_time", "breakfast_hours", "coffee_hours", "pending_hold_minutes", "extension_auto_approve", "tax_bps", "announcement_en", "announcement_fa", "address_en", "address_fa", "geo_lat", "geo_lng"].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <input value={settingValue} onChange={(e) => setSettingValue(e.target.value)} />
        <button className="btn" disabled={busy}>
          {t.save}
        </button>
      </form>
      <form
        className="card grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void act(() => publishAnnouncement({ data: { en: announceEn, fa: announceFa } }));
        }}
      >
        <h2 className="text-2xl">{locale === "fa" ? "اطلاعیه" : "Announcement"}</h2>
        <input value={announceEn} onChange={(e) => setAnnounceEn(e.target.value)} aria-label="English" />
        <input value={announceFa} onChange={(e) => setAnnounceFa(e.target.value)} aria-label="فارسی" />
        <button className="btn" disabled={busy}>
          {t.save}
        </button>
      </form>
      <div className="card grid gap-2">
        <h2 className="text-2xl">{locale === "fa" ? "قیمت خدمات" : "Service prices"}</h2>
        {services.map((service) => (
          <ServicePrice key={service.id} service={service} busy={busy} locale={locale} act={act} />
        ))}
      </div>
      <div className="card grid gap-2">
        <h2 className="text-2xl">{t.gallery}</h2>
        {media.map((item) => (
          <MediaRowEditor key={item.id} item={item} busy={busy} locale={locale} act={act} />
        ))}
      </div>
      <div className="card grid gap-2">
        <h2 className="text-2xl">{locale === "fa" ? "اتاق" : "Room status"}</h2>
        {rooms.slice(0, 8).map((room) => (
          <div key={room.id} className="flex flex-wrap gap-2">
            <span>
              {room.number} · {room.status}
            </span>
            <button className="btn" disabled={busy} onClick={() => act(() => updateRoom({ data: { roomId: room.id, status: "MAINTENANCE" } }))}>
              {locale === "fa" ? "تعمیر" : "Maintenance"}
            </button>
            <button className="btn" disabled={busy} onClick={() => act(() => updateRoom({ data: { roomId: room.id, status: "AVAILABLE" } }))}>
              {locale === "fa" ? "آزاد" : "Available"}
            </button>
          </div>
        ))}
      </div>
      <div className="card">
        <h2 className="text-2xl">{locale === "fa" ? "ممیزی" : "Audit"}</h2>
        <ul className="mt-2 grid gap-1 text-sm">
          {audit.map((row) => (
            <li key={row.id}>
              {row.action} · {row.entity_type} · {row.entity_id}
            </li>
          ))}
          {audit.length === 0 ? <li>{t.empty}</li> : null}
        </ul>
      </div>
      <QrList rooms={rooms} />
    </section>
  );
}

function ServicePrice({
  service,
  busy,
  locale,
  act,
}: {
  service: SvcRow;
  busy: boolean;
  locale: "fa" | "en";
  act: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const [price, setPrice] = useState(service.price_toman == null ? "" : String(service.price_toman));
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void act(() => updateService({ data: { id: service.id, price: price === "" ? null : Number(price) } }));
      }}
    >
      <span className="min-w-40">{locale === "fa" ? service.name_fa : service.name_en}</span>
      <input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="price" />
      <button className="btn" disabled={busy}>
        OK
      </button>
    </form>
  );
}

function MediaRowEditor({
  item,
  busy,
  locale,
  act,
}: {
  item: MediaRow;
  busy: boolean;
  locale: "fa" | "en";
  act: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const [url, setUrl] = useState(item.url ?? "");
  return (
    <form
      className="grid gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        void act(() => setMediaUrl({ data: { id: item.id, url } }));
      }}
    >
      <span>{locale === "fa" ? item.title_fa : item.title_en}</span>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" aria-label="url" />
      <button className="btn" disabled={busy}>
        OK
      </button>
    </form>
  );
}

function QrList({ rooms }: { rooms: RoomRow[] }) {
  const { t } = useI18n();
  return (
    <div className="card">
      <h2 className="text-2xl">{t.qr}</h2>
      <p className="muted text-sm">{t.qrBody}</p>
      <ul className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {rooms.map((room) => (
          <li key={room.id}>
            <Link to="/room/$code" params={{ code: room.qr_code }}>
              {room.number}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

type RoomRow = {
  id: number;
  number: number;
  status: string;
  qr_code: string;
  stay_id: number | null;
  stay_status: string | null;
  guest_name: string | null;
};
type ResRow = {
  id: number;
  code: string;
  status: string;
  check_in: string;
  check_out: string;
  guest_name: string;
  nightly_rate_toman: number | null;
  room_number: number | null;
};
type OrderRow = {
  id: number;
  code: string;
  status: string;
  department_code: string;
  priority: string;
  notes: string | null;
  room_number: number;
  item_id: number;
  name_en: string;
  name_fa: string;
  quantity: number;
  unit_price_toman: number | null;
  complimentary: boolean;
  plate: string | null;
};
type TaskRow = { id: number; room_number: number; kind: string; priority: string; status: string; guest_name: string | null };
type ParkRow = { id: number; plate: string; vehicle_type: string | null; status: string; slot_label: string | null; room_number: number };
type TicketRow = { id: number; issue_code: string; description: string | null; status: string; room_number: number };
type ExtRow = { id: number; status: string; requested_check_out: string; check_out: string; code: string; room_number: number };
type AuditRow = { id: number; action: string; entity_type: string; entity_id: string | null };
type DirRow = { id: string; email: string; roles: string };
type SvcRow = { id: number; name_en: string; name_fa: string; price_toman: number | null };
type MediaRow = { id: number; title_en: string; title_fa: string; url: string | null };
