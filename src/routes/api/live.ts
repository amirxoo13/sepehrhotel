import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/live")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getSessionUser } = await import("@/lib/auth/verify.server");
        const { liveSince } = await import("@/lib/hotel/service.server");
        const header = request.headers.get("authorization");
        const token = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined;
        const user = await getSessionUser(token);
        if (!user) return new Response("Unauthorized", { status: 401 });
        let last = Number(new URL(request.url).searchParams.get("after") ?? "0");
        if (!Number.isFinite(last) || last < 0) last = 0;
        const encoder = new TextEncoder();
        let timer: ReturnType<typeof setInterval> | undefined;
        const stream = new ReadableStream({
          start(controller) {
            const tick = async () => {
              const rows = await liveSince(user.id, last);
              for (const row of rows as { id: number }[]) {
                last = Math.max(last, Number(row.id));
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(row)}\n\n`));
              }
            };
            void tick().catch(() => undefined);
            timer = setInterval(() => {
              void tick().catch(() => undefined);
            }, 2000);
            const stop = () => {
              if (timer) clearInterval(timer);
              try {
                controller.close();
              } catch {
                /* already closed */
              }
            };
            request.signal.addEventListener("abort", stop);
          },
          cancel() {
            if (timer) clearInterval(timer);
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
