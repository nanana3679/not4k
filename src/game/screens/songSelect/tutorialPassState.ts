import { isValidTutorialId, MAX_TUTORIAL_HANDOFF_IDS } from '../../../supabase/tutorialPassValidation';

export interface TutorialGuestHandoff {
  userId: string;
  requestId: string;
  tutorialIds: readonly string[];
}

export interface TutorialPassState {
  guestIds: readonly string[];
  accountPassedIdsByUser: Readonly<Record<string, readonly string[]>>;
  pendingHandoffs: readonly TutorialGuestHandoff[];
  unresolvedPasses: readonly { completionId: string; tutorialId: string }[];
}

const EMPTY_IDS: readonly string[] = [];

export function prepareTutorialGuestHandoff(state: TutorialPassState, userId: string, requestId: string): TutorialPassState {
  if (state.pendingHandoffs.some(handoff => handoff.userId === userId) || !state.guestIds.length) return state;
  // 현재 카탈로그는 25개다. 구형·외부 기록이 많아도 RPC 한도 밖의 ID는 게스트로 남긴다.
  const tutorialIds = state.guestIds.filter(isValidTutorialId).slice(0, MAX_TUTORIAL_HANDOFF_IDS);
  if (!tutorialIds.length) return state;
  return {
    ...state,
    guestIds: state.guestIds.filter(id => !tutorialIds.includes(id)),
    pendingHandoffs: [...state.pendingHandoffs, { userId, requestId, tutorialIds }],
  };
}

export function getVisibleTutorialPassedIds(state: TutorialPassState, userId: string | null): readonly string[] {
  return userId === null ? state.guestIds : state.accountPassedIdsByUser[userId] ?? EMPTY_IDS;
}

export function completeTutorialGuestHandoff(
  state: TutorialPassState, handoff: TutorialGuestHandoff, consumed: boolean,
): TutorialPassState {
  const pendingHandoffs = state.pendingHandoffs.filter(pending =>
    pending.userId !== handoff.userId || pending.requestId !== handoff.requestId);
  if (!consumed) {
    return { ...state, guestIds: [...new Set([...state.guestIds, ...handoff.tutorialIds])], pendingHandoffs };
  }
  return {
    ...state,
    accountPassedIdsByUser: {
      ...state.accountPassedIdsByUser,
      [handoff.userId]: [...new Set([
        ...getVisibleTutorialPassedIds(state, handoff.userId), ...handoff.tutorialIds,
      ])],
    },
    pendingHandoffs,
  };
}
