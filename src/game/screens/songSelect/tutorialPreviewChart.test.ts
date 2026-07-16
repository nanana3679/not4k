import { describe, expect, it } from 'vitest';
import type { NoteEntity, RangeNote, RestZone, TimeSignatureEvent } from '../../../shared/types';
import { beatToFloat } from '../../../shared/types';
import { beat } from '../../../shared/types/beat';
import { validateChart } from '../../../shared/validation';
import {
  TUTORIAL_PREVIEW_CHART,
  TUTORIAL_PREVIEW_LOOP_MS,
  TUTORIAL_PREVIEW_RENDER_CHART,
  TUTORIAL_PREVIEW_RENDER_CYCLES,
  TUTORIAL_PREVIEW_RENDER_DURATION_MS,
  TUTORIAL_PREVIEW_RENDER_START_MS,
  TUTORIAL_PREVIEWS,
  getActiveTutorialDiagramTiming,
  getActiveTutorialInputTimings,
  getTutorialDiagramEvents,
  getTutorialDiagramTimings,
  getTutorialInputEvents,
  getTutorialInputStateKey,
  getTutorialInputTimings,
  makeChart,
} from './tutorialPreviewChart';

function isRangeNote(note: NoteEntity): note is RangeNote {
  return 'endBeat' in note;
}

function getConnectedLongNoteLanes(rangeNotes: readonly RangeNote[]): Set<number> {
  const connectedLanes = new Set<number>();

  for (const first of rangeNotes) {
    if (
      rangeNotes.some(
        (second) =>
          first !== second &&
          first.lane === second.lane &&
          first.endBeat.n === second.beat.n &&
          first.endBeat.d === second.beat.d,
      )
    ) {
      connectedLanes.add(first.lane);
    }
  }

  return connectedLanes;
}

