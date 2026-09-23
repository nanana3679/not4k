import type { Chart, NoteEntity, TutorialInputEvent } from '../../../shared/types';
import { beat } from '../../../shared/types/beat';
import { createTutorialPreview } from './tutorialPreviewChart';

const lead = 4;
const at = (offset: number, denominator = 1) => beat(lead * denominator + offset, denominator);
const msBeat = (ms: number) => beat(lead * 500 + ms, 500);
const point = (offset: number, type: 'single' | 'double' = 'single'): NoteEntity => ({ type, lane: 1, beat: at(offset) });
const range = (start: number, end: number, type: 'long' | 'doubleLong' = 'long', holdOnly = false, denominator = 1): NoteEntity => ({ type, lane: 1, beat: at(start, denominator), endBeat: at(end, denominator), ...(holdOnly ? { holdOnly: true } : {}) });
const input = (keyCode: string, startMs: number, endMs: number, editorLane: number): TutorialInputEvent => ({ type: 'tutorialInput', beat: msBeat(startMs), endBeat: msBeat(endMs), lane: 1, keyCode, keyLabel: keyCode.replace('Key', ''), editorLane });
const chart = (title: string, notes: NoteEntity[], inputs: TutorialInputEvent[]): Chart => ({
  meta: { title, artist: 'not4k', difficultyLabel: 'TUTORIAL', difficultyLevel: 1, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
  notes, trillZones: [], events: [
    { type: 'bpm', beat: beat(0), bpm: 120 },
    { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(8) },
    ...inputs,
  ],
});
const lines = (...bodyLines: string[]) => bodyLines;

const doubleConnection = chart('Advanced d=d=', [point(0, 'double'), range(0, 1, 'doubleLong'), point(1, 'double'), range(1, 2, 'doubleLong')], [
  input('KeyQ', 0, 1000, 3), input('KeyW', 0, 1000, 4), input('KeyS', 500, 525, 5), input('KeyX', 500, 525, 6),
]);
const doubleSwap = chart('Advanced d=d= swap', [point(0, 'double'), range(0, 1, 'doubleLong'), point(1, 'double'), range(1, 2, 'doubleLong')], [
  input('KeyQ', 0, 500, 3), input('KeyW', 0, 500, 4), input('KeyS', 500, 1000, 5), input('KeyX', 500, 1000, 6),
]);
const singleHeadDouble = chart('Advanced =o=', [point(0, 'double'), range(0, 1, 'doubleLong'), point(1), range(1, 2, 'doubleLong')], [
  input('KeyQ', 0, 500, 3), input('KeyW', 0, 1000, 4), input('KeyS', 500, 1000, 5),
]);
const decrease = chart('Advanced =-=-', [point(0, 'double'), range(0, 1, 'doubleLong'), range(1, 2), range(2, 3, 'doubleLong'), range(3, 4)], [
  input('KeyQ', 0, 500, 3), input('KeyW', 0, 2000, 4), input('KeyS', 1000, 1500, 5),
]);
const holdOnlyDecrease = chart('Advanced holdOnly decrease', [point(0, 'double'), range(0, 1, 'doubleLong', true), range(1, 2), range(2, 3, 'doubleLong', true), range(3, 4)], [
  input('KeyQ', 0, 2000, 3), input('KeyW', 0, 2500, 4),
]);
const recovery = chart('Advanced recovery', [point(0), range(0, 1), point(1), range(1, 2)], [input('KeyQ', 0, 250, 3), input('KeyW', 500, 1000, 4)]);
const partialDouble = chart('Advanced partial double', [point(0, 'double'), range(0, 2, 'doubleLong')], [input('KeyQ', 0, 1000, 3)]);
const sameKey = chart('Advanced same key', [point(0), range(0, 1, 'long'), point(1, 'single'), range(5, 6, 'long', false, 5)], [input('KeyQ', 0, 495, 3), input('KeyQ', 500, 600, 4)]);
const independent = chart('Advanced independent holdOnly', [range(0, 2, 'long', true), range(4, 6, 'long', true)], [input('KeyQ', -500, 1000, 3), input('KeyW', 2100, 3000, 4)]);
const shortHold = chart('Advanced short holdOnly', [range(0, 3, 'long', true, 25)], [input('KeyQ', 100, 120, 3)]);
const zeroHold = chart('Advanced zero holdOnly', [range(0, 2, 'long', true), range(5, 5, 'long', true, 2)], [input('KeyQ', 0, 1500, 3)]);
const doubleRelease = chart('Advanced double release', [point(0, 'double'), range(0, 2, 'doubleLong')], [input('KeyQ', 0, 1000, 3), input('KeyW', 0, 2000, 4), input('KeyQ', 1020, 1045, 4)]);

export const ADVANCED_TUTORIAL_PREVIEWS = [
  createTutorialPreview('advanced-double-hold', '더블 연결 · 유지와 중간 탭', lines(
    '이어진 더블 롱노트는 처음 누른 두 키로 끝까지 유지할 수 있습니다.',
    '중간 더블 노트만 다른 두 키로 짧게 누르고, 끝에서는 유지하던 두 키를 떼세요.',
    '중간 노트와 마지막 떼기에는 점수가 있고, 롱노트를 이어 유지하는 동작 자체에는 점수나 콤보가 추가되지 않습니다.',
  ), 12, doubleConnection),
  createTutorialPreview('advanced-double-swap', '더블 연결 · 전체 교대', lines(
    '앞 시연과 같은 패턴을 두 키 모두 갈아타는 방법으로 처리합니다.',
    '중간 더블 노트에서 기존 두 키를 떼고 다른 두 키를 누르세요.',
    '새 두 키를 끝까지 유지한 뒤 떼면, 계속 유지하며 중간만 친 방법과 같은 결과입니다.',
  ), 12, doubleSwap),
  createTutorialPreview('advanced-single-head-double', '한 몫만 교대', lines(
    '더블 롱노트가 이어지는 곳에 싱글 노트가 있으면 한쪽만 갈아탈 수 있습니다.',
    '한 키는 계속 유지하고, 다른 키를 떼면서 중간 싱글 노트를 새 키로 누르세요.',
    '끝에서는 남아 있는 두 키를 각각 뗍니다. 중간 교대의 떼기는 마지막 떼기로 중복 판정하지 않습니다.',
  ), 12, singleHeadDouble),
  createTutorialPreview('advanced-decrease', '감소와 떼기', lines(
    '더블 롱노트가 싱글로 줄어들면 그 지점에서 한 키를 떼야 합니다.',
    '다시 더블로 늘어날 때 새 키를 누르고, 다음 감소에서도 한 키를 떼세요.',
    '줄어드는 지점마다 떼는 타이밍을 판정합니다. 두 키를 계속 누르기만 하면 통과할 수 없습니다.',
  ), 12, decrease),
  createTutorialPreview('advanced-holdonly-decrease', '감소의 grace 면제', lines(
    'grace 롱노트(holdOnly)는 끝에서 떼는 동작을 유지 판정으로 면제합니다.',
    '더블에서 싱글로 줄어들 때도 두 키를 계속 누르면 두 쪽 모두 Perfect입니다.',
    '이렇게 유지한 키는 다음 더블로 이어 쓸 수 있어, 늘어날 때 다시 누르지 않아도 됩니다.',
    '마지막 일반 롱노트 끝에서는 한 키만 떼면 됩니다. 시연은 다른 키를 조금 더 유지했다가 뗍니다.',
  ), 12, holdOnlyDecrease),
  createTutorialPreview('advanced-same-key', '같은 키 재타격', lines(
    '연결 지점에서 같은 키를 뗐다 다시 눌러 중간 노트를 쳐도 이어집니다.',
    '마지막 끝이 가까워도, 중간 노트를 다시 치기 위해 뗀 입력은 마지막 떼기로 중복 판정하지 않습니다.',
    '다시 누른 키를 마지막 끝에 맞춰 한 번 더 떼세요. 다른 키로 갈아탈 때와 같은 보정을 받습니다.',
  ), 12, sameKey),
  createTutorialPreview('advanced-recovery', '중간 실패 후 복구', lines(
    '시연은 첫 롱노트를 너무 일찍 떼어 유지에 실패합니다. 다음 시작 노트부터 새로 잡을 수 있습니다.',
    '앞에서 발생한 Miss는 그대로 남고 콤보가 끊기며 고도도 내려갑니다.',
    '이 유지 실패에는 별도 점수가 없어, 점수가 있는 노트를 모두 Perfect로 치면 달성률은 100%입니다.',
    '그래도 Miss가 있으므로 Full Combo는 아닙니다.',
  ), 12, recovery),
  createTutorialPreview('advanced-partial-double', '더블 시작을 놓치면', lines(
    '시연은 더블 시작에서 한 키만 눌러, 누르지 않은 쪽을 Miss로 처리합니다.',
    '성공한 한쪽은 그대로 유지하고 끝에 맞춰 뗄 수 있습니다.',
    '놓친 쪽에 시작 실패와 끝 실패를 연달아 붙이지 않습니다. 이 시연은 Perfect 2개, Miss 1개입니다.',
  ), 12, partialDouble),
  createTutorialPreview('advanced-independent-holdonly', '독립 grace 롱노트', lines(
    '앞 롱노트와 연결되지 않은, 길이가 있는 grace 롱노트도 시작 입력이 필요합니다.',
    '시연의 첫 롱노트는 너무 일찍부터 누른 키로 기다려도 시작되지 않아 Miss입니다.',
    '뒤의 별도 롱노트는 시작의 Good 윈도우 안에서 새 키를 눌러 유지하므로 Perfect입니다.',
    '앞에서 이어지는 롱노트라면 유효하게 유지하던 키를 그대로 이어 쓸 수 있습니다.',
  ), 12, independent),
  createTutorialPreview('advanced-short-holdonly', '아주 짧은 grace 롱노트', lines(
    '길이가 아주 짧으면 롱노트 끝이 시작의 Good 윈도우보다 먼저 지나갈 수 있습니다.',
    '이때는 끝을 지났어도 시작의 Good 윈도우 안에서 처음 누르면 Perfect로 완료합니다.',
    '시연은 끝보다 늦게 누르는 성공 예입니다. 이미 실패로 확정된 롱노트를 되살리는 규칙은 아닙니다.',
  ), 12, shortHold),
  createTutorialPreview('advanced-zero-holdonly', '길이 0의 유지 판정', lines(
    '길이가 0인 grace 롱노트는 Good 윈도우 안에 키를 누르고 있으면 됩니다.',
    '시연처럼 앞 롱노트가 끝나고 간격이 있어도, 계속 누른 키로 통과할 수 있습니다.',
    '새로 누를 필요는 없으며, 이 판정만으로 다른 롱노트 끝의 떼기를 대신할 수 있게 되지는 않습니다.',
  ), 12, zeroHold),
  createTutorialPreview('advanced-double-release', '더블 끝의 두 번 떼기', lines(
    '더블 롱노트의 끝에서는 두 키를 각각 떼세요.',
    '시연은 한 키만 떼고, 그 키를 의미 없이 다시 눌렀다 뗍니다. 다른 키는 너무 오래 유지합니다.',
    '새 노트를 처리하지 않은 재누름은 남은 한쪽의 떼기를 대신하지 못합니다.',
    '따라서 한쪽만 성공하고 다른 쪽은 Miss입니다. 유효한 새 시작 노트를 치는 경우와는 구분됩니다.',
  ), 12, doubleRelease),
] as const;
