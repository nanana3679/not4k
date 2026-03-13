import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useGameStore } from '../stores';
import { useAuth } from '../../shared/hooks/useAuth';
import { supabase } from '../../supabase';
import {
  STORAGE_BUCKET,
  songChartPath,
  songAudioPath,
  songJacketPath,
  songPreviewPath,
  encodeWavBlob,
  beat,
  serializeChart,
} from '../../shared';
import type { Chart } from '../../shared';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import { PreviewRangeSelector } from '../../editor/components/PreviewRangeSelector';
import type { PreviewRangeState } from '../../editor/components/PreviewRangeSelector';
import css from './SongSelectScreen.module.css';
import arcCss from '../styles/arcade.module.css';


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
  duration: number | null;
  preview_start: number | null;
  preview_end: number | null;
  preview_url: string | null;
  jacket_url: string | null;
  charts: DbChart[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDifficultyColor(difficulty: string): React.CSSProperties {
  switch (difficulty.toLowerCase()) {
    case 'easy': return { backgroundColor: 'var(--arc-diff-easy-bg)', borderColor: 'var(--arc-diff-easy-border)' };
    case 'normal': return { backgroundColor: 'var(--arc-diff-normal-bg)', borderColor: 'var(--arc-diff-normal-border)' };
    case 'hard': return { backgroundColor: 'var(--arc-diff-hard-bg)', borderColor: 'var(--arc-diff-hard-border)' };
    case 'expert': return { backgroundColor: 'var(--arc-diff-expert-bg)', borderColor: 'var(--arc-diff-expert-border)' };
    default: return { backgroundColor: 'var(--arc-surface-alt)', borderColor: 'var(--arc-border-light)' };
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

function getCircularDistance(a: number, b: number, total: number): number {
  if (total === 0) return 0;
  const d = Math.abs(a - b);
  return Math.min(d, total - d);
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
      if (audioBuffer) {
        row.duration = audioBuffer.duration;
      }
      if (previewRange) {
        row.preview_start = previewRange.startTime;
        row.preview_end = previewRange.endTime;
      }

      // Generate and upload preview WAV if preview range is set and audioBuffer exists
      if (previewRange && audioBuffer) {
        const wavBlob = encodeWavBlob(audioBuffer, previewRange.startTime, previewRange.endTime);
        const previewPath = songPreviewPath(songId);
        const { error: previewUploadErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(previewPath, wavBlob, { upsert: true });
        if (previewUploadErr) throw new Error(`Preview upload failed: ${previewUploadErr.message}`);
        row.preview_url = previewPath;
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
    <div className={arcCss.modalOverlay} onMouseDown={submitting ? undefined : onClose}>
      <div className={arcCss.modal} style={{ minWidth: '340px', width: '500px', maxWidth: '90vw' }} onMouseDown={(e) => e.stopPropagation()}>
        <h3 className={arcCss.modalTitle}>New Song</h3>

        <label className={arcCss.modalField}>
          <span>Title *</span>
          <input className={arcCss.modalInput} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Song title" />
        </label>

        <label className={arcCss.modalField}>
          <span>Artist *</span>
          <input className={arcCss.modalInput} value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist name" />
        </label>

        <label className={arcCss.modalField}>
          <span>Audio * (ogg/mp3)</span>
          <input className={arcCss.modalInput} type="file" accept=".ogg,.mp3,audio/ogg,audio/mpeg" onChange={(e) => handleAudioChange(e.target.files?.[0] ?? null)} />
        </label>

        <label className={arcCss.modalField}>
          <span>Jacket (image)</span>
          <input className={arcCss.modalInput} type="file" accept="image/*" onChange={(e) => setJacketFile(e.target.files?.[0] ?? null)} />
        </label>

        {decodingAudio && (
          <div style={{ fontSize: '13px', color: 'var(--arc-text-muted)', marginBottom: '12px', fontFamily: 'var(--arc-font)' }}>
            오디오 디코딩 중...
          </div>
        )}

        {audioBuffer && !decodingAudio && (
          <div style={{ fontSize: '13px', color: 'var(--arc-text-dim)', marginBottom: '12px', fontFamily: 'var(--arc-font)' }}>
            Length: {Math.floor(audioBuffer.duration / 60)}:{String(Math.floor(audioBuffer.duration % 60)).padStart(2, '0')}
          </div>
        )}

        {audioBuffer && (
          <div style={{ marginBottom: '12px' }}>
            <PreviewRangeSelector audioBuffer={audioBuffer} onChange={setPreviewRange} />
          </div>
        )}

        <div className={arcCss.modalButtons}>
          <button
            className={arcCss.btnPrimary}
            style={{ opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {submitting ? 'Uploading...' : 'Add Song'}
          </button>
          <button className={arcCss.btnGhost} onClick={onClose} disabled={submitting} style={{ marginLeft: 'auto' }}>Cancel</button>
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
    <div className={arcCss.modalOverlay} onMouseDown={onClose}>
      <div className={arcCss.modal} onMouseDown={(e) => e.stopPropagation()}>
        <h3 className={arcCss.modalTitle}>New Chart</h3>

        <label className={arcCss.modalField}>
          <span>Difficulty</span>
          {available.length > 0 ? (
            <select className={arcCss.modalInput} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              {available.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          ) : (
            <span style={{ color: 'var(--arc-text-muted)', fontSize: '13px' }}>All difficulties taken</span>
          )}
        </label>

        <label className={arcCss.modalField}>
          <span>Level (1~15)</span>
          <input className={arcCss.modalInput} type="number" min="1" max="15" value={level} onChange={(e) => setLevel(e.target.value)} />
        </label>

        <div className={arcCss.modalButtons}>
          <button
            className={arcCss.btnPrimary}
            disabled={!difficulty}
            onClick={() => {
              const lv = parseInt(level);
              onSelect(difficulty.toLowerCase(), isNaN(lv) ? 1 : Math.max(1, Math.min(15, lv)));
            }}
          >
            Create
          </button>
          <button className={arcCss.btnGhost} onClick={onClose} style={{ marginLeft: 'auto' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SongSelectScreen (unified)
// ---------------------------------------------------------------------------

export function SongSelectScreen() {
  const { selectSong, setScreen, selectedSongId, selectedDifficulty } = useGameStore();
  const { user, isAdmin, loading: authLoading, signInWithGoogle, signOut } = useAuth();

  const [songs, setSongs] = useState<DbSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const toastIdRef = useRef(0);

  // Admin-only state
  const [showAddSong, setShowAddSong] = useState(false);
  const [newChartTarget, setNewChartTarget] = useState<DbSong | null>(null);
  const [deleteSongTarget, setDeleteSongTarget] = useState<DbSong | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Keyboard navigation state
  const [focusedSongIndex, setFocusedSongIndex] = useState(0);
  const [focusedChartIndex, setFocusedChartIndex] = useState(0);
  const songListRef = useRef<HTMLDivElement>(null);
  const songCardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const wheelCooldownRef = useRef(0);

  // Track whether last-played song focus has been restored
  const restoredRef = useRef(false);

  // Preview audio playback
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const addToast = useCallback((msg: string, _type?: 'info' | 'error') => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message: msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  // Fetch songs
  const fetchSongs = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    const query = supabase
      .from('songs')
      .select('*, charts(*)')
      .order('title');
    if (signal) query.abortSignal(signal);
    const { data, error: err } = await query;

    if (signal?.aborted) return;
    if (err) {
      setError(`Failed to load songs: ${err.message}`);
      setLoading(false);
      return;
    }
    const allSongs = (data ?? []) as DbSong[];
    setSongs(isAdmin ? allSongs : allSongs.filter((s) => s.charts.length > 0));
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => {
    const ac = new AbortController();
    fetchSongs(ac.signal);
    return () => ac.abort();
  }, [fetchSongs]);

  // Circular song navigation (with cooldown to let animation play)
  const NAV_COOLDOWN = 100; // ms
  const navigateSong = useCallback((direction: 1 | -1) => {
    if (songs.length === 0) return;
    const now = Date.now();
    if (now - wheelCooldownRef.current < NAV_COOLDOWN) return;
    wheelCooldownRef.current = now;
    setFocusedSongIndex((prev) => (prev + direction + songs.length) % songs.length);
    setFocusedChartIndex(0);
  }, [songs.length]);

  // Mouse wheel → change song selection (non-passive for preventDefault)
  useEffect(() => {
    const el = songListRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY > 0) navigateSong(1);
      else if (e.deltaY < 0) navigateSong(-1);
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [navigateSong]);

  // Scroll focused song card to center
  useEffect(() => {
    const el = songCardRefs.current.get(focusedSongIndex);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusedSongIndex]);

  // Preview audio: play focused song's preview in loop with fade-in/out
  useEffect(() => {
    const song = songs[focusedSongIndex];
    const audio = previewAudioRef.current;
    const BASE_VOL = 0.4;
    const FADE = 0.5; // seconds

    // Stop previous
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      previewAudioRef.current = null;
    }

    if (!song) return;

    // If a dedicated preview file exists, play it in loop
    if (song.preview_url) {
      const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(song.preview_url);
      const el = new Audio(data.publicUrl);
      previewAudioRef.current = el;
      el.volume = 0;
      el.loop = true;

      const onTimeUpdate = () => {
        const dur = el.duration;
        if (!isFinite(dur)) return;
        const t = el.currentTime;
        if (t < FADE) el.volume = BASE_VOL * (t / FADE);
        else if (t > dur - FADE) el.volume = BASE_VOL * ((dur - t) / FADE);
        else el.volume = BASE_VOL;
      };

      el.addEventListener('loadeddata', () => el.play().catch(() => {}));
      el.addEventListener('timeupdate', onTimeUpdate);

      return () => {
        el.removeEventListener('timeupdate', onTimeUpdate);
        el.pause();
        el.removeAttribute('src');
        el.load();
        previewAudioRef.current = null;
      };
    }

    // Fallback: load full audio and loop preview_start~preview_end range
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(song.audio_url);
    const el = new Audio(data.publicUrl);
    previewAudioRef.current = el;
    el.volume = 0;

    const start = song.preview_start ?? 0;
    const end = song.preview_end ?? (song.duration ?? 30);
    const rangeDur = end - start;

    const onLoaded = () => {
      el.currentTime = start;
      el.play().catch(() => {});
    };

    const onTimeUpdate = () => {
      if (el.currentTime >= end) {
        el.currentTime = start;
        el.volume = 0;
        return;
      }
      const pos = el.currentTime - start;
      if (pos < FADE) el.volume = BASE_VOL * (pos / FADE);
      else if (pos > rangeDur - FADE) el.volume = BASE_VOL * ((rangeDur - pos) / FADE);
      else el.volume = BASE_VOL;
    };

    el.addEventListener('loadeddata', onLoaded);
    el.addEventListener('timeupdate', onTimeUpdate);

    return () => {
      el.removeEventListener('loadeddata', onLoaded);
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.pause();
      el.removeAttribute('src');
      el.load();
      previewAudioRef.current = null;
    };
  }, [songs, focusedSongIndex]);

  // Play: stop preview, select chart and go to loading screen
  const handlePlay = useCallback((songId: string, difficulty: string, audioUrl: string) => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
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

  // Delete song (admin)
  const handleDeleteSong = useCallback(async (song: DbSong) => {
    setDeleting(true);
    try {
      // 1. Delete chart rows from DB
      if (song.charts.length > 0) {
        const { error: chartErr } = await supabase
          .from('charts')
          .delete()
          .eq('song_id', song.id);
        if (chartErr) throw new Error(`Chart DB delete failed: ${chartErr.message}`);
      }

      // 2. Delete all files under songs/{songId}/ in storage
      const { data: files } = await supabase.storage
        .from(STORAGE_BUCKET)
        .list(`songs/${song.id}`);
      if (files && files.length > 0) {
        const paths = files.map((f) => `songs/${song.id}/${f.name}`);
        const { error: storageErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .remove(paths);
        if (storageErr) throw new Error(`Storage delete failed: ${storageErr.message}`);
      }

      // 3. Delete song row from DB
      const { error: songErr } = await supabase
        .from('songs')
        .delete()
        .eq('id', song.id);
      if (songErr) throw new Error(`Song DB delete failed: ${songErr.message}`);

      addToast(`"${song.title}" 삭제 완료`, 'info');
      setSongs((prev) => prev.filter((s) => s.id !== song.id));
      setDeleteSongTarget(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      addToast(message, 'error');
    } finally {
      setDeleting(false);
    }
  }, [addToast, fetchSongs]);

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
        navigateSong(-1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigateSong(1);
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
  }, [songs, focusedSongIndex, focusedChartIndex, showAddSong, newChartTarget, handlePlay, setScreen, getSortedCharts, navigateSong]);

  // Restore focus to last-played song on first load, or clamp indices
  useEffect(() => {
    if (songs.length === 0) return;

    if (!restoredRef.current && selectedSongId) {
      restoredRef.current = true;
      const songIdx = songs.findIndex((s) => s.id === selectedSongId);
      if (songIdx >= 0) {
        setFocusedSongIndex(songIdx);
        // Also restore difficulty selection if available
        if (selectedDifficulty) {
          const sorted = getSortedCharts(songs[songIdx]);
          const chartIdx = sorted.findIndex(
            (c) => c.difficulty_label === selectedDifficulty,
          );
          if (chartIdx >= 0) {
            setFocusedChartIndex(chartIdx);
          }
        }
        return;
      }
    }

    restoredRef.current = true;
    setFocusedSongIndex((prev) => Math.min(prev, songs.length - 1));
  }, [songs, selectedSongId, selectedDifficulty, getSortedCharts]);

  const focusedSong = songs[focusedSongIndex] ?? null;
  const focusedSortedCharts = focusedSong ? getSortedCharts(focusedSong) : [];
  const focusedChart = focusedSortedCharts[focusedChartIndex] ?? null;
  const focusedJacketUrl = focusedSong
    ? supabase.storage.from(STORAGE_BUCKET).getPublicUrl(focusedSong.jacket_url || songJacketPath(focusedSong.id)).data.publicUrl
    : null;

  return (
    <div className={css.container}>
      <div className={css.header}>
        <h1 className={css.headerTitle}>Song Select</h1>
        <div className={css.headerActions}>
          {isAdmin && (
            <button className={css.addSongBtn} onClick={() => setShowAddSong(true)}>
              + Add Song
            </button>
          )}
          <button className={arcCss.btn} onClick={() => fetchSongs()} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button className={arcCss.btn} onClick={() => setScreen('settings')}>
            Settings
          </button>
          {!authLoading && (
            user ? (
              <>
                <span className={css.headerEmail}>{user.email}</span>
                <button className={arcCss.btnGhost} onClick={signOut}>Logout</button>
              </>
            ) : (
              <button className={arcCss.btn} onClick={() => signInWithGoogle().catch(() => {})}>Login</button>
            )
          )}
          <button className={arcCss.btnGhost} onClick={() => setScreen('title')}>
            Back
          </button>
        </div>
      </div>

      <div className={css.splitContainer}>
        {/* Left panel — song detail */}
        <div className={css.leftPanel}>
          {focusedSong ? (
            <>
              {/* Jacket image */}
              <div className={css.jacketContainer}>
                <img
                  key={focusedSong.id}
                  src={focusedJacketUrl!}
                  alt=""
                  className={css.jacketImage}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  onLoad={(e) => { (e.target as HTMLImageElement).style.display = 'block'; }}
                />
              </div>

              {/* Song info */}
              <div className={css.detailInfo}>
                <span className={css.detailTitle}>{focusedSong.title}</span>
                <span className={css.detailArtist}>{focusedSong.artist}</span>
                {focusedSong.duration != null && (
                  <span className={css.detailDuration}>
                    {Math.floor(focusedSong.duration / 60)}:{String(Math.floor(focusedSong.duration % 60)).padStart(2, '0')}
                  </span>
                )}
              </div>

              {/* Difficulty tags */}
              <div className={css.detailChartTags}>
                {focusedSortedCharts.map((chart, chartIdx) => {
                  const isChartFocused = chartIdx === focusedChartIndex;
                  return (
                    <span
                      key={chart.id}
                      className={`${css.chartTag} ${isChartFocused ? css.chartTagFocused : ''}`}
                      style={getDifficultyColor(chart.difficulty_label)}
                      onClick={() => setFocusedChartIndex(chartIdx)}
                    >
                      {chart.difficulty_label.toUpperCase()} Lv.{chart.difficulty_level}
                    </span>
                  );
                })}
              </div>

              {/* Action buttons */}
              <div className={css.detailActions}>
                <button
                  className={css.playBtn}
                  style={{
                    width: '100%',
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
                    className={css.editBtn}
                    style={{ width: '100%' }}
                    onClick={() => handleEdit(focusedSong.id, focusedChart.difficulty_label)}
                  >
                    Edit
                  </button>
                )}
                {isAdmin && (
                  <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                    <button
                      className={css.newChartBtn}
                      style={{ flex: 1 }}
                      onClick={() => setNewChartTarget(focusedSong)}
                    >
                      + Chart
                    </button>
                    <button
                      className={css.deleteBtn}
                      style={{ flex: 1 }}
                      onClick={() => setDeleteSongTarget(focusedSong)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className={css.emptyDetail}>
              곡을 선택하세요
            </div>
          )}
        </div>

        {/* Right panel — song list */}
        <div ref={songListRef} className={css.songList}>
          {loading && songs.length === 0 && (
            <LoadingSpinner mode="inline" message="Loading songs..." />
          )}

          {!loading && error && (
            <div className={css.empty}>{error}</div>
          )}

          {!loading && !error && songs.length === 0 && (
            <div className={css.empty}>No songs found.</div>
          )}

          {songs.map((song, songIdx) => {
            const isFocused = songIdx === focusedSongIndex;
            const dist = getCircularDistance(songIdx, focusedSongIndex, songs.length);
            const cardOpacity = isFocused ? 1 : Math.max(0.35, 1 - dist * 0.18);
            const cardScale = isFocused ? 1 : Math.max(0.92, 1 - dist * 0.02);
            const sortedCharts = getSortedCharts(song);

            return (
              <div
                key={song.id}
                ref={(el) => { if (el) songCardRefs.current.set(songIdx, el); else songCardRefs.current.delete(songIdx); }}
                className={`${css.songCard} ${isFocused ? css.songCardFocused : ''}`}
                style={{
                  opacity: cardOpacity,
                  transform: `scale(${cardScale})`,
                }}
                onClick={() => { setFocusedSongIndex(songIdx); setFocusedChartIndex(0); }}
              >
                <div className={css.songInfo}>
                  <span className={css.songTitle}>{song.title}</span>
                  <span className={css.songArtist}>
                    {song.artist}
                    {song.duration != null && (
                      <span className={css.songDuration}>
                        {' '}· {Math.floor(song.duration / 60)}:{String(Math.floor(song.duration % 60)).padStart(2, '0')}
                      </span>
                    )}
                  </span>
                </div>
                <div className={css.chartTags}>
                  {sortedCharts.map((chart, chartIdx) => {
                    const isChartFocused = isFocused && chartIdx === focusedChartIndex;
                    return (
                      <span
                        key={chart.id}
                        className={`${css.chartTag} ${isChartFocused ? css.chartTagFocused : ''}`}
                        style={getDifficultyColor(chart.difficulty_label)}
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
      </div>

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

      {/* Delete song confirm modal (admin) */}
      {deleteSongTarget && (
        <div className={arcCss.modalOverlay} onMouseDown={deleting ? undefined : () => setDeleteSongTarget(null)}>
          <div className={arcCss.modal} onMouseDown={(e) => e.stopPropagation()}>
            <h3 className={arcCss.modalTitle}>Delete Song</h3>
            <p style={{ fontSize: '14px', margin: '0 0 8px', color: 'var(--arc-text)', fontFamily: 'var(--arc-font)' }}>
              <strong>{deleteSongTarget.title}</strong> — {deleteSongTarget.artist}
            </p>
            <p style={{ fontSize: '13px', margin: '0 0 16px', color: 'var(--arc-red)', fontFamily: 'var(--arc-font)' }}>
              곡과 모든 차트가 영구 삭제됩니다. 되돌릴 수 없습니다.
            </p>
            <div className={arcCss.modalButtons}>
              <button
                className={arcCss.btnDanger}
                style={{ opacity: deleting ? 0.5 : 1 }}
                disabled={deleting}
                onClick={() => handleDeleteSong(deleteSongTarget)}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
              <button className={arcCss.btnGhost} onClick={() => setDeleteSongTarget(null)} disabled={deleting} style={{ marginLeft: 'auto' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className={arcCss.toastContainer}>
          {toasts.map((toast) => (
            <div key={toast.id} className={arcCss.toast}>
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
