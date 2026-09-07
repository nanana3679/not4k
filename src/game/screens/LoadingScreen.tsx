import { useEffect, useState } from 'react';
import { useGameStore } from '../stores';
import { loadSongData } from '../../supabase';
import { PageLoading } from '../../shared/components/LoadingSpinner';
import { font, color, primitives } from '../../shared/theme';

export function LoadingScreen() {
  const { selectedSongId, selectedDifficulty, selectedAudioUrl, setScreen, setChartData, setAudioBuffer } = useGameStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let audioCtx: AudioContext | null = null;

    const load = async () => {
      if (!selectedSongId || !selectedDifficulty) {
        setError('No song selected');
        return;
      }

      try {
        audioCtx = new AudioContext();
        const { chart, audioBuffer } = await loadSongData(selectedSongId, selectedDifficulty, audioCtx, selectedAudioUrl ?? undefined);

        if (isMounted) {
          setChartData(chart);
          setAudioBuffer(audioBuffer);
          setScreen('play');
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load song');
        }
      } finally {
        if (audioCtx) {
          await audioCtx.close();
        }
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [selectedSongId, selectedDifficulty, selectedAudioUrl, setScreen, setChartData, setAudioBuffer]);

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>{error}</div>
        <button style={styles.button} onClick={() => setScreen('songSelect')}>
          Back to Song Select
        </button>
      </div>
    );
  }

  return (
    <PageLoading
      message="Loading..."
      sub={`${selectedSongId} - ${selectedDifficulty}`}
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
