import { DEFAULT_SETTINGS, mergePersistedSettings, type GameSettings } from '../stores/gameStore';

// RFD 0102: 오프셋·볼륨과 이 브라우저의 최초 실행·디버그 상태는 계정과 동기화하지 않는다.
const DEVICE_LOCAL_KEYS = [
  'inputOffsetMs', 'visualOffsetMs', 'masterVolume', 'isFirstLaunch', 'debugMode',
] as const satisfies readonly (keyof GameSettings)[];

export type AccountSettings = Omit<GameSettings, typeof DEVICE_LOCAL_KEYS[number]>;

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

export interface AccountSettingsIO {
  load: (userId: string, signal: AbortSignal) => Promise<LoadAccountSettingsResult>;
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

export function createAccountSettingsSync({ store, load, save, notice, timers }: SyncOptions) {
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
      const result = await load(userId, current.controller.signal);
      // 로그아웃·계정 전환·해제 뒤에 완료된 요청은 적용하지 않는다.
      if (session !== current) return;
      current.loading = false;
      if (result.status === 'found') {
        store.applySettings(applyAccountSettings(store.getSettings(), result.settings));
        current.ready = true;
      } else if (result.status === 'notFound') {
        current.ready = true;
        await saveSettings(current, selectAccountSettings(store.getSettings()));
      } else {
        notice("Couldn't load your account settings. Using this browser's settings.");
      }
    },
    dispose() {
      disposed = true;
      cancelSession();
      unsubscribe();
    },
  };
}
