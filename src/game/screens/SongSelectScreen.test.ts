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

  it('설정/추가/삭제 모달·튜토리얼 팝업이 열려 있으면 곡 선택 키 네비를 뒤에서 처리하지 않도록 배선', () => {
    // 설정을 모달로 띄우면 곡 선택이 언마운트되지 않으므로, 뒤의 키 네비를 명시적으로 차단해야 한다.
    expect(songSelectSource).toContain('const blockingModalOpen = showAddSong || showTutorialHelp || settingsOpen || deleteSongTarget !== null;');
    expect(songSelectSource).toContain('    blockingModalOpen,\n    newChartTarget,\n');
  });

  it('설정·튜토리얼·곡 추가·곡 삭제·새 차트 모달 중 하나라도 열려 있으면 뒤의 헤더·곡 목록(PC·모바일 각 2곳)을 inert로 만듦', () => {
    // focus trap이 없는 모달 뒤의 버튼에 Tab으로 닿으면 두 번째 모달을 겹쳐 열 수 있고,
    // 그러면 Escape 한 번이 가려진 첫 모달을 닫는다. 모달은 renderOverlays()로 inert 밖에 렌더링한다.
    expect(songSelectSource).toContain('const backgroundInert = blockingModalOpen || newChartTarget !== null;');
    expect(songSelectSource.split('inert={backgroundInert}').length - 1).toBe(4);
    expect(songSelectSource.split('{renderOverlays()}').length - 1).toBe(2);
  });
});
