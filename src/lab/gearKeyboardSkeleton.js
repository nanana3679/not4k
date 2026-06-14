const PITCH = 48;
const GAP = 6;
const MARGIN = 24;

export const GEAR_KEYBOARD_EXPECTED_CODES = Object.freeze([
  "Escape",
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12",
  "PrintScreen",
  "ScrollLock",
  "Pause",
  "Backquote",
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "Digit6",
  "Digit7",
  "Digit8",
  "Digit9",
  "Digit0",
  "Minus",
  "Equal",
  "Backspace",
  "Insert",
  "Home",
  "PageUp",
  "Tab",
  "KeyQ",
  "KeyW",
  "KeyE",
  "KeyR",
  "KeyT",
  "KeyY",
  "KeyU",
  "KeyI",
  "KeyO",
  "KeyP",
  "BracketLeft",
  "BracketRight",
  "Backslash",
  "Delete",
  "End",
  "PageDown",
  "CapsLock",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyF",
  "KeyG",
  "KeyH",
  "KeyJ",
  "KeyK",
  "KeyL",
  "Semicolon",
  "Quote",
  "Enter",
  "ShiftLeft",
  "KeyZ",
  "KeyX",
  "KeyC",
  "KeyV",
  "KeyB",
  "KeyN",
  "KeyM",
  "Comma",
  "Period",
  "Slash",
  "ShiftRight",
  "ControlLeft",
  "MetaLeft",
  "AltLeft",
  "Space",
  "AltRight",
  "MetaRight",
  "ContextMenu",
  "ControlRight",
  "ArrowUp",
  "ArrowLeft",
  "ArrowDown",
  "ArrowRight",
  "NumLock",
  "NumpadDivide",
  "NumpadMultiply",
  "NumpadSubtract",
  "Numpad7",
  "Numpad8",
  "Numpad9",
  "NumpadAdd",
  "Numpad4",
  "Numpad5",
  "Numpad6",
  "Numpad1",
  "Numpad2",
  "Numpad3",
  "NumpadEnter",
  "Numpad0",
  "NumpadDecimal",
]);

