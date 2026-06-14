---
name: not4k-gear-layer-split
description: Convert an accepted not4k gear source image into runtime-composited skin layers with a gauge window, generated front/back images, and dynamic gauge config.
---

# not4k Runtime Gear Layers

Use this skill when an accepted not4k gear image needs an in-game dynamic gauge.
Do not make the gauge by cropping a filled gauge image.
Build a runtime layer stack where the game draws the bar through a gauge window.

Target stack:

```text
gear-back.png
runtime gauge bar
gear-front.png
```

## Inputs

- A sample directory under `public/lab/gear-samples/<sample>/`
- `gear-source.png` in that directory
- Optional `gear-source.md` if the original image-generation prompt was recorded

## Required References

Read these before executing:

- `references/runtime-gauge-contract.md`: filenames, config schema, and validation rules
- `references/front-back-prompt.md`: optional image-editing prompt when a model is used instead of the deterministic helper

## Workflow

1. Inspect `gear-source.png` visually and identify:
   - a gauge window where a continuous runtime bar can show through
   - the static front shell that should cover the bar edges
   - the back/track color visible behind an empty gauge
2. Extract source-image regions:
   - `canvas`: source width and height
   - `gauge.window`: `x`, `y`, `width`, `height`, and `radius`
   - `gauge.direction`: usually `bottom-to-top`
   - optional gradient/glow defaults that match the skin
3. Generate:
   - `gear-back.png`: source-sized image with a dark empty gauge track behind the window
   - `gear-front.png`: source-sized transparent PNG where only the gauge window is punched out
   - `skin-runtime-config.json`: runtime gauge coordinates, direction, gradient, glow, and layer paths
4. Use `scripts/make_runtime_gauge_layers.py` for deterministic first-pass output.
5. If art quality needs hand cleanup, use `references/front-back-prompt.md` with an image editing model, but preserve the same config coordinates.
6. Verify:
   - `gear-back.png` and `gear-front.png` match `gear-source.png` size
   - `gear-front.png` has alpha transparency inside the gauge window
   - `skin-runtime-config.json` coordinates match the punched window
   - runtime drawing clips the bar and glow to the window before `gear-front.png` is drawn

Example:

```bash
python3 docs/agents/skills/not4k-gear-layer-split/scripts/make_runtime_gauge_layers.py \
  --sample-dir public/lab/gear-samples/<sample> \
  --window 608,116,650,614 \
  --radius 9 \
  --direction bottom-to-top
```

The rectangle format is `left,top,right,bottom` in source-image pixels.
