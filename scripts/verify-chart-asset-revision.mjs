import { pathToFileURL } from "node:url";

export function buildChartRevisionProbeConfig(env) {
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Vercel release gate: Supabase URL/key environment variables are required");
  }
  return {
    url: `${url.replace(/\/$/, "")}/rest/v1/charts?select=asset_revision&limit=1`,
    key,
  };
}

export function assertChartRevisionProbeSucceeded(status, body) {
  if (status < 200 || status >= 300) {
    throw new Error(
      `Vercel release gate: charts.asset_revision is not queryable (HTTP ${status}: ${body.slice(0, 200)})`,
    );
  }
}

export async function verifyChartAssetRevisionSchema(env = process.env, fetcher = fetch) {
  if (env.VERCEL !== "1") return;
  const config = buildChartRevisionProbeConfig(env);
  const response = await fetcher(config.url, {
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
    },
  });
  const body = await response.text();
  assertChartRevisionProbeSucceeded(response.status, body);
}

async function main() {
  await verifyChartAssetRevisionSchema();
  if (process.env.VERCEL === "1") {
    console.log("[release-gate] charts.asset_revision verified");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
