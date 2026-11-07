import { useEffect, useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import {
  OBSERVER_SLOWDOWN_RATES,
  formatMilliseconds,
  formatRate,
  formatSongTime,
  type ObserverSlowdownRate,
} from "./observerSlowdownAudio";
import { OBSERVER_SLOWDOWN_NOTICES, type ThirdPartyNotice } from "./observerSlowdownNotices";
import type { FirstOutputMeasurement, SlowdownMethodId, SlowdownRig, SongInfo } from "./observerSlowdownRig";
import "./ObserverSlowdownPage.css";

/** 방식 카드 제목의 라이선스 표기가 연결하는 제삼자 고지 절. */
const noticeAnchor = (id: ThirdPartyNotice["id"]) => `observer-slowdown-license-${id}`;

const SLOWDOWN_METHODS: readonly {
  id: SlowdownMethodId;
  name: string;
  detail: string;
  license?: { label: string; notice: ThirdPartyNotice["id"] };
  wiring: string;
  note: string;
}[] = [
  {
    id: "media-element",
    name: "브라우저 내장",
    detail: "HTMLAudioElement",
    wiring: "preservesPitch = true로 두고 playbackRate를 바꿉니다. 시작·속도 변경은 요소에 바로 넘기고 예약하지 않습니다.",
    note: "기준안. 곡 위치는 요소의 currentTime이라 AudioContext 시계와 샘플 단위로 맞출 수 없고, 처리 지연도 보고하지 않습니다.",
  },
  {
    id: "signalsmith",
    name: "Signalsmith Stretch",
    detail: "AudioWorklet·WASM",
    license: { label: "MIT", notice: "signalsmith" },
    wiring: "디코딩한 버퍼를 노드에 올리고 schedule로 곡 위치·재생 속도를 예약합니다. 시작과 속도 변경 모두 지금 + 예약 여유를 렌더 퀀텀 경계로 올린 시각에서 출력 지연만큼 더 뒤에 예약합니다.",
    note: "처리기는 버퍼를 입력 지연만큼 앞서 읽고, 출력 지연만큼 앞서 계산해 예약한 출력 시각에 그 곡 위치가 들리게 합니다. 출력 지연보다 늦게 도착한 예약은 이미 계산한 소리를 바꾸지 못해 위치가 튀므로 시작과 속도 변경을 모두 출력 지연 뒤로 예약합니다. 새 예약은 아직 적용 전인 예약을 지우므로, 직전 예약이 적용되기 전에 속도를 또 바꾸면 적용된 뒤에 보냅니다.",
  },
  {
    id: "soundtouch",
    name: "SoundTouchJS",
    detail: "AudioWorklet",
    license: { label: "MPL-2.0", notice: "soundtouch" },
    wiring: "AudioBufferSourceNode를 재생 속도 r로 재생하고 SoundTouch 노드가 음높이를 1/r로 되돌립니다. 시작과 속도 변경은 지금 + 예약 여유를 렌더 퀀텀 경계로 올린 시각에 두 노드에 함께 예약합니다.",
    note: "곡 위치는 소스가 읽는 위치라 처리 지연만큼 실제 소리보다 앞섭니다. 처리 지연은 보고하지 않아 시작 측정값으로만 드러납니다. 곡 끝에서는 소스가 끝난 뒤에도 무음을 먹여 남은 소리가 다 나온 뒤 멈춥니다.",
  },
];

/** "measuring"은 측정 중. 나머지는 rig가 돌려준 측정값. */
type FirstOutput = Partial<Record<SlowdownMethodId, FirstOutputMeasurement | "measuring">>;

const withoutMeasuring = (previous: FirstOutput): FirstOutput =>
  Object.fromEntries(Object.entries(previous).filter(([, value]) => value !== "measuring"));

function firstOutputLabel(value: FirstOutput[SlowdownMethodId]) {
  if (value === undefined) return "—";
  if (value === "measuring") return "측정 중…";
  if (value === "none") return "감지 못함 (3초)";
  if (value === "missed") return "창 놓침 (다시 재생)";
  return formatMilliseconds(value);
}

/** 라이브러리가 지연을 보고하는 방식은 Signalsmith뿐이다. latency()는 합만 주고 출력 지연은 rig가 잰다. */
function reportedLatencyLabel(method: SlowdownMethodId, rig: SlowdownRig | null) {
  if (method !== "signalsmith") return "보고 없음";
  if (!rig) return "—";
  const output = rig.signalsmithOutputLatencySeconds;
  return `출력 ${formatMilliseconds(output)} + 입력 ${formatMilliseconds(rig.signalsmithLatencySeconds - output)} (latency() 합 ${formatMilliseconds(rig.signalsmithLatencySeconds)})`;
}

/** 측정값과 따로, 그 안에 든 예약 선행(설정값)을 보여 준다. 마지막 재생에서 실제로 둔 값이 있으면 함께 적는다. */
function scheduledLeadLabel(method: SlowdownMethodId, rig: SlowdownRig | null, lastLead: number | undefined) {
  if (method === "media-element") return "없음 (play() 즉시)";
  if (!rig) return "—";
  const setting = method === "signalsmith"
    ? `여유 ${formatMilliseconds(rig.scheduleLeadSeconds)} + 출력 지연 ${formatMilliseconds(rig.signalsmithOutputLatencySeconds)}`
    : `여유 ${formatMilliseconds(rig.scheduleLeadSeconds)}`;
  return lastLead === undefined ? `${setting}, 렌더 퀀텀 경계로 올림` : `${formatMilliseconds(lastLead)} (${setting}, 렌더 퀀텀 경계로 올림)`;
}

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

/** 옵저버 감속 재생(RFD 0076)의 음높이 유지 방식을 귀로 고르기 위한 결정 보조 페이지. 게임 런타임은 바꾸지 않는다. */
export default function ObserverSlowdownPage() {
  const rigPromiseRef = useRef<Promise<SlowdownRig> | null>(null);
  const playTokenRef = useRef(0);
  /** 음원 읽기 잠금. 버튼·파일 선택·끌어다 놓기가 같은 잠금을 써서 읽기가 겹치지 않게 한다. */
  const loadingRef = useRef(false);
  const [rig, setRig] = useState<SlowdownRig | null>(null);
  const [song, setSong] = useState<SongInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState<ObserverSlowdownRate>(1);
  const [startAt, setStartAt] = useState(0);
  const [active, setActive] = useState<SlowdownMethodId | null>(null);
  const [position, setPosition] = useState(0);
  const [firstOutput, setFirstOutput] = useState<FirstOutput>({});
  const [scheduledLead, setScheduledLead] = useState<Partial<Record<SlowdownMethodId, number>>>({});
  const [deviceLatency, setDeviceLatency] = useState<number | null>(null);
  const [metronome, setMetronome] = useState(true);

  useEffect(() => () => {
    void rigPromiseRef.current?.then((created) => created.dispose(), () => {});
  }, []);

  useEffect(() => {
    rig?.setMetronome(metronome);
  }, [rig, metronome]);

  useEffect(() => {
    if (!rig || !active) return;
    let frame = 0;
    const tick = () => {
      // rig는 곡 끝까지 재생해 그 방식의 출력이 끝나면 스스로 멈추고 null을 돌려준다.
      const songTime = rig.songTime();
      if (songTime === null) {
        setActive(null);
        setFirstOutput(withoutMeasuring);
        return;
      }
      setPosition(songTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [rig, active]);

  const loadSong = async (label: string, load: (created: SlowdownRig) => Promise<SongInfo>) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
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
      setScheduledLead({});
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      loadingRef.current = false;
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
      (result) => {
        if (token !== playTokenRef.current) return;
        if (!result) {
          setFirstOutput(withoutMeasuring);
          return;
        }
        setFirstOutput((previous) => ({ ...previous, [method]: result.firstOutput }));
        const lead = result.scheduledLeadSeconds;
        if (lead !== null) setScheduledLead((previous) => ({ ...previous, [method]: lead }));
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
          재생 중 재생 속도를 누르면 지금 곡 위치에서 이어지는 새 재생 속도로 바뀝니다. 게임의 AudioEngine·GameClock은 바꾸지 않습니다.
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
            <span>또는 이 영역에 파일을 끌어다 놓습니다(읽는 중에는 무시).</span>
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
            재생 속도를 바꾸면 곡 위치 시계는 변경이 적용되는 시각까지 옛 속도로 흐르고 그 시각부터 새 속도로 이어지며,
            박 클릭도 적용 시각 전 클릭은 그대로 두고 그 뒤 클릭만 다시 예약해 박을 빠뜨리거나 두 번 울리지 않습니다.
            킥과 어긋나 들리면 그 방식의 곡 위치로는 판정 시계를 맞추기 어렵다는 뜻입니다.
          </p>
        </section>

        <section className="observer-slowdown-methods" aria-label="감속 방식">
          {SLOWDOWN_METHODS.map((method) => {
            const playing = active === method.id;
            return (
              <article key={method.id} data-method={method.id} data-playing={playing} aria-labelledby={`observer-slowdown-${method.id}`}>
                <h2 id={`observer-slowdown-${method.id}`}>
                  {method.name} ({method.detail}
                  {method.license && <>, <a href={`#${noticeAnchor(method.license.notice)}`}>{method.license.label}</a></>})
                </h2>
                <p>{method.wiring}</p>
                <button type="button" disabled={disabled} onClick={() => (playing ? stop() : play(method.id))}>
                  {playing ? "정지" : active ? "이 방식으로 전환" : "재생"}
                </button>
                <dl>
                  <dt>곡 위치</dt>
                  <dd>{playing ? formatSongTime(position) : "—"}</dd>
                  <dt>처리 지연 (보고값)</dt>
                  <dd>{reportedLatencyLabel(method.id, rig)}</dd>
                  <dt>예약 선행 (설정값, 측정값에 들어 있음)</dt>
                  <dd>{scheduledLeadLabel(method.id, rig, scheduledLead[method.id])}</dd>
                  <dt>클릭→첫 출력 (측정)</dt>
                  <dd>{firstOutputLabel(firstOutput[method.id])}</dd>
                </dl>
                <p className="observer-slowdown-note">{method.note}</p>
              </article>
            );
          })}
        </section>

        <p className="observer-slowdown-note">
          클릭→첫 출력은 세 방식 모두 재생 버튼을 누른 순간의 AudioContext.currentTime부터 그 방식의 게이트 뒤 출력에 소리(-60 dBFS 초과)가
          처음 나타난 샘플까지를 잰 값입니다. 화면 프레임마다 AnalyserNode의 최근 32768프레임(48kHz에서 약 683ms) 창을 읽어 창이 이어질 때만 세고,
          창 사이에 틈이 생기면(탭 전환 등) 값을 버리고 &quot;창 놓침&quot;으로 표시합니다. 3초(performance.now 기준) 안에 소리가 없으면 &quot;감지 못함&quot;입니다.
          창 안의 위치는 샘플 단위로 맞지만, 클릭 시각과 창 끝 시각은 메인 스레드가 보는 currentTime이라 브라우저가 그 값을 갱신하는 단위
          (렌더 퀀텀 128프레임～오디오 콜백 하나, 헤드리스 Chromium에서 23ms)만큼 어긋날 수 있습니다.
          예약하는 두 방식의 측정값에는 위의 예약 선행이 들어 있고, 예약 여유는 메인 스레드 currentTime이 오디오 스레드보다 늦게 갱신되는 만큼을 덮기 위한 값입니다.
          고른 시작 위치가 조용하면 늦게 잡히거나 감지하지 못합니다. 실제로 들리기까지는 위의 장치 출력 지연이 세 방식에 똑같이 더해집니다.
        </p>

        <section className="observer-slowdown-panel observer-slowdown-notices" aria-labelledby="observer-slowdown-notices">
          <h2 id="observer-slowdown-notices">제삼자 고지</h2>
          <p>이 페이지는 아래 라이브러리 코드를 Lab 정적 빌드에 함께 싣습니다.</p>
          {OBSERVER_SLOWDOWN_NOTICES.map((notice) => (
            <article key={notice.id} id={noticeAnchor(notice.id)} aria-labelledby={`${noticeAnchor(notice.id)}-title`}>
              <h3 id={`${noticeAnchor(notice.id)}-title`}>{notice.title} · {notice.license}</h3>
              <p>패키지: {notice.packages.map(({ name, version }) => `${name}@${version}`).join(", ")}</p>
              <ul>
                {notice.copyrights.map((copyright) => <li key={copyright}>{copyright}</li>)}
              </ul>
              <p className="observer-slowdown-note">{notice.copyrightSource}</p>
              {notice.licenseText && <pre>{notice.licenseText}</pre>}
              <p>
                라이선스 전문: <a href={notice.licenseUrl}>{notice.licenseUrl}</a>
              </p>
              <ul>
                {notice.sources.map((source) => (
                  <li key={source.url}>{source.label}: <a href={source.url}>{source.url}</a></li>
                ))}
              </ul>
              {notice.bundled && (
                <p>
                  함께 포함: {notice.bundled.name} · {notice.bundled.license} · {notice.bundled.copyright} (
                  <a href={notice.bundled.licenseUrl}>LICENSE.txt</a>, 허가문은 위 MIT 전문과 같습니다)
                </p>
              )}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
