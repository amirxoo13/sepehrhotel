import { createFileRoute, Link } from "@tanstack/react-router";
import { Crumb, useHotelBits } from "@/components/hotel/story";
import { getPublicHotel } from "@/lib/hotel/api";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/dining")({
  loader: () => getPublicHotel(),
  component: DiningPage,
});

function DiningPage() {
  const data = Route.useLoaderData();
  const { t, locale } = useI18n();
  const { policy } = useHotelBits(data);
  const breakfast = policy("breakfast");
  return (
    <main id="main" className="wrap pb-16">
      <section className="chapter prose">
        <Crumb items={[{ to: "/", label: t.navHome }, { label: t.navDining }]} />
        <h1>{t.diningTitle}</h1>
        {breakfast ? <p>{locale === "fa" ? breakfast.body_fa : breakfast.body_en}</p> : null}
        <p>{t.diningCoffee}</p>
        <p className="muted">{t.noStay}</p>
        <Link to="/stay" className="btn btn-primary">
          {t.services}
        </Link>
      </section>
    </main>
  );
}
