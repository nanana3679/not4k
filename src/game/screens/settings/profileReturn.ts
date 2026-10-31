import { supabase } from '../../../supabase/client';
import { useGameStore } from '../../stores/gameStore';
import { consumeProfileReturn, parseProfileRedirect, readProfileReturnStartedAt } from './profileAuth';

type InitializeAuth = () => Promise<{ error: { message: string } | null }>;

/** App 인스턴스마다 만든다. effect 재실행은 이미 소비한 복귀 의도를 다시 열지 않는다. */
export function createProfileReturnRestorer(
  initializeAuth: InitializeAuth = () => supabase.auth.initialize(),
) {
  let startedAt: number | null = null;
  let pending: Promise<string | null> | null = null;
  return async (mobileListOnly: boolean) => {
    if (!pending) {
      startedAt = readProfileReturnStartedAt();
      if (startedAt !== null) {
        const { outcome } = parseProfileRedirect(window.location.href);
        pending = (async () => {
          // auth-js 2.95.3의 initialize()는 저장된 결과를 반환한다. getSession()은 이 오류를 전달하지 않는다.
          let message: string | null;
          try {
            const { error } = await initializeAuth();
            message = error?.message ?? null;
          } catch (error) {
            message = error instanceof Error ? error.message : 'Unable to log in. Please try again.';
          }
          return outcome?.status === 'cancel' ? null
            : outcome?.status === 'failure' ? outcome.message : message;
        })();
      }
    }
    if (!pending) return;
    const attempt = pending;
    const error = await attempt;
    if (pending !== attempt) return;
    if (readProfileReturnStartedAt() !== startedAt) {
      pending = null;
      return;
    }
    if (useGameStore.getState().settings.isFirstLaunch && !mobileListOnly) {
      useGameStore.getState().setScreen('presetSetup');
      return;
    }
    pending = null;
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
  void restore(mobileListOnly);
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) void restore(mobileListOnly);
  };
  window.addEventListener('pageshow', onPageShow);
  return () => window.removeEventListener('pageshow', onPageShow);
}
