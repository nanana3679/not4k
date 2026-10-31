import { JudgmentMode } from '../../shared/constants/judgment';
import { SKIN_LIST } from '../skin/skins';
import { DEFAULT_SETTINGS, PRESET_BINDINGS, mergePersistedSettings, type GameSettings } from '../stores/gameStore';
import { RENDER_HEIGHT_OPTIONS, SETTING_SLIDER_RANGES } from '../stores/settingRanges';

// RFD 0102: 오프셋·볼륨과 이 브라우저의 최초 실행·디버그 상태는 계정과 동기화하지 않는다.
const DEVICE_LOCAL_KEYS = [
  'inputOffsetMs', 'visualOffsetMs', 'masterVolume', 'isFirstLaunch', 'debugMode',
] as const satisfies readonly (keyof GameSettings)[];

export type AccountSettings = Omit<GameSettings, typeof DEVICE_LOCAL_KEYS[number]>;

/** 서버에 업로드하는 본문. 마지막으로 불러온 서버 행에서 이 클라이언트가 모르는 키를 계정 설정 아래에 함께 보낸다. */
export type AccountSettingsUpload = Record<string, unknown> & AccountSettings;

export const ACCOUNT_SETTINGS_LOAD_FAILURE_MESSAGE = "Couldn't load your account settings. Using this browser's settings.";
export const ACCOUNT_SETTINGS_SAVE_FAILURE_MESSAGE = "Couldn't save settings to your account. They're kept in this browser.";

const accountKeys = (Object.keys(DEFAULT_SETTINGS) as (keyof GameSettings)[])
  .filter((key): key is keyof AccountSettings =>
    !(DEVICE_LOCAL_KEYS as readonly string[]).includes(key));

const judgmentModes: readonly unknown[] = Object.values(JudgmentMode);

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

function isAcceptedValue(key: keyof AccountSettings, value: unknown): boolean {
  if (!matchesShape(value, DEFAULT_SETTINGS[key])) return false;
  switch (key) {
    case 'keyBindings': {
      const lanes = Object.values(value as GameSettings['keyBindings']);
      const codes = lanes.flat();
      // 레인당 키 수 상한은 두지 않는다(keybinding 스펙). 크기는 전체 16KiB·키 코드 32자 제한이 막는다.
      return lanes.every(lane => lane.length >= 2)
        && codes.every(code => code.length <= 32)
        && new Set(codes).size === codes.length;
    }
    case 'preset': return Object.hasOwn(PRESET_BINDINGS, value as string);
    case 'judgmentMode': return judgmentModes.includes(value);
    // 목록에 없는 스킨은 받지 않고 로컬 스킨을 유지한다(로컬 복원은 기본 스킨으로 되돌린다).
    case 'skinId': return SKIN_LIST.some(skin => skin.theme.id === value);
    // 서버 값은 로컬 복원보다 엄격하게 받는다. 배속은 슬라이더 최솟값 이상, 해상도는 설정 UI 선택지만 받는다.
    case 'playSpeed': return (value as number) >= SETTING_SLIDER_RANGES.playSpeed.min;
    case 'renderHeight': return (RENDER_HEIGHT_OPTIONS as readonly number[]).includes(value as number);
    default: return true;
  }
}

/** 받을 수 있는 계정 설정 값만 고른다. 서버 행과 `unsyncedAccountSettings` 기록에 같은 규칙을 쓴다. */
function acceptedAccountSettings(values: unknown): Partial<AccountSettings> {
  if (!isObject(values)) return {};
  return Object.fromEntries(accountKeys
    .filter(key => Object.hasOwn(values, key) && isAcceptedValue(key, values[key]))
    .map(key => [key, values[key]])) as Partial<AccountSettings>;
}

/** 서버 값 중 받을 수 있는 계정 설정만 로컬 설정 위에 병합한다. 저장소에 쓰지 않는 순수 함수다. */
export function mergeAccountSettings(local: GameSettings, server: unknown): GameSettings {
  // 숫자의 설정 UI 범위 제한 등 로컬 복원과 같은 정규화를 함께 적용한다.
  return mergePersistedSettings({ settings: acceptedAccountSettings(server) }, { settings: local }).settings;
}

