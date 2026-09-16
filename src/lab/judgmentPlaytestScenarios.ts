/**
 * 판정 실플레이 시나리오 (DEV 전용 lab) — RFD 0020 채택 판정 모델 실측용.
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

/** 4박 리드인 뒤 헤드와 바디를 같은 박에 배치한 연결 체인. */
function holdTrillChain(segDenominator: number, count: number): NoteEntity[] {
  const notes: NoteEntity[] = [];
  const startN = 4 * segDenominator;
  for (let i = 0; i < count; i++) {
    const s = startN + i;
    notes.push({ type: "single", lane: 1, beat: beat(s, segDenominator) });
    notes.push({ type: "long", lane: 1, beat: beat(s, segDenominator), endBeat: beat(s + 1, segDenominator) });
  }
  return notes;
}

/** 인자는 2000ms 리드인 이후의 차트 시각이다. 120BPM에서 1박=500ms. */
const at = (offsetMs: number) => beat(2000 + offsetMs, 500);
const head = (offsetMs: number, double = false): NoteEntity => ({
  type: double ? "double" : "single", lane: 1, beat: at(offsetMs),
});
const body = (startMs: number, endMs: number, double = false, holdOnly = false): NoteEntity => ({
  type: double ? "doubleLong" : "long", lane: 1, beat: at(startMs), endBeat: at(endMs),
  ...(holdOnly ? { holdOnly: true } : {}),
});

function connectedSingle(endMs = 1000): NoteEntity[] {
  return [head(0), body(0, 500), head(500), body(500, endMs)];
}
function connectedDouble(singleMiddleHead = false): NoteEntity[] {
  return [head(0, true), body(0, 500, true), head(500, !singleMiddleHead), body(500, 1000, true)];
}
function decreaseChain(holdOnly = false): NoteEntity[] {
  return [head(0, true), body(0, 500, true, holdOnly), body(500, 1000),
    body(1000, 1500, true, holdOnly), body(1500, 2000)];
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
  group: "connection" | "release" | "holdOnly" | "failure";
  pattern: string;
  caseIds: string[];
}

