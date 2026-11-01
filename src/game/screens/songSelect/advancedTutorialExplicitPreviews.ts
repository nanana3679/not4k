import type { Beat, ChartDocument, ExplicitNoteEntity, TutorialInputEvent } from '../../../shared/types';
import { beat } from '../../../shared/types/beat';
import {
  createExplicitTutorialPreview,
  type ExplicitTutorialPreviewDefinition,
} from './explicitTutorialPreviewChart';

function tutorialInput(
  keyCode: string,
  startBeat: Beat,
  endBeat: Beat,
  editorLane: number,
): TutorialInputEvent {
  return {
    type: 'tutorialInput', beat: startBeat, endBeat, lane: 1,
    keyCode, keyLabel: keyCode.replace('Key', ''), editorLane,
  };
}

function makeAdvancedChart(
  title: string,
  notes: readonly ExplicitNoteEntity[],
  inputs: readonly TutorialInputEvent[],
): ChartDocument {
  return {
    meta: {
      title, artist: 'not4k', difficultyLabel: 'TUTORIAL', difficultyLevel: 1,
      imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0,
    },
    notes: [...notes],
    trillZones: [],
    events: [
      { type: 'bpm', beat: beat(0), bpm: 120 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(8), editorLane: 2 },
      ...inputs,
    ],
  };
}

// 구형 차트를 1회 변환한 뒤 RFD 0037·0105에 맞춰 저작한 리터럴이다. 실행 중 변환하지 않는다.
const doubleHoldChart = makeAdvancedChart('Advanced d=d=', [
  { type: 'tap', kind: 'double', lane: 1, beat: beat(4) },
  { type: 'body', lane: 1, beat: beat(4), endBeat: beat(5), holdCount: 2 },
  { type: 'tap', kind: 'double', lane: 1, beat: beat(5) },
  { type: 'body', lane: 1, beat: beat(5), endBeat: beat(6), holdCount: 2 },
  { type: 'release', lane: 1, beat: beat(6), count: 2 },
], [
  tutorialInput('KeyQ', beat(4), beat(6), 3),
  tutorialInput('KeyW', beat(4), beat(6), 4),
  tutorialInput('KeyS', beat(5), beat(101, 20), 5),
  tutorialInput('KeyX', beat(5), beat(101, 20), 6),
]);

const doubleSwapChart = makeAdvancedChart('Advanced d=d= swap', [
  { type: 'tap', kind: 'double', lane: 1, beat: beat(4) },
  { type: 'body', lane: 1, beat: beat(4), endBeat: beat(5), holdCount: 2 },
  { type: 'tap', kind: 'double', lane: 1, beat: beat(5) },
  { type: 'body', lane: 1, beat: beat(5), endBeat: beat(6), holdCount: 2 },
  { type: 'release', lane: 1, beat: beat(6), count: 2 },
], [
  tutorialInput('KeyQ', beat(4), beat(5), 3),
  tutorialInput('KeyW', beat(4), beat(5), 4),
  tutorialInput('KeyS', beat(5), beat(6), 5),
  tutorialInput('KeyX', beat(5), beat(6), 6),
]);

const singleHeadDoubleChart = makeAdvancedChart('Advanced =o=', [
  { type: 'tap', kind: 'double', lane: 1, beat: beat(4) },
  { type: 'body', lane: 1, beat: beat(4), endBeat: beat(5), holdCount: 2 },
  { type: 'tap', kind: 'single', lane: 1, beat: beat(5) },
  { type: 'body', lane: 1, beat: beat(5), endBeat: beat(6), holdCount: 2 },
  { type: 'release', lane: 1, beat: beat(6), count: 2 },
], [
  tutorialInput('KeyQ', beat(4), beat(5), 3),
  tutorialInput('KeyW', beat(4), beat(6), 4),
  tutorialInput('KeyS', beat(5), beat(6), 5),
]);

const decreaseChart = makeAdvancedChart('Advanced =-=-', [
  { type: 'tap', kind: 'double', lane: 1, beat: beat(4) },
  { type: 'body', lane: 1, beat: beat(4), endBeat: beat(5), holdCount: 2 },
  // 1차 변환은 감소 릴리즈를 만들지 않으므로 원래 레슨에 맞춰 두 지점에 명시한다.
  { type: 'release', lane: 1, beat: beat(5), count: 1 },
  { type: 'body', lane: 1, beat: beat(5), endBeat: beat(6), holdCount: 1 },
  { type: 'body', lane: 1, beat: beat(6), endBeat: beat(7), holdCount: 2 },
  { type: 'release', lane: 1, beat: beat(7), count: 1 },
  { type: 'body', lane: 1, beat: beat(7), endBeat: beat(8), holdCount: 1 },
  { type: 'release', lane: 1, beat: beat(8), count: 1 },
], [
  tutorialInput('KeyQ', beat(4), beat(5), 3),
  tutorialInput('KeyW', beat(4), beat(8), 4),
  tutorialInput('KeyS', beat(6), beat(7), 5),
]);

