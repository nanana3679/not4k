// 판정 사례(텍스트 문법 또는 에디터 차트 JSON)를 실제 판정 엔진으로 돌려 PNG 한 장으로 저장한다.
// 문법·엔진 선택·비교 모드는 docs/agents/judgment-case-images.md를 따른다.
//
// 파서·러너·렌더러는 이 워크트리의 src/lab/judgmentCase를, 판정 엔진은 --engine 저장소의
// compileJudgmentChart·NoteJudgmentSession·validateChart를 Vite ssrLoadModule로 불러온다(저장소마다 서버 하나).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localRoot = path.resolve(__dirname, '..');
const BACKGROUND = '#11121b';
/** PNG 폭이 대략 이 값이 되도록 deviceScaleFactor를 1~2 사이에서 고른다(휴대폰에서 읽히는 글자 크기). */
const TARGET_PNG_WIDTH = 1200;

const ENGINE_MODULES = {
  compileJudgmentChart: '/src/game/judgment/compiledJudgmentChart.ts',
  NoteJudgmentSession: '/src/game/judgment/NoteJudgmentSession.ts',
  validateChart: '/src/shared/validation/index.ts',
};

const servers = new Map();

async function moduleServer(root) {
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
  return servers.get(root);
}

function git(root, args) {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function engineLabel(root) {
  const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']) || '?';
  const sha = git(root, ['rev-parse', '--short', 'HEAD']) || '?';
  const dirty = git(root, ['status', '--porcelain', '--', 'src/game/judgment', 'src/shared']) !== '';
  return `${path.basename(root)} · ${branch} @${sha}${dirty ? ' (+커밋 안 된 수정)' : ''}`;
}

async function loadEngine(root) {
  for (const modulePath of Object.values(ENGINE_MODULES)) {
    if (!existsSync(path.join(root, modulePath))) throw new Error(`엔진 모듈이 없습니다: ${path.join(root, modulePath)}`);
  }
  const server = await moduleServer(root);
  const api = {};
  for (const [name, modulePath] of Object.entries(ENGINE_MODULES)) {
    const loaded = await server.ssrLoadModule(modulePath);
    if (!loaded[name]) throw new Error(`${root}${modulePath}에 ${name} export가 없습니다`);
    api[name] = loaded[name];
  }
  return { root, api, label: engineLabel(root) };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function screenshot(svg, width, height, out) {
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

function summary(panel) {
  const { run } = panel;
  const counts = `Perfect ${run.counts.perfect} · Great ${run.counts.great} · Good ${run.counts.good}${run.counts.goodTrill ? ` · Good◇ ${run.counts.goodTrill}` : ''} · Miss ${run.counts.miss}`;
  const extras = [
    `달성률 ${run.achievementRate.toFixed(2)}%`,
    run.isFullCombo ? 'Full Combo' : 'Full Combo 아님',
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
    console.error(error.message);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(cli.JUDGMENT_CASE_CLI_USAGE);
    return;
  }

  const { judgmentCaseFromSource } = await local.ssrLoadModule('/src/lab/judgmentCase/chartCase.ts');
  const { runJudgmentCase } = await local.ssrLoadModule('/src/lab/judgmentCase/runJudgmentCase.ts');
  const { renderJudgmentCaseSvg } = await local.ssrLoadModule('/src/lab/judgmentCase/renderJudgmentCaseSvg.ts');

  const engineRoots = options.engines.length > 0 ? options.engines.map((root) => path.resolve(root)) : [localRoot];
  const engines = [];
  for (const root of engineRoots) engines.push(await loadEngine(root));

  const cases = [];
  for (const source of options.cases) {
    const text = source === '-' ? await readStdin() : await readFile(source, 'utf8');
    cases.push(judgmentCaseFromSource(text, { fallbackTitle: source === '-' ? '' : path.basename(source) }));
  }

  const panels = cases.flatMap((judgmentCase) => engines.map((engine) => ({
    judgmentCase,
    run: runJudgmentCase(judgmentCase, engine.api),
    engineLabel: engine.label,
    enginePath: engine.root,
  })));
  const { svg, width, height } = renderJudgmentCaseSvg(panels, options.scale === undefined ? {} : { pxPerMs: options.scale });
  const out = path.resolve(options.out);
  const { pngWidth, pngHeight } = await screenshot(svg, width, height, out);
  console.log(`${out} 저장 (${pngWidth}×${pngHeight}px, 패널 ${panels.length}개)`);
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
