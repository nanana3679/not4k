// 실제 엔진 판정 사례 또는 --design 수동 설계 JSON을 PNG로 저장한다.
// 문법·엔진 선택·비교 모드는 docs/agents/judgment-case-images.md를 따른다.
//
// 파서·러너·렌더러는 이 워크트리의 src/lab/judgmentCase를, 판정 엔진은 --engine 저장소의
// compileJudgmentChart·NoteJudgmentSession·validateChart를 Vite ssrLoadModule로 불러온다(저장소마다 서버 하나).
// --explicit은 같은 저장소 선택으로 compileExplicitJudgmentChart·ExplicitJudgmentSession·문서 검증·엔진 기본값을 읽는다.
// 노트는 이 워크트리의 게임 스킨 매니페스트(--skin)가 가리키는 public/skins PNG를 data URI로 넣어 그린다.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localRoot = path.resolve(__dirname, '..');
// pnpm은 스크립트를 패키지 루트에서 돌리고 명령을 친 디렉터리를 INIT_CWD로 넘긴다. 상대 경로는 그 디렉터리 기준이다.
const invokedFrom = process.env.INIT_CWD ?? process.cwd();
const resolveArg = (target: string) => path.resolve(invokedFrom, target);
const BACKGROUND = '#11121b';
/** PNG 폭이 대략 이 값이 되도록 deviceScaleFactor를 1~2 사이에서 고른다(휴대폰에서 읽히는 글자 크기). */
const TARGET_PNG_WIDTH = 1200;

const ENGINE_MODULES = {
  compileJudgmentChart: '/src/game/judgment/compiledJudgmentChart.ts',
  NoteJudgmentSession: '/src/game/judgment/NoteJudgmentSession.ts',
  validateChart: '/src/shared/validation/index.ts',
};
const EXPLICIT_ENGINE_MODULES = {
  compileExplicitJudgmentChart: '/src/game/judgment/explicitCompiledChart.ts',
  ExplicitJudgmentSession: '/src/game/judgment/ExplicitJudgmentSession.ts',
  validateChartDocument: '/src/shared/validation/documentValidation.ts',
  JUDGMENT_WINDOWS: '/src/shared/constants/judgment.ts',
  MAINTENANCE_GRACE_MS: '/src/shared/constants/judgment.ts',
};

const servers = new Map<string, ViteDevServer>();

interface LoadedEngine {
  root: string;
  api: Record<string, unknown>;
  label: string;
}

async function moduleServer(root: string) {
  if (!servers.has(root)) {
    servers.set(root, await createServer({
      root,
      configFile: false,
      logLevel: 'error',
      appType: 'custom',
      // 워크트리끼리 node_modules를 공유해도 캐시는 이 워크트리 안에 분리한다.
      cacheDir: path.join(localRoot, '.vite', 'judgment-case-image', path.basename(root)),
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
    }));
  }
  return servers.get(root)!;
}

