import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { beat } from '../../shared';
import type { ChartDocument } from '../../shared';
import { PAUSE_TO_EDIT_COPY } from '../editorCopy';
import { EventEditModal } from './EventEditModal';

const chart: ChartDocument = {
  meta: { title: '이벤트 편집', artist: '', difficultyLabel: 'NORMAL', difficultyLevel: 1, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
  notes: [],
  trillZones: [],
  events: [
    { type: 'bpm', beat: beat(0), bpm: 120, editorLane: 1 },
    { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
    { type: 'bpm', beat: beat(8), bpm: 150, editorLane: 1 },
  ],
};

const render = (editLocked: boolean) => renderToStaticMarkup(createElement(EventEditModal, {
  editingEvent: { type: 'event', index: 2 }, chart, isBeatZero: false, editLocked,
  onSave() {}, onDelete() {}, onClose() {},
}));

describe('이벤트 편집 창의 재생 중 잠금', () => {
  it('재생 중 8박 BPM 150 이벤트 창은 BPM 입력·Save·Delete를 비활성으로 두고 정지하라는 title을 단다', () => {
    const markup = render(true);

    expect(markup).toMatch(/<fieldset[^>]*disabled=""/);
    expect(markup).toMatch(new RegExp(`<fieldset[^>]*title="${PAUSE_TO_EDIT_COPY}"`));
    expect(markup).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*title="${PAUSE_TO_EDIT_COPY}"[^>]*>Save</button>`));
    expect(markup).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*title="${PAUSE_TO_EDIT_COPY}"[^>]*>Delete</button>`));
    expect(markup).toMatch(/<button[^>]*>Cancel<\/button>/);
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>Cancel<\/button>/);
  });

  it.each([0, 1])('재생 중 0박 초기 이벤트 index=%s는 입력 묶음과 삭제 버튼에 초기 이벤트 제한보다 재생 안내 title을 우선 표시한다', index => {
    const markup = renderToStaticMarkup(createElement(EventEditModal, {
      editingEvent: { type: 'event', index }, chart, isBeatZero: true, editLocked: true,
      onSave() {}, onDelete() {}, onClose() {},
    }));

    expect(markup).toMatch(new RegExp(`<fieldset[^>]*disabled=""[^>]*title="${PAUSE_TO_EDIT_COPY}"`));
    expect(markup).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*title="${PAUSE_TO_EDIT_COPY}"[^>]*>Delete</button>`));
    expect(markup).not.toContain('Cannot delete initial event');
  });

  it('정지 중 같은 창은 BPM 입력·Save·Delete를 활성으로 둔다', () => {
    const markup = render(false);

    expect(markup).not.toContain('disabled=""');
    expect(markup).not.toContain(PAUSE_TO_EDIT_COPY);
  });
});

describe('초기 설정 편집 창의 값 편집', () => {
  it.each([
    { index: 0, name: '0박 BPM 120 창은 BPM 입력', fields: ['BPM'] },
    { index: 1, name: '0박 박자 4/4 창은 Numerator·Denominator 입력', fields: ['Numerator', 'Denominator'] },
  ])('$name만 두고 Editor lane 선택은 없다', ({ index, fields }) => {
    const markup = renderToStaticMarkup(createElement(EventEditModal, {
      editingEvent: { type: 'event', index }, chart, isBeatZero: true,
      onSave() {}, onDelete() {}, onClose() {},
    }));

    for (const field of fields) expect(markup).toContain(`<span>${field}</span>`);
    expect(markup).not.toContain('Editor lane');
    expect(markup).not.toContain('<select');
  });
});
