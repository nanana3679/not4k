import type { ReactNode } from 'react';
import { DEV_SKIN_OPTIONS, useDevSkinSelection } from './devSkinSelection';

export interface DevSkinSelectRow {
  label: string;
  desc: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

const OPTIONS = DEV_SKIN_OPTIONS.map(option => ({ value: option.id, label: option.label }));

// 선택 상태만 소유한다. 모양은 Settings의 행 컴포넌트가 그려 다른 설정과 같게 보인다.
export default function DevSkinVersionSelect({ renderRow }: { renderRow: (row: DevSkinSelectRow) => ReactNode }) {
  const selectedId = useDevSkinSelection(state => state.selectedId);
  const select = useDevSkinSelection(state => state.select);

  return <>{renderRow({
    label: '개발용 스킨',
    desc: '기본 스킨보다 우선합니다. 새로고침하면 해제됩니다.',
    value: selectedId,
    options: OPTIONS,
    onChange: select,
  })}</>;
}
