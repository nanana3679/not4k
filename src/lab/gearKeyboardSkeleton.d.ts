export type GearKeyboardCluster = 'system' | 'main' | 'navigation' | 'arrows' | 'numpad';

export interface GearKeyboardSkeletonKey {
  readonly code: string;
  readonly cluster: GearKeyboardCluster;
  readonly x: number;
  readonly y: number;
  readonly w?: number;
  readonly h?: number;
}

export interface GearKeyboardSkeletonModule {
  readonly id: string;
  readonly module: string;
  readonly cluster: GearKeyboardCluster;
}

export interface GearKeyboardSkeletonMetrics {
  readonly pitch: number;
  readonly gap: number;
  readonly margin: number;
  readonly width: number;
  readonly height: number;
}

export const GEAR_KEYBOARD_EXPECTED_CODES: string[];
export const GEAR_KEYBOARD_SKELETON_KEYS: readonly GearKeyboardSkeletonKey[];
export const GEAR_KEYBOARD_CLUSTER_COUNTS: Readonly<Record<GearKeyboardCluster, number>>;
export const GEAR_KEYBOARD_MODULES: readonly GearKeyboardSkeletonModule[];

export function validateGearKeyboardSkeletonLayout(keys?: readonly GearKeyboardSkeletonKey[]): string[];
export function getGearKeyboardSkeletonMetrics(keys?: readonly GearKeyboardSkeletonKey[]): GearKeyboardSkeletonMetrics;
export function renderGearKeyboardSkeletonSvg(keys?: readonly GearKeyboardSkeletonKey[]): string;
export function getGearKeyboardSkeletonRow(key: GearKeyboardSkeletonKey): string;
