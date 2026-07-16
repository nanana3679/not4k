/**
 * 판정 실플레이 시나리오 (DEV 전용 lab) — RFD 0015 §11(홀드 트릴)·§7-3(놓기 관대) 실측용.
 *
 * Supabase·오디오 파일 없이 특정 판정 패턴을 반복 재생하기 위한 스크립트 차트 모음이다.
 * 차트 생성은 순수 함수로 두고(테스트 대상), 오디오(클릭트랙) 합성과 스토어 주입은
 * 페이지(JudgmentPlaytestPage)가 담당한다.
 *
 * BPM 120 고정 → 1박 = 500ms, 1/2박 = 250ms.
 */

import { beat } from "../shared/types/beat";
import type { Chart, NoteEntity, TrillZone } from "../shared/types/chart";
import type { ChartEvent } from "../shared/types/chart";
import { extractBpmMarkers, beatToMs } from "../shared/timing";

const BPM = 120;

/** 공통 이벤트: 0박 BPM 120 + 4/4 박자 */
function baseEvents(): ChartEvent[] {
  return [
    { type: "bpm", beat: beat(0, 1), bpm: BPM },
    { type: "timeSignature", beat: beat(0, 1), beatPerMeasure: beat(4, 1) },
  ];
}

function chartFrom(title: string, notes: NoteEntity[], trillZones: TrillZone[] = []): Chart {
  return {
    meta: {
      title,
      artist: "judgment-playtest",
      difficultyLabel: "TEST",
      difficultyLevel: 1,
      imageFile: "",
      audioFile: "",
      previewAudioFile: "",
      offsetMs: 0,
    },
    notes,
    trillZones,
    events: baseEvents(),
  };
}

/**
 * S1 — 홀드 트릴 체인 `o-o-o-o-` (RFD 0015 §11, 피스 PP-010).
 * `o-` = 헤드(single 포인트 노트) + 롱 바디. 헤드있는 롱 6개(각 1박=500ms)를 끝=시작으로 맞닿게 이어,
 * 매 경계가 connection이면서 다음 롱의 헤드(single)가 같은 박에 겹친다. 플레이: 레인 1에서 두 키를
 * ABAB로 교대(릴리즈탭 — 앞 키 떼고 다음 키 누름). 경계마다 앞 롱 endpoint=connection(held-or-grace),
 * 다음 헤드=single(아무 키). 12ms 유예가 스왑 공백을 메워 체인 전체 connection이 이어지는지 실측한다.
 */
function holdTrillChain(segDenominator: number, count: number): NoteEntity[] {
  // 각 세그먼트 길이 = 1/segDenominator 박. @120BPM: 1박=500ms, 1/2박=250ms, 1/4박=125ms.
  // 스왑 간격(헤드 간격)도 세그먼트 길이와 같다. 유예(12ms)는 스왑 간격과 무관하지만,
  // 간격이 짧을수록 앞 키 떼기~다음 키 누르기 공백이 12ms를 넘기 쉬워 connection이 깨진다.
  const notes: NoteEntity[] = [];
  const startN = 4 * segDenominator; // 4박(2초) 리드인, 1/segDenominator 박 단위
  for (let i = 0; i < count; i++) {
    const s = startN + i;
    notes.push({ type: "single", lane: 1, beat: beat(s, segDenominator) }); // 헤드 o
    notes.push({ type: "long", lane: 1, beat: beat(s, segDenominator), endBeat: beat(s + 1, segDenominator) }); // 바디 -
  }
  return notes;
}

/**
 * S2 — hold-only 완료 후 놓기 관대 (RFD 0015 §7-3, §9 기대값 반전 1).
 * hold-only 롱[4,6박] 직후 같은 레인에 길이0 슬라이드(6.5박). hold-only를 완료(6박까지 유지)한 뒤
 * 놓는 keyup이 슬라이드 윈도우(±120ms)에 들어가면 슬라이드가 "공짜로" 산다 — 그 이완을 체감한다.
 */
