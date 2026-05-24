import { STORAGE_BUCKET, songJacketPath } from '../../../shared';
import { supabase } from '../../../supabase';
import {
  getDifficultyColor,
  getMobileSongCardActionState,
  getSelectedChartForSong,
  type SelectedChartRef,
} from './helpers';
import { styles } from './styles';
import type { DbSong } from './types';

interface MobileSongCardProps {
  song: DbSong;
  songIndex: number;
  sortedCharts: DbSong['charts'];
  isFocused: boolean;
  focusedChartIndex: number;
  mobileEditSelection: SelectedChartRef | null;
  isAdmin: boolean;
  registerCardElement: (songIndex: number, element: HTMLDivElement | null) => void;
  onSelectSong: (songIndex: number) => void;
  onSelectChart: (songIndex: number, chartIndex: number, selection: SelectedChartRef) => void;
  onEdit: (songId: string, difficulty: string) => void;
  onNewChart: (song: DbSong) => void;
}

export function MobileSongCard({
  song,
  songIndex,
  sortedCharts,
  isFocused,
  focusedChartIndex,
  mobileEditSelection,
  isAdmin,
  registerCardElement,
  onSelectSong,
  onSelectChart,
  onEdit,
  onNewChart,
}: MobileSongCardProps) {
  const selectedChart = getSelectedChartForSong(song, sortedCharts, mobileEditSelection);
  const { showEdit, showNewChart } = getMobileSongCardActionState({ selectedChart, isAdmin });
  const mobileJacketUrl = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(song.jacket_url || songJacketPath(song.id)).data.publicUrl;

  return (
    <div
      ref={(element) => registerCardElement(songIndex, element)}
      style={{
        ...styles.mobileSongCard,
        ...(isFocused ? styles.mobileSongCardFocused : {}),
      }}
      onClick={() => onSelectSong(songIndex)}
    >
      <div style={styles.mobileSongHeader}>
        <div style={styles.mobileJacket}>
          <img
            src={mobileJacketUrl}
            alt=""
            style={styles.mobileJacketImage}
            onError={(event) => { event.currentTarget.style.display = 'none'; }}
          />
        </div>
        <div style={styles.mobileSongInfo}>
          <span style={styles.mobileSongTitle}>{song.title}</span>
          <span style={styles.mobileSongArtist}>
            {song.artist}
            {song.duration != null && (
              <span style={styles.songDuration}>
                {' '}· {Math.floor(song.duration / 60)}:{String(Math.floor(song.duration % 60)).padStart(2, '0')}
              </span>
            )}
          </span>
        </div>
      </div>

      <div style={styles.mobileChartRows}>
        {sortedCharts.map((chart, chartIndex) => {
          const isChartFocused = mobileEditSelection?.songId === song.id
            ? mobileEditSelection.chartId === chart.id
            : isFocused && chartIndex === focusedChartIndex;
          return (
            <button
              key={chart.id}
              style={{
                ...styles.mobileChartTag,
                ...getDifficultyColor(chart.difficulty_label),
                ...(isChartFocused ? styles.mobileChartTagFocused : {}),
              }}
              onClick={(event) => {
                event.stopPropagation();
                onSelectChart(songIndex, chartIndex, { songId: song.id, chartId: chart.id });
              }}
            >
              {chart.difficulty_label.toUpperCase()} Lv.{chart.difficulty_level}
            </button>
          );
        })}
      </div>

      {showEdit && selectedChart && (
        <button
          style={styles.mobileEditBtn}
          onClick={(event) => {
            event.stopPropagation();
            onEdit(song.id, selectedChart.difficulty_label);
          }}
        >
          Edit {selectedChart.difficulty_label.toUpperCase()} Lv.{selectedChart.difficulty_level}
        </button>
      )}

      {showNewChart && (
        <button
          style={styles.mobileNewChartBtn}
          onClick={(event) => {
            event.stopPropagation();
            onNewChart(song);
          }}
        >
          + Chart
        </button>
      )}
    </div>
  );
}
