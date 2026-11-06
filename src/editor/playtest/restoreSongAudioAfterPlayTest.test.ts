import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showToast } from '../../shared/toast';
import { fetchSongSharedData } from '../../supabase/songSharedData';
import { PLAY_TEST_RETURN_AUDIO_FAILED_COPY } from '../editorCopy';
import { useEditorStore } from '../stores/editorStore';
import { restoreSongAudioAfterPlayTest } from './restoreSongAudioAfterPlayTest';

vi.mock('../../shared/toast', () => ({ showToast: vi.fn() }));
vi.mock('../../supabase/songSharedData', () => ({ fetchSongSharedData: vi.fn() }));

const toPublicUrl = (path: string) => `https://audio.invalid/${path}`;

beforeEach(() => {
  vi.clearAllMocks();
  useEditorStore.setState(useEditorStore.getInitialState(), true);
});

describe('restoreSongAudioAfterPlayTest', () => {
  it('곡 행은 songs/b/audio.ogg여도 Undo한 초안이 songs/a/audio.ogg이면 A의 공개 URL을 요청한다', async () => {
    useEditorStore.getState().applyMetaEdit({ audioFile: 'songs/a/audio.ogg' });
    vi.mocked(fetchSongSharedData).mockResolvedValue({ audioUrl: 'songs/b/audio.ogg' } as Awaited<ReturnType<typeof fetchSongSharedData>>);

    await restoreSongAudioAfterPlayTest('a', toPublicUrl);

    expect(useEditorStore.getState().pendingAudioUrl).toBe('https://audio.invalid/songs/a/audio.ogg');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('곡 행 조회가 Failed to load song 오류로 실패하고 대기 File이 없으면 거부하지 않고 영어 오류 알림 1회만 띄우며 pendingAudioUrl은 null이다', async () => {
    vi.mocked(fetchSongSharedData).mockRejectedValue(new Error('Failed to load song: timeout'));

    await expect(restoreSongAudioAfterPlayTest('a', toPublicUrl)).resolves.toBeUndefined();

    expect(PLAY_TEST_RETURN_AUDIO_FAILED_COPY).toBe('Could not reload the song, so the audio was not loaded. Your edits are kept.');
    expect(showToast).toHaveBeenCalledExactlyOnceWith(PLAY_TEST_RETURN_AUDIO_FAILED_COPY, 'error');
    expect(useEditorStore.getState().pendingAudioUrl).toBeNull();
  });
});
