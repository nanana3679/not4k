import type { CSSProperties } from 'react';
import type { KeybombVariant } from './noteAssetShowcase';
import { getEffectLayers } from './keybombEffect';
import './noteAssetKeybomb.css';

export function KeybombEffect({variant}: {variant: KeybombVariant}) {
  return (
    <span className="asset-lab-keybomb" data-style={variant.id}
      style={{'--lifetime':`${variant.duration}ms`} as CSSProperties} aria-hidden="true">
      {variant.frames ? variant.frames.map((src,index) => (
        <img className="asset-lab-bomb-frame" key={src} src={src} alt=""
          style={{animationDelay:`${index * variant.duration / variant.frames!.length}ms`, animationDuration:`${variant.duration / variant.frames!.length}ms`}} />
      )) : getEffectLayers(variant.id).map((layer,index) => (
        <i key={`${layer.className}-${index}`} className={`fx ${layer.className}`} style={layer.style} />
      ))}
    </span>
  );
}
