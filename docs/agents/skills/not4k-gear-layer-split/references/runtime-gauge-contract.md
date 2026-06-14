# Runtime Gauge Contract

The accepted gear image is converted to a runtime layer stack:

```text
public/lab/gear-samples/<sample>/
  gear-source.png
  gear-back.png
  gear-front.png
  skin-runtime-config.json
```

Render order:

```text
gear-back.png
runtime gauge bar clipped to gauge.window
gear-front.png
```

`gear-front.png` must have a transparent hole where the gauge is visible.
The game draws the bar and inner glow through that hole.
The bar is not stored as a cropped image, so continuous gradients and animated glow can be rendered naturally.

## Config Shape

```json
{
  "canvas": { "width": 1672, "height": 941 },
  "layers": {
    "back": "gear-back.png",
    "front": "gear-front.png"
  },
  "gauges": [
    {
      "id": "leftAltitude",
      "label": "Left altitude",
      "window": { "x": 608, "y": 116, "width": 42, "height": 498, "radius": 9 },
      "direction": "bottom-to-top",
      "gradient": [
        { "at": 0, "color": "#15d9ff" },
        { "at": 0.62, "color": "#66f5d2" },
        { "at": 1, "color": "#ffd166" }
      ],
      "innerGlow": { "color": "#24e6ff", "blur": 18, "alpha": 0.46 }
    }
  ]
}
```

## Validation

- `gear-back.png` and `gear-front.png` must match `gear-source.png` dimensions.
- `gear-front.png` must have alpha transparency in the gauge window.
- `skin-runtime-config.json` must describe the same gauge window that is punched out of `gear-front.png`.
- Runtime rendering must clip fill and inner glow to the gauge window before drawing `gear-front.png`.
- Static keycaps, chassis, lane frame, and bezel art remain image layers. Only the gauge fill is runtime drawn.
