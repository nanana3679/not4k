import { useGameStore } from './stores';
import { useGameExperience } from './hooks/useGameExperience';
import {
  TitleScreen,
  PresetSetupScreen,
  SongSelectScreen,
  LoadingScreen,
  PlayScreen,
  ResultScreen,
  SettingsScreen,
  CalibrationScreen,
} from './screens';

export default function GameApp() {
  const screen = useGameStore((state) => state.screen);
  const experience = useGameExperience();

  if (experience === 'mobileSongList') {
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
    case 'settings':
      return <SettingsScreen />;
    case 'calibration':
      return <CalibrationScreen />;
    default:
      return <TitleScreen />;
  }
}