export const GEAR_KEYBOARD_SKELETON_KEYS = Object.freeze([
  { code: "Escape", cluster: "system", x: 0, y: 0 },
  { code: "F1", cluster: "system", x: 2, y: 0 },
  { code: "F2", cluster: "system", x: 3, y: 0 },
  { code: "F3", cluster: "system", x: 4, y: 0 },
  { code: "F4", cluster: "system", x: 5, y: 0 },
  { code: "F5", cluster: "system", x: 6.5, y: 0 },
  { code: "F6", cluster: "system", x: 7.5, y: 0 },
  { code: "F7", cluster: "system", x: 8.5, y: 0 },
  { code: "F8", cluster: "system", x: 9.5, y: 0 },
  { code: "F9", cluster: "system", x: 11, y: 0 },
  { code: "F10", cluster: "system", x: 12, y: 0 },
  { code: "F11", cluster: "system", x: 13, y: 0 },
  { code: "F12", cluster: "system", x: 14, y: 0 },
  { code: "PrintScreen", cluster: "system", x: 15.5, y: 0 },
  { code: "ScrollLock", cluster: "system", x: 16.5, y: 0 },
  { code: "Pause", cluster: "system", x: 17.5, y: 0 },

  { code: "Backquote", cluster: "main", x: 0, y: 1.5 },
  { code: "Digit1", cluster: "main", x: 1, y: 1.5 },
  { code: "Digit2", cluster: "main", x: 2, y: 1.5 },
  { code: "Digit3", cluster: "main", x: 3, y: 1.5 },
  { code: "Digit4", cluster: "main", x: 4, y: 1.5 },
  { code: "Digit5", cluster: "main", x: 5, y: 1.5 },
  { code: "Digit6", cluster: "main", x: 6, y: 1.5 },
  { code: "Digit7", cluster: "main", x: 7, y: 1.5 },
  { code: "Digit8", cluster: "main", x: 8, y: 1.5 },
  { code: "Digit9", cluster: "main", x: 9, y: 1.5 },
  { code: "Digit0", cluster: "main", x: 10, y: 1.5 },
  { code: "Minus", cluster: "main", x: 11, y: 1.5 },
  { code: "Equal", cluster: "main", x: 12, y: 1.5 },
  { code: "Backspace", cluster: "main", x: 13, y: 1.5, w: 2 },
  { code: "Insert", cluster: "navigation", x: 15.5, y: 1.5 },
  { code: "Home", cluster: "navigation", x: 16.5, y: 1.5 },
  { code: "PageUp", cluster: "navigation", x: 17.5, y: 1.5 },
  { code: "NumLock", cluster: "numpad", x: 19, y: 1.5 },
  { code: "NumpadDivide", cluster: "numpad", x: 20, y: 1.5 },
  { code: "NumpadMultiply", cluster: "numpad", x: 21, y: 1.5 },
  { code: "NumpadSubtract", cluster: "numpad", x: 22, y: 1.5 },

  { code: "Tab", cluster: "main", x: 0, y: 2.5, w: 1.5 },
  { code: "KeyQ", cluster: "main", x: 1.5, y: 2.5 },
  { code: "KeyW", cluster: "main", x: 2.5, y: 2.5 },
  { code: "KeyE", cluster: "main", x: 3.5, y: 2.5 },
  { code: "KeyR", cluster: "main", x: 4.5, y: 2.5 },
  { code: "KeyT", cluster: "main", x: 5.5, y: 2.5 },
  { code: "KeyY", cluster: "main", x: 6.5, y: 2.5 },
  { code: "KeyU", cluster: "main", x: 7.5, y: 2.5 },
  { code: "KeyI", cluster: "main", x: 8.5, y: 2.5 },
  { code: "KeyO", cluster: "main", x: 9.5, y: 2.5 },
  { code: "KeyP", cluster: "main", x: 10.5, y: 2.5 },
  { code: "BracketLeft", cluster: "main", x: 11.5, y: 2.5 },
  { code: "BracketRight", cluster: "main", x: 12.5, y: 2.5 },
  { code: "Backslash", cluster: "main", x: 13.5, y: 2.5, w: 1.5 },
  { code: "Delete", cluster: "navigation", x: 15.5, y: 2.5 },
  { code: "End", cluster: "navigation", x: 16.5, y: 2.5 },
  { code: "PageDown", cluster: "navigation", x: 17.5, y: 2.5 },
  { code: "Numpad7", cluster: "numpad", x: 19, y: 2.5 },
  { code: "Numpad8", cluster: "numpad", x: 20, y: 2.5 },
  { code: "Numpad9", cluster: "numpad", x: 21, y: 2.5 },
  { code: "NumpadAdd", cluster: "numpad", x: 22, y: 2.5, h: 2 },

  { code: "CapsLock", cluster: "main", x: 0, y: 3.5, w: 1.75 },
  { code: "KeyA", cluster: "main", x: 1.75, y: 3.5 },
  { code: "KeyS", cluster: "main", x: 2.75, y: 3.5 },
  { code: "KeyD", cluster: "main", x: 3.75, y: 3.5 },
  { code: "KeyF", cluster: "main", x: 4.75, y: 3.5 },
  { code: "KeyG", cluster: "main", x: 5.75, y: 3.5 },
  { code: "KeyH", cluster: "main", x: 6.75, y: 3.5 },
  { code: "KeyJ", cluster: "main", x: 7.75, y: 3.5 },
  { code: "KeyK", cluster: "main", x: 8.75, y: 3.5 },
  { code: "KeyL", cluster: "main", x: 9.75, y: 3.5 },
  { code: "Semicolon", cluster: "main", x: 10.75, y: 3.5 },
  { code: "Quote", cluster: "main", x: 11.75, y: 3.5 },
  { code: "Enter", cluster: "main", x: 12.75, y: 3.5, w: 2.25 },
  { code: "Numpad4", cluster: "numpad", x: 19, y: 3.5 },
  { code: "Numpad5", cluster: "numpad", x: 20, y: 3.5 },
  { code: "Numpad6", cluster: "numpad", x: 21, y: 3.5 },

  { code: "ShiftLeft", cluster: "main", x: 0, y: 4.5, w: 2.25 },
  { code: "KeyZ", cluster: "main", x: 2.25, y: 4.5 },
  { code: "KeyX", cluster: "main", x: 3.25, y: 4.5 },
  { code: "KeyC", cluster: "main", x: 4.25, y: 4.5 },
  { code: "KeyV", cluster: "main", x: 5.25, y: 4.5 },
  { code: "KeyB", cluster: "main", x: 6.25, y: 4.5 },
  { code: "KeyN", cluster: "main", x: 7.25, y: 4.5 },
  { code: "KeyM", cluster: "main", x: 8.25, y: 4.5 },
  { code: "Comma", cluster: "main", x: 9.25, y: 4.5 },
  { code: "Period", cluster: "main", x: 10.25, y: 4.5 },
  { code: "Slash", cluster: "main", x: 11.25, y: 4.5 },
  { code: "ShiftRight", cluster: "main", x: 12.25, y: 4.5, w: 2.75 },
  { code: "ArrowUp", cluster: "arrows", x: 16.5, y: 4.5 },
  { code: "Numpad1", cluster: "numpad", x: 19, y: 4.5 },
  { code: "Numpad2", cluster: "numpad", x: 20, y: 4.5 },
  { code: "Numpad3", cluster: "numpad", x: 21, y: 4.5 },
  { code: "NumpadEnter", cluster: "numpad", x: 22, y: 4.5, h: 2 },

  { code: "ControlLeft", cluster: "main", x: 0, y: 5.5, w: 1.25 },
  { code: "MetaLeft", cluster: "main", x: 1.25, y: 5.5, w: 1.25 },
  { code: "AltLeft", cluster: "main", x: 2.5, y: 5.5, w: 1.25 },
  { code: "Space", cluster: "main", x: 3.75, y: 5.5, w: 6.25 },
  { code: "AltRight", cluster: "main", x: 10, y: 5.5, w: 1.25 },
  { code: "MetaRight", cluster: "main", x: 11.25, y: 5.5, w: 1.25 },
  { code: "ContextMenu", cluster: "main", x: 12.5, y: 5.5, w: 1.25 },
  { code: "ControlRight", cluster: "main", x: 13.75, y: 5.5, w: 1.25 },
  { code: "ArrowLeft", cluster: "arrows", x: 15.5, y: 5.5 },
  { code: "ArrowDown", cluster: "arrows", x: 16.5, y: 5.5 },
  { code: "ArrowRight", cluster: "arrows", x: 17.5, y: 5.5 },
  { code: "Numpad0", cluster: "numpad", x: 19, y: 5.5, w: 2 },
  { code: "NumpadDecimal", cluster: "numpad", x: 21, y: 5.5 },
]);

