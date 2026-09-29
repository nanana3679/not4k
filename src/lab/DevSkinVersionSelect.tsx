import { color, font, surface } from '../shared/theme';
import { DEV_SKIN_OPTIONS, useDevSkinSelection } from './devSkinSelection';

export default function DevSkinVersionSelect() {
  const selectedId = useDevSkinSelection(state => state.selectedId);
  const select = useDevSkinSelection(state => state.select);

  return (
    <div style={{ display: 'grid', gap: 8, minWidth: 0, fontFamily: font.body }}>
      <label htmlFor="dev-skin-version" style={{ color: color.inkStrong, fontSize: 14 }}>개발용 스킨</label>
      <select
        id="dev-skin-version"
        value={selectedId}
        onChange={event => select(event.target.value)}
        style={{ width: '100%', minWidth: 0, minHeight: 44, padding: 8, border: `1px solid ${color.line}`, borderRadius: 4, color: color.inkStrong, background: surface.panel, font: 'inherit' }}
      >
        {DEV_SKIN_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
      <small style={{ color: color.ink, lineHeight: 1.5 }}>개발용 스킨이 위의 기본 스킨보다 우선 적용됩니다. 게임 설정 사용을 선택하거나 새로고침하면 기본 스킨으로 돌아갑니다.</small>
    </div>
  );
}
