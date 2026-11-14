import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showToast } from '../../shared/toast';
import { fetchSongSharedData } from '../../supabase/songSharedData';
import { openEditorChart } from '../openEditorChart';
import { useEditorStore } from '../stores/editorStore';
import { restoreSongAudioAfterPlayTest } from './restoreSongAudioAfterPlayTest';

vi.mock('../../shared/toast', () => ({ showToast: vi.fn() }));
vi.mock('../../supabase/songSharedData', () => ({ fetchSongSharedData: vi.fn() }));

const toPublicUrl = (path: string) => `https://audio.invalid/${path}`;
const store = () => useEditorStore.getState();
const songRow = { title: '곡', artist: '작곡가', jacketUrl: null, audioUrl: 'songs/b/audio.ogg', previewUrl: null, previewStart: null, previewEnd: null,
  duration: 120, gameplayStart: null, gameplayEnd: null, gameplayFadeIn: null, gameplayFadeOut: null, timing: null, revision: 42 };

function openChart(song: typeof songRow | null) {
  openEditorChart({ chart: useEditorStore.getInitialState().chart, extraLaneCount: 2, hasExtraLaneCount: true }, song);
}

beforeEach(() => {
  vi.clearAllMocks();
  useEditorStore.setState(useEditorStore.getInitialState(), true);
});

describe('restoreSongAudioAfterPlayTest', () => {
  it('songs/b/audio.ogg 행으로 연 뒤 이 세션의 곡 저장으로 지금 값의 음원이 songs/a/audio.ogg가 됐으면 곡 행 조회 없이 A의 공개 URL을 요청한다', () => {
    openChart(songRow);
    store().applySongMedia({ audioFile: 'songs/a/audio.ogg' }, {});

    restoreSongAudioAfterPlayTest(toPublicUrl);

    expect(store().pendingAudioUrl).toBe('https://audio.invalid/songs/a/audio.ogg');
    expect(fetchSongSharedData).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('대기 File next.ogg가 있으면 재생기가 그 파일을 읽으므로 URL을 요청하지 않는다', () => {
    openChart(songRow);
    store().setSong({ ...store().song!, pendingAudioFile: new File(['n'], 'next.ogg') });

    restoreSongAudioAfterPlayTest(toPublicUrl);

    expect(store().pendingAudioUrl).toBeNull();
  });

  it('지금 값의 음원 경로가 빈 문자열이면 요청할 음원이 없어 URL을 요청하지 않는다', () => {
    openChart({ ...songRow, audioUrl: '' });

    restoreSongAudioAfterPlayTest(toPublicUrl);

    expect(store().pendingAudioUrl).toBeNull();
  });

  it('곡 행이 없는 차트에 Meta에서 고른 로컬 파일명 local.wav가 남아 있어도 공개 URL을 요청하지 않고 알림도 없다', () => {
    openChart(null);
    expect(store().song).toBeNull();
    store().applyMetaEdit({ audioFile: 'local.wav' });

    restoreSongAudioAfterPlayTest(toPublicUrl);

    expect(store().pendingAudioUrl).toBeNull();
    expect(showToast).not.toHaveBeenCalled();
  });
});