export const GEAR_KEYBOARD_CLUSTER_COUNTS = Object.freeze({
  system: 16,
  main: 61,
  navigation: 6,
  arrows: 4,
  numpad: 17,
});

export const GEAR_KEYBOARD_MODULES = Object.freeze([
  {
    id: "keyboard-system-row",
    module: "system-row",
    cluster: "system",
  },
  {
    id: "keyboard-main-block",
    module: "main-block",
    cluster: "main",
  },
  {
    id: "keyboard-navigation-cluster",
    module: "navigation-cluster",
    cluster: "navigation",
  },
  {
    id: "keyboard-arrow-cluster",
    module: "arrow-cluster",
    cluster: "arrows",
  },
  {
    id: "keyboard-numpad",
    module: "numpad",
    cluster: "numpad",
  },
]);

export function validateGearKeyboardSkeletonLayout(keys = GEAR_KEYBOARD_SKELETON_KEYS) {
  const errors = [];
  const codes = keys.map((key) => key.code);
  const codeSet = new Set(codes);

  for (const code of GEAR_KEYBOARD_EXPECTED_CODES) {
    if (!codeSet.has(code)) {
      errors.push(`Missing key: ${code}`);
    }
  }

  for (const code of codes) {
    const count = codes.filter((candidate) => candidate === code).length;
    if (count > 1) {
      errors.push(`Duplicate key: ${code}`);
    }
  }

  if (keys.length !== GEAR_KEYBOARD_EXPECTED_CODES.length) {
    errors.push(`Expected ${GEAR_KEYBOARD_EXPECTED_CODES.length} keys, got ${keys.length}`);
  }

  for (const [cluster, expectedCount] of Object.entries(GEAR_KEYBOARD_CLUSTER_COUNTS)) {
    const actualCount = keys.filter((key) => key.cluster === cluster).length;
    if (actualCount !== expectedCount) {
      errors.push(`Expected ${expectedCount} ${cluster} keys, got ${actualCount}`);
    }
  }

  for (const module of GEAR_KEYBOARD_MODULES) {
    if (!GEAR_KEYBOARD_CLUSTER_COUNTS[module.cluster]) {
      errors.push(`Unknown module cluster: ${module.cluster}`);
    }
  }

  return errors;
}

