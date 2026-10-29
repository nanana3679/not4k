import { test, expect, type Page, type Locator, type Route } from '@playwright/test';

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
      inputOffsetMs: 0,
      visualOffsetMs: 0,
      renderHeight: 1080,
      preset: 'tkl',
      isFirstLaunch: false,
    },
  },
  version: 0,
});

// 부하가 큰 기계에서 느려지는 대기의 상한. 기본값(expect 5초, 테스트 30초)은 한가한 기계 기준이다.
// Start 뒤 곡 선택이 그려질 때까지. 곡 목록은 빈 목록으로 바꾸므로 네트워크는 기다리지 않는다(startSongSelect).
const APP_START_TIMEOUT_MS = 15_000;
// 플레이 진행(스킨 PNG·오디오 준비와 Pixi 초기화·텍스처 업로드 뒤의 첫 프레임, 판정 효과, 결과 화면)을 기다리는 상한. gear-motion 등 다른 게임 E2E와 같다.
const PLAY_TIMEOUT_MS = 30_000;
// 실제 플레이 테스트는 앱을 두 번 열고(설정 저장 → 새로고침) 플레이까지 하므로 기본 30초 대신 이만큼 기다린다.
const PLAY_TEST_TIMEOUT_MS = 90_000;
const SONG_LIST_URL = '**/rest/v1/songs?**';

// 타이틀에서 Start를 눌러 곡 선택을 연다. 곡 선택과 Settings 버튼은 곡 목록 응답 뒤에야 그려진다(그 전에는 PageLoading이 화면을 대신하며, 버튼을 덮는 요소는 없다).
// 이 스펙은 곡 목록을 쓰지 않으므로 Supabase 응답 대신 빈 목록을 준다. 실제 요청은 부하가 큰 기계에서 30초 넘게 멈추다 "Failed to fetch"로 끝나기도 했다.
// page.route가 걸린 동안은 모든 요청을 가로채고 캐시를 꺼 앱 로딩이 느려지므로, 곡 선택이 뜰 때까지만 건다.
async function startSongSelect(page: Page): Promise<void> {
  const emptySongList = (route: Route) => route.fulfill({ json: [] });
  await page.route(SONG_LIST_URL, emptySongList);
  try {
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible({ timeout: APP_START_TIMEOUT_MS });
  } catch (error) {
    // 실패했으면 route는 할 수 있는 만큼만 푼다. 테스트 시간 초과 등으로 페이지가 닫히는 중이면 unroute가 실패해 원래 오류를 가리기 때문이다.
    await page.unroute(SONG_LIST_URL, emptySongList).catch(() => {});
    throw error;
  }
  await page.unroute(SONG_LIST_URL, emptySongList);
}

