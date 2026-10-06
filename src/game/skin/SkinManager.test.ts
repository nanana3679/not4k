import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { assetsLoad, assetsUnload } = vi.hoisted(() => ({
  assetsLoad: vi.fn(async (request: string | { src: string }) => {
    const path = typeof request === 'string' ? request : request.src;
    // 파일명 끝의 -WxH로 텍스처 크기를 흉내 낸다. 없으면 16×16.
    const size = /-(\d+)x(\d+)\.png$/.exec(path);
    const [width, height] = size ? [Number(size[1]), Number(size[2])] : [16, 16];
    return { path, width, height, frame: { x: 0, y: 0, width, height }, source: {} };
  }),
  assetsUnload: vi.fn(async (_path: string) => undefined),
}));

vi.mock('pixi.js', () => ({
  Assets: { load: assetsLoad, unload: assetsUnload },
  Rectangle: class Rectangle {},
  Texture: class Texture {},
}));

import { SkinManager } from './SkinManager';
import { getSkinManifest } from './skins';

describe('SkinManager', () => {
  beforeEach(() => {
    assetsLoad.mockClear();
    assetsUnload.mockClear();
  });

  const HELD_ASSET_KEYS = ['bodySingleHeld', 'bodyDoubleHeld', 'bodyDoublePartialHeldLeft', 'bodyDoublePartialHeldRight', 'bodyTrillHeld'] as const;
  const withoutHeldAssets = (assets: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(assets).filter(([key]) => !(HELD_ASSET_KEYS as readonly string[]).includes(key)));

  it('heldEffect: false 스킨은 켜짐 에셋 5종 없이 로드되고 켜짐 텍스처를 제공하지 않는다', async () => {
    const base = getSkinManifest('classic');
    const manifest = { theme: { ...base.theme, id: 'no-effect', heldEffect: false }, assets: withoutHeldAssets(base.assets) } as unknown as typeof base;
    const manager = new SkinManager();
    await manager.loadSkin(manifest);
    for (const key of HELD_ASSET_KEYS) expect(manager.hasTexture(key), key).toBe(false);
    expect(manager.hasTexture('bodyDoublePartialFailedLeft')).toBe(true);
    expect(assetsLoad.mock.calls.some(([path]) => String(path).includes('-held'))).toBe(false);
    manager.dispose();
  });

  it('기어만 밉맵·삼선형 설정을 붙여 경로 별칭으로 읽고 나머지 에셋은 경로 그대로 읽는다', async () => {
    const manager = new SkinManager();
    await manager.loadSkin('classic');
    const objectLoads = assetsLoad.mock.calls.map(([request]) => request as unknown).filter((request) => typeof request !== 'string');
    expect(objectLoads).toEqual([{
      alias: '/gear/classic-gear.png',
      src: '/gear/classic-gear.png',
      data: { autoGenerateMipmaps: true, scaleMode: 'linear' },
    }]);
    expect(manager.hasTexture('gearFrame')).toBe(true);
    expect(manager.hasTexture('gearGaugeLeft')).toBe(false);
    manager.dispose();
    await vi.waitFor(() => expect(assetsUnload).toHaveBeenCalledWith('/gear/classic-gear.png'));
  });

  it('heldEffect를 생략한 스킨에 bodySingleHeld가 없으면 빠진 에셋 이름을 담은 오류로 로딩이 실패한다', async () => {
    const base = getSkinManifest('classic');
    const { bodySingleHeld: _held, ...assets } = base.assets;
    const manager = new SkinManager();
    await expect(manager.loadSkin({ ...base, theme: { ...base.theme, id: 'missing-held' }, assets } as unknown as typeof base))
      .rejects.toThrow(/bodySingleHeld/);
    manager.dispose();
  });

  describe('스킨 설정·이미지 불일치 경고', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    });

    const contactWithoutImage = () => {
      const base = getSkinManifest('classic');
      const { pointContactShadow: _single, ...assets } = base.assets;
      return { theme: { ...base.theme, id: 'contact-no-image' }, assets } as typeof base;
    };

    it('개발 환경에서 theme.pointContactShadow만 있고 이미지가 없는 스킨 "contact-no-image"를 로드하면 스킨 id를 담은 경고를 console.warn으로 1번 출력한다', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const manager = new SkinManager();
      await manager.loadSkin(contactWithoutImage());
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('"contact-no-image"');
      expect(warn.mock.calls[0][0]).toContain('assets.pointContactShadow');
      manager.dispose();
    });

    it('개발 환경에서 불일치가 없는 Classic을 로드하면 console.warn을 호출하지 않는다', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const manager = new SkinManager();
      await manager.loadSkin('classic');
      expect(warn).not.toHaveBeenCalled();
      manager.dispose();
    });

    it('배포 빌드(import.meta.env.DEV=false)에서는 불일치 스킨 "contact-no-image"를 로드해도 console.warn을 호출하지 않는다', async () => {
      vi.stubEnv('DEV', false);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const manager = new SkinManager();
      await manager.loadSkin(contactWithoutImage());
      expect(warn).not.toHaveBeenCalled();
      expect(manager.hasTexture('noteSingle')).toBe(true);
      manager.dispose();
    });
  });

  it('같은 Classic ID의 v001→v002 매니페스트를 주입하면 이전 텍스처를 새 버전으로 교체한다', async () => {
    const base = getSkinManifest('classic');
    const previous = { ...base, assets: { ...base.assets, noteSingle: '/lab/skin-versions/classic/v001/skin/note-single.png' } };
    const current = { ...base, assets: { ...base.assets, noteSingle: '/lab/skin-versions/classic/v002/skin/note-single.png' } };
    const manager = new SkinManager();
    await manager.loadSkin(previous);
    expect(manager.getTexture('noteSingle')).toMatchObject({path: previous.assets.noteSingle});
    await manager.loadSkin(current);
    expect(manager.getTexture('noteSingle')).toMatchObject({path: current.assets.noteSingle});
    expect(getSkinManifest('classic').assets.noteSingle).toBe('/skins/classic/note-single.png');
    assetsLoad.mockClear();
    await manager.loadSkin(current);
    expect(assetsLoad).not.toHaveBeenCalled();
    manager.dispose();
  });

  it('두 매니저가 crystal을 공유하면 먼저 dispose한 슬롯은 전역 texture를 unload하지 않음', async () => {
    const first = new SkinManager();
    const second = new SkinManager();

    await first.loadSkin('crystal');
    await second.loadSkin('crystal');
    first.dispose();

    expect(assetsUnload).not.toHaveBeenCalled();

    second.dispose();
    await vi.waitFor(() => expect(assetsUnload).toHaveBeenCalled());
    expect(new Set(assetsUnload.mock.calls.map(([path]) => path)).size).toBe(
      assetsUnload.mock.calls.length,
    );
  });

  it('이전 unload가 끝나기 전 새 슬롯이 열리면 새 load는 unload 뒤에 실행', async () => {
    const first = new SkinManager();
    await first.loadSkin('crystal');

    let releaseUnload!: () => void;
    const unloadFinished = new Promise<void>(resolve => { releaseUnload = resolve; });
    assetsUnload.mockImplementationOnce(async () => {
      await unloadFinished;
      return undefined;
    });
    first.dispose();
    await vi.waitFor(() => expect(assetsUnload).toHaveBeenCalled());

    const loadCountBeforeSecond = assetsLoad.mock.calls.length;
    const second = new SkinManager();
    const secondLoad = second.loadSkin('crystal');
    await Promise.resolve();
    expect(assetsLoad.mock.calls.length).toBe(loadCountBeforeSecond);

    releaseUnload();
    await secondLoad;
    expect(assetsLoad.mock.calls.length).toBeGreaterThan(loadCountBeforeSecond);
    second.dispose();
  });

  it('이전 generation load 실패가 새 generation 소유권을 해제하지 않음', async () => {
    const manager = new SkinManager();
    let rejectFirstLoad!: (error: Error) => void;
    const firstLoad = new Promise<never>((_, reject) => { rejectFirstLoad = reject; });
    assetsLoad.mockImplementationOnce(() => firstLoad);

    const stale = manager.loadSkin('crystal');
    const current = manager.loadSkin('crystal');
    rejectFirstLoad(new Error('stale load failed'));
    await expect(stale).rejects.toThrow('stale load failed');
    await current;

    assetsUnload.mockClear();
    manager.dispose();
    await vi.waitFor(() => expect(assetsUnload).toHaveBeenCalled());
  });

  it('note-asset-lab을 로드하면 누르기 전 terminal 3종을 선택 텍스처로 제공', async () => {
    const manager = new SkinManager();

    await manager.loadSkin('note-asset-lab');

    expect(assetsLoad).toHaveBeenCalledWith('/lab/note-assets/skin/terminal-single-idle.png');
    expect(assetsLoad).toHaveBeenCalledWith('/lab/note-assets/skin/terminal-double-idle.png');
    expect(assetsLoad).toHaveBeenCalledWith('/lab/note-assets/skin/terminal-trill-idle.png');
    expect(manager.hasTexture('terminalSingleIdle')).toBe(true);
    expect(manager.hasTexture('terminalDoubleIdle')).toBe(true);
    expect(manager.hasTexture('terminalTrillIdle')).toBe(true);
    manager.dispose();
  });

  it('매니페스트에 pointContactShadow·pointContactShadowTrill 경로가 있으면 두 접촉 그림자 텍스처를 함께 로드하고 없으면 제공하지 않는다', async () => {
    const classic = getSkinManifest('classic');
    const { pointContactShadow: _single, pointContactShadowTrill: _trill, ...baseAssets } = classic.assets;
    const base = { ...classic, assets: baseAssets };
    const withContact = { ...base, assets: { ...base.assets,
      pointContactShadow: '/lab/skin-versions/classic/v013/skin/point-contact-shadow.png',
      pointContactShadowTrill: '/lab/skin-versions/classic/v013/skin/point-contact-shadow-trill.png',
    } };
    const manager = new SkinManager();
    await manager.loadSkin(withContact);
    expect(assetsLoad).toHaveBeenCalledWith('/lab/skin-versions/classic/v013/skin/point-contact-shadow.png');
    expect(assetsLoad).toHaveBeenCalledWith('/lab/skin-versions/classic/v013/skin/point-contact-shadow-trill.png');
    expect(manager.hasTexture('pointContactShadow')).toBe(true);
    expect(manager.hasTexture('pointContactShadowTrill')).toBe(true);
    // 테마에 pointContactShadow가 남아 있어 이미지 누락 경고가 나온다(#174).
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await manager.loadSkin(base);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('스킨 "classic"에 theme.pointContactShadow는 있지만'));
    warn.mockRestore();
    expect(manager.hasTexture('pointContactShadow')).toBe(false);
    expect(manager.hasTexture('pointContactShadowTrill')).toBe(false);
    manager.dispose();
  });

  it('싱글·더블 포인트 212px·바디 200px이면 바디 폭 비율은 200/212이고 트릴 포인트·바디가 모두 200px이면 1이다', async () => {
    const base = getSkinManifest('classic');
    const manager = new SkinManager();
    await manager.loadSkin({ ...base, assets: { ...base.assets,
      noteSingle: '/t/note-single-212x40.png', bodySingle: '/t/body-single-200x40.png',
      noteDouble: '/t/note-double-212x40.png', bodyDouble: '/t/body-double-200x40.png',
      noteTrill: '/t/note-trill-200x40.png', bodyTrill: '/t/body-trill-200x40.png',
    } });
    expect(manager.getBodyWidthScale('single')).toBeCloseTo(200 / 212);
    expect(manager.getBodyWidthScale('double')).toBeCloseTo(200 / 212);
    expect(manager.getBodyWidthScale('trill')).toBe(1);
    manager.dispose();
  });

  it('바디 이미지가 포인트보다 넓거나 텍스처를 아직 불러오지 않았으면 바디 폭 비율은 1이다', async () => {
    const manager = new SkinManager();
    expect(manager.getBodyWidthScale('single')).toBe(1);
    const base = getSkinManifest('crystal');
    await manager.loadSkin({ ...base, assets: { ...base.assets, noteSingle: '/t/note-single-100x20.png', bodySingle: '/t/body-single-120x60.png' } });
    expect(manager.getBodyWidthScale('single')).toBe(1);
    manager.dispose();
  });

  it('Classic을 로드하면 16프레임 봄과 포인트 그림자·Grace2종을 게임용 공통 폴더에서 제공', async () => {
    const manager = new SkinManager();
    await manager.loadSkin('classic');
    expect(manager.getBombTextures()).toHaveLength(16);
    for(const key of ['pointShadow','pointGraceOverlay','terminalGraceOverlay']) expect(manager.hasTexture(key)).toBe(true);
    expect(assetsLoad).toHaveBeenCalledWith('/skins/classic/point-shadow.png');
    expect(assetsLoad).toHaveBeenCalledWith('/skins/classic/bomb-15.png');
    manager.dispose();
  });
});
