import { afterEach, expect, it, vi } from 'vitest';
import { timeoutSignal, withRequestTimeout } from './requestTimeout';

const nativeTimeout = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout')!;

/** Safari 16·Chrome 103·Firefox 100 이전처럼 AbortSignal.timeout이 없는 브라우저를 흉내 낸다. */
function removeNativeTimeout() {
  Reflect.deleteProperty(AbortSignal, 'timeout');
}

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(AbortSignal, 'timeout', nativeTimeout);
  vi.useRealTimers();
});

it('AbortSignal.timeout이 있으면 timeoutSignal(15000)은 AbortSignal.timeout(15000)이 만든 신호를 그대로 돌려준다', () => {
  const timeout = vi.spyOn(AbortSignal, 'timeout');
  const signal = timeoutSignal(15000);
  expect(timeout).toHaveBeenCalledExactlyOnceWith(15000);
  expect(signal).toBe(timeout.mock.results[0].value);
});

it('AbortSignal.timeout이 없으면 timeoutSignal(15000)은 14999ms까지 열려 있다가 15000ms에 TimeoutError로 끊긴다', () => {
  removeNativeTimeout();
  vi.useFakeTimers();
  const signal = timeoutSignal(15000);
  vi.advanceTimersByTime(14_999);
  expect(signal.aborted).toBe(false);
  vi.advanceTimersByTime(1);
  expect(signal.aborted).toBe(true);
  expect(signal.reason).toMatchObject({ name: 'TimeoutError' });
});

it('15000ms 안에 응답한 요청은 withRequestTimeout이 그 응답으로 끝나고 요청은 시간 제한 신호를 받는다', async () => {
  const timeout = vi.spyOn(AbortSignal, 'timeout');
  const send = vi.fn(async (_signal: AbortSignal) => 'RoutedPilot');
  await expect(withRequestTimeout(15000, send)).resolves.toBe('RoutedPilot');
  expect(send).toHaveBeenCalledExactlyOnceWith(timeout.mock.results[0].value);
});

it('15000ms 안에 실패한 요청은 withRequestTimeout이 그 오류로 reject한다', async () => {
  const failure = new Error('HTTP 500');
  await expect(withRequestTimeout(15000, async () => { throw failure; })).rejects.toBe(failure);
});

it('AbortSignal.timeout이 없어도 끝나지 않는 요청은 14999ms까지 기다리다 15000ms에 TimeoutError로 reject하고 요청에 넘긴 신호도 끊긴다', async () => {
  removeNativeTimeout();
  vi.useFakeTimers();
  const send = vi.fn((_signal: AbortSignal) => new Promise<never>(() => {}));
  let outcome: unknown;
  withRequestTimeout(15000, send).catch((error: unknown) => { outcome = error; });
  await vi.advanceTimersByTimeAsync(14_999);
  expect(outcome).toBeUndefined();
  await vi.advanceTimersByTimeAsync(1);
  expect(outcome).toMatchObject({ name: 'TimeoutError' });
  expect(send.mock.calls[0][0].aborted).toBe(true);
});
