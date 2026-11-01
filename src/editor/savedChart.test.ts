import { describe, expect, it } from 'vitest';
import { beat, saveChartAsset, deserializeChartDocument } from '../shared';
import type { ChartDocument, Lane, SongAssetPersistenceAdapter } from '../shared';
import { isChartDirty, toSavedChartJson } from './savedChart';

function makeChart(notes: ChartDocument['notes'] = []): ChartDocument {
  return {
    meta: {
      title: 'Test', artist: '', difficultyLabel: 'NORMAL', difficultyLevel: 1,
      imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0,
    },
    notes,
    trillZones: [],
    events: [
      { type: 'bpm', beat: beat(0, 1), bpm: 120, editorLane: 1 },
      { type: 'timeSignature', beat: beat(0, 1), beatPerMeasure: beat(4, 1), editorLane: 2 },
    ],
  };
}

const mainNote = { type: 'single', lane: 1 as Lane, beat: beat(0) } as const;
const auxNote = { type: 'single', lane: 5 as Lane, beat: beat(1) } as const;

describe('isChartDirty', () => {
  it.each(['bpm', 'timeSignature'] as const)('8박 %s의 editorLane만 1→2로 옮기면 곡 행이 있어도 차트가 dirty다', type => {
    const chart = makeChart();
    chart.events.push(type === 'bpm'
      ? { type, beat: beat(8), bpm: 180, editorLane: 1 }
      : { type, beat: beat(8), beatPerMeasure: beat(3), editorLane: 1 });
    const saved = toSavedChartJson(chart, 2);
    const edited = { ...chart, events: chart.events.map((event, index) => index === 2 ? { ...event, editorLane: 2 } : event) };
    expect(isChartDirty(edited, 2, saved, true)).toBe(true);
  });

  it('BPM 180→150·박 4→8만 바꾸고 editorLane 1을 유지하면 곡 행이 있는 차트는 깨끗하다', () => {
    const chart = makeChart();
    chart.events.push({ type: 'bpm', beat: beat(4), bpm: 180, editorLane: 1 });
    const saved = toSavedChartJson(chart, 2);
    const edited = { ...chart, events: chart.events.map((event, index) => index === 2 ? { ...event, bpm: 150, beat: beat(8) } : event) };
    expect(isChartDirty(edited, 2, saved, true)).toBe(false);
  });

  it('savedChartJson을 만든 차트·보조 레인 수 2 그대로면 dirty 아님', () => {
    const chart = makeChart([mainNote]);
    expect(isChartDirty(chart, 2, toSavedChartJson(chart, 2))).toBe(false);
  });

  it('메인 레인 노트 1개를 추가하면 dirty', () => {
    const saved = toSavedChartJson(makeChart([mainNote]), 2);
    const edited = makeChart([mainNote, { type: 'single', lane: 2 as Lane, beat: beat(1) }]);
    expect(isChartDirty(edited, 2, saved)).toBe(true);
  });

  it('보조 레인(lane 5) 노트 1개만 추가해도 dirty', () => {
    const saved = toSavedChartJson(makeChart([mainNote]), 2);
    expect(isChartDirty(makeChart([mainNote, auxNote]), 2, saved)).toBe(true);
  });

  it('노트는 그대로이고 보조 레인 수만 2 → 3으로 바꿔도 dirty', () => {
    const chart = makeChart([mainNote]);
    expect(isChartDirty(chart, 3, toSavedChartJson(chart, 2))).toBe(true);
  });

  it('savedChartJson이 null이면(불러온 차트 없음) 차트와 무관하게 dirty로 본다', () => {
    expect(isChartDirty(makeChart(), 2, null)).toBe(true);
  });
});

describe('toSavedChartJson', () => {
  it('메인·보조 노트와 구간을 저장한 JSON은 dirty 스냅샷과 같고 각 파일에 해당 레인만 남는다', async () => {
    const chart = makeChart([mainNote, auxNote]);
    chart.trillZones = [{ lane: 1, beat: beat(10), endBeat: beat(12) }, { lane: 7, beat: beat(2), endBeat: beat(4) }];
    const uploads = new Map<string, string>();
    const adapter: SongAssetPersistenceAdapter = {
      uploadText: async ({ path, content }) => { uploads.set(path, content); },
      remove: async () => {},
      upsertChartRow: async () => {},
      deleteChartRow: async () => {},
      listSongFiles: async () => [],
      deleteSongRow: async () => {},
    };

    const written = await saveChartAsset(adapter, { songId: 'song', difficulty: 'normal', chart, extraLaneCount: 3 });

    expect(deserializeChartDocument(written.chartJson).trillZones).toEqual([chart.trillZones[0]]);
    expect(JSON.parse(written.extraJson).extraTrillZones).toEqual([{ extraLane: 3, beat: '2', endBeat: '4' }]);
    expect(isChartDirty(chart, 3, { chartJson: written.chartJson, extraJson: written.extraJson })).toBe(false);
    expect(toSavedChartJson(chart, 3)).toEqual({
      chartJson: uploads.get(written.chartPath),
      extraJson: uploads.get(written.extraPath),
    });
  });
});

it('보조 lane 5 구간 끝을 4→5로 바꾸면 main JSON은 같아도 dirty가 된다', () => {
  const chart = { ...makeChart(), trillZones: [{ lane: 5, beat: beat(0), endBeat: beat(4) }] };
  const saved = toSavedChartJson(chart, 2);
  const edited = { ...chart, trillZones: [{ ...chart.trillZones[0], endBeat: beat(5) }] };
  expect(toSavedChartJson(edited, 2).chartJson).toBe(saved.chartJson);
  expect(isChartDirty(edited, 2, saved)).toBe(true);
});
