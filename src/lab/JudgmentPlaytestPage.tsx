/**
 * 판정 실플레이 lab 페이지 (DEV 전용) — RFD 0015 §11(홀드 트릴)·§7-3(놓기 관대) 실측.
 *
 * Supabase·오디오 파일 없이, 스크립트 차트 + 합성 메트로놈 클릭트랙을 게임 스토어에 주입하고
 * 에디터 테스트플레이와 동일한 경로(performPlayTest)로 PlayScreen을 띄운다.
 */

import { useNavigate } from "react-router-dom";
import { useGameStore } from "../game/stores";
import { performPlayTest } from "../editor/hooks/useFileOperations";
import {
  PLAYTEST_SCENARIOS,
  metronomeClickTimesMs,
  noteOnsetTimesMs,
  chartEndMs,
  type PlaytestScenario,
} from "./judgmentPlaytestScenarios";
import type { Chart } from "../shared/types/chart";

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

  const play = (scenario: PlaytestScenario) => {
    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = buildClickTrack(scenario.chart);
    } catch (e) {
      alert(`오디오 합성 실패: ${String(e)}`);
      return;
    }

    const g = useGameStore.getState();
    // 이전 세션의 부분 재생 구간이 남아있으면 전체 버퍼로 리셋
    useGameStore.setState({ selectedPlaybackRange: null });
    // 실측용이므로 Debug Mode를 켠 채로 플레이 — 곡 종료 시 판정 로그가 콘솔에 출력된다.
    g.updateSettings({ debugMode: true });

    performPlayTest({
      fromCursor: false,
      audioBuffer,
      isPlaying: false,
      pause: () => {},
      chart: scenario.chart,
      currentTimeMs: 0,
      returnUrl: "/lab/judgment-playtest",
      game: {
        setChartData: g.setChartData,
        setAudioBuffer: g.setAudioBuffer,
        setStartTimeMs: g.setStartTimeMs,
        setEditorReturnUrl: g.setEditorReturnUrl,
        setScreen: g.setScreen,
      },
      addToast: (m) => {
        alert(m);
      },
      closeMenu: () => {},
      navigate: () => navigate("/game"),
    });
  };

  return (
    <div style={{ padding: 32, color: "#e0e0e0", background: "#1a1a1a", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>판정 실플레이 (DEV) — RFD 0015 §11 · §7-3</h1>
      <p style={{ color: "#999", marginBottom: 24, fontSize: 13, lineHeight: 1.6 }}>
        Supabase·음원 없이 특정 판정 패턴을 반복 재생한다. 버튼을 누르면 스크립트 차트 + 메트로놈 클릭트랙으로
        PlayScreen이 뜬다. <b>Debug Mode는 여기서 자동 ON</b> — 곡이 끝나면 <code>debug-log-*.txt</code>가 자동
        다운로드된다(헤드/포인트 노트의 타이밍만 기록). connection 끝점 판정은 로그에 안 남으므로 <b>화면 판정·콤보로</b> 본다.
        되돌아오려면 브라우저 뒤로가기 또는 <code>/lab/judgment-playtest</code>.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 780 }}>
        {PLAYTEST_SCENARIOS.map((s) => (
          <div key={s.id} style={{ border: "1px solid #444", borderRadius: 8, padding: 16, background: "#232323" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 12, color: "#7aa2f7", marginTop: 2 }}>{s.ref}</div>
              </div>
              <button
                onClick={() => play(s)}
                style={{ padding: "10px 22px", background: "#3a5bdc", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}
              >
                ▶ 플레이
              </button>
            </div>
            <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.6 }}>
              <div><span style={{ color: "#999" }}>볼 것:</span> {s.watchFor}</div>
              <div style={{ marginTop: 4 }}><span style={{ color: "#999" }}>치는 법:</span> {s.howTo}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
