import { supabase } from '../../../supabase/client';
import { useGameStore } from '../../stores/gameStore';
import { consumeProfileReturn, parseProfileRedirect, readProfileReturnStartedAt } from './profileAuth';

type InitializeAuth = () => Promise<{ error: { message: string } | null }>;
type ProfileReturnInvocation = { signal?: AbortSignal; persisted?: boolean };

/** App 인스턴스마다 만든다. effect 재실행은 이미 소비한 복귀 의도를 다시 열지 않는다. */
export function createProfileReturnRestorer(
  initializeAuth: InitializeAuth = () => supabase.auth.initialize(),
) {
  let startedAt: number | null = null;
  let initialization: Promise<string | null> | null = null;
  // startedAt 마커의 복귀가 Profile에 표시할 오류. Profile을 열거나 마커가 바뀌면 비운다.
  let restoreResult: Promise<string | null> | null = null;
  return async (mobileListOnly: boolean, { signal, persisted = false }: ProfileReturnInvocation = {}) => {
    if (signal?.aborted) return;
    // bfcache는 새 콜백을 처리하지 않는다. 새 Login 마커면 이전 복귀 결과 대신 현재 URL만 읽고,
    // 아직 소비하지 않은 같은 마커면(첫 실행 프리셋 대기 등) 그 복귀 결과를 그대로 쓴다.
    if (persisted && readProfileReturnStartedAt() !== startedAt) restoreResult = null;
    if (!restoreResult) {
      startedAt = readProfileReturnStartedAt();
      if (startedAt !== null) {
        const { outcome } = parseProfileRedirect(window.location.href);
        // SDK 초기화 결과는 페이지 로드 때 URL 콜백의 결과라 그 로드의 첫 시도에만 표시한다. bfcache 복귀가 처음 만든 초기화도 옛 결과다.
        const reportInitializationError = initialization === null && !persisted;
        initialization ??= (async () => {
          // auth-js 2.95.3의 initialize()는 저장된 결과를 반환한다. getSession()은 이 오류를 전달하지 않는다.
          try {
            const { error } = await initializeAuth();
            return error?.message ?? null;
          } catch (error) {
            return error instanceof Error ? error.message : 'Unable to log in. Please try again.';
          }
        })();
        restoreResult = initialization.then(initializationError => outcome?.status === 'cancel' ? null
          : outcome?.status === 'failure' ? outcome.message : reportInitializationError ? initializationError : null);
      }
    }
    if (!restoreResult) return;
    const attempt = restoreResult;
    const error = await attempt;
    if (signal?.aborted) return;
    // 기다리는 동안 bfcache 복귀가 새 마커의 결과로 바꿨다면 그 호출이 Profile을 연다.
    if (restoreResult !== attempt) return;
    if (readProfileReturnStartedAt() !== startedAt) {
      restoreResult = null;
      return;
    }
    if (useGameStore.getState().settings.isFirstLaunch && !mobileListOnly) {
      useGameStore.getState().setScreen('presetSetup');
      return;
    }
    restoreResult = null;
    if (!consumeProfileReturn()) return;
    // 프리셋 설정 중 새로고침해도 오류를 읽도록 실제 Profile 복귀 때 URL을 정리한다.
    const { cleanUrl } = parseProfileRedirect(window.location.href);
    if (cleanUrl !== window.location.href) {
      window.history.replaceState(window.history.state, '', cleanUrl);
    }
    useGameStore.getState().setScreen('songSelect');
    useGameStore.setState({
      settingsOpen: true, settingsInitialSection: 'profile', profileAuthError: error,
    });
  };
}

export function bindProfileReturnRestoration(
  restore: ReturnType<typeof createProfileReturnRestorer>,
  mobileListOnly: boolean,
) {
  const invocations = new Set<AbortController>();
  const run = (persisted = false) => {
    const invocation = new AbortController();
    invocations.add(invocation);
    void restore(mobileListOnly, { signal: invocation.signal, persisted })
      .finally(() => invocations.delete(invocation));
  };
  run();
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) run(true);
  };
  window.addEventListener('pageshow', onPageShow);
  return () => {
    window.removeEventListener('pageshow', onPageShow);
    for (const invocation of invocations) invocation.abort();
  };
}
