import { useGameStore } from '../../stores/gameStore';
import { consumeProfileReturn, parseProfileRedirect } from './profileAuth';

/** App 인스턴스마다 만든다. effect 재실행은 이미 소비한 복귀 의도를 다시 열지 않는다. */
export function createProfileReturnRestorer() {
  let initialized = false;
  let pending: { error: string | null } | null = null;
  return (mobileListOnly: boolean) => {
    if (!initialized) {
      initialized = true;
      if (consumeProfileReturn()) {
        // auth-js 2.95.3: GoTrueClient._initialize는 URL 오류를 반환할 뿐 인증 이벤트로 전달하지 않는다.
        // _getSessionFromURL의 오류 경로는 hash도 남기므로 직접 읽고 정리한다. 성공 토큰은 SDK가 처리한다.
        const { outcome, cleanUrl } = parseProfileRedirect(window.location.href);
        pending = { error: outcome?.status === 'failure' ? outcome.message : null };
        if (cleanUrl !== window.location.href) {
          window.history.replaceState(window.history.state, '', cleanUrl);
        }
      }
    }
    if (!pending) return;
    if (useGameStore.getState().settings.isFirstLaunch && !mobileListOnly) {
      useGameStore.getState().setScreen('presetSetup');
      return;
    }
    useGameStore.getState().setScreen('songSelect');
    useGameStore.setState({
      settingsOpen: true, settingsInitialSection: 'profile', profileAuthError: pending.error,
    });
    pending = null;
  };
}
