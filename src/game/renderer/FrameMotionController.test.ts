import { Container, Texture, TextureSource } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import motionJsonText from '../../../public/gear/classic-frame-motion/frame-motion.json?raw';
import { createClassicFrameMotion, type FrameMotionTextures } from './classicFrameMotion';
import type { FrameMotionAssetLease, FrameMotionResources } from './classicFrameMotionAssets';
import { FRAME_MOTION_TEXTURE_KEYS, parseFrameMotionData } from './classicFrameMotionData';
import { FRAME_MOTION_MAX_STEP_MS, FrameMotionController } from './FrameMotionController';

const data = parseFrameMotionData(JSON.parse(motionJsonText));

function fakeTextures(): FrameMotionTextures {
  return Object.fromEntries(FRAME_MOTION_TEXTURE_KEYS.map((key) => {
    const box = data.textures[key];
    return [key, new Texture({ source: new TextureSource({ width: box.width, height: box.height }) })];
  })) as FrameMotionTextures;
}

/** 준비 시점을 테스트가 정하는 임대. */
function controllableLease() {
  let resolve!: (resources: FrameMotionResources) => void;
  let reject!: (error: unknown) => void;
  const ready = new Promise<FrameMotionResources>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  ready.catch(() => undefined);
  const lease = { ready, release: vi.fn<() => void>() } satisfies FrameMotionAssetLease;
  return { lease, resolve: () => resolve({ data, textures: fakeTextures() }), reject };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const bandY = (holder: Container) => holder.getChildByLabel('frame-motion-band-core', true)!.y;

async function readyController(options: { hidden?: boolean } = {}) {
  const holder = new Container();
  const { lease, resolve } = controllableLease();
  const update = vi.fn();
  const controller = new FrameMotionController({
    holder,
    lease,
    isHidden: () => options.hidden ?? false,
    create: (motionData, textures, motionOptions) => {
      const motion = createClassicFrameMotion(motionData, textures, motionOptions);
      const original = motion.update;
      return { ...motion, update: (timeMs: number) => { update(timeMs); original(timeMs); } };
    },
  });
  resolve();
  await flush();
  return { holder, lease, controller, update };
}

afterEach(() => vi.restoreAllMocks());

describe('FrameMotionController — 게임 렌더러의 프레임 움직임 수명과 시계', () => {
  it('자료가 준비되기 전에는 status loading·시계 0·running false이고 advance(16)을 해도 시계가 0이며 자리(holder)는 비어 있다', () => {
    const holder = new Container();
    const { lease } = controllableLease();
    const controller = new FrameMotionController({ holder, lease });
    controller.advance(16);
    expect([controller.status, controller.timeMs, controller.running]).toEqual(['loading', 0, false]);
    expect(holder.children).toHaveLength(0);
    expect(controller.gaugeFill).toBeNull();
    controller.destroy();
  });

  it('자료가 준비되면 움직임 컨테이너를 자리에 얹고 status ready, 시계 0의 모습(광원 띠 중심 y −841)으로 시작한다', async () => {
    const { holder, controller } = await readyController();
    expect(controller.status).toBe('ready');
    expect(controller.running).toBe(true);
    expect(holder.children.map((child) => child.label)).toEqual(['classic-frame-motion']);
    expect(bandY(holder)).toBe(-841);
    expect(controller.gaugeFill?.label).toBe('frame-motion-gauge-fill');
    controller.destroy();
  });

  it('ready 뒤 advance(16)을 3번 부르면 시계가 48ms이고 움직임을 update(16)·update(32)·update(48)로 갱신한다', async () => {
    const { controller, update } = await readyController();
    update.mockClear();
    controller.advance(16);
    controller.advance(16);
    controller.advance(16);
    expect(controller.timeMs).toBe(48);
    expect(update.mock.calls.map(([time]) => time)).toEqual([16, 32, 48]);
    controller.destroy();
  });

  it(`advance에 5000ms가 들어와도(숨은 탭 복귀·긴 프레임) 시계는 ${FRAME_MOTION_MAX_STEP_MS}ms만 나아간다`, async () => {
    const { controller } = await readyController();
    controller.advance(5000);
    expect(FRAME_MOTION_MAX_STEP_MS).toBe(50);
    expect(controller.timeMs).toBe(50);
    controller.destroy();
  });

  it('advance에 −16·NaN·Infinity가 들어오면 시계를 0에 그대로 두고 움직임을 갱신하지 않는다', async () => {
    const { controller, update } = await readyController();
    update.mockClear();
    for (const delta of [-16, Number.NaN, Number.POSITIVE_INFINITY]) controller.advance(delta);
    expect(controller.timeMs).toBe(0);
    expect(update).not.toHaveBeenCalled();
    controller.destroy();
  });

  it('탭이 숨어 있으면 advance(16)이 시계를 0에 그대로 둔다(비행 배경과 같은 규칙)', async () => {
    const { controller } = await readyController({ hidden: true });
    controller.advance(16);
    expect(controller.timeMs).toBe(0);
    controller.destroy();
  });

  it('advance를 부르지 않는 동안(게임 일시정지) 시계는 32ms에 멈춰 있고, 다시 advance(16)하면 멈춘 자리에서 48ms로 이어 간다', async () => {
    const { controller } = await readyController();
    controller.advance(16);
    controller.advance(16);
    const paused = controller.timeMs;
    expect(paused).toBe(32);
    expect(controller.timeMs).toBe(paused);
    controller.advance(16);
    expect(controller.timeMs).toBe(48);
    controller.destroy();
  });

  it('움직임 줄이기면 움직임을 숨기고 advance(16)이 시계를 32ms에 그대로 두며, 풀면 다시 보이고 멈춘 자리에서 이어 간다', async () => {
    const { holder, controller } = await readyController();
    controller.advance(16);
    controller.advance(16);
    controller.setReducedMotion(true);
    expect(controller.reducedMotion).toBe(true);
    expect(controller.running).toBe(false);
    expect(holder.children[0].visible).toBe(false);
    controller.advance(16);
    expect(controller.timeMs).toBe(32);
    controller.setReducedMotion(false);
    expect(holder.children[0].visible).toBe(true);
    controller.advance(16);
    expect(controller.timeMs).toBe(48);
    controller.destroy();
  });

  it('setEnabled(false)면 자리를 숨기고 시계를 멈추며(running false), 다시 켜면 보이고 이어 간다', async () => {
    const { holder, controller } = await readyController();
    controller.advance(16);
    controller.setEnabled(false);
    expect([controller.enabled, controller.running, holder.visible]).toEqual([false, false, false]);
    controller.advance(16);
    expect(controller.timeMs).toBe(16);
    controller.setEnabled(true);
    expect([controller.running, holder.visible]).toEqual([true, true]);
    controller.advance(16);
    expect(controller.timeMs).toBe(32);
    controller.destroy();
  });

  it('준비 전에 고른 A 큰 광원 끄기·움직임 줄이기는 움직임을 얹을 때 그대로 적용된다', async () => {
    const holder = new Container();
    const { lease, resolve } = controllableLease();
    const controller = new FrameMotionController({ holder, lease });
    controller.setLayerVisible('armor', false);
    controller.setReducedMotion(true);
    expect(controller.isLayerVisible('armor')).toBe(false);
    resolve();
    await flush();
    expect(holder.getChildByLabel('frame-motion-armor', true)!.visible).toBe(false);
    expect(holder.getChildByLabel('frame-motion-gauge', true)!.visible).toBe(true);
    expect(holder.children[0].visible).toBe(false);
    controller.destroy();
  });

  it('seek(30000)이면 시계가 30000ms이고 광원 띠 중심이 y 768에 오며, restart()면 0으로 돌아가 y −841', async () => {
    const { holder, controller } = await readyController();
    controller.seek(30_000);
    expect(controller.timeMs).toBe(30_000);
    expect(bandY(holder)).toBe(768);
    controller.restart();
    expect(controller.timeMs).toBe(0);
    expect(bandY(holder)).toBe(-841);
    controller.destroy();
  });

  it('upload를 주면 움직임을 얹기 전에 준비된 텍스처 9장으로 한 번 부른다', async () => {
    const holder = new Container();
    const { lease, resolve } = controllableLease();
    const upload = vi.fn((textures: FrameMotionTextures) => expect(Object.keys(textures)).toHaveLength(9));
    const controller = new FrameMotionController({ holder, lease, upload });
    resolve();
    await flush();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(controller.status).toBe('ready');
    controller.destroy();
  });

  it('자료 읽기가 실패하면 status error로 자리를 비워 두고(프레임만 보임) advance는 시계를 움직이지 않으며 경고를 한 번 남긴다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const holder = new Container();
    const { lease, reject } = controllableLease();
    const controller = new FrameMotionController({ holder, lease });
    reject(new Error('404'));
    await flush();
    expect(controller.status).toBe('error');
    expect(holder.children).toHaveLength(0);
    controller.advance(16);
    expect(controller.timeMs).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    controller.destroy();
  });

  it('destroy하면 움직임을 정리하고 임대를 한 번 놓으며, 두 번 불러도 다시 놓지 않는다', async () => {
    const { holder, lease, controller } = await readyController();
    const motionRoot = holder.children[0];
    controller.destroy();
    controller.destroy();
    expect(motionRoot.destroyed).toBe(true);
    expect(holder.children).toHaveLength(0);
    expect(lease.release).toHaveBeenCalledTimes(1);
    expect(controller.running).toBe(false);
  });

  it('준비 전에 destroy하면 나중에 자료가 준비되어도 움직임을 만들지 않는다', async () => {
    const holder = new Container();
    const { lease, resolve } = controllableLease();
    const create = vi.fn(createClassicFrameMotion);
    const controller = new FrameMotionController({ holder, lease, create });
    controller.destroy();
    resolve();
    await flush();
    expect(create).not.toHaveBeenCalled();
    expect(holder.children).toHaveLength(0);
    expect(lease.release).toHaveBeenCalledTimes(1);
  });
});
