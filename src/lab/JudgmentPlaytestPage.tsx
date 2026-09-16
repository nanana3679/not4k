/**
 * 판정 실플레이 lab 페이지 (DEV 전용) — RFD 0020 채택 사례의 수동 검증.
 *
 * Supabase·오디오 파일 없이, 스크립트 차트 + 합성 메트로놈 클릭트랙을 게임 스토어에 주입하고
 * 에디터 테스트플레이와 동일한 경로(performPlayTest)로 PlayScreen을 띄운다.
 */

import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useGameStore } from "../game/stores";
import { getJudgmentWindows } from "../shared/constants";
import { getTutorialKeyboardLabel } from "../game/screens/songSelect/tutorialKeyboardLayout";
import { performPlayTest } from "../editor/playtest/performPlayTest";
import {
  PLAYTEST_SCENARIOS,
  metronomeClickTimesMs,
  noteOnsetTimesMs,
  chartEndMs,
  type PlaytestScenario,
} from "./judgmentPlaytestScenarios";
import type { Chart } from "../shared/types/chart";
import "./JudgmentPlaytestPage.css";

const GROUPS = [
  { id: "all", label: "전체" },
  { id: "connection", label: "연결 · 교대" },
  { id: "release", label: "감소 · release" },
  { id: "holdOnly", label: "holdOnly" },
  { id: "failure", label: "실패 · 복구" },
] as const;

/** 메트로놈 클릭트랙 AudioBuffer 합성 — 매 박 짧은 사인 버스트, 노트 온셋은 강조. */
function buildClickTrack(chart: Chart): AudioBuffer {
  const ac = new AudioContext();
  const sampleRate = ac.sampleRate;
  const durMs = chartEndMs(chart);
  const length = Math.ceil((sampleRate * durMs) / 1000);
  const buffer = ac.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  const onsets = new Set(noteOnsetTimesMs(chart).map((ms) => Math.round(ms)));
  const writeClick = (atMs: number, freq: number, gain: number) => {
    const start = Math.floor((sampleRate * atMs) / 1000);
    const dur = Math.floor(sampleRate * 0.03); // 30ms
    for (let i = 0; i < dur && start + i < length; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * 60); // 감쇠
      data[start + i] += Math.sin(2 * Math.PI * freq * t) * gain * env;
    }
  };

  for (const ms of metronomeClickTimesMs(chart)) writeClick(ms, 1000, 0.25);
  for (const ms of onsets) writeClick(ms, 1600, 0.5); // 노트 시작 강조 클릭

  void ac.close();
  return buffer;
}

