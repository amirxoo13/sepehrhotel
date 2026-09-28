import { createFileRoute, Link } from "@tanstack/react-router";
import { Crumb, Offerings, useHotelBits } from "@/components/hotel/story";
import { getPublicHotel } from "@/lib/hotel/api";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/hotel")({
  loader: () => getPublicHotel(),
  component: HotelPage,
});

function HotelPage() {
  const data = Route.useLoaderData();
  const { t } = useI18n();
  const { fact } = useHotelBits(data);
  return (
    <main id="main" className="wrap pb-16">
      <section className="chapter prose">
        <Crumb items={[{ to: "/", label: t.navHome }, { label: t.navHotel }]} />
        <h1>{t.introTitle}</h1>
        <p>{fact("about")}</p>
        <h2>{t.experienceTitle}</h2>
        <p>{fact("lobby")}</p>
        <p>{t.experienceBody}</p>
      </section>
      <Offerings data={data} />
      <p>
        <Link to="/rooms" className="btn">
          {t.explore}
        </Link>
      </p>
    </main>
  );
}