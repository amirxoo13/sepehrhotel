import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const { health } = await import("@/lib/hotel/service.server");
        const body = await health();
        return Response.json(body, { status: body.ok ? 200 : 503 });
      },
    },
  },
});
