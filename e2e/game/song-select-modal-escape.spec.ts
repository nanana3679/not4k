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

/** 곡 행 DELETE 요청의 응답을 보류했다가 `failDelete()`를 부르면 500으로 끝낸다. */
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
  await expect(
    page.getByRole('button', { name: '+ Chart', exact: true }),
    'admin 모달 E2E는 .env.local의 VITE_DEV_ADMIN=true가 필요하다',
  ).toBeVisible();
}

const songSelectHeading = (page: Page) => page.getByRole('heading', { name: 'Song Select', exact: true });

/** 포커스가 body이거나 제목이 `headingText`인 모달 상자 안에 있으면 true. 뒤의 곡 선택 요소에 있으면 false. */
function focusStaysInModalOrBody(page: Page, headingText: string) {
  return page.evaluate((text) => {
    const active = document.activeElement;
    if (!active || active === document.body) return true;
    const heading = Array.from(document.querySelectorAll('h3')).find((element) => element.textContent === text);
    return heading?.parentElement?.contains(active) ?? false;
  }, headingText);
}

/** 지금 포커스된 요소를 사람이 읽을 수 있게 적는다(실패 메시지용). */
function describeFocus(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!active) return 'none';
    return `${active.tagName.toLowerCase()} "${(active.textContent ?? '').trim().slice(0, 40)}"`;
  });
}

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

test('곡 삭제 확인 모달을 Escape를 누르고 있어 닫으면 → 자동 반복 keydown으로 타이틀에 가지 않고 곡 선택에 남으며, 뗐다가 새로 누르면 타이틀로 이동', async ({ page, baseURL }) => {
  await routeSupabase(page, baseURL!);
  await openSongSelect(page);

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  const modalHeading = page.getByRole('heading', { name: 'Delete Song', exact: true });
  await expect(modalHeading).toBeVisible();

  // keyboard.down을 떼지 않고 다시 부르면 repeat=true인 keydown이 간다(누르고 있는 상태의 자동 반복).
  await page.keyboard.down('Escape');
  await expect(modalHeading).toHaveCount(0);
  await page.keyboard.down('Escape');
  await page.keyboard.down('Escape');
  await expect(songSelectHeading(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toHaveCount(0);

  await page.keyboard.up('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
});

test('곡 추가 모달이 열려 있으면 Tab·Shift+Tab 각 8번 → 뒤의 곡 선택 버튼에 포커스가 가지 않고, Escape로 곡 추가 모달이 닫힘', async ({ page, baseURL }) => {
  await routeSupabase(page, baseURL!);
  await openSongSelect(page);

  await page.getByRole('button', { name: '+ Add Song', exact: true }).click();
  const modalHeading = page.getByRole('heading', { name: 'New Song', exact: true });
  await expect(modalHeading).toBeVisible();

  let focusedInsideModal = false;
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press(key);
      expect(await focusStaysInModalOrBody(page, 'New Song'), `${key} ${i + 1}번째 포커스: ${await describeFocus(page)}`).toBe(true);
      focusedInsideModal ||= await page.evaluate(() => document.activeElement !== document.body);
    }
  }
  // Tab이 아예 동작하지 않은 것이 아니라 모달 안(Title·Artist 입력, Cancel 등)에서만 움직였는지 확인한다.
  expect(focusedInsideModal).toBe(true);

  await page.keyboard.press('Escape');
  await expect(modalHeading).toHaveCount(0);
  await expect(songSelectHeading(page)).toBeVisible();
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
