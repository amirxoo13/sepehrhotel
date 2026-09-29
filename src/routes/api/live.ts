import { createFileRoute } from "@tanstack/react-router";
import { LIVE_HEARTBEAT_MS, LIVE_POLL_MS, streamShouldEnd } from "@/lib/hotel/live-plan";

/**
 * Server-sent events: new notifications for the signed-in user.
 *
 * Runs as a Vercel Function, which is terminated at its maximum duration, so a
 * stream ends itself after LIVE_STREAM_MAX_MS with an `end` event and the
 * client (`useLiveRefresh`) reconnects. Roles are resolved once per stream;
 * each poll is then a single query, and polls never overlap.
 */
export const Route = createFileRoute("/api/live")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getSessionUser } = await import("@/lib/auth/verify.server");
        const { liveRoles, liveSince } = await import("@/lib/hotel/service.server");
        const header = request.headers.get("authorization");
        const token = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined;
        const user = await getSessionUser(token);
        if (!user) return new Response("Unauthorized", { status: 401 });
        const roles: string[] = await liveRoles(user.id);
        let last = Number(new URL(request.url).searchParams.get("after") ?? "0");
        if (!Number.isFinite(last) || last < 0) last = 0;
        const encoder = new TextEncoder();
        const startedAt = Date.now();
        let poll: ReturnType<typeof setInterval> | undefined;
        let heartbeat: ReturnType<typeof setInterval> | undefined;
        let closed = false;
        let inFlight = false;
        const stream = new ReadableStream({
          start(controller) {
            const send = (text: string) => {
              if (closed) return;
              try {
                controller.enqueue(encoder.encode(text));
              } catch {
                stop();
              }
            };
            const stop = () => {
              if (closed) return;
              closed = true;
              if (poll) clearInterval(poll);
              if (heartbeat) clearInterval(heartbeat);
              try {
                controller.close();
              } catch {
                /* already closed */
              }
            };
            const tick = async () => {
              if (closed || inFlight) return;
              if (streamShouldEnd(startedAt, Date.now())) {
                send(`event: end\ndata: {"after":${last}}\n\n`);
                stop();
                return;
              }
              inFlight = true;
              try {
                const rows = (await liveSince(user.id, last, roles)) as { id: number }[];
                for (const row of rows) {
                  last = Math.max(last, Number(row.id));
                  send(`data: ${JSON.stringify(row)}\n\n`);
                }
              } catch {
                /* transient database error: try again on the next poll */
              } finally {
                inFlight = false;
              }
            };
            send("retry: 2000\n\n");
            void tick();
            poll = setInterval(() => void tick(), LIVE_POLL_MS);
            heartbeat = setInterval(() => send(": ping\n\n"), LIVE_HEARTBEAT_MS);
            request.signal.addEventListener("abort", stop);
          },
          cancel() {
            closed = true;
            if (poll) clearInterval(poll);
            if (heartbeat) clearInterval(heartbeat);
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
