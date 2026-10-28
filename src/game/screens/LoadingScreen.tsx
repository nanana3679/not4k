import { formatDifficultyLabel } from '../../shared/chartDifficulty';
import { useEffect, useState } from 'react';
import { useGameStore } from '../stores';
import { loadSongDocumentData } from '../../supabase';
import { prepareNormalPlay } from '../stores/explicitPlayRequest';
import { ExplicitChartCompileError } from '../judgment/explicitCompiledChart';
import { ChartFormatError } from '../../shared';
import { PageLoading } from '../../shared/components/LoadingSpinner';
import { font, color, primitives } from '../../shared/theme';

export function LoadingScreen() {
  const { selectedSongId, selectedDifficulty, selectedAudioUrl, selectedPlaybackRange, setScreen,
    beginNormalPlayLoad, completeNormalPlayLoad, cancelNormalPlayLoad } = useGameStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let audioCtx: AudioContext | null = null;
    const closeAudioContext = () => {
      const context = audioCtx;
      audioCtx = null;
      return context?.close().catch(() => undefined);
    };
    const loadId = beginNormalPlayLoad();

    const load = async () => {
      await Promise.resolve();
      if (!isMounted) return;
      setError(null);
      if (!selectedSongId || !selectedDifficulty) {
        cancelNormalPlayLoad(loadId);
        setError('No song selected. Go back and select a song.');
        return;
      }

      try {
        audioCtx = new AudioContext();
        const { chart, audioBuffer } = await loadSongDocumentData(selectedSongId, selectedDifficulty, audioCtx, selectedAudioUrl ?? undefined);

        if (isMounted) {
          const request = prepareNormalPlay({ document: chart, audioBuffer, playbackRange: selectedPlaybackRange });
          completeNormalPlayLoad(loadId, request);
        }
      } catch (err) {
        if (isMounted) {
          cancelNormalPlayLoad(loadId);
          if (err instanceof ExplicitChartCompileError || err instanceof ChartFormatError) {
            const reason = err instanceof ExplicitChartCompileError && err.validation.runtimeIncompatible.length > 0
              ? 'This chart uses an older note format.' : 'This chart contains invalid notes or chart data.';
            setError(`${reason} Go back and choose another chart, or correct it in the editor before playing.`);
          } else {
            setError('Unable to load this song. Go back and try again or choose another song.');
          }
        }
      } finally {
        await closeAudioContext();
      }
    };

    load();

    return () => {
      isMounted = false;
      cancelNormalPlayLoad(loadId);
      void closeAudioContext();
    };
  }, [selectedSongId, selectedDifficulty, selectedAudioUrl, selectedPlaybackRange,
    beginNormalPlayLoad, completeNormalPlayLoad, cancelNormalPlayLoad]);

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error} role="alert">{error}</div>
        <button style={styles.button} onClick={() => setScreen('songSelect')}>
          Back to Song Select
        </button>
      </div>
    );
  }

  return (
    <PageLoading
      message="Loading..."
      sub={`${selectedSongId} - ${formatDifficultyLabel(selectedDifficulty ?? '')}`}
    />
  );
}

const styles = {
  container: {
    ...primitives.screen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    fontSize: '24px',
    fontFamily: font.body,
    color: color.danger,
    marginBottom: '24px',
    textAlign: 'center' as const,
    maxWidth: '600px',
  },
  button: {
    // 로드 실패 화면의 유일한 복구 액션 → 주액션(네온)
    ...primitives.neonButton,
    fontSize: '18px',
    minHeight: '44px',
    padding: '12px 24px',
  },
};
