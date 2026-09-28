import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { DateField } from "@/components/hotel/dates";
import { createReservation, searchRooms } from "@/lib/hotel/api";
import { money, showDate, showNumber } from "@/lib/hotel/format";
import { roomPhoto } from "@/lib/hotel/photos";
import { hotelMessage, statusLabel, useI18n } from "@/lib/i18n";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/book")({
  validateSearch: (search: Record<string, unknown>) => ({
    checkIn: typeof search.checkIn === "string" ? search.checkIn : "",
    checkOut: typeof search.checkOut === "string" ? search.checkOut : "",
    guests: Number(search.guests ?? 1) || 1,
  }),
  component: BookPage,
});

type Result = Awaited<ReturnType<typeof searchRooms>>;
type Created = { code: string; status: string };

function BookPage() {
  const search = Route.useSearch();
  const { t, locale } = useI18n();
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [checkIn, setCheckIn] = useState(search.checkIn);
  const [checkOut, setCheckOut] = useState(search.checkOut);
  const [guests] = useState(search.guests);
  const [adults, setAdults] = useState(search.guests || 1);
  const [children, setChildren] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [busy, setBusy] = useState(false);

  async function runSearch(event?: FormEvent) {
    event?.preventDefault();
    if (!checkIn || !checkOut || checkOut <= checkIn) {
      setError(t.errors.invalid_dates);
      return;
    }
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const found = await searchRooms({ data: { checkIn, checkOut, guests: adults + children || guests } });
      setResult(found);
      setPicked(null);
    } catch (err) {
      setError(hotelMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (search.checkIn && search.checkOut) void runSearch();
    // initial search only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!picked) return;
    if (!user) {
      sessionStorage.setItem(
        "sepehr-draft",
        JSON.stringify({ checkIn, checkOut, adults, children, name, phone, notes, picked }),
      );
      await navigate({ to: "/login" });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const row = await createReservation({
        data: {
          roomType: picked,
          checkIn,
          checkOut,
          adults,
          children,
          guestName: name,
          guestPhone: phone || null,
          notes: notes || null,
          idempotencyKey: crypto.randomUUID(),
        },
      });
      setCreated(row as Created);
    } catch (err) {
      setError(hotelMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  const types = (result?.types ?? []) as {
    code: string;
    name_en: string;
    name_fa: string;
    available: number;
    base_rate_toman: number | null;
    capacity: number;
    description_en: string;
    description_fa: string;
  }[];
  const pickedType = types.find((type) => type.code === picked);

  return (
    <main id="main" className="wrap grid gap-6 pb-16">
      <header className="chapter">
        <p className="eyebrow">{t.brand}</p>
        <h1 className="text-4xl">{t.book}</h1>
        <ol className="steps">
          <li data-on="true">{t.stepDates}</li>
          <li data-on={result ? "true" : "false"}>{t.stepRoom}</li>
          <li data-on={picked ? "true" : "false"}>{t.stepRequest}</li>
        </ol>
      </header>
      <form className="book-band" onSubmit={runSearch}>
        <DateField label={t.checkIn} value={checkIn} onChange={setCheckIn} required />
        <DateField label={t.checkOut} value={checkOut} onChange={setCheckOut} min={checkIn || undefined} required />
        <label className="field">
          {t.adults}
          <input type="number" min={1} max={8} value={adults} suppressHydrationWarning onChange={(e) => setAdults(Number(e.target.value))} />
        </label>
        <label className="field">
          {t.children}
          <input type="number" min={0} max={6} value={children} suppressHydrationWarning onChange={(e) => setChildren(Number(e.target.value))} />
        </label>
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? t.loading : t.search}
        </button>
      </form>
      {error ? (
        <p className="danger" role="alert">
          {error}
        </p>
      ) : null}
      {result ? (
        <p className="muted">
          {showDate(result.checkIn, locale)} → {showDate(result.checkOut, locale)} · {showNumber(result.nights, locale)} {t.nightsLabel}
        </p>
      ) : null}
      <div className="grid gap-3">
        {types.map((type) => (
          <article key={type.code} className="book-stay">
            {roomPhoto[type.code] ? <img className="stay-photo" src={roomPhoto[type.code]} alt={locale === "fa" ? type.name_fa : type.name_en} /> : null}
            <div>
              <h2 className="text-2xl">{locale === "fa" ? type.name_fa : type.name_en}</h2>
              <p>{locale === "fa" ? type.description_fa : type.description_en}</p>
              <p>
                {t.available}: {showNumber(type.available, locale)}
              </p>
              <p className="price">
                {type.base_rate_toman != null ? money(type.base_rate_toman, locale) : t.rateUnset}
                {type.base_rate_toman != null ? <span> {t.perNight}</span> : null}
              </p>
            </div>
            <button type="button" className="btn btn-primary" disabled={type.available < 1} onClick={() => setPicked(type.code)}>
              {type.available < 1 ? t.noneLeft : t.reserve}
            </button>
          </article>
        ))}
      </div>
      {picked && !created ? (
        <form className="card grid gap-3" onSubmit={submit}>
          <h2 className="text-2xl">{pickedType ? (locale === "fa" ? pickedType.name_fa : pickedType.name_en) : picked}</h2>
          <p className="muted text-sm">{pickedType?.base_rate_toman != null ? t.ratePublished : t.hold}</p>
          <label className="field">
            {t.name}
            <input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
          <label className="field">
            {t.phone}
            <input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          </label>
          <label className="field">
            {t.notes}
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </label>
          {!isPending && !user ? <p className="muted">{t.signIn}</p> : null}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? t.loading : t.submit}
          </button>
        </form>
      ) : null}
      {created ? (
        <section className="card confirm-sheet">
          <p className="eyebrow">{t.confirmTitle}</p>
          <h2 className="text-4xl">{created.code}</h2>
          <p>{statusLabel(created.status, t)}</p>
          <p>{pickedType ? (locale === "fa" ? pickedType.name_fa : pickedType.name_en) : null}</p>
          <p>
            {showDate(checkIn, locale)} → {showDate(checkOut, locale)}
          </p>
          <p>
            {t.guests}: {showNumber(adults + children, locale)}
          </p>
          <p>{pickedType && pickedType.base_rate_toman != null ? money(pickedType.base_rate_toman, locale) : t.rateUnset}</p>
          <p>{t.confirmBody}</p>
          <p>
            <a href="tel:+982122245050">+98 21 2224 5050</a>
          </p>
          <button type="button" className="btn no-print" onClick={() => window.print()}>
            {t.printPage}
          </button>
        </section>
      ) : null}
    </main>
  );
}
