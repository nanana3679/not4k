import { useEffect, useState } from 'react';

export type GameExperience = 'fullGame' | 'mobileSongList';
export type PointerKind = 'fine' | 'coarse' | 'none';

export const MOBILE_GAME_MEDIA_QUERY = '(max-width: 767px), (pointer: coarse)';

export function getGameExperience(criteria: {
  viewportWidth: number;
  pointer: PointerKind;
}): GameExperience {
  if (criteria.viewportWidth <= 767 || criteria.pointer === 'coarse') {
    return 'mobileSongList';
  }
  return 'fullGame';
}

export function canStartGameplay(experience: GameExperience): boolean {
  return experience === 'fullGame';
}

function readGameExperience(): GameExperience {
  if (typeof window === 'undefined') return 'fullGame';
  return window.matchMedia(MOBILE_GAME_MEDIA_QUERY).matches
    ? 'mobileSongList'
    : 'fullGame';
}

export function useGameExperience(): GameExperience {
  const [experience, setExperience] = useState(readGameExperience);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_GAME_MEDIA_QUERY);
    const update = () => setExperience(readGameExperience());
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return experience;
}