function holdOnlyThenSlide(): NoteEntity[] {
  return [
    { type: "long", lane: 1, beat: beat(4, 1), endBeat: beat(6, 1), holdOnly: true },
    { type: "long", lane: 1, beat: beat(13, 2), endBeat: beat(13, 2), holdOnly: true }, // 6.5박 길이0 슬라이드
  ];
}

/**
 * S3 — 타임아웃 사망 후 놓기 관대 (RFD 0015 §7-3, §9 기대값 반전 2).
 * 일반 롱[4,6박](떼는 판정 있음) 직후 같은 레인 길이0 슬라이드(6.5박). 롱을 끝점 윈도우 밖까지
 * 늦게 물고 있다 타임아웃 Miss로 죽인 뒤 놓는 keyup이 슬라이드를 살리는지 실측한다.
 */
function timeoutThenSlide(): NoteEntity[] {
  return [
    { type: "long", lane: 1, beat: beat(4, 1), endBeat: beat(6, 1) },
    { type: "long", lane: 1, beat: beat(13, 2), endBeat: beat(13, 2), holdOnly: true },
  ];
}

/**
 * S4 — 트릴 롱노트 시각 확인. trillZone 안에 헤드(trill 포인트) + trillLong 바디.
 * 긴 홀드 1개(3박=1.5s)로 held 바디 색을 눈으로 확인하고, 이어 짧은 트릴 롱 체인으로 교대 전환을 본다.
 */
function trillLongVisual(): NoteEntity[] {
  const notes: NoteEntity[] = [];
  // 긴 트릴 롱(3박=1.5s) — 한 키를 잡고 held 색을 확인
  notes.push({ type: "trill", lane: 2, beat: beat(4, 1) });
  notes.push({ type: "trillLong", lane: 2, beat: beat(4, 1), endBeat: beat(7, 1) });
  // 짧은 트릴 롱 체인(각 1박) — 교대로 잡으며 held 전환 확인
  for (let i = 0; i < 3; i++) {
    const s = 8 + i;
    notes.push({ type: "trill", lane: 2, beat: beat(s, 1) });
    notes.push({ type: "trillLong", lane: 2, beat: beat(s, 1), endBeat: beat(s + 1, 1) });
  }
  return notes;
}

export interface PlaytestScenario {
  id: string;
  label: string;
  /** RFD 근거 */
  ref: string;
  /** 무엇을 보는가 */
  watchFor: string;
  /** 어떻게 치는가 */
  howTo: string;
  chart: Chart;
}

