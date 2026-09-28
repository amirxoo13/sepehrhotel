import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getPrintableQr, getRoomCard, getRoomCardForGuest } from "@/lib/hotel/api";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/room/$code")({
  component: RoomPage,
});

function RoomPage() {
  const { code } = Route.useParams();
  const { t, locale } = useI18n();
  const { user, isPending } = useCurrentUserState();
  const [card, setCard] = useState<{
    room: { number: number; floor: number; name_en: string; name_fa: string };
    matchesStay: boolean;
  } | null>(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const [result, mark] = await Promise.all([
          user ? getRoomCardForGuest({ data: { code } }) : getRoomCard({ data: { code } }),
          getPrintableQr({ data: { code } }).catch(() => null),
        ]);
        if (!stop) {
          setCard(result as typeof card);
          if (mark?.svg) setSvg(mark.svg);
        }
      } catch {
        if (!stop) setError(t.errors.not_found);
      }
    };
    if (!isPending) void load();
    return () => {
      stop = true;
    };
  }, [code, user, isPending, t.errors.not_found]);

  return (
    <main id="main" className="wrap grid gap-4 pb-16">
      <p className="text-sm text-brass">{t.qr}</p>
      <h1 className="text-5xl">{card ? card.room.number : "—"}</h1>
      <p>{t.qrBody}</p>
      {card ? (
        <p>
          {locale === "fa" ? card.room.name_fa : card.room.name_en} · {card.room.floor}
        </p>
      ) : null}
      {error ? <p className="danger">{error}</p> : null}
      {svg.startsWith("<svg") && !/<script|on\w+\s*=/i.test(svg) ? (
        <div className="card max-w-xs" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : null}
      {card?.matchesStay ? (
        <Link to="/stay" className="btn btn-primary">
          {t.stay}
        </Link>
      ) : (
        <Link to="/login" className="btn btn-primary">
          {t.signIn}
        </Link>
      )}
    </main>
  );
}
