import { useEffect, useState, useCallback, useRef, type RefObject, type MutableRefObject } from 'react';
import { supabase } from '../../supabase';
import { useGameStore } from '../stores';
import type { DbSong } from '../screens/songSelect/types';
import { filterVisibleSongs, findRestoredFocus, sortChartsByDifficulty } from '../screens/songSelect/helpers';

const NAV_COOLDOWN = 100; // ms

export interface UseSongNavigationResult {
  songs: DbSong[];
  loading: boolean;
  error: string | null;
  focusedSongIndex: number;
  focusedChartIndex: number;
  setFocusedSongIndex: (index: number) => void;
  setFocusedChartIndex: (index: number) => void;
  navigateSong: (direction: 1 | -1) => void;
  fetchSongs: (signal?: AbortSignal) => Promise<void>;
  songListRef: RefObject<HTMLDivElement | null>;
  songCardRefs: MutableRefObject<Map<number, HTMLDivElement>>;
  getSortedCharts: (song: DbSong) => DbSong['charts'];
}

/**
 * Supabase에서 곡/차트 목록을 fetch하고,
 * 곡/난이도 포커스 인덱스 관리 및 키보드/휠 네비게이션을 담당한다.
 */
export function useSongNavigation(options: {
  isAdmin: boolean;
  showAddSong: boolean;
  newChartTarget: DbSong | null;
  onPlay: (songId: string, difficulty: string, audioUrl: string) => void;
  onEscape: () => void;
  allowPlay?: boolean;
  centerFocusedCard?: boolean;
  enableWheelNavigation?: boolean;
}): UseSongNavigationResult {
  const {
    isAdmin,
    showAddSong,
    newChartTarget,
    onPlay,
    onEscape,
    allowPlay = true,
    centerFocusedCard = true,
    enableWheelNavigation = true,
  } = options;

  const [songs, setSongs] = useState<DbSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [focusedSongIndex, setFocusedSongIndex] = useState(0);
  const [focusedChartIndex, setFocusedChartIndex] = useState(0);

  const songListRef = useRef<HTMLDivElement>(null);
  const songCardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const wheelCooldownRef = useRef(0);
  const restoredRef = useRef(false);

  const getSortedCharts = useCallback((song: DbSong) => {
    return sortChartsByDifficulty(song.charts);
  }, []);

  // 곡 목록 갱신과 동시에 포커스를 조정한다.
  // 첫 로드에는 마지막 플레이 곡/난이도로 복원하고, 이후에는 범위를 벗어난 인덱스만 클램프한다.
  const applyFetchedSongs = useCallback((allSongs: DbSong[]) => {
    const next = filterVisibleSongs(allSongs, isAdmin);
    setSongs(next);
    if (next.length === 0) return;

    if (!restoredRef.current) {
      restoredRef.current = true;
      const { selectedSongId, selectedDifficulty } = useGameStore.getState();
      const restored = findRestoredFocus(next, selectedSongId, selectedDifficulty);
      if (restored) {
        setFocusedSongIndex(restored.songIndex);
        setFocusedChartIndex(restored.chartIndex);
        return;
      }
    }
    setFocusedSongIndex((prev) => Math.min(prev, next.length - 1));
  }, [isAdmin]);

  // Supabase fetch 본체. 시작 시 동기 setState 없이 응답 콜백에서만 상태를 갱신하므로
  // effect에서 직접 호출해도 cascading render가 생기지 않는다.
  const fetchSongsCore = useCallback((signal?: AbortSignal) => {
    const query = supabase
      .from('songs')
      .select('*, charts(*)')
      .order('title');
    if (signal) query.abortSignal(signal);
    return Promise.resolve(query).then(({ data, error: err }) => {
      if (signal?.aborted) return;
      if (err) {
        setError(`Failed to load songs: ${err.message}`);
        setLoading(false);
        return;
      }
      setError(null);
      applyFetchedSongs((data ?? []) as DbSong[]);
      setLoading(false);
    });
  }, [applyFetchedSongs]);

  // 수동 재호출(삭제/추가 후 갱신 등) 진입점 — 로딩 상태를 표시한 뒤 다시 fetch한다.
  const fetchSongs = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    await fetchSongsCore(signal);
  }, [fetchSongsCore]);

  // 마운트/isAdmin 변경 시 fetch. loading 초기값이 true라 시작 시점의 setState가 필요 없다.
  useEffect(() => {
    const ac = new AbortController();
    fetchSongsCore(ac.signal);
    return () => ac.abort();
  }, [fetchSongsCore]);

  // 원형 곡 네비게이션 (cooldown 포함)
  const navigateSong = useCallback((direction: 1 | -1) => {
    if (songs.length === 0) return;
    const now = Date.now();
    if (now - wheelCooldownRef.current < NAV_COOLDOWN) return;
    wheelCooldownRef.current = now;
    setFocusedSongIndex((prev) => (prev + direction + songs.length) % songs.length);
    setFocusedChartIndex(0);
  }, [songs.length]);

  // 마우스 휠 → 곡 변경 (non-passive)
  useEffect(() => {
    if (!enableWheelNavigation) return;
    const el = songListRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY > 0) navigateSong(1);
      else if (e.deltaY < 0) navigateSong(-1);
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [enableWheelNavigation, navigateSong]);

  // 포커스된 카드 스크롤 중앙 정렬
  useEffect(() => {
    if (!centerFocusedCard) return;
    const el = songCardRefs.current.get(focusedSongIndex);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [centerFocusedCard, focusedSongIndex]);

  // 키보드 네비게이션
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
      } else if (e.key === 'Enter' && allowPlay) {
        e.preventDefault();
        const song = songs[focusedSongIndex];
        if (song) {
          const sorted = getSortedCharts(song);
          const chart = sorted[focusedChartIndex];
          if (chart) {
            onPlay(song.id, chart.difficulty_label, song.audio_url);
          }
        }
      } else if (e.key === 'Escape') {
        onEscape();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [songs, focusedSongIndex, focusedChartIndex, showAddSong, newChartTarget, onPlay, onEscape, getSortedCharts, navigateSong, allowPlay]);

  return {
    songs,
    loading,
    error,
    focusedSongIndex,
    focusedChartIndex,
    setFocusedSongIndex,
    setFocusedChartIndex,
    navigateSong,
    fetchSongs,
    songListRef,
    songCardRefs,
    getSortedCharts,
  };
}
