import type {
  Beat, ChartDocument, ChartEvent, ExplicitNoteEntity, RestZone, TrillZone,
  TutorialDiagramEvent, TutorialInputEvent,
} from '../../../shared/types';
import { beat } from '../../../shared/types/beat';
import {
  createExplicitTutorialPreview,
  type ExplicitTutorialPreviewDefinition,
} from './explicitTutorialPreviewChart';
import { TUTORIAL_OPPOSITE_HAND_BODY_LINE } from './tutorialPreviewChart';

function makeTimingEvents(loopBeats: number): readonly ChartEvent[] {
  return [
    { type: 'bpm', beat: beat(0), bpm: 120 },
    { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(loopBeats), editorLane: 2 },
  ];
}

function makeMeta(title: string): ChartDocument['meta'] {
  return {
    title,
    artist: 'not4k',
    difficultyLabel: 'TUTORIAL',
    difficultyLevel: 1,
    imageFile: '',
    audioFile: '',
    previewAudioFile: '',
    offsetMs: 0,
  };
}

function tutorialInput(
  lane: 1 | 2 | 3 | 4,
  keyCode: string,
  keyLabel: string,
  startBeat: Beat,
  endBeat: Beat,
  editorLane: number,
): TutorialInputEvent {
  return {
    type: 'tutorialInput',
    beat: startBeat,
    endBeat,
    lane,
    keyCode,
    keyLabel,
    editorLane,
  };
}

function tutorialDiagram(
  diagramId: TutorialDiagramEvent['diagramId'],
  startBeat: Beat,
  endBeat: Beat,
  editorLane: number,
): TutorialDiagramEvent {
  return {
    type: 'tutorialDiagram',
    beat: startBeat,
    endBeat,
    diagramId,
    editorLane,
  };
}

function makeBasicChart(
  title: string,
  loopBeats: number,
  notes: readonly ExplicitNoteEntity[],
  tutorialInputs: readonly TutorialInputEvent[],
  trillZones: readonly TrillZone[] = [],
  extraEvents: readonly ChartEvent[] = [],
  restZones: readonly RestZone[] = [],
): ChartDocument {
  return {
    meta: makeMeta(title),
    notes: [...notes],
    trillZones: [...trillZones],
    restZones: [...restZones],
    events: [...makeTimingEvents(loopBeats), ...tutorialInputs, ...extraEvents],
  };
}

const handPlacementChart = makeBasicChart(
  '손배치',
  8,
  [],
  [
    tutorialInput(1, 'Binding1', '', beat(1), beat(7), 3),
    tutorialInput(1, 'Binding2', '', beat(1), beat(7), 4),
    tutorialInput(2, 'Binding1', '', beat(1), beat(7), 5),
    tutorialInput(2, 'Binding3', '', beat(1), beat(7), 6),
    tutorialInput(3, 'Binding1', '', beat(1), beat(7), 7),
    tutorialInput(4, 'Binding1', '', beat(1), beat(7), 8),
    tutorialInput(4, 'Binding2', '', beat(1), beat(7), 9),
    tutorialInput(3, 'Binding3', '', beat(1), beat(7), 10),
  ],
);

const singleNoteChart = makeBasicChart(
  '싱글 노트',
  3,
  [
    { type: 'tap', kind: 'single', lane: 2, beat: beat(1, 2) },
    { type: 'tap', kind: 'single', lane: 2, beat: beat(3, 2) },
    { type: 'tap', kind: 'single', lane: 2, beat: beat(5, 2) },
  ],
  [
    tutorialInput(2, 'KeyF', 'F', beat(1, 2), beat(1), 3),
    tutorialInput(2, 'KeyD', 'D', beat(3, 2), beat(2), 4),
    tutorialInput(2, 'KeyC', 'C', beat(5, 2), beat(3), 5),
  ],
);