export const PLAYTEST_SCENARIOS: PlaytestScenario[] = [
  {
    id: "connected-single-swap", label: "o-o- · 유지와 교대", ref: "RFD 0020",
    group: "connection", pattern: "o-o-", caseIds: ["NJ-R06", "NJ-F02"],
    howTo: "유지: 2000ms A 누름 → 2500ms B 탭 → 3000ms A 뗌.\n교대: 2000ms A 누름 → 2500ms A를 떼며 B 누름 → 3000ms B 뗌. 두 방법을 각각 재시도한다.",
    watchFor: "두 방법 모두 헤드 2개와 마지막 release 1개만 정산한다. 정박이면 Perfect 3 · Miss 0 · 100% · Full Combo. 중간 연결 성공은 콤보를 추가하지 않는다.",
    chart: chartFrom("o-o- 유지와 교대", connectedSingle()),
  },
  {
    id: "connected-double-swap", label: "d=d= · 두 키 유지와 전체 교대", ref: "RFD 0020",
    group: "connection", pattern: "d=d=", caseIds: ["NJ-R07"],
    howTo: "유지: 2000ms A/B 누름 → 2500ms C/D 탭 → 3000ms A/B 뗌.\n교대: 2000ms A/B 누름 → 2500ms A/B를 떼며 C/D 누름 → 3000ms C/D 뗌.",
    watchFor: "두 방법 모두 헤드 4개와 마지막 release 2개를 정산한다. 정박이면 Perfect 6 · Miss 0 · 100% · Full Combo. 마지막에는 유지하던 서로 다른 두 키를 떼야 한다.",
    chart: chartFrom("d=d= 유지와 교대", connectedDouble()),
  },
  {
    id: "single-head-double-connection", label: "=o= · 한 몫만 교대", ref: "RFD 0020",
    group: "connection", pattern: "d=o=", caseIds: ["NJ-R12", "NJ-R13"],
    howTo: "유지: 2000ms A/B 누름 → 2500ms C 탭 → 3000ms A/B 뗌.\n교대: 2000ms A/B 누름 → 2500ms B를 떼며 C 누름(A는 유지) → 3000ms A/C 뗌.",
    watchFor: "바디는 계속 2unit이고 중간 헤드는 하나다. 두 방법 모두 정박이면 Perfect 5 · Miss 0. 교대용 up은 한 몫이며 중간에 점수 release를 추가하지 않는다.",
    chart: chartFrom("=o= 한 몫 교대", connectedDouble(true)),
  },
  {
    id: "decrease-chain", label: "=-=- · 실제 감소 두 번", ref: "RFD 0020",
    group: "release", pattern: "d=-=-", caseIds: ["NJ-R01", "NJ-R03"],
    howTo: "2000ms A/B 누름 → 2500ms A 뗌 → 3000ms C 누름 → 3500ms C 뗌 → 4000ms B 뗌.\n대조: 처음 A/B를 계속 유지하고 추가 입력을 생략해 본다.",
    watchFor: "정상 입력은 3 down · 3 up으로 Perfect 5 · Miss 0. 감소 release를 생략한 채 두 키를 잡고 있어도 뒤 증가분의 새 시작을 대신하지 못하고 Miss가 생긴다.",
    chart: chartFrom("=-=- 실제 감소", decreaseChain()),
  },
  {
    id: "holdonly-decrease-chain", label: "감소 holdOnly · 두 키 계속 유지", ref: "RFD 0020",
    group: "holdOnly", pattern: "d=H-=H-", caseIds: ["NJ-H01", "NJ-H02", "NJ-H03"],
    howTo: "2000ms A/B를 누른 뒤 2500ms 감소 · 3000ms 증가 · 3500ms 감소를 두 키 그대로 통과한다. 4000ms에는 A만 떼고, B는 4500ms에 뗀다.",
    watchFor: "두 감소가 holdOnly이므로 중간에 새 입력이 필요 없다. 헤드 2 · holdOnly 4 · 마지막 release 1로 Perfect 7 · Miss 0. 마지막에는 B가 남아 있어도 A의 release가 처리된다.",
    chart: chartFrom("holdOnly 감소 면제", decreaseChain(true)),
  },
  {
    id: "failure-recovery", label: "중간 실패 · 다음 헤드부터 복구", ref: "RFD 0020",
    group: "failure", pattern: "o-o-", caseIds: ["NJ-S01"],
    howTo: "2000ms A 누름 → 2250ms A를 일찍 떼어 첫 바디를 실패시킴 → 2500ms B로 다음 헤드 입력 → 3000ms B 뗌.",
    watchFor: "지나간 첫 바디는 Miss로 남고 다음 바디는 새 헤드로 시작한다. 세 점수 판정이 Perfect면 Perfect 3 · Miss 1 · 100%지만 Full Combo는 NO. 바디 실패 때 콤보와 고도도 내려간다.",
    chart: chartFrom("중간 실패 후 복구", connectedSingle()),
  },
  {
    id: "partial-double-head", label: "더블 헤드 하나만 입력", ref: "RFD 0020",
    group: "failure", pattern: "d=", caseIds: ["NJ-S02"],
    howTo: "2000ms 더블 헤드에서 A만 누르고 B는 누르지 않는다. A는 3000ms에 뗀다.",
    watchFor: "한쪽 헤드만 Miss이며 건강한 바디는 계속 유지한다. 정박 A 입력은 Perfect 2 · Miss 1 · 50% · Full Combo NO. 미시작한 쪽의 끝점은 0점으로 정리하고 추가 Miss를 만들지 않는다.",
    chart: chartFrom("더블 부분 헤드 실패", [head(0, true), body(0, 1000, true)]),
  },
  {
    id: "same-key-short-connection", label: "같은 키 재타격 · 가까운 마지막 release", ref: "RFD 0020",
    group: "release", pattern: "o-o-  (뒤 바디 100ms)", caseIds: ["NJ-R09"],
    howTo: "2000ms A 누름 → 2495ms A 뗌 → 2500ms 같은 A로 두 번째 헤드 재입력 → 2600ms A 뗌. 중간의 뗌과 누름은 헤드에 맞춰 한 번 재타격한다.",
    watchFor: "2495ms up은 연결 교대에 쓰고 마지막 release의 이른 Good으로 쓰지 않는다. 예시 입력은 Perfect 3 · Miss 0. 사람의 입력에서는 각 헤드와 마지막 up의 실제 오차를 함께 확인한다.",
    chart: chartFrom("같은 키 짧은 연결", connectedSingle(600)),
  },
  {
    id: "independent-holdonly-start", label: "독립 holdOnly · 미리 잡은 키와 새 입력", ref: "RFD 0020",
    group: "holdOnly", pattern: "H  (2000~3000ms)", caseIds: ["NJ-A02"],
    howTo: "실패 대조: A를 500ms부터 끝까지 계속 잡고 새 입력 없이 지나간다.\n성공 대조: 재시도하여 2000ms에 A를 새로 누르고 3000ms까지 유지한다.",
    watchFor: "기존 held만 있으면 시작하지 못해 Miss 1 · 0%. 새 입력으로 시작하면 Perfect 1 · Miss 0 · 100%. holdOnly 완료에는 keyup이 필요 없다.",
    chart: chartFrom("독립 holdOnly 시작", [body(0, 1000, false, true)]),
  },
  {
    id: "late-holdonly-start", label: "60ms holdOnly · 끝난 뒤 첫 활성화", ref: "RFD 0020",
    group: "holdOnly", pattern: "H  (2000~2060ms)", caseIds: ["NJ-A06"],
    howTo: "2000ms에는 누르지 않고, 바디 끝 2060ms가 지난 2100ms에 A를 처음 누른다.\n대조: 재시도하여 Normal 시작 기한 2120ms를 넘긴 뒤 누른다.",
    watchFor: "2100ms는 S+Good 이내라 Perfect 1 · Miss 0. 2120ms를 넘기면 Miss 1이며 되살아나지 않는다. 60ms 바디 길이와 시작 기한은 화면의 낙하만으로 구분하기 어려우므로 로그도 확인한다.",
    chart: chartFrom("60ms holdOnly 늦은 시작", [body(0, 60, false, true)]),
  },
  {
    id: "holdonly-then-slide", label: "길이 0 holdOnly · 기존 held로 통과", ref: "RFD 0020",
    group: "holdOnly", pattern: "H--  H(0)", caseIds: ["NJ-Z01"],
    howTo: "2000ms에 A를 누르고 양수 holdOnly의 끝 3000ms를 지나 계속 유지한다. 3250ms 길이 0 holdOnly에서 A를 뗀다. 새로 누를 필요는 없다.",
    watchFor: "Perfect 2 · Miss 0. 길이 0 holdOnly는 3130ms(S−Good)부터 기존 held로 이미 통과할 수 있다. 나중의 up이 별도 점수 판정을 만드는 것은 아니다.",
    chart: chartFrom("holdOnly 뒤 길이 0", [body(0, 1000, false, true), body(1250, 1250, false, true)]),
  },
  {
    id: "timeout-then-slide", label: "앞 release Miss · 길이 0은 독립 판정", ref: "RFD 0020",
    group: "failure", pattern: "---  H(0)", caseIds: ["NJ-Z01"],
    howTo: "2000ms A로 일반 바디를 시작하고, 3000ms release를 생략한 채 3250ms까지 유지한 뒤 뗀다.",
    watchFor: "앞 release는 3120ms 기한을 넘겨 Miss. 뒤 길이 0 holdOnly는 3130ms부터 held로 Perfect다. Perfect 1 · Miss 1 · 50%. 앞 실패를 되돌리거나 뒤에 별도 down을 요구하지 않는다.",
    chart: chartFrom("release Miss 뒤 길이 0", [body(0, 1000), body(1250, 1250, false, true)]),
  },
  ...([1, 2, 4] as const).map((denominator): PlaytestScenario => {
    const intervalMs = 500 / denominator;
    const count = denominator === 1 ? 6 : 8;
    const endMs = 2000 + intervalMs * count;
    return {
      id: denominator === 1 ? "hold-trill-chain" : `hold-trill-chain-${intervalMs}`,
      label: `홀드 트릴 체인 · ${intervalMs}ms 간격`, ref: "RFD 0020",
      group: "connection", pattern: "o-".repeat(count), caseIds: ["NJ-F02", "NJ-R06"],
      howTo: `2000ms 첫 헤드를 A로 누른 뒤 ${intervalMs}ms마다 A/B를 교대한다. 각 헤드에서 앞 키를 떼며 다음 키를 누르고, 마지막은 ${endMs}ms에 뗀다.`,
      watchFor: `정박이면 헤드 ${count}개와 마지막 release 1개로 Perfect ${count + 1} · Miss 0. 연결 성공을 Perfect 개수에 더하지 않는다. 이른 교대에도 아직 지나지 않은 바디가 끊겨 보이지 않는지 확인한다.`,
      chart: chartFrom(`홀드 트릴 ${intervalMs}ms`, holdTrillChain(denominator, count)),
    };
  }),
  {
    id: "trill-long-visual",
    label: "S4 트릴 롱노트 시각 확인 (held 색)",
    ref: "시각 확인용",
    group: "connection", pattern: "trillLong", caseIds: ["S4"],
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
