import type { Beat, Chart, ChartEvent, NoteEntity, TrillZone, TutorialDiagramEvent, TutorialInputEvent } from '../../../shared/types';
import { beat, beatAdd } from '../../../shared/types/beat';
import { beatToMs, extractBpmMarkers } from '../../../shared/timing';

export const TUTORIAL_PREVIEW_LOOP_BEATS = 8;
export const TUTORIAL_PREVIEW_LOOP_MS = 4000;
export const TUTORIAL_PREVIEW_RENDER_CYCLES = 3;
export const TUTORIAL_PREVIEW_RENDER_START_MS = TUTORIAL_PREVIEW_LOOP_MS;
export const TUTORIAL_PREVIEW_RENDER_DURATION_MS = TUTORIAL_PREVIEW_LOOP_MS * TUTORIAL_PREVIEW_RENDER_CYCLES;

export interface TutorialInputTiming {
  event: TutorialInputEvent;
  startMs: number;
  endMs: number;
}

export interface TutorialDiagramTiming {
  event: TutorialDiagramEvent;
  startMs: number;
  endMs: number;
}

export interface TutorialPreviewDefinition {
  id: string;
  title: string;
  bodyLines: readonly string[];
  loopBeats: number;
  chart: Chart;
  renderChart: Chart;
  loopMs: number;
  renderStartMs: number;
  renderDurationMs: number;
}

export const TUTORIAL_OPPOSITE_HAND_BODY_LINE = '{oppositeHandPlacement}';

function makeTimingEvents(loopBeats: number): readonly ChartEvent[] {
  return [
    { type: 'bpm', beat: beat(0), bpm: 120 },
    { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(loopBeats) },
  ];
}

