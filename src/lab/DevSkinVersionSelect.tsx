import { color, font, surface } from '../shared/theme';
import { DEV_SKIN_OPTIONS, useDevSkinSelection } from './devSkinSelection';

export default function DevSkinVersionSelect() {
  const selectedId = useDevSkinSelection(state => state.selectedId);
  const select = useDevSkinSelection(state => state.select);

  return (
    <div style={{ display: 'grid', gap: 8, marginBottom: 20, minWidth: 0, fontFamily: font.body }}>
      <label htmlFor="dev-skin-version" style={{ color: color.inkStrong, fontSize: 14 }}>개발용 스킨</label>
      <select
        id="dev-skin-version"
        value={selectedId}
        onChange={event => select(event.target.value)}
        onKeyDown={event => event.stopPropagation()}
        style={{ width: '100%', minWidth: 0, minHeight: 44, padding: 8, border: `1px solid ${color.line}`, borderRadius: 4, color: color.inkStrong, background: surface.panel, font: 'inherit' }}
      >
        {DEV_SKIN_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
      <small style={{ color: color.ink, lineHeight: 1.5 }}>선택한 버전으로 연주합니다. 새로고침하면 게임 설정으로 돌아갑니다.</small>
    </div>
  );
}