/** 첫 기동 프리셋 선택으로 정하는 두 키를 뺀다. */
function omitPresetChoice(account: AccountSettings): Partial<AccountSettings> {
  const { keyBindings: _keyBindings, preset: _preset, ...rest } = account;
  return rest;
}

/** JSON 값 비교. 객체는 키 순서와 관계없이 비교한다. */
function isSameJsonValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length
      && a.every((item, index) => isSameJsonValue(item, b[index]));
  }
  if (isObject(a) || isObject(b)) {
    return isObject(a) && isObject(b) && Object.keys(a).length === Object.keys(b).length
      && Object.keys(a).every(key => Object.hasOwn(b, key) && isSameJsonValue(a[key], b[key]));
  }
  return a === b;
}

/**
 * 사용자 id별로 아직 업로드하지 못한 계정 설정 키와 바꿀 때의 값. 브라우저의 모든 탭이 localStorage
 * `not4k-account-settings-unsynced` 하나를 함께 쓰며, 업로드에는 그 사용자 항목의 값만 쓴다.
 */
export type UnsyncedAccountSettings = Record<string, Partial<AccountSettings>>;

/** 저장된 원문을 읽는다. 형태가 틀리면 빈 기록으로, 항목 안의 모르는 키·받을 수 없는 값은 버린다. */
export function parseUnsyncedAccountSettings(raw: string | null): UnsyncedAccountSettings {
  let parsed: unknown;
  try {
    parsed = raw === null ? null : JSON.parse(raw);
  } catch {
    return {};
  }
  if (!isObject(parsed)) return {};
  const entries: UnsyncedAccountSettings = {};
  for (const [userId, entry] of Object.entries(parsed)) {
    const accepted = acceptedAccountSettings(entry);
    if (Object.keys(accepted).length > 0) entries[userId] = accepted;
  }
  return entries;
}

/** 이 클라이언트가 모르는 서버 키만 남긴다. 기기 전용 키도 알고 있는 키라 업로드하지 않는다. */
function unknownServerEntries(server: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(server).filter(([key]) => !Object.hasOwn(DEFAULT_SETTINGS, key)));
}

export type LoadAccountSettingsResult =
  | { status: 'found'; settings: Record<string, unknown> }
  | { status: 'notFound' }
  | { status: 'failed' };

/** `conflict`는 같은 `user_id` 행이 이미 있어 삽입하지 않았다는 뜻이다(덮어쓰지 않음). */
export type InsertAccountSettingsResult = 'inserted' | 'conflict' | 'failed';

export interface AccountSettingsIO {
  load: (userId: string, signal: AbortSignal) => Promise<LoadAccountSettingsResult>;
  insertIfAbsent: (userId: string, settings: Partial<AccountSettings>, signal: AbortSignal) => Promise<InsertAccountSettingsResult>;
  save: (userId: string, settings: AccountSettingsUpload, signal: AbortSignal) => Promise<boolean>;
}

export interface AccountSettingsStore {
  getSettings: () => GameSettings;
  applySettings: (settings: GameSettings) => void;
  subscribe: (listener: () => void) => () => void;
}

/** `unsyncedAccountSettings` 원문의 저장소. `null`을 쓰면 지운다. */
export interface UnsyncedAccountSettingsStorage {
  read: () => string | null;
  write: (raw: string | null) => void;
}

interface SyncOptions extends AccountSettingsIO {
  store: AccountSettingsStore;
  notice: (message: string) => void;
  unsyncedStorage: UnsyncedAccountSettingsStorage;
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
  /** 마지막으로 불러온 서버 행. 모르는 키를 저장 때 보존하는 데만 쓴다. */
  serverSettings: Record<string, unknown>;
}

