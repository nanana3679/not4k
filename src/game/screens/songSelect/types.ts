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
  jacket_url: string | null;
  charts: DbChart[];
}
