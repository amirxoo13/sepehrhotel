import { createFileRoute } from "@tanstack/react-router";
import { Crumb, RoomList } from "@/components/hotel/story";
import { getPublicHotel } from "@/lib/hotel/api";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/rooms")({
  loader: () => getPublicHotel(),
  component: RoomsPage,
});

function RoomsPage() {
  const data = Route.useLoaderData();
  const { t } = useI18n();
  return (
    <main id="main" className="wrap pb-16">
      <section className="chapter">
        <Crumb items={[{ to: "/", label: t.navHome }, { label: t.navStay }]} />
        <h1 className="text-4xl">{t.roomsTitle}</h1>
        <p className="prose muted">{t.roomsLead}</p>
        <p className="muted text-sm">{t.provisional}</p>
        <RoomList data={data} />
      </section>
    </main>
  );
}
