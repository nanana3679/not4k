import { getNoteAssetDesign } from './noteAssetDesigns';

export type NoteAssetShowcaseSelection = { design: string } | { version: string };

/**
 * 시안·버전 선택을 반영한 다음 주소와 방문 기록 방식을 정한다.
 * 시안을 바꾸면 버전을 지우고, 버전을 고르면 Classic으로 고정하며 `current`는 버전을 지운다.
 */
export function nextShowcaseSearch(
  current: URLSearchParams,
  change: NoteAssetShowcaseSelection,
): { params: URLSearchParams; replace: boolean } {
  const params = new URLSearchParams(current);
  if ('design' in change) {
    params.set('design', change.design);
    params.delete('version');
  } else {
    params.set('design', 'classic');
    if (change.version === 'current') params.delete('version');
    else params.set('version', change.version);
  }
  // #176: 화면이 그대로인 재선택은 주소만 정규화하고 방문 기록을 쌓지 않는다. 시안 객체는 모듈 상수라 동일성으로 비교한다.
  const replace = getNoteAssetDesign(current.get('design'), current.get('version'))
    === getNoteAssetDesign(params.get('design'), params.get('version'));
  return { params, replace };
}
