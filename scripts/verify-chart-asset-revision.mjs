import { pathToFileURL } from "node:url";

export function buildChartRevisionProbeConfig(env) {
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Vercel release gate: Supabase URL/key environment variables are required");
  }
  return {
    url: `${url.replace(/\/$/, "")}/rest/v1/rpc/chart_asset_revision_readiness`,
    key,
  };
}

export function assertChartRevisionProbeSucceeded(status, body) {
  if (status < 200 || status >= 300) {
    throw new Error(
      `Vercel release gate: chart asset readiness RPC failed (HTTP ${status}: ${body.slice(0, 200)})`,
    );
  }
  let readiness;
  try {
    readiness = JSON.parse(body);
  } catch {
    throw new Error("Vercel release gate: chart asset readiness RPC returned invalid JSON");
  }
  if (readiness?.schema_ready !== true) {
    throw new Error(
      "Vercel release gate: chart asset column/trigger/release-state migration is incomplete",
    );
  }
  return readiness;
}

export async function verifyChartAssetRevisionSchema(env = process.env, fetcher = fetch) {
  if (env.VERCEL !== "1") return;
  const config = buildChartRevisionProbeConfig(env);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(config.url, {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: controller.signal,
    });
    const body = await response.text();
    return assertChartRevisionProbeSucceeded(response.status, body);
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  await verifyChartAssetRevisionSchema();
  if (process.env.VERCEL === "1") {
    console.log("[release-gate] chart asset schema/trigger/release state verified");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
