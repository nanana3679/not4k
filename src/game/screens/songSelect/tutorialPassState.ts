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
  return { ...state, guestIds: [], pendingHandoffs: [...state.pendingHandoffs, { userId, requestId, tutorialIds: state.guestIds }] };
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
