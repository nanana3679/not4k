import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { NumberRow } from './NumberRow';

describe.each(['Input Offset', 'Visual Offset'])('NumberRow의 %s', label => {
  it.each([
    ['1500', 1000], ['-1500', -1000], ['1000', 1000], ['-1000', -1000],
    ['12.5', 12.5], ['0', 0], ['', 0], ['NaN', 0], ['Infinity', 0], ['-Infinity', 0],
  ])('입력값 %s에서 포커스를 옮기면 %sms로 확정한다', (text, expected) => {
    const onCommit = vi.fn();
    const onText = vi.fn();
    const row = NumberRow({ label, unit: 'ms', text, onText, onCommit });
    const input = row.props.children[1].props.children[0] as ReactElement<{
      onBlur: () => void;
      onChange: (event: { target: { value: string } }) => void;
    }>;
    input.props.onChange({ target: { value: text } });
    expect(onText).toHaveBeenCalledWith(text);
    expect(onCommit).not.toHaveBeenCalled();
    input.props.onBlur();
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(expected);
  });
});