export function createAccountSettingsSync({
  store, load, insertIfAbsent, save, notice, unsyncedStorage, timers,
}: SyncOptions) {
  let session: SyncSession | null = null;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: AccountSettings | null = null;
  let lastSettings = store.getSettings();
  let lastAccount = selectAccountSettings(lastSettings);
  // 같은 사용자의 불러오기 실패가 이어지는 동안(탭 재진입의 SIGNED_IN 등) 안내를 반복하지 않는다.
  let loadFailureNoticedUserId: string | null = null;
  // 불러온 결과를 로컬에 적용하는 갱신은 사용자의 변경이 아니므로 기록하지 않는다.
  let applyingLoadedSettings = false;

  function readUnsynced(): UnsyncedAccountSettings {
    return parseUnsyncedAccountSettings(unsyncedStorage.read());
  }

  function writeUnsynced(entries: UnsyncedAccountSettings) {
    unsyncedStorage.write(Object.keys(entries).length > 0 ? JSON.stringify(entries) : null);
  }

  /** 사용자가 바꾼 계정 설정 키와 그 값을 그 사용자 항목에 더한다. */
  function recordUnsynced(userId: string, changes: Partial<AccountSettings>) {
    const entries = readUnsynced();
    entries[userId] = { ...entries[userId], ...changes };
    writeUnsynced(entries);
  }

  /**
   * 업로드한 값과 아직 같은 기록만 지운다. 그 사이 이 탭이나 다른 탭이 기록한 더 새 값은 남는다.
   * localStorage에는 탭 사이 잠금이 없어, 이 읽기·쓰기 사이에 다른 탭이 기록한 값은 잃을 수 있다.
   */
  function clearUploadedUnsynced(userId: string, uploaded: Partial<AccountSettings>) {
    const entries = readUnsynced();
    const entry = entries[userId];
    if (!entry) return;
    const remaining = Object.fromEntries(Object.entries(entry)
      .filter(([key, value]) => !isSameJsonValue(value, uploaded[key as keyof AccountSettings])));
    if (Object.keys(remaining).length > 0) entries[userId] = remaining;
    else delete entries[userId];
    writeUnsynced(entries);
  }

  function applyLoadedSettings(settings: GameSettings) {
    applyingLoadedSettings = true;
    try {
      store.applySettings(settings);
    } finally {
      applyingLoadedSettings = false;
    }
  }

  function cancelSession() {
    session?.controller.abort();
    session = null;
    if (timer !== undefined) timers.clearTimeout(timer);
    timer = undefined;
    pending = null;
  }

  function noticeLoadFailure(userId: string) {
    if (loadFailureNoticedUserId === userId) return;
    loadFailureNoticedUserId = userId;
    notice(ACCOUNT_SETTINGS_LOAD_FAILURE_MESSAGE);
  }

  function markReady(current: SyncSession, serverSettings: Record<string, unknown>) {
    current.loading = false;
    current.ready = true;
    current.serverSettings = serverSettings;
    loadFailureNoticedUserId = null;
  }

  function schedule(account: AccountSettings) {
    pending = account;
    if (timer !== undefined) timers.clearTimeout(timer);
    timer = timers.setTimeout(flush, 500);
  }

  async function saveSettings(current: SyncSession, account: AccountSettings) {
    if (session !== current) return;
    current.saving = true;
    const saved = await save(current.userId, { ...unknownServerEntries(current.serverSettings), ...account },
      current.controller.signal);
    current.saving = false;
    if (session !== current) return;
    if (saved) clearUploadedUnsynced(current.userId, account);
    else notice(ACCOUNT_SETTINGS_SAVE_FAILURE_MESSAGE);
    if (timer === undefined) flush();
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
    const settings = store.getSettings();
    // 화면 전환 등 설정 밖의 상태 변경은 비교하지 않는다.
    if (settings === lastSettings) return;
    const before = lastSettings;
    const beforeAccount = lastAccount;
    lastSettings = settings;
    const account = selectAccountSettings(settings);
    const changedKeys = accountKeys.filter(key => !isSameJsonValue(account[key], beforeAccount[key]));
    if (changedKeys.length === 0) return;
    lastAccount = account;
    // 로그아웃 상태의 변경은 어느 계정의 것도 아니어서 기록하지 않는다.
    if (applyingLoadedSettings || !session) return;
    // 계정 행을 아직 모를 때(불러오는 중·불러오기 실패 뒤) 최초 실행 중에 일어난 갱신(첫 기동 프리셋 선택 등)은
    // 계정의 변경으로 기록하지 않아 다음 불러오기에서 계정의 바인딩을 덮지 않는다. 준비된 뒤의 선택은 기록한다.
    if (!before.isFirstLaunch || session.ready) {
      recordUnsynced(session.userId, Object.fromEntries(changedKeys.map(key => [key, account[key]])));
    }
    if (session.ready) schedule(account);
  });

  return {
    flush,
    async setUser(user: { id: string; is_anonymous?: boolean } | null) {
      if (disposed) return;
      const userId = user && !user.is_anonymous ? user.id : null;
      if (session?.userId === userId && (session.loading || session.ready)) return;
      // 로그아웃·계정 전환은 실패 안내 반복 억제를 끝낸다.
      if (userId !== loadFailureNoticedUserId) loadFailureNoticedUserId = null;
      cancelSession();
      if (!userId) return;
      const current: SyncSession = {
        userId, controller: new AbortController(), ready: false, loading: true, saving: false, serverSettings: {},
      };
      session = current;
      let result = await load(userId, current.controller.signal);
      // 로그아웃·계정 전환·해제 뒤에 완료된 요청은 적용하지 않는다.
      if (session !== current) return;
      if (result.status === 'notFound') {
        let snapshot: AccountSettings;
        let initial: Partial<AccountSettings>;
        try {
          // 기록이 있으면 로컬 위에 얹어 적용한 결과를 최초 업로드한다.
          const recorded = readUnsynced()[userId];
          if (recorded) applyLoadedSettings(mergeAccountSettings(store.getSettings(), recorded));
          snapshot = selectAccountSettings(store.getSettings());
          // 최초 실행 중에는 고르지 않은 기본 keyBindings·preset을 계정에 싣지 않는다. 다른 새 브라우저가
          // 그 행으로 프리셋 선택을 건너뛰지 않게 하며, 프리셋을 고른 뒤의 저장이 두 키를 채운다.
          initial = store.getSettings().isFirstLaunch ? omitPresetChoice(snapshot) : snapshot;
        } catch {
          current.loading = false;
          noticeLoadFailure(userId);
          return;
        }
        const insertResult = await insertIfAbsent(userId, initial, current.controller.signal);
        if (session !== current) return;
        if (insertResult === 'inserted') {
          markReady(current, {});
          clearUploadedUnsynced(userId, initial);
          // 삽입하는 동안 바뀐 설정(프리셋 선택 포함)만 이어서 저장한다. 뺀 두 키만으로는 저장하지 않는다.
          const latest = selectAccountSettings(store.getSettings());
          if (!isSameJsonValue(latest, snapshot)) schedule(latest);
          return;
        }
        // 읽을 때 숨겨졌던 기존 행은 덮어쓰지 않고 한 번만 다시 읽는다.
        result = insertResult === 'conflict' ? await load(userId, current.controller.signal) : { status: 'failed' };
        if (session !== current) return;
      }
      current.loading = false;
      if (result.status === 'found') {
        const serverSettings = result.settings;
        try {
          if (new TextEncoder().encode(JSON.stringify(serverSettings)).byteLength <= 16 * 1024) {
            // 서버 행을 적용하고, 이 사용자의 기록이 있으면 그 값을 위에 얹어 적용한 뒤 업로드한다.
            const recorded = readUnsynced()[userId];
            const merged = mergeAccountSettings(store.getSettings(), serverSettings);
            const next = recorded ? mergeAccountSettings(merged, recorded) : merged;
            // 받을 수 있는 서버 keyBindings가 있을 때만 최초 실행(프리셋 선택)을 끝내 계정의 바인딩을 쓴다.
            const endsFirstLaunch = Object.hasOwn(acceptedAccountSettings(serverSettings), 'keyBindings');
            applyLoadedSettings(endsFirstLaunch ? { ...next, isFirstLaunch: false } : next);
            markReady(current, serverSettings);
            if (recorded) {
              pending = selectAccountSettings(store.getSettings());
              flush();
            }
            return;
          }
        } catch { /* 로컬 저장까지 성공하기 전에는 업로드를 허용하지 않는다. */ }
      }
      noticeLoadFailure(userId);
    },
    dispose() {
      disposed = true;
      cancelSession();
      unsubscribe();
    },
  };
}
