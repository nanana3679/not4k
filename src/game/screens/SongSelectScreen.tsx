import { formatDifficultyLabel } from '../../shared/chartDifficulty';
import { useState, useCallback, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { useGameStore } from '../stores';
import { useAuth } from '../../shared/hooks/useAuth';
import { createChartAsset, deleteSongAsset, supabase } from '../../supabase';
import { SongHasChartsError } from '../../shared/songAssets';
import {
  STORAGE_BUCKET,
  songJacketPath,
} from '../../shared';
import { PageLoading } from '../../shared/components/LoadingSpinner';
import type { DbSong } from './songSelect/types';
import {
  getDifficultyColor,
  createEmptyChart,
  getCircularDistance,
  resolveGameplayRange,
  resolveSongCardFocus,
  type SelectedChartRef,
} from './songSelect/helpers';
import type { PlaybackRange } from '../../shared';
import { styles } from './songSelect/styles';
import { AddSongModal } from './songSelect/AddSongModal';
import { DeleteSongModal } from './songSelect/DeleteSongModal';
import { DifficultyModal } from './songSelect/DifficultyModal';
import { MobileSongCard } from './songSelect/MobileSongCard';
import { TutorialHelpModal } from './songSelect/TutorialHelpModal';
import { SettingsModal } from './settings/SettingsModal';
import { usePreviewAudio } from '../hooks/usePreviewAudio';
import { useSongNavigation } from '../hooks/useSongNavigation';
import {
  canAutoPreviewSongs,
  canPreviewSongs,
  canStartGameplay,
} from '../hooks/useGameExperience';
import { showToast, type ToastType } from '../../shared/toast';

// ---------------------------------------------------------------------------
// SongSelectScreen (unified)
// ---------------------------------------------------------------------------

interface SongSelectScreenProps {
  mobileListOnly?: boolean;
}

export function SongSelectScreen({ mobileListOnly = false }: SongSelectScreenProps) {
  const { selectSong, setScreen } = useGameStore();
  const settingsOpen = useGameStore((state) => state.settingsOpen);
  const setSettingsOpen = useGameStore((state) => state.setSettingsOpen);
  const calibrationActive = useGameStore((state) => state.calibrationActive);
  const { user, isAdmin, loading: authLoading, signInWithGoogle, signOut } = useAuth();
  const gameExperience = mobileListOnly ? 'mobileSongList' : 'fullGame';
  const playAllowed = canStartGameplay(gameExperience);
  const previewAllowed = canPreviewSongs(gameExperience);
  const previewAutoPlay = canAutoPreviewSongs(gameExperience);

  // Admin-only state
  const [showAddSong, setShowAddSong] = useState(false);
  const [newChartTarget, setNewChartTarget] = useState<DbSong | null>(null);
  const [deleteSongTarget, setDeleteSongTarget] = useState<DbSong | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [mobileEditSelection, setMobileEditSelection] = useState<SelectedChartRef | null>(null);
  const [showTutorialHelp, setShowTutorialHelp] = useState(false);

  const addToast = useCallback((msg: string, type: ToastType = 'info') => {
    showToast(msg, type);
  }, []);

  // stopPreview를 ref로 감싸 handlePlay → useSongNavigation → usePreviewAudio 순서 문제 해결
  const stopPreviewRef = useRef<() => void>(() => {});

  // Play: stop preview, select chart and go to loading screen
  const handlePlay = useCallback((songId: string, difficulty: string, audioUrl: string, playbackRange?: PlaybackRange | null) => {
    if (!playAllowed) return;
    stopPreviewRef.current();
    selectSong(songId, difficulty, audioUrl, playbackRange ?? null);
    setScreen('loading');
  }, [playAllowed, selectSong, setScreen]);

  // 곡 선택 위에 차단성 오버레이(설정·튜토리얼·곡 추가·곡 삭제 모달)가 떠 있는지. true면 곡 선택 키·휠 네비를 막는다.
  const blockingModalOpen = showAddSong || showTutorialHelp || settingsOpen || deleteSongTarget !== null;
  // 모달이 하나라도 떠 있으면(새 차트 모달 포함) 뒤의 헤더·곡 목록을 inert로 만들어 Tab 포커스·클릭이 닿지 않게 한다.
  // focus trap이 없는 모달(곡 추가 등)에서 Tab으로 뒤의 버튼에 닿으면 두 번째 모달을 겹쳐 열 수 있고, 그러면
  // Escape 한 번이 가려진 첫 모달을 닫는다. 모달은 renderOverlays()로 inert 밖에 렌더링하므로 열린 모달은 영향이 없다.
  const songSelectInert = blockingModalOpen || newChartTarget !== null;

  // inert가 되면 모달을 연 버튼이 포커스를 잃는다. inert를 켠 커밋에서 포커스된 요소를 기억했다가 모달이 닫혀
  // inert가 풀리면 되돌려, 키보드로 연 사용자가 Space로 다시 열 수 있게 한다. Chromium은 inert가 된 요소의 blur를
  // 다음 렌더링 갱신 뒤로 미루므로 이 layout effect에서는 아직 그 버튼에 포커스가 있다. 되돌리기는 커밋이 끝난 뒤
  // (microtask) 하고, 그 사이 버튼이 사라졌거나(곡 선택 화면을 떠난 경우 포함) 다른 요소가 포커스를 가져갔으면
  // (설정 모달이 스스로 되돌린 경우 등) 건너뛴다.
  useLayoutEffect(() => {
    if (!songSelectInert) return;
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || focused === document.body) return;
    return () => {
      queueMicrotask(() => {
        const current = document.activeElement;
        if (focused.isConnected && (current === null || current === document.body)) focused.focus();
      });
    };
  }, [songSelectInert]);

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
    blockingModalOpen,
    newChartTarget,
    onPlay: handlePlay,
    onEscape: mobileListOnly ? () => {} : () => setScreen('title'),
    allowPlay: playAllowed,
    centerFocusedCard: !mobileListOnly,
    enableWheelNavigation: !mobileListOnly,
  });

  const { stopPreview, playPreviewAt } = usePreviewAudio(songs, focusedSongIndex, {
    // 보정 중에는 프리뷰를 페이드아웃해 멈춘다(보정음과 겹치지 않게). 나가면 페이드인 재개.
    enabled: previewAllowed && !calibrationActive,
    autoPlay: previewAutoPlay,
  });
  // ref를 최신 stopPreview로 동기화
  stopPreviewRef.current = stopPreview;

  const handleSelectSongCard = useCallback((index: number, options?: { preview?: boolean }) => {
    const nextFocus = resolveSongCardFocus(
      { songIndex: focusedSongIndex, chartIndex: focusedChartIndex },
      index,
    );
    setFocusedSongIndex(nextFocus.songIndex);
    setFocusedChartIndex(nextFocus.chartIndex);
    if (nextFocus.songIndex !== focusedSongIndex) {
      setMobileEditSelection(null);
    }
    if (options?.preview) {
      playPreviewAt(index);
    }
  }, [focusedSongIndex, focusedChartIndex, playPreviewAt, setFocusedChartIndex, setFocusedSongIndex]);

  // Edit: navigate to /editor with URL params
  const handleEdit = useCallback((songId: string, difficulty: string) => {
    stopPreviewRef.current();
    window.location.href = `/editor?songId=${encodeURIComponent(songId)}&difficulty=${encodeURIComponent(difficulty)}`;
  }, []);

  // New Chart (admin): create empty chart and navigate to editor
  const handleNewChart = useCallback((song: DbSong, difficulty: string, level: number) => {
    const chartData = createEmptyChart(song, difficulty, level);
    createChartAsset({
      songId: song.id,
      difficulty,
      chart: chartData,
    }).then(() => {
      setNewChartTarget(null);
      window.location.href = `/editor?songId=${encodeURIComponent(song.id)}&difficulty=${encodeURIComponent(difficulty)}`;
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      addToast(`Chart create failed: ${message}`, 'error');
      setNewChartTarget(null);
    });
  }, [addToast]);

  // Delete song (admin) — 차트가 모두 삭제된 곡만 지울 수 있다 (DB FK restrict와 같은 규칙)
  const handleDeleteSong = useCallback(async (song: DbSong) => {
    setDeleting(true);
    try {
      await deleteSongAsset({ songId: song.id, chartCount: song.charts.length });
      addToast(`"${song.title}" 삭제 완료`, 'info');
      setDeleteSongTarget(null);
      fetchSongs();
    } catch (err: unknown) {
      console.error('SongSelect delete:', err);
      if (err instanceof SongHasChartsError) {
        addToast(err.message, 'error');
      } else {
        addToast('곡 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
      }
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
  const showSongListState = songs.length === 0;
  const isInitialSongLoading = loading && songs.length === 0;

  const renderTutorialHelpButton = (style: CSSProperties) => (
    <button
      type="button"
      style={style}
      aria-label="Open tutorial help"
      aria-haspopup="dialog"
      aria-expanded={showTutorialHelp}
      title="Tutorial"
      onClick={() => setShowTutorialHelp(true)}
    >
      ?
    </button>
  );

  const renderOverlays = () => (
    <>
      {showTutorialHelp && (
        <TutorialHelpModal isAdmin={isAdmin} onClose={() => setShowTutorialHelp(false)} />
      )}

      {showAddSong && (
        <AddSongModal
          addToast={addToast}
          onDone={() => { setShowAddSong(false); fetchSongs(); }}
          onClose={() => setShowAddSong(false)}
        />
      )}

      {newChartTarget && (
        <DifficultyModal
          existingDifficulties={newChartTarget.charts.map((c) => c.difficulty_label)}
          onSelect={(diff, lv) => handleNewChart(newChartTarget, diff, lv)}
          onClose={() => setNewChartTarget(null)}
        />
      )}

      {deleteSongTarget && (
        <DeleteSongModal
          song={deleteSongTarget}
          deleting={deleting}
          onConfirm={handleDeleteSong}
          onClose={() => setDeleteSongTarget(null)}
        />
      )}

      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} />
      )}
    </>
  );

  if (isInitialSongLoading) {
    return <PageLoading message="Loading songs..." />;
  }

  if (mobileListOnly) {
    return (
      <div style={styles.mobileContainer}>
        <div style={styles.mobileHeader} inert={songSelectInert}>
          <div style={styles.mobileHeaderTop}>
            <h1 style={styles.mobileTitle}>
              <span style={styles.mobileTitleAccent} aria-hidden="true" />
              Songs
            </h1>
            {!authLoading && user && (
              <span style={styles.mobileEmail}>{user.email}</span>
            )}
          </div>
          <div style={styles.mobileHeaderActions}>
            {renderTutorialHelpButton({
              ...styles.mobileActionButton,
              ...styles.mobileTutorialHelpBtn,
            })}
            {isAdmin && (
              <button
                style={{ ...styles.mobileActionButton, ...styles.mobilePrimaryActionButton }}
                onClick={() => setShowAddSong(true)}
              >
                + Song
              </button>
            )}
            <button
              style={styles.mobileActionButton}
              onClick={() => fetchSongs()}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            {!authLoading && (
              user ? (
                <button style={styles.mobileActionButton} onClick={signOut}>
                  Logout
                </button>
              ) : (
                <button style={styles.mobileActionButton} onClick={() => signInWithGoogle().catch(() => {})}>
                  Login
                </button>
              )
            )}
          </div>
        </div>

        <div
          ref={songListRef}
          inert={songSelectInert}
          style={{
            ...styles.mobileSongList,
            ...(showSongListState ? styles.mobileSongListState : {}),
          }}
        >
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
              <MobileSongCard
                key={song.id}
                song={song}
                songIndex={songIdx}
                sortedCharts={sortedCharts}
                isFocused={isFocused}
                focusedChartIndex={focusedChartIndex}
                mobileEditSelection={mobileEditSelection}
                isAdmin={isAdmin}
                registerCardElement={(index, element) => {
                  if (element) songCardRefs.current.set(index, element);
                  else songCardRefs.current.delete(index);
                }}
                onSelectSong={(index) => handleSelectSongCard(index, { preview: true })}
                onSelectChart={(index, chartIndex, selection) => {
                  setFocusedSongIndex(index);
                  setFocusedChartIndex(chartIndex);
                  setMobileEditSelection(selection);
                  playPreviewAt(index);
                }}
                onEdit={handleEdit}
                onNewChart={setNewChartTarget}
              />
            );
          })}
        </div>

        {renderOverlays()}
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header} inert={songSelectInert}>
        <h1 style={styles.title}>
          <span style={styles.titleAccent} aria-hidden="true" />
          Song Select
        </h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {renderTutorialHelpButton(styles.tutorialHelpBtn)}
          {isAdmin && (
            <button style={styles.addSongBtn} onClick={() => setShowAddSong(true)}>
              + Add Song
            </button>
          )}
          <button style={styles.refreshBtn} onClick={() => fetchSongs()} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button style={styles.settingsBtn} onClick={() => setSettingsOpen(true)}>
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

      <div style={styles.splitContainer} inert={songSelectInert}>
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
                      {formatDifficultyLabel(chart.difficulty_label)} Lv.{chart.difficulty_level}
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
                      handlePlay(
                        focusedSong.id,
                        focusedChart.difficulty_label,
                        focusedSong.audio_url,
                        resolveGameplayRange(focusedSong),
                      );
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
        <div
          ref={songListRef}
          style={{
            ...styles.songList,
            ...(showSongListState ? styles.songListState : {}),
          }}
        >
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
                onClick={() => handleSelectSongCard(songIdx)}
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
                        {formatDifficultyLabel(chart.difficulty_label)} Lv.{chart.difficulty_level}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {renderOverlays()}
    </div>
  );
}
