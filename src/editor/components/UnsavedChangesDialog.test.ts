import { Children, createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LEAVE_CONFIRM_COPY, PAUSE_TO_EDIT_COPY, SONG_INFO_UNSAVED_COPY } from '../editorCopy';
import { UnsavedChangesDialog, type UnsavedChangesDialogRequest } from './UnsavedChangesDialog';

type ButtonProps = { children?: ReactNode; onClick?: () => void; disabled?: boolean; onMouseDown?: () => void; autoFocus?: boolean };
function buttons(node: ReactNode): ButtonProps[] {
  return Children.toArray(node).flatMap(child => isValidElement<ButtonProps>(child)
    ? [...(child.type === 'button' ? [child.props] : []), ...buttons(child.props.children)] : []);
}
/** 확인 창을 한 번 렌더하며 요소 트리를 받는다(창의 포커스 훅은 이 Probe의 것이다). */
function tree(props: Parameters<typeof UnsavedChangesDialog>[0]): ReactNode {
  let node: ReactNode = null;
  function Probe() {
    node = UnsavedChangesDialog(props);
    return node;
  }
  renderToStaticMarkup(createElement(Probe));
  return node;
}
const labels = (request: UnsavedChangesDialogRequest) =>
  buttons(tree({ request, onChoose() {} })).map(button => button.children);

describe('미저장 변경 확인 창', () => {
  it('곡 정보 드로어 닫기는 저장 후 닫기·변경 취소 후 닫기·취소 세 선택과 차트 편집 보존 안내를 보인다', () => {
    const markup = renderToStaticMarkup(createElement(UnsavedChangesDialog,
      { request: { kind: 'songInfo', purpose: 'close' }, onChoose() {} }));

    expect(labels({ kind: 'songInfo', purpose: 'close' })).toEqual(['저장 후 닫기', '변경 취소 후 닫기', '취소']);
    expect(markup).toContain(SONG_INFO_UNSAVED_COPY.title);
    expect(markup).toContain(SONG_INFO_UNSAVED_COPY.closeBody);
    expect(markup).toContain(SONG_INFO_UNSAVED_COPY.discardNote);
  });

  it('같은 곡의 다른 차트 전환은 저장 후 전환·변경 취소 후 전환·취소를 보인다', () => {
    expect(labels({ kind: 'songInfo', purpose: 'switch' })).toEqual(['저장 후 전환', '변경 취소 후 전환', '취소']);
  });

  it.each(['leave', 'switch'] as const)('이동 확인(%s)은 Unsaved Changes 제목과 저장 후 이동·버리고 이동·취소를 보인다', purpose => {
    const markup = renderToStaticMarkup(createElement(UnsavedChangesDialog, { request: { kind: 'leave', purpose }, onChoose() {} }));

    expect(labels({ kind: 'leave', purpose })).toEqual(['저장 후 이동', '버리고 이동', '취소']);
    expect(markup).toContain(`>${LEAVE_CONFIRM_COPY.title}</h3>`);
  });

  it('세 버튼과 바깥 누름은 save·discard·cancel·cancel을 알린다', () => {
    const onChoose = vi.fn();
    const node = tree({ request: { kind: 'leave', purpose: 'leave' }, onChoose });
    for (const button of buttons(node)) button.onClick!();
    (node as { props: { onMouseDown: () => void } }).props.onMouseDown();

    expect(onChoose.mock.calls).toEqual([['save'], ['discard'], ['cancel'], ['cancel']]);
  });

  it('열리면 기본 동작인 저장 버튼(저장 후 닫기)에만 autoFocus를 두고 창은 aria-modal dialog다', () => {
    const request = { kind: 'songInfo', purpose: 'close' } as const;
    const markup = renderToStaticMarkup(createElement(UnsavedChangesDialog, { request, onChoose() {} }));

    expect(buttons(tree({ request, onChoose() {} })).map(button => button.autoFocus ?? false)).toEqual([true, false, false]);
    expect(markup).toMatch(/<div role="dialog" aria-modal="true"[^>]*tabindex="-1"/);
  });

  it('재생 중 타이밍을 되돌려야 하면 변경 취소 버튼만 비활성이고 정지 안내 title을 단다', () => {
    const markup = renderToStaticMarkup(createElement(UnsavedChangesDialog,
      { request: { kind: 'songInfo', purpose: 'close' }, discardLocked: true, onChoose() {} }));

    expect(markup).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*title="${PAUSE_TO_EDIT_COPY}"[^>]*>변경 취소 후 닫기</button>`));
    expect(markup).toMatch(/<button(?![^>]*disabled)[^>]*>저장 후 닫기<\/button>/);
  });
});
