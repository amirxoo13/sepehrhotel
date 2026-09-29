import { Link } from "@tanstack/react-router";
import type { getPublicHotel } from "@/lib/hotel/api";
import { money } from "@/lib/hotel/format";
import { roomPhoto } from "@/lib/hotel/photos";
import { useI18n } from "@/lib/i18n";

export type Hotel = Awaited<ReturnType<typeof getPublicHotel>>;

type Fact = { key: string; value_en: string; value_fa: string };
type Setting = { key: string; value: string };
type Policy = { code: string; title_en: string; title_fa: string; body_en: string; body_fa: string };
type TypeRow = {
  code: string;
  name_en: string;
  name_fa: string;
  capacity: number;
  description_en: string;
  description_fa: string;
  base_rate_toman: number | null;
  image_url?: string | null;
};
type Offering = { scope: string; name_en: string; name_fa: string; offered: boolean; highlight: boolean };
type Amenity = { room_type_code: string; code: string; name_en: string; name_fa: string; listed: boolean };
type Media = { id: number; category: string; title_en: string; title_fa: string; url: string | null };

function loc(locale: "fa" | "en", en: string, fa: string) {
  return locale === "fa" ? fa : en;
}

export function useHotelBits(data: Hotel) {
  const { locale } = useI18n();
  const facts = data.facts as Fact[];
  const settings = data.settings as Setting[];
  const policies = data.policies as Policy[];
  const types = data.types as TypeRow[];
  const amenities = data.amenities as Amenity[];
  const media = data.media as Media[];
  const fact = (key: string) => {
    const row = facts.find((item) => item.key === key);
    return row ? loc(locale, row.value_en, row.value_fa) : "";
  };
  const setting = (key: string) => settings.find((item) => item.key === key)?.value ?? "";
  const policy = (code: string) => policies.find((item) => item.code === code);
  return { locale, facts, settings, policies, types, amenities, media, fact, setting, policy };
}

export function Crumb({ items }: { items: { to?: "/" | "/rooms" | "/hotel" | "/gallery" | "/location" | "/policies" | "/contact" | "/dining"; label: string }[] }) {
  return (
    <nav className="crumb" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={item.label}>
          {index > 0 ? <span aria-hidden="true"> / </span> : null}
          {item.to === "/" ? <a href="/">{item.label}</a> : item.to ? <Link to={item.to}>{item.label}</Link> : <span>{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function MapFrame({ lat, lng, title }: { lat: number; lng: number; title: string }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-3">
      <iframe
        title={title}
        className="map-frame"
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.0025}%2C${lat - 0.0018}%2C${lng + 0.0025}%2C${lat + 0.0018}&layer=mapnik&marker=${lat}%2C${lng}`}
        loading="lazy"
      />
      <p className="muted text-sm">{t.mapNote}</p>
      <a className="btn btn-brass" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`}>
        {t.directions}
      </a>
    </div>
  );
}

export function RoomList({ data }: { data: Hotel }) {
  const { t, locale } = useI18n();
  const { types } = useHotelBits(data);
  return (
    <div className="stay-list">
      {types.map((type) => {
        const name = loc(locale, type.name_en, type.name_fa);
        const src = type.image_url || roomPhoto[type.code];
        return (
          <article key={type.code} id={type.code} className="stay-feature">
            {src ? <img className="stay-photo" src={src} alt={name} /> : null}
            <div>
              <h3>{name}</h3>
              <p className="price">
                {type.base_rate_toman != null ? money(type.base_rate_toman, locale) : t.rateUnset}
                {type.base_rate_toman != null ? <span> {t.perNight}</span> : null}
              </p>
              <p>{loc(locale, type.description_en, type.description_fa)}</p>
              <Link to="/book" search={{ checkIn: "", checkOut: "", guests: 1 }} className="btn">
                {t.reserve}
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function Offerings({ data }: { data: Hotel }) {
  const { t, locale } = useI18n();
  const offerings = (data.offerings ?? []) as Offering[];
  const scopes = ["hotel", "room", "exclusive", "comfort", "sport", "special"] as const;
  const label: Record<string, string> = {
    hotel: t.scopeHotel,
    room: t.scopeRoom,
    exclusive: t.scopeExclusive,
    comfort: t.scopeComfort,
    sport: t.scopeSport,
    special: t.scopeSpecial,
  };
  return (
    <div className="offer-grid">
      {scopes.map((scope) => {
        const rows = offerings.filter((item) => item.scope === scope);
        if (!rows.length) return null;
        const yes = rows.filter((item) => item.offered);
        const no = rows.filter((item) => !item.offered);
        return (
          <section key={scope}>
            <h3>{label[scope]}</h3>
            <p className="muted">{t.offered}</p>
            <ul className="quiet-list">
              {yes.map((item) => (
                <li key={item.name_en}>{loc(locale, item.name_en, item.name_fa)}</li>
              ))}
            </ul>
            {no.length > 0 ? (
              <>
                <p className="muted">{t.notOffered}</p>
                <ul className="quiet-list not-offered">
                  {no.map((item) => (
                    <li key={item.name_en}>{loc(locale, item.name_en, item.name_fa)}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
