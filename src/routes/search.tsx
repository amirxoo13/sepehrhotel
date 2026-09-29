import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { Crumb } from "@/components/hotel/story";
import { getPublicHotel } from "@/lib/hotel/api";
import { useI18n } from "@/lib/i18n";

/**
 * Target of the home page's search box (`?s=`, the field name the old
 * WordPress form used). Searches what the public site publishes from the
 * database: room types, facilities/services and hotel policies.
 */
export const Route = createFileRoute("/search")({
  validateSearch: z.object({ s: z.string().max(200).catch("") }),
  loader: () => getPublicHotel(),
  component: SearchPage,
});

type Hotel = Awaited<ReturnType<typeof getPublicHotel>>;

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .trim();
}

function matches(query: string, ...fields: unknown[]) {
  return fields.some((field) => normalize(field).includes(query));
}

function SearchPage() {
  const data = Route.useLoaderData() as Hotel;
  const { s } = Route.useSearch();
  const { t, locale } = useI18n();
  const query = normalize(s);
  const fa = locale === "fa";

  const types = (data.types as { code: string; name_en: string; name_fa: string; description_en: string | null; description_fa: string | null }[]).filter(
    (type) => query && matches(query, type.name_en, type.name_fa, type.description_en, type.description_fa),
  );
  const offerings = (data.offerings as { scope: string; name_en: string; name_fa: string; offered: boolean }[]).filter(
    (item) => query && item.offered && matches(query, item.name_en, item.name_fa),
  );
  const policies = (data.policies as { code: string; title_en: string; title_fa: string; body_en: string; body_fa: string }[]).filter(
    (policy) => query && matches(query, policy.title_en, policy.title_fa, policy.body_en, policy.body_fa),
  );
  const total = types.length + offerings.length + policies.length;

  return (
    <main id="main" className="wrap pb-16">
      <section className="chapter">
        <Crumb items={[{ to: "/", label: t.navHome }, { label: t.searchTitle }]} />
        <h1 className="text-4xl">{t.searchTitle}</h1>
        <form method="get" action="/search" className="field max-w-md">
          <label htmlFor="search-field">{t.searchTitle}</label>
          <input id="search-field" type="search" name="s" defaultValue={s} maxLength={200} />
        </form>
        {query ? (
          <p className="muted">
            {t.searchFor} «{s}»: {total}
          </p>
        ) : null}
        {query && total === 0 ? <p>{t.searchNone}</p> : null}
        {types.length ? (
          <section className="grid gap-3">
            <h2 className="text-2xl">{t.searchRooms}</h2>
            <ul className="grid gap-2">
              {types.map((type) => (
                <li key={type.code} className="card">
                  <Link to="/rooms">{fa ? type.name_fa : type.name_en}</Link>
                  <p className="muted text-sm">{fa ? type.description_fa : type.description_en}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {offerings.length ? (
          <section className="grid gap-3">
            <h2 className="text-2xl">{t.searchOfferings}</h2>
            <ul className="grid gap-2">
              {offerings.map((item) => (
                <li key={`${item.scope}-${item.name_en}`} className="card">
                  <Link to="/hotel">{fa ? item.name_fa : item.name_en}</Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {policies.length ? (
          <section className="grid gap-3">
            <h2 className="text-2xl">{t.searchPolicies}</h2>
            <ul className="grid gap-2">
              {policies.map((policy) => (
                <li key={policy.code} className="card">
                  <Link to="/policies">{fa ? policy.title_fa : policy.title_en}</Link>
                  <p className="muted text-sm">{fa ? policy.body_fa : policy.body_en}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </section>
    </main>
  );
}
