import { test, expect, type Locator, type Page } from '@playwright/test';
import type { DbSong } from '../../src/game/screens/songSelect/types';

const NON_FIRST_LAUNCH_SETTINGS = JSON.stringify({
  state: {
    settings: {
      keyBindings: {
        lane1: ['KeyQ', 'KeyW', 'KeyS', 'KeyX'],
        lane2: ['KeyE', 'KeyD', 'KeyC'],
        lane3: ['KeyP', 'KeyL', 'Comma'],
        lane4: ['BracketLeft', 'BracketRight', 'Semicolon', 'Period'],
      },
      scrollSpeed: 800,
      liftPercent: 0,
      suddenPercent: 0,
      targetFps: 60,
      offsetMs: 0,
      preset: 'tkl',
      isFirstLaunch: false,
    },
  },
  version: 0,
});

function mockSong(
  id: string,
  title: string,
  artist: string,
  charts: Array<[difficultyLabel: string, difficultyLevel: number]>,
): DbSong {
  return {
    id,
    title,
    artist,
    audio_url: `songs/${id}/audio.ogg`,
    duration: null,
    preview_start: null,
    preview_end: null,
    preview_url: null,
    gameplay_start: null,
    gameplay_end: null,
    gameplay_fade_in: null,
    gameplay_fade_out: null,
    jacket_url: null,
    timing: null, revision: 1,
    charts: charts.map(([difficultyLabel, difficultyLevel]) => ({
      id: `${id}-${difficultyLabel}`,
      song_id: id,
      difficulty_label: difficultyLabel,
      difficulty_level: difficultyLevel,
    })),
  };
}

// 곡 선택 화면이 받는 고정 곡 목록. 저장된 난이도 식별자 easy·normal·hard는 화면에서 LIFTOFF·INFILTRATION·BREAKTHROUGH로 보인다.
// Mock Song A의 차트는 hard·easy·normal 순서로 두고 레벨은 난이도와 반대(hard 3, easy 9)로 두어, 곡 카드가 레벨이 아니라
// 난이도 순서(sortChartsByDifficulty)로 정렬해 보여 주는지 확인한다.
const MOCK_SONGS: DbSong[] = [
  mockSong('mock-song-a', 'Mock Song A', 'Artist A', [['hard', 3], ['easy', 9], ['normal', 6]]),
  mockSong('mock-song-b', 'Mock Song B', 'Artist B', [['normal', 5], ['hard', 8]]),
  mockSong('mock-song-c', 'Mock Song C', 'Artist C', [['easy', 2], ['normal', 4]]),
];

const CHART_TAG_TEXT = /^(LIFTOFF|INFILTRATION|BREAKTHROUGH) Lv\.\d+$/;

// index.html이 불러오는 외부 글꼴. 테스트에서는 기록 없이 중단해 대체 글꼴로 그린다.
const GOOGLE_FONTS_ORIGINS = new Set(['https://fonts.googleapis.com', 'https://fonts.gstatic.com']);
// 곡 선택 화면이 곡마다 부르는 자켓 이미지와 프리뷰 음원 파일(jacket.*·audio.*·preview.*). 차트 JSON은 여기에 들지 않는다.
const SONG_MEDIA_PATH = /^\/storage\/v1\/object\/public\/assets\/songs\/[^/]+\/(jacket|audio|preview)\.[a-z0-9]+$/;

/**
 * 페이지의 모든 요청을 가로채, 연결된 Supabase 프로젝트의 곡 데이터나 자격 증명과 무관하게 같은 화면을 보게 한다.
 * - 경로가 `/rest/v1/`·`/storage/v1/`·`/auth/v1/`로 시작하는 요청(origin 무관): OPTIONS는 204, `GET /rest/v1/songs`는
 *   `MOCK_SONGS`, `SONG_MEDIA_PATH`에 맞는 GET은 404로 응답한다(곡 선택 화면은 자켓을 숨기고 프리뷰 재생 실패를 무시한다).
 *   그 밖의 요청은 500으로 응답하고 기록한다.
 * - 앱 origin의 GET은 그대로 통과시킨다.
 * - Google Fonts origin의 요청은 기록하지 않고 중단한다.
 * - 나머지(위 세 경로가 아닌 Supabase 경로, 그 밖의 origin, 앱 origin의 GET이 아닌 요청)는 중단하고 기록한다.
 * 기록은 `${method} ${origin}${pathname}` 형식으로 돌려주는 배열에 쌓이며, 중단한 요청에는 ` (aborted)`를 붙인다.
 */