const sameKeyChart = makeAdvancedChart('Advanced same key', [
  { type: 'tap', kind: 'single', lane: 1, beat: beat(4) },
  { type: 'body', lane: 1, beat: beat(4), endBeat: beat(5), holdCount: 1 },
  { type: 'tap', kind: 'single', lane: 1, beat: beat(5) },
  { type: 'body', lane: 1, beat: beat(5), endBeat: beat(26, 5), holdCount: 1 },
  { type: 'release', lane: 1, beat: beat(26, 5), count: 1 },
], [
  tutorialInput('KeyQ', beat(4), beat(499, 100), 3),
  tutorialInput('KeyQ', beat(5), beat(26, 5), 4),
]);

const recoveryChart = makeAdvancedChart('Advanced recovery', [
  { type: 'tap', kind: 'single', lane: 1, beat: beat(4) },
  { type: 'body', lane: 1, beat: beat(4), endBeat: beat(5), holdCount: 1 },
  { type: 'tap', kind: 'single', lane: 1, beat: beat(5) },
  { type: 'body', lane: 1, beat: beat(5), endBeat: beat(6), holdCount: 1 },
  { type: 'release', lane: 1, beat: beat(6), count: 1 },
], [
  tutorialInput('KeyQ', beat(4), beat(9, 2), 3),
  tutorialInput('KeyW', beat(5), beat(6), 4),
]);

const partialDoubleChart = makeAdvancedChart('Advanced partial double', [
  { type: 'tap', kind: 'double', lane: 1, beat: beat(4) },
  { type: 'body', lane: 1, beat: beat(4), endBeat: beat(6), holdCount: 2 },
  { type: 'release', lane: 1, beat: beat(6), count: 2 },
], [
  tutorialInput('KeyQ', beat(4), beat(6), 3),
]);

const doubleReleaseChart = makeAdvancedChart('Advanced double release', [
  { type: 'tap', kind: 'double', lane: 1, beat: beat(4) },
  { type: 'body', lane: 1, beat: beat(4), endBeat: beat(6), holdCount: 2 },
  { type: 'release', lane: 1, beat: beat(6), count: 2 },
], [
  tutorialInput('KeyQ', beat(4), beat(6), 3),
  tutorialInput('KeyW', beat(4), beat(8), 4),
  tutorialInput('KeyQ', beat(151, 25), beat(609, 100), 3),
]);

