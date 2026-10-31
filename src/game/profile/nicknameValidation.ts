export function validateNickname(draft: string): string | null {
  if (draft.length === 0) return 'Enter a nickname.';
  if (/\s/u.test(draft)) return 'Nicknames cannot contain spaces.';
  if ([...draft].length > 16) return 'Nicknames can be up to 16 characters.';
  if (!/^[\p{L}\p{Nd}]+$/u.test(draft)) return 'Nicknames can only use letters and numbers.';
  return null;
}
