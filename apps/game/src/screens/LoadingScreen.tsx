import { useEffect, useState } from 'react';
import { useGameStore } from '../stores';

export function LoadingScreen() {
  const { selectedSongId, selectedDifficulty, setScreen } = useGameStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSong = async () => {
      if (!selectedSongId || !selectedDifficulty) {
        setError('No song selected');
        return;
      }

      try {
        // Check if Supabase is configured
        if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
          setError('Supabase not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
          return;
        }

        // TODO: Load chart and audio data
        // const { loadSongData } = await import('../supabase');
        // const audioCtx = new AudioContext();
        // await loadSongData(selectedSongId, selectedDifficulty, audioCtx);

        // Simulate loading
        await new Promise((resolve) => setTimeout(resolve, 1000));

        setScreen('play');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load song');
      }
    };

    loadSong();
  }, [selectedSongId, selectedDifficulty, setScreen]);

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
    <div style={styles.container}>
      <div style={styles.text}>Loading...</div>
      <div style={styles.songInfo}>
        {selectedSongId} - {selectedDifficulty}
      </div>
    </div>
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
  text: {
    fontSize: '32px',
    marginBottom: '16px',
  },
  songInfo: {
    fontSize: '18px',
    color: '#aaaaaa',
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
