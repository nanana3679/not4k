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
  if (readiness.revision_writes_enabled !== false) {
    throw new Error(
      "Vercel release gate: PR #157 is reader-first only; revision writer must remain disabled",
    );
  }
  return readiness;
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

export async function verifyChartAssetRevisionSchema(
  env = process.env,
  fetcher = fetch,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  if (env.VERCEL !== "1") return;
  const config = buildChartRevisionProbeConfig(env);
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let response;
    let body;
    try {
      response = await fetcher(config.url, {
        method: "POST",
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          "Content-Type": "application/json",
        },
        body: "{}",
        signal: controller.signal,
      });
      body = await response.text();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      await wait(250 * attempt);
      continue;
    } finally {
      clearTimeout(timeout);
    }
    if (isRetryableStatus(response.status) && attempt < maxAttempts) {
      await wait(250 * attempt);
      continue;
    }
    return assertChartRevisionProbeSucceeded(response.status, body);
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
