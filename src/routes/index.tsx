import { createFileRoute } from "@tanstack/react-router";
import { HomeStory } from "@/components/hotel/story";
import { getPublicHotel } from "@/lib/hotel/api";

export const Route = createFileRoute("/")({
  loader: () => getPublicHotel(),
  component: function Home() {
    return <HomeStory data={Route.useLoaderData()} />;
  },
});
