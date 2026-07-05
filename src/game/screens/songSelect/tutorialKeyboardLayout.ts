import type { TutorialInputTiming } from './tutorialPreviewChart';
import { KB_NUMPAD_KEYS, KB_TKL_KEYS, type KbKeyDef } from '../../renderer/keyboardLayout';

export type TutorialKeyboardPreset = 'tkl' | 'numpad';

export interface TutorialKeyBindings {
  lane1: string[];
  lane2: string[];
  lane3: string[];
  lane4: string[];
}

export interface TutorialKeyboardLayout {
  keys: readonly KbKeyDef[];
  widthUnits: number;
  heightUnits: number;
}

const KEY_LABELS = new Map(
  [...KB_TKL_KEYS, ...KB_NUMPAD_KEYS].map((key) => [key.code, key.label]),
);
const NUMPAD_KEY_POSITIONS = new Map(
  KB_NUMPAD_KEYS.map((key) => [key.code, { x: key.x, y: key.y }]),
);
const EQUIVALENT_BINDING_SLOTS_BY_LANE: Record<number, readonly (readonly string[])[]> = {
  1: [
    ['KeyQ'],
    ['KeyW'],
    ['KeyS'],
    ['KeyX'],
  ],
  2: [
    ['KeyE'],
    ['KeyD'],
    ['KeyC'],
    ['KeyO', 'PageDown'],
  ],
  3: [
    ['KeyP', 'Numpad7'],
    ['KeyL', 'Numpad4'],
    ['Comma', 'Numpad1'],
    ['KeyR'],
  ],
  4: [
    ['BracketLeft', 'Numpad8'],
    ['BracketRight', 'Numpad9'],
    ['Semicolon', 'Numpad5'],
    ['Period', 'Numpad2'],
  ],
};

function getLaneBindings(bindings: TutorialKeyBindings, lane: number): string[] {
  switch (lane) {
    case 1:
      return bindings.lane1;
    case 2:
      return bindings.lane2;
    case 3:
      return bindings.lane3;
    case 4:
      return bindings.lane4;
    default:
      return [];
  }
}

function getBindingSlotIndex(keyCode: string): number | null {
  const match = /^Binding([1-4])$/.exec(keyCode);
  if (!match) return null;

  return Number(match[1]) - 1;
}

function getSourceSlotIndex(
  sourceKeySlotsByLane: Map<number, string[]>,
  lane: number,
  keyCode: string,
): number {
  const sourceKeySlots = sourceKeySlotsByLane.get(lane) ?? [];
  let slotIndex = sourceKeySlots.indexOf(keyCode);

  if (slotIndex === -1) {
    slotIndex = sourceKeySlots.length;
    sourceKeySlots.push(keyCode);
    sourceKeySlotsByLane.set(lane, sourceKeySlots);
  }

  return slotIndex;
}

function getEquivalentBindingSlotIndex(lane: number, keyCode: string): number | null {
  const slots = EQUIVALENT_BINDING_SLOTS_BY_LANE[lane] ?? [];
  const slotIndex = slots.findIndex((slotKeyCodes) => slotKeyCodes.includes(keyCode));

  return slotIndex === -1 ? null : slotIndex;
}

export function getTutorialKeyboardLabel(keyCode: string): string {
  return KEY_LABELS.get(keyCode) ?? keyCode.replace(/^Key/, '').replace(/^Numpad/, '');
}

export function getTutorialKeyboardLayout(preset: TutorialKeyboardPreset): TutorialKeyboardLayout {
  const keys = preset === 'numpad'
    ? [...KB_TKL_KEYS, ...KB_NUMPAD_KEYS]
    : KB_TKL_KEYS;
  const widthUnits = Math.max(...keys.map((key) => key.x + (key.w ?? 1)));
  const heightUnits = Math.max(...keys.map((key) => key.y + (key.h ?? 1)));

  return {
    keys,
    widthUnits,
    heightUnits,
  };
}

export function sortLaneKeysForLabel<T extends { keyCode: string }>(keys: readonly T[]): T[] {
  if (!keys.every((key) => NUMPAD_KEY_POSITIONS.has(key.keyCode))) {
    return [...keys];
  }

  return [...keys].sort((a, b) => {
    const aPosition = NUMPAD_KEY_POSITIONS.get(a.keyCode);
    const bPosition = NUMPAD_KEY_POSITIONS.get(b.keyCode);
    if (!aPosition || !bPosition) return 0;
    return bPosition.y - aPosition.y || aPosition.x - bPosition.x;
  });
}

export function resolveTutorialInputTimingsForKeyboard(
  timings: readonly TutorialInputTiming[],
  bindings: TutorialKeyBindings,
): TutorialInputTiming[] {
  const sourceKeySlotsByLane = new Map<number, string[]>();

  return timings.map((timing) => {
    const { event } = timing;
    const laneBindings = getLaneBindings(bindings, event.lane);
    const explicitSlotIndex = getBindingSlotIndex(event.keyCode);
    const equivalentSlotIndex = getEquivalentBindingSlotIndex(event.lane, event.keyCode);
    const mappedKeyCode = explicitSlotIndex !== null
      ? laneBindings[explicitSlotIndex] ?? laneBindings[laneBindings.length - 1] ?? event.keyCode
      : laneBindings.includes(event.keyCode)
        ? event.keyCode
        : equivalentSlotIndex !== null
          ? laneBindings[equivalentSlotIndex] ?? laneBindings[laneBindings.length - 1] ?? event.keyCode
        : laneBindings[getSourceSlotIndex(sourceKeySlotsByLane, event.lane, event.keyCode)] ??
          laneBindings[laneBindings.length - 1] ??
          event.keyCode;

    return {
      ...timing,
      event: {
        ...event,
        keyCode: mappedKeyCode,
        keyLabel: getTutorialKeyboardLabel(mappedKeyCode),
      },
    };
  });
}
