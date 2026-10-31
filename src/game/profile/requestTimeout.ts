/**
 * `ms`가 지나면 TimeoutError로 끊기는 신호. AbortSignal.timeout은 Safari 16·Chrome 103·Firefox 100부터 있고
 * 지원 최소 브라우저는 아직 정하지 않았으므로(PRD §12) 없으면 AbortController와 setTimeout으로 같은 신호를 만든다.
 */
export function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException('signal timed out', 'TimeoutError')), ms);
  return controller.signal;
}

/**
 * 요청에 `ms` 시간 제한 신호를 넘기고, 신호가 끊기면 요청이 어디서 멈췄든 신호의 reason으로 reject한다.
 * supabase-js는 fetch 전에 access token을 기다리므로 토큰 갱신이 멈추면 fetch에 넘긴 신호만으로는 끝나지 않는다.
 * fetch까지 간 요청은 같은 신호로 끊긴다.
 */
export function withRequestTimeout<T>(ms: number, send: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const signal = timeoutSignal(ms);
  return new Promise<T>((resolve, reject) => {
    const rejectOnTimeout = () => reject(signal.reason);
    signal.addEventListener('abort', rejectOnTimeout, { once: true });
    Promise.resolve(send(signal)).then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', rejectOnTimeout));
  });
}
