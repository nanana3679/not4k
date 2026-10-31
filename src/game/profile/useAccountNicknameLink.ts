import { useEffect } from 'react';
import { DEV_ADMIN } from '../../shared/hooks/useAuth';
import type { AuthUser } from './accountNickname';
import { accountNicknameService } from './accountNicknameService';

/**
 * GameApp의 인증 상태를 계정 닉네임에 알린다. 실제 세션은 Profile을 열지 않아도 초기 세션·로그인 직후 연동하고,
 * 세션 확인이 끝났는데 사용자가 없으면 계정 닉네임을 비운다.
 * 세션이 없는 DEV_ADMIN은 Profile을 열 때 연동한다(`ProfileSection`).
 * 같은 id의 새 user 객체·StrictMode effect 재실행은 `setUser`가 같은 계정으로 보고 합친다.
 */
export function useAccountNicknameLink(user: AuthUser | null, authLoading: boolean) {
  useEffect(() => {
    if (!DEV_ADMIN && (user || !authLoading)) void accountNicknameService.setUser(user);
  }, [user, authLoading]);
}
