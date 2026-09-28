import { createFileRoute } from "@tanstack/react-router";
import { Crumb, MapFrame, useHotelBits } from "@/components/hotel/story";
import { getPublicHotel } from "@/lib/hotel/api";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/location")({
  loader: () => getPublicHotel(),
  component: LocationPage,
});

function LocationPage() {
  const data = Route.useLoaderData();
  const { t, locale } = useI18n();
  const { setting, fact } = useHotelBits(data);
  const lat = Number(setting("geo_lat"));
  const lng = Number(setting("geo_lng"));
  const address = setting(locale === "fa" ? "address_fa" : "address_en");
  return (
    <main id="main" className="wrap pb-16">
      <section className="chapter">
        <Crumb items={[{ to: "/", label: t.navHome }, { label: t.navPlace }]} />
        <h1 className="text-4xl">{t.placeTitle}</h1>
        <p className="prose">{address}</p>
        <p>{fact("phone")}</p>
        <p className="muted prose">{t.nearMuseum}</p>
        {Number.isFinite(lat) && Number.isFinite(lng) ? <MapFrame lat={lat} lng={lng} title={t.mapTitle} /> : null}
      </section>
    </main>
  );
}
