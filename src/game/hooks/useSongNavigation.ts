import { useEffect, useState, useCallback, useRef, type RefObject, type MutableRefObject } from 'react';
import { supabase } from '../../supabase';
import { useGameStore } from '../stores';
import type { DbSong } from '../screens/songSelect/types';
import { getDifficultyOrder } from '../screens/songSelect/helpers';

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
}): UseSongNavigationResult {
  const { isAdmin, showAddSong, newChartTarget, onPlay, onEscape } = options;
  const { selectedSongId, selectedDifficulty } = useGameStore();

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
    return [...song.charts].sort((a, b) =>
      getDifficultyOrder(a.difficulty_label) - getDifficultyOrder(b.difficulty_label)
      || a.difficulty_level - b.difficulty_level
    );
  }, []);

  // Supabase fetch
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

  // 포커스된 카드 스크롤 중앙 정렬
  useEffect(() => {
    const el = songCardRefs.current.get(focusedSongIndex);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusedSongIndex]);

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
      } else if (e.key === 'Enter') {
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
  }, [songs, focusedSongIndex, focusedChartIndex, showAddSong, newChartTarget, onPlay, onEscape, getSortedCharts, navigateSong]);

  // 마지막 플레이 곡으로 포커스 복원, 또는 인덱스 클램프
  useEffect(() => {
    if (songs.length === 0) return;

    if (!restoredRef.current && selectedSongId) {
      restoredRef.current = true;
      const songIdx = songs.findIndex((s) => s.id === selectedSongId);
      if (songIdx >= 0) {
        setFocusedSongIndex(songIdx);
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
