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
  it('곡 행 음원이 songs/a/audio.ogg이고 대기 File이 없으면 공개 URL https://audio.invalid/songs/a/audio.ogg를 pendingAudioUrl로 정한다', async () => {
    vi.mocked(fetchSongSharedData).mockResolvedValue({ audioUrl: 'songs/a/audio.ogg' } as Awaited<ReturnType<typeof fetchSongSharedData>>);

    await restoreSongAudioAfterPlayTest('a', toPublicUrl);

    expect(useEditorStore.getState().pendingAudioUrl).toBe('https://audio.invalid/songs/a/audio.ogg');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('곡 행 조회가 Failed to load song 오류로 실패하고 대기 File이 없으면 거부하지 않고 오류 알림 1회만 띄우며 pendingAudioUrl은 null이다', async () => {
    vi.mocked(fetchSongSharedData).mockRejectedValue(new Error('Failed to load song: timeout'));

    await expect(restoreSongAudioAfterPlayTest('a', toPublicUrl)).resolves.toBeUndefined();

    expect(showToast).toHaveBeenCalledExactlyOnceWith(PLAY_TEST_RETURN_AUDIO_FAILED_COPY, 'error');
    expect(useEditorStore.getState().pendingAudioUrl).toBeNull();
  });
});
