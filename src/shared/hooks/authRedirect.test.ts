import { describe, expect, it } from 'vitest';
import { getAuthRedirectTo } from './authRedirect';

function editorLocation(search: string, hash = '') {
  return { origin: 'https://not4k.vercel.app', pathname: '/editor', search, hash };
}

describe('getAuthRedirectTo의 이전 OAuth 결과 제거', () => {
  it('헤더 Login 실패로 ?error=server_error·error_code=500·error_description이 남은 editor URL이면 redirectTo에서 오류 키만 빼고 songId=s1·difficulty=EXPERT를 유지한다', () => {
    expect(getAuthRedirectTo(editorLocation('?songId=s1&error=server_error&error_code=500&error_description=Provider+unavailable&difficulty=EXPERT')))
      .toBe('https://not4k.vercel.app/editor?songId=s1&difficulty=EXPERT');
  });

  it('SDK 초기화 실패로 #access_token·refresh_token·expires_in·expires_at·token_type·provider_token·provider_refresh_token·type이 남으면 redirectTo의 hash를 비우고 ?songId=s1은 유지한다', () => {
    const hash = '#access_token=a&refresh_token=r&expires_in=3600&expires_at=1&token_type=bearer&provider_token=p&provider_refresh_token=pr&type=signup';
    expect(getAuthRedirectTo(editorLocation('?songId=s1', hash))).toBe('https://not4k.vercel.app/editor?songId=s1');
  });

  it('query의 type=recovery·hash의 error=access_denied와 함께 keep=1·note=2가 있으면 OAuth 결과 키만 지우고 ?keep=1·#note=2는 남긴다', () => {
    expect(getAuthRedirectTo(editorLocation('?type=recovery&keep=1', '#error=access_denied&note=2')))
      .toBe('https://not4k.vercel.app/editor?keep=1#note=2');
  });

  it('OAuth 결과 키가 없는 ?songId=s1·#profile이면 redirectTo는 현재 URL과 같다', () => {
    expect(getAuthRedirectTo(editorLocation('?songId=s1', '#profile'))).toBe('https://not4k.vercel.app/editor?songId=s1#profile');
  });
});
