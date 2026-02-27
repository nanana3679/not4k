import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useGameStore } from '../stores';
import { useAuth } from '../../shared/hooks/useAuth';
import { supabase } from '../../supabase';
import {
  STORAGE_BUCKET,
  songChartPath,
  songAudioPath,
  songJacketPath,
  beat,
  serializeChart,
} from '../../shared';
import type { Chart } from '../../shared';
import { PreviewRangeSelector } from '../../editor/components/PreviewRangeSelector';
import type { PreviewRangeState } from '../../editor/components/PreviewRangeSelector';


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
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
  addToast: (msg: string, type?: 'info' | 'error') => void;
}) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [jacketFile, setJacketFile] = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [decodingAudio, setDecodingAudio] = useState(false);
  const [previewRange, setPreviewRange] = useState<PreviewRangeState | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleAudioChange = async (file: File | null) => {
    setAudioFile(file);
    setAudioBuffer(null);
    setPreviewRange(null);
    if (file) {
      setDecodingAudio(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const ctx = new AudioContext();
        const buffer = await ctx.decodeAudioData(arrayBuffer);
        await ctx.close();
        setAudioBuffer(buffer);
      } catch {
        setAudioBuffer(null);
      } finally {
        setDecodingAudio(false);
      }
    }
  };

  const canSubmit = title.trim() !== '' && artist.trim() !== '' && audioFile !== null && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !audioFile) return;
    setSubmitting(true);

    try {
      const songId = generateSongId(title);
      const audioExt = audioFile.name.split('.').pop()?.toLowerCase() || 'ogg';

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

      await Promise.all(uploads);

      const row: Record<string, unknown> = {
        id: songId,
        title: title.trim(),
        artist: artist.trim(),
        audio_url: songAudioPath(songId, audioExt),
      };
      if (jacketFile) {
        const jacketExt = jacketFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        row.jacket_url = songJacketPath(songId, jacketExt);
      }
      if (previewRange) {
        row.preview_start = previewRange.startTime;
        row.preview_end = previewRange.endTime;
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
      <div style={{ ...modalStyles.modal, minWidth: '340px', width: '500px', maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={modalStyles.title}>New Song</h3>

        <label style={modalStyles.field}>
          <span>Title *</span>
          <input style={modalStyles.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Song title" />
        </label>

        <label style={modalStyles.field}>
          <span>Artist *</span>
          <input style={modalStyles.input} value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist name" />
        </label>

        <label style={modalStyles.field}>
          <span>Audio * (ogg/mp3)</span>
          <input style={modalStyles.input} type="file" accept=".ogg,.mp3,audio/ogg,audio/mpeg" onChange={(e) => handleAudioChange(e.target.files?.[0] ?? null)} />
        </label>

        <label style={modalStyles.field}>
          <span>Jacket (image)</span>
          <input style={modalStyles.input} type="file" accept="image/*" onChange={(e) => setJacketFile(e.target.files?.[0] ?? null)} />
        </label>

        {decodingAudio && (
          <div style={{ fontSize: '13px', color: '#888', marginBottom: '12px' }}>
            오디오 디코딩 중...
          </div>
        )}

        {audioBuffer && !decodingAudio && (
          <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '12px' }}>
            Length: {Math.floor(audioBuffer.duration / 60)}:{String(Math.floor(audioBuffer.duration % 60)).padStart(2, '0')}
          </div>
        )}

        {audioBuffer && (
          <div style={{ marginBottom: '12px' }}>
            <PreviewRangeSelector audioBuffer={audioBuffer} onChange={setPreviewRange} />
          </div>
        )}

        <div style={modalStyles.buttons}>
          <button
            style={{ ...modalStyles.saveBtn, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
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
            <select style={modalStyles.input} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              {available.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          ) : (
            <span style={{ color: '#888', fontSize: '13px' }}>All difficulties taken</span>
          )}
        </label>

        <label style={modalStyles.field}>
          <span>Level (1~15)</span>
          <input style={modalStyles.input} type="number" min="1" max="15" value={level} onChange={(e) => setLevel(e.target.value)} />
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
// SongSelectScreen (unified)
// ---------------------------------------------------------------------------

export function SongSelectScreen() {
  const { selectSong, setScreen } = useGameStore();
  const { user, isAdmin, loading: authLoading, signInWithGoogle, signOut } = useAuth();

  const [songs, setSongs] = useState<DbSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const toastIdRef = useRef(0);

  // Admin-only state
  const [showAddSong, setShowAddSong] = useState(false);
  const [newChartTarget, setNewChartTarget] = useState<DbSong | null>(null);

  // Keyboard navigation state
  const [focusedSongIndex, setFocusedSongIndex] = useState(0);
  const [focusedChartIndex, setFocusedChartIndex] = useState(0);
  const songListRef = useRef<HTMLDivElement>(null);
  const songCardRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const addToast = useCallback((msg: string, _type?: 'info' | 'error') => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message: msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  // Fetch songs
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
    const allSongs = (data ?? []) as DbSong[];
    setSongs(isAdmin ? allSongs : allSongs.filter((s) => s.charts.length > 0));
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => { fetchSongs(); }, [fetchSongs]);

  // Play: select chart and go to loading screen
  const handlePlay = useCallback((songId: string, difficulty: string, audioUrl: string) => {
    selectSong(songId, difficulty, audioUrl);
    setScreen('loading');
  }, [selectSong, setScreen]);

  // Edit: navigate to /editor with URL params
  const handleEdit = useCallback((songId: string, difficulty: string) => {
    window.location.href = `/editor?songId=${encodeURIComponent(songId)}&difficulty=${encodeURIComponent(difficulty)}`;
  }, []);

  // New Chart (admin): create empty chart and navigate to editor
  const handleNewChart = useCallback((song: DbSong, difficulty: string, level: number) => {
    // Upload empty chart to storage first, then navigate
    const chartData = createEmptyChart(song, difficulty, level);
    const json = serializeChart(chartData);
    const path = songChartPath(song.id, difficulty);
    const blob = new Blob([json], { type: 'application/json' });

    supabase.storage.from(STORAGE_BUCKET).upload(path, blob, { upsert: true }).then(({ error: uploadErr }) => {
      if (uploadErr) {
        addToast(`Upload failed: ${uploadErr.message}`, 'error');
        setNewChartTarget(null);
        return;
      }
      // Insert charts row
      supabase.from('charts').upsert({
        song_id: song.id,
        difficulty_label: difficulty,
        difficulty_level: level,
        offset_ms: 0,
      }, { onConflict: 'song_id,difficulty_label' }).then(({ error: dbErr }) => {
        if (dbErr) {
          addToast(`DB save failed: ${dbErr.message}`, 'error');
          setNewChartTarget(null);
          return;
        }
        setNewChartTarget(null);
        window.location.href = `/editor?songId=${encodeURIComponent(song.id)}&difficulty=${encodeURIComponent(difficulty)}`;
      });
    });
  }, [addToast]);

  // Sorted charts helper
  const getSortedCharts = useCallback((song: DbSong) => {
    return [...song.charts].sort((a, b) => a.difficulty_level - b.difficulty_level);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle keys when modals are open or no songs
      if (showAddSong || newChartTarget) return;
      if (songs.length === 0 && e.key !== 'Escape') return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedSongIndex((prev) => {
          const next = Math.max(0, prev - 1);
          songCardRefs.current.get(next)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          return next;
        });
        setFocusedChartIndex(0);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedSongIndex((prev) => {
          const next = Math.min(songs.length - 1, prev + 1);
          songCardRefs.current.get(next)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          return next;
        });
        setFocusedChartIndex(0);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setFocusedChartIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const song = songs[focusedSongIndex];
        if (song) {
          const maxIdx = getSortedCharts(song).length - 1;
          setFocusedChartIndex((prev) => Math.min(maxIdx, prev + 1));
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const song = songs[focusedSongIndex];
        if (song) {
          const sorted = getSortedCharts(song);
          const chart = sorted[focusedChartIndex];
          if (chart) {
            handlePlay(song.id, chart.difficulty_label, song.audio_url);
          }
        }
      } else if (e.key === 'Escape') {
        setScreen('title');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [songs, focusedSongIndex, focusedChartIndex, showAddSong, newChartTarget, handlePlay, setScreen, getSortedCharts]);

  // Clamp focused indices when songs change
  useEffect(() => {
    if (songs.length > 0) {
      setFocusedSongIndex((prev) => Math.min(prev, songs.length - 1));
    }
  }, [songs]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Song Select</h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Admin-only buttons */}
          {isAdmin && (
            <>
              <button style={styles.addSongBtn} onClick={() => setShowAddSong(true)}>
                + Add Song
              </button>
            </>
          )}
          <button style={styles.refreshBtn} onClick={fetchSongs} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button style={styles.settingsBtn} onClick={() => setScreen('settings')}>
            Settings
          </button>

          {/* Auth */}
          {!authLoading && (
            user ? (
              <>
                <span style={{ fontSize: '12px', color: '#888' }}>{user.email}</span>
                <button style={styles.backBtn} onClick={signOut}>Logout</button>
              </>
            ) : (
              <button style={styles.refreshBtn} onClick={() => signInWithGoogle().catch(() => {})}>Login</button>
            )
          )}

          <button style={styles.backBtn} onClick={() => setScreen('title')}>
            Back
          </button>
        </div>
      </div>

      <div ref={songListRef} style={styles.songList}>
        {loading && songs.length === 0 && (
          <div style={styles.empty}>Loading songs...</div>
        )}

        {!loading && error && (
          <div style={styles.empty}>{error}</div>
        )}

        {!loading && !error && songs.length === 0 && (
          <div style={styles.empty}>No songs found.</div>
        )}

        {songs.map((song, songIdx) => {
          const isFocused = songIdx === focusedSongIndex;
          const sortedCharts = getSortedCharts(song);

          return (
            <div
              key={song.id}
              ref={(el) => { if (el) songCardRefs.current.set(songIdx, el); else songCardRefs.current.delete(songIdx); }}
              style={{
                ...styles.songCard,
                ...(isFocused ? styles.songCardFocused : {}),
              }}
              onClick={() => { setFocusedSongIndex(songIdx); setFocusedChartIndex(0); }}
            >
              <div style={styles.songInfo}>
                <span style={styles.songTitle}>{song.title}</span>
                <span style={styles.songArtist}>{song.artist}</span>
              </div>
              <div style={styles.chartTags}>
                {sortedCharts.map((chart, chartIdx) => {
                  const isChartFocused = isFocused && chartIdx === focusedChartIndex;
                  return (
                    <span
                      key={chart.id}
                      style={{
                        ...styles.chartTag,
                        ...getDifficultyColor(chart.difficulty_label),
                        ...(isChartFocused ? styles.chartTagFocused : {}),
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setFocusedSongIndex(songIdx);
                        setFocusedChartIndex(chartIdx);
                      }}
                    >
                      {chart.difficulty_label.toUpperCase()} Lv.{chart.difficulty_level}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom action panel */}
      {songs.length > 0 && (() => {
        const focusedSong = songs[focusedSongIndex];
        const sortedCharts = focusedSong ? getSortedCharts(focusedSong) : [];
        const focusedChart = sortedCharts[focusedChartIndex] ?? null;

        return (
          <div style={styles.bottomPanel}>
            <div style={styles.bottomPanelInfo}>
              <span style={styles.bottomPanelTitle}>{focusedSong?.title ?? ''}</span>
              <span style={styles.bottomPanelArtist}>{focusedSong?.artist ?? ''}</span>
              {focusedChart && (
                <span
                  style={{
                    ...styles.bottomPanelDifficulty,
                    ...getDifficultyColor(focusedChart.difficulty_label),
                  }}
                >
                  {focusedChart.difficulty_label.toUpperCase()} Lv.{focusedChart.difficulty_level}
                </span>
              )}
            </div>
            <div style={styles.bottomPanelActions}>
              <button
                style={{
                  ...styles.playBtn,
                  ...(focusedChart ? {} : { opacity: 0.4, cursor: 'not-allowed' }),
                }}
                disabled={!focusedChart}
                onClick={() => {
                  if (focusedSong && focusedChart) {
                    handlePlay(focusedSong.id, focusedChart.difficulty_label, focusedSong.audio_url);
                  }
                }}
              >
                Play
              </button>
              {isAdmin && focusedChart && (
                <button
                  style={styles.bottomEditBtn}
                  onClick={() => {
                    if (focusedSong && focusedChart) {
                      handleEdit(focusedSong.id, focusedChart.difficulty_label);
                    }
                  }}
                >
                  Edit
                </button>
              )}
              {isAdmin && focusedSong && (
                <button
                  style={styles.bottomNewChartBtn}
                  onClick={() => setNewChartTarget(focusedSong)}
                >
                  + New Chart
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Add song modal (admin) */}
      {showAddSong && (
        <AddSongModal
          addToast={addToast}
          onDone={() => { setShowAddSong(false); fetchSongs(); }}
          onClose={() => setShowAddSong(false)}
        />
      )}

      {/* New chart difficulty modal (admin) */}
      {newChartTarget && (
        <DifficultyModal
          existingDifficulties={newChartTarget.charts.map((c) => c.difficulty_label)}
          onSelect={(diff, lv) => handleNewChart(newChartTarget, diff, lv)}
          onClose={() => setNewChartTarget(null)}
        />
      )}

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div style={styles.toastContainer}>
          {toasts.map((toast) => (
            <div key={toast.id} style={styles.toast}>
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: '#1a1a1a',
    color: '#e0e0e0',
    fontFamily: 'system-ui, sans-serif',
    position: 'relative',
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
    paddingBottom: '100px',
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
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#333',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'border-color 0.15s',
  },
  songCardFocused: {
    borderColor: '#00ffff',
    boxShadow: '0 0 0 1px #00ffff44',
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
  chartTags: {
    display: 'flex',
    gap: '6px',
    flexShrink: 0,
    marginLeft: '16px',
    alignItems: 'center',
  },
  chartTag: {
    padding: '3px 10px',
    color: '#fff',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#555',
    borderRadius: '12px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 500,
    transition: 'box-shadow 0.15s',
    userSelect: 'none',
  },
  chartTagFocused: {
    boxShadow: '0 0 0 2px #00ffff',
  },
  bottomPanel: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 24px',
    backgroundColor: '#222',
    borderTop: '1px solid #444',
    zIndex: 1000,
    gap: '16px',
  },
  bottomPanelInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: 0,
    flex: 1,
  },
  bottomPanelTitle: {
    fontSize: '15px',
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  bottomPanelArtist: {
    fontSize: '13px',
    color: '#999',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  bottomPanelDifficulty: {
    padding: '2px 10px',
    color: '#fff',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: 500,
    flexShrink: 0,
  },
  bottomPanelActions: {
    display: 'flex',
    gap: '8px',
    flexShrink: 0,
    alignItems: 'center',
  },
  playBtn: {
    padding: '8px 28px',
    backgroundColor: '#22aa44',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: 600,
  },
  bottomEditBtn: {
    padding: '8px 20px',
    backgroundColor: 'transparent',
    color: '#4488ff',
    border: '1px solid #4488ff66',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
  },
  bottomNewChartBtn: {
    padding: '8px 16px',
    backgroundColor: 'transparent',
    color: '#888',
    border: '1px dashed #555',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
  },
  toastContainer: {
    position: 'fixed',
    bottom: '80px',
    right: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    zIndex: 3000,
    pointerEvents: 'none',
  },
  toast: {
    padding: '8px 16px',
    backgroundColor: 'rgba(180, 80, 0, 0.9)',
    color: '#fff',
    borderRadius: '6px',
    fontSize: '13px',
    whiteSpace: 'nowrap',
    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
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
