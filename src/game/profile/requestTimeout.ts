/**
 * `ms`가 지나면 TimeoutError로 끊기는 신호와 그 타이머를 푸는 함수. AbortSignal.timeout은 Safari 16·Chrome 103·Firefox 100부터 있고
 * 지원 최소 브라우저는 아직 정하지 않았으므로(PRD §12) 없으면 AbortController와 setTimeout으로 같은 신호를 만든다.
 */
function createTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  if (typeof AbortSignal.timeout === 'function') return { signal: AbortSignal.timeout(ms), cancel: () => {} };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('signal timed out', 'TimeoutError')), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

export function timeoutSignal(ms: number): AbortSignal {
  return createTimeout(ms).signal;
}

/**
 * 요청에 `ms` 시간 제한 신호를 넘기고, 신호가 끊기면 요청이 어디서 멈췄든 신호의 reason으로 reject한다.
 * supabase-js는 fetch 전에 access token을 기다리므로 토큰 갱신이 멈추면 fetch에 넘긴 신호만으로는 끝나지 않는다.
 * fetch까지 간 요청은 같은 신호로 끊긴다. 요청이 먼저 끝나거나 send가 바로 던지면 대체 타이머와 리스너를 푼다.
 */
export function withRequestTimeout<T>(ms: number, send: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const { signal, cancel } = createTimeout(ms);
  return new Promise<T>((resolve, reject) => {
    const rejectOnTimeout = () => reject(signal.reason);
    const cleanUp = () => {
      cancel();
      signal.removeEventListener('abort', rejectOnTimeout);
    };
    signal.addEventListener('abort', rejectOnTimeout, { once: true });
    let request: PromiseLike<T>;
    try {
      request = send(signal);
    } catch (error) {
      cleanUp();
      reject(error);
      return;
    }
    Promise.resolve(request).then(resolve, reject).finally(cleanUp);
  });
}
