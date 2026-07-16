import type { DbSong } from './types';
import { color, primitives } from '../../../shared/theme';
import { modalStyles } from './modalStyles';

// ---------------------------------------------------------------------------
// DeleteSongModal — 곡 삭제 확인 모달 (admin)
//
// 차트가 하나라도 남아 있으면 삭제 버튼을 비활성화한다.
// DB의 FK restrict(charts.song_id → songs.id)와 같은 규칙의 UI 표현.
// ---------------------------------------------------------------------------

interface DeleteSongModalProps {
  song: DbSong;
  deleting: boolean;
  onConfirm: (song: DbSong) => void;
  onClose: () => void;
}

export function DeleteSongModal({ song, deleting, onConfirm, onClose }: DeleteSongModalProps) {
  const remainingCharts = song.charts.length;
  const blocked = remainingCharts > 0;

  return (
    <div style={modalStyles.overlay} onMouseDown={deleting ? undefined : onClose}>
      <div style={modalStyles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <h3 style={modalStyles.title}>Delete Song</h3>
        <p style={{ fontSize: '14px', margin: '0 0 8px', color: color.ink }}>
          <strong>{song.title}</strong> — {song.artist}
        </p>
        {blocked ? (
          <p style={{ fontSize: '13px', margin: '0 0 16px', color: color.gold }}>
            차트 {remainingCharts}개가 남아 있어 삭제할 수 없습니다.
            에디터에서 차트를 먼저 삭제하세요.
          </p>
        ) : (
          <p style={{ fontSize: '13px', margin: '0 0 16px', color: color.danger }}>
            음원·자켓을 포함해 곡이 영구 삭제됩니다. 되돌릴 수 없습니다.
          </p>
        )}
        <div style={modalStyles.buttons}>
          <button
            style={{
              ...primitives.metalButton,
              padding: '0 16px',
              fontSize: '13px',
              color: '#fff',
              border: `1px solid ${color.danger}`,
              background: 'linear-gradient(180deg, #7a2a24, #4a1713)',
              opacity: deleting || blocked ? 0.5 : 1,
              cursor: deleting || blocked ? 'not-allowed' : 'pointer',
            }}
            disabled={deleting || blocked}
            onClick={() => onConfirm(song)}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
          <button style={modalStyles.cancelBtn} onClick={onClose} disabled={deleting}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
