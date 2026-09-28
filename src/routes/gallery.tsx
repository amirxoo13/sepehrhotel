import { createFileRoute } from "@tanstack/react-router";
import { Crumb, useHotelBits } from "@/components/hotel/story";
import { getPublicHotel } from "@/lib/hotel/api";
import { galleryPhotos } from "@/lib/hotel/photos";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/gallery")({
  loader: () => getPublicHotel(),
  component: GalleryPage,
});

function GalleryPage() {
  const data = Route.useLoaderData();
  const { t, locale } = useI18n();
  const { policy } = useHotelBits(data);
  const note = policy("photos");
  return (
    <main id="main" className="wrap pb-16">
      <section className="chapter">
        <Crumb items={[{ to: "/", label: t.navHome }, { label: t.navGallery }]} />
        <h1 className="text-4xl">{t.gallery}</h1>
        {note ? <p className="prose muted">{locale === "fa" ? note.body_fa : note.body_en}</p> : null}
        <div className="gallery-grid">
          {galleryPhotos.map((item) => (
            <img key={item.src} src={item.src} alt={t.brand} />
          ))}
        </div>
      </section>
    </main>
  );
}