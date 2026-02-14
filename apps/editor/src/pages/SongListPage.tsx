import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../supabase';
import { useEditorStore } from '../stores';
import {
  STORAGE_BUCKET,
  songChartPath,
  songAudioPath,
  songPreviewPath,
  songJacketPath,
  deserializeChart,
  beat,
} from '@not4k/shared';
import type { Chart } from '@not4k/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DbChart {
  id: string;
  song_id: string;
  difficulty: string;
  level: number;
  uploaded_by: string | null;
}

interface DbSong {
  id: string;
  title: string;
  artist: string;
  audio_url: string;
  uploaded_by: string | null;
  charts: DbChart[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPublicUrl(path: string): string {
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function fetchChartJson(songId: string, difficulty: string): Promise<Chart> {
  const url = getPublicUrl(songChartPath(songId, difficulty));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Chart fetch failed: ${res.status}`);
  return deserializeChart(await res.text());
}

function fetchAudioUrl(song: DbSong): string {
  return getPublicUrl(song.audio_url);
}

function createEmptyChart(song: DbSong, difficulty: string, level: number): Chart {
  return {
    meta: {
      title: song.title,
      artist: song.artist,
      difficultyLabel: difficulty.toUpperCase(),
      difficultyLevel: level,
      imageFile: '',
      audioFile: '',
      previewAudioFile: '',
      offsetMs: 0,
    },
    notes: [],
    trillZones: [],
    events: [{ beat: beat(0, 1), endBeat: beat(0, 1), bpm: 120, beatPerMeasure: { n: 4, d: 1 } }],
  };
}

// ---------------------------------------------------------------------------
// Slug helper
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function generateSongId(title: string): string {
  const slug = slugify(title) || 'song';
  const hex = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  return `${slug}-${hex}`;
}

// ---------------------------------------------------------------------------
// Add Song Modal
// ---------------------------------------------------------------------------

function AddSongModal({ onDone, onClose, addToast }: {
  onDone: () => void;
  onClose: () => void;
  addToast: (msg: string, type: 'info' | 'error') => void;
}) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [jacketFile, setJacketFile] = useState<File | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = title.trim() !== '' && artist.trim() !== '' && audioFile !== null && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !audioFile) return;
    setSubmitting(true);

    try {
      const songId = generateSongId(title);
      const audioExt = audioFile.name.split('.').pop()?.toLowerCase() || 'ogg';

      // Upload files in parallel
      const uploads: Promise<void>[] = [];

      uploads.push(
        supabase.storage.from(STORAGE_BUCKET).upload(songAudioPath(songId, audioExt), audioFile)
          .then(({ error }) => { if (error) throw new Error(`Audio upload failed: ${error.message}`); }),
      );

      if (jacketFile) {
        const jacketExt = jacketFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        uploads.push(
          supabase.storage.from(STORAGE_BUCKET).upload(songJacketPath(songId, jacketExt), jacketFile)
            .then(({ error }) => { if (error) throw new Error(`Jacket upload failed: ${error.message}`); }),
        );
      }

      if (previewFile) {
        const previewExt = previewFile.name.split('.').pop()?.toLowerCase() || 'ogg';
        uploads.push(
          supabase.storage.from(STORAGE_BUCKET).upload(songPreviewPath(songId, previewExt), previewFile)
            .then(({ error }) => { if (error) throw new Error(`Preview upload failed: ${error.message}`); }),
        );
      }

      await Promise.all(uploads);

      // Insert song row
      const row: Record<string, string> = {
        id: songId,
        title: title.trim(),
        artist: artist.trim(),
        audio_url: songAudioPath(songId, audioExt),
      };
      if (jacketFile) {
        const jacketExt = jacketFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        row.jacket_url = songJacketPath(songId, jacketExt);
      }
      if (previewFile) {
        const previewExt = previewFile.name.split('.').pop()?.toLowerCase() || 'ogg';
        row.preview_url = songPreviewPath(songId, previewExt);
      }

      const { error } = await supabase.from('songs').insert(row);
      if (error) throw new Error(`DB insert failed: ${error.message}`);

      addToast(`Song "${title.trim()}" added`, 'info');
      onDone();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      addToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={modalStyles.overlay} onClick={submitting ? undefined : onClose}>
      <div style={{ ...modalStyles.modal, minWidth: '340px' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={modalStyles.title}>New Song</h3>

        <label style={modalStyles.field}>
          <span>Title *</span>
          <input
            style={modalStyles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Song title"
          />
        </label>

        <label style={modalStyles.field}>
          <span>Artist *</span>
          <input
            style={modalStyles.input}
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Artist name"
          />
        </label>

        <label style={modalStyles.field}>
          <span>Audio * (ogg/mp3)</span>
          <input
            style={modalStyles.input}
            type="file"
            accept=".ogg,.mp3,audio/ogg,audio/mpeg"
            onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <label style={modalStyles.field}>
          <span>Jacket (image)</span>
          <input
            style={modalStyles.input}
            type="file"
            accept="image/*"
            onChange={(e) => setJacketFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <label style={modalStyles.field}>
          <span>Preview (ogg/mp3)</span>
          <input
            style={modalStyles.input}
            type="file"
            accept=".ogg,.mp3,audio/ogg,audio/mpeg"
            onChange={(e) => setPreviewFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <div style={modalStyles.buttons}>
          <button
            style={{
              ...modalStyles.saveBtn,
              opacity: canSubmit ? 1 : 0.5,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {submitting ? 'Uploading...' : 'Add Song'}
          </button>
          <button style={modalStyles.cancelBtn} onClick={onClose} disabled={submitting}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Difficulty Picker Modal
// ---------------------------------------------------------------------------

const DIFFICULTIES = ['EASY', 'NORMAL', 'HARD', 'EXPERT'];

function DifficultyModal({ existingDifficulties, onSelect, onClose }: {
  existingDifficulties: string[];
  onSelect: (difficulty: string, level: number) => void;
  onClose: () => void;
}) {
  const available = useMemo(
    () => DIFFICULTIES.filter((d) => !existingDifficulties.includes(d.toLowerCase())),
    [existingDifficulties],
  );

  const [difficulty, setDifficulty] = useState(() => available.length > 0 ? available[0] : '');
  const [level, setLevel] = useState('1');

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={modalStyles.title}>New Chart</h3>

        <label style={modalStyles.field}>
          <span>Difficulty</span>
          {available.length > 0 ? (
            <select
              style={modalStyles.input}
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              {available.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          ) : (
            <span style={{ color: '#888', fontSize: '13px' }}>All difficulties taken</span>
          )}
        </label>

        <label style={modalStyles.field}>
          <span>Level (1~15)</span>
          <input
            style={modalStyles.input}
            type="number"
            min="1"
            max="15"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          />
        </label>

        <div style={modalStyles.buttons}>
          <button
            style={modalStyles.saveBtn}
            disabled={!difficulty}
            onClick={() => {
              const lv = parseInt(level);
              onSelect(difficulty.toLowerCase(), isNaN(lv) ? 1 : Math.max(1, Math.min(15, lv)));
            }}
          >
            Create
          </button>
          <button style={modalStyles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SongListPage
// ---------------------------------------------------------------------------

export function SongListPage() {
  const { setActivePage, setActiveSongId, setPendingAudioUrl, setChart, addToast } = useEditorStore();

  const [songs, setSongs] = useState<DbSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSong, setLoadingSong] = useState<string | null>(null);
  const [newChartTarget, setNewChartTarget] = useState<DbSong | null>(null);
  const [showAddSong, setShowAddSong] = useState(false);

  // Fetch songs + charts
  const fetchSongs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('songs')
      .select('*, charts(*)')
      .order('title');

    if (error) {
      addToast(`Failed to load songs: ${error.message}`, 'error');
      setLoading(false);
      return;
    }
    setSongs((data ?? []) as DbSong[]);
    setLoading(false);
  }, [addToast]);

  useEffect(() => { fetchSongs(); }, [fetchSongs]);

  // Load existing chart from Storage
  const handleLoadChart = useCallback(async (song: DbSong, chart: DbChart) => {
    setLoadingSong(`${song.id}/${chart.difficulty}`);
    try {
      const chartData = await fetchChartJson(song.id, chart.difficulty);
      const audioUrl = fetchAudioUrl(song);

      setChart(chartData);
      setActiveSongId(song.id);
      setPendingAudioUrl(audioUrl);
      setActivePage('chartEditor');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      addToast(`Load failed: ${message}`, 'error');
    } finally {
      setLoadingSong(null);
    }
  }, [setChart, setActivePage, setActiveSongId, setPendingAudioUrl, addToast]);

  // Create new chart
  const handleNewChart = useCallback((song: DbSong, difficulty: string, level: number) => {
    const chartData = createEmptyChart(song, difficulty, level);
    setChart(chartData);
    setActiveSongId(song.id);
    setPendingAudioUrl(fetchAudioUrl(song));
    setActivePage('chartEditor');
    setNewChartTarget(null);
  }, [setChart, setActivePage, setActiveSongId, setPendingAudioUrl]);

  // Local file load (preserve existing workflow)
  const handleLoadLocal = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    file.text().then((text) => {
      const chart = deserializeChart(text);
      setChart(chart);
      setActiveSongId(null);
      setActivePage('chartEditor');
    }).catch((err) => {
      addToast(`Failed to load file: ${err.message}`, 'error');
    });
  }, [setChart, setActiveSongId, setActivePage, addToast]);

  return (
    <div style={pageStyles.container}>
      <div style={pageStyles.header}>
        <h1 style={pageStyles.title}>Song List</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={pageStyles.addSongBtn} onClick={() => setShowAddSong(true)}>
            + Add Song
          </button>
          <button style={pageStyles.refreshBtn} onClick={fetchSongs} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div style={pageStyles.songList}>
        {loading && songs.length === 0 && (
          <div style={pageStyles.empty}>Loading songs...</div>
        )}

        {!loading && songs.length === 0 && (
          <div style={pageStyles.empty}>No songs found. Click "+ Add Song" to get started.</div>
        )}

        {songs.map((song) => (
          <div key={song.id} style={pageStyles.songCard}>
            <div style={pageStyles.songInfo}>
              <span style={pageStyles.songTitle}>{song.title}</span>
              <span style={pageStyles.songArtist}>{song.artist}</span>
            </div>
            <div style={pageStyles.chartButtons}>
              {song.charts
                .sort((a, b) => a.level - b.level)
                .map((chart) => {
                  const isLoading = loadingSong === `${song.id}/${chart.difficulty}`;
                  return (
                    <button
                      key={chart.id}
                      style={{
                        ...pageStyles.chartBtn,
                        ...getDifficultyColor(chart.difficulty),
                      }}
                      onClick={() => handleLoadChart(song, chart)}
                      disabled={!!loadingSong}
                    >
                      {isLoading ? '...' : `${chart.difficulty.toUpperCase()} Lv.${chart.level}`}
                    </button>
                  );
                })}
              <button
                style={pageStyles.newChartBtn}
                onClick={() => setNewChartTarget(song)}
                disabled={!!loadingSong}
              >
                + New
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Local file load */}
      <div style={pageStyles.footer}>
        <label style={pageStyles.localLoadBtn}>
          Load Local File
          <input
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleLoadLocal}
          />
        </label>
      </div>

      {/* Add song modal */}
      {showAddSong && (
        <AddSongModal
          addToast={addToast}
          onDone={() => { setShowAddSong(false); fetchSongs(); }}
          onClose={() => setShowAddSong(false)}
        />
      )}

      {/* New chart difficulty modal */}
      {newChartTarget && (
        <DifficultyModal
          existingDifficulties={newChartTarget.charts.map((c) => c.difficulty)}
          onSelect={(diff, lv) => handleNewChart(newChartTarget, diff, lv)}
          onClose={() => setNewChartTarget(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function getDifficultyColor(difficulty: string): React.CSSProperties {
  switch (difficulty.toLowerCase()) {
    case 'easy': return { backgroundColor: '#2d6a4f', borderColor: '#40916c' };
    case 'normal': return { backgroundColor: '#1d4e89', borderColor: '#2a6db5' };
    case 'hard': return { backgroundColor: '#7b2d26', borderColor: '#a33b32' };
    case 'expert': return { backgroundColor: '#5c2d82', borderColor: '#7b3fa8' };
    default: return { backgroundColor: '#3a3a3a', borderColor: '#555' };
  }
}

const pageStyles: Record<string, React.CSSProperties> = {
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
  addSongBtn: {
    padding: '6px 16px',
    backgroundColor: '#4488ff',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
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
  newChartBtn: {
    padding: '4px 12px',
    backgroundColor: 'transparent',
    color: '#888',
    border: '1px dashed #555',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 24px',
    backgroundColor: '#2a2a2a',
    borderTop: '1px solid #333',
  },
  localLoadBtn: {
    padding: '6px 20px',
    backgroundColor: '#3a3a3a',
    color: '#e0e0e0',
    border: '1px solid #555',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
  },
};

const modalStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  },
  modal: {
    backgroundColor: '#2a2a2a',
    border: '1px solid #555',
    borderRadius: '8px',
    padding: '20px',
    minWidth: '280px',
    color: '#e0e0e0',
    fontFamily: 'system-ui, sans-serif',
  },
  title: {
    margin: '0 0 16px',
    fontSize: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginBottom: '12px',
    fontSize: '13px',
  },
  input: {
    padding: '6px 8px',
    backgroundColor: '#1a1a1a',
    color: '#e0e0e0',
    border: '1px solid #555',
    borderRadius: '4px',
    fontSize: '14px',
  },
  buttons: {
    display: 'flex',
    gap: '8px',
    marginTop: '16px',
  },
  saveBtn: {
    padding: '6px 16px',
    backgroundColor: '#4488ff',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
  },
  cancelBtn: {
    padding: '6px 16px',
    backgroundColor: '#3a3a3a',
    color: '#e0e0e0',
    border: '1px solid #555',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    marginLeft: 'auto',
  },
};
