import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { DateField } from "@/components/hotel/dates";
import type { getPublicHotel } from "@/lib/hotel/api";
import { addDays, money, showNumber } from "@/lib/hotel/format";
import { galleryPhotos, roomPhoto } from "@/lib/hotel/photos";
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
          {item.to ? <Link to={item.to}>{item.label}</Link> : <span>{item.label}</span>}
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

export function HomeStory({ data }: { data: Hotel }) {
  const { t, locale } = useI18n();
  const { fact, setting, policy } = useHotelBits(data);
  const navigate = useNavigate();
  const film = useRef<HTMLVideoElement>(null);
  const [checkIn, setCheckIn] = useState(data.today);
  const [checkOut, setCheckOut] = useState(addDays(data.today, 1));
  const [guests, setGuests] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const lat = Number(setting("geo_lat"));
  const lng = Number(setting("geo_lng"));
  const hasPin = Number.isFinite(lat) && Number.isFinite(lng);
  const announcement = setting(locale === "fa" ? "announcement_fa" : "announcement_en");
  const about = fact("about");
  const lobby = fact("lobby");
  const breakfast = policy("breakfast");
  const address = setting(locale === "fa" ? "address_fa" : "address_en");
  const phone = fact("phone");
  const highlights = ((data.offerings ?? []) as Offering[]).filter((item) => item.highlight && item.offered);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Hotel",
    name: "Sepehr Apartment Hotel",
    alternateName: "هتل آپارتمان سپهر",
    telephone: "+98-21-22245050",
    url: "http://melalgroup.com/index.php/sepehr-apartment-hotel/",
    address: {
      "@type": "PostalAddress",
      streetAddress: "No. 11, Salour Alley, Dr. Hesabi crossroad, Fereshteh Street",
      addressLocality: "Tehran",
      addressCountry: "IR",
    },
    numberOfRooms: data.roomCount,
    ...(hasPin ? { geo: { "@type": "GeoCoordinates", latitude: lat, longitude: lng } } : {}),
  };

  function search(event: FormEvent) {
    event.preventDefault();
    if (!checkIn || !checkOut || checkOut <= checkIn) {
      setError(t.errors.invalid_dates);
      return;
    }
    setError(null);
    void navigate({ to: "/book", search: { checkIn, checkOut, guests } });
  }

  useEffect(() => {
    const node = film.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) node.pause();
  }, []);

  return (
    <main id="main">
      <section className="hero-film">
        <video
          ref={film}
          autoPlay
          muted
          loop
          playsInline
          poster="/media/poster.jpg"
          src="/media/hero.mp4"
          aria-hidden="true"
        />
        <div className="hero-veil" />
        <div className="wrap hero-copy">
          <p className="eyebrow">{t.heroKicker}</p>
          <h1>{t.heroTitle}</h1>
          <p className="lede">{t.heroBody}</p>
          <div className="hero-actions">
            <a className="btn btn-light" href="#reserve">
              {t.reserve}
            </a>
            <Link to="/rooms" className="btn btn-light">
              {t.explore}
            </Link>
          </div>
        </div>
      </section>
      {announcement ? <p className="wrap banner">{announcement}</p> : null}
      <form id="reserve" className="wrap book-band book-float" onSubmit={search}>
        <DateField label={t.checkIn} value={checkIn} onChange={setCheckIn} min={data.today} required />
        <DateField label={t.checkOut} value={checkOut} onChange={setCheckOut} min={addDays(checkIn || data.today, 1)} required />
        <label className="field">
          {t.guests}
          <input type="number" min={1} max={8} value={guests} suppressHydrationWarning onChange={(event) => setGuests(Number(event.target.value))} />
        </label>
        <button className="btn btn-primary" type="submit">
          {t.search}
        </button>
      </form>
      {error ? (
        <p className="wrap danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="wrap">
        <section className="chapter split">
          <div>
            <h2>{t.introTitle}</h2>
            <p className="muted">
              {showNumber(data.roomCount, locale)} {t.rooms40}
              {phone ? ` · ${phone}` : ""}
            </p>
          </div>
          <div className="prose">
            {about ? <p>{about}</p> : null}
            {lobby ? <p>{lobby}</p> : null}
          </div>
        </section>

        <section className="chapter">
          <h2>{t.experienceTitle}</h2>
          {highlights.length > 0 ? (
            <div className="highlight-row">
              {highlights.map((item) => (
                <span key={item.name_en}>{loc(locale, item.name_en, item.name_fa)}</span>
              ))}
            </div>
          ) : null}
          <p className="prose">{t.experienceBody}</p>
        </section>

        <section className="chapter">
          <div className="split">
            <h2>{t.roomsTitle}</h2>
            <p className="muted">{t.roomsLead}</p>
          </div>
          <RoomList data={data} />
        </section>

        <section className="chapter split">
          <h2>{t.diningTitle}</h2>
          <div className="prose">
            {breakfast ? <p>{loc(locale, breakfast.body_en, breakfast.body_fa)}</p> : null}
            <p>{t.diningCoffee}</p>
            <Link to="/dining" className="btn">
              {t.navDining}
            </Link>
          </div>
        </section>

        <section className="chapter">
          <div className="split">
            <h2>{t.gallery}</h2>
            <Link to="/gallery" className="btn">
              {t.navGallery}
            </Link>
          </div>
          <div className="gallery-strip">
            {galleryPhotos.slice(0, 8).map((item) => (
              <img key={item.src} src={item.src} alt={t.brand} />
            ))}
          </div>
        </section>

        {hasPin ? (
          <section className="chapter">
            <div className="split">
              <div>
                <h2>{t.placeTitle}</h2>
                <p>{address}</p>
                <p className="muted">{t.nearMuseum}</p>
              </div>
              <MapFrame lat={lat} lng={lng} title={t.mapTitle} />
            </div>
          </section>
        ) : null}

        <section className="chapter split">
          <h2>{t.finalTitle}</h2>
          <div className="prose">
            <p>{t.finalBody}</p>
            <a className="btn btn-primary" href="#reserve">
              {t.reserve}
            </a>
          </div>
        </section>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </main>
  );
}