export const ADVANCED_TUTORIAL_EXPLICIT_PREVIEWS: readonly ExplicitTutorialPreviewDefinition[] = [
  createExplicitTutorialPreview('advanced-double-hold', '더블 연결 · 유지와 중간 탭', [
    '이어진 더블 바디는 처음 누른 두 키로 끝까지 유지할 수 있습니다.',
    '중간 더블 탭 노트만 다른 두 키로 짧게 누르고, 마지막 더블 릴리즈 노트에 맞춰 유지하던 두 키를 떼세요.',
    '점수는 시작과 중간의 탭 노트, 마지막 릴리즈 노트에 있습니다. 바디를 이어 유지하는 동작에는 점수나 콤보가 추가되지 않습니다.',
  ], 12, doubleHoldChart),
  createExplicitTutorialPreview('advanced-double-swap', '더블 연결 · 전체 교대', [
    '앞 시연과 같은 패턴을 두 키 모두 갈아타는 방법으로 처리합니다.',
    '중간 더블 탭 노트에서 기존 두 키를 떼고 다른 두 키를 누르세요. 새 두 키로 뒤 바디의 유지를 채웁니다.',
    '중간 경계에는 릴리즈 노트가 없습니다. 새 두 키를 마지막 더블 릴리즈 노트에 맞춰 떼면, 계속 유지하며 중간만 친 방법과 같은 결과입니다.',
  ], 12, doubleSwapChart),
  createExplicitTutorialPreview('advanced-single-head-double', '한 몫만 교대', [
    '더블 바디가 이어지는 곳에 싱글 탭 노트가 있으면 한쪽만 갈아탈 수 있습니다.',
    '한 키는 계속 유지하고, 다른 키를 떼면서 중간 싱글 탭 노트를 새 키로 누르세요. 두 키가 뒤 바디의 유지를 함께 채웁니다.',
    '중간 경계에는 릴리즈 노트가 없고 마지막 릴리즈의 판정 창도 아직 열리지 않았습니다. 끝의 더블 릴리즈 노트에 맞춰 남아 있는 두 키를 각각 떼세요.',
  ], 12, singleHeadDoubleChart),
  createExplicitTutorialPreview('advanced-decrease', '감소와 떼기', [
    '이 예제는 더블 바디가 싱글로 줄어드는 두 지점에 릴리즈 노트가 있습니다. 각 릴리즈 노트에 맞춰 한 키를 떼세요.',
    '다시 더블로 늘어날 때 새 키를 눌러 두 키를 유지하고, 다음 감소에서도 한 키를 떼세요. 마지막 릴리즈 노트에서는 남은 키를 뗍니다.',
    '감소 자체가 아니라 그곳에 놓인 릴리즈 노트가 떼는 타이밍을 판정합니다. 두 키를 계속 누르기만 하면 릴리즈 노트를 놓쳐 통과할 수 없습니다.',
  ], 12, decreaseChart),
  createExplicitTutorialPreview('advanced-same-key', '같은 키 재타격', [
    '시연처럼 연결 직전에 같은 키를 뗐다 다시 눌러 중간 탭 노트를 쳐도 이어집니다.',
    '바디 끝의 릴리즈 노트는 그 바디가 실제로 시작한 뒤에만 처리할 수 있습니다. 시연의 첫 떼기 때는 뒤 바디가 아직 시작되지 않아 마지막 릴리즈를 처리하지 않습니다.',
    '다시 눌러 중간 탭 노트와 뒤 바디를 시작한 뒤, 마지막 릴리즈 노트에 맞춰 한 번 더 떼세요.',
  ], 12, sameKeyChart),
  createExplicitTutorialPreview('advanced-recovery', '중간 실패 후 복구', [
    '시연은 첫 바디를 너무 일찍 떼어 유지에 실패합니다. 그 실패는 뒤 바디로 전파되지 않아 다음 시작 탭 노트부터 새로 잡을 수 있습니다.',
    '앞에서 발생한 Miss는 그대로 남고 콤보가 끊기며 고도도 내려갑니다. 실패한 앞 바디 자체가 되살아나는 것은 아닙니다.',
    '바디는 무점수 구간입니다. 이 예제의 두 탭 노트와 마지막 릴리즈 노트를 모두 Perfect로 처리하면, 바디 유지 Miss가 있어도 달성률은 100%입니다.',
    '그래도 Miss가 있으므로 Full Combo는 아닙니다.',
  ], 12, recoveryChart),
  createExplicitTutorialPreview('advanced-partial-double', '더블 시작을 놓치면', [
    '시연은 시작 더블 탭 노트에서 한 키만 눌러, 누르지 않은 한 몫이 Miss입니다.',
    '성공한 한 몫은 바디를 유지하고 끝의 더블 릴리즈 노트 중 한 몫을 처리할 수 있습니다.',
    '시작에 실패한 몫의 릴리즈는 0점으로 정산하며 Miss를 더 붙이지 않습니다. 점수 항목 4개 중 2개만 성공하므로 Perfect 2개, Miss 1개, 달성률 50%입니다.',
  ], 12, partialDoubleChart),
  createExplicitTutorialPreview('advanced-double-release', '더블 끝의 두 번 떼기', [
    '더블 릴리즈 노트는 서로 다른 두 키를 각각 떼어 처리합니다.',
    '시연은 한 키만 떼고, 그 키를 새 탭 노트 없이 다시 눌렀다 뗍니다. 다른 키는 판정 창이 끝날 때까지 유지합니다.',
    '같은 키로 남은 릴리즈를 처리하는 예외는 재누름으로 해당 바디의 시작 탭 노트를 실제로 처리했을 때뿐입니다. 시연의 재누름은 이 조건을 만족하지 않습니다.',
    '따라서 릴리즈 한 몫만 성공하고 다른 몫은 Miss입니다. 시작 탭 노트까지 합쳐 Perfect 3개, Miss 1개, 달성률 75%입니다.',
  ], 12, doubleReleaseChart),
];
