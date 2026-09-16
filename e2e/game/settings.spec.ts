import { test, expect, type Page, type Locator } from '@playwright/test';

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
      audioOffsetMs: 0,
      judgmentOffsetMs: 0,
      renderHeight: 1080,
      preset: 'tkl',
      isFirstLaunch: false,
    },
  },
  version: 0,
});

// 설정 모달을 연다. 설정은 곡 선택 위에 모달(role=dialog)로 뜨며, 기본 섹션은 Controls다.
async function openSettings(page: Page): Promise<Locator> {
  await page.goto('/game');
  await page.evaluate(
    (s) => localStorage.setItem('not4k-settings', s),
    NON_FIRST_LAUNCH_SETTINGS
  );
  await page.reload();
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  return dialog;
}

// "Lane N" 레이블이 든 키 바인딩 행을 반환한다.
function laneRow(dialog: Locator, laneNumber: number): Locator {
  return dialog.getByText(`Lane ${laneNumber}`, { exact: true }).locator('..');
}

test.describe('Game Settings', () => {
  test('Skin에서 Classic을 선택하면 재방문 후에도 유지되고 실제 플레이에서 공통 노트·터미널·봄 PNG를 로드한다', async ({ page }, testInfo) => {
    const errors: string[] = [];
    const requested: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requested.push(new URL(request.url()).pathname));
    const dialog = await openSettings(page);
    await dialog.getByRole('button', { name: 'Skin', exact: true }).click();
    await dialog.getByRole('button', { name: 'Classic', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Classic', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByRole('button', { name: 'Crystal', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await page.reload();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await dialog.getByRole('button', { name: 'Skin', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Classic', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();

    // Supply an isolated chart/audio fixture, then let the actual PlayScreen
    // initialize its renderer and skin. The hook only observes rendering.
    await page.evaluate(async () => {
      const win = window as unknown as Record<string, unknown>;
      const rendererPath = performance.getEntriesByType('resource').map(entry=>entry.name)
        .find(url=>new URL(url).pathname === '/src/game/renderer/GameRenderer.ts') ?? '/src/game/renderer/GameRenderer.ts';
      const { GameRenderer }: typeof import('../../src/game/renderer/GameRenderer') = await import(rendererPath);
      const renderFrame = GameRenderer.prototype.renderFrame;
      GameRenderer.prototype.renderFrame = function (...args) {
        const result = renderFrame.apply(this, args);
        const layers = this as unknown as { noteLayer: {children:{visible:boolean}[]}; longNoteBodyLayer: {children:{visible:boolean}[]} };
        if (layers.noteLayer.children.some(child=>child.visible) && layers.longNoteBodyLayer.children.some(child=>child.visible)) win.__classicVisibleNotes = true;
        if (!win.__classicPlayFrame) {
          const skin = (this as unknown as { skinManager: import('../../src/game/skin/SkinManager').SkinManager }).skinManager;
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
      state.setChartData({
        meta: {title:'Classic skin check',artist:'test',difficultyLabel:'NORMAL',difficultyLevel:1,imageFile:'',audioFile:'',previewAudioFile:'',offsetMs:0},
        notes: [
          {type:'single',lane:1,beat:{n:3,d:1}},
          {type:'long',lane:1,beat:{n:3,d:1},endBeat:{n:9,d:1}},
          {type:'double',lane:2,beat:{n:3,d:1}},
          {type:'doubleLong',lane:2,beat:{n:3,d:1},endBeat:{n:9,d:1}},
          {type:'trill',lane:3,beat:{n:3,d:1}},
          {type:'trillLong',lane:3,beat:{n:3,d:1},endBeat:{n:9,d:1}},
        ],
        trillZones:[{lane:3,beat:{n:0,d:1},endBeat:{n:10,d:1}}],
        events:[{type:'bpm',beat:{n:0,d:1},bpm:120}],
      });
      state.setAudioBuffer(new AudioBuffer({numberOfChannels:1,length:44100*6,sampleRate:44100}));
      state.updateSettings({masterVolume:0,scrollSpeed:400});
      useGameStore.setState({screen:'play',startTimeMs:0,editorReturnUrl:null});
    });
    await expect.poll(()=>page.evaluate(() => (window as unknown as Record<string, {skinId:string}>).__classicPlayFrame?.skinId)).toBe('classic');
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
    expect(requested.some(path=>path.startsWith('/lab/'))).toBe(false);
    expect(errors).toEqual([]);
    await expect(page.locator('canvas')).toBeVisible();
    await expect.poll(()=>page.evaluate(() => Boolean((window as unknown as Record<string, unknown>).__classicVisibleNotes))).toBe(true);
    await page.locator('canvas').screenshot({path:testInfo.outputPath('classic-in-game.png')});
  });

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

  test('Gameplay: Audio Offset 입력에 숫자 50 입력', async ({ page }) => {
    const dialog = await openSettings(page);
    await dialog.getByRole('button', { name: 'Gameplay', exact: true }).click();

    const input = dialog.getByLabel('Audio Offset (ms)');
    await input.fill('50');
    await expect(input).toHaveValue('50');
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