const doubleNoteChart = makeBasicChart(
  '더블 노트',
  4,
  [
    { type: 'tap', kind: 'double', lane: 1, beat: beat(1, 2) },
    { type: 'tap', kind: 'double', lane: 2, beat: beat(3, 2) },
    { type: 'tap', kind: 'double', lane: 3, beat: beat(5, 2) },
    { type: 'tap', kind: 'double', lane: 4, beat: beat(7, 2) },
  ],
  [
    tutorialInput(1, 'KeyQ', 'Q', beat(1, 2), beat(1), 3),
    tutorialInput(1, 'KeyW', 'W', beat(1, 2), beat(1), 4),
    tutorialInput(2, 'KeyE', 'E', beat(3, 2), beat(2), 5),
    tutorialInput(2, 'KeyC', 'C', beat(3, 2), beat(2), 6),
    tutorialInput(3, 'Numpad7', '7', beat(5, 2), beat(3), 7),
    tutorialInput(3, 'Numpad1', '1', beat(5, 2), beat(3), 8),
    tutorialInput(4, 'Numpad8', '8', beat(7, 2), beat(4), 9),
    tutorialInput(4, 'Numpad9', '9', beat(7, 2), beat(4), 10),
  ],
);

const trillNoteChart = makeBasicChart(
  '트릴 구간 / 트릴 노트',
  9,
  [
    { type: 'tap', kind: 'trill', lane: 2, beat: beat(1) },
    { type: 'tap', kind: 'trill', lane: 2, beat: beat(2) },
    { type: 'tap', kind: 'trill', lane: 2, beat: beat(3) },
    { type: 'tap', kind: 'trill', lane: 2, beat: beat(4) },
    { type: 'tap', kind: 'trill', lane: 3, beat: beat(5) },
    { type: 'tap', kind: 'trill', lane: 3, beat: beat(6) },
    { type: 'tap', kind: 'trill', lane: 3, beat: beat(7) },
    { type: 'tap', kind: 'trill', lane: 3, beat: beat(8) },
  ],
  [
    tutorialInput(2, 'KeyF', 'F', beat(1), beat(3, 2), 3),
    tutorialInput(2, 'KeyD', 'D', beat(2), beat(5, 2), 4),
    tutorialInput(2, 'KeyF', 'F', beat(3), beat(7, 2), 5),
    tutorialInput(2, 'KeyD', 'D', beat(4), beat(9, 2), 6),
    tutorialInput(3, 'KeyJ', 'J', beat(5), beat(11, 2), 7),
    tutorialInput(3, 'KeyJ', 'J', beat(6), beat(13, 2), 7),
    tutorialInput(3, 'KeyJ', 'J', beat(7), beat(15, 2), 7),
    tutorialInput(3, 'KeyJ', 'J', beat(8), beat(17, 2), 7),
  ],
  [
    { lane: 2, beat: beat(1), endBeat: beat(4) },
    { lane: 3, beat: beat(5), endBeat: beat(8) },
  ],
);

const longNoteChart = makeBasicChart(
  '롱노트',
  7,
  [
    { type: 'tap', kind: 'single', lane: 2, beat: beat(1) },
    { type: 'body', lane: 2, beat: beat(1), endBeat: beat(2), holdCount: 1 },
    { type: 'release', lane: 2, beat: beat(2), count: 1 },
    { type: 'tap', kind: 'double', lane: 3, beat: beat(3) },
    { type: 'body', lane: 3, beat: beat(3), endBeat: beat(4), holdCount: 2 },
    { type: 'release', lane: 3, beat: beat(4), count: 2 },
    { type: 'tap', kind: 'trill', lane: 2, beat: beat(5) },
    { type: 'body', lane: 2, beat: beat(5), endBeat: beat(7), holdCount: 1, trill: true },
  ],
  [
    tutorialInput(2, 'KeyF', 'F', beat(1), beat(2), 3),
    tutorialInput(3, 'KeyJ', 'J', beat(3), beat(4), 4),
    tutorialInput(3, 'KeyK', 'K', beat(3), beat(4), 5),
    tutorialInput(2, 'KeyD', 'D', beat(5), beat(7), 6),
  ],
  [
    { lane: 2, beat: beat(5), endBeat: beat(7) },
  ],
);

const releaseTapChart = makeBasicChart(
  '릴리즈탭',
  5,
  [
    { type: 'tap', kind: 'single', lane: 2, beat: beat(1) },
    { type: 'body', lane: 2, beat: beat(1), endBeat: beat(4), holdCount: 1 },
    { type: 'tap', kind: 'single', lane: 2, beat: beat(4) },
  ],
  [
    tutorialInput(2, 'KeyF', 'F', beat(1), beat(4), 3),
    tutorialInput(2, 'KeyD', 'D', beat(4), beat(9, 2), 4),
  ],
);

