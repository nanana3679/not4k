import { Container, Texture, TextureSource } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import motionJsonText from '../../../public/gear/gear-motion/gear-motion.json?raw';
import { createGearMotion, type GearMotionTextures } from './gearMotion';
import type { GearMotionAssetLease, GearMotionResources } from './gearMotionAssets';
import { GEAR_MOTION_TEXTURE_KEYS, parseGearMotionData } from './gearMotionData';
import { GEAR_MOTION_MAX_STEP_MS, GearMotionController, type GearMotionControllerOptions } from './GearMotionController';

const data = parseGearMotionData(JSON.parse(motionJsonText));

function fakeTextures(): GearMotionTextures {
  return Object.fromEntries(GEAR_MOTION_TEXTURE_KEYS.map((key) => {
    const box = data.textures[key];
    return [key, new Texture({ source: new TextureSource({ width: box.width, height: box.height }) })];
  })) as GearMotionTextures;
}

/** 준비 시점을 테스트가 정하는 임대. release는 멱등이 아닌 가짜라 몇 번 불렸는지 그대로 센다. */
function controllableLease() {
  let resolve!: (resources: GearMotionResources) => void;
  let reject!: (error: unknown) => void;
  const ready = new Promise<GearMotionResources>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  ready.catch(() => undefined);
  const lease = { ready, release: vi.fn<() => void>() } satisfies GearMotionAssetLease;
  return { lease, resolve: () => resolve({ data, textures: fakeTextures() }), reject };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const node = (holder: Container, label: string) => holder.getChildByLabel(label, true)!;
const bandY = (holder: Container) => node(holder, 'gear-motion-band-core').y;

function controllerWith(options: Partial<GearMotionControllerOptions> = {}) {
  const holder = new Container();
  const { lease, resolve, reject } = controllableLease();
  const update = vi.fn();
  const controller = new GearMotionController({
    holder,
    lease,
    isHidden: () => false,
    create: (motionData, textures, motionOptions) => {
      const motion = createGearMotion(motionData, textures, motionOptions);
      const original = motion.update;
      return { ...motion, update: (timeMs: number) => { update(timeMs); original(timeMs); } };
    },
    ...options,
  });
  return { holder, lease, resolve, reject, controller, update };
}

async function readyController(options: Partial<GearMotionControllerOptions> = {}) {
  const made = controllerWith(options);
  made.resolve();
  await flush();
  return made;
}

afterEach(() => vi.restoreAllMocks());

describe('GearMotionController — 게임 렌더러의 gearMotion 수명과 애니메이션 경과 시간', () => {
  it('gearMotion 에셋이 준비되기 전에는 status loading·애니메이션 경과 시간 0·running false·ready 미이행이고 advance(16)을 해도 애니메이션 경과 시간이 0이며 holder는 비어 있다', async () => {
    const { holder, controller } = controllerWith();
    const ready = vi.fn();
    void controller.ready.then(ready);
    controller.advance(16);
    await flush();
    expect([controller.status, controller.timeMs, controller.running]).toEqual(['loading', 0, false]);
    expect(ready).not.toHaveBeenCalled();
    expect(holder.children).toHaveLength(0);
    expect(controller.gaugeFill).toBeNull();
    controller.destroy();
  });

  it('에셋이 준비되면 gearMotion 컨테이너를 holder에 추가한 뒤에 ready가 이행하고 status ready, 애니메이션 경과 시간 0의 모습(광원 띠 중심 y −841)으로 시작한다', async () => {
    const { holder, controller } = await readyController();
    expect(controller.status).toBe('ready');
    expect(controller.running).toBe(true);
    await expect(controller.ready).resolves.toBeUndefined();
    expect(holder.children.map((child) => child.label)).toEqual(['gear-motion']);
    expect(bandY(holder)).toBe(-841);
    expect(controller.gaugeFill?.label).toBe('gear-motion-gauge-fill');
    controller.destroy();
  });

  it('ready 뒤 advance(16)을 3번 부르면 애니메이션 경과 시간이 48ms이고 gearMotion을 update(16)·update(32)·update(48)로 갱신한다', async () => {
    const { controller, update } = await readyController();
    update.mockClear();
    controller.advance(16);
    controller.advance(16);
    controller.advance(16);
    expect(controller.timeMs).toBe(48);
    expect(update.mock.calls.map(([time]) => time)).toEqual([16, 32, 48]);
    controller.destroy();
  });

  it(`advance에 5000ms가 들어와도(숨은 탭 복귀·긴 프레임) 애니메이션 경과 시간은 ${GEAR_MOTION_MAX_STEP_MS}ms만 나아간다`, async () => {
    const { controller } = await readyController();
    controller.advance(5000);
    expect(GEAR_MOTION_MAX_STEP_MS).toBe(50);
    expect(controller.timeMs).toBe(50);
    controller.destroy();
  });

  it('advance에 −16·NaN·Infinity가 들어오면 애니메이션 경과 시간을 0에 그대로 두고 gearMotion을 갱신하지 않는다', async () => {
    const { controller, update } = await readyController();
    update.mockClear();
    for (const delta of [-16, Number.NaN, Number.POSITIVE_INFINITY]) controller.advance(delta);
    expect(controller.timeMs).toBe(0);
    expect(update).not.toHaveBeenCalled();
    controller.destroy();
  });

  it('탭이 숨어 있으면 advance(16)이 애니메이션 경과 시간을 0에 그대로 둔다(비행 배경과 같은 규칙)', async () => {
    const { controller } = await readyController({ isHidden: () => true });
    controller.advance(16);
    expect(controller.timeMs).toBe(0);
    controller.destroy();
  });

  it('advance를 부르지 않는 동안(게임 일시정지) 애니메이션 경과 시간은 32ms에 멈춰 있고, 다시 advance(16)하면 멈춘 시점에서 48ms로 이어 간다', async () => {
    const { controller } = await readyController();
    controller.advance(16);
    controller.advance(16);
    expect(controller.timeMs).toBe(32);
    controller.advance(16);
    expect(controller.timeMs).toBe(48);
    controller.destroy();
  });

  it('setEnabled(false)면 holder를 숨기고 애니메이션 경과 시간을 멈추며(running false), 다시 켜면 보이고 이어 간다', async () => {
    const { holder, controller } = await readyController();
    controller.advance(16);
    controller.setEnabled(false);
    expect([controller.running, holder.visible]).toEqual([false, false]);
    controller.advance(16);
    expect(controller.timeMs).toBe(16);
    controller.setEnabled(true);
    expect([controller.running, holder.visible]).toEqual([true, true]);
    controller.advance(16);
    expect(controller.timeMs).toBe(32);
    controller.destroy();
  });

  it('준비 전에 고른 A 큰 광원 끄기·setEnabled(false)는 gearMotion을 holder에 추가할 때 그대로 적용되어 A만 숨고 holder는 숨으며 running false라 advance(16)에도 0ms에 머문다', async () => {
    const { holder, resolve, controller } = controllerWith();
    controller.setLayerVisible('armor', false);
    controller.setEnabled(false);
    resolve();
    await flush();
    expect(controller.status).toBe('ready');
    expect(node(holder, 'gear-motion-armor').visible).toBe(false);
    expect(node(holder, 'gear-motion-gauge').visible).toBe(true);
    expect(holder.children[0].visible).toBe(true);
    expect([controller.running, holder.visible]).toEqual([false, false]);
    controller.advance(16);
    expect(controller.timeMs).toBe(0);
    controller.destroy();
  });

  it('seek(30000)이면 애니메이션 경과 시간이 30000ms이고 광원 띠 중심이 y 768에 오며, restart()면 0으로 돌아가 y −841', async () => {
    const { holder, controller } = await readyController();
    controller.seek(30_000);
    expect(controller.timeMs).toBe(30_000);
    expect(bandY(holder)).toBe(768);
    controller.restart();
    expect(controller.timeMs).toBe(0);
    expect(bandY(holder)).toBe(-841);
    controller.destroy();
  });

  it('textures는 holder에 추가하기 전 빈 배열, 추가하고 재생 중(running)이면 받은 텍스처 9개이고, 끔(setEnabled(false))·destroy 뒤에는 그리지 않으므로 빈 배열이다', async () => {
    let received: GearMotionTextures | undefined;
    const { controller, resolve } = controllerWith({
      create: (motionData, textures, motionOptions) => { received = textures; return createGearMotion(motionData, textures, motionOptions); },
    });
    expect(controller.textures).toEqual([]);
    resolve();
    await flush();
    expect(controller.textures).toHaveLength(9);
    expect(new Set(controller.textures)).toEqual(new Set(GEAR_MOTION_TEXTURE_KEYS.map((key) => received![key])));
    controller.setEnabled(false);
    expect(controller.textures).toEqual([]);
    controller.setEnabled(true);
    expect(controller.textures).toHaveLength(9);
    controller.destroy();
    expect(controller.textures).toEqual([]);
  });

  it('warmUp(render)은 추가한 gearMotion의 하단 바를 그 한 번 동안 그리게 하고, gearMotion이 없으면 render만 부른다', async () => {
    const { holder, controller } = await readyController();
    const bar = node(holder, 'gear-motion-bar');
    const seen: boolean[] = [];
    controller.warmUp(() => seen.push(bar.visible));
    expect(seen).toEqual([true]);
    expect(bar.visible).toBe(false);
    controller.destroy();
    const empty = controllerWith().controller;
    const render = vi.fn();
    empty.warmUp(render);
    expect(render).toHaveBeenCalledTimes(1);
    empty.destroy();
  });

  it('gearMotion 에셋 읽기가 실패하면(필수 에셋) ready가 같은 오류로 거절되고 holder는 비어 있으며, 경고 없이 임대는 destroy까지 합쳐 정확히 한 번 놓는다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { holder, lease, reject, controller } = controllerWith();
    const failure = new Error('404 gear-motion.json');
    reject(failure);
    await expect(controller.ready).rejects.toBe(failure);
    expect(holder.children).toHaveLength(0);
    controller.advance(16);
    expect([controller.timeMs, controller.running]).toEqual([0, false]);
    expect(warn).not.toHaveBeenCalled();
    controller.destroy();
    controller.destroy();
    expect(lease.release).toHaveBeenCalledTimes(1);
  });

  it('gearMotion을 만들다 실패하면(atlas frame 없는 데이터) ready가 그 오류로 거절되고 lease를 한 번 release한다', async () => {
    const { lease, resolve, controller } = controllerWith({ create: () => { throw new Error('glint pieces'); } });
    resolve();
    await expect(controller.ready).rejects.toThrow('glint pieces');
    expect(lease.release).toHaveBeenCalledTimes(1);
    controller.destroy();
    expect(lease.release).toHaveBeenCalledTimes(1);
  });

  it('destroy하면 gearMotion을 destroy하고 lease를 한 번 release하며, 두 번 불러도 다시 release하지 않는다', async () => {
    const { holder, lease, controller } = await readyController();
    const motionRoot = holder.children[0];
    controller.destroy();
    controller.destroy();
    expect(motionRoot.destroyed).toBe(true);
    expect(holder.children).toHaveLength(0);
    expect(lease.release).toHaveBeenCalledTimes(1);
    expect(controller.running).toBe(false);
  });

  it('준비 전에 destroy하면 나중에 에셋이 준비되어도 gearMotion을 만들지 않고 ready는 거절되며 lease는 한 번만 release한다', async () => {
    const create = vi.fn(createGearMotion);
    const { holder, lease, resolve, controller } = controllerWith({ create });
    controller.destroy();
    resolve();
    await expect(controller.ready).rejects.toThrow('released');
    expect(create).not.toHaveBeenCalled();
    expect(holder.children).toHaveLength(0);
    expect(lease.release).toHaveBeenCalledTimes(1);
  });
});
