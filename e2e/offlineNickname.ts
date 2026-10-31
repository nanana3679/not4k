import type { Route } from '@playwright/test';

/** DEV_ADMIN도 /game 진입마다 호출하는 계정 닉네임 연동을 네트워크 없이 처리한다. */
export async function fulfillNicknameLink(route: Route): Promise<boolean> {
  const request = route.request();
  if (request.method() !== 'POST' || new URL(request.url()).pathname !== '/rest/v1/rpc/link_guest_nickname') {
    return false;
  }
  await route.fulfill({ json: [{ nickname: 'E2EPilot', first_link: false }] });
  return true;
}
