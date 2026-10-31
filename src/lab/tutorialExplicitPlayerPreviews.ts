import { beat } from '../shared/types/beat';
import type { Beat } from '../shared/types/beat';
import type { ChartDocument, DocumentNoteEntity, TrillZone, TutorialInputEvent } from '../shared/types/chart';
import {
  createExplicitTutorialPreview,
  type ExplicitTutorialPreviewDefinition,
} from '../game/screens/songSelect/explicitTutorialPreviewChart';

/** Lab 시연 한 개와 시연 입력으로 한 반복마다 기대하는 Perfect 수(모든 점수 항목 Perfect). */
export interface TutorialExplicitPlayerPreview {
  readonly preview: ExplicitTutorialPreviewDefinition;
  readonly expectedPerfectCount: number;
}

const meta = (title: string): ChartDocument['meta'] => ({
  title, artist: 'Lab', difficultyLabel: 'TUTORIAL', difficultyLevel: 1,
  imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0,
});

// 시연 키는 레인별 바인딩 슬롯(`BindingN`)으로 적어 재생기가 현재 바인딩 키로 옮긴다.
// 같은 에디터 보조 레인의 이벤트는 겹칠 수 없으므로(RFD 0078) 입력마다 다른 editorLane을 준다.
function inputs(...entries: readonly [lane: 1 | 2 | 3 | 4, slot: 1 | 2, start: Beat, end: Beat][]): TutorialInputEvent[] {
  return entries.map(([lane, slot, start, end], index) => ({
    type: 'tutorialInput', beat: start, endBeat: end, lane, keyCode: `Binding${slot}`, keyLabel: '', editorLane: 3 + index,
  }));
}

function chart(title: string, loopBeats: number, notes: DocumentNoteEntity[], tutorialInputs: TutorialInputEvent[],
  trillZones: TrillZone[] = []): ChartDocument {
  return {
    meta: meta(title),
    notes,
    trillZones,
    restZones: [],
    events: [
      { type: 'bpm', beat: beat(0), bpm: 120 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(loopBeats), editorLane: 2 },
      ...tutorialInputs,
    ],
  };
}

/** 구형 튜토리얼을 변환하지 않고 명시 노트로 직접 저작한 Lab 전용 시연. 공개 튜토리얼 목록에는 넣지 않는다. */
export const tutorialExplicitPlayerPreviews: readonly TutorialExplicitPlayerPreview[] = [
  {
    preview: createExplicitTutorialPreview('tap', '싱글 탭 노트', ['2레인 탭 노트 3개를 두 키로 번갈아 칩니다.'], 4, chart('싱글 탭 노트', 4, [
      { type: 'tap', kind: 'single', lane: 2, beat: beat(1) },
      { type: 'tap', kind: 'single', lane: 2, beat: beat(2) },
      { type: 'tap', kind: 'single', lane: 2, beat: beat(3) },
    ], inputs([2, 1, beat(1), beat(3, 2)], [2, 2, beat(2), beat(5, 2)], [2, 1, beat(3), beat(7, 2)]))),
    expectedPerfectCount: 3,
  },
  {
    preview: createExplicitTutorialPreview('double-tap', '더블 탭 노트', ['1레인과 4레인의 더블 탭 노트를 두 키로 함께 칩니다.'], 4, chart('더블 탭 노트', 4, [
      { type: 'tap', kind: 'double', lane: 1, beat: beat(1) },
      { type: 'tap', kind: 'double', lane: 4, beat: beat(3) },
    ], inputs([1, 1, beat(1), beat(3, 2)], [1, 2, beat(1), beat(3, 2)], [4, 1, beat(3), beat(7, 2)], [4, 2, beat(3), beat(7, 2)]))),
    expectedPerfectCount: 4,
  },
  {
    preview: createExplicitTutorialPreview('body-release', '바디·틱·릴리즈', [
      '3레인은 탭 노트로 바디를 시작해 틱 노트까지 유지하고 릴리즈 노트에서 뗍니다.',
      '2레인 더블 바디의 릴리즈 노트는 반복 경계(6박)와 같은 시각입니다.',
    ], 6, chart('바디·틱·릴리즈', 6, [
      { type: 'tap', kind: 'single', lane: 3, beat: beat(1) },
      { type: 'body', holdCount: 1, lane: 3, beat: beat(1), endBeat: beat(3) },
      { type: 'tick', count: 1, lane: 3, beat: beat(2) },
      { type: 'release', count: 1, lane: 3, beat: beat(3) },
      { type: 'tap', kind: 'double', lane: 2, beat: beat(4) },
      { type: 'body', holdCount: 2, lane: 2, beat: beat(4), endBeat: beat(6) },
      { type: 'release', count: 2, lane: 2, beat: beat(6) },
    ], inputs([3, 1, beat(1), beat(3)], [2, 1, beat(4), beat(6)], [2, 2, beat(4), beat(6)]))),
    expectedPerfectCount: 7,
  },
  {
    preview: createExplicitTutorialPreview('trill', '트릴 교대', ['2레인 트릴 구간의 트릴 탭 노트 4개를 두 키로 번갈아 칩니다.'], 4, chart('트릴 교대', 4, [
      { type: 'tap', kind: 'trill', lane: 2, beat: beat(1) },
      { type: 'tap', kind: 'trill', lane: 2, beat: beat(3, 2) },
      { type: 'tap', kind: 'trill', lane: 2, beat: beat(2) },
      { type: 'tap', kind: 'trill', lane: 2, beat: beat(5, 2) },
    ], inputs(
      [2, 1, beat(1), beat(5, 4)], [2, 2, beat(3, 2), beat(7, 4)], [2, 1, beat(2), beat(9, 4)], [2, 2, beat(5, 2), beat(11, 4)],
    ), [{ lane: 2, beat: beat(1), endBeat: beat(5, 2) }])),
    expectedPerfectCount: 4,
  },
];
