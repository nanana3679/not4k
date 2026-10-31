import { DEFAULT_SETTINGS, mergePersistedSettings, type GameSettings } from '../stores/gameStore';

// RFD 0102: 오프셋·볼륨과 이 브라우저의 최초 실행·디버그 상태는 계정과 동기화하지 않는다.
const DEVICE_LOCAL_KEYS = [
  'inputOffsetMs', 'visualOffsetMs', 'masterVolume', 'isFirstLaunch', 'debugMode',
] as const satisfies readonly (keyof GameSettings)[];

export type AccountSettings = Omit<GameSettings, typeof DEVICE_LOCAL_KEYS[number]>;

export const ACCOUNT_SETTINGS_LOAD_FAILURE_MESSAGE = "Couldn't load your account settings. Using this browser's settings.";

const accountKeys = (Object.keys(DEFAULT_SETTINGS) as (keyof GameSettings)[])
  .filter((key): key is keyof AccountSettings =>
    !(DEVICE_LOCAL_KEYS as readonly string[]).includes(key));

export function selectAccountSettings(settings: GameSettings): AccountSettings {
  return Object.fromEntries(accountKeys.map(key => [key, settings[key]])) as AccountSettings;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function matchesShape(value: unknown, example: unknown): boolean {
  if (typeof example === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (typeof example === 'string') return typeof value === 'string' && value.length <= 64;
  if (Array.isArray(example)) {
    return Array.isArray(value) && value.every(item => typeof item === 'string');
  }
  if (isObject(example)) {
    return isObject(value) && Object.keys(value).length === Object.keys(example).length
      && Object.keys(example).every(key => Object.hasOwn(value, key) && matchesShape(value[key], example[key]));
  }
  return typeof value === typeof example;
}

export function applyAccountSettings(local: GameSettings, server: unknown): GameSettings {
  const values = isObject(server) ? server : {};
  const accepted = Object.fromEntries(accountKeys
    .filter(key => {
      if (!Object.hasOwn(values, key) || !matchesShape(values[key], DEFAULT_SETTINGS[key])) return false;
      if (key === 'keyBindings') {
        const bindings = values[key] as GameSettings['keyBindings'];
        const lanes = Object.values(bindings);
        const codes = lanes.flat();
        return lanes.every(lane => lane.length >= 2 && lane.length <= 16)
          && codes.every(code => code.length <= 32)
          && new Set(codes).size === codes.length;
      }
      if (key === 'preset') return values[key] === 'tkl' || values[key] === 'numpad';
      if (key === 'judgmentMode') return values[key] === 'normal' || values[key] === 'easy';
      return true;
    })
    .map(key => [key, values[key]]));
  return mergePersistedSettings({ settings: accepted }, { settings: local }).settings;
}

export type LoadAccountSettingsResult =
  | { status: 'found'; settings: unknown }
  | { status: 'notFound' }
  | { status: 'failed' };

export type InsertAccountSettingsResult = 'inserted' | 'ignored' | 'failed';

export interface AccountSettingsIO {
  load: (userId: string, signal: AbortSignal) => Promise<LoadAccountSettingsResult>;
  insertIfAbsent: (userId: string, settings: AccountSettings, signal: AbortSignal) => Promise<InsertAccountSettingsResult>;
  save: (userId: string, settings: AccountSettings, signal: AbortSignal) => Promise<boolean>;
}

export interface AccountSettingsStore {
  getSettings: () => GameSettings;
  applySettings: (settings: GameSettings) => void;
  subscribe: (listener: () => void) => () => void;
}

interface SyncOptions extends AccountSettingsIO {
  store: AccountSettingsStore;
  notice: (message: string) => void;
  timers: {
    setTimeout: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
    clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
  };
}

interface SyncSession {
  userId: string;
  controller: AbortController;
  ready: boolean;
  loading: boolean;
  saving: boolean;
}

export function createAccountSettingsSync({ store, load, insertIfAbsent, save, notice, timers }: SyncOptions) {
  let session: SyncSession | null = null;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: AccountSettings | null = null;
  let previous = JSON.stringify(selectAccountSettings(store.getSettings()));

  function cancelSession() {
    session?.controller.abort();
    session = null;
    if (timer !== undefined) timers.clearTimeout(timer);
    timer = undefined;
    pending = null;
  }

  async function saveSettings(current: SyncSession, account: AccountSettings) {
    if (session !== current) return;
    current.saving = true;
    const saved = await save(current.userId, account, current.controller.signal);
    current.saving = false;
    if (session === current && !saved) {
      notice("Couldn't save settings to your account. They're kept in this browser.");
    }
    if (session === current && timer === undefined) flush();
  }

  function flush() {
    if (timer !== undefined) timers.clearTimeout(timer);
    timer = undefined;
    if (!session?.ready || session.saving || !pending) return;
    const account = pending;
    pending = null;
    void saveSettings(session, account);
  }

  const unsubscribe = store.subscribe(() => {
    const account = selectAccountSettings(store.getSettings());
    const serialized = JSON.stringify(account);
    if (serialized === previous) return;
    previous = serialized;
    if (!session?.ready) return;
    pending = account;
    if (timer !== undefined) timers.clearTimeout(timer);
    timer = timers.setTimeout(flush, 500);
  });

  return {
    flush,
    async setUser(user: { id: string; is_anonymous?: boolean } | null) {
      if (disposed) return;
      const userId = user && !user.is_anonymous ? user.id : null;
      if (session?.userId === userId && (session.loading || session.ready)) return;
      cancelSession();
      if (!userId) return;
      const current: SyncSession = {
        userId, controller: new AbortController(), ready: false, loading: true, saving: false,
      };
      session = current;
      let result = await load(userId, current.controller.signal);
      // 로그아웃·계정 전환·해제 뒤에 완료된 요청은 적용하지 않는다.
      if (session !== current) return;
      if (result.status === 'notFound') {
        const initial = selectAccountSettings(store.getSettings());
        const inserted = await insertIfAbsent(userId, initial, current.controller.signal);
        if (session !== current) return;
        if (inserted === 'inserted') {
          current.loading = false;
          current.ready = true;
          const latest = selectAccountSettings(store.getSettings());
          if (JSON.stringify(latest) !== JSON.stringify(initial)) {
            pending = latest;
            timer = timers.setTimeout(flush, 500);
          }
          return;
        }
        // 읽을 때 숨겨졌던 기존 행은 덮어쓰지 않고 한 번만 다시 읽는다.
        result = inserted === 'ignored' ? await load(userId, current.controller.signal) : { status: 'failed' };
        if (session !== current) return;
      }
      current.loading = false;
      if (result.status === 'found') {
        try {
          if (new TextEncoder().encode(JSON.stringify(result.settings)).byteLength <= 16 * 1024) {
            store.applySettings(applyAccountSettings(store.getSettings(), result.settings));
            current.ready = true;
            return;
          }
        } catch { /* 로컬 저장까지 성공하기 전에는 업로드를 허용하지 않는다. */ }
      }
      notice(ACCOUNT_SETTINGS_LOAD_FAILURE_MESSAGE);
    },
    dispose() {
      disposed = true;
      cancelSession();
      unsubscribe();
    },
  };
}
