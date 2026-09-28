import { createFileRoute, Link } from "@tanstack/react-router";
import { Crumb, useHotelBits } from "@/components/hotel/story";
import { getPublicHotel } from "@/lib/hotel/api";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/contact")({
  loader: () => getPublicHotel(),
  component: ContactPage,
});

function ContactPage() {
  const data = Route.useLoaderData();
  const { t, locale } = useI18n();
  const { setting, fact } = useHotelBits(data);
  const address = setting(locale === "fa" ? "address_fa" : "address_en");
  const phone = fact("phone");
  return (
    <main id="main" className="wrap pb-16">
      <section className="chapter prose">
        <Crumb items={[{ to: "/", label: t.navHome }, { label: t.navContact }]} />
        <h1>{t.navContact}</h1>
        <p>
          <span className="muted">{t.addressLabel}</span>
          <br />
          {address}
        </p>
        <p>
          <span className="muted">{t.phoneLabel}</span>
          <br />
          <a href="tel:+982122245050">{phone}</a>
        </p>
        <p>{t.noPublicEmail}</p>
        <p>
          <a href="http://melalgroup.com/index.php/sepehr-apartment-hotel/">{t.groupPage}</a>
        </p>
        <Link to="/location" className="btn">
          {t.navPlace}
        </Link>
      </section>
    </main>
  );
}
