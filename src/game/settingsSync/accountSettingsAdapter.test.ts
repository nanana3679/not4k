import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAccountSettingsAdapter } from './accountSettingsAdapter';
import { selectAccountSettings } from './accountSettingsSync';
import { DEFAULT_SETTINGS } from '../stores/gameStore';

function setupAdapter() {
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const abortSignal = vi.fn().mockReturnValue({ maybeSingle });
  const eq = vi.fn().mockReturnValue({ abortSignal });
  const select = vi.fn().mockReturnValue({ eq });
  const saveResponse = vi.fn().mockResolvedValue({ error: null });
  const upsert = vi.fn().mockReturnValue({ abortSignal: saveResponse });
  const from = vi.fn().mockReturnValue({ select, upsert });
  const adapter = createAccountSettingsAdapter({ from } as unknown as Pick<SupabaseClient, 'from'>);
  return { adapter, from, select, eq, abortSignal, maybeSingle, upsert, saveResponse };
}

describe('계정 설정 Supabase 어댑터', () => {
  it('불러오기 요청이 예외를 던지면 notFound가 아닌 failed를 반환한다', async () => {
    const test = setupAdapter();
    test.maybeSingle.mockRejectedValue(new Error('offline'));
    expect(await test.adapter.load('A', new AbortController().signal)).toEqual({ status: 'failed' });
  });

  it.each(['error', 'exception'])('A 저장의 %s 응답은 성공 대신 false를 반환한다', async failure => {
    const test = setupAdapter();
    if (failure === 'error') test.saveResponse.mockResolvedValue({ error: { message: 'denied' } });
    else test.saveResponse.mockRejectedValue(new Error('offline'));
    expect(await test.adapter.save('A', selectAccountSettings(DEFAULT_SETTINGS), new AbortController().signal)).toBe(false);
  });
  it('A의 scrollSpeed=900을 저장하면 user_id 충돌 기준으로 계정 설정만 upsert한다', async () => {
    const test = setupAdapter();
    const settings = selectAccountSettings({ ...DEFAULT_SETTINGS, scrollSpeed: 900 });
    const signal = new AbortController().signal;
    expect(await test.adapter.save('A', settings, signal)).toBe(true);
    expect(test.from).toHaveBeenCalledWith('user_settings');
    expect(test.upsert).toHaveBeenCalledWith({ user_id: 'A', settings }, { onConflict: 'user_id' });
    expect(test.saveResponse).toHaveBeenCalledWith(signal);
  });
  it.each([
    [{ data: { settings: { scrollSpeed: 1200 } }, error: null }, { status: 'found', settings: { scrollSpeed: 1200 } }],
    [{ data: null, error: null }, { status: 'notFound' }],
    [{ data: null, error: { message: 'offline' } }, { status: 'failed' }],
    [{ data: { settings: {} }, error: { message: 'denied' } }, { status: 'failed' }],
  ])('A의 maybeSingle 응답 %j를 읽으면 %j로 구분한다', async (response, expected) => {
    const test = setupAdapter();
    test.maybeSingle.mockResolvedValue(response);
    const signal = new AbortController().signal;
    expect(await test.adapter.load('A', signal)).toEqual(expected);
    expect(test.from).toHaveBeenCalledWith('user_settings');
    expect(test.select).toHaveBeenCalledWith('settings');
    expect(test.eq).toHaveBeenCalledWith('user_id', 'A');
    expect(test.abortSignal).toHaveBeenCalledWith(signal);
  });
});