async function guardOfflineRequests(page: Page, appOrigin: string): Promise<string[]> {
  const unexpectedRequests: string[] = [];
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const requestLabel = `${method} ${url.origin}${path}`;
    if (/^\/(rest|storage|auth)\/v1\//.test(path)) {
      if (method === 'OPTIONS') { await route.fulfill({ status: 204 }); return; }
      if (method === 'GET' && path === '/rest/v1/songs') {
        await route.fulfill({ json: MOCK_SONGS }); return;
      }
      if (method === 'GET' && SONG_MEDIA_PATH.test(path)) {
        await route.fulfill({ status: 404, body: 'Not found' }); return;
      }
      unexpectedRequests.push(requestLabel);
      await route.fulfill({ status: 500, json: { error: 'Unexpected offline test request' } }); return;
    }
    if (url.origin === appOrigin && method === 'GET') {
      await route.continue(); return;
    }
    if (!GOOGLE_FONTS_ORIGINS.has(url.origin)) unexpectedRequests.push(`${requestLabel} (aborted)`);
    await route.abort();
  });
  return unexpectedRequests;
}

/**
 * 오른쪽 곡 목록. 왼쪽 상세 패널도 포커스된 곡의 제목·아티스트·난이도 태그를 다시 보여 주므로 목록 안으로 좁혀 찾는다.
 * 곡 목록에는 테스트용 식별자가 없어, 첫 곡과 마지막 곡 제목을 함께 담은 가장 안쪽 요소를 목록으로 본다.
 */
function songList(page: Page): Locator {
  return page.locator('div')
    .filter({ has: page.getByText('Mock Song A', { exact: true }) })
    .filter({ has: page.getByText('Mock Song C', { exact: true }) })
    .last();
}

/** 곡 목록에서 제목이 title인 카드. 카드는 제목과 난이도 태그를 함께 담은 요소이다. */
function songCard(page: Page, title: string): Locator {
  return songList(page).locator('div')
    .filter({ has: page.getByText(title, { exact: true }) })
    .filter({ has: page.getByText(CHART_TAG_TEXT) });
}

async function navigateToSongSelect(page: Page) {
  await page.goto('/game');
  await page.evaluate(
    (s) => localStorage.setItem('not4k-settings', s),
    NON_FIRST_LAUNCH_SETTINGS
  );
  await page.reload();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
}

