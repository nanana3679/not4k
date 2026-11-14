import { beforeEach, describe, expect, it, vi } from 'vitest';
import { beat } from '../shared';
import { loadEditorChartAsset } from './chartAssetLoad';
import { openEditorChart } from './openEditorChart';
import { toChartSaveJson } from './savedChart';
import { useEditorStore } from './stores/editorStore';
import {
  confirmChartSwitch,
  confirmCloseSongInfo,
  confirmLeave,
  hasUnsavedEditorChanges,
  hasUnsavedSongInfo,
  type UnsavedChangesFlow,
} from './unsavedChangesFlow';

/**
 * 곡 정보·차트의 미저장 여부와 사용자의 선택을 정해 둔 흐름. save·discard는 정한 대로 미저장 여부를 바꾼다.
 * draft는 포커스를 가진 드로어 입력칸에 아직 적용하지 않은 값이다. commitDrafts가 적용하면 곡 정보가 미저장이 된다.
 */
function flow(options: {
  song: boolean;
  chart: boolean;
  songInfoAnswer?: 'save' | 'discard' | 'cancel';
  leaveAnswer?: 'save' | 'discard' | 'cancel';
  /** Save가 끝난 뒤 남는 미저장. 기본은 둘 다 저장 성공이다. */
  afterSave?: { song: boolean; chart: boolean };
  discardAllowed?: boolean;
  /** 흐름을 시작할 때 다른 저장(Save·Save As)이 진행 중인가. */
  savingAtStart?: boolean;
  /** 확인 창에 답하는 사이 다른 저장이 시작되는가. */
  savingAfterAnswer?: boolean;
  /** 흐름을 시작할 때 입력칸에 적용하지 않은 값이 있는가. */
  draftAtStart?: boolean;
  /** 흐름의 Save가 진행되는 동안 입력칸에 새 값을 치는가. */
  draftDuringSave?: boolean;
}) {
  const dirty = { song: options.song, chart: options.chart };
  const state = { saving: options.savingAtStart ?? false, draft: options.draftAtStart ?? false };
  const answer = <T,>(value: T) => {
    if (options.savingAfterAnswer) state.saving = true;
    return value;
  };
  const deps: UnsavedChangesFlow = {
    saving: () => state.saving,
    notifySaving: vi.fn(),
    commitDrafts: vi.fn(() => {
      if (state.draft) dirty.song = true;
      state.draft = false;
    }),
    songInfoDirty: () => dirty.song,
    anyDirty: () => dirty.song || dirty.chart,
    askSongInfo: vi.fn(async () => answer(options.songInfoAnswer ?? 'cancel')),
    askLeave: vi.fn(async () => answer(options.leaveAnswer ?? 'cancel')),
    save: vi.fn(async () => {
      Object.assign(dirty, options.afterSave ?? { song: false, chart: false });
      if (options.draftDuringSave) state.draft = true;
    }),
    discardSongInfo: vi.fn(() => {
      if (options.discardAllowed === false) return false;
      dirty.song = false;
      return true;
    }),
  };
  return deps;
}

