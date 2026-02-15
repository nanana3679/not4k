import { useEffect, useState, useCallback } from 'react';
import { useGameStore } from '../stores';
import { supabase } from '../../supabase';

interface DbChart {
  id: string;
  song_id: string;
  difficulty_label: string;
  difficulty_level: number;
}

interface DbSong {
  id: string;
  title: string;
  artist: string;
  audio_url: string;
  charts: DbChart[];
}

function getDifficultyColor(difficulty: string): React.CSSProperties {
  switch (difficulty.toLowerCase()) {
    case 'easy': return { backgroundColor: '#2d6a4f', borderColor: '#40916c' };
    case 'normal': return { backgroundColor: '#1d4e89', borderColor: '#2a6db5' };
    case 'hard': return { backgroundColor: '#7b2d26', borderColor: '#a33b32' };
    case 'expert': return { backgroundColor: '#5c2d82', borderColor: '#7b3fa8' };
    default: return { backgroundColor: '#3a3a3a', borderColor: '#555' };
  }
}

export function SongSelectScreen() {
  const { selectSong, setScreen } = useGameStore();
  const [songs, setSongs] = useState<DbSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSongs = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('songs')
      .select('*, charts(*)')
      .order('title');

    if (err) {
      setError(`Failed to load songs: ${err.message}`);
      setLoading(false);
      return;
    }
    setSongs((data ?? []) as DbSong[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchSongs(); }, [fetchSongs]);

  const handleSelect = (songId: string, difficulty: string, audioUrl: string) => {
    selectSong(songId, difficulty, audioUrl);
    setScreen('loading');
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Song Select</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={styles.refreshBtn} onClick={fetchSongs} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button style={styles.settingsBtn} onClick={() => setScreen('settings')}>
            Settings
          </button>
          <button style={styles.backBtn} onClick={() => setScreen('title')}>
            Back
          </button>
        </div>
      </div>

      <div style={styles.songList}>
        {loading && songs.length === 0 && (
          <div style={styles.empty}>Loading songs...</div>
        )}

        {!loading && error && (
          <div style={styles.empty}>{error}</div>
        )}

        {!loading && !error && songs.length === 0 && (
          <div style={styles.empty}>No songs found.</div>
        )}

        {songs.map((song) => (
          <div key={song.id} style={styles.songCard}>
            <div style={styles.songInfo}>
              <span style={styles.songTitle}>{song.title}</span>
              <span style={styles.songArtist}>{song.artist}</span>
            </div>
            <div style={styles.chartButtons}>
              {song.charts
                .sort((a, b) => a.difficulty_level - b.difficulty_level)
                .map((chart) => (
                  <button
                    key={chart.id}
                    style={{
                      ...styles.chartBtn,
                      ...getDifficultyColor(chart.difficulty_label),
                    }}
                    onClick={() => handleSelect(song.id, chart.difficulty_label, song.audio_url)}
                  >
                    {chart.difficulty_label.toUpperCase()} Lv.{chart.difficulty_level}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: '#1a1a1a',
    color: '#e0e0e0',
    fontFamily: 'system-ui, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    backgroundColor: '#2a2a2a',
    borderBottom: '1px solid #333',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 600,
  },
  refreshBtn: {
    padding: '6px 16px',
    backgroundColor: '#3a3a3a',
    color: '#e0e0e0',
    border: '1px solid #555',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
  },
  settingsBtn: {
    padding: '6px 16px',
    backgroundColor: '#3a3a3a',
    color: '#e0e0e0',
    border: '1px solid #555',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
  },
  backBtn: {
    padding: '6px 16px',
    backgroundColor: 'transparent',
    color: '#888',
    border: '1px solid #444',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
  },
  songList: {
    flex: 1,
    overflow: 'auto',
    padding: '16px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  empty: {
    textAlign: 'center',
    color: '#888',
    marginTop: '40px',
    fontSize: '14px',
  },
  songCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    backgroundColor: '#2a2a2a',
    border: '1px solid #333',
    borderRadius: '6px',
  },
  songInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
    flex: 1,
  },
  songTitle: {
    fontSize: '15px',
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  songArtist: {
    fontSize: '13px',
    color: '#999',
  },
  chartButtons: {
    display: 'flex',
    gap: '6px',
    flexShrink: 0,
    marginLeft: '16px',
  },
  chartBtn: {
    padding: '4px 12px',
    color: '#fff',
    border: '1px solid #555',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
  },
};
