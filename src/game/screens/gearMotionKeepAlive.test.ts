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

describe('keepGearMotionAssets — 설정이 켜진 동안 기어 움직임 자료를 붙잡아 두기', () => {
  it('켜진 채 두 번(첫 플레이·재시도) 부르면 같은 임대 하나만 빌린다(acquire 1번)', () => {
    const lease = fakeLease();
    const acquire = vi.fn(() => lease);
    expect(keepGearMotionAssets(true, acquire)).toBe(lease);
    expect(keepGearMotionAssets(true, acquire)).toBe(lease);
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(lease.release).not.toHaveBeenCalled();
  });

  it('끄면(설정 끔·움직임 줄이기) 붙잡은 임대를 한 번 놓고 null을 돌려주며, 다시 켜면 새로 빌린다', () => {
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

  it('붙잡은 임대의 읽기가 실패하면 놓고 잊어, 다음 플레이에서 다시 빌린다(실패를 붙잡아 두지 않음)', async () => {
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

describe('플레이 화면의 움직임 자료 대기(필수 자료)', () => {
  it('곡 시작 전 대기에 시간 제한이 없고(settleWithin·_WAIT_MS 없음) 재생 중 얹기 미루기(setAttachDeferred)도 없다', () => {
    expect(keepAliveSource).not.toContain('settleWithin');
    expect(playScreenSource).not.toContain('settleWithin');
    expect(playScreenSource).not.toMatch(/GEAR_MOTION_\w*WAIT_MS/);
    expect(playScreenSource).not.toContain('setAttachDeferred');
  });

  it('플레이 화면은 스킨 읽기와 움직임 자료를 함께 기다린다(Promise.all에 loadSkin과 keptMotion.ready)', () => {
    expect(playScreenSource).toMatch(/Promise\.all\(\[skinManager\.loadSkin\(skin\), keptMotion\?\.ready\]\)/);
  });
});
