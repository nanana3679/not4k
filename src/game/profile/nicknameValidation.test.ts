import { expect, it } from 'vitest';
import { validateNickname } from './nicknameValidation';

it.each(['a', '0', '한글123', 'é９١', '𐐀𝟘', '1234567890123456'])(
  '%j는 1～16 코드 포인트의 문자·십진 숫자이므로 저장을 허용한다', draft => {
    expect(validateNickname(draft)).toBeNull();
  },
);

it('빈 문자열을 저장하면 Enter a nickname.을 반환한다', () => {
  expect(validateNickname('')).toBe('Enter a nickname.');
});

it.each(['a b', ' name', 'name ', 'a\tb', 'a\nb', 'a\u00a0b', 'a\u3000b', '                 !'])(
  '%j를 저장하면 자르지 않고 길이·특수문자 검사보다 먼저 공백 오류를 반환한다', draft => {
    expect(validateNickname(draft)).toBe('Nicknames cannot contain spaces.');
  },
);

it('𐐀 16자는 허용하고 17자는 특수문자 검사보다 먼저 길이 오류를 반환한다', () => {
  expect(validateNickname('𐐀'.repeat(16))).toBeNull();
  expect(validateNickname('𐐀'.repeat(17))).toBe('Nicknames can be up to 16 characters.');
  expect(validateNickname('!'.repeat(17))).toBe('Nicknames can be up to 16 characters.');
});

it.each(['name²', 'nameⅣ', 'a_b', 'a-b', '🙂', 'e\u0301'])(
  '%j를 저장하면 문자·십진 숫자가 아닌 문자를 거부한다', draft => {
    expect(validateNickname(draft)).toBe('Nicknames can only use letters and numbers.');
  },
);
