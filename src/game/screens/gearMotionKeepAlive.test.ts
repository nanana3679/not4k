import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GearMotionAssetLease, GearMotionResources } from '../renderer/gearMotionAssets';
import { keepGearMotionAssets } from './gearMotionKeepAlive';
import keepAliveSource from './gearMotionKeepAlive.ts?raw';
import playScreenSource from './PlayScreen.tsx?raw';

function fakeLease(ready: Promise<GearMotionResources> = new Promise(() => {})) {
  return { ready, release: vi.fn<() => void>() } satisfies GearMotionAssetLease;
}

afterEach(() => {
  keepGearMotionAssets(false);
});

describe('keepGearMotionAssets — 설정이 켜진 동안 gearMotion 에셋 lease를 keep-alive로 두기', () => {
  it('켜진 채 두 번(첫 플레이·재시도) 부르면 lease를 한 번만 acquire하고 같은 lease를 돌려준다', () => {
    const lease = fakeLease();
    const acquire = vi.fn(() => lease);
    expect(keepGearMotionAssets(true, acquire)).toBe(lease);
    expect(keepGearMotionAssets(true, acquire)).toBe(lease);
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(lease.release).not.toHaveBeenCalled();
  });

  it('끄면(설정 `Gear Motion` 끔) keep-alive한 lease를 한 번 release하고 null을 돌려주며, 다시 켜면 새로 acquire한다', () => {
    const first = fakeLease();
    const second = fakeLease();
    const acquire = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    keepGearMotionAssets(true, acquire);
    expect(keepGearMotionAssets(false, acquire)).toBeNull();
    expect(keepGearMotionAssets(false, acquire)).toBeNull();
    expect(first.release).toHaveBeenCalledTimes(1);
    expect(keepGearMotionAssets(true, acquire)).toBe(second);
    expect(acquire).toHaveBeenCalledTimes(2);
  });

  it('keep-alive한 lease의 읽기가 실패하면 그 lease를 release하고 잊어, 다음 플레이에서 다시 acquire한다(실패한 lease는 keep-alive하지 않음)', async () => {
    const failed = fakeLease(Promise.reject(new Error('offline')));
    failed.ready.catch(() => undefined);
    const retried = fakeLease();
    const acquire = vi.fn().mockReturnValueOnce(failed).mockReturnValueOnce(retried);
    keepGearMotionAssets(true, acquire);
    await Promise.resolve();
    await Promise.resolve();
    expect(failed.release).toHaveBeenCalledTimes(1);
    expect(keepGearMotionAssets(true, acquire)).toBe(retried);
  });
});

describe('플레이 화면의 gearMotion 에셋 대기(필수 에셋)', () => {
  it('곡 시작 전 대기에 시간 제한이 없고(settleWithin·_WAIT_MS 없음) 재생 중 gearMotion 추가 미루기(setAttachDeferred)도 없다', () => {
    expect(keepAliveSource).not.toContain('settleWithin');
    expect(playScreenSource).not.toContain('settleWithin');
    expect(playScreenSource).not.toMatch(/GEAR_MOTION_\w*WAIT_MS/);
    expect(playScreenSource).not.toContain('setAttachDeferred');
  });

  it('플레이 화면은 스킨·gearMotion·L₀ 준비 3개를 함께 기다린 뒤 재생한다', () => {
    expect(playScreenSource).toMatch(/Promise\.all\(\[skinManager\.loadSkin\(skin\), keptMotion\?\.ready, audioEngine\.prepareForPlayback\(\)\]\)/);
  });

  it('플레이 화면의 keep-alive 조건은 설정 `Gear Motion`뿐이다(keepGearMotionAssets(settings.gearMotion), prefers-reduced-motion 검사 없음, RFD 0030)', () => {
    expect(playScreenSource).toContain('keepGearMotionAssets(settings.gearMotion);');
    expect(playScreenSource).not.toMatch(/prefersReducedMotion|matchMedia/);
  });
});
