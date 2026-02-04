import { z } from "zod";
import { getJob } from "@/lib/stats/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  jobId: z.string().min(1),
});

const querySchema = z.object({
  interval: z.coerce.number().int().min(1000).max(30000).optional(),
});

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = paramsSchema.parse(await context.params);
  const url = new URL(request.url);
  const query = querySchema.parse({
    interval: url.searchParams.get("interval") ?? undefined,
  });

  const intervalMs = query.interval ?? 5000;
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode("retry: 5000\n\n"));

      const send = async () => {
        if (closed) return;
        const job = await getJob(jobId);
        const payload = job ?? { status: "missing", id: jobId };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

        if (!job || job.status === "completed" || job.status === "failed") {
          controller.close();
          closed = true;
          return;
        }

        setTimeout(send, intervalMs);
      };

      void send();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