describe('곡 정보 드로어 닫기(confirmCloseSongInfo)', () => {
  it('미저장 곡 정보가 없으면 묻지 않고 바로 닫는다', async () => {
    const deps = flow({ song: false, chart: true });

    await expect(confirmCloseSongInfo(deps)).resolves.toBe(true);
    expect(deps.askSongInfo).not.toHaveBeenCalled();
  });

  it('미저장 곡 정보가 있고 취소하면 저장·변경 취소 없이 드로어를 연 채 둔다', async () => {
    const deps = flow({ song: true, chart: false, songInfoAnswer: 'cancel' });

    await expect(confirmCloseSongInfo(deps)).resolves.toBe(false);
    expect(deps.askSongInfo).toHaveBeenCalledExactlyOnceWith('close');
    expect(deps.save).not.toHaveBeenCalled();
    expect(deps.discardSongInfo).not.toHaveBeenCalled();
  });

  it('저장을 고르고 Save가 곡을 저장하면 닫는다', async () => {
    const deps = flow({ song: true, chart: true, songInfoAnswer: 'save' });

    await expect(confirmCloseSongInfo(deps)).resolves.toBe(true);
    expect(deps.save).toHaveBeenCalledOnce();
  });

  it('저장을 골랐지만 곡 저장이 실패해 곡 정보가 남으면 드로어와 편집을 유지한다', async () => {
    const deps = flow({ song: true, chart: false, songInfoAnswer: 'save', afterSave: { song: true, chart: false } });

    await expect(confirmCloseSongInfo(deps)).resolves.toBe(false);
  });

  it('곡은 저장되고 차트 저장만 실패해도 미저장 곡 정보가 없으므로 닫는다', async () => {
    const deps = flow({ song: true, chart: true, songInfoAnswer: 'save', afterSave: { song: false, chart: true } });

    await expect(confirmCloseSongInfo(deps)).resolves.toBe(true);
  });

  it('변경 취소를 고르면 곡 정보만 되돌리고 저장 없이 닫는다', async () => {
    const deps = flow({ song: true, chart: true, songInfoAnswer: 'discard' });

    await expect(confirmCloseSongInfo(deps)).resolves.toBe(true);
    expect(deps.discardSongInfo).toHaveBeenCalledOnce();
    expect(deps.save).not.toHaveBeenCalled();
  });

  it('재생 중이라 변경 취소가 막히면 드로어를 연 채 둔다', async () => {
    const deps = flow({ song: true, chart: false, songInfoAnswer: 'discard', discardAllowed: false });

    await expect(confirmCloseSongInfo(deps)).resolves.toBe(false);
  });

  it('다른 Save가 진행 중이면 묻지 않고 저장 중 안내를 한 번 띄운 뒤 드로어를 연 채 둔다', async () => {
    const deps = flow({ song: true, chart: false, savingAtStart: true });

    await expect(confirmCloseSongInfo(deps)).resolves.toBe(false);
    expect(deps.notifySaving).toHaveBeenCalledOnce();
    expect(deps.askSongInfo).not.toHaveBeenCalled();
  });

  it('미저장 곡 정보가 없어도 다른 Save가 진행 중이면 저장 결과가 정해질 때까지 닫지 않는다', async () => {
    const deps = flow({ song: false, chart: false, savingAtStart: true });

    await expect(confirmCloseSongInfo(deps)).resolves.toBe(false);
    expect(deps.notifySaving).toHaveBeenCalledOnce();
  });

  it('확인 창에 답하는 사이 Save가 시작되면 변경 취소 후 닫기를 골라도 곡 정보를 되돌리지 않고 연 채 둔다', async () => {
    const deps = flow({ song: true, chart: false, songInfoAnswer: 'discard', savingAfterAnswer: true });

    await expect(confirmCloseSongInfo(deps)).resolves.toBe(false);
    expect(deps.discardSongInfo).not.toHaveBeenCalled();
    expect(deps.notifySaving).toHaveBeenCalledOnce();
  });

  it('닫기를 누를 때 Title 입력칸에 적용하지 않은 값이 있으면 먼저 적용해 미저장 곡 정보로 묻는다', async () => {
    const deps = flow({ song: false, chart: false, draftAtStart: true, songInfoAnswer: 'cancel' });

    await expect(confirmCloseSongInfo(deps)).resolves.toBe(false);
    expect(deps.askSongInfo).toHaveBeenCalledExactlyOnceWith('close');
  });

  it('저장 후 닫기의 Save 중 Title 입력칸에 친 새 값은 저장이 끝난 뒤 적용되어 미저장으로 남고 드로어를 닫지 않는다', async () => {
    const deps = flow({ song: true, chart: false, songInfoAnswer: 'save', draftDuringSave: true });

    await expect(confirmCloseSongInfo(deps)).resolves.toBe(false);
    expect(deps.save).toHaveBeenCalledOnce();
    expect(deps.songInfoDirty()).toBe(true);
  });
});

