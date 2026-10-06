/**
 * 렌더러를 다시 만들 때마다(레인 폭·렌더 높이·장면 변경) Classic 스킨을 새로 읽지 않도록 페이지가 하나를 빌려 준다.
 * 렌더러는 시작할 때 acquire, 정리할 때 release한다. 페이지가 닫히면(close) 빌린 렌더러가 모두 놓아준 뒤 한 번만 dispose한다.
 * 렌더러의 init은 스킨 텍스처를 읽는 중이므로, 렌더러가 놓기 전에 스킨을 먼저 버리지 않는다.
 */
export interface SharedSkin<T> {
  acquire(): Promise<T>;
  release(): void;
  close(): void;
}

export function createSharedSkin<T extends { dispose(): void }>(load: () => Promise<T>): SharedSkin<T> {
  let loading: Promise<T> | null = null;
  let users = 0;
  let closed = false;

  const disposeIfIdle = () => {
    if (!closed || users > 0 || !loading) return;
    const current = loading;
    loading = null;
    current.then((skin) => skin.dispose(), () => undefined);
  };

  return {
    acquire() {
      users += 1;
      if (!loading) {
        const attempt = load();
        loading = attempt;
        // 실패한 읽기는 기억하지 않아 다음 acquire가 다시 읽는다.
        attempt.catch(() => { if (loading === attempt) loading = null; });
      }
      return loading;
    },
    release() {
      users = Math.max(0, users - 1);
      disposeIfIdle();
    },
    close() {
      closed = true;
      disposeIfIdle();
    },
  };
}
