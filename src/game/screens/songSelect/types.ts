// ---------------------------------------------------------------------------
// Shared types for SongSelectScreen
// ---------------------------------------------------------------------------

export interface DbChart {
  id: string;
  song_id: string;
  difficulty_label: string;
  difficulty_level: number;
}

export interface DbSong {
  id: string;
  title: string;
  artist: string;
  audio_url: string;
  duration: number | null;
  preview_start: number | null;
  preview_end: number | null;
  preview_url: string | null;
  gameplay_start: number | null;
  gameplay_end: number | null;
  gameplay_fade_in: number | null;
  gameplay_fade_out: number | null;
  jacket_url: string | null;
  /** DB JSON은 resolver가 검증한다. null만 미이행 상태다. */
  timing: unknown;
  revision: number;
  updated_at?: string | null;
  charts: DbChart[];
}
