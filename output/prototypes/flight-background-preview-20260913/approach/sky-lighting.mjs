// 기존 하늘의 밝기를 상한으로 삼는 이륙 시연용 감쇠다.
export function skyBrightness(altitude) {
  const a = Number.isFinite(altitude) ? altitude : .95;
  const t = Math.max(0, Math.min(1, (a - .03) / (.95 - .03)));
  return .15 + .85 * t * t * (3 - 2 * t);
}

export function dimSky(context, view) {
  const brightness = skyBrightness(view.altitude);
  const skyHeight = Math.min(view.height, view.horizon);
  if (!view.showSky || !(skyHeight > 0) || brightness === 1) return;
  context.save();
  context.fillStyle = '#000';
  context.globalAlpha = 1 - brightness;
  context.fillRect(0, 0, view.width, skyHeight);
  context.restore();
}