export default function JudgmentPlaytestPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const settings = useGameStore(state => state.settings);
  const lastResult = useGameStore(state => state.lastResult);
  const previousScenario = PLAYTEST_SCENARIOS.find(s => s.id === params.get("scenario"));
  const [group, setGroup] = useState<string>(previousScenario?.group ?? "all");
  const [error, setError] = useState<string | null>(null);
  const windows = getJudgmentWindows(settings.judgmentMode);
  const scenarios = PLAYTEST_SCENARIOS.filter(s => group === "all" || s.group === group);
  const previousResult = previousScenario && lastResult?.songId === previousScenario.chart.meta.title
    ? lastResult : null;

  const play = (scenario: PlaytestScenario) => {
    setError(null);
    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = buildClickTrack(scenario.chart);
    } catch (e) {
      setError(`오디오 합성 실패: ${String(e)}`);
      return;
    }

    const g = useGameStore.getState();
    // 이전 플레이 구간과 결과를 새 수동 검사에 가져오지 않는다.
    useGameStore.setState({ selectedPlaybackRange: null, lastResult: null });
    // 기존 Lab의 로그 다운로드 동작을 유지한다.
    g.updateSettings({ debugMode: true });

    performPlayTest({
      fromCursor: false,
      audioBuffer,
      isPlaying: false,
      pause: () => {},
      chart: scenario.chart,
      currentTimeMs: 0,
      returnUrl: `/lab/judgment-playtest?scenario=${encodeURIComponent(scenario.id)}`,
      game: {
        setChartData: g.setChartData,
        setAudioBuffer: g.setAudioBuffer,
        setStartTimeMs: g.setStartTimeMs,
        setEditorReturnUrl: g.setEditorReturnUrl,
        setScreen: g.setScreen,
      },
      addToast: setError,
      closeMenu: () => {},
      navigate: () => navigate("/game"),
    });
  };

  return (

    <main className="judgment-playtest-page">
      <div className="judgment-playtest-content">
        <header>
          <p className="judgment-playtest-eyebrow">DEV LAB · RFD 0020</p>
          <h1>판정 실플레이</h1>
          <p>사례를 고르고 직접 눌러 확인해 보세요. 실제 플레이 화면에서 메트로놈과 함께 재생합니다.</p>
        </header>

        <section className="judgment-playtest-guide" aria-label="플레이 안내">
          <h2>레인 1의 키로 플레이</h2>
          <div className="judgment-playtest-keys">
            {settings.keyBindings.lane1.map((key, index) => (
              <span key={key}>{String.fromCharCode(65 + index)} = <kbd>{getTutorialKeyboardLabel(key)}</kbd></span>
            ))}

          </div>
          <p>A/B/C/D는 서로 다른 키의 별칭입니다. 위에 표시된 실제 키를 사용하세요.</p>
          <p>120 BPM · 1박 = 500ms · 첫 노트 2000ms. 시각은 차트 기준이며, 예시 결과는 Normal · 1배속 기준입니다.</p>
          <p>현재 설정: {settings.judgmentMode === "easy" ? "Easy" : "Normal"} · {settings.playSpeed}배속 · Good ±{windows.GOOD}ms · 입력 오프셋 {settings.judgmentOffsetMs}ms</p>
          <p><kbd>Esc</kbd> → Retry로 재시도하거나 Quit으로 이 목록에 돌아옵니다. 완주 뒤에는 결과 화면의 Back to Lab을 누르세요.</p>
          <details>
            <summary>판정 로그와 결과 읽기</summary>
            <p>플레이를 시작하면 Debug Mode가 켜지고, 종료할 때 <code>debug-log-*.txt</code>를 다운로드합니다. 설정은 이후에도 유지되며 Settings에서 끌 수 있습니다.</p>
            <p>일반 연결 성공은 점수·콤보·Perfect 개수를 늘리지 않습니다. 실제 release와 holdOnly 완료, 유지 실패를 구분해서 확인하세요. 타이밍에 따라 등급이 달라질 수 있으므로 각 사례의 확인할 결과를 함께 읽어주세요.</p>
          </details>
        </section>

        {error && <p role="alert" className="judgment-playtest-error">{error}</p>}
        {previousScenario && previousResult && (
          <section className="judgment-playtest-result" aria-label="방금 플레이한 결과">
            <h2>{previousScenario.label}</h2>
            <p>{previousResult.achievementRate.toFixed(2)}% · Miss {previousResult.judgmentCounts.miss ?? 0} · Full Combo {previousResult.isFullCombo ? "YES" : "NO"}</p>
            <p>{previousScenario.watchFor}</p>
            <button onClick={() => play(previousScenario)}>같은 사례 다시 플레이</button>
          </section>
        )}

        <nav className="judgment-playtest-filters" aria-label="시나리오 분류">
          {GROUPS.map(item => (
            <button key={item.id} aria-pressed={group === item.id} onClick={() => setGroup(item.id)}>{item.label}</button>
          ))}
          <span aria-live="polite">{scenarios.length}개 사례</span>
        </nav>
        <div className="judgment-playtest-scenarios">
          {scenarios.map(s => (
            <article key={s.id} data-scenario-id={s.id} aria-labelledby={`scenario-${s.id}`}>
              <div className="judgment-playtest-card-heading">
                <h2 id={`scenario-${s.id}`}>{s.label}</h2>
                <button onClick={() => play(s)} aria-label={`${s.label} 플레이`}>플레이</button>
              </div>
              <p className="judgment-playtest-ref">{s.ref} · {s.caseIds.join(" · ")}</p>
              <pre aria-label="노트 패턴">{s.pattern}</pre>
              <dl>
                <dt>치는 법</dt><dd>{s.howTo}</dd>
                <dt>확인할 결과</dt><dd>{s.watchFor}</dd>
              </dl>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