const connectedLongNoteSwitchChart = makeBasicChart(
  '이어진 롱노트 - 갈아타기',
  8,
  [
    { type: 'tap', kind: 'single', lane: 2, beat: beat(6) },
    { type: 'body', lane: 2, beat: beat(6), endBeat: beat(7), holdCount: 1 },
    { type: 'tap', kind: 'single', lane: 2, beat: beat(7) },
    { type: 'body', lane: 2, beat: beat(7), endBeat: beat(8), holdCount: 1 },
    { type: 'release', lane: 2, beat: beat(8), count: 1 },
  ],
  [
    tutorialInput(2, 'KeyF', 'F', beat(6), beat(7), 3),
    tutorialInput(2, 'KeyD', 'D', beat(7), beat(8), 4),
  ],
  [],
  [
    tutorialDiagram('connected-switch', beat(0), beat(2), 7),
  ],
);

const connectedLongNoteOverlapChart = makeBasicChart(
  '이어진 롱노트 - 겹쳐 누르기',
  8,
  [
    { type: 'tap', kind: 'single', lane: 3, beat: beat(6) },
    { type: 'body', lane: 3, beat: beat(6), endBeat: beat(7), holdCount: 1 },
    { type: 'tap', kind: 'single', lane: 3, beat: beat(7) },
    { type: 'body', lane: 3, beat: beat(7), endBeat: beat(8), holdCount: 1 },
    { type: 'release', lane: 3, beat: beat(8), count: 1 },
  ],
  [
    tutorialInput(3, 'KeyJ', 'J', beat(6), beat(8), 3),
    tutorialInput(3, 'KeyK', 'K', beat(7), beat(15, 2), 4),
  ],
  [],
  [
    tutorialDiagram('connected-overlap', beat(0), beat(2), 7),
  ],
);

const connectedTrillLongChart = makeBasicChart(
  '이어진 트릴 롱노트',
  8,
  [
    { type: 'tap', kind: 'trill', lane: 2, beat: beat(2) },
    { type: 'body', lane: 2, beat: beat(2), endBeat: beat(3), holdCount: 1, trill: true },
    { type: 'tap', kind: 'trill', lane: 2, beat: beat(3) },
    { type: 'body', lane: 2, beat: beat(3), endBeat: beat(4), holdCount: 1, trill: true },
    { type: 'tap', kind: 'trill', lane: 3, beat: beat(5) },
    { type: 'body', lane: 3, beat: beat(5), endBeat: beat(6), holdCount: 1, trill: true },
    { type: 'tap', kind: 'trill', lane: 3, beat: beat(6) },
    { type: 'body', lane: 3, beat: beat(6), endBeat: beat(7), holdCount: 1, trill: true },
  ],
  [
    tutorialInput(2, 'KeyF', 'F', beat(2), beat(3), 3),
    tutorialInput(2, 'KeyD', 'D', beat(3), beat(4), 4),
    tutorialInput(3, 'KeyJ', 'J', beat(5), beat(7), 5),
    tutorialInput(3, 'KeyK', 'K', beat(6), beat(13, 2), 6),
  ],
  [
    { lane: 2, beat: beat(2), endBeat: beat(4) },
    { lane: 3, beat: beat(5), endBeat: beat(7) },
  ],
);

const headlessLongNoteChart = makeBasicChart(
  '헤드 없는 롱노트',
  5,
  [
    { type: 'body', lane: 2, beat: beat(2), endBeat: beat(5), holdCount: 1 },
    { type: 'release', lane: 2, beat: beat(5), count: 1 },
  ],
  [
    tutorialInput(2, 'KeyF', 'F', beat(9, 5), beat(5), 3),
  ],
);

const standaloneReleaseChart = makeBasicChart(
  '릴리즈 노트',
  3,
  [
    { type: 'release', lane: 2, beat: beat(2), count: 1 },
  ],
  [
    tutorialInput(2, 'KeyF', 'F', beat(9, 5), beat(2), 3),
  ],
);

