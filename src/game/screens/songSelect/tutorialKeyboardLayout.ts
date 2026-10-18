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

export interface TutorialKeyboardBindingResolution {
  readonly bindings: TutorialKeyBindings;
  readonly supplementedLanes: readonly number[];
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

function getEquivalentBindingCandidates(lane: number, slotIndex: number): readonly string[] {
  return EQUIVALENT_BINDING_SLOTS_BY_LANE[lane]?.[slotIndex] ?? [];
}

function getLaneBindingProperty(lane: number): keyof TutorialKeyBindings {
  return `lane${lane}` as keyof TutorialKeyBindings;
}

/**
 * Tutorial-only binding completion. It copies the user's bindings and fills
 * only source slots required by the preview; it never writes to game settings.
 */
export function resolveTutorialKeyboardBindings(
  timings: readonly TutorialInputTiming[],
  bindings: TutorialKeyBindings,
  preset: TutorialKeyboardPreset,
): TutorialKeyboardBindingResolution {
  const resolved: TutorialKeyBindings = {
    lane1: [...bindings.lane1], lane2: [...bindings.lane2],
    lane3: [...bindings.lane3], lane4: [...bindings.lane4],
  };
  const sourceSlotsByLane = new Map<number, string[]>();
  const requiredSlotsByLane = new Map<number, number>();
  const sourceKeysByLane = new Map<number, Set<string>>();
  const mappedKeysByLane = new Map<number, Set<string>>();
  for (const { event } of resolveTutorialInputTimingsForKeyboard(timings, bindings)) {
    const keys = mappedKeysByLane.get(event.lane) ?? new Set<string>();
    keys.add(event.keyCode);
    mappedKeysByLane.set(event.lane, keys);
  }

  for (const { event } of timings) {
    const explicitSlot = getBindingSlotIndex(event.keyCode);
    const equivalentSlot = getEquivalentBindingSlotIndex(event.lane, event.keyCode);
    const sourceKeys = sourceKeysByLane.get(event.lane) ?? new Set<string>();
    const canonicalSlot = explicitSlot ?? equivalentSlot;
    sourceKeys.add(canonicalSlot === null ? event.keyCode : `slot:${canonicalSlot}`);
    sourceKeysByLane.set(event.lane, sourceKeys);
    const sourceSlots = sourceSlotsByLane.get(event.lane) ?? [];
    let slot: number;
    if (explicitSlot !== null) {
      slot = explicitSlot;
    } else if (equivalentSlot !== null) {
      slot = equivalentSlot;
    } else {
      slot = sourceSlots.indexOf(event.keyCode);
      if (slot === -1) {
        slot = sourceSlots.length;
        sourceSlots.push(event.keyCode);
      }
    }
    sourceSlotsByLane.set(event.lane, sourceSlots);
    requiredSlotsByLane.set(event.lane, Math.max(requiredSlotsByLane.get(event.lane) ?? 0, slot + 1));
  }

  const visibleCodes = new Set(getTutorialKeyboardLayout(preset).keys.map(key => key.code));
  // Supplement with ordinary playing keys, never menu controls such as Escape.
  const fallbackCodes = [...visibleCodes].filter(code => /^(Key[A-Z]|Digit[0-9]|Numpad[0-9])$/.test(code));
  const occupied = new Set(Object.values(resolved).flat());
  const supplementedLanes: number[] = [];
  for (const [lane, required] of requiredSlotsByLane) {
    // Sparse source slots (e.g. Basic's Binding1/Binding3) already work with
    // two keys. Complete the layout only if distinct inputs would collapse.
    if (mappedKeysByLane.get(lane)?.size === sourceKeysByLane.get(lane)?.size) continue;
    const property = getLaneBindingProperty(lane);
    const laneBindings = resolved[property];
    let supplemented = false;
    for (let slot = laneBindings.length; slot < required && slot < 4; slot++) {
      const candidate = [
        ...getEquivalentBindingCandidates(lane, slot),
        ...fallbackCodes,
      ].find(code => visibleCodes.has(code) && !occupied.has(code));
      if (!candidate) break;
      laneBindings.push(candidate);
      occupied.add(candidate);
      supplemented = true;
    }
    if (supplemented) supplementedLanes.push(lane);
  }

  return { bindings: resolved, supplementedLanes };
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
      : equivalentSlotIndex !== null
          ? laneBindings[equivalentSlotIndex] ?? laneBindings[laneBindings.length - 1] ?? event.keyCode
        : laneBindings.includes(event.keyCode)
          ? event.keyCode
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
