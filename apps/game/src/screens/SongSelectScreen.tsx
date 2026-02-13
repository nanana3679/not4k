import { useGameStore } from '../stores';

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
  const { selectSong, setScreen } = useGameStore();

  const handleSelectSong = (songId: string, difficulty: string) => {
    selectSong(songId, difficulty);
    setScreen('loading');
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
};
