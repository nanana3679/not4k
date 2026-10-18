import type { CSSProperties } from "react";
import type { KeybombVariantId } from "./noteAssetShowcase";

type CustomProperties = CSSProperties & Record<`--${string}`, string | number>;
interface EffectLayer { className: string; style?: CustomProperties; }

function directionLayers(
  className: string,
  count: number,
  offset = 0,
  style: CustomProperties = {},
): EffectLayer[] {
  return Array.from({ length: count }, (_, index) => ({
    className: `${className}${index % 4 === 1 ? " warm" : ""}`,
    style: { "--angle": `${offset + index * 360 / count}deg`, ...style },
  }));
}

export function getEffectLayers(id: KeybombVariantId): EffectLayer[] {
  const layers: EffectLayer[] = [{ className: "halo" }];

  if (id === "silver") {
    layers.push(
      { className: "ring" }, { className: "ring ring-inner" }, { className: "ring-segments" },
      ...directionLayers("ray", 8, 22.5, { "--ray-length": "20px" }),
      ...directionLayers("shard", 4, 45), { className: "star" }, { className: "star diagonal-star" },
    );
  } else if (id === "diagonal") {
    layers.push(
      { className: "diamond-ring" }, { className: "diamond-ring diamond-inner" },
      ...directionLayers("shard", 4, 45, { "--shard-width": "4px", "--shard-length": "19px" }),
      ...directionLayers("ray", 4, 45, { "--ray-width": "3px", "--ray-length": "34px" }),
      { className: "star" },
    );
  } else if (id === "armor") {
    layers.push(
      { className: "ring" }, ...directionLayers("plate", 4, 45),
      ...directionLayers("shard", 4, 0, { "--shard-width": "5px", "--shard-length": "12px", "--travel": "44px" }),
      ...directionLayers("ray", 4, 45, { "--ray-length": "25px" }), { className: "star diagonal-star" },
    );
  } else if (id === "shockwave") {
    layers.push(
      { className: "ring" }, { className: "ring ring-inner" }, ...directionLayers("dust", 8, 22.5),
      ...directionLayers("ray", 4, 0, { "--ray-length": "17px" }), { className: "star diagonal-star" },
    );
  } else if (id === "segmented") {
    layers.push(
      { className: "ring-segments" }, { className: "ring ring-inner" },
      ...directionLayers("plate", 4, 45, { "--travel": "46px" }), ...directionLayers("dust", 8, 10),
      { className: "star diagonal-star" },
    );
  } else {
    layers.push(
      ...directionLayers("shard", 4, 45, { "--shard-width": "3px", "--shard-length": "11px", "--travel": "40px" }),
      { className: "star" }, { className: "star diagonal-star" },
    );
  }

  layers.push({ className: "core" });
  return layers;
}
