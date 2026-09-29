import { createChartTiming, deserializeChart, mainNotes, validateChart, type Chart } from '../shared';

/** The same chart parser and placement gate used by the editor's test play. */
export function parseNoteAssetPlayChart(text: string): Chart {
  const chart = deserializeChart(text.replace(/^\uFEFF/, ''));
  const violations = validateChart(chart);
  if (violations.length) throw new Error(`배치 제약 위반 ${violations.length}건이 있어 연주할 수 없습니다.`);
  const playable = { ...chart, notes: mainNotes(chart.notes) };
  if (!playable.notes.length) throw new Error('연주할 노트가 없습니다.');
  if (chart.events.some(event => event.type === 'bpm' && (!Number.isFinite(event.bpm) || event.bpm <= 0))) {
    throw new Error('BPM은 0보다 큰 숫자여야 합니다.');
  }
  const timing = createChartTiming(playable);
  if ([...timing.noteTimesMs.values(), ...timing.noteEndTimesMs.values()].some(time => !Number.isFinite(time))) {
    throw new Error('차트의 박자 또는 오프셋을 확인해주세요.');
  }
  return playable;
}
