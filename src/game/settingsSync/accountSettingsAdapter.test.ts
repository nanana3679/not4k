import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createAccountSettingsAdapter } from './accountSettingsAdapter';
import { selectAccountSettings } from './accountSettingsSync';
import { DEFAULT_SETTINGS } from '../stores/gameStore';

function setupHttpAdapter(status: number, body: string | null, now?: () => Date) {
  const fetch = vi.fn().mockResolvedValue(new Response(body, { status }));
  // 앱 클라이언트를 가져오지 않고, SDK가 요청하기 전에 fetch를 대체한다.
  vi.stubGlobal('fetch', fetch);
  const client = createClient('https://settings-test.supabase.co', 'dummy-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { adapter: createAccountSettingsAdapter(client, now), fetch };
}

afterEach(() => vi.unstubAllGlobals());

describe('실제 Supabase SDK의 계정 설정 응답 분류', () => {
  it('10월 30일 최초 삽입과 31일 일반 저장은 각각의 updated_at을 보내고 일반 저장은 충돌 행을 갱신한다', async () => {
    const now = vi.fn().mockReturnValueOnce(new Date('2026-10-30T10:00:00.000Z'))
      .mockReturnValueOnce(new Date('2026-10-31T11:00:00.000Z'));
    const { adapter, fetch } = setupHttpAdapter(201, '[{"user_id":"A"}]', now);
    const settings = selectAccountSettings(DEFAULT_SETTINGS);
    const signal = new AbortController().signal;
    expect(await adapter.insertIfAbsent('A', settings, signal)).toBe('inserted');
    fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await adapter.save('A', settings, signal)).toBe(true);
    expect(fetch.mock.calls.map(([, request]) => JSON.parse(request.body).updated_at))
      .toEqual(['2026-10-30T10:00:00.000Z', '2026-10-31T11:00:00.000Z']);
    const [url, request] = fetch.mock.calls[1];
    expect(new URL(url).searchParams.get('on_conflict')).toBe('user_id');
    expect(new Headers(request.headers).get('Prefer')).toContain('resolution=merge-duplicates');
  });
  it.each([
    ['null', null], ['배열', []], ['문자열', 'settings'], ['숫자', 123], ['불리언', true], ['누락', undefined],
  ])(
    'HTTP 200 행의 settings가 %s이면 failed를 반환한다', async (_label, settings) => {
      const { adapter } = setupHttpAdapter(200, JSON.stringify([{ settings }]));
      expect(await adapter.load('A', new AbortController().signal)).toEqual({ status: 'failed' });
    },
  );
  it.each([
    [201, '[{"user_id":"A"}]', 'inserted'],
    [200, '[]', 'ignored'],
    [401, '{"message":"denied"}', 'failed'],
    [204, null, 'failed'],
  ] as const)('최초 업로드 HTTP %i·본문 %s는 %s이며 기존 행을 덮어쓰지 않는 요청을 보낸다', async (status, body, expected) => {
    const { adapter, fetch } = setupHttpAdapter(status, body);
    const settings = selectAccountSettings(DEFAULT_SETTINGS);
    const signal = new AbortController().signal;
    expect(await adapter.insertIfAbsent('A', settings, signal)).toBe(expected);
    const [url, request] = fetch.mock.calls[0];
    expect(new URL(url).pathname).toBe('/rest/v1/user_settings');
    expect(new URL(url).searchParams.get('on_conflict')).toBe('user_id');
    expect(new URL(url).searchParams.get('select')).toBe('user_id');
    const headers = new Headers(request.headers);
    expect(headers.get('Prefer')).toContain('resolution=ignore-duplicates');
    expect(headers.get('Prefer')).toContain('return=representation');
    expect(JSON.parse(request.body)).toMatchObject({ user_id: 'A', settings });
    expect(request.signal).toBe(signal);
  });
  it.each([
    [200, '[]', { status: 'notFound' }],
    [200, '[{"settings":{"scrollSpeed":1200}}]', { status: 'found', settings: { scrollSpeed: 1200 } }],
    [204, null, { status: 'failed' }],
    [404, '', { status: 'failed' }],
    [401, '{"message":"denied"}', { status: 'failed' }],
    [500, '{"message":"offline"}', { status: 'failed' }],
  ] as const)('HTTP %i·본문 %s를 읽으면 %j로 분류한다', async (status, body, expected) => {
    const { adapter, fetch } = setupHttpAdapter(status, body);
    expect(await adapter.load('A', new AbortController().signal)).toEqual(expected);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

function setupAdapter() {
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null, status: 200 });
  const abortSignal = vi.fn().mockReturnValue({ maybeSingle });
  const eq = vi.fn().mockReturnValue({ abortSignal });
  const select = vi.fn().mockReturnValue({ eq });
  const saveResponse = vi.fn().mockResolvedValue({ error: null, status: 200 });
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
    expect(test.upsert).toHaveBeenCalledWith({ user_id: 'A', settings, updated_at: expect.any(String) }, { onConflict: 'user_id' });
    expect(test.saveResponse).toHaveBeenCalledWith(signal);
  });
  it.each([
    [{ data: { settings: { scrollSpeed: 1200 } }, error: null, status: 200 }, { status: 'found', settings: { scrollSpeed: 1200 } }],
    [{ data: null, error: null, status: 200 }, { status: 'notFound' }],
    [{ data: null, error: { message: 'offline' }, status: 200 }, { status: 'failed' }],
    [{ data: { settings: {} }, error: { message: 'denied' }, status: 200 }, { status: 'failed' }],
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
