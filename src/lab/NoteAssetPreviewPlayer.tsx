import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { TutorialPreviewPlayer, type TutorialBombPosition } from '../game/screens/songSelect/TutorialPreviewPlayer';
import type { TutorialPreviewDefinition } from '../game/screens/songSelect/tutorialPreviewChart';
import type { NoteAssetDesign } from './noteAssetDesigns';
import type { KeybombVariant } from './noteAssetShowcase';
import { KeybombEffect } from './KeybombEffect';

/** 시안 묶음만 주입하고 튜토리얼의 재생·입력·판정 흐름을 그대로 사용한다. */
export function NoteAssetPreviewPlayer({design, preview, bomb, onReady}: {
  design: NoteAssetDesign;
  preview: TutorialPreviewDefinition;
  bomb: KeybombVariant;
  onReady: () => void;
}) {
  const [liveBombs, setLiveBombs] = useState<Record<number, {run: number; variant: KeybombVariant; position: TutorialBombPosition}>>({});
  const timers = useRef(new Map<number, number>());
  const handleBomb = useCallback((lane: number, position: TutorialBombPosition) => {
    if (bomb.frames) return;
    window.clearTimeout(timers.current.get(lane));
    setLiveBombs(current => ({...current, [lane]:{run:(current[lane]?.run ?? 0)+1, variant:bomb, position}}));
    timers.current.set(lane,window.setTimeout(() => setLiveBombs(current => {
      const next = {...current}; delete next[lane]; return next;
    }),bomb.duration+80));
  },[bomb]);
  useEffect(() => {
    const pending = timers.current;
    return () => { for(const timer of pending.values()) window.clearTimeout(timer); };
  },[]);
  return <>
    <TutorialPreviewPlayer preview={preview} skinId={design.skinId} showRendererBomb={!!bomb.frames}
      onBombEffect={handleBomb} diagramModalEnabled={false} onReady={onReady} />
    {Object.entries(liveBombs).map(([lane,effect]) => (
      <span key={`${lane}:${effect.run}`} className="asset-lab-live-bomb" data-live-bomb-lane={lane}
        style={{left:`${effect.position.x * 100}%`, top:`${effect.position.y * 100}%`} as CSSProperties}>
        <KeybombEffect variant={effect.variant} />
      </span>
    ))}
  </>;
}
