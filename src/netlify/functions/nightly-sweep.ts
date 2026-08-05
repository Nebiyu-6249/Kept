import type { Config } from "@netlify/functions";
import { runNightlySweep } from "../../lib/sweep";

/**
 * Scheduled at 20:00 UTC (midnight in Asia/Dubai) by netlify.toml.
 *
 * Scheduled functions cap at 30s and receive no payload. runNightlySweep keeps
 * a 20s budget and reports `ranOutOfTime` when it stops early, so the remainder
 * is picked up on the next run rather than being silently dropped.
 */
export default async function handler(): Promise<Response> {
  try {
    const result = await runNightlySweep();
    console.log(
      `[nightly-sweep] ${result.ms}ms: ${result.expiredIntents} intents expired, ` +
        `${result.reviewsCreated} reviews created, ${result.billsDetected} bills detected` +
        `${result.ranOutOfTime ? " (stopped early, remainder next run)" : ""}`,
    );
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("[nightly-sweep] failed", error);
    return new Response("Sweep failed.", { status: 500 });
  }
}

export const config: Config = {
  schedule: "0 20 * * *",
};