export const PLAYTEST_SCENARIOS: PlaytestScenario[] = [
  {
    id: "hold-trill-chain",
    label: "S1a 홀드 트릴 체인 500ms (4분음표 — 느림)",
    ref: "RFD 0015 §11 · PP-010",
    watchFor: "connection 6개 전부 Perfect인가 (여유로운 속도 기준선). 500ms에선 스왑 공백이 12ms 유예에 쉽게 든다",
    howTo: "레인 1에서 두 키를 ABAB 교대(릴리즈탭). 500ms마다 헤드. body/endpoint 분포가 전부 perfect면 통과.",
    chart: chartFrom("S1a hold-trill 500ms", holdTrillChain(1, 6)),
  },
  {
    id: "hold-trill-chain-250",
    label: "S1b 홀드 트릴 체인 250ms (8분음표 — 보통)",
    ref: "RFD 0015 §11 · PP-010",
    watchFor: "스왑 시간이 절반으로 줄어 앞 키 떼기~다음 키 누르기 공백이 12ms를 넘기 쉬워진다 — connection Miss가 나기 시작하는지",
    howTo: "레인 1에서 두 키를 ABAB 교대. 250ms마다 헤드. body/endpoint 분포의 miss 개수가 유예 초과 경계 수다.",
    chart: chartFrom("S1b hold-trill 250ms", holdTrillChain(2, 8)),
  },
  {
    id: "hold-trill-chain-125",
    label: "S1c 홀드 트릴 체인 125ms (16분음표 — 빠름)",
    ref: "RFD 0015 §11 · PP-010",
    watchFor: "빠른 홀드 트릴. 스왑을 급하게 처리하다 공백이 12ms를 넘어 connection이 얼마나 깨지는지 — 유예의 실질 한계 실측",
    howTo: "레인 1에서 두 키를 ABAB 교대. 125ms마다 헤드. 헤드 타이밍(Great/Miss)과 body/endpoint(connection) miss를 함께 본다.",
    chart: chartFrom("S1c hold-trill 125ms", holdTrillChain(4, 8)),
  },
  {
    id: "holdonly-then-slide",
    label: "S2 hold-only 완료 후 놓기 관대",
    ref: "RFD 0015 §7-3",
    watchFor: "hold-only를 완료하고 손을 뗀 그 keyup만으로 직후 슬라이드가 Perfect로 사는가 (의도된 이완)",
    howTo: "레인 1을 4박부터 6박까지 잡고 있다가, 6.5박 부근(슬라이드)에 손을 뗀다. 새로 누르지 말 것.",
    chart: chartFrom("S2 hold-only then slide", holdOnlyThenSlide()),
  },
  {
    id: "timeout-then-slide",
    label: "S3 타임아웃 사망 후 놓기 관대",
    ref: "RFD 0015 §7-3",
    watchFor: "롱을 타임아웃 Miss로 죽인 뒤 놓는 keyup이 직후 슬라이드를 살리는가",
    howTo: "레인 1 롱[4~6박]을 끝점을 한참 지나(6.5박+) 물고 있다가 슬라이드 부근에 뗀다. 롱은 Miss, 슬라이드는 살아야 관대가 확인된다.",
    chart: chartFrom("S3 timeout then slide", timeoutThenSlide()),
  },
  {
    id: "trill-long-visual",
    label: "S4 트릴 롱노트 시각 확인 (held 색)",
    ref: "시각 확인용",
    watchFor: "trillLong 바디 held 색 — 안 누르면 흰-회색, 누르는 동안 흰 바디 + 중앙 연한 red 코어 + 가장자리 페이드. 끝캡은 옅은 회색.",
    howTo: "레인 2를 잡는다. 긴 롱(1.5s)을 잡아 held 색을 확인한 뒤, 이어지는 짧은 롱들을 교대로 잡는다.",
    chart: chartFrom("S4 trill-long visual", trillLongVisual(), [
      { lane: 2, beat: beat(4, 1), endBeat: beat(11, 1) },
    ]),
  },
];

/** 메트로놈 클릭 시각(ms) — 리드인 포함 차트 전 구간의 매 박. 리듬 레퍼런스용 (BPM 고정). */
export function metronomeClickTimesMs(chart: Chart): number[] {
  const endMs = chartEndMs(chart);
  const beatMs = 60000 / BPM;
  const out: number[] = [];
  for (let ms = 0; ms <= endMs; ms += beatMs) out.push(ms);
  return out;
}

/** 노트 시작 시각(ms) — 강조 클릭용. */
export function noteOnsetTimesMs(chart: Chart): number[] {
  const markers = extractBpmMarkers(chart.events);
  return chart.notes.map((n) => beatToMs(n.beat, markers, chart.meta.offsetMs));
}

/** 차트 마지막 노트 끝 시각(ms) + 여유. */
export function chartEndMs(chart: Chart): number {
  const markers = extractBpmMarkers(chart.events);
  let maxMs = 0;
  for (const n of chart.notes) {
    const endBeat = "endBeat" in n ? n.endBeat : n.beat;
    maxMs = Math.max(maxMs, beatToMs(endBeat, markers, chart.meta.offsetMs));
  }
  return maxMs + 1500;
}
