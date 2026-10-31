import { useGameStore } from '../../stores/gameStore';
import { signInFromProfile, signOutFromProfile } from './profileAuth';

interface ProfileAuthAction {
  signedIn: boolean;
  signIn: () => Promise<void>;
  signOut: Parameters<typeof signOutFromProfile>[0];
  isActive: () => boolean;
  setPending: (pending: boolean) => void;
}

export async function handleProfileAuth({ signedIn, signIn, signOut, isActive, setPending }: ProfileAuthAction) {
  setPending(true);
  useGameStore.setState({ profileAuthError: null });
  const message = signedIn
    ? await signOutFromProfile(signOut, () => {
      if (isActive() && useGameStore.getState().settingsOpen) {
        useGameStore.getState().setScreen('title');
      }
    })
    : await signInFromProfile(signIn);
  if (!isActive() || !useGameStore.getState().settingsOpen) return;
  useGameStore.setState({ profileAuthError: message });
  setPending(false);
}