const graceNoteChart = makeBasicChart(
  'grace 노트',
  5,
  [
    { type: 'tap', kind: 'single', lane: 2, beat: beat(1), grace: true },
    { type: 'tap', kind: 'single', lane: 2, beat: beat(3), grace: true },
  ],
  [
    tutorialInput(2, 'KeyF', 'F', beat(1), beat(3, 2), 3),
    tutorialInput(2, 'KeyD', 'D', beat(3), beat(7, 2), 4),
  ],
);

const bodyWithoutReleaseChart = makeBasicChart(
  '릴리즈 없는 롱노트',
  5,
  [
    { type: 'tap', kind: 'single', lane: 2, beat: beat(1) },
    { type: 'body', lane: 2, beat: beat(1), endBeat: beat(4), holdCount: 1 },
    { type: 'tick', lane: 2, beat: beat(4), count: 1 },
  ],
  [
    tutorialInput(2, 'KeyF', 'F', beat(1), beat(9, 2), 3),
  ],
);

const zeroLengthBodyTickChart = makeBasicChart(
  '길이가 0인 바디와 틱 노트',
  5,
  [
    { type: 'body', lane: 2, beat: beat(3), endBeat: beat(3), holdCount: 1 },
    { type: 'tick', lane: 2, beat: beat(3), count: 1 },
  ],
  [
    tutorialInput(2, 'KeyF', 'F', beat(11, 4), beat(13, 4), 3),
  ],
);

const restZoneChart = makeBasicChart(
  '휴지 구간',
  8,
  [
    { type: 'tap', kind: 'trill', lane: 1, beat: beat(2) },
    { type: 'tap', kind: 'trill', lane: 1, beat: beat(9, 4) },
    { type: 'tap', kind: 'trill', lane: 1, beat: beat(5, 2) },
    { type: 'tap', kind: 'trill', lane: 1, beat: beat(11, 4) },
    { type: 'tap', kind: 'trill', lane: 4, beat: beat(6) },
    { type: 'tap', kind: 'trill', lane: 4, beat: beat(25, 4) },
    { type: 'tap', kind: 'trill', lane: 4, beat: beat(13, 2) },
    { type: 'tap', kind: 'trill', lane: 4, beat: beat(27, 4) },
  ],
  [
    // 왼손 트릴: Q/W 교대
    tutorialInput(1, 'KeyQ', 'Q', beat(2), beat(9, 4), 3),
    tutorialInput(1, 'KeyW', 'W', beat(9, 4), beat(5, 2), 4),
    tutorialInput(1, 'KeyQ', 'Q', beat(5, 2), beat(11, 4), 5),
    tutorialInput(1, 'KeyW', 'W', beat(11, 4), beat(3), 6),
    // 오른손 트릴: 8/9 교대
    tutorialInput(4, 'Numpad8', '8', beat(6), beat(25, 4), 7),
    tutorialInput(4, 'Numpad9', '9', beat(25, 4), beat(13, 2), 8),
    tutorialInput(4, 'Numpad8', '8', beat(13, 2), beat(27, 4), 9),
    tutorialInput(4, 'Numpad9', '9', beat(27, 4), beat(7), 10),
  ],
  [
    // 트릴존: 트릴 레인(1·4)만
    { lane: 1, beat: beat(2), endBeat: beat(3) },
    { lane: 4, beat: beat(6), endBeat: beat(7) },
  ],
  [], // extraEvents 없음
  [
    // restZone: 2레인 beat 1→5, 3레인 beat 5→9 dim (트릴 레인과 안 겹침)
    { lane: 2, beat: beat(1), endBeat: beat(5) },
    { lane: 3, beat: beat(5), endBeat: beat(9) },
  ],
);