describe('tutorialPreviewChart', () => {
  it('손배치 튜토리얼은 낙하 노트 없이 설명하는 손배치 키만 tutorialInput으로 활성화', () => {
    expect(TUTORIAL_PREVIEW_CHART.notes).toHaveLength(0);
    expect(TUTORIAL_PREVIEW_RENDER_CHART.notes).toHaveLength(0);
    expect(getTutorialInputEvents().map((event) => `${event.lane}:${event.keyCode}`)).toEqual([
      '1:Binding1',
      '1:Binding2',
      '2:Binding1',
      '2:Binding3',
      '3:Binding1',
      '4:Binding1',
      '4:Binding2',
      '3:Binding3',
    ]);
  });

  it('튜토리얼 프리뷰 차트는 validateChart에서 배치 에러가 없다', () => {
    expect(validateChart(TUTORIAL_PREVIEW_CHART)).toEqual([]);
  });

  it('튜토리얼 프리뷰 목록은 이어진 롱노트 두 처리법을 6번과 7번으로 분리하고 rest-zone 휴지 구간을 수평 이동 앞에 두어 17개의 고유 튜토리얼을 제공', () => {
    expect(TUTORIAL_PREVIEWS).toHaveLength(17);
    expect(TUTORIAL_PREVIEWS.map((preview) => preview.id)).toEqual([
      'hand-placement',
      'single-note',
      'double-note',
      'trill-note',
      'long-note',
      'release-tap',
      'connected-long-note-switch',
      'connected-long-note-overlap',
      'connected-trill-long',
      'headless-long-note',
      'zero-length-long-note',
      'grace-note',
      'hold-only-long-note',
      'zero-length-hold-only-long-note',
      'rest-zone',
      'horizontal-movement',
      'vertical-movement',
    ]);
    expect(new Set(TUTORIAL_PREVIEWS.map((preview) => preview.id)).size).toBe(TUTORIAL_PREVIEWS.length);
    expect(TUTORIAL_PREVIEWS[6]?.title).toBe('이어진 롱노트 - 갈아타기');
    expect(TUTORIAL_PREVIEWS[7]?.title).toBe('이어진 롱노트 - 겹쳐 누르기');
    expect(TUTORIAL_PREVIEWS[8]?.title).toBe('이어진 트릴 롱노트');
    expect(TUTORIAL_PREVIEWS[9]?.id).toBe('headless-long-note');
  });

  it('튜토리얼 프리뷰는 8박 고정 루프가 아니라 3·4·5·7·8·9박 루프를 섞어서 제공', () => {
    const loopBeatsById = Object.fromEntries(
      TUTORIAL_PREVIEWS.map((preview) => [preview.id, preview.loopBeats]),
    );

    expect(loopBeatsById).toMatchObject({
      'single-note': 3,
      'double-note': 4,
      'trill-note': 9,
      'release-tap': 5,
      'horizontal-movement': 8,
      'vertical-movement': 8,
    });
    expect(new Set(TUTORIAL_PREVIEWS.map((preview) => preview.loopBeats))).toEqual(new Set([3, 4, 5, 7, 8, 9]));
  });

  it('각 튜토리얼 차트의 timeSignature beatPerMeasure는 해당 프리뷰 loopBeats와 일치', () => {
    for (const preview of TUTORIAL_PREVIEWS) {
      const timeSignature = preview.chart.events.find((event): event is TimeSignatureEvent => event.type === 'timeSignature');

      if (!timeSignature) {
        throw new Error(`${preview.id} 차트에 timeSignature 이벤트가 없음`);
      }

      expect(beatToFloat(timeSignature.beatPerMeasure)).toBe(preview.loopBeats);
    }
  });

  it('모든 튜토리얼 프리뷰 차트는 validateChart에서 배치 에러가 없다', () => {
    expect(TUTORIAL_PREVIEWS.map((preview) => validateChart(preview.chart))).toEqual(
      TUTORIAL_PREVIEWS.map(() => []),
    );
  });

  it('튜토리얼 본문은 싱글·수평 이동·grace 롱노트·수직 이동 안내 문구를 명확하게 포함', () => {
    const joinedBody = TUTORIAL_PREVIEWS.flatMap((preview) => preview.bodyLines).join('\n');

    expect(TUTORIAL_PREVIEWS[0].title).toBe('손배치');
    expect(TUTORIAL_PREVIEWS[16].title).toBe('수직 이동');
    expect(joinedBody).toContain('왼손은 Q W E C에 약지·중지·검지·엄지를 올려두세요');
    expect(joinedBody).toContain('같은 노트를 다양한 키로 처리해 보세요');
    expect(joinedBody).toContain('떼는 순간에 다른 키를 함께 누르세요');
    expect(joinedBody).toContain('grace 롱노트는 끝나는 시점에 떼지 않아도 됩니다');
    expect(joinedBody).toContain('연결 지점에서 이전 키를 떼며 다음 키로 갈아탈 수 있습니다');
    expect(joinedBody).toContain('기존 키를 누른 채 새 키를 더 눌러 연결을 처리할 수 있습니다');
    expect(joinedBody).toContain('고정된 손배치로 처리하기 어려운 패턴을 유동적인 손배치로 처리해 보세요');
    expect(joinedBody).toContain('수직으로 이동해서 노트를 처리할 수 있습니다');
    expect(joinedBody).not.toContain('a--- + ..b.처럼 겹쳐 누르거나, a-b-처럼 갈아탈 수 있습니다');
    expect(joinedBody).not.toContain('Q W, E C, 7 1, 8 9 조합을 차례로 시연합니다');
    expect(joinedBody).not.toContain('[a b a b] 교대 입력과 [a a a a] 같은 키 입력을 비교합니다');
    expect(joinedBody).not.toContain('W E↔PageDown 7, E R↔7 8 트릴 패턴을 시연합니다');
  });

  it('튜토리얼 제목과 차트 meta.title은 인덱스 번호와 중복되지 않도록 숫자 접두사를 포함하지 않음', () => {
    for (const preview of TUTORIAL_PREVIEWS) {
      expect(preview.title).not.toMatch(/^\d+\s/);
      expect(preview.chart.meta.title).not.toMatch(/^\d+\s/);
    }
  });

  it('더블 노트 튜토리얼은 QW·EC·71·89 조합을 네 레인에서 순서대로 시연', () => {
    const preview = TUTORIAL_PREVIEWS.find((item) => item.id === 'double-note');

    expect(preview?.loopBeats).toBe(4);
    expect(preview?.chart.notes.map((note) => `${note.lane}:${note.type}:${note.beat.n}/${note.beat.d}`)).toEqual([
      '1:double:1/2',
      '2:double:3/2',
      '3:double:5/2',
      '4:double:7/2',
    ]);
    expect(getTutorialInputEvents(preview?.chart).map((event) => `${event.lane}:${event.keyCode}:${event.beat.n}/${event.beat.d}`)).toEqual([
      '1:KeyQ:1/2',
      '1:KeyW:1/2',
      '2:KeyE:3/2',
      '2:KeyC:3/2',
      '3:Numpad7:5/2',
      '3:Numpad1:5/2',
      '4:Numpad8:7/2',
      '4:Numpad9:7/2',
    ]);
  });

  it('롱노트 튜토리얼은 제목을 롱노트로 표시하고 싱글·더블·트릴 롱노트를 모두 시연', () => {
    const preview = TUTORIAL_PREVIEWS.find((item) => item.id === 'long-note');
    const bodyText = preview?.bodyLines.join('\n') ?? '';

    expect(preview?.title).toBe('롱노트');
    expect(preview?.chart.meta.title).toBe('롱노트');
    expect(preview?.chart.notes.map((note) => {
      const start = `${note.beat.n}/${note.beat.d}`;
      return isRangeNote(note)
        ? `${note.lane}:${note.type}:${start}-${note.endBeat.n}/${note.endBeat.d}`
        : `${note.lane}:${note.type}:${start}`;
    })).toEqual([
      '2:single:1/1',
      '2:long:1/1-2/1',
      '3:double:3/1',
      '3:doubleLong:3/1-4/1',
      '2:trill:5/1',
      '2:trillLong:5/1-7/1',
    ]);
    expect(preview?.chart.trillZones).toEqual([
      { lane: 2, beat: { n: 5, d: 1 }, endBeat: { n: 7, d: 1 } },
    ]);
    expect(getTutorialInputEvents(preview?.chart).map((event) => `${event.lane}:${event.keyCode}:${event.beat.n}/${event.beat.d}-${event.endBeat.n}/${event.endBeat.d}`)).toEqual([
      '2:KeyF:1/1-2/1',
      '3:KeyJ:3/1-4/1',
      '3:KeyK:3/1-4/1',
      '2:KeyD:5/1-7/1',
    ]);
    expect(bodyText).toContain('트릴 롱노트');
  });

  it('트릴 튜토리얼은 2·3레인에서 ABAB 교대 구간과 AAAA 같은키 구간을 각각 4노트로 가진다', () => {
    const preview = TUTORIAL_PREVIEWS.find((item) => item.id === 'trill-note');
    const bodyText = preview?.bodyLines.join('\n') ?? '';

    expect(preview?.chart.trillZones).toEqual([
      { lane: 2, beat: { n: 1, d: 1 }, endBeat: { n: 4, d: 1 } },
      { lane: 3, beat: { n: 5, d: 1 }, endBeat: { n: 8, d: 1 } },
    ]);
    expect(preview?.chart.notes.map((note) => note.lane)).toEqual([2, 2, 2, 2, 3, 3, 3, 3]);
    expect(preview?.chart.notes.filter((note) => note.type === 'trill')).toHaveLength(8);
    expect(getTutorialInputEvents(preview?.chart).map((event) => `${event.lane}:${event.keyCode}`)).toEqual([
      '2:KeyF',
      '2:KeyD',
      '2:KeyF',
      '2:KeyD',
      '3:KeyJ',
      '3:KeyJ',
      '3:KeyJ',
      '3:KeyJ',
    ]);
    expect(bodyText).not.toContain('[a b a b]');
    expect(bodyText).not.toContain('[a a a a]');
  });

  it('수평 이동 튜토리얼은 WE↔PageDown7과 ER↔78 트릴 패턴을 시연', () => {
    const preview = TUTORIAL_PREVIEWS.find((item) => item.id === 'horizontal-movement');

    expect(preview?.loopBeats).toBe(8);
    expect(preview?.chart.notes.map((note) => `${note.beat.n}/${note.beat.d}:${note.lane}:${note.type}`)).toEqual([
      '1/2:1:single',
      '1/2:2:single',
      '3/2:2:single',
      '3/2:3:single',
      '5/2:1:single',
      '5/2:2:single',
      '7/2:2:single',
      '7/2:3:single',
      '9/2:2:single',
      '9/2:3:single',
      '11/2:3:single',
      '11/2:4:single',
      '13/2:2:single',
      '13/2:3:single',
      '15/2:3:single',
      '15/2:4:single',
    ]);
    expect(getTutorialInputEvents(preview?.chart).map((event) => `${event.beat.n}/${event.beat.d}:${event.lane}:${event.keyCode}`)).toEqual([
      '1/2:1:KeyW',
      '1/2:2:KeyE',
      '3/2:2:PageDown',
      '3/2:3:Numpad7',
      '5/2:1:KeyW',
      '5/2:2:KeyE',
      '7/2:2:PageDown',
      '7/2:3:Numpad7',
      '9/2:2:KeyE',
      '9/2:3:KeyR',
      '11/2:3:Numpad7',
      '11/2:4:Numpad8',
      '13/2:2:KeyE',
      '13/2:3:KeyR',
      '15/2:3:Numpad7',
      '15/2:4:Numpad8',
    ]);
  });

  it('수직 이동 튜토리얼은 12 반복에서 WE/SD를, 34 반복에서 78/12를 교대로 시연', () => {
    const preview = TUTORIAL_PREVIEWS.find((item) => item.id === 'vertical-movement');

    expect(preview?.loopBeats).toBe(8);
    expect(preview?.chart.notes.map((note) => `${note.beat.n}/${note.beat.d}:${note.lane}:${note.type}`)).toEqual([
      '1/2:1:single',
      '1/2:2:single',
      '3/2:1:single',
      '3/2:2:single',
      '5/2:1:single',
      '5/2:2:single',
      '7/2:1:single',
      '7/2:2:single',
      '9/2:3:single',
      '9/2:4:single',
      '11/2:3:single',
      '11/2:4:single',
      '13/2:3:single',
      '13/2:4:single',
      '15/2:3:single',
      '15/2:4:single',
    ]);
    expect(getTutorialInputEvents(preview?.chart).map((event) => `${event.beat.n}/${event.beat.d}:${event.lane}:${event.keyCode}`)).toEqual([
      '1/2:1:KeyW',
      '1/2:2:KeyE',
      '3/2:1:KeyS',
      '3/2:2:KeyD',
      '5/2:1:KeyW',
      '5/2:2:KeyE',
      '7/2:1:KeyS',
      '7/2:2:KeyD',
      '9/2:3:Numpad7',
      '9/2:4:Numpad8',
      '11/2:3:Numpad1',
      '11/2:4:Numpad2',
      '13/2:3:Numpad7',
      '13/2:4:Numpad8',
      '15/2:3:Numpad1',
      '15/2:4:Numpad2',
    ]);
  });

  it('휴지 구간 튜토리얼은 2레인 1~5박·3레인 5~9박에 restZone을 두고 트릴 레인(1·4)과 겹치지 않는다', () => {
    const preview = TUTORIAL_PREVIEWS.find((item) => item.id === 'rest-zone');

    if (!preview) {
      throw new Error('rest-zone 프리뷰가 없음');
    }

    expect(preview.chart.restZones).toEqual([
      { lane: 2, beat: { n: 1, d: 1 }, endBeat: { n: 5, d: 1 } },
      { lane: 3, beat: { n: 5, d: 1 }, endBeat: { n: 9, d: 1 } },
    ]);

    const trillNoteLanes = new Set(
      preview.chart.notes.filter((note) => note.type === 'trill').map((note) => note.lane),
    );
    expect([...trillNoteLanes].sort()).toEqual([1, 4]);
    expect(preview.chart.restZones?.some((zone) => trillNoteLanes.has(zone.lane))).toBe(false);
  });

  it('휴지 구간 renderChart는 restZone 2개를 3사이클로 8박씩 밀어 복제해 6개를 만든다', () => {
    const preview = TUTORIAL_PREVIEWS.find((item) => item.id === 'rest-zone');

    expect(preview?.renderChart.restZones).toHaveLength(6);
    // 두 번째 사이클의 첫 restZone은 원본(1~5박)에서 loopBeats(8박)만큼 밀린다
    expect(preview?.renderChart.restZones?.[2]).toEqual({
      lane: 2,
      beat: { n: 9, d: 1 },
      endBeat: { n: 13, d: 1 },
    });
  });

  it('makeChart에 restZones를 주면 반환 차트 restZones에 복사되어 그대로 담기고, 생략하면 빈 배열', () => {
    const restZones: RestZone[] = [{ lane: 2, beat: beat(1), endBeat: beat(3) }];
    const chart = makeChart('restZones 단위', 4, [], [], [], [], restZones);

    expect(chart.restZones).toEqual(restZones);
    expect(chart.restZones).not.toBe(restZones);
    expect(makeChart('restZones 생략', 4, [], []).restZones).toEqual([]);
  });

  it('릴리즈탭 튜토리얼은 같은 레인 같은 박에 롱노트 끝과 싱글 노트를 함께 둔다', () => {
    const preview = TUTORIAL_PREVIEWS.find((item) => item.id === 'release-tap');
    const longNote = preview?.chart.notes.find((note): note is RangeNote => isRangeNote(note) && note.lane === 2);
    const tapAtLongEnd = preview?.chart.notes.some(
      (note) =>
        note.type === 'single' &&
        longNote &&
        note.lane === longNote.lane &&
        note.beat.n === longNote.endBeat.n &&
        note.beat.d === longNote.endBeat.d,
    );

    expect(tapAtLongEnd).toBe(true);
  });

  it('6번 이어진 롱노트 갈아타기는 2레인에서 a-b- 연결 롱노트만 시연', () => {
    const preview = TUTORIAL_PREVIEWS.find((item) => item.id === 'connected-long-note-switch');
    const rangeNotes = preview?.chart.notes.filter((note): note is RangeNote => isRangeNote(note)) ?? [];
    const connectedLanes = getConnectedLongNoteLanes(rangeNotes);

    if (!preview) {
      throw new Error('connected-long-note-switch 프리뷰가 없음');
    }

    const timings = getTutorialInputTimings(preview.chart);
    const activeKeyCodesAtMs = (songTimeMs: number) =>
      getActiveTutorialInputTimings(songTimeMs, timings).map(({ event }) => event.keyCode);
    const diagramTimings = getTutorialDiagramTimings(preview.chart);
    const firstInputStartMs = Math.min(...timings.map(({ startMs }) => startMs));

    expect(preview.loopBeats).toBe(8);
    expect([...connectedLanes]).toEqual([2]);
    expect(activeKeyCodesAtMs(3125)).toEqual(['KeyF']);
    expect(activeKeyCodesAtMs(3625)).toEqual(['KeyD']);
    expect(getTutorialDiagramEvents(preview.chart).map((event) => event.diagramId)).toEqual(['connected-switch']);
    expect(getActiveTutorialDiagramTiming(750, diagramTimings)?.event.diagramId).toBe('connected-switch');
    expect(getActiveTutorialDiagramTiming(1125, diagramTimings)).toBeNull();
    expect(firstInputStartMs - diagramTimings[0].endMs).toBe(2000);
  });

  it('7번 이어진 롱노트 겹쳐 누르기는 3레인에서 a--- + ..b. 연결 롱노트만 시연', () => {
    const preview = TUTORIAL_PREVIEWS.find((item) => item.id === 'connected-long-note-overlap');
    const rangeNotes = preview?.chart.notes.filter((note): note is RangeNote => isRangeNote(note)) ?? [];
    const connectedLanes = getConnectedLongNoteLanes(rangeNotes);

    if (!preview) {
      throw new Error('connected-long-note-overlap 프리뷰가 없음');
    }

    const timings = getTutorialInputTimings(preview.chart);
    const activeKeyCodesAtMs = (songTimeMs: number) =>
      getActiveTutorialInputTimings(songTimeMs, timings).map(({ event }) => event.keyCode);
    const diagramTimings = getTutorialDiagramTimings(preview.chart);
    const firstInputStartMs = Math.min(...timings.map(({ startMs }) => startMs));

    expect(preview.loopBeats).toBe(8);
    expect([...connectedLanes]).toEqual([3]);
    expect(activeKeyCodesAtMs(3125)).toEqual(['KeyJ']);
    expect(activeKeyCodesAtMs(3625)).toEqual(['KeyJ', 'KeyK']);
    expect(activeKeyCodesAtMs(3875)).toEqual(['KeyJ']);
    expect(getTutorialDiagramEvents(preview.chart).map((event) => event.diagramId)).toEqual(['connected-overlap']);
    expect(getActiveTutorialDiagramTiming(750, diagramTimings)?.event.diagramId).toBe('connected-overlap');
    expect(getActiveTutorialDiagramTiming(1125, diagramTimings)).toBeNull();
    expect(firstInputStartMs - diagramTimings[0].endMs).toBe(2000);
  });

  it('8번 이어진 트릴 롱노트는 2레인 갈아타기와 3레인 겹쳐 누르기를 한 차트에서 함께 시연', () => {
    const preview = TUTORIAL_PREVIEWS.find((item) => item.id === 'connected-trill-long');
    if (!preview) {
      throw new Error('connected-trill-long 프리뷰가 없음');
    }
    const rangeNotes = preview.chart.notes.filter((note): note is RangeNote => isRangeNote(note));
    const connectedLanes = getConnectedLongNoteLanes(rangeNotes);
    const timings = getTutorialInputTimings(preview.chart);
    const activeKeyCodesAtMs = (songTimeMs: number) =>
      getActiveTutorialInputTimings(songTimeMs, timings).map(({ event }) => event.keyCode);

    expect(preview.loopBeats).toBe(8);
    // 두 레인 모두에서 트릴 롱노트가 연결된다
    expect([...connectedLanes].sort()).toEqual([2, 3]);
    // 모든 range 노트는 트릴 롱노트 (일반 롱노트 아님)
    expect(rangeNotes.every((note) => note.type === 'trillLong')).toBe(true);
    // 갈아타기(2레인): 연결점 beat 3(1500ms) 직후 F에서 D로 교대
    expect(activeKeyCodesAtMs(1250)).toEqual(['KeyF']);
    expect(activeKeyCodesAtMs(1750)).toEqual(['KeyD']);
    // 겹쳐 누르기(3레인): J를 잡은 채 연결점 beat 6(3000ms)에서 K를 탭
    expect(activeKeyCodesAtMs(2750)).toEqual(['KeyJ']);
    expect(activeKeyCodesAtMs(3125)).toEqual(['KeyJ', 'KeyK']);
    expect(activeKeyCodesAtMs(3375)).toEqual(['KeyJ']);
    // 도식은 생략 — 떨어지는 실연으로만 시연
    expect(getTutorialDiagramEvents(preview.chart)).toEqual([]);
  });

  it('헤드 없는 롱노트 튜토리얼은 롱노트 시작점에 포인트 노트가 없다', () => {
    const preview = TUTORIAL_PREVIEWS.find((item) => item.id === 'headless-long-note');
    const headlessLong = preview?.chart.notes.find((note): note is RangeNote => isRangeNote(note) && note.lane === 2);
    const hasPointHead = preview?.chart.notes.some(
      (note) =>
        note.type === 'single' &&
        headlessLong &&
        note.lane === headlessLong.lane &&
        note.beat.n === headlessLong.beat.n &&
        note.beat.d === headlessLong.beat.d,
    );

    expect(headlessLong).toBeTruthy();
    expect(hasPointHead).toBe(false);
  });

  it('길이가 0인 롱노트 튜토리얼은 시작과 끝 beat가 같은 일반 롱노트를 가진다', () => {
    const preview = TUTORIAL_PREVIEWS.find((item) => item.id === 'zero-length-long-note');
    const zeroLengthLong = preview?.chart.notes.find(
      (note) =>
        'endBeat' in note &&
        note.holdOnly !== true &&
        note.beat.n === note.endBeat.n &&
        note.beat.d === note.endBeat.d,
    );

    expect(zeroLengthLong).toBeTruthy();
  });

  it('grace 노트와 grace 롱노트 튜토리얼은 각각 grace 포인트 노트와 holdOnly 롱노트를 가진다', () => {
    const gracePreview = TUTORIAL_PREVIEWS.find((item) => item.id === 'grace-note');
    const holdOnlyPreview = TUTORIAL_PREVIEWS.find((item) => item.id === 'hold-only-long-note');
    const zeroLengthHoldOnlyPreview = TUTORIAL_PREVIEWS.find((item) => item.id === 'zero-length-hold-only-long-note');

    expect(gracePreview?.chart.notes.some((note) => !('endBeat' in note) && note.grace === true)).toBe(true);
    expect(holdOnlyPreview?.chart.notes.some((note) => 'endBeat' in note && note.holdOnly === true)).toBe(true);
    expect(
      zeroLengthHoldOnlyPreview?.chart.notes.some(
        (note) =>
          'endBeat' in note &&
          note.holdOnly === true &&
          note.beat.n === note.endBeat.n &&
          note.beat.d === note.endBeat.d,
      ),
    ).toBe(true);
  });

  it('릴리즈탭·이어진 롱노트·헤드 없는 롱노트 차트는 루프를 채우기 위한 무관한 싱글 노트를 넣지 않는다', () => {
    const releaseTapPreview = TUTORIAL_PREVIEWS.find((item) => item.id === 'release-tap');
    const connectedSwitchPreview = TUTORIAL_PREVIEWS.find((item) => item.id === 'connected-long-note-switch');
    const connectedOverlapPreview = TUTORIAL_PREVIEWS.find((item) => item.id === 'connected-long-note-overlap');
    const headlessPreview = TUTORIAL_PREVIEWS.find((item) => item.id === 'headless-long-note');
    const zeroLengthPreview = TUTORIAL_PREVIEWS.find((item) => item.id === 'zero-length-long-note');
    const holdOnlyPreview = TUTORIAL_PREVIEWS.find((item) => item.id === 'hold-only-long-note');

    expect(releaseTapPreview?.chart.notes).toHaveLength(3);
    expect(releaseTapPreview?.chart.notes.some((note) => note.lane === 3)).toBe(false);
    expect(connectedSwitchPreview?.chart.notes).toHaveLength(4);
    expect(connectedSwitchPreview?.chart.notes.every((note) => note.lane === 2)).toBe(true);
    expect(connectedOverlapPreview?.chart.notes).toHaveLength(4);
    expect(connectedOverlapPreview?.chart.notes.every((note) => note.lane === 3)).toBe(true);
    expect(headlessPreview?.chart.notes).toHaveLength(1);
    expect(zeroLengthPreview?.chart.notes).toHaveLength(1);
    expect(holdOnlyPreview?.chart.notes).toHaveLength(2);
  });

  it('120 BPM에서 beat 1 손배치 tutorialInput은 설명하는 8개 바인딩 슬롯을 모두 활성', () => {
    const active = getActiveTutorialInputTimings(500).map(({ event }) => `${event.lane}:${event.keyCode}`);
    expect(active).toEqual([
      '1:Binding1',
      '1:Binding2',
      '2:Binding1',
      '2:Binding3',
      '3:Binding1',
      '4:Binding1',
      '4:Binding2',
      '3:Binding3',
    ]);
  });

  it('120 BPM에서 트릴 튜토리얼 beat 5의 3레인 같은키 구간은 KeyJ 하나만 활성', () => {
    const trillPreview = TUTORIAL_PREVIEWS.find((item) => item.id === 'trill-note');
    const timings = getTutorialInputTimings(trillPreview?.chart);
    const active = getActiveTutorialInputTimings(2500, timings).map(({ event }) => event.keyCode);

    expect(active).toEqual(['KeyJ']);
  });

  it('tutorialInput 상태 키는 lane과 keyCode를 함께 사용해 같은 키 이름의 다른 레인을 구분', () => {
    const event = getTutorialInputEvents()[0];
    expect(getTutorialInputStateKey(event)).toBe('1:Binding1');
  });

  it('각 튜토리얼의 모든 tutorialInput endMs는 해당 프리뷰 loopMs 이하', () => {
    for (const preview of TUTORIAL_PREVIEWS) {
      const maxEndMs = Math.max(...getTutorialInputTimings(preview.chart).map((timing) => timing.endMs));

      expect(maxEndMs).toBeLessThanOrEqual(preview.loopMs);
    }
  });

  it('손배치 렌더 차트는 설명 키만 활성화하고 낙하 노트는 만들지 않는다', () => {
    expect(TUTORIAL_PREVIEW_RENDER_CHART.notes).toHaveLength(
      TUTORIAL_PREVIEW_CHART.notes.length * TUTORIAL_PREVIEW_RENDER_CYCLES,
    );
  });

  it('3박 싱글 노트 렌더 차트는 두 번째 사이클 첫 노트를 3박 뒤에 둔다', () => {
    const preview = TUTORIAL_PREVIEWS.find((item) => item.id === 'single-note');

    expect(preview?.renderChart.notes[preview.chart.notes.length].beat).toEqual({ n: 7, d: 2 });
  });

  it('렌더용 튜토리얼 시간은 각 프리뷰의 가운데 사이클에서 시작해 앞뒤 사이클을 경계 완충으로 사용', () => {
    expect(TUTORIAL_PREVIEW_RENDER_START_MS).toBe(TUTORIAL_PREVIEW_LOOP_MS);
    expect(TUTORIAL_PREVIEW_RENDER_DURATION_MS).toBe(TUTORIAL_PREVIEW_LOOP_MS * TUTORIAL_PREVIEW_RENDER_CYCLES);
    for (const preview of TUTORIAL_PREVIEWS) {
      expect(preview.renderStartMs).toBe(preview.loopMs);
      expect(preview.renderDurationMs).toBe(preview.loopMs * TUTORIAL_PREVIEW_RENDER_CYCLES);
    }
  });
});
