import { JudgmentMode } from '../../shared/constants/judgment';
import { SKIN_LIST } from '../skin/skins';
import { DEFAULT_SETTINGS, PRESET_BINDINGS, mergePersistedSettings, type GameSettings } from '../stores/gameStore';

// RFD 0102: 오프셋·볼륨과 이 브라우저의 최초 실행·디버그 상태는 계정과 동기화하지 않는다.
const DEVICE_LOCAL_KEYS = [
  'inputOffsetMs', 'visualOffsetMs', 'masterVolume', 'isFirstLaunch', 'debugMode',
] as const satisfies readonly (keyof GameSettings)[];

export type AccountSettings = Omit<GameSettings, typeof DEVICE_LOCAL_KEYS[number]>;

/** 서버에 올리는 본문. 마지막으로 불러온 서버 행에서 이 클라이언트가 모르는 키를 계정 설정 아래에 함께 보낸다. */
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

/** 서버 값 중 받을 수 있는 계정 설정만 로컬 설정 위에 병합한다. 저장소에 쓰지 않는 순수 함수다. */
export function mergeAccountSettings(local: GameSettings, server: unknown): GameSettings {
  const values = isObject(server) ? server : {};
  const accepted = Object.fromEntries(accountKeys
    .filter(key => {
      if (!Object.hasOwn(values, key) || !matchesShape(values[key], DEFAULT_SETTINGS[key])) return false;
      if (key === 'keyBindings') {
        const bindings = values[key] as GameSettings['keyBindings'];
        const lanes = Object.values(bindings);
        const codes = lanes.flat();
        // 레인당 키 수 상한은 두지 않는다(keybinding 스펙). 크기는 전체 16KiB·키 코드 32자 제한이 막는다.
        return lanes.every(lane => lane.length >= 2)
          && codes.every(code => code.length <= 32)
          && new Set(codes).size === codes.length;
      }
      if (key === 'preset') return Object.hasOwn(PRESET_BINDINGS, values[key] as string);
      if (key === 'judgmentMode') return judgmentModes.includes(values[key]);
      // 목록에 없는 스킨은 받지 않고 로컬 스킨을 유지한다(로컬 복원은 기본 스킨으로 되돌린다).
      if (key === 'skinId') return SKIN_LIST.some(skin => skin.theme.id === values[key]);
      return true;
    })
    .map(key => [key, values[key]]));
  // 숫자의 설정 UI 범위 제한 등 로컬 복원과 같은 정규화를 함께 적용한다.
  return mergePersistedSettings({ settings: accepted }, { settings: local }).settings;
}

/** 이 클라이언트가 모르는 서버 키만 남긴다. 기기 전용 키도 알고 있는 키라 올리지 않는다. */
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
  insertIfAbsent: (userId: string, settings: AccountSettings, signal: AbortSignal) => Promise<InsertAccountSettingsResult>;
  save: (userId: string, settings: AccountSettingsUpload, signal: AbortSignal) => Promise<boolean>;
}

export interface AccountSettingsStore {
  getSettings: () => GameSettings;
  applySettings: (settings: GameSettings) => void;
  subscribe: (listener: () => void) => () => void;
}

/**
 * 미동기화 표시. 이 브라우저 한 칸에 사용자 id 하나를 담으며, 로컬 계정 설정에 그 사용자 계정에
 * 아직 저장하지 못한 변경이 있다는 뜻이다. 다른 사용자로 표시하면 이전 표시를 덮어쓴다.
 */
export interface UnsyncedAccountSettingsMarker {
  owner: () => string | null;
  set: (userId: string) => void;
  clear: () => void;
}

