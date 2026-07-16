import { describe, expect, it } from 'vitest';
import songSelectSource from './SongSelectScreen.tsx?raw';

describe('SongSelectScreen tutorial help', () => {
  it('? 버튼 클릭 시 튜토리얼 도움말 팝업을 열도록 상태를 연결', () => {
    expect(songSelectSource).toContain('TutorialHelpModal');
    expect(songSelectSource).toContain('showTutorialHelp');
    expect(songSelectSource).toContain('setShowTutorialHelp(true)');
    expect(songSelectSource).toContain('setShowTutorialHelp(false)');
  });

  it('? 버튼은 보조 액션으로 접근 가능한 dialog 트리거 라벨을 가짐', () => {
    expect(songSelectSource).toContain('aria-label="Open tutorial help"');
    expect(songSelectSource).toContain('aria-haspopup="dialog"');
    expect(songSelectSource).toContain('aria-expanded={showTutorialHelp}');
  });

  it('튜토리얼 팝업이 열려 있으면 곡 선택 키보드 내비게이션을 뒤에서 처리하지 않음', () => {
    expect(songSelectSource).toContain('blockingModalOpen: showAddSong || showTutorialHelp || settingsOpen || deleteSongTarget !== null');
  });

  it('설정 모달이 열려 있으면 곡 선택 키보드 내비게이션을 차단하도록 배선', () => {
    // 설정을 모달로 띄우면 곡 선택은 언마운트되지 않으므로, 뒤의 키 네비를 명시적으로 차단해야 한다.
    expect(songSelectSource).toContain('blockingModalOpen:');
    expect(songSelectSource).toContain('settingsOpen');
  });
});
