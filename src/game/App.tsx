import { useGameStore } from './stores';
import { useGameExperience } from './hooks/useGameExperience';
import { shouldForceMobileSongList } from './mobileExperienceGate';
import {
  TitleScreen,
  PresetSetupScreen,
  SongSelectScreen,
  LoadingScreen,
  PlayScreen,
  ResultScreen,
} from './screens';

export default function GameApp() {
  const screen = useGameStore((state) => state.screen);
  const editorReturnUrl = useGameStore((state) => state.editorReturnUrl);
  const experience = useGameExperience();

  // 모바일 경험에서는 곡 목록만 노출하되, 에디터 테스트 플레이는 예외로 둔다.
  if (shouldForceMobileSongList(experience, editorReturnUrl)) {
    return <SongSelectScreen mobileListOnly />;
  }

  switch (screen) {
    case 'title':
      return <TitleScreen />;
    case 'presetSetup':
      return <PresetSetupScreen />;
    case 'songSelect':
      return <SongSelectScreen />;
    case 'loading':
      return <LoadingScreen />;
    case 'play':
      return <PlayScreen />;
    case 'result':
      return <ResultScreen />;
    default:
      return <TitleScreen />;
  }
}
