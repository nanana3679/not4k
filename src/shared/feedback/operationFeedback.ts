export type OperationKind =
  | "editor.pageLoad"
  | "editor.initialAudioLoad"
  | "editor.audioReload"
  | "game.songLoad"
  | "songList.initialLoad"
  | "songList.refresh"
  | "chart.save"
  | "chart.saveAs"
  | "chart.delete"
  | "song.create"
  | "song.delete"
  | "auth.action";

export type OperationLoadingSurface =
  | "solidPage"
  | "transparentPage"
  | "overlay"
  | "inline"
  | "button"
  | null;

const loadingSurfaceByOperation: Record<OperationKind, Exclude<OperationLoadingSurface, null>> = {
  "editor.pageLoad": "solidPage",
  "editor.initialAudioLoad": "transparentPage",
  "editor.audioReload": "overlay",
  "game.songLoad": "solidPage",
  "songList.initialLoad": "solidPage",
  "songList.refresh": "button",
  "chart.save": "button",
  "chart.saveAs": "button",
  "chart.delete": "button",
  "song.create": "button",
  "song.delete": "button",
  "auth.action": "button",
};

export function getOperationLoadingSurface(input: {
  operation: OperationKind;
  running: boolean;
}): OperationLoadingSurface {
  if (!input.running) return null;
  return loadingSurfaceByOperation[input.operation];
}
