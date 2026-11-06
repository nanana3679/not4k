import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MEASURE_LABEL_WIDTH } from '../timeline/constants';
import { SongCommonToggle } from './SongCommonToggle';

const props = (collapsed: boolean, compact = false) => ({ collapsed, compact, left: 120, onToggle: vi.fn() });
const button = (collapsed: boolean, compact = false) => {
  const input = props(collapsed, compact);
  return { input, element: SongCommonToggle(input) };
};
const keyDown = (key: string) => ({ key, stopPropagation: vi.fn() });

describe('곡 공통 영역 토글(RFD 0095)', () => {
  it('펼친 상태의 버튼은 이름 "BPM·박자표 열 접기", aria-expanded=true, 표시 ‹BPM이다', () => {
    const { props: rendered } = button(false).element;
    expect(rendered['aria-label']).toBe('BPM·박자표 열 접기');
    expect(rendered['aria-expanded']).toBe(true);
    expect(rendered.title).toBe('BPM·박자표 열 접기');
    expect(rendered.children).toBe('‹BPM');
  });

  it('접힌 상태의 버튼은 이름 "BPM·박자표 열 펼치기", aria-expanded=false, 표시 BPM›이다', () => {
    const { props: rendered } = button(true).element;
    expect(rendered['aria-label']).toBe('BPM·박자표 열 펼치기');
    expect(rendered['aria-expanded']).toBe(false);
    expect(rendered.children).toBe('BPM›');
  });

  it('native button으로 그려 Tab으로 닿고 type=button이라 폼을 보내지 않는다', () => {
    const markup = renderToStaticMarkup(createElement(SongCommonToggle, props(true)));
    expect(markup).toContain('<button');
    expect(markup).toContain('type="button"');
    expect(markup).not.toContain('tabindex');
  });

  it('누르면 onToggle을 1번 부른다', () => {
    const { input, element } = button(false);
    element.props.onClick();
    expect(input.onToggle).toHaveBeenCalledOnce();
  });

  it.each([' ', 'Enter'])('포커스된 채 %j 키는 전역 단축키로 가지 않아 버튼을 누른다', key => {
    const event = keyDown(key);
    button(false).element.props.onKeyDown(event);
    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });

  it.each(['Delete', 's', 'z', 'Tab'])('포커스된 채 %j 키는 전역 단축키로 그대로 간다', key => {
    const event = keyDown(key);
    button(false).element.props.onKeyDown(event);
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it('마우스로 눌러도 포커스를 가져가지 않아 뒤따르는 Space가 재생을 토글한다', () => {
    const preventDefault = vi.fn();
    button(false).element.props.onMouseDown({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it('마디 레일 폭 32px에 맞춰 left=120에 놓여 레인을 덮지 않는다', () => {
    const { style } = button(true).element.props;
    expect(style.width).toBe(MEASURE_LABEL_WIDTH);
    expect(style.left).toBe(120);
    expect(style.top).toBe(0);
    expect(style.position).toBe('absolute');
  });

  it('좁은 화면·터치에서는 높이가 28px→44px로 커진다', () => {
    expect(button(true).element.props.style.height).toBe(28);
    expect(button(true, true).element.props.style.height).toBe(44);
  });
});
