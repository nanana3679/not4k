import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OffsetRow } from './OffsetRow';

interface InputProps {
  min: number;
  max: number;
  onBlur: () => void;
  onChange: (event: { target: { value: string } }) => void;
}

function findInput(node: ReactNode): ReactElement<InputProps> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue;
    if (child.type === 'input') return child as ReactElement<InputProps>;
    const input = findInput(child.props.children);
    if (input) return input;
  }
}

function setup(text: string) {
  const onCommit = vi.fn();
  const onText = vi.fn();
  const row = OffsetRow({ label: 'Input Offset', unit: 'ms', text, onText, onCommit });
  const input = findInput(row);
  if (!input) throw new Error('숫자 입력 요소가 없다');
  return { input, onCommit, onText };
}

describe('OffsetRow', () => {
  it.each([
    ['1500', 1000], ['-1500', -1000], ['1000', 1000], ['-1000', -1000],
    ['12.5', 12.5], ['0', 0], ['NaN', 0], ['Infinity', 0], ['-Infinity', 0],
  ])('입력값 %s에서 포커스를 옮기면 %sms로 확정한다', (text, expected) => {
    const { input, onCommit, onText } = setup(text);
    input.props.onChange({ target: { value: text } });
    expect(onText).toHaveBeenCalledWith(text);
    expect(onCommit).not.toHaveBeenCalled();
    input.props.onBlur();
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it('빈 입력이면 포커스를 옮길 때 0ms로 확정한다', () => {
    const { input, onCommit } = setup('');
    input.props.onBlur();
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('숫자 입력의 허용 범위는 −1000~+1000ms다', () => {
    const { input } = setup('0');
    expect(input.props.min).toBe(-1000);
    expect(input.props.max).toBe(1000);
  });
});