const horizontalMovementChart = makeBasicChart(
  '수평 이동',
  8,
  [
    { type: 'tap', kind: 'single', lane: 1, beat: beat(1, 2) },
    { type: 'tap', kind: 'single', lane: 2, beat: beat(1, 2) },
    { type: 'tap', kind: 'single', lane: 2, beat: beat(3, 2) },
    { type: 'tap', kind: 'single', lane: 3, beat: beat(3, 2) },
    { type: 'tap', kind: 'single', lane: 1, beat: beat(5, 2) },
    { type: 'tap', kind: 'single', lane: 2, beat: beat(5, 2) },
    { type: 'tap', kind: 'single', lane: 2, beat: beat(7, 2) },
    { type: 'tap', kind: 'single', lane: 3, beat: beat(7, 2) },
    { type: 'tap', kind: 'single', lane: 2, beat: beat(9, 2) },
    { type: 'tap', kind: 'single', lane: 3, beat: beat(9, 2) },
    { type: 'tap', kind: 'single', lane: 3, beat: beat(11, 2) },
    { type: 'tap', kind: 'single', lane: 4, beat: beat(11, 2) },
    { type: 'tap', kind: 'single', lane: 2, beat: beat(13, 2) },
    { type: 'tap', kind: 'single', lane: 3, beat: beat(13, 2) },
    { type: 'tap', kind: 'single', lane: 3, beat: beat(15, 2) },
    { type: 'tap', kind: 'single', lane: 4, beat: beat(15, 2) },
  ],
  [
    tutorialInput(1, 'KeyW', 'W', beat(1, 2), beat(1), 3),
    tutorialInput(2, 'KeyE', 'E', beat(1, 2), beat(1), 4),
    tutorialInput(2, 'PageDown', 'PD', beat(3, 2), beat(2), 5),
    tutorialInput(3, 'Numpad7', '7', beat(3, 2), beat(2), 6),
    tutorialInput(1, 'KeyW', 'W', beat(5, 2), beat(3), 7),
    tutorialInput(2, 'KeyE', 'E', beat(5, 2), beat(3), 8),
    tutorialInput(2, 'PageDown', 'PD', beat(7, 2), beat(4), 9),
    tutorialInput(3, 'Numpad7', '7', beat(7, 2), beat(4), 10),
    tutorialInput(2, 'KeyE', 'E', beat(9, 2), beat(5), 11),
    tutorialInput(3, 'KeyR', 'R', beat(9, 2), beat(5), 12),
    tutorialInput(3, 'Numpad7', '7', beat(11, 2), beat(6), 13),
    tutorialInput(4, 'Numpad8', '8', beat(11, 2), beat(6), 14),
    tutorialInput(2, 'KeyE', 'E', beat(13, 2), beat(7), 15),
    tutorialInput(3, 'KeyR', 'R', beat(13, 2), beat(7), 16),
    tutorialInput(3, 'Numpad7', '7', beat(15, 2), beat(8), 17),
    tutorialInput(4, 'Numpad8', '8', beat(15, 2), beat(8), 18),
  ],
);

const verticalMovementChart = makeBasicChart(
  '수직 이동',
  8,
  [
    { type: 'tap', kind: 'single', lane: 1, beat: beat(1, 2) },
    { type: 'tap', kind: 'single', lane: 2, beat: beat(1, 2) },
    { type: 'tap', kind: 'single', lane: 1, beat: beat(3, 2) },
    { type: 'tap', kind: 'single', lane: 2, beat: beat(3, 2) },
    { type: 'tap', kind: 'single', lane: 1, beat: beat(5, 2) },
    { type: 'tap', kind: 'single', lane: 2, beat: beat(5, 2) },
    { type: 'tap', kind: 'single', lane: 1, beat: beat(7, 2) },
    { type: 'tap', kind: 'single', lane: 2, beat: beat(7, 2) },
    { type: 'tap', kind: 'single', lane: 3, beat: beat(9, 2) },
    { type: 'tap', kind: 'single', lane: 4, beat: beat(9, 2) },
    { type: 'tap', kind: 'single', lane: 3, beat: beat(11, 2) },
    { type: 'tap', kind: 'single', lane: 4, beat: beat(11, 2) },
    { type: 'tap', kind: 'single', lane: 3, beat: beat(13, 2) },
    { type: 'tap', kind: 'single', lane: 4, beat: beat(13, 2) },
    { type: 'tap', kind: 'single', lane: 3, beat: beat(15, 2) },
    { type: 'tap', kind: 'single', lane: 4, beat: beat(15, 2) },
  ],
  [
    tutorialInput(1, 'KeyW', 'W', beat(1, 2), beat(1), 3),
    tutorialInput(2, 'KeyE', 'E', beat(1, 2), beat(1), 4),
    tutorialInput(1, 'KeyS', 'S', beat(3, 2), beat(2), 5),
    tutorialInput(2, 'KeyD', 'D', beat(3, 2), beat(2), 6),
    tutorialInput(1, 'KeyW', 'W', beat(5, 2), beat(3), 7),
    tutorialInput(2, 'KeyE', 'E', beat(5, 2), beat(3), 8),
    tutorialInput(1, 'KeyS', 'S', beat(7, 2), beat(4), 9),
    tutorialInput(2, 'KeyD', 'D', beat(7, 2), beat(4), 10),
    tutorialInput(3, 'Numpad7', '7', beat(9, 2), beat(5), 11),
    tutorialInput(4, 'Numpad8', '8', beat(9, 2), beat(5), 12),
    tutorialInput(3, 'Numpad1', '1', beat(11, 2), beat(6), 13),
    tutorialInput(4, 'Numpad2', '2', beat(11, 2), beat(6), 14),
    tutorialInput(3, 'Numpad7', '7', beat(13, 2), beat(7), 15),
    tutorialInput(4, 'Numpad8', '8', beat(13, 2), beat(7), 16),
    tutorialInput(3, 'Numpad1', '1', beat(15, 2), beat(8), 17),
    tutorialInput(4, 'Numpad2', '2', beat(15, 2), beat(8), 18),
  ],
);

