import { useEffect, useState } from 'react';
import { useGameStore } from './stores';
import { useGameExperience } from './hooks/useGameExperience';
import { shouldForceMobileSongList } from './mobileExperienceGate';
import {
  TitleScreen,
  PresetSetupScreen,
  SongSelectScreen,
  LoadingScreen,
  PlayScreen,
  NormalPlayScreen,
  ExplicitPlayScreen,
  ResultScreen,
} from './screens';
import { keepGearMotionAssets } from './screens/gearMotionKeepAlive';
import { createProfileReturnRestorer } from './screens/settings/profileReturn';

export default function GameApp() {
  const screen = useGameStore((state) => state.screen);
  const editorReturnUrl = useGameStore((state) => state.editorReturnUrl);
  const experience = useGameExperience();
  const gearMotion = useGameStore((state) => state.settings.gearMotion);
  const isFirstLaunch = useGameStore((state) => state.settings.isFirstLaunch);
  const mobileListOnly = shouldForceMobileSongList(experience, editorReturnUrl);
  // initializer는 저장소를 읽지 않는다. 실제 소비는 effect에서 한 번만 수행한다(StrictMode 포함).
  const [restoreProfileReturn] = useState(createProfileReturnRestorer);

  useEffect(() => {
    restoreProfileReturn(mobileListOnly);
  }, [restoreProfileReturn, mobileListOnly, isFirstLaunch]);

  // 설정 `Gear Motion`을 끄면 플레이 화면이 keep-alive로 둔 `gearMotion` 에셋 lease를 바로 release한다(다시 켜면 다음 플레이가 acquire한다).
  useEffect(() => {
    if (!gearMotion) keepGearMotionAssets(false);
  }, [gearMotion]);

  // 모바일 경험에서는 곡 목록만 노출하되, 에디터 테스트 플레이는 예외로 둔다.
  if (screen !== 'explicitPlay' && mobileListOnly) {
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
      return editorReturnUrl ? <PlayScreen /> : <NormalPlayScreen />;
    case 'explicitPlay':
      return <ExplicitPlayScreen />;
    case 'result':
      return <ResultScreen />;
    default:
      return <TitleScreen />;
  }
}