// 설정 모달을 연다. 설정은 곡 선택 위에 모달(role=dialog)로 뜨며, 기본 섹션은 Controls다.
async function openSettings(page: Page): Promise<Locator> {
  await page.goto('/game');
  await page.evaluate(
    (s) => localStorage.setItem('not4k-settings', s),
    NON_FIRST_LAUNCH_SETTINGS
  );
  await page.reload();
  await startSongSelect(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  return dialog;
}

// 새로고침해 저장된 설정으로 앱을 다시 열고 설정 모달을 띄운다(재방문).
async function reopenSettings(page: Page): Promise<void> {
  await page.reload();
  await startSongSelect(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
}

// "Lane N" 레이블이 든 키 바인딩 행을 반환한다.
function laneRow(dialog: Locator, laneNumber: number): Locator {
  return dialog.getByText(`Lane ${laneNumber}`, { exact: true }).locator('..');
}

test.describe('Game Settings', () => {
  test('Skin 탭은 기본 선택된 Classic만 보여 주고 Crystal 카드는 없으며, Classic은 재방문 후에도 유지되고 실제 플레이에서 명시 탭 노트·Body와 Classic 기어·봄 PNG를 로드한다', async ({ page }, testInfo) => {
    test.setTimeout(PLAY_TEST_TIMEOUT_MS);
    const errors: string[] = [];
    const requested: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requested.push(new URL(request.url()).pathname));
    const dialog = await openSettings(page);
    await dialog.getByRole('button', { name: 'Skin', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Classic', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByRole('button', { name: 'Crystal', exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Classic', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Classic', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await reopenSettings(page);
    await dialog.getByRole('button', { name: 'Skin', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Classic', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();

    // Supply an isolated chart/audio fixture, then let the actual PlayScreen
    // initialize its renderer and skin. The hook records only frames drawn after
    // the song started and observes explicit tap/body layers inside the lane clip.
    // 오디오를 테스트 제한 시간만큼 길게 두어, 스크린샷 전에 곡이 끝나 결과 화면이 캔버스를 대신하지 않게 한다.
    await page.evaluate(async (audioSeconds) => {
      const win = window as unknown as Record<string, unknown>;
      const rendererPath = performance.getEntriesByType('resource').map(entry=>entry.name)
        .find(url=>new URL(url).pathname === '/src/game/renderer/GameRenderer.ts') ?? '/src/game/renderer/GameRenderer.ts';
      const { GameRenderer }: typeof import('../../src/game/renderer/GameRenderer') = await import(rendererPath);
      const renderFrame = GameRenderer.prototype.renderFrame;
      GameRenderer.prototype.renderFrame = function (...args) {
        const result = renderFrame.apply(this, args);
        // deltaMs 0은 재생 전에 그리는 준비 프레임(prepareForPlayback)이라 기록하지 않는다. 게임 루프가 그린 프레임만 센다.
        if (args[1] === 0) return result;
        type Drawn = { visible: boolean; texture?: unknown; getBounds: () => { minY: number; maxY: number } };
        const self = this as unknown as {
          skinManager: import('../../src/game/skin/SkinManager').SkinManager;
          laneEndClip: { bounds: { minX: number; minY: number; maxY: number }; toGlobal: (point: { x: number; y: number }) => { y: number } };
          explicitNoteRenderer: { root: { children: { label: string; children: Drawn[] }[] } } | null;
        };
        // 레이어에 있어도 레인 끝 클립(laneEndClip, 키 윗면까지) 밖이면 화면에 없다. 탭 노트는 판정 시각 + 500ms까지 레이어에 남지만 키 윗면은
        // 판정 시각 + 약 184ms에 지나므로, 클립과 세로로 겹치는 것만 센다. mask로 쓰는 Graphics는 Pixi가 측정에서 빼 getBounds가 빈 상자라
        // 자기 사각형(bounds)을 전역 좌표로 바꾼다.
        const clip = self.laneEndClip;
        const clipTop = clip.toGlobal({ x: clip.bounds.minX, y: clip.bounds.minY }).y;
        const clipBottom = clip.toGlobal({ x: clip.bounds.minX, y: clip.bounds.maxY }).y;
        const inClip = (child: Drawn) => {
          if (!child.visible) return false;
          const bounds = child.getBounds();
          return bounds.maxY > clipTop && bounds.minY < clipBottom;
        };
        const layers = self.explicitNoteRenderer?.root.children ?? [];
        const taps = layers.find(layer => layer.label === 'explicit-tap')?.children ?? [];
        const bodies = layers.find(layer => layer.label === 'explicit-body')?.children ?? [];
        if (taps.some(inClip) && bodies.some(inClip)) win.__classicVisibleNotes = true;
        if (!win.__classicPlayFrame) {
          const skin = self.skinManager;
          win.__classicPlayFrame = {
            skinId: skin.skinId,
            bodyMode: skin.getTheme().longNoteBodyMode,
            terminalMode: skin.getTheme().longNoteTerminalMode,
            bombFrames: skin.getBombTextures().length,
            bombDurationMs: skin.getTheme().bombDurationMs,
            textures: ['noteSingle','noteDouble','noteTrill','bodyDouble','terminalSingle','terminalDouble','terminalTrill'].map(key => {
              const texture = skin.getTexture(key);
              return {key,width:texture.width,height:texture.height};
            }),
          };
        }
        return result;
      };
      const storePath = performance.getEntriesByType('resource').map(entry => entry.name)
        .find(url => new URL(url).pathname === '/src/game/stores/gameStore.ts') ?? '/src/game/stores/gameStore.ts';
      const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(storePath);
      const state = useGameStore.getState();
      const document: import('../../src/shared/types/chart').ChartDocument = {
        meta: {title:'Classic skin check',artist:'test',difficultyLabel:'NORMAL',difficultyLevel:1,imageFile:'',audioFile:'',previewAudioFile:'',offsetMs:0},
        // 같은 노트 묶음을 1.5초와 7.5초에 둔다. 탭 노트가 레인 안에 보이는 구간은 1.5초 묶음이 플레이 약 −0.66~1.68초, 7.5초 묶음이 약 5.34~7.68초(각 약 2.35초)다.
        // 1.5초 묶음은 곡이 시작될 때 판정선 위쪽에 있어 보통 첫 플레이 프레임이 담고, 첫 플레이 프레임이 늦으면 7.5초 묶음이 탭 노트·바디가 보이는 프레임을 만든다.
        notes: [
          {type: 'tap', kind: 'single',lane:1,beat:{n:3,d:1}},
          {type: 'body', holdCount: 1,lane:1,beat:{n:3,d:1},endBeat:{n:9,d:1}},
          {type: 'tap', kind: 'double',lane:2,beat:{n:3,d:1}},
          {type: 'body', holdCount: 2,lane:2,beat:{n:3,d:1},endBeat:{n:9,d:1}},
          {type: 'tap', kind: 'trill',lane:3,beat:{n:3,d:1}},
          {type: 'body', holdCount: 1, trill: true,lane:3,beat:{n:3,d:1},endBeat:{n:9,d:1}},
          {type: 'tap', kind: 'single',lane:1,beat:{n:15,d:1}},
          {type: 'body', holdCount: 1,lane:1,beat:{n:15,d:1},endBeat:{n:21,d:1}},
          {type: 'tap', kind: 'double',lane:2,beat:{n:15,d:1}},
          {type: 'body', holdCount: 2,lane:2,beat:{n:15,d:1},endBeat:{n:21,d:1}},
          {type: 'tap', kind: 'trill',lane:3,beat:{n:15,d:1}},
          {type: 'body', holdCount: 1, trill: true,lane:3,beat:{n:15,d:1},endBeat:{n:21,d:1}},
        ],
        trillZones:[{lane:3,beat:{n:0,d:1},endBeat:{n:22,d:1}}],
        events:[{type:'bpm',beat:{n:0,d:1},bpm:120}],
      };
      const audioBuffer = new AudioBuffer({numberOfChannels:1,length:44100*audioSeconds,sampleRate:44100});
      // 탭 노트는 화면 위끝에 든 뒤 키 윗면(레인 끝 클립)을 지날 때까지 보인다. 200(설정 최솟값)이면 그 시간이 약 2.35초(400이면 약 1.2초)라
      // 부하로 프레임 간격이 벌어져도 그 사이에 플레이 프레임이 든다.
      state.updateSettings({masterVolume:0,scrollSpeed:200});
      const fixturePath = '/e2e/normalPlayFixture.ts';
      const { startNormalFixture } = await import(fixturePath) as typeof import('../normalPlayFixture');
      startNormalFixture(document, audioBuffer);
    }, PLAY_TEST_TIMEOUT_MS / 1000);
    await expect.poll(()=>page.evaluate(() => (window as unknown as Record<string, {skinId:string}>).__classicPlayFrame?.skinId), { timeout: PLAY_TIMEOUT_MS }).toBe('classic');
    const frame = await page.evaluate(() => (window as unknown as Record<string, unknown>).__classicPlayFrame);
    expect(frame).toMatchObject({skinId:'classic',bodyMode:'repeat',terminalMode:'full-height',bombFrames:16,bombDurationMs:280});
    expect(frame).toHaveProperty('textures', [
      {key:'noteSingle',width:212,height:40}, {key:'noteDouble',width:212,height:40},
      {key:'noteTrill',width:200,height:40}, {key:'bodyDouble',width:200,height:40},
      {key:'terminalSingle',width:200,height:40}, {key:'terminalDouble',width:200,height:40},
      {key:'terminalTrill',width:200,height:40},
    ]);
    for(const file of ['note-single','note-double','note-trill','terminal-double','terminal-double-idle','terminal-double-failed','terminal-trill','point-shadow','point-grace-overlay','terminal-grace-overlay','bomb-15']) {
      expect(requested).toContain(`/skins/classic/${file}.png`);
    }
    expect(requested.some(path => path.startsWith('/skins/classic-explicit/') && /\/tap-single(?:@2x)?\.png$/.test(path))).toBe(true);
    expect(requested.some(path => path.startsWith('/skins/classic-explicit/') && /body-single/.test(path))).toBe(true);
    expect(requested.some(path=>path.startsWith('/lab/'))).toBe(false);
    expect(errors).toEqual([]);
    await expect(page.getByTestId('gameplay-canvas')).toBeVisible();
    // 곡이 시작된 뒤 게임 루프가 그린 프레임의 레인 안에 탭 노트와 바디가 함께 보였는지. 1.5초 묶음을 놓치면 7.5초 묶음까지 기다린다.
    await expect.poll(()=>page.evaluate(() => Boolean((window as unknown as Record<string, unknown>).__classicVisibleNotes)), { timeout: PLAY_TIMEOUT_MS }).toBe(true);
    // 육안 확인용 산출물이다(픽셀 비교 없음). 훅은 실제 프레임만 관찰한다.
    await page.getByTestId('gameplay-canvas').screenshot({path:testInfo.outputPath('classic-in-game.png')});
  });

  test('Skin: 키봄 크기는 기본 1배이며 0.1배 단위로 0~3배를 선택하고 1.7배를 재방문까지 저장한다', async ({ page }, testInfo) => {
    const dialog = await openSettings(page);
    await dialog.getByRole('button', { name: 'Skin', exact: true }).click();
    const slider = dialog.getByLabel('Key Bomb Size');
    await expect(slider).toHaveValue('1');
    await expect(slider).toHaveAttribute('min', '0');
    await expect(slider).toHaveAttribute('max', '3');
    await expect(slider).toHaveAttribute('step', '0.1');
    await slider.fill('1.7');
    await expect(dialog.getByText('1.7×', { exact: true })).toBeVisible();
    await reopenSettings(page);
    await dialog.getByRole('button', { name: 'Skin', exact: true }).click();
    await expect(slider).toHaveValue('1.7');
    await dialog.getByRole('button', { name: 'Classic', exact: true }).click();
    await expect(slider).toHaveValue('1.7');
    await dialog.screenshot({ path: testInfo.outputPath('keybomb-size-settings.png') });
  });

  for (const skin of ['Classic']) {
    for (const scale of [0, 3]) {
      test(`Skin: ${skin} 키봄 ${scale}배를 저장하면 실제 플레이에서 ${scale === 0 ? '키봄을 숨겨도 Perfect 판정' : '기본 75×75의 3배인 225×225로 표시하고 Perfect 판정'}을 유지한다`, async ({ page }) => {
        test.setTimeout(PLAY_TEST_TIMEOUT_MS);
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        const dialog = await openSettings(page);
        await dialog.getByRole('button', { name: 'Skin', exact: true }).click();
        await dialog.getByRole('button', { name: skin, exact: true }).click();
        await dialog.getByLabel('Key Bomb Size').fill(String(scale));
        await expect(dialog.getByText(scale === 0 ? '0.0× (Off)' : '3.0×', { exact: true })).toBeVisible();
        await page.reload();
        await startSongSelect(page);

        await page.evaluate(async () => {
          const win = window as unknown as Record<string, unknown>;
          const rendererPath = performance.getEntriesByType('resource').map(entry => entry.name)
            .find(url => new URL(url).pathname === '/src/game/renderer/GameRenderer.ts') ?? '/src/game/renderer/GameRenderer.ts';
          const { GameRenderer }: typeof import('../../src/game/renderer/GameRenderer') = await import(rendererPath);
          const showBombEffect = GameRenderer.prototype.showBombEffect;
          // Observe a real judgment effect without replacing its animation or scoring.
          GameRenderer.prototype.showBombEffect = function (lane) {
            showBombEffect.call(this, lane);
            const layer = (this as unknown as { effectLayer: import('pixi.js').Container }).effectLayer;
            win.__keybombSize = layer.children.map(child => ({ width: child.width, height: child.height }));
          };
          const storePath = performance.getEntriesByType('resource').map(entry => entry.name)
            .find(url => new URL(url).pathname === '/src/game/stores/gameStore.ts') ?? '/src/game/stores/gameStore.ts';
          const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(storePath);
          const state = useGameStore.getState();
          const document: import('../../src/shared/types/chart').ChartDocument = {
            meta: {
              title: 'Key bomb size check', artist: 'test', difficultyLabel: 'NORMAL', difficultyLevel: 1,
              imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0,
            },
            notes: [{ type: 'tap', kind: 'single', lane: 2, beat: { n: 1, d: 1 } }],
            trillZones: [],
            events: [
              { type: 'bpm', beat: { n: 0, d: 1 }, bpm: 120 },
              { type: 'auto', beat: { n: 0, d: 1 }, endBeat: { n: 3, d: 1 } },
            ],
          };
          const audioBuffer = new AudioBuffer({ numberOfChannels: 1, length: 44100 * 1.5, sampleRate: 44100 });
          state.updateSettings({ masterVolume: 0 });
          const fixturePath = '/e2e/normalPlayFixture.ts';
          const { startNormalFixture } = await import(fixturePath) as typeof import('../normalPlayFixture');
          startNormalFixture(document, audioBuffer);
        });

        await expect.poll(() => page.evaluate(() => (window as unknown as Record<string, unknown>).__keybombSize), { timeout: PLAY_TIMEOUT_MS })
          .toEqual(scale === 0 ? [] : [{ width: 225, height: 225 }]);
        await expect(page.getByText('100.00%', { exact: true })).toBeVisible({ timeout: PLAY_TIMEOUT_MS });
        const result = await page.evaluate(async () => {
          const storePath = performance.getEntriesByType('resource').map(entry => entry.name)
            .find(url => new URL(url).pathname === '/src/game/stores/gameStore.ts') ?? '/src/game/stores/gameStore.ts';
          const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(storePath);
          return useGameStore.getState().lastResult;
        });
        expect(result?.judgmentCounts.perfect).toBe(1);
        expect(result?.judgmentCounts.miss).toBe(0);
        expect(errors).toEqual([]);
      });
    }
  }

  test('Gameplay: 스크롤 속도 슬라이더를 1200으로 옮기면 값 표시가 1200', async ({ page }) => {
    const dialog = await openSettings(page);
    await dialog.getByRole('button', { name: 'Gameplay', exact: true }).click();

    const slider = dialog.getByLabel('Scroll Speed');
    await slider.fill('1200');
    await expect(slider).toHaveValue('1200');
    await expect(dialog.getByText('1200', { exact: true })).toBeVisible();
  });

  test('Gameplay: Lift 슬라이더를 50으로 옮기면 값 표시가 50%', async ({ page }) => {
    const dialog = await openSettings(page);
    await dialog.getByRole('button', { name: 'Gameplay', exact: true }).click();

    const slider = dialog.getByLabel('Lift');
    await slider.fill('50');
    await expect(slider).toHaveValue('50');
    await expect(dialog.getByText('50%', { exact: true })).toBeVisible();
  });

  test('Gameplay: Sudden 슬라이더는 비활성(Coming soon)', async ({ page }) => {
    const dialog = await openSettings(page);
    await dialog.getByRole('button', { name: 'Gameplay', exact: true }).click();

    await expect(dialog.getByLabel('Sudden')).toBeDisabled();
    await expect(dialog.getByText('Coming soon', { exact: true })).toBeVisible();
  });

  test('Gameplay: Render Resolution 드롭다운으로 1440p/720p 선택', async ({ page }) => {
    const dialog = await openSettings(page);
    await dialog.getByRole('button', { name: 'Gameplay', exact: true }).click();

    const select = dialog.getByLabel('Render Resolution');
    await select.selectOption('1440');
    await expect(select).toHaveValue('1440');
    await select.selectOption('720');
    await expect(select).toHaveValue('720');
  });

  test('Gameplay: Gear Motion 토글은 기본 켬이고, 끄면 재방문 후에도 꺼진 채 저장된다', async ({ page }) => {
    const dialog = await openSettings(page);
    await dialog.getByRole('button', { name: 'Gameplay', exact: true }).click();

    const toggle = dialog.getByLabel('Gear Motion');
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await expect(toggle).not.toBeChecked();
    await reopenSettings(page);
    await dialog.getByRole('button', { name: 'Gameplay', exact: true }).click();
    await expect(dialog.getByLabel('Gear Motion')).not.toBeChecked();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('not4k-settings') ?? '{}').state?.settings?.gearMotion);
    expect(stored).toBe(false);
  });

  test('Gameplay에서 Input Offset −50ms·Visual Offset 30ms를 저장하면 재방문 후 유지되고 Calibrate는 숨겨진다', async ({ page }) => {
    const dialog = await openSettings(page);
    await dialog.getByRole('button', { name: 'Gameplay', exact: true }).click();
    const input = dialog.getByLabel('Input Offset (ms)');
    const visual = dialog.getByLabel('Visual Offset (ms)');
    await expect(input).toHaveValue('0');
    await expect(visual).toHaveValue('0');
    await input.fill('-50');
    await input.press('Tab');
    await visual.fill('30');
    await visual.press('Tab');
    await expect(dialog.getByRole('button', { name: /Calibrate/ })).toHaveCount(0);
    await expect(dialog.getByLabel('Audio Offset (ms)')).toHaveCount(0);
    await expect(dialog.getByLabel('Judgment Offset (ms)')).toHaveCount(0);
    await reopenSettings(page);
    await dialog.getByRole('button', { name: 'Gameplay', exact: true }).click();
    await expect(dialog.getByLabel('Input Offset (ms)')).toHaveValue('-50');
    await expect(dialog.getByLabel('Visual Offset (ms)')).toHaveValue('30');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('not4k-settings') ?? '{}').state.settings);
    expect(stored.inputOffsetMs).toBe(-50);
    expect(stored.visualOffsetMs).toBe(30);
  });

  test('Gameplay에서 입력 1500ms·시각 −1500ms를 확정하면 ±1000ms로 제한되어 재방문 후에도 유지된다', async ({ page }) => {
    const dialog = await openSettings(page);
    await dialog.getByRole('button', { name: 'Gameplay', exact: true }).click();
    const input = dialog.getByLabel('Input Offset (ms)');
    const visual = dialog.getByLabel('Visual Offset (ms)');
    await input.fill('1500');
    await input.press('Tab');
    await expect(input).toHaveValue('1000');
    await visual.fill('-1500');
    await visual.press('Tab');
    await expect(visual).toHaveValue('-1000');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('not4k-settings') ?? '{}').state.settings);
    expect(stored.inputOffsetMs).toBe(1000);
    expect(stored.visualOffsetMs).toBe(-1000);
    await reopenSettings(page);
    await dialog.getByRole('button', { name: 'Gameplay', exact: true }).click();
    await expect(input).toHaveValue('1000');
    await expect(visual).toHaveValue('-1000');
  });

  test('Controls: + Add 클릭 시 리스닝 상태 후 새 키 칩 추가', async ({ page }) => {
    const dialog = await openSettings(page);

    await laneRow(dialog, 1).getByRole('button', { name: '+ Add' }).click();
    await expect(dialog.getByText('Press any key…')).toBeVisible();

    await page.keyboard.press('z');
    await expect(dialog.getByText('KeyZ', { exact: true })).toBeVisible();
  });

  test('Controls: 키가 2개 초과면 칩 삭제 가능', async ({ page }) => {
    const dialog = await openSettings(page);

    const removeButtons = laneRow(dialog, 1).getByTitle('Remove key');
    await expect(removeButtons).toHaveCount(4);
    await removeButtons.last().click();
    await expect(removeButtons).toHaveCount(3);
  });

  test('Controls: 키가 2개만 남으면 삭제 차단하고 경고', async ({ page }) => {
    const dialog = await openSettings(page);

    // lane2는 3키(KeyE, KeyD, KeyC)로 시작
    const removeButtons = laneRow(dialog, 2).getByTitle('Remove key');
    await removeButtons.last().click();
    await expect(removeButtons).toHaveCount(2);

    await removeButtons.last().click();
    await expect(dialog.getByText('Each lane must keep at least 2 keys')).toBeVisible();
    await expect(removeButtons).toHaveCount(2);
  });

  test('Controls: 프리셋 리셋 버튼이 바인딩을 교체', async ({ page }) => {
    const dialog = await openSettings(page);

    await dialog.getByRole('button', { name: 'Reset to Numpad' }).click();
    await expect(dialog.getByText('Reset to NUMPAD preset', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Numpad7', { exact: true })).toBeVisible();

    await dialog.getByRole('button', { name: 'Reset to TKL' }).click();
    await expect(dialog.getByText('Reset to TKL preset', { exact: true })).toBeVisible();
  });
});