describe('에디터 이탈·다른 곡 이동(confirmLeave)', () => {
  it('미저장 변경이 없으면 묻지 않고 이동한다', async () => {
    const deps = flow({ song: false, chart: false });

    await expect(confirmLeave(deps)).resolves.toBe(true);
    expect(deps.askLeave).not.toHaveBeenCalled();
  });

  it('차트 변경이 있고 취소하면 이동하지 않는다', async () => {
    const deps = flow({ song: false, chart: true, leaveAnswer: 'cancel' });

    await expect(confirmLeave(deps)).resolves.toBe(false);
    expect(deps.askLeave).toHaveBeenCalledExactlyOnceWith('leave');
    expect(deps.save).not.toHaveBeenCalled();
  });

  it('버리고 이동을 고르면 저장하지 않고 이동한다', async () => {
    const deps = flow({ song: true, chart: true, leaveAnswer: 'discard' });

    await expect(confirmLeave(deps)).resolves.toBe(true);
    expect(deps.save).not.toHaveBeenCalled();
  });

  it('저장 후 이동은 Save가 곡·차트를 모두 저장해야 이동한다', async () => {
    const deps = flow({ song: true, chart: true, leaveAnswer: 'save' });

    await expect(confirmLeave(deps)).resolves.toBe(true);
    expect(deps.save).toHaveBeenCalledOnce();
  });

  it('저장 후 이동에서 곡만 저장되고 차트 저장이 실패하면 이동하지 않고 편집을 유지한다', async () => {
    const deps = flow({ song: true, chart: true, leaveAnswer: 'save', afterSave: { song: false, chart: true } });

    await expect(confirmLeave(deps)).resolves.toBe(false);
  });

  it('곡 저장과 차트 저장 사이처럼 Save가 진행 중이면 묻지 않고 이동하지 않는다', async () => {
    const deps = flow({ song: false, chart: true, savingAtStart: true });

    await expect(confirmLeave(deps)).resolves.toBe(false);
    expect(deps.askLeave).not.toHaveBeenCalled();
    expect(deps.notifySaving).toHaveBeenCalledOnce();
  });

  it('확인 창에 답하는 사이 Save가 시작되면 버리고 이동을 골라도 이동하지 않는다', async () => {
    const deps = flow({ song: false, chart: true, leaveAnswer: 'discard', savingAfterAnswer: true });

    await expect(confirmLeave(deps)).resolves.toBe(false);
    expect(deps.save).not.toHaveBeenCalled();
  });

  it('저장 후 이동의 Save 중 입력칸에 친 새 값이 남으면 이동하지 않는다', async () => {
    const deps = flow({ song: false, chart: true, leaveAnswer: 'save', draftDuringSave: true });

    await expect(confirmLeave(deps)).resolves.toBe(false);
  });
});

describe('같은 곡의 다른 차트로 전환(confirmChartSwitch)', () => {
  it('미저장 변경이 없으면 묻지 않고 전환한다', async () => {
    const deps = flow({ song: false, chart: false });

    await expect(confirmChartSwitch(deps)).resolves.toBe(true);
    expect(deps.askSongInfo).not.toHaveBeenCalled();
    expect(deps.askLeave).not.toHaveBeenCalled();
  });

  it('미저장 곡 정보가 있으면 곡 정보 저장·변경 취소를 먼저 묻고 취소하면 전환하지 않는다', async () => {
    const deps = flow({ song: true, chart: true, songInfoAnswer: 'cancel' });

    await expect(confirmChartSwitch(deps)).resolves.toBe(false);
    expect(deps.askSongInfo).toHaveBeenCalledExactlyOnceWith('switch');
    expect(deps.askLeave).not.toHaveBeenCalled();
  });

  it('곡 정보 저장을 고르고 Save가 곡·차트를 모두 저장하면 더 묻지 않고 전환한다', async () => {
    const deps = flow({ song: true, chart: true, songInfoAnswer: 'save' });

    await expect(confirmChartSwitch(deps)).resolves.toBe(true);
    expect(deps.askLeave).not.toHaveBeenCalled();
  });

  it('곡 정보 저장을 골랐는데 곡 저장이 실패하면 현재 차트에 남는다', async () => {
    const deps = flow({ song: true, chart: false, songInfoAnswer: 'save', afterSave: { song: true, chart: false } });

    await expect(confirmChartSwitch(deps)).resolves.toBe(false);
    expect(deps.askLeave).not.toHaveBeenCalled();
  });

  it('곡 정보 저장 뒤 차트 저장만 실패해도 저장이 끝나지 않았으므로 현재 차트에 남는다', async () => {
    const deps = flow({ song: true, chart: true, songInfoAnswer: 'save', afterSave: { song: false, chart: true } });

    await expect(confirmChartSwitch(deps)).resolves.toBe(false);
  });

  it('곡 정보 변경 취소 뒤 차트 변경이 남으면 저장 후 이동·버리고 이동·취소를 다시 묻고 버리면 전환한다', async () => {
    const deps = flow({ song: true, chart: true, songInfoAnswer: 'discard', leaveAnswer: 'discard' });

    await expect(confirmChartSwitch(deps)).resolves.toBe(true);
    expect(deps.discardSongInfo).toHaveBeenCalledOnce();
    expect(deps.askLeave).toHaveBeenCalledExactlyOnceWith('switch');
  });

  it('곡 정보는 깨끗하고 차트만 미저장이면 곡 정보는 묻지 않고 이동 확인만 받는다', async () => {
    const deps = flow({ song: false, chart: true, leaveAnswer: 'cancel' });

    await expect(confirmChartSwitch(deps)).resolves.toBe(false);
    expect(deps.askSongInfo).not.toHaveBeenCalled();
    expect(deps.askLeave).toHaveBeenCalledExactlyOnceWith('switch');
  });

  it('Save가 진행 중이면 변경이 없어도 전환하지 않고 저장 중 안내를 띄운다', async () => {
    const deps = flow({ song: false, chart: false, savingAtStart: true });

    await expect(confirmChartSwitch(deps)).resolves.toBe(false);
    expect(deps.notifySaving).toHaveBeenCalledOnce();
  });

  it('확인 창에 답하는 사이 Save가 시작되면 변경 취소 후 전환을 골라도 곡 정보를 되돌리지 않고 남는다', async () => {
    const deps = flow({ song: true, chart: false, songInfoAnswer: 'discard', savingAfterAnswer: true });

    await expect(confirmChartSwitch(deps)).resolves.toBe(false);
    expect(deps.discardSongInfo).not.toHaveBeenCalled();
  });

  it('저장 후 전환의 Save 중 입력칸에 친 새 값이 남으면 전환하지 않는다', async () => {
    const deps = flow({ song: true, chart: false, songInfoAnswer: 'save', draftDuringSave: true });

    await expect(confirmChartSwitch(deps)).resolves.toBe(false);
  });
});

