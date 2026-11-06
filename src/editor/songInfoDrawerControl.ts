import type { SongChartList } from './components/SongInfoDrawer';
import type { StoredChartRow } from '../supabase/chartRows';

/**
 * 곡 정보 드로어의 열림과 같은 곡 차트 목록(RFD 0098). 드로어 상태는 페이지 것이라 테스트 플레이에서 돌아오면 닫히고 목록도 비어 있다.
 * 툴바와 변경 취소의 Undo 모두 `open`을 지나 드로어를 열 때 목록을 읽는다. 이미 열려 있으면 다시 읽지 않고, 늦게 온 이전 응답은 버린다.
 */
export function createSongInfoDrawerControl(deps: {
  setOpen: (open: boolean) => void;
  setCharts: (charts: SongChartList) => void;
  getSongId: () => string | null;
  fetchRows: (songId: string) => Promise<StoredChartRow[]>;
}) {
  let isOpen = false;
  let latestRequest = 0;

  const loadCharts = () => {
    const request = ++latestRequest;
    const songId = deps.getSongId();
    if (!songId) {
      deps.setCharts({ status: 'failed' });
      return;
    }
    deps.setCharts({ status: 'loading' });
    deps.fetchRows(songId).then(
      rows => { if (request === latestRequest) deps.setCharts({ status: 'loaded', rows }); },
      () => { if (request === latestRequest) deps.setCharts({ status: 'failed' }); },
    );
  };

  return {
    open(): void {
      if (isOpen) return;
      isOpen = true;
      deps.setOpen(true);
      loadCharts();
    },
    close(): void {
      isOpen = false;
      deps.setOpen(false);
    },
  };
}
