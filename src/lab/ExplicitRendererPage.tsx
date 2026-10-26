import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Application, Container, Graphics } from "pixi.js";
import { ExplicitSkinLoader } from "../game/skin/ExplicitSkinLoader";
import { ExplicitNoteRenderer } from "../game/renderer/ExplicitNoteRenderer";
import { ExplicitSessionRendererAdapter } from "../game/judgment/ExplicitSessionRendererAdapter";
import type { ExplicitJudgmentEffect } from "../game/judgment/ExplicitJudgmentState";
import { advanceExplicitPreviewSession, createExplicitPreviewSession, explicitPreviewChart, explicitPreviewPresets,
  explicitPreviewReplayChart, explicitPreviewSnapshot } from "./explicitRendererPreview";
import type { ExplicitPreviewPreset } from "./explicitRendererPreview";
import "./ExplicitRendererPage.css";

interface PreviewOptions { mode: "fixture" | "session"; preset: ExplicitPreviewPreset; atMs: number; lift: number; reset: number }
interface PreviewController { draw(options: PreviewOptions): void; reattach(): void }
const layout = { judgmentLineY: 426, laneAreaX: 38, height: 600, scrollSpeed: 150, laneWidth: 106, noteHeight: 20 };

export default function ExplicitRendererPage() {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<PreviewController | null>(null);
  const [options, setOptions] = useState<PreviewOptions>({ mode: "fixture", preset: "mixed", atMs: 1500, lift: 0, reset: 0 });
  const latest = useRef(options);
  const [resolution, setResolution] = useState<1 | 2>(1);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState("에셋 준비 중");
  const [diagnostics, setDiagnostics] = useState("");
  const [effects, setEffects] = useState<readonly ExplicitJudgmentEffect[]>([]);
  useEffect(() => { latest.current = options; controller.current?.draw(options); }, [options]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setOptions(previous => ({ ...previous, atMs: Math.min(8000, previous.atMs + 25) })), 25);
    return () => window.clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    let cancelled = false;
    let initialized = false;
    const app = new Application();
    const loader = new ExplicitSkinLoader();
    let renderer: ExplicitNoteRenderer | null = null;
    let adapter: ExplicitSessionRendererAdapter | null = null;
    const start = async () => {
      await import("pixi.js/unsafe-eval");
      if (cancelled) return;
      await app.init({ width: 500, height: 600, background: 0x101520, antialias: true, preference: "webgl" });
      initialized = true;
      if (cancelled) { app.destroy(true, { children: true }); return; }
      app.ticker.stop();
      await loader.load({ resolution });
      if (cancelled) return;
      host.current?.appendChild(app.canvas);
      const backdrop = new Graphics();
      app.stage.addChild(backdrop);
      const notes = new Container();
      app.stage.addChild(notes);
      renderer = new ExplicitNoteRenderer(notes, loader, layout);
      let mode: PreviewOptions["mode"] | null = null;
      let session = createExplicitPreviewSession();
      let nextBatch = 0;
      let lastAt = -Infinity;
      let lastReset = -1;
      const sink = { applyConfirmedEffects: (confirmed: readonly ExplicitJudgmentEffect[]) => setEffects(previous => [...previous, ...confirmed]) };
      const draw = (current: PreviewOptions) => {
        const currentLayout = { ...layout, judgmentLineY: 426 * (100 - current.lift) / 100 };
        const resetSession = mode !== current.mode || current.atMs < lastAt || current.reset !== lastReset;
        if (mode !== current.mode) renderer!.setChart(current.mode === "fixture" ? explicitPreviewChart : explicitPreviewReplayChart);
        mode = current.mode;
        if (resetSession) {
          adapter?.dispose(); session = createExplicitPreviewSession(); nextBatch = 0;
          adapter = new ExplicitSessionRendererAdapter(session, sink); setEffects([]);
          if (mode === "session") adapter.attach(renderer!, current.atMs);
        }
        renderer!.resize(currentLayout);
        backdrop.clear();
        for (let lane = 0; lane < 4; lane++) backdrop.rect(layout.laneAreaX + lane * 106, 0, 106, 600).fill(lane % 2 ? 0x202838 : 0x182030);
        backdrop.rect(layout.laneAreaX, currentLayout.judgmentLineY - 1, 424, 2).fill(0xffffff);
        if (mode === "fixture") renderer!.render(explicitPreviewSnapshot(current.preset, current.atMs), current.atMs);
        else { nextBatch = advanceExplicitPreviewSession(session, current.atMs, nextBatch); adapter!.sync(current.atMs); }
        lastAt = current.atMs; lastReset = current.reset;
        const sprites = renderer!.root.children.flatMap(layer => (layer as Container).children.map(sprite => ({
          key: sprite.label, layer: layer.label, x: sprite.x, y: sprite.y, width: sprite.width, height: sprite.height, alpha: sprite.alpha,
        })));
        setDiagnostics(JSON.stringify({ mode, atMs: current.atMs, pool: renderer!.pooledSpriteCount, sprites }, null, 2));
        app.renderer.render(app.stage);
      };
      controller.current = { draw, reattach: () => {
        adapter?.attach(null); renderer!.dispose();
        renderer = new ExplicitNoteRenderer(notes, loader, layout);
        renderer.setChart(mode === "fixture" ? explicitPreviewChart : explicitPreviewReplayChart);
        if (mode === "session") adapter!.attach(renderer, latest.current.atMs);
        draw(latest.current);
      } };
      draw(latest.current);
      setStatus("33개 역할 준비 완료");
    };
    void start().catch((error: unknown) => {
      if (!cancelled) setStatus(`표시 실패: ${error instanceof Error ? error.message : String(error)}`);
      loader.dispose();
    });
    return () => {
      cancelled = true; controller.current = null; adapter?.dispose(); renderer?.dispose(); loader.dispose();
      if (initialized) app.destroy(true, { children: true });
    };
  }, [resolution]);

  return <main className="explicit-renderer-page" data-lab-page="explicit-renderer">
    <Link to="/lab">← Lab</Link>
    <h1>명시 노트 표시</h1>
    <p>바디·릴리즈·유지 표식의 독립 수명과 부분 성공·실패를 비교합니다.</p>
    <div className="explicit-renderer-workbench">
      <div><div ref={host} className="explicit-renderer-stage" aria-label="명시 노트 Pixi 미리보기" />
        <p role="status">{status}</p>
        <div className="explicit-renderer-actions"><button onClick={() => setPlaying(value => !value)}>{playing ? "일시정지" : "재생"}</button>
          <button onClick={() => { setPlaying(false); setOptions(previous => ({ ...previous, atMs: 0, reset: previous.reset + 1 })); }}>처음으로</button>
          <button onClick={() => controller.current?.reattach()}>렌더러 재부착</button></div>
        <label>재생 위치 {options.atMs}ms<input aria-label="재생 위치" type="range" min="0" max="8000" step="5" value={options.atMs} onChange={event => setOptions(previous => ({ ...previous, atMs: Number(event.target.value) }))} /></label>
      </div>
      <aside>
        <label>상태 출처<select aria-label="상태 출처" value={options.mode} onChange={event => setOptions(previous => ({ ...previous, mode: event.target.value as PreviewOptions["mode"], atMs: 1000, reset: previous.reset + 1 }))}>
          <option value="fixture">공개 상태 fixture · double/trill 포함</option><option value="session">실제 M1 세션 · ENJ-05 회복</option></select></label>
        <p>{options.mode === "fixture" ? "직접 구성한 공개 snapshot입니다. double/trill 세션 실행 결과가 아닙니다." : "실제 compiler → M1 session 입력 재생입니다. 1490ms 뗌 → 1500ms 유지 보류 → 1505ms 회복 성공."}</p>
        <label>표시 상태<select aria-label="표시 상태" disabled={options.mode !== "fixture"} value={options.preset} onChange={event => setOptions(previous => ({ ...previous, preset: event.target.value as ExplicitPreviewPreset }))}>
          {Object.entries(explicitPreviewPresets).map(([value, entry]) => <option key={value} value={value}>{entry.label}</option>)}</select></label>
        <label>이미지 해상도<select aria-label="이미지 해상도" value={resolution} onChange={event => setResolution(Number(event.target.value) as 1 | 2)}><option value="1">1배</option><option value="2">2배 · 같은 논리 크기</option></select></label>
        <label>리프트 {options.lift}%<input aria-label="리프트" type="range" min="0" max="60" value={options.lift} onChange={event => setOptions(previous => ({ ...previous, lift: Number(event.target.value) }))} /></label>
        <p>실제 확정 효과 <output data-effect-count={effects.length}>{effects.length}개</output></p>
        <ul>{effects.filter(effect => effect.displayGrade !== null).slice(-6).map(effect => <li key={effect.sequence}>{effect.displayGrade === "perfect" ? "Perfect" : effect.displayGrade} · 레인 {effect.lane} · 타격 {effect.hitGrade ?? "없음"}</li>)}</ul>
        <details><summary>표시 진단</summary><pre data-explicit-diagnostics>{diagnostics}</pre></details>
      </aside>
    </div>
  </main>;
}
