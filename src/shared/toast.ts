import { toast } from 'sonner';

export type ToastType = 'info' | 'warn' | 'error';

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
