import { beat } from '../shared/types/beat';
import type { ChartDocument } from '../shared/types/chart';

const meta: ChartDocument['meta'] = { title: '명시 입력 연습', artist: 'Lab', difficultyLevel: 1, difficultyLabel: 'Liftoff',
  imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 };
const timing: ChartDocument['events'] = [{ type: 'bpm', beat: beat(0), bpm: 120 }, { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4) }];

/** 보관 차트를 변환하지 않은 저작 리터럴. 표시 fixture가 아니라 실제 engine에 전달한다. */
export const explicitPlaytestCharts: readonly { id: string; title: string; instruction: string; chart: ChartDocument }[] = [
  { id: 'single', title: 'Point와 유지·Release', instruction: '1레인을 1초에 누르고 2초에 뗍니다. 3초에는 2레인 Point를 누릅니다.',
    chart: { meta, trillZones: [], events: timing, notes: [
      { type: 'point', kind: 'single', lane: 1, beat: beat(2) },
      { type: 'body', holdCount: 1, lane: 1, beat: beat(2), endBeat: beat(4) },
      { type: 'sustain', count: 1, lane: 1, beat: beat(3) },
      { type: 'release', count: 1, lane: 1, beat: beat(4) },
      { type: 'point', kind: 'single', lane: 2, beat: beat(6), grace: true },
    ] } },
  { id: 'double', title: 'Double의 독립 몫', instruction: '1레인 키 두 개를 1초에 누르고 2초에 뗍니다. 한 키만 연주하면 부분 실패를 확인할 수 있습니다.',
    chart: { meta, trillZones: [], events: timing, notes: [
      { type: 'point', kind: 'double', lane: 1, beat: beat(2), grace: true },
      { type: 'body', holdCount: 2, lane: 1, beat: beat(2), endBeat: beat(4) },
      { type: 'sustain', count: 2, lane: 1, beat: beat(3) },
      { type: 'release', count: 2, lane: 1, beat: beat(4), grace: true },
    ] } },
  { id: 'body-only', title: '점수 항목 없는 바디', instruction: '1레인 키를 1초부터 2초까지 유지합니다. 무점수 바디의 실제 상태와 Miss 수를 검토합니다.',
    chart: { meta, trillZones: [], events: timing, notes: [{ type: 'body', holdCount: 1, lane: 1, beat: beat(2), endBeat: beat(4) }] } },
  { id: 'trill', title: 'Trill Point와 바디', instruction: '1레인에서 1초와 1.5초의 Point를 다른 키로 교대하고 2초까지 유지합니다.',
    chart: { meta, trillZones: [{ lane: 1, beat: beat(2), endBeat: beat(4) }], events: timing, notes: [
      { type: 'body', holdCount: 1, trill: true, lane: 1, beat: beat(2), endBeat: beat(4) },
      { type: 'point', kind: 'trill', lane: 1, beat: beat(2) },
      { type: 'point', kind: 'trill', lane: 1, beat: beat(3) },
    ] } },
];

/** 장치를 열지 않고 AudioBuffer만 만든다. 실제 재생 장치·clock은 runtime이 준비한다. */
export function createExplicitPlaytestAudio(durationSeconds = 4): AudioBuffer {
  const sampleRate = 44100;
  const buffer = new AudioBuffer({ length: Math.ceil(durationSeconds * sampleRate), sampleRate, numberOfChannels: 1 });
  const samples = buffer.getChannelData(0);
  for (let at = 0; at < durationSeconds; at += .5) {
    for (let index = 0; index < sampleRate * .025; index++) {
      const position = Math.floor(at * sampleRate) + index;
      if (position >= samples.length) break;
      samples[position] += Math.sin(index / sampleRate * Math.PI * 2 * 1000) * Math.exp(-index / sampleRate * 160) * .15;
    }
  }
  return buffer;
}