function makeMeta(title: string): Chart['meta'] {
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

function makeChart(
  title: string,
  loopBeats: number,
  notes: readonly NoteEntity[],
  tutorialInputs: readonly TutorialInputEvent[],
  trillZones: readonly TrillZone[] = [],
  extraEvents: readonly ChartEvent[] = [],
): Chart {
  return {
    meta: makeMeta(title),
    notes: [...notes],
    trillZones: [...trillZones],
    events: [...makeTimingEvents(loopBeats), ...tutorialInputs, ...extraEvents],
  };
}

const handPlacementChart = makeChart(
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

const singleNoteChart = makeChart(
  '싱글 노트',
  3,
  [
    { type: 'single', lane: 2, beat: beat(1, 2) },
    { type: 'single', lane: 2, beat: beat(3, 2) },
    { type: 'single', lane: 2, beat: beat(5, 2) },
  ],
  [
    tutorialInput(2, 'KeyF', 'F', beat(1, 2), beat(1), 3),
    tutorialInput(2, 'KeyD', 'D', beat(3, 2), beat(2), 4),
    tutorialInput(2, 'KeyC', 'C', beat(5, 2), beat(3), 5),
  ],
);

const doubleNoteChart = makeChart(
  '더블 노트',
  4,
  [
    { type: 'double', lane: 1, beat: beat(1, 2) },
    { type: 'double', lane: 2, beat: beat(3, 2) },
    { type: 'double', lane: 3, beat: beat(5, 2) },
    { type: 'double', lane: 4, beat: beat(7, 2) },
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

const trillNoteChart = makeChart(
  '트릴 구간 / 트릴 노트',
  9,
  [
    { type: 'trill', lane: 2, beat: beat(1) },
    { type: 'trill', lane: 2, beat: beat(2) },
    { type: 'trill', lane: 2, beat: beat(3) },
    { type: 'trill', lane: 2, beat: beat(4) },
    { type: 'trill', lane: 3, beat: beat(5) },
    { type: 'trill', lane: 3, beat: beat(6) },
    { type: 'trill', lane: 3, beat: beat(7) },
    { type: 'trill', lane: 3, beat: beat(8) },
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

const longNoteChart = makeChart(
  '롱노트',
  7,
  [
    { type: 'single', lane: 2, beat: beat(1) },
    { type: 'long', lane: 2, beat: beat(1), endBeat: beat(2) },
    { type: 'double', lane: 3, beat: beat(3) },
    { type: 'doubleLong', lane: 3, beat: beat(3), endBeat: beat(4) },
    { type: 'trill', lane: 2, beat: beat(5) },
    { type: 'trillLong', lane: 2, beat: beat(5), endBeat: beat(7) },
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

const releaseTapChart = makeChart(
  '릴리즈탭',
  5,
  [
    { type: 'single', lane: 2, beat: beat(1) },
    { type: 'long', lane: 2, beat: beat(1), endBeat: beat(4) },
    { type: 'single', lane: 2, beat: beat(4) },
  ],
  [
    tutorialInput(2, 'KeyF', 'F', beat(1), beat(4), 3),
    tutorialInput(2, 'KeyD', 'D', beat(4), beat(9, 2), 4),
  ],
);

const connectedLongNoteSwitchChart = makeChart(
  '이어진 롱노트 - 갈아타기',
  8,
  [
    { type: 'single', lane: 2, beat: beat(6) },
    { type: 'long', lane: 2, beat: beat(6), endBeat: beat(7) },
    { type: 'single', lane: 2, beat: beat(7) },
    { type: 'long', lane: 2, beat: beat(7), endBeat: beat(8) },
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

const connectedLongNoteOverlapChart = makeChart(
  '이어진 롱노트 - 겹쳐 누르기',
  8,
  [
    { type: 'single', lane: 3, beat: beat(6) },
    { type: 'long', lane: 3, beat: beat(6), endBeat: beat(7) },
    { type: 'single', lane: 3, beat: beat(7) },
    { type: 'long', lane: 3, beat: beat(7), endBeat: beat(8) },
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

const connectedTrillLongChart = makeChart(
  '이어진 트릴 롱노트',
  8,
  [
    // 갈아타기(2레인): 트릴 롱노트를 F로 시작해 연결점에서 D로 갈아탄다
    { type: 'trill', lane: 2, beat: beat(2) },
    { type: 'trillLong', lane: 2, beat: beat(2), endBeat: beat(3) },
    { type: 'trill', lane: 2, beat: beat(3) },
    { type: 'trillLong', lane: 2, beat: beat(3), endBeat: beat(4) },
    // 겹쳐 누르기(3레인): J를 끝까지 잡은 채 연결점에서 K를 탭한다
    { type: 'trill', lane: 3, beat: beat(5) },
    { type: 'trillLong', lane: 3, beat: beat(5), endBeat: beat(6) },
    { type: 'trill', lane: 3, beat: beat(6) },
    { type: 'trillLong', lane: 3, beat: beat(6), endBeat: beat(7) },
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

const headlessLongNoteChart = makeChart(
  '헤드 없는 롱노트',
  5,
  [
    { type: 'long', lane: 2, beat: beat(2), endBeat: beat(5) },
  ],
  [
    tutorialInput(2, 'KeyF', 'F', beat(3, 2), beat(5), 3),
  ],
);

const zeroLengthLongNoteChart = makeChart(
  '길이가 0인 롱노트',
  3,
  [
    { type: 'long', lane: 2, beat: beat(2), endBeat: beat(2) },
  ],
  [
    tutorialInput(2, 'KeyF', 'F', beat(3, 2), beat(2), 3),
  ],
);

const graceNoteChart = makeChart(
  'grace 노트',
  5,
  [
    { type: 'single', lane: 2, beat: beat(1), grace: true },
    { type: 'single', lane: 2, beat: beat(3), grace: true },
  ],
  [
    tutorialInput(2, 'KeyF', 'F', beat(1), beat(3, 2), 3),
    tutorialInput(2, 'KeyD', 'D', beat(3), beat(7, 2), 4),
  ],
);

const holdOnlyLongNoteChart = makeChart(
  'grace 롱노트',
  5,
  [
    { type: 'single', lane: 2, beat: beat(1) },
    { type: 'long', lane: 2, beat: beat(1), endBeat: beat(4), holdOnly: true },
  ],
  [
    tutorialInput(2, 'KeyF', 'F', beat(1), beat(9, 2), 3),
  ],
);

const zeroLengthHoldOnlyLongNoteChart = makeChart(
  '길이가 0인 grace 롱노트',
  5,
  [
    { type: 'long', lane: 2, beat: beat(3), endBeat: beat(3), holdOnly: true },
  ],
  [
    tutorialInput(2, 'KeyF', 'F', beat(11, 4), beat(13, 4), 3),
  ],
);

const horizontalMovementChart = makeChart(
  '수평 이동',
  8,
  [
    { type: 'single', lane: 1, beat: beat(1, 2) },
    { type: 'single', lane: 2, beat: beat(1, 2) },
    { type: 'single', lane: 2, beat: beat(3, 2) },
    { type: 'single', lane: 3, beat: beat(3, 2) },
    { type: 'single', lane: 1, beat: beat(5, 2) },
    { type: 'single', lane: 2, beat: beat(5, 2) },
    { type: 'single', lane: 2, beat: beat(7, 2) },
    { type: 'single', lane: 3, beat: beat(7, 2) },
    { type: 'single', lane: 2, beat: beat(9, 2) },
    { type: 'single', lane: 3, beat: beat(9, 2) },
    { type: 'single', lane: 3, beat: beat(11, 2) },
    { type: 'single', lane: 4, beat: beat(11, 2) },
    { type: 'single', lane: 2, beat: beat(13, 2) },
    { type: 'single', lane: 3, beat: beat(13, 2) },
    { type: 'single', lane: 3, beat: beat(15, 2) },
    { type: 'single', lane: 4, beat: beat(15, 2) },
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

const verticalMovementChart = makeChart(
  '수직 이동',
  8,
  [
    { type: 'single', lane: 1, beat: beat(1, 2) },
    { type: 'single', lane: 2, beat: beat(1, 2) },
    { type: 'single', lane: 1, beat: beat(3, 2) },
    { type: 'single', lane: 2, beat: beat(3, 2) },
    { type: 'single', lane: 1, beat: beat(5, 2) },
    { type: 'single', lane: 2, beat: beat(5, 2) },
    { type: 'single', lane: 1, beat: beat(7, 2) },
    { type: 'single', lane: 2, beat: beat(7, 2) },
    { type: 'single', lane: 3, beat: beat(9, 2) },
    { type: 'single', lane: 4, beat: beat(9, 2) },
    { type: 'single', lane: 3, beat: beat(11, 2) },
    { type: 'single', lane: 4, beat: beat(11, 2) },
    { type: 'single', lane: 3, beat: beat(13, 2) },
    { type: 'single', lane: 4, beat: beat(13, 2) },
    { type: 'single', lane: 3, beat: beat(15, 2) },
    { type: 'single', lane: 4, beat: beat(15, 2) },
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

const RENDER_CYCLE_INDICES = [0, 1, 2] as const;

function offsetBeatByLoopCycle(sourceBeat: Beat, cycleIndex: number, loopBeats: number) {
  return beatAdd(sourceBeat, beat(loopBeats * cycleIndex));
}

function offsetNoteByLoopCycle(note: NoteEntity, cycleIndex: number, loopBeats: number): NoteEntity {
  const shiftedBeat = offsetBeatByLoopCycle(note.beat, cycleIndex, loopBeats);
  if ('endBeat' in note) {
    return {
      ...note,
      beat: shiftedBeat,
      endBeat: offsetBeatByLoopCycle(note.endBeat, cycleIndex, loopBeats),
    };
  }

  return {
    ...note,
    beat: shiftedBeat,
  };
}

function offsetTrillZoneByLoopCycle(zone: TrillZone, cycleIndex: number, loopBeats: number): TrillZone {
  return {
    ...zone,
    beat: offsetBeatByLoopCycle(zone.beat, cycleIndex, loopBeats),
    endBeat: offsetBeatByLoopCycle(zone.endBeat, cycleIndex, loopBeats),
  };
}

function createRenderChart(chart: Chart, loopBeats: number): Chart {
  const renderTimingEvents: ChartEvent[] = chart.events.filter(
    (event) => event.type === 'bpm' || event.type === 'timeSignature',
  );

  return {
    ...chart,
    notes: RENDER_CYCLE_INDICES.flatMap((cycleIndex) =>
      chart.notes.map((note) => offsetNoteByLoopCycle(note, cycleIndex, loopBeats)),
    ),
    trillZones: RENDER_CYCLE_INDICES.flatMap((cycleIndex) =>
      chart.trillZones.map((zone) => offsetTrillZoneByLoopCycle(zone, cycleIndex, loopBeats)),
    ),
    // restZone은 루프 사이클 오프셋 대상이 아직 없어 명시적으로 비운다 — `...chart` 스프레드로
    // 원본 박의 restZone이 새어 밴드가 오정렬되는 것을 막는다(RFD 0019). 튜토리얼 차트에
    // restZone을 쓰게 되면 offsetTrillZoneByLoopCycle과 동형의 오프셋을 flatMap할 것. (TODO)
    restZones: [],
    events: renderTimingEvents,
  };
}

function getLoopDurationMs(chart: Chart, loopBeats: number): number {
  const bpmMarkers = extractBpmMarkers(chart.events);
  return beatToMs(beat(loopBeats), bpmMarkers, chart.meta.offsetMs) - beatToMs(beat(0), bpmMarkers, chart.meta.offsetMs);
}

function createTutorialPreview(
  id: string,
  title: string,
  bodyLines: readonly string[],
  loopBeats: number,
  chart: Chart,
): TutorialPreviewDefinition {
  const loopMs = getLoopDurationMs(chart, loopBeats);

  return {
    id,
    title,
    bodyLines,
    loopBeats,
    chart,
    renderChart: createRenderChart(chart, loopBeats),
    loopMs,
    renderStartMs: loopMs,
    renderDurationMs: loopMs * TUTORIAL_PREVIEW_RENDER_CYCLES,
  };
}

export const TUTORIAL_PREVIEWS: readonly TutorialPreviewDefinition[] = [
  createTutorialPreview(
    'hand-placement',
    '손배치',
    [
      '왼손은 Q W E C에 약지·중지·검지·엄지를 올려두세요',
      TUTORIAL_OPPOSITE_HAND_BODY_LINE,
      '키 배치는 옵션에서 언제든 바꿀 수 있습니다',
    ],
    8,
    handPlacementChart,
  ),
  createTutorialPreview(
    'single-note',
    '싱글 노트',
    [
      '한 레인에는 여러 키를 바인딩할 수 있습니다',
      '같은 노트를 다양한 키로 처리해 보세요',
    ],
    3,
    singleNoteChart,
  ),
  createTutorialPreview(
    'double-note',
    '더블 노트',
    [
      '더블 노트는 같은 레인의 두 키를 동시에 누릅니다',
    ],
    4,
    doubleNoteChart,
  ),
  createTutorialPreview(
    'trill-note',
    '트릴 구간 / 트릴 노트',
    [
      '트릴 구간에서는 직전에 누른 키와 다른 키를 눌러야 합니다',
      '같은 키를 연속으로 누르면 GOOD◇으로 강등됩니다',
    ],
    9,
    trillNoteChart,
  ),
  createTutorialPreview(
    'long-note',
    '롱노트',
    [
      '롱노트가 시작할 때 누르고, 끝날 때 떼세요',
      '더블 롱노트는 두 키를 끝까지 유지합니다',
      '트릴 롱노트는 트릴 구간 안에서 누른 키를 끝까지 유지합니다',
    ],
    7,
    longNoteChart,
  ),
  createTutorialPreview(
    'release-tap',
    '릴리즈탭',
    [
      '롱노트 끝에 노트가 함께 나올 수 있습니다',
      '떼는 순간에 다른 키를 함께 누르세요',
      '끝에 노트가 있으면 롱노트 떼기 판정은 없습니다',
    ],
    5,
    releaseTapChart,
  ),
  createTutorialPreview(
    'connected-long-note-switch',
    '이어진 롱노트 - 갈아타기',
    [
      '롱노트 끝에서 같은 레인의 다음 롱노트로 바로 이어질 수 있습니다',
      '연결 지점에서 이전 키를 떼며 다음 키로 갈아탈 수 있습니다',
      '연결 지점에서는 이전 키를 떼는 타이밍을 따로 판정하지 않습니다',
    ],
    8,
    connectedLongNoteSwitchChart,
  ),
  createTutorialPreview(
    'connected-long-note-overlap',
    '이어진 롱노트 - 겹쳐 누르기',
    [
      '롱노트 끝에서 같은 레인의 다음 롱노트로 바로 이어질 수 있습니다',
      '기존 키를 누른 채 새 키를 더 눌러 연결을 처리할 수 있습니다',
      '연결 지점에서는 이전 키를 떼는 타이밍을 따로 판정하지 않습니다',
    ],
    8,
    connectedLongNoteOverlapChart,
  ),
  createTutorialPreview(
    'connected-trill-long',
    '이어진 트릴 롱노트',
    [
      '이어진 트릴 롱노트도 갈아타기·겹쳐 누르기로 이어진 롱노트와 동일하게 처리할 수 있습니다',
    ],
    8,
    connectedTrillLongChart,
  ),
  createTutorialPreview(
    'headless-long-note',
    '헤드 없는 롱노트',
    [
      '롱노트가 일반 노트 없이 시작될 수 있습니다',
      '시작 타이밍에 맞춰 누를 필요는 없지만, 롱노트 안에서는 키를 유지해야 합니다',
    ],
    5,
    headlessLongNoteChart,
  ),
  createTutorialPreview(
    'zero-length-long-note',
    '길이가 0인 롱노트',
    ['길이가 0인 롱노트는 누르기·유지 판정 없이 떼기 판정만 있습니다'],
    3,
    zeroLengthLongNoteChart,
  ),
  createTutorialPreview(
    'grace-note',
    'grace 노트',
    ['Good 윈도우 안에 입력하면 Perfect로 승급됩니다'],
    5,
    graceNoteChart,
  ),
  createTutorialPreview(
    'hold-only-long-note',
    'grace 롱노트',
    ['grace 롱노트는 끝나는 시점에 떼지 않아도 됩니다'],
    5,
    holdOnlyLongNoteChart,
  ),
  createTutorialPreview(
    'zero-length-hold-only-long-note',
    '길이가 0인 grace 롱노트',
    ['Good 윈도우 안에서 키를 누르고 있으면 됩니다'],
    5,
    zeroLengthHoldOnlyLongNoteChart,
  ),
  createTutorialPreview(
    'horizontal-movement',
    '수평 이동',
    [
      '표시된 키를 따라 손 위치를 옆 레인으로 옮깁니다',
      '고정된 손배치로 처리하기 어려운 패턴을 유동적인 손배치로 처리해 보세요',
    ],
    8,
    horizontalMovementChart,
  ),
  createTutorialPreview(
    'vertical-movement',
    '수직 이동',
    ['수직으로 이동해서 노트를 처리할 수 있습니다'],
    8,
    verticalMovementChart,
  ),
];

export const TUTORIAL_PREVIEW_CHART = TUTORIAL_PREVIEWS[0].chart;
export const TUTORIAL_PREVIEW_RENDER_CHART = TUTORIAL_PREVIEWS[0].renderChart;

export function getTutorialInputEvents(chart: Chart = TUTORIAL_PREVIEW_CHART): TutorialInputEvent[] {
  return chart.events.filter((event): event is TutorialInputEvent => event.type === 'tutorialInput');
}

export function getTutorialDiagramEvents(chart: Chart = TUTORIAL_PREVIEW_CHART): TutorialDiagramEvent[] {
  return chart.events.filter((event): event is TutorialDiagramEvent => event.type === 'tutorialDiagram');
}

export function getTutorialInputTimings(chart: Chart = TUTORIAL_PREVIEW_CHART): TutorialInputTiming[] {
  const bpmMarkers = extractBpmMarkers(chart.events);
  return getTutorialInputEvents(chart).map((event) => ({
    event,
    startMs: beatToMs(event.beat, bpmMarkers, chart.meta.offsetMs),
    endMs: beatToMs(event.endBeat, bpmMarkers, chart.meta.offsetMs),
  }));
}

export function getTutorialDiagramTimings(chart: Chart = TUTORIAL_PREVIEW_CHART): TutorialDiagramTiming[] {
  const bpmMarkers = extractBpmMarkers(chart.events);
  return getTutorialDiagramEvents(chart).map((event) => ({
    event,
    startMs: beatToMs(event.beat, bpmMarkers, chart.meta.offsetMs),
    endMs: beatToMs(event.endBeat, bpmMarkers, chart.meta.offsetMs),
  }));
}

export function getTutorialInputStateKey(event: TutorialInputEvent): string {
  return `${event.lane}:${event.keyCode}`;
}

export function getActiveTutorialInputTimings(
  songTimeMs: number,
  timings: readonly TutorialInputTiming[] = getTutorialInputTimings(),
): TutorialInputTiming[] {
  return timings.filter(({ startMs, endMs }) => songTimeMs >= startMs && songTimeMs < endMs);
}

export function getActiveTutorialDiagramTiming(
  songTimeMs: number,
  timings: readonly TutorialDiagramTiming[] = getTutorialDiagramTimings(),
): TutorialDiagramTiming | null {
  return timings.find(({ startMs, endMs }) => songTimeMs >= startMs && songTimeMs < endMs) ?? null;
}
