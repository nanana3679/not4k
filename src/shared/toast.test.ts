import { beforeEach, describe, expect, it, vi } from 'vitest';

const sonner = vi.hoisted(() => ({
  toast: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(sonner.toast, {
    error: sonner.error,
    info: sonner.info,
    warning: sonner.warning,
  }),
}));

import { showToast } from './toast';

describe('showToast', () => {
  beforeEach(() => {
    sonner.toast.mockClear();
    sonner.error.mockClear();
    sonner.info.mockClear();
    sonner.warning.mockClear();
  });

  it('uses the neutral Sonner toast for info messages', () => {
    showToast('Saved', 'info');

    expect(sonner.toast).toHaveBeenCalledWith('Saved');
    expect(sonner.error).not.toHaveBeenCalled();
    expect(sonner.warning).not.toHaveBeenCalled();
  });

  it('maps warnings to Sonner warning toasts', () => {
    showToast('Check the chart', 'warn');

    expect(sonner.warning).toHaveBeenCalledWith('Check the chart');
    expect(sonner.toast).not.toHaveBeenCalled();
  });

  it('maps errors to Sonner error toasts', () => {
    showToast('Save failed', 'error');

    expect(sonner.error).toHaveBeenCalledWith('Save failed');
    expect(sonner.toast).not.toHaveBeenCalled();
  });
});
