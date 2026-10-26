import { useEffect, useRef, useState } from 'react';
import type { ChartDocument } from '../../shared';
import { getJudgmentWindows } from '../../shared';
import { GameRenderer } from '../renderer/GameRenderer';
import { GAME_HEIGHT, liftPx } from '../renderer/constants';
import { SkinManager } from '../skin';
import { ExplicitSkinLoader } from '../skin/ExplicitSkinLoader';
import { ExplicitJudgmentEffectSink } from '../judgment/ExplicitJudgmentEffectSink';
import { compileExplicitJudgmentChart } from '../judgment/explicitCompiledChart';
import { useGameStore } from '../stores';
import { createExplicitTutorialPreviewSessionController } from './songSelect/explicitTutorialPreviewSession';
import type { ExplicitTutorialPreviewSessionController } from './songSelect/explicitTutorialPreviewSession';
import { ExplicitTutorialPlaybackLoop } from './ExplicitTutorialPlaybackLoop';

/** 새 저작 차트의 actual engine preview. 반복 경계는 G2 controller가 finalize한 뒤 새 session/presentation을 만든다. */
export function ExplicitTutorialPreview({ chart }: { chart: ChartDocument }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [reset, setReset] = useState(0);
  const [status, setStatus] = useState('준비 중');
  const [iteration, setIteration] = useState(0);
  const [settled, setSettled] = useState(0);
  const [repeat, setRepeat] = useState(true);
  const repeatRef = useRef(repeat);
  const playback = useRef<ExplicitTutorialPlaybackLoop | null>(null);
  useEffect(() => {
    if (!canvas.current) return;
    const target = canvas.current;
    const settings = useGameStore.getState().settings;
    let cancelled = false;
    let renderer: GameRenderer | null = null;
    let controller: ExplicitTutorialPreviewSessionController | null = null;
    const skin = new SkinManager();
    const explicit = new ExplicitSkinLoader();
    const release = () => {
      playback.current?.dispose(); playback.current = null;
      controller?.dispose(); controller = null;
      renderer?.dispose(false); renderer = null;
      explicit.dispose(); skin.dispose();
    };
    void (async () => {
      try {
        const compiled = compileExplicitJudgmentChart(chart);
        await Promise.all([skin.loadSkin('classic'), explicit.load({ resolution: 1 })]);
        if (cancelled) return;
        const view = new GameRenderer({ canvas: target, width: 800, height: GAME_HEIGHT, resolution: 1, skinManager: skin,
          showGear: false, gearMotion: false, showFlightBackground: false, showLaneKeyLabels: false, showComboAndAccuracy: false });
        renderer = view;
        await view.init();
        if (cancelled) { view.dispose(false); return; }
        view.scrollSpeed = settings.scrollSpeed;
        view.setLift(liftPx(settings.liftPercent));
        view.setShowFastSlow(settings.showFastSlow); view.setShowTimingDiff(settings.showTimingDiff);
        view.setPerfectWindow(getJudgmentWindows(settings.judgmentMode).PERFECT);
        controller = createExplicitTutorialPreviewSessionController(chart, { kind: 'auto' }, {
          windows: getJudgmentWindows(settings.judgmentMode),
          createPresentation(session) {
            view.resetTransientState();
            view.setExplicitChart(compiled, explicit, () => session.snapshot, chart, 4000);
            const sink = new ExplicitJudgmentEffectSink(view);
            return { applyConfirmedEffects: effects => sink.applyConfirmedEffects(effects), dispose: () => view.resetTransientState() };
          },
        });
        view.prepareForPlayback(0);
        const endAt = Math.max(4000, controller.session.latestJudgmentDeadlineMs + 1);
        const active = controller;
        const loop = new ExplicitTutorialPlaybackLoop(active, endAt, {
          render(local, delta) { setSettled(active.session.score.processedNotes); view.renderFrame(local, delta); },
          restarted(iteration) { setIteration(iteration); setSettled(0); setStatus('재생 중'); },
          completed() { setStatus('완료'); },
          failed(reason) { release(); setStatus(reason instanceof Error ? reason.message : String(reason)); },
        }, repeatRef.current);
        playback.current = loop;
        setStatus('재생 중'); setIteration(0); setSettled(0);
        loop.start();
      } catch (reason) { if (!cancelled) { release(); setStatus(reason instanceof Error ? reason.message : String(reason)); } }
    })();
    return () => { cancelled = true; release(); };
  }, [chart, reset]);
  return <section aria-label="실제 튜토리얼 미리보기" data-testid="explicit-tutorial-preview" data-iteration={iteration} data-settled={settled}>
    <h2>실제 튜토리얼 미리보기</h2>
    <p>같은 연습 차트의 물리 자동 입력을 실제 엔진과 Pixi 판정 UI로 반복합니다.</p>
    <canvas key={reset} ref={canvas} style={{ width: '100%', maxWidth: 800, aspectRatio: '4 / 3', display: 'block' }} />
    <p role="status">{status} · 반복 {iteration} · 정산 {settled}</p>
    <label><input type="checkbox" checked={repeat} onChange={event => { repeatRef.current = event.target.checked; setRepeat(event.target.checked); playback.current?.setRepeat(event.target.checked); }} />미리보기 반복</label>{' '}
    <button onClick={() => { setStatus('준비 중'); setReset(value => value + 1); }}>미리보기 초기화</button>
  </section>;
}