/**
 * Basic 17개의 명시 노트 원본. RFD 0105에 따라 일회성 변환 결과를 소스에 고정했다.
 * loopBeats는 원본 시간 맵에서 마지막 노트·바디 끝 뒤 2000ms를 확보하는 최소 정수 박이다.
 * 원본 박자표·노트·시연·도식의 시각은 유지하며, 여백과 최소 길이는 테스트에서 시간 맵으로 검증한다.
 * 공개 목록 연결은 후속 작업이며, 실행 중 구형 노트를 변환하지 않는다(RFD 0037 §8).
 */
export const BASIC_TUTORIAL_EXPLICIT_PREVIEWS: readonly ExplicitTutorialPreviewDefinition[] = [
  createExplicitTutorialPreview(
    'hand-placement',
    '손배치',
    [
      '왼손은 Q W E C에 약지·중지·검지·엄지를 올려두세요',
      TUTORIAL_OPPOSITE_HAND_BODY_LINE,
      '키 배치는 옵션에서 언제든 바꿀 수 있습니다',
    ],
    11,
    handPlacementChart,
  ),
  createExplicitTutorialPreview(
    'single-note',
    '싱글 노트',
    [
      '한 레인에는 여러 키를 바인딩할 수 있습니다',
      '같은 노트를 다양한 키로 처리해 보세요',
    ],
    7,
    singleNoteChart,
  ),
  createExplicitTutorialPreview(
    'double-note',
    '더블 노트',
    [
      '더블 노트는 같은 레인의 서로 다른 두 키로 처리합니다',
      '정확히 동시에 누르지 않아도 각 입력이 Good 윈도우 안이면 됩니다',
    ],
    8,
    doubleNoteChart,
  ),
  createExplicitTutorialPreview(
    'trill-note',
    '트릴 구간 / 트릴 노트',
    [
      '트릴 구간에서는 앞 트릴 노트를 처리한 키와 다른 키로 다음 트릴 노트를 쳐야 합니다',
      '같은 키를 연속으로 누르면 GOOD◇으로 강등됩니다',
    ],
    12,
    trillNoteChart,
  ),
  createExplicitTutorialPreview(
    'long-note',
    '롱노트',
    [
      '롱노트가 시작할 때 누르고, 릴리즈 노트에서 떼세요',
      '더블 롱노트는 두 키를 끝까지 유지합니다',
      '트릴 롱노트는 끝까지 유지하면 됩니다. 끝에서 떼는 타이밍은 판정하지 않습니다',
    ],
    11,
    longNoteChart,
  ),
  createExplicitTutorialPreview(
    'release-tap',
    '릴리즈탭',
    [
      '롱노트 끝에 탭 노트가 함께 나올 수 있습니다',
      '떼는 순간에 다른 키를 함께 누르세요',
      '이 롱노트 끝에는 릴리즈 노트가 없어 떼는 타이밍을 판정하지 않습니다',
    ],
    8,
    releaseTapChart,
  ),
  createExplicitTutorialPreview(
    'connected-long-note-switch',
    '이어진 롱노트 - 갈아타기',
    [
      '롱노트 끝에서 같은 레인의 다음 롱노트로 바로 이어질 수 있습니다',
      '연결 지점에서 이전 키를 떼며 다음 키로 갈아탈 수 있습니다',
      '릴리즈 노트가 없는 연결 지점에서는 떼는 타이밍을 따로 판정하지 않습니다',
    ],
    12,
    connectedLongNoteSwitchChart,
  ),
  createExplicitTutorialPreview(
    'connected-long-note-overlap',
    '이어진 롱노트 - 겹쳐 누르기',
    [
      '롱노트 끝에서 같은 레인의 다음 롱노트로 바로 이어질 수 있습니다',
      '기존 키를 누른 채 새 키를 더 눌러 연결을 처리할 수 있습니다',
      '릴리즈 노트가 없는 연결 지점에서는 떼는 타이밍을 따로 판정하지 않습니다',
    ],
    12,
    connectedLongNoteOverlapChart,
  ),
  createExplicitTutorialPreview(
    'connected-trill-long',
    '이어진 트릴 롱노트',
    [
      '이어진 트릴 롱노트도 갈아타기·겹쳐 누르기로 이어진 롱노트와 동일하게 처리할 수 있습니다',
      '트릴 롱노트는 끝까지 유지하면 됩니다. 끝에서 떼는 타이밍은 판정하지 않습니다',
    ],
    11,
    connectedTrillLongChart,
  ),
  createExplicitTutorialPreview(
    'headless-long-note',
    '헤드 없는 롱노트',
    [
      '롱노트가 탭 노트 없이 시작될 수 있습니다',
      '미리 누르거나 시작 근처에서 누른 뒤 유지하세요. 누르는 타이밍은 점수에 반영되지 않습니다',
    ],
    9,
    headlessLongNoteChart,
  ),
  createExplicitTutorialPreview(
    'zero-length-long-note',
    '릴리즈 노트',
    ['미리 누르고 있다가 노트에 맞춰 떼세요. 떼는 타이밍만 판정합니다'],
    6,
    standaloneReleaseChart,
  ),
  createExplicitTutorialPreview(
    'grace-note',
    'grace 노트',
    ['Good 윈도우 안에 치면 타이밍 등급은 Perfect가 됩니다. 트릴 노트라면 키를 바꿔 치는 조건은 그대로입니다'],
    7,
    graceNoteChart,
  ),
  createExplicitTutorialPreview(
    'hold-only-long-note',
    '릴리즈 없는 롱노트',
    ['바디 끝까지 유지하세요. 끝에 릴리즈 노트가 없어 그때 떼지 않아도 됩니다'],
    8,
    bodyWithoutReleaseChart,
  ),
  createExplicitTutorialPreview(
    'zero-length-hold-only-long-note',
    '길이가 0인 바디와 틱 노트',
    ['틱 노트가 오는 순간 키를 누르고만 있으면 됩니다'],
    7,
    zeroLengthBodyTickChart,
  ),
  createExplicitTutorialPreview(
    'rest-zone',
    '휴지 구간',
    [
      '어둡게 표시된 레인은 그 구간 동안 노트가 나오지 않습니다',
      '한 손이 트릴을 처리하는 동안 쉬는 레인을 미리 알려줍니다',
      '휴지 구간을 이용해 다음 패턴을 위한 손 위치를 준비하세요',
    ],
    11,
    restZoneChart,
  ),
  createExplicitTutorialPreview(
    'horizontal-movement',
    '수평 이동',
    [
      '표시된 키를 따라 손 위치를 옆 레인으로 옮깁니다',
      '고정된 손배치로 처리하기 어려운 패턴을 유동적인 손배치로 처리해 보세요',
    ],
    12,
    horizontalMovementChart,
  ),
  createExplicitTutorialPreview(
    'vertical-movement',
    '수직 이동',
    ['수직으로 이동해서 노트를 처리할 수 있습니다'],
    12,
    verticalMovementChart,
  ),
];
