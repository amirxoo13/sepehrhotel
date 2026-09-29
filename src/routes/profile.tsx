import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DateField } from "@/components/hotel/dates";
import { signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getSessionContext, saveProfile } from "@/lib/hotel/api";
import { hotelMessage, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

type Ctx = Awaited<ReturnType<typeof getSessionContext>>;
type Profile = {
  full_name?: string | null;
  phone?: string | null;
  nationality?: string | null;
  date_of_birth?: string | null;
  id_doc_type?: string | null;
  id_doc_last4?: string | null;
};

const STAFF = ["SUPER_ADMIN", "HOTEL_ADMIN", "RECEPTION", "HOUSEKEEPING", "LAUNDRY", "KITCHEN", "COFFEE_SHOP", "PARKING", "MAINTENANCE", "ACCOUNTING", "MANAGER"];

function ProfilePage() {
  const { t, locale } = useI18n();
  const { user, isPending } = useCurrentUserState();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [nationality, setNationality] = useState("");
  const [birth, setBirth] = useState("");
  const [doc, setDoc] = useState("");
  const [last4, setLast4] = useState("");

  useEffect(() => {
    if (!user) return;
    let stop = false;
    void getSessionContext()
      .then((data) => {
        if (stop) return;
        setCtx(data);
        const p = (data.profile ?? {}) as Profile;
        setFullName(p.full_name || String(data.name || ""));
        setPhone(p.phone || "");
        setNationality(p.nationality || "");
        setBirth(p.date_of_birth ? String(p.date_of_birth).slice(0, 10) : "");
        setDoc(p.id_doc_type || "");
        setLast4(p.id_doc_last4 || "");
      })
      .catch((err) => {
        if (!stop) setError(hotelMessage(err, t));
      });
    return () => {
      stop = true;
    };
  }, [user, t]);

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

  const roles = (ctx?.roles as string[] | undefined) ?? [];
  const staff = roles.some((role) => STAFF.includes(role));

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await saveProfile({
        data: {
          fullName,
          phone: phone || null,
          nationality: nationality || null,
          dateOfBirth: birth || null,
          idDocType: doc || null,
          idDocLast4: last4 || null,
          locale,
        },
      });
      setSaved(true);
    } catch (err) {
      setError(hotelMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="main" className="wrap grid gap-4 pb-16">
      <section className="card grid gap-2">
        <h2 className="text-2xl">{t.account}</h2>
        <p>
          <strong>{String(ctx?.name || "")}</strong>
          <br />
          <span dir="ltr">{String(ctx?.email || "")}</span>
        </p>
        {roles.length ? <p className="muted text-sm">{roles.join(" · ")}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Link to="/stay" className="btn btn-primary">
            {t.stay}
          </Link>
          {staff ? (
            <Link to="/ops" className="btn btn-primary">
              {t.ops}
            </Link>
          ) : null}
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => void signOut()}>
            {t.signOut}
          </button>
        </div>
      </section>
      <form className="card grid gap-3" onSubmit={onSave}>
        <h2 className="text-2xl">{t.profile}</h2>
        <label className="field">
          {t.name}
          <input required minLength={2} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="field">
          {t.phone}
          <input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
        </label>
        <label className="field">
          {t.nationality}
          <input value={nationality} onChange={(e) => setNationality(e.target.value)} />
        </label>
        <DateField label={t.birth} value={birth} onChange={setBirth} />
        <label className="field">
          {t.doc}
          <input value={doc} onChange={(e) => setDoc(e.target.value)} />
        </label>
        <label className="field">
          {t.last4}
          <input value={last4} onChange={(e) => setLast4(e.target.value)} inputMode="numeric" maxLength={4} dir="ltr" />
        </label>
        {error ? <p className="danger">{error}</p> : null}
        {saved ? <p className="banner">{t.save} ✓</p> : null}
        <button className="btn btn-primary" disabled={busy}>
          {t.save}
        </button>
      </form>
    </main>
  );
}
