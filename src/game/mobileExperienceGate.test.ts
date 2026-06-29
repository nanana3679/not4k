import { describe, it, expect } from 'vitest';
import { shouldForceMobileSongList } from './mobileExperienceGate';

describe('shouldForceMobileSongList', () => {
  it('mobileSongList + 테스트 플레이 아님(editorReturnUrl=null)이면 곡 목록 강제 = true', () => {
    expect(shouldForceMobileSongList('mobileSongList', null)).toBe(true);
  });

  it('mobileSongList + 에디터 테스트 플레이(editorReturnUrl 있음)이면 곡 목록 강제 안 함 = false', () => {
    expect(shouldForceMobileSongList('mobileSongList', '/editor?songId=a&difficulty=expert')).toBe(false);
  });

  it('fullGame이면 editorReturnUrl=null이어도 곡 목록 강제 안 함 = false', () => {
    expect(shouldForceMobileSongList('fullGame', null)).toBe(false);
  });

  it('fullGame이면 editorReturnUrl이 있어도 곡 목록 강제 안 함 = false', () => {
    expect(shouldForceMobileSongList('fullGame', '/editor?songId=a&difficulty=expert')).toBe(false);
  });
});
