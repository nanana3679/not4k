/**
 * Supabase 데이터 로컬 백업 스크립트
 *
 * 차트·곡 데이터의 유일한 사본이 Supabase에만 존재하는 상황을 없애기 위한
 * 다중화 1단계 (2026-07-06 곡 오삭제 사고 후속).
 *
 * 백업 대상:
 *   - DB 테이블: songs, charts (anon select 정책이 공개라 publishable key로 조회 가능)
 *   - Storage: assets 버킷의 songs/, tutorials/ 전체 파일 (차트 JSON, 음원, 자켓)
 *
 * play_records·profiles 등 사용자 데이터는 RLS 때문에 publishable key로는
 * 백업할 수 없다. 필요해지면 service_role key 주입 방식을 추가할 것.
 *
 * 사용법:
 *   pnpm backup                 # 풀 백업(음원·자켓 포함) → backups/<UTC타임스탬프>/
 *   pnpm backup --charts-only   # DB 덤프 + 차트 JSON만 (매일 자동 백업용, 수백 KB)
 *
 * 접속 정보는 .env.local에서 읽되, 환경변수(VITE_SUPABASE_URL,
 * VITE_SUPABASE_PUBLISHABLE_KEY)가 있으면 그것을 우선한다 (CI용).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const BUCKET = "assets";
const TABLES = ["songs", "charts"];
const STORAGE_ROOTS = ["songs", "tutorials"];
const CHARTS_ONLY = process.argv.includes("--charts-only");

async function loadEnv() {
  const env = {};
  try {
    const raw = await readFile(path.join(ROOT, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].trim();
    }
  } catch {
    // .env.local 없음 (CI) — 환경변수만 사용
  }
  const url = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY를 환경변수나 .env.local에서 찾지 못했습니다.");
  }
  return { url, key };
}

async function dumpTable(cfg, table, outDir) {
  const res = await fetch(`${cfg.url}/rest/v1/${table}?select=*`, {
    headers: { apikey: cfg.key },
  });
  if (!res.ok) throw new Error(`${table} 조회 실패: HTTP ${res.status}`);
  const rows = await res.json();
  await writeFile(path.join(outDir, `${table}.json`), JSON.stringify(rows, null, 2));
  return rows.length;
}

async function listStorage(cfg, prefix) {
  const res = await fetch(`${cfg.url}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: { apikey: cfg.key, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: 1000 }),
  });
  if (!res.ok) throw new Error(`storage list 실패 (${prefix}): HTTP ${res.status}`);
  return res.json();
}

/** 폴더(id=null 엔트리)는 재귀 진입, 파일은 경로 수집 */
async function collectFilePaths(cfg, prefix) {
  const entries = await listStorage(cfg, prefix);
  const files = [];
  for (const entry of entries) {
    const full = `${prefix}/${entry.name}`;
    if (entry.id === null) {
      files.push(...(await collectFilePaths(cfg, full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

async function downloadFile(cfg, storagePath, outDir) {
  const res = await fetch(`${cfg.url}/storage/v1/object/public/${BUCKET}/${storagePath}`);
  if (!res.ok) throw new Error(`다운로드 실패 (${storagePath}): HTTP ${res.status}`);
  const dest = path.join(outDir, "storage", storagePath);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const cfg = await loadEnv();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(ROOT, "backups", stamp);
  await mkdir(path.join(outDir, "db"), { recursive: true });

  for (const table of TABLES) {
    const count = await dumpTable(cfg, table, path.join(outDir, "db"));
    console.log(`db/${table}.json — ${count} rows`);
  }

  let paths = [];
  for (const root of STORAGE_ROOTS) {
    paths.push(...(await collectFilePaths(cfg, root)));
  }
  if (CHARTS_ONLY) {
    paths = paths.filter((p) => p.endsWith(".json"));
  }
  console.log(`storage 파일 ${paths.length}개 다운로드 중...${CHARTS_ONLY ? " (charts-only)" : ""}`);

  let done = 0;
  const CONCURRENCY = 8;
  for (let i = 0; i < paths.length; i += CONCURRENCY) {
    await Promise.all(
      paths.slice(i, i + CONCURRENCY).map(async (p) => {
        await downloadFile(cfg, p, outDir);
        done += 1;
      }),
    );
    process.stdout.write(`\r  ${done}/${paths.length}`);
  }
  console.log(`\n백업 완료: ${path.relative(ROOT, outDir)}`);
}

main().catch((err) => {
  console.error("백업 실패:", err.message);
  process.exit(1);
});
