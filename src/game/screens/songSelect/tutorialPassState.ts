export interface TutorialGuestHandoff {
  userId: string;
  requestId: string;
  tutorialIds: readonly string[];
}

export interface TutorialPassState {
  guestIds: readonly string[];
  accountPassedIdsByUser: Readonly<Record<string, readonly string[]>>;
  pendingHandoff: TutorialGuestHandoff | null;
}

const EMPTY_IDS: readonly string[] = [];

export function prepareTutorialGuestHandoff(state: TutorialPassState, userId: string, requestId: string): TutorialPassState {
  if (state.pendingHandoff || !state.guestIds.length) return state;
  return { ...state, guestIds: [], pendingHandoff: { userId, requestId, tutorialIds: state.guestIds } };
}

export function getVisibleTutorialPassedIds(state: TutorialPassState, userId: string | null): readonly string[] {
  return userId === null ? state.guestIds : state.accountPassedIdsByUser[userId] ?? EMPTY_IDS;
}

export function completeTutorialGuestHandoff(
  state: TutorialPassState, handoff: TutorialGuestHandoff, consumed: boolean,
): TutorialPassState {
  if (!consumed) {
    return { ...state, guestIds: [...new Set([...state.guestIds, ...handoff.tutorialIds])], pendingHandoff: null };
  }
  return {
    guestIds: state.guestIds,
    accountPassedIdsByUser: {
      ...state.accountPassedIdsByUser,
      [handoff.userId]: [...new Set([
        ...getVisibleTutorialPassedIds(state, handoff.userId), ...handoff.tutorialIds,
      ])],
    },
    pendingHandoff: null,
  };
}
