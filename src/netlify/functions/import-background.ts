import { prisma } from "../../lib/db";
import { runImportBatch } from "../../lib/import-runner";

/**
 * The `-background` suffix in this filename is what makes Netlify run it
 * asynchronously: it returns 202 immediately, may run for up to 15 minutes, and
 * cannot stream.
 *
 * Netlify retries a failed background function after 1 minute and again after
 * 2. runImportBatch is idempotent precisely because of that — it only processes
 * rows still PENDING, and writes with skipDuplicates against the composite
 * unique on Transaction.
 */
export default async function handler(request: Request): Promise<Response> {
  let batchId: string | undefined;

  try {
    const body = (await request.json()) as { batchId?: string };
    batchId = body.batchId;
  } catch {
    return new Response("Send a JSON body with a batchId.", { status: 400 });
  }

  if (!batchId) return new Response("batchId is required.", { status: 400 });

  try {
    const result = await runImportBatch(batchId);
    console.log(
      `[import-background] ${batchId}: ${result.state}, ${result.processed} processed, ${result.failed} failed`,
    );
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error(`[import-background] ${batchId} failed`, error);
    await prisma.importBatch
      .update({
        where: { id: batchId },
        data: {
          state: "FAILED",
          error: error instanceof Error ? error.message.slice(0, 400) : "Import failed.",
        },
      })
      .catch(() => undefined);

    // A non-2xx is what tells Netlify to retry. The retry is safe.
    return new Response("Import failed.", { status: 500 });
  }
}

// No `config.path` here on purpose. This function is already served at
// /.netlify/functions/import-background from its filename, and `path` declares a
// *custom* route — pointing one at the reserved /.netlify/ prefix duplicated the
// built-in endpoint for no gain. Bundling it both ways confirmed the
// -background suffix alone still yields invocationMode "background".
