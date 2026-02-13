import { useState, useRef } from 'react';
import { useGameStore } from '../stores';
import { deserializeChart } from '@not4k/shared';

interface Song {
  id: string;
  title: string;
  artist: string;
  difficulties: string[];
}

const PLACEHOLDER_SONGS: Song[] = [
  { id: 'song1', title: 'Placeholder Song 1', artist: 'Artist A', difficulties: ['EASY', 'NORMAL', 'HARD'] },
  { id: 'song2', title: 'Placeholder Song 2', artist: 'Artist B', difficulties: ['NORMAL', 'HARD'] },
  { id: 'song3', title: 'Placeholder Song 3', artist: 'Artist C', difficulties: ['EASY', 'NORMAL'] },
];

export function SongSelectScreen() {
  const { selectSong, setScreen, setChartData, setAudioBuffer } = useGameStore();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const chartFileRef = useRef<HTMLInputElement>(null);
  const audioFileRef = useRef<HTMLInputElement>(null);

  const handleSelectSong = (songId: string, difficulty: string) => {
    selectSong(songId, difficulty);
    setScreen('loading');
  };

  const handleLoadLocal = async () => {
    const chartFile = chartFileRef.current?.files?.[0];
    const audioFile = audioFileRef.current?.files?.[0];

    if (!chartFile || !audioFile) {
      setLoadError('Please select both chart JSON and audio file');
      return;
    }

    setLoadError(null);
    setIsLoading(true);

    try {
      // Read and parse chart JSON
      const chartText = await chartFile.text();
      const chart = deserializeChart(chartText);

      // Decode audio file
      const audioCtx = new AudioContext();
      const audioArrayBuffer = await audioFile.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(audioArrayBuffer);

      // Store in game store
      setChartData(chart);
      setAudioBuffer(audioBuffer);

      // Navigate directly to play screen
      setScreen('play');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Song Select</h1>
      <div style={styles.songList}>
        {PLACEHOLDER_SONGS.map((song) => (
          <div key={song.id} style={styles.songCard}>
            <div style={styles.songInfo}>
              <div style={styles.songTitle}>{song.title}</div>
              <div style={styles.songArtist}>{song.artist}</div>
            </div>
            <div style={styles.difficultyButtons}>
              {song.difficulties.map((diff) => (
                <button
                  key={diff}
                  style={styles.diffButton}
                  onClick={() => handleSelectSong(song.id, diff)}
                >
                  {diff}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={styles.localLoadSection}>
        <h2 style={styles.localLoadTitle}>Load Local Chart</h2>
        <div style={styles.fileInputs}>
          <div style={styles.fileInputWrapper}>
            <label style={styles.fileLabel}>Chart JSON:</label>
            <input
              ref={chartFileRef}
              type="file"
              accept=".json"
              style={styles.fileInput}
              onChange={() => setLoadError(null)}
            />
          </div>
          <div style={styles.fileInputWrapper}>
            <label style={styles.fileLabel}>Audio File:</label>
            <input
              ref={audioFileRef}
              type="file"
              accept="audio/*"
              style={styles.fileInput}
              onChange={() => setLoadError(null)}
            />
          </div>
        </div>
        {loadError && <div style={styles.loadError}>{loadError}</div>}
        <button
          style={styles.loadButton}
          onClick={handleLoadLocal}
          disabled={isLoading}
        >
          {isLoading ? 'Loading...' : 'Load & Play'}
        </button>
      </div>

      <button style={styles.settingsButton} onClick={() => setScreen('settings')}>
        Settings
      </button>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '32px',
    minHeight: '100vh',
    backgroundColor: '#1a1a1a',
    color: '#ffffff',
  },
  title: {
    fontSize: '48px',
    marginBottom: '32px',
  },
  songList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    width: '100%',
    maxWidth: '800px',
    marginBottom: '32px',
  },
  songCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px',
    backgroundColor: '#2a2a2a',
    borderRadius: '8px',
  },
  songInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  songTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
  },
  songArtist: {
    fontSize: '18px',
    color: '#aaaaaa',
  },
  difficultyButtons: {
    display: 'flex',
    gap: '8px',
  },
  diffButton: {
    fontSize: '16px',
    padding: '8px 16px',
    backgroundColor: '#00ffff',
    color: '#1a1a1a',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  settingsButton: {
    fontSize: '18px',
    padding: '12px 24px',
    backgroundColor: '#666666',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  localLoadSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '24px',
    marginBottom: '32px',
    backgroundColor: '#2a2a2a',
    borderRadius: '8px',
    width: '100%',
    maxWidth: '800px',
  },
  localLoadTitle: {
    fontSize: '28px',
    marginBottom: '16px',
  },
  fileInputs: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    width: '100%',
    marginBottom: '16px',
  },
  fileInputWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  fileLabel: {
    fontSize: '16px',
    minWidth: '100px',
  },
  fileInput: {
    fontSize: '14px',
    padding: '8px',
    backgroundColor: '#1a1a1a',
    color: '#ffffff',
    border: '1px solid #666666',
    borderRadius: '4px',
    cursor: 'pointer',
    flex: 1,
  },
  loadButton: {
    fontSize: '18px',
    padding: '12px 32px',
    backgroundColor: '#00ffff',
    color: '#1a1a1a',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  loadError: {
    fontSize: '14px',
    color: '#ff4444',
    marginBottom: '12px',
  },
};
