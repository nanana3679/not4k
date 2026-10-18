import { expect, test, type Page } from '@playwright/test';

// 곡 선택의 관리 모달(곡 삭제·곡 추가·새 차트)은 admin에게만 보인다. 개발 서버의
// VITE_DEV_ADMIN=true(.env.local)로 로그인 없이 admin이 된 상태에서 실행한다.
const SONG_ID = 'escape-modal-song';
const SONG = {
  id: SONG_ID, title: 'Escape Modal Song', artist: 'Offline', audio_url: `songs/${SONG_ID}/audio.wav`,
  duration: 12, preview_url: null, preview_start: null, preview_end: null, jacket_url: null,
  gameplay_start: null, gameplay_end: null, gameplay_fade_in: null, gameplay_fade_out: null,
  // 차트가 없어야 삭제 확인 모달의 Delete 버튼이 켜진다.
  charts: [],
};

/** 곡 행 DELETE 요청을 붙잡아 두었다가 `failDelete()`를 부르면 500으로 끝낸다. */
async function routeSupabase(page: Page, baseURL: string) {
  let failDelete = () => {};
  const deleteReleased = new Promise<void>((resolve) => { failDelete = resolve; });

  // 모든 Supabase 요청은 로컬 응답으로 끝낸다. 실제 DB/Storage 쓰기는 허용하지 않는다.
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (/^\/(rest|storage|auth)\/v1\//.test(url.pathname)) {
      if (method === 'OPTIONS') { await route.fulfill({ status: 204 }); return; }
      if (method === 'GET' && url.pathname === '/rest/v1/songs') { await route.fulfill({ json: [SONG] }); return; }
      if (method === 'DELETE' && url.pathname === '/rest/v1/songs') {
        await deleteReleased;
        await route.fulfill({ status: 500, json: { message: 'Offline delete failure' } });
        return;
      }
      await route.fulfill({ status: 404, json: { error: 'Offline test' } });
      return;
    }
    if (url.origin === new URL(baseURL).origin && method === 'GET') { await route.continue(); return; }
    await route.abort();
  });

  return { failDelete };
}

async function openSongSelect(page: Page) {
  await page.addInitScript(() => localStorage.setItem('not4k-settings', JSON.stringify({ state: { settings: { isFirstLaunch: false, masterVolume: 0 } }, version: 0 })));
  await page.goto('/game');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Song Select', exact: true })).toBeVisible();
  // admin 버튼은 곡 목록을 받아 포커스된 곡이 생긴 뒤에 보인다.
  await expect(page.getByRole('button', { name: '+ Chart', exact: true })).toBeVisible();
}

const songSelectHeading = (page: Page) => page.getByRole('heading', { name: 'Song Select', exact: true });

test('곡 삭제 확인 모달에서 Escape 한 번 → 모달만 닫히고 곡 선택에 남으며, 모달 없이 한 번 더 누르면 타이틀로 이동', async ({ page, baseURL }) => {
  await routeSupabase(page, baseURL!);
  await openSongSelect(page);

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  const modalHeading = page.getByRole('heading', { name: 'Delete Song', exact: true });
  await expect(modalHeading).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(modalHeading).toHaveCount(0);
  await expect(songSelectHeading(page)).toBeVisible();

  // 모달이 닫힌 뒤에는 곡 선택의 Escape(타이틀로 이동)가 다시 동작한다.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  await expect(songSelectHeading(page)).toHaveCount(0);
});

test('곡 추가 모달의 Title 입력 중 Escape 한 번 → 모달만 닫히고 곡 선택에 남음', async ({ page, baseURL }) => {
  await routeSupabase(page, baseURL!);
  await openSongSelect(page);

  await page.getByRole('button', { name: '+ Add Song', exact: true }).click();
  const modalHeading = page.getByRole('heading', { name: 'New Song', exact: true });
  await expect(modalHeading).toBeVisible();
  await page.getByPlaceholder('Song title').fill('Draft title');

  await page.keyboard.press('Escape');
  await expect(modalHeading).toHaveCount(0);
  await expect(songSelectHeading(page)).toBeVisible();
});

test('새 차트 모달의 Difficulty 선택기에 포커스가 있어도 Escape 한 번 → 모달만 닫히고 곡 선택에 남음', async ({ page, baseURL }) => {
  await routeSupabase(page, baseURL!);
  await openSongSelect(page);

  await page.getByRole('button', { name: '+ Chart', exact: true }).click();
  const modalHeading = page.getByRole('heading', { name: 'New Chart', exact: true });
  await expect(modalHeading).toBeVisible();
  await page.getByLabel('Difficulty').focus();

  await page.keyboard.press('Escape');
  await expect(modalHeading).toHaveCount(0);
  await expect(songSelectHeading(page)).toBeVisible();
});

test('곡 삭제 요청이 진행 중(Deleting...)일 때 Escape → 닫히지 않고, 삭제가 실패로 끝난 뒤 Escape → 닫힘', async ({ page, baseURL }) => {
  const { failDelete } = await routeSupabase(page, baseURL!);
  await openSongSelect(page);

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  const modalHeading = page.getByRole('heading', { name: 'Delete Song', exact: true });
  await expect(modalHeading).toBeVisible();
  // 모달이 열리면 Delete 버튼이 둘(뒤의 곡 정보 패널·모달 확인)이다. 모달 확인 버튼이 DOM에서 뒤에 있다.
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
  await expect(page.getByRole('button', { name: 'Deleting...', exact: true })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(modalHeading).toBeVisible();
  await expect(songSelectHeading(page)).toBeVisible();

  failDelete();
  const confirmButton = page.getByRole('button', { name: 'Delete', exact: true }).last();
  await expect(page.getByRole('button', { name: 'Deleting...', exact: true })).toHaveCount(0);
  await expect(confirmButton).toBeEnabled();

  await page.keyboard.press('Escape');
  await expect(modalHeading).toHaveCount(0);
  await expect(songSelectHeading(page)).toBeVisible();
});
