# Front/Back Image Editing Prompt

Use this only when deterministic output needs art cleanup with an image-editing model that can explicitly bind `gear-source.png` as the edit target.

```text
Prepare this accepted not4k gear image for a runtime-drawn continuous gauge.

Source image: [SOURCE_IMAGE]
Canvas: [CANVAS_WIDTH] x [CANVAS_HEIGHT]
Gauge window: [GAUGE_WINDOW_BBOX] in `left,top,right,bottom` source pixels.

Create two source-registered layers:

1. gear-back.png
- Same canvas size as the source.
- Keep the source composition and background.
- In the gauge window, replace the active gauge fill with a dark empty track/backdrop matching the surrounding skin.
- Do not redesign the gear or move any part.

2. gear-front.png
- Same canvas size as the source.
- Transparent hole in the exact gauge window so the runtime bar can show through.
- Keep static front shell, bezel, glass rim, ticks, highlights, and all non-gauge art.
- The transparent window should hide the original baked gauge fill.

Rules:
- Do not add text, labels, logos, letters, or symbols.
- Do not generate the gauge fill as an image. The game will draw it at runtime.
- Preserve pixel registration so `gear-back.png`, runtime gauge, and `gear-front.png` align at origin 0,0.
```