export function getGearKeyboardSkeletonMetrics(keys = GEAR_KEYBOARD_SKELETON_KEYS) {
  const maxRight = Math.max(...keys.map((key) => key.x + (key.w ?? 1)));
  const maxBottom = Math.max(...keys.map((key) => key.y + (key.h ?? 1)));

  return {
    pitch: PITCH,
    gap: GAP,
    margin: MARGIN,
    width: MARGIN * 2 + maxRight * PITCH - GAP,
    height: MARGIN * 2 + maxBottom * PITCH - GAP,
  };
}

export function renderGearKeyboardSkeletonSvg(keys = GEAR_KEYBOARD_SKELETON_KEYS) {
  const errors = validateGearKeyboardSkeletonLayout(keys);
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  const metrics = getGearKeyboardSkeletonMetrics(keys);
  const keyGroups = GEAR_KEYBOARD_MODULES.map((module) => {
    const keyRects = keys
      .filter((key) => key.cluster === module.cluster)
      .map((key) => renderKeyRect(key, module.module))
      .join("\n");

    return `  <g id="${escapeXml(module.id)}" data-module="${escapeXml(module.module)}" data-role="keyboard-module">
${keyRects}
  </g>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${metrics.width}" height="${metrics.height}" viewBox="0 0 ${metrics.width} ${metrics.height}" role="img" aria-label="Full PC keyboard skeleton from Escape to numpad">
  <title>Full PC Keyboard Skeleton</title>
  <desc>Blank ANSI 104-key PC keyboard geometry reference for gear image generation and input hitbox alignment.</desc>
  <style>
    .key {
      fill: none;
      stroke: #8ee7ff;
      stroke-width: 1.5;
      vector-effect: non-scaling-stroke;
    }
  </style>
  <g id="keyboard-skeleton" data-layout="ansi-104" data-role="keyboard-skeleton">
${keyGroups}
  </g>
</svg>
`;
}

function renderKeyRect(key, moduleName) {
  const x = MARGIN + key.x * PITCH;
  const y = MARGIN + key.y * PITCH;
  const width = (key.w ?? 1) * PITCH - GAP;
  const height = (key.h ?? 1) * PITCH - GAP;
  const row = getGearKeyboardSkeletonRow(key);

  return `    <rect class="key" data-code="${escapeXml(key.code)}" data-cluster="${escapeXml(key.cluster)}" data-module="${escapeXml(moduleName)}" data-row="${escapeXml(row)}" data-role="input-key" x="${x}" y="${y}" width="${width}" height="${height}" rx="5" />`;
}

export function getGearKeyboardSkeletonRow(key) {
  if (key.cluster === "system") {
    return "function-row";
  }

  if (key.cluster === "navigation") {
    return key.y === 1.5 ? "navigation-top-row" : "navigation-bottom-row";
  }

  if (key.cluster === "arrows") {
    return key.code === "ArrowUp" ? "arrow-up-row" : "arrow-bottom-row";
  }

  if (key.cluster === "numpad") {
    return getNumpadRow(key.y);
  }

  return getMainBlockRow(key.y);
}

function getMainBlockRow(y) {
  switch (y) {
    case 1.5:
      return "number-row";
    case 2.5:
      return "qwerty-row";
    case 3.5:
      return "home-row";
    case 4.5:
      return "shift-row";
    case 5.5:
      return "modifier-row";
    default:
      return "unknown-row";
  }
}

function getNumpadRow(y) {
  switch (y) {
    case 1.5:
      return "numpad-operation-row";
    case 2.5:
      return "numpad-7-row";
    case 3.5:
      return "numpad-4-row";
    case 4.5:
      return "numpad-1-row";
    case 5.5:
      return "numpad-0-row";
    default:
      return "unknown-row";
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
