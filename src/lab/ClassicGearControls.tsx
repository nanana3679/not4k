import { GEAR_MOTION_LAYER_LABELS, GEAR_MOTION_LAYERS, type GearMotionLayer, type GearMotionLayerVisibility } from '../game/renderer/classicGearMotionData';

/** Classic Gear 조절 패널과 Pixi ↔ SVG 비교가 함께 쓰는 라디오 묶음. */
export function RadioGroup<T extends string | number>({ legend, name, value, options, onChange }: {
  legend: string;
  name: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="gear-preview-group">
      <legend>{legend}</legend>
      <div className="gear-preview-options">
        {options.map((option) => (
          <label className="gear-preview-option" key={option.value}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** 움직임 요소 체크(승인 SVG 시연과 같은 이름 A~D). 무대와 비교 화면에 함께 적용한다. */
export function GearMotionLayerChecks({ value, onChange }: {
  value: GearMotionLayerVisibility;
  onChange: (layer: GearMotionLayer, visible: boolean) => void;
}) {
  return (
    <div className="gear-preview-checks">
      {GEAR_MOTION_LAYERS.map((layer) => (
        <label className="gear-preview-check" key={layer}>
          <input
            type="checkbox"
            name="gear-motion-layer"
            value={layer}
            checked={value[layer]}
            onChange={(event) => onChange(layer, event.currentTarget.checked)}
          />
          <span>{GEAR_MOTION_LAYER_LABELS[layer]}</span>
        </label>
      ))}
    </div>
  );
}
