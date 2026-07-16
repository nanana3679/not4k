import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '../../supabase';
import { STORAGE_BUCKET, withCacheBust } from '../../shared';
import { useGameStore } from '../stores';
import type { DbSong } from '../screens/songSelect/types';

/**
 * 선택된 곡의 프리뷰 오디오를 자동으로 재생/정지한다.
 * - preview_url이 있으면 해당 파일을 루프 재생 (fade-in/out 포함)
 * - 없으면 audio_url에서 preview_start~preview_end 구간을 루프 재생
 *
 * 반환값: stopPreview — play 버튼 클릭 시 오디오를 즉시 정지하기 위한 함수
 */
export function usePreviewAudio(
  songs: DbSong[],
  focusedSongIndex: number,
  options: { enabled?: boolean; autoPlay?: boolean } = {},
) {
  const { enabled = true, autoPlay = true } = options;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  // 페이드아웃 진행 중에는 위치 기반(timeupdate) 볼륨 제어를 무시한다.
  const fadingRef = useRef(false);
  const fadeTimerRef = useRef<number | null>(null);
  const masterVolume = useGameStore((s) => s.settings.masterVolume ?? 1);
  const masterVolumeRef = useRef(masterVolume);

  // masterVolume 변경 시 기존 오디오 엘리먼트의 볼륨만 업데이트 (재생성 없이)
  useEffect(() => {
    masterVolumeRef.current = masterVolume;
    const el = audioRef.current;
    if (!el) return;
    // timeupdate 콜백이 다음 틱에서 최신 masterVolumeRef를 참조하므로
    // 즉시 반영을 위해 현재 볼륨을 BASE_VOL 비율로 스케일링
    const BASE_VOL = 0.4 * masterVolume;
    // 페이드 중일 수 있으므로 최대 BASE_VOL로 클램핑
    el.volume = Math.min(el.volume, BASE_VOL);
  }, [masterVolume]);

  const stopPreview = useCallback(() => {
    if (fadeTimerRef.current !== null) {
      clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    fadingRef.current = false;

    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
      return;
    }

    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
    }
  }, []);

  // 현재 프리뷰를 페이드아웃한 뒤 정지한다(보정 진입 등). 재생 중이 아니면 즉시 정지.
  const fadeOutAndStop = useCallback((durationMs = 500) => {
    const el = audioRef.current;
    if (!el || fadingRef.current) {
      stopPreview();
      return;
    }
    fadingRef.current = true;
    const startVol = el.volume;
    const startAt = performance.now();
    fadeTimerRef.current = window.setInterval(() => {
      const p = Math.min(1, (performance.now() - startAt) / durationMs);
      el.volume = startVol * (1 - p);
      if (p >= 1) stopPreview(); // 타이머 정리 + fadingRef 리셋 + 오디오 해제
    }, 16);
  }, [stopPreview]);

  const playPreview = useCallback((song: DbSong | null | undefined) => {
    const FADE = 0.5; // seconds

    stopPreview();
    if (!enabled || !song) return;

    // 전용 preview_url이 있는 경우: 루프 재생
    if (song.preview_url) {
      const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(song.preview_url);
      const el = new Audio(withCacheBust(data.publicUrl, song.updated_at));
      audioRef.current = el;
      el.volume = 0;
      el.loop = true;

      const onTimeUpdate = () => {
        if (fadingRef.current) return; // 페이드아웃 중엔 위치 기반 볼륨 제어 무시
        const BASE_VOL = 0.4 * masterVolumeRef.current;
        const dur = el.duration;
        if (!isFinite(dur)) return;
        const t = el.currentTime;
        if (t < FADE) el.volume = BASE_VOL * (t / FADE);
        else if (t > dur - FADE) el.volume = BASE_VOL * ((dur - t) / FADE);
        else el.volume = BASE_VOL;
      };

      el.addEventListener('timeupdate', onTimeUpdate);
      cleanupRef.current = () => {
        el.removeEventListener('timeupdate', onTimeUpdate);
        el.pause();
        el.removeAttribute('src');
        el.load();
        if (audioRef.current === el) audioRef.current = null;
      };

      void el.play().catch(() => {});
      return;
    }

    // fallback: audio_url에서 preview_start~preview_end 구간 루프
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(song.audio_url);
    const el = new Audio(withCacheBust(data.publicUrl, song.updated_at));
    audioRef.current = el;
    el.volume = 0;

    const start = Math.max(0, song.preview_start ?? 0);
    const end = Math.max(start + 0.1, song.preview_end ?? (song.duration ?? 30));
    const rangeDur = end - start;

    const seekToStart = () => {
      try {
        el.currentTime = start;
      } catch {
        // Some mobile browsers only allow seeking after metadata is ready.
      }
    };

    const onTimeUpdate = () => {
      const BASE_VOL = 0.4 * masterVolumeRef.current;
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

    el.addEventListener('loadedmetadata', seekToStart);
    el.addEventListener('timeupdate', onTimeUpdate);
    cleanupRef.current = () => {
      el.removeEventListener('loadedmetadata', seekToStart);
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.pause();
      el.removeAttribute('src');
      el.load();
      if (audioRef.current === el) audioRef.current = null;
    };

    seekToStart();
    void el.play().catch(() => {});
  }, [enabled, stopPreview]);

  useEffect(() => {
    if (!enabled) {
      // 보정 진입 등으로 비활성화되면 페이드아웃 후 정지 (재활성 시 fade-in 재생)
      fadeOutAndStop();
      return;
    }
    if (!autoPlay) return;
    playPreview(songs[focusedSongIndex]);
  }, [songs, focusedSongIndex, enabled, autoPlay, playPreview, fadeOutAndStop]);

  useEffect(() => stopPreview, [stopPreview]);

  const playPreviewAt = useCallback((songIndex: number) => {
    playPreview(songs[songIndex]);
  }, [songs, playPreview]);

  return { stopPreview, playPreviewAt };
}
