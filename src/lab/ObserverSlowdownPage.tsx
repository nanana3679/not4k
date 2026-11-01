import { useEffect, useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import {
  OBSERVER_SLOWDOWN_RATES,
  formatMilliseconds,
  formatRate,
  formatSongTime,
  type ObserverSlowdownRate,
} from "./observerSlowdownAudio";
import type { SlowdownMethodId, SlowdownRig, SongInfo } from "./observerSlowdownRig";
import "./ObserverSlowdownPage.css";

const SLOWDOWN_METHODS: readonly { id: SlowdownMethodId; title: string; wiring: string; note: string }[] = [
  {
    id: "media-element",
    title: "브라우저 내장 (HTMLAudioElement)",
    wiring: "preservesPitch = true로 두고 playbackRate를 바꿉니다. 속도 변경은 요소에 바로 넘깁니다.",
    note: "기준안. 곡 위치는 요소의 currentTime이라 AudioContext 시계와 샘플 단위로 맞출 수 없고, 처리 지연도 보고하지 않습니다.",
  },
  {
    id: "signalsmith",
    title: "Signalsmith Stretch (AudioWorklet·WASM, MIT)",
    wiring: "디코딩한 버퍼를 노드에 올리고 schedule로 위치·재생 속도를 예약합니다. 속도 변경은 지금 곡 위치에서 20ms 뒤로 다시 예약합니다.",
    note: "노드가 자기 지연을 보정해 예약한 시각에 그 위치가 들립니다. 시작은 보고 지연만큼 늦게 예약해 첫 소리부터 맞춥니다.",
  },
  {
    id: "soundtouch",
    title: "SoundTouchJS (AudioWorklet, MPL-2.0)",
    wiring: "AudioBufferSourceNode를 재생 속도 r로 재생하고 SoundTouch 노드가 음높이를 1/r로 되돌립니다. 속도 변경은 두 노드의 playbackRate를 같은 시각에 바꿉니다.",
    note: "곡 위치는 소스가 읽는 위치라 처리 지연만큼 실제 소리보다 앞섭니다. 처리 지연은 보고하지 않아 시작 측정값으로만 드러납니다.",
  },
];

/** 초 단위 측정값. "measuring"은 측정 중, null은 3초 안에 소리를 감지하지 못함. */
type FirstOutput = Partial<Record<SlowdownMethodId, number | null | "measuring">>;

const withoutMeasuring = (previous: FirstOutput): FirstOutput =>
  Object.fromEntries(Object.entries(previous).filter(([, value]) => value !== "measuring"));

function firstOutputLabel(value: FirstOutput[SlowdownMethodId]) {
  if (value === undefined) return "—";
  if (value === "measuring") return "측정 중…";
  return value === null ? "감지 못함" : formatMilliseconds(value);
}

/** 라이브러리가 지연을 보고하는 방식은 Signalsmith뿐이다. */
function reportedLatencyLabel(method: SlowdownMethodId, rig: SlowdownRig | null) {
  if (method !== "signalsmith") return "보고 없음";
  return rig ? `${formatMilliseconds(rig.signalsmithLatencySeconds)} (latency(): 입력+출력)` : "—";
}

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

/** 옵저버 감속 재생(RFD 0076)의 음높이 유지 방식을 귀로 고르기 위한 결정 보조 페이지. 게임 런타임은 바꾸지 않는다. */
export default function ObserverSlowdownPage() {
  const rigPromiseRef = useRef<Promise<SlowdownRig> | null>(null);
  const playTokenRef = useRef(0);
  const [rig, setRig] = useState<SlowdownRig | null>(null);
  const [song, setSong] = useState<SongInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState<ObserverSlowdownRate>(1);
  const [startAt, setStartAt] = useState(0);
  const [active, setActive] = useState<SlowdownMethodId | null>(null);
  const [position, setPosition] = useState(0);
  const [firstOutput, setFirstOutput] = useState<FirstOutput>({});
  const [deviceLatency, setDeviceLatency] = useState<number | null>(null);
  const [metronome, setMetronome] = useState(true);

  useEffect(() => () => {
    void rigPromiseRef.current?.then((created) => created.dispose(), () => {});
  }, []);

  useEffect(() => {
    rig?.setMetronome(metronome);
  }, [rig, metronome]);

  useEffect(() => {
    if (!rig || !active || !song) return;
    let frame = 0;
    const tick = () => {
      const songTime = rig.songTime();
      if (songTime === null || songTime >= song.durationSeconds) {
        rig.stop();
        setActive(null);
        setFirstOutput(withoutMeasuring);
        return;
      }
      setPosition(songTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [rig, active, song]);

  const loadSong = async (label: string, load: (created: SlowdownRig) => Promise<SongInfo>) => {
    setError(null);
    setBusy(label);
    try {
      if (!rigPromiseRef.current) {
        // AudioContext는 클릭 안에서 바로 만들어야 자동 재생 정책에 막히지 않는다. 라이브러리는 그 뒤에 읽는다.
        const context = new AudioContext({ latencyHint: "interactive" });
        const creating = import("./observerSlowdownRig").then(({ createSlowdownRig }) => createSlowdownRig(context));
        creating.catch(() => {
          void context.close();
          rigPromiseRef.current = null;
        });
        rigPromiseRef.current = creating;
      }
      const created = await rigPromiseRef.current;
      setRig(created);
      const next = await load(created);
      setActive(null);
      setSong(next);
      setStartAt(0);
      setPosition(0);
      setFirstOutput({});
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(null);
    }
  };

  const loadFile = (file: File | undefined) => {
    if (file) void loadSong(`${file.name} 디코딩 중…`, (created) => created.loadFile(file));
  };

  const play = (method: SlowdownMethodId) => {
    if (!rig || !song) return;
    // 재생 중 다른 방식을 고르면 지금 곡 위치에서 그 방식으로 넘어간다(A/B).
    const from = active ? rig.songTime() ?? startAt : startAt;
    const token = ++playTokenRef.current;
    setError(null);
    setActive(method);
    setFirstOutput((previous) => ({ ...withoutMeasuring(previous), [method]: "measuring" }));
    rig.play(method, from, rate).then(
      (seconds) => {
        if (token !== playTokenRef.current) return;
        setFirstOutput((previous) => ({ ...previous, [method]: seconds }));
        setDeviceLatency(rig.deviceLatencySeconds());
      },
      (reason) => {
        if (token !== playTokenRef.current) return;
        setActive(null);
        setFirstOutput(withoutMeasuring);
        setError(errorMessage(reason));
      },
    );
  };

  const stop = () => {
    playTokenRef.current += 1;
    rig?.stop();
    setActive(null);
    setFirstOutput(withoutMeasuring);
  };

  const changeRate = (next: ObserverSlowdownRate) => {
    setRate(next);
    rig?.setRate(next);
  };

  const dropFile = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    loadFile(event.dataTransfer.files[0]);
  };

  const disabled = !song || busy !== null;

  return (
    <main className="observer-slowdown-page" data-lab-page="observer-slowdown">
      <div className="observer-slowdown-content">
        <Link to="/lab">Lab 목록</Link>
        <p className="observer-slowdown-eyebrow">RFD 0076 · 결정 보조</p>
        <h1>옵저버 감속 청음 비교</h1>
        <p>
          음높이를 유지하는 감속 방식 세 가지를 같은 곡 위치·재생 속도로 바꿔 들으며 비교합니다.
          재생 중 재생 속도를 누르면 지금 곡 위치에서 바로 바뀝니다. 게임의 AudioEngine·GameClock은 바꾸지 않습니다.
        </p>

        <section className="observer-slowdown-panel" aria-labelledby="observer-slowdown-source" onDragOver={(event) => event.preventDefault()} onDrop={dropFile}>
          <h2 id="observer-slowdown-source">음원</h2>
          <div className="observer-slowdown-row">
            <button type="button" disabled={busy !== null} onClick={() => void loadSong("테스트 루프 만드는 중…", (created) => created.loadTestLoop())}>
              테스트 루프 만들기 (120 BPM · 16초)
            </button>
            <label className="observer-slowdown-file">
              내 음원 열기
              <input
                type="file"
                accept="audio/*"
                disabled={busy !== null}
                onChange={(event) => {
                  loadFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
            <span>또는 이 영역에 파일을 끌어다 놓습니다.</span>
          </div>
          <p role="status">
            {busy ?? (song ? `${song.name} · ${formatSongTime(song.durationSeconds)}` : "음원을 고르면 세 방식이 같은 음원을 씁니다.")}
          </p>
          {error && <p className="observer-slowdown-error" role="alert">{error}</p>}
        </section>

        <section className="observer-slowdown-panel" aria-labelledby="observer-slowdown-transport">
          <h2 id="observer-slowdown-transport">재생 속도와 위치</h2>
          <div className="observer-slowdown-row" role="group" aria-label="재생 속도">
            {OBSERVER_SLOWDOWN_RATES.map((candidate) => (
              <button type="button" key={candidate} aria-pressed={rate === candidate} onClick={() => changeRate(candidate)}>
                {formatRate(candidate)}
              </button>
            ))}
          </div>
          <label className="observer-slowdown-start">
            시작 위치 {formatSongTime(startAt)}
            <input
              type="range"
              min={0}
              max={song?.durationSeconds ?? 0}
              step={0.01}
              value={startAt}
              disabled={disabled}
              onChange={(event) => setStartAt(Number(event.target.value))}
            />
          </label>
          <div className="observer-slowdown-row">
            <span>지금 곡 위치 {active ? formatSongTime(position) : "—"}</span>
            <button type="button" disabled={!active} onClick={() => setStartAt(position)}>지금 위치를 시작 위치로</button>
          </div>
          <p>장치 출력 지연 (브라우저 보고 baseLatency + outputLatency, 세 방식 공통) {deviceLatency === null ? "— 재생하면 표시" : formatMilliseconds(deviceLatency)}</p>
          <label className="observer-slowdown-check">
            <input type="checkbox" checked={metronome} disabled={!song?.beatSeconds} onChange={(event) => setMetronome(event.target.checked)} />
            박 클릭 겹치기 (테스트 루프만)
          </label>
          <p className="observer-slowdown-note">
            박 클릭은 재생 중인 방식이 보고하는 곡 위치로 박 시각을 계산해 AudioContext 시계에 예약합니다.
            킥과 어긋나 들리면 그 방식의 곡 위치로는 판정 시계를 맞추기 어렵다는 뜻입니다.
          </p>
        </section>

        <section className="observer-slowdown-methods" aria-label="감속 방식">
          {SLOWDOWN_METHODS.map((method) => {
            const playing = active === method.id;
            return (
              <article key={method.id} data-method={method.id} data-playing={playing} aria-labelledby={`observer-slowdown-${method.id}`}>
                <h2 id={`observer-slowdown-${method.id}`}>{method.title}</h2>
                <p>{method.wiring}</p>
                <button type="button" disabled={disabled} onClick={() => (playing ? stop() : play(method.id))}>
                  {playing ? "정지" : active ? "이 방식으로 전환" : "재생"}
                </button>
                <dl>
                  <dt>곡 위치</dt>
                  <dd>{playing ? formatSongTime(position) : "—"}</dd>
                  <dt>처리 지연 (보고값)</dt>
                  <dd>{reportedLatencyLabel(method.id, rig)}</dd>
                  <dt>클릭→첫 출력 (측정)</dt>
                  <dd>{firstOutputLabel(firstOutput[method.id])}</dd>
                </dl>
                <p className="observer-slowdown-note">{method.note}</p>
              </article>
            );
          })}
        </section>

        <p className="observer-slowdown-note">
          클릭→첫 출력은 재생 버튼을 누른 시각부터 그 방식의 출력에 소리(-60 dBFS 초과)가 처음 나타날 때까지를 AnalyserNode로 잰 값입니다.
          오디오 콜백 하나(보통 10～25ms)만큼 오차가 있어 0ms는 콜백 하나 안에 나왔다는 뜻입니다. 고른 시작 위치가 조용하면 늦게 잡히거나 감지하지 못합니다.
          실제로 들리기까지는 위의 장치 출력 지연이 세 방식에 똑같이 더해집니다.
        </p>
      </div>
    </main>
  );
}
