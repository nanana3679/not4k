import { useEffect, useRef } from 'react';
import { supabase } from '../../supabase';
import { STORAGE_BUCKET } from '../../shared';
import { useGameStore } from '../stores';
import type { DbSong } from '../screens/songSelect/types';

/**
 * 선택된 곡의 프리뷰 오디오를 자동으로 재생/정지한다.
 * - preview_url이 있으면 해당 파일을 루프 재생 (fade-in/out 포함)
 * - 없으면 audio_url에서 preview_start~preview_end 구간을 루프 재생
 *
 * 반환값: stopPreview — play 버튼 클릭 시 오디오를 즉시 정지하기 위한 함수
 */
export function usePreviewAudio(songs: DbSong[], focusedSongIndex: number) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const masterVolume = useGameStore((s) => s.settings.masterVolume ?? 1);
  const masterVolumeRef = useRef(masterVolume);
  masterVolumeRef.current = masterVolume;

  // masterVolume 변경 시 기존 오디오 엘리먼트의 볼륨만 업데이트 (재생성 없이)
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    // timeupdate 콜백이 다음 틱에서 최신 masterVolumeRef를 참조하므로
    // 즉시 반영을 위해 현재 볼륨을 BASE_VOL 비율로 스케일링
    const BASE_VOL = 0.4 * masterVolume;
    // 페이드 중일 수 있으므로 최대 BASE_VOL로 클램핑
    el.volume = Math.min(el.volume, BASE_VOL);
  }, [masterVolume]);

  useEffect(() => {
    const song = songs[focusedSongIndex];
    const FADE = 0.5; // seconds

    // 이전 오디오 정지
    const prev = audioRef.current;
    if (prev) {
      prev.pause();
      prev.removeAttribute('src');
      prev.load();
      audioRef.current = null;
    }

    if (!song) return;

    // 전용 preview_url이 있는 경우: 루프 재생
    if (song.preview_url) {
      const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(song.preview_url);
      const el = new Audio(data.publicUrl);
      audioRef.current = el;
      el.volume = 0;
      el.loop = true;

      const onTimeUpdate = () => {
        const BASE_VOL = 0.4 * masterVolumeRef.current;
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
        audioRef.current = null;
      };
    }

    // fallback: audio_url에서 preview_start~preview_end 구간 루프
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(song.audio_url);
    const el = new Audio(data.publicUrl);
    audioRef.current = el;
    el.volume = 0;

    const start = song.preview_start ?? 0;
    const end = song.preview_end ?? (song.duration ?? 30);
    const rangeDur = end - start;

    const onLoaded = () => {
      el.currentTime = start;
      el.play().catch(() => {});
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

    el.addEventListener('loadeddata', onLoaded);
    el.addEventListener('timeupdate', onTimeUpdate);

    return () => {
      el.removeEventListener('loadeddata', onLoaded);
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.pause();
      el.removeAttribute('src');
      el.load();
      audioRef.current = null;
    };
  }, [songs, focusedSongIndex]);

  const stopPreview = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audioRef.current = null;
    }
  };

  return { stopPreview };
}