describe('미저장 여부 판단', () => {
  const store = () => useEditorStore.getState();
  const base = useEditorStore.getInitialState().chart;
  const loadedSong = { title: '곡', artist: '작곡가', jacketUrl: null, audioUrl: '', previewUrl: null,
    previewStart: null, previewEnd: null, duration: null, gameplayStart: null, gameplayEnd: null,
    gameplayFadeIn: null, gameplayFadeOut: null, timing: null, revision: 1 };
  beforeEach(() => { useEditorStore.setState(useEditorStore.getInitialState(), true); });

  it('곡 행이 있는 차트에서 1레인 2박 노트만 놓으면 곡 정보는 깨끗하고 에디터는 미저장이다', () => {
    openEditorChart(loadEditorChartAsset(toChartSaveJson(base, 2).chartJson, null, loadedSong), loadedSong);
    store().setChart({ ...store().chart, notes: [{ type: 'tap', kind: 'single', lane: 1, beat: beat(2) }] });

    expect(hasUnsavedSongInfo(store())).toBe(false);
    expect(hasUnsavedEditorChanges(store())).toBe(true);
  });

  it('곡 정보가 깨끗해도 드로어에서 고른 음원을 불러오는 중(isLoadingSongAudio)이면 곡 정보와 에디터가 모두 미저장이다', () => {
    openEditorChart(loadEditorChartAsset(toChartSaveJson(base, 2).chartJson, null, loadedSong), loadedSong);
    expect(hasUnsavedSongInfo(store())).toBe(false);

    useEditorStore.setState({ isLoadingSongAudio: true });

    expect(hasUnsavedSongInfo(store())).toBe(true);
    expect(hasUnsavedEditorChanges(store())).toBe(true);
  });

  it('드로어 음원을 불러오는 중 차트를 새로 열면 isLoadingSongAudio가 꺼져 깨끗하다', () => {
    useEditorStore.setState({ isLoadingSongAudio: true });

    openEditorChart(loadEditorChartAsset(toChartSaveJson(base, 2).chartJson, null, loadedSong), loadedSong);

    expect(store().isLoadingSongAudio).toBe(false);
    expect(hasUnsavedEditorChanges(store())).toBe(false);
  });

  it('곡 행 없는 차트에 프리뷰 0～8초가 대기 중이면 에디터는 미저장이다', () => {
    openEditorChart(loadEditorChartAsset(toChartSaveJson(base, 2).chartJson, null));
    store().setSonglessMedia({ ...store().songlessMedia, previewRange: { startTime: 0, endTime: 8, fadeInTime: 0, fadeOutTime: 0 } });

    expect(hasUnsavedSongInfo(store())).toBe(false);
    expect(hasUnsavedEditorChanges(store())).toBe(true);
  });
});