test.describe('Song Select Screen', () => {
  let unexpectedRequests: string[] = [];

  test.beforeEach(async ({ page, baseURL }) => {
    unexpectedRequests = await guardOfflineRequests(page, new URL(baseURL!).origin);
    await navigateToSongSelect(page);
  });

  test.afterEach(() => {
    // 페이지를 닫지 않고 지금까지 기록된 요청을 확인한다. 여기서 닫으면 실패 때 Playwright가 남기는
    // error-context.md(페이지 스냅샷)가 만들어지지 않는다.
    expect(unexpectedRequests).toEqual([]);
  });

  test('Supabase 곡 목록이 3곡이면 곡 목록에 3곡의 제목과 아티스트를 표시', async ({ page }) => {
    const list = songList(page);
    for (const song of MOCK_SONGS) {
      await expect(list.getByText(song.title, { exact: true })).toBeVisible();
      await expect(list.getByText(song.artist, { exact: true })).toBeVisible();
    }
  });

  test('Mock Song A 차트를 hard·easy·normal 순서와 난이도 반대 레벨로 받아도 곡 카드에는 곡마다 가진 차트만 LIFTOFF·INFILTRATION·BREAKTHROUGH 순서 태그로 표시', async ({ page }) => {
    await expect(songCard(page, 'Mock Song A').getByText(CHART_TAG_TEXT))
      .toHaveText(['LIFTOFF Lv.9', 'INFILTRATION Lv.6', 'BREAKTHROUGH Lv.3']);
    await expect(songCard(page, 'Mock Song B').getByText(CHART_TAG_TEXT))
      .toHaveText(['INFILTRATION Lv.5', 'BREAKTHROUGH Lv.8']);
    await expect(songCard(page, 'Mock Song C').getByText(CHART_TAG_TEXT))
      .toHaveText(['LIFTOFF Lv.2', 'INFILTRATION Lv.4']);
  });

  test('Mock Song C의 LIFTOFF 태그를 고르고 Play를 누르면 곡 선택을 떠나 그 곡 easy 차트의 로딩 화면으로 이동', async ({ page }) => {
    await page.route('**/storage/v1/object/public/assets/songs/mock-song-c/**', () => {
      // 로딩 화면이 부르는 차트·음원 요청에는 응답하지 않아 pending으로 둔다. 응답하면 로딩이 끝나 로딩 화면이 사라진다.
    });

    await songCard(page, 'Mock Song C').getByText('LIFTOFF Lv.2', { exact: true }).click();
    await Promise.all([
      page.waitForRequest((request) =>
        new URL(request.url()).pathname === '/storage/v1/object/public/assets/songs/mock-song-c/easy.json'),
      page.getByRole('button', { name: 'Play', exact: true }).click(),
    ]);

    await expect(page.getByRole('heading', { name: 'Song Select' })).toBeHidden();
    await expect(page.getByText('Loading...', { exact: true })).toBeVisible();
    await expect(page.getByText('mock-song-c - LIFTOFF', { exact: true })).toBeVisible();
  });

  test('? 버튼으로 중앙 튜토리얼 팝업을 열고 닫을 수 있음', async ({ page }) => {
    // 축소 재생기 2개(WebGL)를 띄우고 레슨을 여러 번 넘기므로 다른 튜토리얼 팝업 스펙처럼 시간 여유를 둔다.
    test.setTimeout(120_000);
    const helpButton = page.getByRole('button', { name: 'Open tutorial help' });
    await expect(helpButton).toHaveText('?');

    await helpButton.click();

    const dialog = page.getByRole('dialog', { name: 'Tutorial' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-tutorial-preview-canvas="true"]')).toHaveCount(2);

    const activeSlot = dialog.locator('[data-tutorial-preview-slot="active"]');
    // 레인 키 라벨·키보드 배열은 이제 GameRenderer(PixiJS) 캔버스 안에 그려져 DOM 요소가 없다.
    await expect(activeSlot.locator('[data-tutorial-preview-canvas="true"]')).toBeVisible();

    await dialog.locator('[data-tutorial-index-item="connected-long-note-switch"]').click();
    // 도식 확인 모달은 카드/슬롯이 아니라 문서 최상위(portal)로 그려진다 — page 기준으로 찾는다.
    const diagramModal = page.locator('[data-tutorial-diagram-modal="true"]').first();
    await expect(diagramModal).toBeVisible();
    await expect(diagramModal.locator('[data-tutorial-diagram-id="connected-switch"]')).toBeVisible();
    await expect(diagramModal.locator('[data-tutorial-diagram-ok="true"]')).toBeVisible();
    await page.waitForTimeout(1200);
    await expect(diagramModal).toBeVisible();
    await diagramModal.locator('[data-tutorial-diagram-ok="true"]').click();
    await expect(diagramModal).toBeHidden();

    // 캐러셀 트랙(`data-tutorial-carousel-track`)의 `data-tutorial-transition-phase="animating"`은
    // 260ms(TUTORIAL_PAGE_TRANSITION_MS)만 이어져 expect 폴링 간격 사이에 시작과 끝이 모두 지나갈 수 있다.
    // 클릭 전에 이 속성의 변화를 MutationObserver로 지켜보고, 바뀌기 전 값(oldValue)이나 바뀐 값이 animating이었는지
    // 페이지 안에 기록한다.
    await page.evaluate(() => {
      const probe = window as typeof window & { __tutorialCarouselAnimated?: boolean };
      probe.__tutorialCarouselAnimated = false;
      new MutationObserver((mutations) => {
        for (const { target, oldValue } of mutations) {
          if (!(target instanceof Element) || !target.matches('[data-tutorial-carousel-track]')) continue;
          if (oldValue === 'animating' || target.getAttribute('data-tutorial-transition-phase') === 'animating') {
            probe.__tutorialCarouselAnimated = true;
          }
        }
      }).observe(document.body, {
        subtree: true,
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ['data-tutorial-transition-phase'],
      });
    });
    await dialog.locator('[data-tutorial-index-item="connected-long-note-overlap"]').click();
    const activeOverlapSlot = dialog.locator(
      '[data-tutorial-preview-slot="active"][data-tutorial-preview-id="connected-long-note-overlap"]'
    );
    await expect(activeOverlapSlot).toBeVisible();
    await expect(dialog.locator('[data-tutorial-carousel-track="true"]'))
      .toHaveAttribute('data-tutorial-transition-phase', 'idle');
    expect(await page.evaluate(() =>
      (window as typeof window & { __tutorialCarouselAnimated?: boolean }).__tutorialCarouselAnimated
    )).toBe(true);
    const overlapDiagramModal = page.locator('[data-tutorial-diagram-modal="true"]').first();
    await expect(overlapDiagramModal.locator('[data-tutorial-diagram-id="connected-overlap"]')).toBeVisible();
    const firstOverlapInstanceId = await activeOverlapSlot.getAttribute('data-tutorial-preview-instance');
    // 도식 확인 모달은 화면 전체를 덮어 재생을 멈추는 확인 모달이다(docs/spec/tutorial.md).
    // OK로 닫아야 그 아래 팝업의 Next 버튼을 누를 수 있다.
    await overlapDiagramModal.locator('[data-tutorial-diagram-ok="true"]').click();
    await expect(overlapDiagramModal).toBeHidden();
    await page.getByRole('button', { name: 'Next tutorial' }).click();
    await expect(dialog.locator(
      '[data-tutorial-preview-slot="active"][data-tutorial-preview-id="connected-trill-long"]'
    )).toBeVisible();
    // connected-trill-long 차트에는 tutorialDiagram이 없어 도식 확인 모달이 뜨지 않는다.
    await expect(page.locator('[data-tutorial-diagram-modal="true"]')).toBeHidden();
    await page.getByRole('button', { name: 'Previous tutorial' }).click();
    const restoredOverlapSlot = dialog.locator(
      '[data-tutorial-preview-slot="active"][data-tutorial-preview-id="connected-long-note-overlap"]'
    );
    await expect(restoredOverlapSlot).not.toHaveAttribute(
      'data-tutorial-preview-instance',
      firstOverlapInstanceId ?? ''
    );
    const restoredDiagramModal = page.locator('[data-tutorial-diagram-modal="true"]').first();
    await expect(restoredDiagramModal.locator('[data-tutorial-diagram-id="connected-overlap"]')).toBeVisible();
    await restoredDiagramModal.locator('[data-tutorial-diagram-ok="true"]').click();
    await expect(restoredDiagramModal).toBeHidden();

    await page.getByRole('button', { name: 'Close tutorial help' }).click();
    await expect(dialog).toBeHidden();

    await helpButton.click();
    const reopenedDialog = page.getByRole('dialog', { name: 'Tutorial' });
    await expect(reopenedDialog).toBeVisible();
    await expect(
      reopenedDialog.locator('[data-tutorial-index-item="connected-long-note-overlap"]')
    ).toHaveAttribute('data-tutorial-index-seen', 'true');
    await expect(
      reopenedDialog.locator(
        '[data-tutorial-index-item="connected-long-note-overlap"] [data-tutorial-index-check="true"]'
      )
    ).toBeVisible();
    await reopenedDialog.locator('[data-tutorial-reset-viewed-cache="true"]').click();
    await expect(
      reopenedDialog.locator('[data-tutorial-index-item="connected-long-note-overlap"]')
    ).toHaveAttribute('data-tutorial-index-seen', 'false');
    await expect(
      reopenedDialog.locator(
        '[data-tutorial-index-item="connected-long-note-overlap"] [data-tutorial-index-check="true"]'
      )
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Close tutorial help' }).click();
    await expect(reopenedDialog).toBeHidden();
  });
});
