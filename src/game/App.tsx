import { useEffect } from 'react';
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
import { keepFrameMotionAssets } from './screens/frameMotionKeepAlive';

export default function GameApp() {
  const screen = useGameStore((state) => state.screen);
  const editorReturnUrl = useGameStore((state) => state.editorReturnUrl);
  const experience = useGameExperience();
  const frameMotion = useGameStore((state) => state.settings.frameMotion);

  // 설정에서 프레임 움직임을 끄면 플레이 화면이 붙잡아 둔 움직임 자료를 바로 놓는다(다시 켜면 다음 플레이가 잡는다).
  useEffect(() => {
    if (!frameMotion) keepFrameMotionAssets(false);
  }, [frameMotion]);

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
