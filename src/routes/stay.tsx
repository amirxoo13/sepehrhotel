import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useLiveRefresh } from "@/components/hotel/shell";
import {
  cancelCheckoutRequest,
  cancelMyOrder,
  getMyFolio,
  getSessionContext,
  listMyOrders,
  listMyReservations,
  listNotifications,
  listServices,
  markNotificationsRead,
  placeOrder,
  requestCheckout,
  requestExtension,
} from "@/lib/hotel/api";
import { DateField } from "@/components/hotel/dates";
import { money, showDate } from "@/lib/hotel/format";
import { deptLabel, hotelMessage, statusLabel, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/stay")({
  component: StayPage,
});

type Tab = "stay" | "services" | "orders" | "bill" | "more";

function StayPage() {
  const { t, locale } = useI18n();
  const { user, isPending } = useCurrentUserState();
  const [tab, setTab] = useState<Tab>("stay");
  const [error, setError] = useState<string | null>(null);
  const [ctx, setCtx] = useState<Awaited<ReturnType<typeof getSessionContext>> | null>(null);
  const [services, setServices] = useState<Awaited<ReturnType<typeof listServices>>>([]);
  const [orders, setOrders] = useState<Awaited<ReturnType<typeof listMyOrders>>>([]);
  const [folio, setFolio] = useState<Awaited<ReturnType<typeof getMyFolio>> | null>(null);
  const [notes, setNotes] = useState<Awaited<ReturnType<typeof listNotifications>>>([]);
  const [reservations, setReservations] = useState<Awaited<ReturnType<typeof listMyReservations>>>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [session, catalog, mine, bill, alerts, mineRes] = await Promise.all([
        getSessionContext(),
        listServices(),
        listMyOrders(),
        getMyFolio(),
        listNotifications(),
        listMyReservations(),
      ]);
      setCtx(session);
      setServices(catalog);
      setOrders(mine);
      setFolio(bill);
      setNotes(alerts);
      setReservations(mineRes);
      setError(null);
    } catch (err) {
      setError(hotelMessage(err, t));
    }
  }, [user, t]);

  useEffect(() => {
    void load();
  }, [load]);
  const live = useLiveRefresh(Boolean(user), () => void load());

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

  if (isPending || (user && !ctx && !error)) return <main className="wrap py-10">{t.loading}</main>;
  if (!user) {
    return (
      <main id="main" className="wrap py-10">
        <Link to="/login" className="btn btn-primary">
          {t.signIn}
        </Link>
      </main>
    );
  }

  const stay = ctx?.activeStay as {
    room_number: number;
    floor: number;
    status: string;
    code: string;
    check_in: string;
    check_out: string;
    type_en: string;
    type_fa: string;
    nightly_rate_toman: number | null;
  } | null;

  const tabs: { id: Tab; label: string }[] = [
    { id: "stay", label: t.myStay },
    { id: "services", label: t.services },
    { id: "orders", label: t.orders },
    { id: "bill", label: t.bill },
    { id: "more", label: t.more },
  ];

  return (
    <main id="main" className="wrap grid gap-4 pb-24">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-4xl">{t.stay}</h1>
        <span className="chip">{live ? t.live : t.liveDown}</span>
      </div>
      <div className="tabs" role="tablist">
        {tabs.map((item) => (
          <button key={item.id} className="tab" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {error ? (
        <p className="danger" role="alert">
          {error}
        </p>
      ) : null}

      {tab === "stay" ? (
        stay ? (
          <section className="card">
            <p className="text-sm text-brass">{locale === "fa" ? stay.type_fa : stay.type_en}</p>
            <h2 className="text-5xl">{stay.room_number}</h2>
            <p>
              {t.checkIn} {showDate(stay.check_in, locale)} · {t.checkOut} {showDate(stay.check_out, locale)}
            </p>
            <p className="chip mt-2">{statusLabel(stay.status, t)}</p>
            <p className="mt-3">{money(stay.nightly_rate_toman, locale)}</p>
            <p className="muted mt-2 text-sm">{stay.code}</p>
          </section>
        ) : (
          <section className="card">
            {(reservations as { id: number }[]).length === 0 ? <p>{t.noReservations}</p> : null}
            <p>{t.noStay}</p>
            <ul className="mt-3 grid gap-2">
              {(reservations as { id: number; code: string; status: string; check_in: string; check_out: string; room_number: number | null }[]).map(
                (reservation) => (
                  <li key={reservation.id}>
                    {reservation.code} · {statusLabel(reservation.status, t)} · {showDate(reservation.check_in, locale)} → {showDate(reservation.check_out, locale)}
                    {reservation.room_number ? ` · ${reservation.room_number}` : ""}
                  </li>
                ),
              )}
            </ul>
            <Link to="/book" search={{ checkIn: "", checkOut: "", guests: 1 }} className="btn btn-primary mt-4">
              {t.book}
            </Link>
          </section>
        )
      ) : null}

      {tab === "services" ? (
        <ServiceList
          services={services as ServiceRow[]}
          disabled={!stay || stay.status !== "ACTIVE" || busy}
          locale={locale}
          onOrder={(input) => act(() => placeOrder({ data: input }))}
        />
      ) : null}

      {tab === "orders" ? (
        <section className="grid gap-3">
          {(orders as OrderRow[]).length === 0 ? <p className="card">{t.noOrders}</p> : null}
          {(orders as OrderRow[]).map((order) => (
            <article key={order.id} className="card">
              <h2 className="text-xl">
                {order.code} · {locale === "fa" ? order.name_fa : order.name_en}
              </h2>
              <p>
                {order.room_number} · ×{order.quantity} · {deptLabel(order.department_code, t)}
              </p>
              <p className="chip mt-2">{statusLabel(order.status, t)}</p>
              <p className="mt-2">{money(order.complimentary ? 0 : order.unit_price_toman, locale)}</p>
              {order.status === "PENDING" || order.status === "ACCEPTED" ? (
                <button className="btn btn-danger mt-3" disabled={busy} onClick={() => act(() => cancelMyOrder({ data: { orderId: order.id } }))}>
                  {t.cancel}
                </button>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

      {tab === "bill" ? (
        <section className="card grid gap-3">
          <h2 className="text-3xl">
            {t.balance}: {money(folio?.balance ?? 0, locale)}
          </h2>
          {!folio?.folio ? <p>{t.empty}</p> : null}
          <h3>{t.charges}</h3>
          <ul className="grid gap-2">
            {(folio?.items as Charge[] | undefined)?.map((item) => (
              <li key={item.id} className={item.voided ? "muted line-through" : ""}>
                {locale === "fa" ? item.description_fa : item.description_en} · {money(item.amount_toman, locale)}
              </li>
            ))}
          </ul>
          <h3>{t.payments}</h3>
          <ul className="grid gap-2">
            {(folio?.payments as Pay[] | undefined)?.map((payment) => (
              <li key={payment.id}>
                {payment.method} · {payment.status} · {money(payment.amount_toman, locale)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === "more" ? (
        <More
          stay={stay}
          notes={notes as Note[]}
          busy={busy}
          onExtend={(requestedCheckOut) => act(() => requestExtension({ data: { requestedCheckOut } }))}
          onCheckout={() => act(() => requestCheckout())}
          onWithdrawCheckout={() => act(() => cancelCheckoutRequest())}
          onRead={() =>
            act(async () => {
              const ids = (notes as Note[]).filter((n) => !n.read).map((n) => n.id);
              if (ids.length) await markNotificationsRead({ data: { ids } });
            })
          }
        />
      ) : null}
    </main>
  );
}

type ServiceRow = {
  id: number;
  name_en: string;
  name_fa: string;
  description_en: string | null;
  description_fa: string | null;
  price_toman: number | null;
  complimentary: boolean;
  verification_status: string;
  department_code: string;
  requires_note: boolean;
  category_code: string;
};

function ServiceList({
  services,
  disabled,
  locale,
  onOrder,
}: {
  services: ServiceRow[];
  disabled: boolean;
  locale: "fa" | "en";
  onOrder: (input: {
    serviceId: number;
    quantity: number;
    notes: string | null;
    idempotencyKey: string;
    plate: string | null;
    vehicleType: string | null;
    serviceDate: string | null;
    serviceTime: string | null;
    guestCount: number | null;
  }) => void;
}) {
  const { t } = useI18n();
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [plate, setPlate] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [serviceTime, setServiceTime] = useState("");
  return (
    <section className="grid gap-3">
      <div className="card grid gap-3 md:grid-cols-2">
        <label className="field">
          {t.qty}
          <input type="number" min={1} max={20} value={qty} suppressHydrationWarning onChange={(e) => setQty(Number(e.target.value))} />
        </label>
        <label className="field">
          {t.notes}
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <label className="field">
          {t.plate}
          <input value={plate} onChange={(e) => setPlate(e.target.value)} />
        </label>
        <label className="field">
          {t.vehicle}
          <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
        </label>
        <DateField label={t.checkIn} value={serviceDate} onChange={setServiceDate} />
        <label className="field">
          {t.timeLabel}
          <input value={serviceTime} onChange={(e) => setServiceTime(e.target.value)} placeholder="08:00" />
        </label>
      </div>
      {services.map((service) => (
        <article key={service.id} className="card">
          <h2 className="text-xl">{locale === "fa" ? service.name_fa : service.name_en}</h2>
          <p className="muted text-sm">{locale === "fa" ? service.description_fa : service.description_en}</p>
          <p className="mt-2">{service.complimentary ? t.complimentary : money(service.price_toman, locale)}</p>
          <p className="muted mt-2 text-sm">{deptLabel(service.department_code, t)}</p>
          <button
            className="btn btn-primary mt-3"
            disabled={disabled}
            onClick={() =>
              onOrder({
                serviceId: service.id,
                quantity: qty,
                notes: note || null,
                idempotencyKey: crypto.randomUUID(),
                plate: plate || null,
                vehicleType: vehicle || null,
                serviceDate: serviceDate || null,
                serviceTime: serviceTime || null,
                guestCount: qty,
              })
            }
          >
            {t.order}
          </button>
        </article>
      ))}
    </section>
  );
}

type OrderRow = {
  id: number;
  code: string;
  status: string;
  department_code: string;
  room_number: number;
  name_en: string;
  name_fa: string;
  quantity: number;
  unit_price_toman: number | null;
  complimentary: boolean;
};

type Charge = { id: number; description_en: string; description_fa: string; amount_toman: number; voided: boolean };
type Pay = { id: number; method: string; status: string; amount_toman: number };
type Note = { id: number; title_en: string; title_fa: string; body_en: string; body_fa: string; read: boolean; created_at: string };

function More({
  stay,
  notes,
  busy,
  onExtend,
  onCheckout,
  onWithdrawCheckout,
  onRead,
}: {
  stay: { status: string; check_out: string } | null;
  notes: Note[];
  busy: boolean;
  onExtend: (date: string) => void;
  onCheckout: () => void;
  onWithdrawCheckout: () => void;
  onRead: () => void;
}) {
  const { t, locale } = useI18n();
  const [date, setDate] = useState(stay?.check_out ?? "");
  return (
    <section className="grid gap-3">
      <form
        className="card grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onExtend(date);
        }}
      >
        <h2 className="text-2xl">{t.extend}</h2>
        <DateField label={t.checkOut} value={date} onChange={setDate} min={stay?.check_out} required />
        <button className="btn btn-primary" disabled={busy || !stay}>
          {t.extend}
        </button>
      </form>
      {stay?.status === "ACTIVE" ? (
        <button className="btn" disabled={busy} onClick={onCheckout}>
          {t.checkOutAction}
        </button>
      ) : null}
      {stay?.status === "CHECKOUT_PENDING" ? (
        <div className="card grid gap-2">
          <p className="muted">{t.checkOutPendingNote}</p>
          <button className="btn" disabled={busy} onClick={onWithdrawCheckout}>
            {t.withdrawCheckout}
          </button>
        </div>
      ) : null}
      <article className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-2xl">{t.notify}</h2>
          <button className="btn btn-quiet" onClick={onRead}>
            {t.markRead}
          </button>
        </div>
        {notes.length === 0 ? <p>{t.empty}</p> : null}
        <ul className="grid gap-2">
          {notes.map((note) => (
            <li key={note.id}>
              <strong>{locale === "fa" ? note.title_fa : note.title_en}</strong>
              <p>{locale === "fa" ? note.body_fa : note.body_en}</p>
            </li>
          ))}
        </ul>
      </article>
      <article className="card flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl">{t.profile}</h2>
        <Link to="/profile" className="btn btn-primary">
          {t.profile}
        </Link>
      </article>
    </section>
  );
}
