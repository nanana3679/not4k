// 한글 채움 문자(U+115F·U+1160·U+3164·U+FFA0)는 \p{L}이지만 빈칸으로 보인다. 서버 CHECK(#417)와 같이 따로 거부한다.
const HANGUL_FILLERS = /[\u115F\u1160\u3164\uFFA0]/u;

export function validateNickname(draft: string): string | null {
  if (draft.length === 0) return 'Enter a nickname.';
  if (/\s/u.test(draft)) return 'Nicknames cannot contain spaces.';
  if ([...draft].length > 16) return 'Nicknames can be up to 16 characters.';
  if (!/^[\p{L}\p{Nd}]+$/u.test(draft) || HANGUL_FILLERS.test(draft)) {
    return 'Nicknames can only use letters and numbers.';
  }
  return null;
}
