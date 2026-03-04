import { useEffect, useState } from 'react';
import { useGameStore } from '../stores';
import { loadSongData } from '../../supabase';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';

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
    <LoadingSpinner
      message="Loading..."
      sub={`${selectedSongId} - ${selectedDifficulty}`}
    />
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    backgroundColor: '#1a1a1a',
    color: '#ffffff',
  },
  error: {
    fontSize: '24px',
    color: '#ff4444',
    marginBottom: '24px',
    textAlign: 'center' as const,
    maxWidth: '600px',
  },
  button: {
    fontSize: '18px',
    padding: '12px 24px',
    backgroundColor: '#00ffff',
    color: '#1a1a1a',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
};
