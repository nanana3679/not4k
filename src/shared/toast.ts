import { toast } from 'sonner';
import type { ToasterProps } from 'sonner';

export type ToastType = 'info' | 'warn' | 'error';
export const SONNER_TOASTER_POSITION: NonNullable<ToasterProps['position']> = 'bottom-center';

export function showToast(message: string, type: ToastType = 'info') {
  if (type === 'error') {
    toast.error(message);
    return;
  }

  if (type === 'warn') {
    toast.warning(message);
    return;
  }

  toast(message);
}