interface SyncOptions extends AccountSettingsIO {
  store: AccountSettingsStore;
  notice: (message: string) => void;
  unsyncedMarker: UnsyncedAccountSettingsMarker;
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
  store, load, insertIfAbsent, save, notice, unsyncedMarker, timers,
}: SyncOptions) {
  let session: SyncSession | null = null;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: AccountSettings | null = null;
  let lastSettings = store.getSettings();
  let previous = JSON.stringify(selectAccountSettings(lastSettings));
  // 같은 사용자의 불러오기 실패가 이어지는 동안(탭 재진입의 SIGNED_IN 등) 안내를 반복하지 않는다.
  let loadFailureNoticedUserId: string | null = null;
  // 서버 값을 로컬에 적용하는 변경은 이 브라우저의 미동기화 변경이 아니다.
  let applyingServerSettings = false;

  /** 다른 탭이 다른 사용자로 바꾼 표시는 지우지 않는다. */
  function clearUnsyncedMarkerOf(userId: string) {
    if (unsyncedMarker.owner() === userId) unsyncedMarker.clear();
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

  function schedule(current: SyncSession, account: AccountSettings) {
    pending = account;
    unsyncedMarker.set(current.userId);
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
    if (!saved) {
      unsyncedMarker.set(current.userId);
      notice(ACCOUNT_SETTINGS_SAVE_FAILURE_MESSAGE);
    } else if (!pending) {
      // 저장 중에 들어온 더 새 변경이 없을 때만 지운다.
      clearUnsyncedMarkerOf(current.userId);
    }
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
    // 화면 전환 등 설정 밖의 상태 변경은 직렬화하지 않는다.
    if (settings === lastSettings) return;
    lastSettings = settings;
    const account = selectAccountSettings(settings);
    const serialized = JSON.stringify(account);
    if (serialized === previous) return;
    previous = serialized;
    if (applyingServerSettings || !session) return;
    // 불러오기 성공 전·실패 뒤의 변경은 올리지 않고 표시만 남겨 다음 성공한 불러오기에서 올린다.
    if (!session.ready) {
      unsyncedMarker.set(session.userId);
      return;
    }
    schedule(session, account);
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
        const initial = selectAccountSettings(store.getSettings());
        const insertResult = await insertIfAbsent(userId, initial, current.controller.signal);
        if (session !== current) return;
        if (insertResult === 'inserted') {
          markReady(current, {});
          const latest = selectAccountSettings(store.getSettings());
          if (JSON.stringify(latest) !== JSON.stringify(initial)) schedule(current, latest);
          else clearUnsyncedMarkerOf(userId);
          return;
        }
        // 올리지 못한 로컬 설정은 다음 성공한 불러오기에서 서버 값 대신 올린다.
        if (insertResult === 'failed') unsyncedMarker.set(userId);
        // 읽을 때 숨겨졌던 기존 행은 덮어쓰지 않고 한 번만 다시 읽는다.
        result = insertResult === 'conflict' ? await load(userId, current.controller.signal) : { status: 'failed' };
        if (session !== current) return;
      }
      current.loading = false;
      if (result.status === 'found') {
        const serverSettings = result.settings;
        try {
          if (new TextEncoder().encode(JSON.stringify(serverSettings)).byteLength <= 16 * 1024) {
            if (unsyncedMarker.owner() === userId) {
              // 이 브라우저에서 이 사용자 계정에 저장하지 못한 변경이 있으면 서버 값 대신 로컬 계정 설정을 올린다.
              markReady(current, serverSettings);
              pending = selectAccountSettings(store.getSettings());
              flush();
              return;
            }
            // 계정 설정을 받은 브라우저는 최초 실행(프리셋 선택)을 끝내 계정의 키 바인딩을 유지한다.
            applyingServerSettings = true;
            try {
              store.applySettings({ ...mergeAccountSettings(store.getSettings(), serverSettings), isFirstLaunch: false });
            } finally {
              applyingServerSettings = false;
            }
            // 로컬 설정이 이 사용자 값으로 바뀌어 다른 사용자의 미동기화 변경은 더 남아 있지 않다.
            unsyncedMarker.clear();
            markReady(current, serverSettings);
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
