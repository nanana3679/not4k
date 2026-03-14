import { useState, useCallback, useRef } from 'react';
import { useGameStore } from '../stores';
import { useAuth } from '../../shared/hooks/useAuth';
import { supabase } from '../../supabase';
import {
  STORAGE_BUCKET,
  songChartPath,
  songJacketPath,
  serializeChart,
} from '../../shared';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import type { DbSong } from './songSelect/types';
import { getDifficultyColor, createEmptyChart, getCircularDistance } from './songSelect/helpers';
import { styles } from './songSelect/styles';
import { modalStyles } from './songSelect/modalStyles';
import { AddSongModal } from './songSelect/AddSongModal';
import { DifficultyModal } from './songSelect/DifficultyModal';
import { usePreviewAudio } from '../hooks/usePreviewAudio';
import { useSongNavigation } from '../hooks/useSongNavigation';

// ---------------------------------------------------------------------------
// SongSelectScreen (unified)
// ---------------------------------------------------------------------------

export function SongSelectScreen() {
  const { selectSong, setScreen } = useGameStore();
  const { user, isAdmin, loading: authLoading, signInWithGoogle, signOut } = useAuth();

  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const toastIdRef = useRef(0);

  // Admin-only state
  const [showAddSong, setShowAddSong] = useState(false);
  const [newChartTarget, setNewChartTarget] = useState<DbSong | null>(null);
  const [deleteSongTarget, setDeleteSongTarget] = useState<DbSong | null>(null);
  const [deleting, setDeleting] = useState(false);

  const addToast = useCallback((msg: string, _type?: 'info' | 'error') => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message: msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  // stopPreview를 ref로 감싸 handlePlay → useSongNavigation → usePreviewAudio 순서 문제 해결
  const stopPreviewRef = useRef<() => void>(() => {});

  // Play: stop preview, select chart and go to loading screen
  const handlePlay = useCallback((songId: string, difficulty: string, audioUrl: string) => {
    stopPreviewRef.current();
    selectSong(songId, difficulty, audioUrl);
    setScreen('loading');
  }, [selectSong, setScreen]);

  const {
    songs,
    loading,
    error,
    focusedSongIndex,
    focusedChartIndex,
    setFocusedSongIndex,
    setFocusedChartIndex,
    fetchSongs,
    songListRef,
    songCardRefs,
    getSortedCharts,
  } = useSongNavigation({
    isAdmin,
    showAddSong,
    newChartTarget,
    onPlay: handlePlay,
    onEscape: () => setScreen('title'),
  });

  const { stopPreview } = usePreviewAudio(songs, focusedSongIndex);
  // ref를 최신 stopPreview로 동기화
  stopPreviewRef.current = stopPreview;

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
      setDeleteSongTarget(null);
      fetchSongs();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      addToast(message, 'error');
    } finally {
      setDeleting(false);
    }
  }, [addToast, fetchSongs]);

  const focusedSong = songs[focusedSongIndex] ?? null;
  const focusedSortedCharts = focusedSong ? getSortedCharts(focusedSong) : [];
  const focusedChart = focusedSortedCharts[focusedChartIndex] ?? null;
  const focusedJacketUrl = focusedSong
    ? supabase.storage.from(STORAGE_BUCKET).getPublicUrl(focusedSong.jacket_url || songJacketPath(focusedSong.id)).data.publicUrl
    : null;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Song Select</h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isAdmin && (
            <button style={styles.addSongBtn} onClick={() => setShowAddSong(true)}>
              + Add Song
            </button>
          )}
          <button style={styles.refreshBtn} onClick={() => fetchSongs()} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button style={styles.settingsBtn} onClick={() => setScreen('settings')}>
            Settings
          </button>
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

      <div style={styles.splitContainer}>
        {/* Left panel — song detail */}
        <div style={styles.leftPanel}>
          {focusedSong ? (
            <>
              {/* Jacket image */}
              <div style={styles.jacketContainer}>
                <img
                  key={focusedSong.id}
                  src={focusedJacketUrl!}
                  alt=""
                  style={styles.jacketImage}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  onLoad={(e) => { (e.target as HTMLImageElement).style.display = 'block'; }}
                />
              </div>

              {/* Song info */}
              <div style={styles.detailInfo}>
                <span style={styles.detailTitle}>{focusedSong.title}</span>
                <span style={styles.detailArtist}>{focusedSong.artist}</span>
                {focusedSong.duration != null && (
                  <span style={styles.detailDuration}>
                    {Math.floor(focusedSong.duration / 60)}:{String(Math.floor(focusedSong.duration % 60)).padStart(2, '0')}
                  </span>
                )}
              </div>

              {/* Difficulty tags */}
              <div style={styles.detailChartTags}>
                {focusedSortedCharts.map((chart, chartIdx) => {
                  const isChartFocused = chartIdx === focusedChartIndex;
                  return (
                    <span
                      key={chart.id}
                      style={{
                        ...styles.chartTag,
                        ...getDifficultyColor(chart.difficulty_label),
                        ...(isChartFocused ? styles.chartTagFocused : {}),
                      }}
                      onClick={() => setFocusedChartIndex(chartIdx)}
                    >
                      {chart.difficulty_label.toUpperCase()} Lv.{chart.difficulty_level}
                    </span>
                  );
                })}
              </div>

              {/* Action buttons */}
              <div style={styles.detailActions}>
                <button
                  style={{
                    ...styles.playBtn,
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
                    style={{ ...styles.bottomEditBtn, width: '100%' }}
                    onClick={() => handleEdit(focusedSong.id, focusedChart.difficulty_label)}
                  >
                    Edit
                  </button>
                )}
                {isAdmin && (
                  <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                    <button
                      style={{ ...styles.bottomNewChartBtn, flex: 1 }}
                      onClick={() => setNewChartTarget(focusedSong)}
                    >
                      + Chart
                    </button>
                    <button
                      style={{ ...styles.bottomDeleteBtn, flex: 1 }}
                      onClick={() => setDeleteSongTarget(focusedSong)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ color: '#666', fontSize: '13px', textAlign: 'center', marginTop: '40px' }}>
              곡을 선택하세요
            </div>
          )}
        </div>

        {/* Right panel — song list */}
        <div ref={songListRef} style={styles.songList}>
          {loading && songs.length === 0 && (
            <LoadingSpinner mode="inline" message="Loading songs..." />
          )}

          {!loading && error && (
            <div style={styles.empty}>{error}</div>
          )}

          {!loading && !error && songs.length === 0 && (
            <div style={styles.empty}>No songs found.</div>
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
                style={{
                  ...styles.songCard,
                  ...(isFocused ? styles.songCardFocused : {}),
                  opacity: cardOpacity,
                  transform: `scale(${cardScale})`,
                }}
                onClick={() => { setFocusedSongIndex(songIdx); setFocusedChartIndex(0); }}
              >
                <div style={styles.songInfo}>
                  <span style={styles.songTitle}>{song.title}</span>
                  <span style={styles.songArtist}>
                    {song.artist}
                    {song.duration != null && (
                      <span style={styles.songDuration}>
                        {' '}· {Math.floor(song.duration / 60)}:{String(Math.floor(song.duration % 60)).padStart(2, '0')}
                      </span>
                    )}
                  </span>
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
        <div style={modalStyles.overlay} onMouseDown={deleting ? undefined : () => setDeleteSongTarget(null)}>
          <div style={modalStyles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={modalStyles.title}>Delete Song</h3>
            <p style={{ fontSize: '14px', margin: '0 0 8px', color: '#e0e0e0' }}>
              <strong>{deleteSongTarget.title}</strong> — {deleteSongTarget.artist}
            </p>
            <p style={{ fontSize: '13px', margin: '0 0 16px', color: '#f88' }}>
              곡과 모든 차트가 영구 삭제됩니다. 되돌릴 수 없습니다.
            </p>
            <div style={modalStyles.buttons}>
              <button
                style={{ ...modalStyles.saveBtn, backgroundColor: '#cc3333', opacity: deleting ? 0.5 : 1 }}
                disabled={deleting}
                onClick={() => handleDeleteSong(deleteSongTarget)}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
              <button style={modalStyles.cancelBtn} onClick={() => setDeleteSongTarget(null)} disabled={deleting}>Cancel</button>
            </div>
          </div>
        </div>
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