function git(root: string, args: string[]) {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function engineLabel(root: string) {
  const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']) || '?';
  const sha = git(root, ['rev-parse', '--short', 'HEAD']) || '?';
  const dirty = git(root, ['status', '--porcelain', '--', 'src/game/judgment', 'src/game/scoring', 'src/shared']) !== '';
  return `${path.basename(root)} · ${branch} @${sha}${dirty ? ' (+커밋 안 된 수정)' : ''}`;
}

async function loadEngine(root: string, explicit = false): Promise<LoadedEngine> {
  const modules = explicit ? EXPLICIT_ENGINE_MODULES : ENGINE_MODULES;
  for (const modulePath of Object.values(modules)) {
    if (!existsSync(path.join(root, modulePath))) throw new Error(`${explicit ? 'explicit 실행을 지원하지 않는 엔진입니다. ' : ''}엔진 모듈이 없습니다: ${path.join(root, modulePath)}`);
  }
  const server = await moduleServer(root);
  const api: Record<string, unknown> = {};
  for (const [name, modulePath] of Object.entries(modules)) {
    const loaded = await server.ssrLoadModule(modulePath);
    if (loaded[name] === undefined) throw new Error(`${root}${modulePath}에 ${name} export가 없습니다`);
    api[name] = loaded[name];
  }
  return { root, api, label: engineLabel(root) };
}

async function loadExplicitSkin(local: ViteDevServer) {
  const { explicitCaseSkinAssetPaths, createExplicitCaseSkin } = await local.ssrLoadModule('/src/lab/judgmentCase/explicitCaseSkin.ts');
  const { readPngSize } = await local.ssrLoadModule('/src/lab/judgmentCase/judgmentCaseSkin.ts');
  const images: Record<string, unknown> = {};
  for (const [id, assetPath] of Object.entries(explicitCaseSkinAssetPaths())) {
    const file = path.join(localRoot, 'public', (assetPath as string).replace(/^\/+/, ''));
    try {
      const bytes = await readFile(file);
      images[id] = { href: `data:image/png;base64,${bytes.toString('base64')}`, ...readPngSize(bytes) };
    } catch (error) {
      throw new Error(`classic-explicit 에셋 ${id} (${file}): ${error instanceof Error ? error.message : error}`, { cause: error });
    }
  }
  return createExplicitCaseSkin(images);
}

/** --skin 매니페스트에서 판정 전(대기) 에셋 경로를 골라 public/ 아래 PNG를 data URI로 읽는다 */
async function loadSkin(local: ViteDevServer, skinId: string) {
  const { getSkinManifest } = await local.ssrLoadModule('/src/game/skin/skins.ts');
  const { judgmentCaseSkinAssetPaths, createJudgmentCaseSkin, readPngSize } = await local.ssrLoadModule('/src/lab/judgmentCase/judgmentCaseSkin.ts');
  const manifest = getSkinManifest(skinId);
  const images: Record<string, unknown> = {};
  for (const [key, assetPath] of Object.entries(judgmentCaseSkinAssetPaths(manifest))) {
    const file = path.join(localRoot, 'public', (assetPath as string).replace(/^\/+/, ''));
    try {
      const bytes = await readFile(file);
      images[key] = { href: `data:image/png;base64,${bytes.toString('base64')}`, ...readPngSize(bytes) };
    } catch (error) {
      // readPngSize 오류에는 파일 경로가 없으므로 어느 스킨·에셋 키·파일인지 붙인다.
      throw new Error(`스킨 "${skinId}" 에셋 ${key} (${file}): ${error instanceof Error ? error.message : error}`, { cause: error });
    }
  }
  return createJudgmentCaseSkin(manifest, images);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function screenshot(svg: string, width: number, height: number, out: string) {
  const deviceScaleFactor = Math.min(2, Math.max(1, TARGET_PNG_WIDTH / width));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:${BACKGROUND}}svg{display:block}</style></head><body>${svg}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await mkdir(path.dirname(out), { recursive: true });
    await page.locator('svg[data-judgment-case-sheet]').screenshot({ path: out, type: 'png' });
    return { pngWidth: Math.round(width * deviceScaleFactor), pngHeight: Math.round(height * deviceScaleFactor) };
  } finally {
    await browser.close();
  }
}

// 사례와 실행 결과는 ssrLoadModule로 불러온 모듈이 만들어 타입 정보가 없다(Vite가 모듈을 Record<string, any>로 돌려준다).
// src 타입을 import하면 scripts/ 검사(tsconfig.scripts.json)가 지울 수 없는 문법을 쓰는 src 모듈까지 읽으므로 필요한 모양만 적는다.
function summary(panel: { judgmentCase: { title: string }; run: any; engineLabel: string }) {
  const { run } = panel;
  const counts = `Perfect ${run.counts.perfect} · Great ${run.counts.great} · Good ${run.counts.good}${run.counts.goodTrill ? ` · Good◇ ${run.counts.goodTrill}` : ''} · Miss ${run.counts.miss}`;
  const extras = [
    `달성률 ${run.achievementRate.toFixed(2)}%`,
    !run.finalized ? '판정 불가(finalize 전)' : run.isFullCombo ? 'Full Combo' : 'Full Combo 아님',
    `미정산 ${run.unsettledItems.length}`,
    ...(run.validationErrors.length ? [`검증 오류 ${run.validationErrors.length}`] : []),
    ...(run.error ? [`엔진 예외: ${run.error.message}`] : []),
  ];
  return `[${panel.judgmentCase.title || '(제목 없음)'} | ${panel.engineLabel}] ${counts} · ${extras.join(' · ')}`;
}

