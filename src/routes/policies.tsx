import { createFileRoute } from "@tanstack/react-router";
import { Crumb, useHotelBits } from "@/components/hotel/story";
import { getPublicHotel } from "@/lib/hotel/api";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/policies")({
  loader: () => getPublicHotel(),
  component: PoliciesPage,
});

function PoliciesPage() {
  const data = Route.useLoaderData();
  const { t, locale } = useI18n();
  const { policies } = useHotelBits(data);
  return (
    <main id="main" className="wrap pb-16">
      <section className="chapter">
        <Crumb items={[{ to: "/", label: t.navHome }, { label: t.navPolicies }]} />
        <h1 className="text-4xl">{t.usefulTitle}</h1>
        <div className="grid gap-6">
          {policies.map((policy) => (
            <article key={policy.code} className="prose">
              <h2>{locale === "fa" ? policy.title_fa : policy.title_en}</h2>
              <p>{locale === "fa" ? policy.body_fa : policy.body_en}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
