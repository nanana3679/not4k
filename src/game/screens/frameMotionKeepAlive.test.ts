import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FrameMotionAssetLease, FrameMotionResources } from '../renderer/classicFrameMotionAssets';
import { keepFrameMotionAssets, settleWithin } from './frameMotionKeepAlive';

function fakeLease(ready: Promise<FrameMotionResources> = new Promise(() => {})) {
  return { ready, release: vi.fn<() => void>() } satisfies FrameMotionAssetLease;
}

afterEach(() => {
  keepFrameMotionAssets(false);
  vi.useRealTimers();
});

describe('keepFrameMotionAssets — 설정이 켜진 동안 프레임 움직임 자료를 붙잡아 두기', () => {
  it('켜진 채 두 번(첫 플레이·재시도) 부르면 같은 임대 하나만 빌린다(acquire 1번)', () => {
    const lease = fakeLease();
    const acquire = vi.fn(() => lease);
    expect(keepFrameMotionAssets(true, acquire)).toBe(lease);
    expect(keepFrameMotionAssets(true, acquire)).toBe(lease);
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(lease.release).not.toHaveBeenCalled();
  });

  it('끄면(설정 끔·움직임 줄이기) 붙잡은 임대를 한 번 놓고 null을 돌려주며, 다시 켜면 새로 빌린다', () => {
    const first = fakeLease();
    const second = fakeLease();
    const acquire = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    keepFrameMotionAssets(true, acquire);
    expect(keepFrameMotionAssets(false, acquire)).toBeNull();
    expect(keepFrameMotionAssets(false, acquire)).toBeNull();
    expect(first.release).toHaveBeenCalledTimes(1);
    expect(keepFrameMotionAssets(true, acquire)).toBe(second);
    expect(acquire).toHaveBeenCalledTimes(2);
  });

  it('붙잡은 임대의 읽기가 실패하면 놓고 잊어, 다음 플레이에서 다시 빌린다(실패를 붙잡아 두지 않음)', async () => {
    const failed = fakeLease(Promise.reject(new Error('offline')));
    failed.ready.catch(() => undefined);
    const retried = fakeLease();
    const acquire = vi.fn().mockReturnValueOnce(failed).mockReturnValueOnce(retried);
    keepFrameMotionAssets(true, acquire);
    await Promise.resolve();
    await Promise.resolve();
    expect(failed.release).toHaveBeenCalledTimes(1);
    expect(keepFrameMotionAssets(true, acquire)).toBe(retried);
  });
});

describe('settleWithin — 곡 시작 전 짧게만 기다리기', () => {
  it('1200ms 안에 이행하면 그때 끝나고 true, 거절돼도 기다림만 끝내고 true를 돌려준다', async () => {
    await expect(settleWithin(Promise.resolve('ok'), 1200)).resolves.toBe(true);
    await expect(settleWithin(Promise.reject(new Error('x')), 1200)).resolves.toBe(true);
  });

  it('1200ms가 지나도록 이행하지 않으면 기다림을 끝내고 false, 기다릴 것이 없으면(undefined) 바로 true', async () => {
    vi.useFakeTimers();
    const waiting = settleWithin(new Promise(() => {}), 1200);
    await vi.advanceTimersByTimeAsync(1199);
    let done = false;
    void waiting.then(() => { done = true; });
    await Promise.resolve();
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(waiting).resolves.toBe(false);
    await expect(settleWithin(undefined, 1200)).resolves.toBe(true);
  });
});