async function main() {
  const local = await moduleServer(localRoot);
  const cli = await local.ssrLoadModule('/src/lab/judgmentCase/judgmentCaseCli.ts');
  let options;
  try {
    options = cli.parseJudgmentCaseCliArgs(process.argv.slice(2));
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(cli.JUDGMENT_CASE_CLI_USAGE);
    return;
  }

  if (options.design) {
    // 게임 엔진·차트 변환 전에 분기한다. 기존 스킨을 쓰되 판정 설명은 전부 수동 지정이다.
    const { parseJudgmentCaseDesign, summarizeJudgmentCaseDesign } = await local.ssrLoadModule('/src/lab/judgmentCase/judgmentCaseDesign.ts');
    const { renderJudgmentCaseDesignSvg } = await local.ssrLoadModule('/src/lab/judgmentCase/renderJudgmentCaseDesignSvg.ts');
    const skin = await loadSkin(local, options.skin);
    const designs = [];
    for (const source of options.cases) {
      const text = source === '-' ? await readStdin() : await readFile(resolveArg(source), 'utf8');
      try {
        designs.push(parseJudgmentCaseDesign(text, source === '-' ? '' : path.basename(source)));
      } catch (error) {
        throw new Error(`${source === '-' ? '표준 입력' : source}: ${error instanceof Error ? error.message : error}`);
      }
    }
    const { svg, width, height } = renderJudgmentCaseDesignSvg(designs, { skin, pxPerMs: options.scale });
    const out = resolveArg(options.out);
    const { pngWidth, pngHeight } = await screenshot(svg, width, height, out);
    console.log(`${out} 저장 (${pngWidth}×${pngHeight}px, 설계 패널 ${designs.length}개, 스킨 ${skin.name}, 엔진 미실행)`);
    for (const design of designs) console.log(summarizeJudgmentCaseDesign(design));
    return;
  }

  if (options.explicit) {
    const { explicitCaseFromSource } = await local.ssrLoadModule('/src/lab/judgmentCase/explicitChartCase.ts');
    const { runExplicitJudgmentCase, summarizeExplicitCase } = await local.ssrLoadModule('/src/lab/judgmentCase/runExplicitJudgmentCase.ts');
    const { renderExplicitJudgmentCaseSvg } = await local.ssrLoadModule('/src/lab/judgmentCase/renderExplicitJudgmentCaseSvg.ts');
    const skin = await loadExplicitSkin(local);
    const engines: LoadedEngine[] = [];
    for (const root of options.engines.length > 0 ? options.engines.map(resolveArg) : [localRoot]) engines.push(await loadEngine(root, true));
    const cases = [];
    for (const source of options.cases) {
      const sourceText = source === '-' ? await readStdin() : await readFile(resolveArg(source), 'utf8');
      try { cases.push(explicitCaseFromSource(sourceText, source === '-' ? '' : path.basename(source))); }
      catch (error) { throw new Error(`${source === '-' ? '표준 입력' : source}: ${error instanceof Error ? error.message : error}`); }
    }
    const panels = cases.flatMap(judgmentCase => engines.map(engine => ({ judgmentCase,
      run: runExplicitJudgmentCase(judgmentCase, engine.api), engineLabel: engine.label, enginePath: engine.root })));
    const { svg, width, height } = renderExplicitJudgmentCaseSvg(panels, { skin, ...(options.scale === undefined ? {} : { pxPerMs: options.scale }) });
    const out = resolveArg(options.out);
    const { pngWidth, pngHeight } = await screenshot(svg, width, height, out);
    console.log(`${out} 저장 (${pngWidth}×${pngHeight}px, 패널 ${panels.length}개, 스킨 ${skin.name}, explicit 실제 세션 ${panels.filter(panel => panel.run.result !== null).length}개)`);
    for (const panel of panels) {
      console.log(summarizeExplicitCase(panel.judgmentCase, panel.run, panel.engineLabel));
      if (panel.run.error || !panel.run.finalized) process.exitCode = 1;
    }
    return;
  }

  const { judgmentCaseFromSource } = await local.ssrLoadModule('/src/lab/judgmentCase/chartCase.ts');
  const { runJudgmentCase } = await local.ssrLoadModule('/src/lab/judgmentCase/runJudgmentCase.ts');
  const { renderJudgmentCaseSvg } = await local.ssrLoadModule('/src/lab/judgmentCase/renderJudgmentCaseSvg.ts');
  const skin = await loadSkin(local, options.skin);

  const engineRoots = options.engines.length > 0 ? options.engines.map(resolveArg) : [localRoot];
  const engines: LoadedEngine[] = [];
  for (const root of engineRoots) engines.push(await loadEngine(root));

  const cases = [];
  for (const source of options.cases) {
    const text = source === '-' ? await readStdin() : await readFile(resolveArg(source), 'utf8');
    try {
      cases.push(judgmentCaseFromSource(text, { fallbackTitle: source === '-' ? '' : path.basename(source) }));
    } catch (error) {
      // 사례가 여럿이면 어느 사례의 문법 오류인지 알 수 있게 출처를 앞에 붙인다.
      throw new Error(`${source === '-' ? '표준 입력' : source}: ${error instanceof Error ? error.message : error}`);
    }
  }

  const panels = cases.flatMap((judgmentCase) => engines.map((engine) => ({
    judgmentCase,
    run: runJudgmentCase(judgmentCase, engine.api),
    engineLabel: engine.label,
    enginePath: engine.root,
  })));
  const { svg, width, height } = renderJudgmentCaseSvg(panels, { skin, ...(options.scale === undefined ? {} : { pxPerMs: options.scale }) });
  const out = resolveArg(options.out);
  const { pngWidth, pngHeight } = await screenshot(svg, width, height, out);
  console.log(`${out} 저장 (${pngWidth}×${pngHeight}px, 패널 ${panels.length}개, 스킨 ${skin.name})`);
  for (const panel of panels) console.log(summary(panel));
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  for (const server of servers.values()) await server.close();
}
