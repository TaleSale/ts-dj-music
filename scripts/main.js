import { exportModuleSettings, importModuleSettings } from "./settings-io.js";

const MODULE_ID = "ts-dj-music";

const SETTING_KEYS = {
  files: "files",
  tracks: "tracks",
  playlists: "playlists",
  ambienceTracks: "ambienceTracks",
  ambiencePlaylists: "ambiencePlaylists",
  ambienceAllowConcurrent: "ambienceAllowConcurrent",
  liveRate: "liveRate",
  liveMusicVolume: "liveMusicVolume",
  liveAmbienceVolume: "liveAmbienceVolume",
  collapseGlobalVolumeByDefault: "collapseGlobalVolumeByDefault",
  collapseTsDjPlaylistsByDefault: "collapseTsDjPlaylistsByDefault",
  collapseFoundryPlaylistsByDefault: "collapseFoundryPlaylistsByDefault",
};
const MANAGER_CARD_IDS = Object.freeze({
  files: "files",
  musicPlaylists: "music-playlists",
  musicTracks: "music-tracks",
  ambiencePlaylists: "ambience-playlists",
  ambienceTracks: "ambience-tracks",
});

const RATE_VALUES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const SOCKET_CHANNEL = `module.${MODULE_ID}`;
const I18N_PREFIX = "TS_DJ_MUSIC";
const SOUND_CHANNEL_MARK = Symbol("ts-dj-channel");
const STORAGE_PLAYLIST_NAME = "TS-DJ-MUSIC Storage";
const STORAGE_FLAG_KEYS = Object.freeze({
  isStorage: "isStoragePlaylist",
  dataStore: "dataStore",
  migratedFromSettings: "migratedFromWorldSettings",
});
const PLAYLIST_CREATE_PERMISSION = globalThis.CONST?.USER_PERMISSIONS?.PLAYLIST_CREATE ?? "PLAYLIST_CREATE";
const SOCKET_ACTIONS = Object.freeze({
  playTrack: "play-track",
  playPlaylist: "play-playlist",
  playRelativeTrack: "play-relative-track",
  stopPlayback: "stop-playback",
  pausePlayback: "pause-playback",
  resumePlayback: "resume-playback",
  playAmbienceTrack: "play-ambience-track",
  playAmbiencePlaylist: "play-ambience-playlist",
  stopAmbienceAll: "stop-ambience-all",
  stopAmbiencePlaylist: "stop-ambience-playlist",
  stopAmbienceTrack: "stop-ambience-track",
  setLiveRate: "set-live-rate",
  setLiveMusicVolume: "set-live-music-volume",
  setLiveAmbienceVolume: "set-live-ambience-volume",
  requestPlaybackState: "request-playback-state",
  syncPlaybackState: "sync-playback-state",
});
const SOCKET_CONTROL_ACTIONS = new Set([
  SOCKET_ACTIONS.playTrack,
  SOCKET_ACTIONS.playPlaylist,
  SOCKET_ACTIONS.playRelativeTrack,
  SOCKET_ACTIONS.stopPlayback,
  SOCKET_ACTIONS.pausePlayback,
  SOCKET_ACTIONS.resumePlayback,
  SOCKET_ACTIONS.playAmbienceTrack,
  SOCKET_ACTIONS.playAmbiencePlaylist,
  SOCKET_ACTIONS.stopAmbienceAll,
  SOCKET_ACTIONS.stopAmbiencePlaylist,
  SOCKET_ACTIONS.stopAmbienceTrack,
  SOCKET_ACTIONS.setLiveRate,
  SOCKET_ACTIONS.setLiveMusicVolume,
  SOCKET_ACTIONS.setLiveAmbienceVolume,
]);
const INITIAL_SYNC_DELAY_MS = 350;
const INITIAL_SYNC_TTL_MS = 10000;
const FULL_TRACK_LOOP_TOLERANCE_SEC = 0.15;
const PLAYLIST_DIRECTORY_SCROLL_CLASS = `${MODULE_ID}-playlist-directory-scroll`;
const NAME_SORT_COLLATOR = new Intl.Collator(["ru", "en"], {
  numeric: true,
  sensitivity: "base",
  ignorePunctuation: true,
});
const DEFAULT_CLIENT_SETTINGS = Object.freeze({
  liveRate: 1,
  liveMusicVolume: 1,
  liveAmbienceVolume: 1,
  collapseGlobalVolumeByDefault: false,
  collapseTsDjPlaylistsByDefault: false,
  collapseFoundryPlaylistsByDefault: false,
});

let appInstance = null;
const managerSectionState = {
  files: true,
  music: true,
  ambience: true,
};
const managerCardExpandState = {
  musicPlaylists: true,
  musicTracks: true,
  ambiencePlaylists: true,
  ambienceTracks: true,
};
const managerPlaylistExpandState = {};
const managerAmbiencePlaylistExpandState = {};
const managerPlaylistDragState = {
  kind: null,
  playlistId: null,
  trackId: null,
};
const sidebarSectionState = {
  playlists: true,
  music: true,
  ambiencePlaylists: true,
  ambience: true,
};
const sidebarPlaylistExpandState = {};
const sidebarUiState = {
  rateCollapsed: false,
  quickPanelCollapsed: false,
  nativePlaylistsCollapsed: false,
  defaultsLoaded: false,
};

const playbackState = {
  current: null,
  requestId: 0,
  loading: false,
};
const trackPreviewState = {
  sound: null,
  token: null,
  requestId: 0,
  loading: false,
  onStateChange: null,
};
const ambienceState = {
  active: new Map(),
  nextRequestId: 0,
  pending: new Map(),
};
const storageState = {
  files: [],
  tracks: [],
  playlists: [],
  ambienceTracks: [],
  ambiencePlaylists: [],
  ambienceAllowConcurrent: false,
};
let storageLoaded = false;
const audioFileCache = new Map();
let sidebarProgressTicker = null;
let ambienceEnvironmentVolumeTicker = null;
let lastAmbienceVolumeFingerprint = null;
const pendingPlaybackSyncRequests = new Map();
const segmentLoopIntervals = new WeakMap();

function i18nKey(key) {
  return key.startsWith(`${I18N_PREFIX}.`) ? key : `${I18N_PREFIX}.${key}`;
}

function t(key, fallback = "") {
  const fullKey = i18nKey(key);
  const value = game?.i18n?.localize?.(fullKey);
  return value && value !== fullKey ? value : fallback;
}

function tf(key, data = {}, fallback = null) {
  const fullKey = i18nKey(key);
  const value = game?.i18n?.format?.(fullKey, data);
  if (value && value !== fullKey) return value;
  if (typeof fallback === "function") return fallback(data);
  return fallback ?? fullKey;
}

function notify(type, key, data = {}, fallback = null) {
  const hasData = data && Object.keys(data).length > 0;
  const text = hasData
    ? tf(`Notifications.${key}`, data, fallback)
    : t(`Notifications.${key}`, fallback ?? key);
  ui.notifications?.[type]?.(text);
  return text;
}

function yesNo(value) {
  return value ? t("Common.Yes", "Yes") : t("Common.No", "No");
}

function onOff(value) {
  return value ? t("Common.On", "on") : t("Common.Off", "off");
}

function untitledName(value) {
  return String(value ?? "").trim() || t("Common.Untitled", "Untitled");
}

function formatSidebarPlaylistMeta(count, loopEnabled, shuffleEnabled) {
  return tf(
    "Sidebar.PlaylistMeta",
    { count, loop: yesNo(loopEnabled), shuffle: yesNo(shuffleEnabled) },
    ({ count: total, loop, shuffle }) => `${total} tracks | loop: ${loop} | shuffle: ${shuffle}`
  );
}

function formatSidebarTrackMeta(file, clip, loopEnabled) {
  return tf(
    "Sidebar.TrackMeta",
    { file, clip, loop: onOff(loopEnabled) },
    ({ file: fileName, clip: clipText, loop }) => `${fileName} | ${clipText} | loop: ${loop}`
  );
}

class QuickPanelSettingsForm extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-quick-panel-settings`,
      classes: ["form", "ts-dj-quick-panel-settings"],
      template: `modules/${MODULE_ID}/templates/quick-panel-settings.hbs`,
      width: 520,
    });
  }

  get title() {
    return t("Settings.QuickPanelMenuTitle", "Quick Panel Settings");
  }

  getData(options = {}) {
    const data = super.getData(options);
    data.settings = [
      {
        key: SETTING_KEYS.collapseGlobalVolumeByDefault,
        nameKey: i18nKey("Settings.CollapseGlobalVolumeName"),
        hintKey: i18nKey("Settings.CollapseGlobalVolumeHint"),
        value: Boolean(game.settings.get(MODULE_ID, SETTING_KEYS.collapseGlobalVolumeByDefault)),
      },
      {
        key: SETTING_KEYS.collapseTsDjPlaylistsByDefault,
        nameKey: i18nKey("Settings.CollapsePlaylistsName"),
        hintKey: i18nKey("Settings.CollapsePlaylistsHint"),
        value: Boolean(game.settings.get(MODULE_ID, SETTING_KEYS.collapseTsDjPlaylistsByDefault)),
      },
      {
        key: SETTING_KEYS.collapseFoundryPlaylistsByDefault,
        nameKey: i18nKey("Settings.CollapseFoundryName"),
        hintKey: i18nKey("Settings.CollapseFoundryHint"),
        value: Boolean(game.settings.get(MODULE_ID, SETTING_KEYS.collapseFoundryPlaylistsByDefault)),
      },
    ];
    data.saveLabel = t("Common.Save", "Save");
    return data;
  }

  async _updateObject(_event, formData) {
    const values = foundry.utils.expandObject(formData)?.settings ?? {};
    const getBoolean = (key) => Boolean(values[key]);

    await game.settings.set(MODULE_ID, SETTING_KEYS.collapseGlobalVolumeByDefault, getBoolean(SETTING_KEYS.collapseGlobalVolumeByDefault));
    await game.settings.set(MODULE_ID, SETTING_KEYS.collapseTsDjPlaylistsByDefault, getBoolean(SETTING_KEYS.collapseTsDjPlaylistsByDefault));
    await game.settings.set(MODULE_ID, SETTING_KEYS.collapseFoundryPlaylistsByDefault, getBoolean(SETTING_KEYS.collapseFoundryPlaylistsByDefault));
  }
}

Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("ready", async () => {
  console.log(`${MODULE_ID} | ready`);
  await initializeStorageState();
  registerModuleSocket();
  queueInitialPlaybackSyncRequest();
  startAmbienceEnvironmentVolumeWatcher();
  window.addEventListener("beforeunload", clearAudioFileCache, { once: true });
  window.addEventListener("beforeunload", stopAmbienceEnvironmentVolumeWatcher, { once: true });
  globalThis.TsDjMusic = {
    open: openApp,
    playTrack: playTrackById,
    playPlaylist: playPlaylistById,
    stop: stopPlayback,
    playAmbience: playAmbienceById,
    playAmbiencePlaylist: playAmbiencePlaylistById,
    stopAmbience: stopAllAmbience,
  };
});

Hooks.on("renderPlaylistDirectory", (_app, html) => {
  const root = getRoot(html);
  if (!root) return;

  initializeSidebarUiStateFromSettings();
  root.classList.add(PLAYLIST_DIRECTORY_SCROLL_CLASS);
  injectPlaylistDirectoryButton(root);
  injectPlaylistDirectoryRateControl(root);
  injectPlaylistDirectoryDjPanel(root);
  injectPlaylistDirectoryNativePlaylistsPanel(root);
});

Hooks.on("updateSetting", (setting) => {
  const key = setting?.key ?? null;
  if (key === "core.globalAmbientVolume") {
    applyEnvironmentVolumeToActiveAmbience({ force: true });
    return;
  }
});

Hooks.on("updatePlaylist", (playlist, change) => {
  if (!isStoragePlaylistDocument(playlist)) return;
  const dataFlagPath = `flags.${MODULE_ID}.${STORAGE_FLAG_KEYS.dataStore}`;
  if (foundry.utils.hasProperty(change, dataFlagPath)) {
    void reloadStorageStateFromPlaylist(playlist);
    return;
  }
  refreshPlaylistDirectoryUi();
});

Hooks.on("deletePlaylist", (playlist) => {
  if (!isStoragePlaylistDocument(playlist)) return;
  storageLoaded = false;
  storageState.files = [];
  storageState.tracks = [];
  storageState.playlists = [];
  storageState.ambienceTracks = [];
  storageState.ambiencePlaylists = [];
  storageState.ambienceAllowConcurrent = false;
  refreshPlaylistDirectoryUi();
});

function registerModuleSocket() {
  if (!game.socket) return;
  game.socket.on(SOCKET_CHANNEL, (payload) => {
    handleModuleSocketEvent(payload).catch((error) => {
      console.warn(`${MODULE_ID} | socket event handling failed`, error);
    });
  });
}

function emitModuleSocketEvent(action, payload = {}) {
  if (!game.socket) return;
  game.socket.emit(SOCKET_CHANNEL, {
    moduleId: MODULE_ID,
    action,
    payload,
    senderId: game.user?.id ?? null,
  });
}

function sanitizePlayOptions(options = {}) {
  const raw = options && typeof options === "object" ? options : {};
  const queue = Array.isArray(raw.queue) ? [...raw.queue] : undefined;

  return {
    mode: raw.mode,
    playlistId: raw.playlistId ?? null,
    queue,
    index: Number.isFinite(raw.index) ? Number(raw.index) : undefined,
    playlistLoop: typeof raw.playlistLoop === "boolean" ? raw.playlistLoop : undefined,
    playlistShuffle: typeof raw.playlistShuffle === "boolean" ? raw.playlistShuffle : undefined,
    loopOverride: typeof raw.loopOverride === "boolean" ? raw.loopOverride : undefined,
    playOffset: Number.isFinite(raw.playOffset) ? Number(raw.playOffset) : undefined,
    skipStopExisting: typeof raw.skipStopExisting === "boolean" ? raw.skipStopExisting : undefined,
  };
}

async function handleModuleSocketEvent(message) {
  if (!message || message.moduleId !== MODULE_ID) return;
  if (message.senderId && message.senderId === game.user?.id) return;
  if (SOCKET_CONTROL_ACTIONS.has(message.action) && !isAuthorizedControlSender(message.senderId)) return;

  const payload = message.payload ?? {};
  switch (message.action) {
    case SOCKET_ACTIONS.playTrack:
      if (payload.trackId) await playTrackById(payload.trackId, { ...sanitizePlayOptions(payload.options), sync: false });
      break;
    case SOCKET_ACTIONS.playPlaylist:
      if (payload.playlistId) await playPlaylistById(payload.playlistId, { ...sanitizePlayOptions(payload.options), sync: false });
      break;
    case SOCKET_ACTIONS.playRelativeTrack:
      await playRelativeTrackInCurrentPlaylist(Number(payload.direction) < 0 ? -1 : 1, { sync: false });
      break;
    case SOCKET_ACTIONS.stopPlayback:
      await stopPlayback({ sync: false });
      break;
    case SOCKET_ACTIONS.pausePlayback:
      await pauseCurrentPlayback({ sync: false });
      break;
    case SOCKET_ACTIONS.resumePlayback:
      await resumeCurrentPlayback({ sync: false });
      break;
    case SOCKET_ACTIONS.playAmbienceTrack:
      if (payload.trackId) await playAmbienceById(payload.trackId, { ...sanitizePlayOptions(payload.options), sync: false });
      break;
    case SOCKET_ACTIONS.playAmbiencePlaylist:
      if (payload.playlistId) await playAmbiencePlaylistById(payload.playlistId, { ...sanitizePlayOptions(payload.options), sync: false });
      break;
    case SOCKET_ACTIONS.stopAmbienceAll:
      await stopAllAmbience({ sync: false });
      break;
    case SOCKET_ACTIONS.stopAmbiencePlaylist:
      if (payload.playlistId) await stopAmbienceByPlaylistId(payload.playlistId, { sync: false });
      break;
    case SOCKET_ACTIONS.stopAmbienceTrack:
      if (payload.trackId) await stopAmbienceByTrackId(payload.trackId, { sync: false });
      break;
    case SOCKET_ACTIONS.setLiveRate:
      await setLiveRate(payload.rate, { apply: payload.apply !== false, sync: false });
      break;
    case SOCKET_ACTIONS.setLiveMusicVolume:
      await setLiveMusicVolume(payload.volume, { apply: payload.apply !== false, sync: false });
      break;
    case SOCKET_ACTIONS.setLiveAmbienceVolume:
      await setLiveAmbienceVolume(payload.volume, { apply: payload.apply !== false, sync: false });
      break;
    case SOCKET_ACTIONS.requestPlaybackState:
      handlePlaybackStateRequest(payload);
      break;
    case SOCKET_ACTIONS.syncPlaybackState:
      await handlePlaybackStateSync(payload);
      break;
    default:
      break;
  }
}

function queueInitialPlaybackSyncRequest() {
  if (!game.user?.id) return;
  window.setTimeout(() => {
    requestInitialPlaybackSync();
  }, INITIAL_SYNC_DELAY_MS);
}

function requestInitialPlaybackSync() {
  if (!game.user?.id || !game.socket) return;

  const requestId = foundry.utils.randomID();
  const timeoutId = window.setTimeout(() => {
    pendingPlaybackSyncRequests.delete(requestId);
  }, INITIAL_SYNC_TTL_MS);
  pendingPlaybackSyncRequests.set(requestId, timeoutId);

  emitModuleSocketEvent(SOCKET_ACTIONS.requestPlaybackState, {
    targetUserId: game.user.id,
    requestId,
  });
}

function canRespondToPlaybackSyncRequest() {
  const currentUser = game.user;
  if (!currentUser?.active) return false;

  if (currentUser.isGM) return true;

  const activeGmOnline = game.users?.contents?.some((user) => user.active && user.isGM);
  if (activeGmOnline) return false;

  return canManagePlaylistControls();
}

function handlePlaybackStateRequest(payload = {}) {
  const targetUserId = String(payload.targetUserId ?? "");
  if (!targetUserId || targetUserId === game.user?.id) return;
  if (!canRespondToPlaybackSyncRequest()) return;

  const snapshot = buildPlaybackSyncSnapshot();
  if (!snapshot) return;

  emitModuleSocketEvent(SOCKET_ACTIONS.syncPlaybackState, {
    targetUserId,
    requestId: String(payload.requestId ?? ""),
    snapshot,
  });
}

async function handlePlaybackStateSync(payload = {}) {
  const targetUserId = String(payload.targetUserId ?? "");
  if (!targetUserId || targetUserId !== game.user?.id) return;

  const requestId = String(payload.requestId ?? "");
  if (!requestId || !pendingPlaybackSyncRequests.has(requestId)) return;

  const timeoutId = pendingPlaybackSyncRequests.get(requestId);
  if (timeoutId) {
    window.clearTimeout(timeoutId);
  }
  pendingPlaybackSyncRequests.delete(requestId);

  await applyPlaybackSyncSnapshot(payload.snapshot);
}

function defaultStorageData() {
  return {
    files: [],
    tracks: [],
    playlists: [],
    ambienceTracks: [],
    ambiencePlaylists: [],
    ambienceAllowConcurrent: false,
  };
}

function normalizeStorageData(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    files: normalizeArray(source.files),
    tracks: normalizeArray(source.tracks),
    playlists: normalizeArray(source.playlists),
    ambienceTracks: normalizeArray(source.ambienceTracks),
    ambiencePlaylists: normalizeArray(source.ambiencePlaylists),
    ambienceAllowConcurrent: Boolean(source.ambienceAllowConcurrent),
  };
}

function cloneStorageData(data = storageState) {
  return {
    files: normalizeArray(data.files).map((entry) => ({ ...entry })),
    tracks: normalizeArray(data.tracks).map((entry) => ({ ...entry })),
    playlists: normalizeArray(data.playlists).map((entry) => ({ ...entry, trackIds: normalizeArray(entry.trackIds) })),
    ambienceTracks: normalizeArray(data.ambienceTracks).map((entry) => ({ ...entry })),
    ambiencePlaylists: normalizeArray(data.ambiencePlaylists).map((entry) => ({ ...entry, trackIds: normalizeArray(entry.trackIds) })),
    ambienceAllowConcurrent: Boolean(data.ambienceAllowConcurrent),
  };
}

function applyStorageData(next) {
  const normalized = normalizeStorageData(next);
  storageState.files = normalized.files;
  storageState.tracks = normalized.tracks;
  storageState.playlists = normalized.playlists;
  storageState.ambienceTracks = normalized.ambienceTracks;
  storageState.ambiencePlaylists = normalized.ambiencePlaylists;
  storageState.ambienceAllowConcurrent = normalized.ambienceAllowConcurrent;
  storageLoaded = true;
}

function isStoragePlaylistDocument(playlist) {
  return Boolean(playlist?.getFlag?.(MODULE_ID, STORAGE_FLAG_KEYS.isStorage));
}

function findStoragePlaylist() {
  const byFlag = game.playlists?.contents?.find((playlist) => isStoragePlaylistDocument(playlist));
  if (byFlag) return byFlag;
  return game.playlists?.contents?.find((playlist) => String(playlist?.name ?? "") === STORAGE_PLAYLIST_NAME) ?? null;
}

function canCurrentUserCreatePlaylists(user = game.user) {
  if (!user) return false;
  if (user.isGM) return true;

  if (typeof user.can === "function" && user.can(PLAYLIST_CREATE_PERMISSION)) return true;
  if (typeof user.hasPermission === "function" && user.hasPermission(PLAYLIST_CREATE_PERMISSION)) return true;

  const playlistDocumentClass = globalThis.Playlist ?? game.playlists?.documentClass;
  return Boolean(playlistDocumentClass?.canUserCreate?.(user));
}

function canUserUpdatePlaylist(playlist, user = game.user) {
  if (!playlist || !user) return false;
  if (user.isGM) return true;
  if (typeof playlist.canUserModify === "function") {
    return Boolean(playlist.canUserModify(user, "update"));
  }
  if (typeof playlist.testUserPermission === "function") {
    const level = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
    return Boolean(playlist.testUserPermission(user, level));
  }
  return false;
}

async function ensureStoragePlaylist({ create = false } = {}) {
  let playlist = findStoragePlaylist();
  if (playlist) {
    if (!isStoragePlaylistDocument(playlist)) {
      try {
        await playlist.setFlag(MODULE_ID, STORAGE_FLAG_KEYS.isStorage, true);
      } catch (_error) {
        // no-op
      }
    }
    return playlist;
  }

  if (!create || !canCurrentUserCreatePlaylists()) return null;

  const playlistClass = globalThis.Playlist ?? game.playlists?.documentClass;
  if (!playlistClass?.create) return null;

  playlist = await playlistClass.create({
    name: STORAGE_PLAYLIST_NAME,
    description: "TS-DJ-MUSIC data storage playlist",
  });
  await playlist.setFlag(MODULE_ID, STORAGE_FLAG_KEYS.isStorage, true);
  await playlist.setFlag(MODULE_ID, STORAGE_FLAG_KEYS.dataStore, defaultStorageData());
  return playlist;
}

function getLegacyWorldSettingsSnapshot() {
  return {
    files: normalizeArray(game.settings.get(MODULE_ID, SETTING_KEYS.files)),
    tracks: normalizeArray(game.settings.get(MODULE_ID, SETTING_KEYS.tracks)),
    playlists: normalizeArray(game.settings.get(MODULE_ID, SETTING_KEYS.playlists)),
    ambienceTracks: normalizeArray(game.settings.get(MODULE_ID, SETTING_KEYS.ambienceTracks)),
    ambiencePlaylists: normalizeArray(game.settings.get(MODULE_ID, SETTING_KEYS.ambiencePlaylists)),
    ambienceAllowConcurrent: Boolean(game.settings.get(MODULE_ID, SETTING_KEYS.ambienceAllowConcurrent)),
  };
}

function hasAnyStorageContent(data) {
  return Boolean(
    normalizeArray(data.files).length ||
    normalizeArray(data.tracks).length ||
    normalizeArray(data.playlists).length ||
    normalizeArray(data.ambienceTracks).length ||
    normalizeArray(data.ambiencePlaylists).length
  );
}

async function maybeMigrateLegacyWorldSettings(playlist) {
  if (!playlist || !game.user?.isGM) return;
  const alreadyMigrated = Boolean(playlist.getFlag(MODULE_ID, STORAGE_FLAG_KEYS.migratedFromSettings));
  if (alreadyMigrated) return;

  const currentStore = normalizeStorageData(playlist.getFlag(MODULE_ID, STORAGE_FLAG_KEYS.dataStore));
  if (hasAnyStorageContent(currentStore)) {
    await playlist.setFlag(MODULE_ID, STORAGE_FLAG_KEYS.migratedFromSettings, true);
    return;
  }

  const legacy = getLegacyWorldSettingsSnapshot();
  if (hasAnyStorageContent(legacy)) {
    await playlist.setFlag(MODULE_ID, STORAGE_FLAG_KEYS.dataStore, legacy);
    console.log(`${MODULE_ID} | migrated legacy world settings into playlist storage`);
  }

  await playlist.setFlag(MODULE_ID, STORAGE_FLAG_KEYS.migratedFromSettings, true);
}

async function reloadStorageStateFromPlaylist(playlist = null) {
  const target = playlist ?? await ensureStoragePlaylist({ create: false });
  if (!target) {
    applyStorageData(defaultStorageData());
    refreshPlaylistDirectoryUi();
    return;
  }

  const raw = target.getFlag(MODULE_ID, STORAGE_FLAG_KEYS.dataStore);
  applyStorageData(raw);
  refreshPlaylistDirectoryUi();
}

async function initializeStorageState() {
  const playlist = await ensureStoragePlaylist({ create: game.user?.isGM });
  if (playlist) {
    await maybeMigrateLegacyWorldSettings(playlist);
  }
  await reloadStorageStateFromPlaylist(playlist);
}

async function persistStorageState() {
  const playlist = await ensureStoragePlaylist({ create: true });
  if (!playlist) {
    throw new Error("TS-DJ-MUSIC: failed to access storage playlist.");
  }
  if (!canUserUpdatePlaylist(playlist, game.user)) {
    throw new Error("TS-DJ-MUSIC: no permission to update storage playlist.");
  }

  await playlist.setFlag(MODULE_ID, STORAGE_FLAG_KEYS.dataStore, cloneStorageData());
}

function userCanManagePlaylistControls(user) {
  if (!user) return false;
  if (user.isGM) return true;

  const storagePlaylist = findStoragePlaylist();
  if (!storagePlaylist) {
    return canCurrentUserCreatePlaylists(user);
  }

  return canUserUpdatePlaylist(storagePlaylist, user);
}

function isAuthorizedControlSender(senderId) {
  const id = String(senderId ?? "");
  if (!id) return false;
  const sender = game.users?.get?.(id) ?? game.users?.contents?.find((user) => user.id === id);
  return userCanManagePlaylistControls(sender);
}

function buildPlaybackSyncSnapshot() {
  const snapshot = {
    capturedAtMs: Date.now(),
    liveRate: getLiveRate(),
    liveMusicVolume: getLiveMusicVolume(),
    liveAmbienceVolume: getLiveAmbienceVolume(),
  };

  const current = playbackState.current;
  if (!current || current.paused) return snapshot;

  const fallbackOffset = Number.isFinite(current.clipStart) ? current.clipStart : 0;
  const offset = getCurrentAbsoluteTime(current);
  const playOffset = Number.isFinite(offset) ? offset : fallbackOffset;

  return {
    ...snapshot,
    trackId: current.trackId,
    mode: current.mode,
    playlistId: current.playlistId,
    queue: Array.isArray(current.queue) ? [...current.queue] : [],
    index: Number.isFinite(current.index) ? Number(current.index) : 0,
    playlistLoop: Boolean(current.playlistLoop),
    playlistShuffle: Boolean(current.playlistShuffle),
    loopEnabled: Boolean(current.loopEnabled),
    clipStart: Number.isFinite(current.clipStart) ? Number(current.clipStart) : 0,
    clipEnd: Number.isFinite(current.clipEnd) ? Number(current.clipEnd) : null,
    playOffset,
    timingRate: normalizeRate(Number(current.timingRate ?? 1)),
  };
}

async function applyPlaybackSyncSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return;
  const liveRate = normalizeRate(Number(snapshot.liveRate ?? 1));
  await setLiveRate(liveRate, { apply: false, sync: false });
  await setLiveMusicVolume(snapshot.liveMusicVolume, { apply: true, sync: false });
  await setLiveAmbienceVolume(snapshot.liveAmbienceVolume, { apply: true, sync: false });

  const trackId = String(snapshot.trackId ?? "");
  if (!trackId) return;

  let playOffset = Number.isFinite(snapshot.playOffset) ? Number(snapshot.playOffset) : 0;
  const timingRate = normalizeRate(Number(snapshot.timingRate ?? 1));
  const capturedAtMs = Number(snapshot.capturedAtMs);
  if (Number.isFinite(capturedAtMs)) {
    const elapsedSec = Math.max(0, (Date.now() - capturedAtMs) / 1000);
    playOffset += elapsedSec * timingRate;
  }

  const clipStart = Number.isFinite(snapshot.clipStart) ? Number(snapshot.clipStart) : 0;
  const clipEnd = Number.isFinite(snapshot.clipEnd) ? Number(snapshot.clipEnd) : null;
  const loopEnabled = Boolean(snapshot.loopEnabled);
  if (loopEnabled && Number.isFinite(clipEnd) && clipEnd > clipStart) {
    const loopDuration = clipEnd - clipStart;
    const loopOffset = Math.max(0, playOffset - clipStart);
    playOffset = clipStart + (loopOffset % loopDuration);
  }

  const queue = Array.isArray(snapshot.queue) && snapshot.queue.length
    ? [...snapshot.queue]
    : [trackId];
  const index = Number.isFinite(snapshot.index)
    ? clampNumber(Math.trunc(Number(snapshot.index)), 0, Math.max(0, queue.length - 1))
    : 0;

  await playTrackById(trackId, {
    sync: false,
    mode: snapshot.mode === "playlist" ? "playlist" : "track",
    playlistId: snapshot.playlistId ?? null,
    queue,
    index,
    playlistLoop: Boolean(snapshot.playlistLoop),
    playlistShuffle: Boolean(snapshot.playlistShuffle),
    loopOverride: loopEnabled,
    playOffset,
  });
}

function registerSettings() {
  game.settings.registerMenu(MODULE_ID, "quickPanelSettings", {
    name: i18nKey("Settings.QuickPanelMenuName"),
    label: i18nKey("Settings.QuickPanelMenuLabel"),
    hint: i18nKey("Settings.QuickPanelMenuHint"),
    icon: "fa-solid fa-sliders",
    type: QuickPanelSettingsForm,
    restricted: false,
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.files, {
    name: t("Settings.Files", "DJ Files"),
    scope: "world",
    config: false,
    type: Object,
    default: [],
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.tracks, {
    name: t("Settings.Tracks", "DJ Tracks"),
    scope: "world",
    config: false,
    type: Object,
    default: [],
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.playlists, {
    name: t("Settings.Playlists", "DJ Playlists"),
    scope: "world",
    config: false,
    type: Object,
    default: [],
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.ambienceTracks, {
    name: t("Settings.AmbienceTracks", "DJ Ambience Tracks"),
    scope: "world",
    config: false,
    type: Object,
    default: [],
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.ambiencePlaylists, {
    name: t("Settings.AmbiencePlaylists", "DJ Ambience Playlists"),
    scope: "world",
    config: false,
    type: Object,
    default: [],
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.ambienceAllowConcurrent, {
    name: t("Settings.AllowMultipleAmbience", "Allow multiple ambience"),
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.liveRate, {
    name: t("Settings.LiveRate", "DJ Live Rate"),
    scope: "client",
    config: false,
    type: Number,
    default: 1,
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.liveMusicVolume, {
    name: t("Settings.LiveMusicVolume", "DJ Live Music Volume"),
    scope: "client",
    config: false,
    type: Number,
    default: 1,
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.liveAmbienceVolume, {
    name: t("Settings.LiveAmbienceVolume", "DJ Live Ambience Volume"),
    scope: "client",
    config: false,
    type: Number,
    default: 1,
  });

  const registerSidebarDefaultCollapseSetting = (key, name, hint) => {
    game.settings.register(MODULE_ID, key, {
      name,
      hint,
      scope: "client",
      config: false,
      type: Boolean,
      default: false,
      onChange: () => {
        sidebarUiState.defaultsLoaded = false;
        refreshPlaylistDirectoryUi();
      },
    });
  };

  registerSidebarDefaultCollapseSetting(
    SETTING_KEYS.collapseGlobalVolumeByDefault,
    i18nKey("Settings.CollapseGlobalVolumeName"),
    i18nKey("Settings.CollapseGlobalVolumeHint")
  );
  registerSidebarDefaultCollapseSetting(
    SETTING_KEYS.collapseTsDjPlaylistsByDefault,
    i18nKey("Settings.CollapsePlaylistsName"),
    i18nKey("Settings.CollapsePlaylistsHint")
  );
  registerSidebarDefaultCollapseSetting(
    SETTING_KEYS.collapseFoundryPlaylistsByDefault,
    i18nKey("Settings.CollapseFoundryName"),
    i18nKey("Settings.CollapseFoundryHint")
  );
}

function initializeSidebarUiStateFromSettings() {
  if (sidebarUiState.defaultsLoaded) return;

  sidebarUiState.rateCollapsed = Boolean(game.settings.get(MODULE_ID, SETTING_KEYS.collapseGlobalVolumeByDefault));
  sidebarUiState.quickPanelCollapsed = Boolean(game.settings.get(MODULE_ID, SETTING_KEYS.collapseTsDjPlaylistsByDefault));
  sidebarUiState.nativePlaylistsCollapsed = Boolean(game.settings.get(MODULE_ID, SETTING_KEYS.collapseFoundryPlaylistsByDefault));
  sidebarUiState.defaultsLoaded = true;
}

function getRoot(html) {
  if (!html) return null;
  if (html instanceof HTMLElement) return html;
  if (html[0] instanceof HTMLElement) return html[0];
  return null;
}

function canManagePlaylistControls() {
  return userCanManagePlaylistControls(game.user);
}

function ensureModuleControlAccess() {
  if (canManagePlaylistControls()) return true;
  notify("warn", "NoPermission", {}, "TS-DJ-MUSIC: insufficient module permissions.");
  return false;
}

function injectPlaylistDirectoryButton(root) {
  const existing = root.querySelector(`button[data-action="${MODULE_ID}-open"]`);
  if (!canManagePlaylistControls()) {
    existing?.remove();
    return;
  }

  const buttonContainer = root.querySelector(".header-actions.action-buttons") ?? root.querySelector(".header-actions");
  if (!buttonContainer || existing) return;

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = `${MODULE_ID}-open`;
  button.innerHTML = `<i class=\"fas fa-music\"></i> ${escapeHtml(t("Sidebar.OpenButton", "TS-DJ-MUSIC"))}`;
  button.addEventListener("click", () => openApp());
  buttonContainer.appendChild(button);
}

function injectPlaylistDirectoryRateControl(root) {
  const existing = root.querySelector(`.${MODULE_ID}-sidebar-rate`);
  if (!canManagePlaylistControls()) {
    existing?.remove();
    return;
  }

  const header = root.querySelector(".directory-header") ?? root.querySelector("header");
  if (!header) return;
  existing?.remove();

  const wrap = document.createElement("div");
  wrap.classList.add(`${MODULE_ID}-sidebar-rate`);
  wrap.innerHTML = `
    <div class="${MODULE_ID}-sidebar-rate-speed"></div>
    <div class="global-volume global-control ${MODULE_ID}-sidebar-volume-control ${sidebarUiState.rateCollapsed ? "" : "expanded"}">
      <header class="playlist-header" data-action="volumeExpand">
        <i class="expand fa-solid fa-angle-up" inert></i>
        <strong>${escapeHtml(t("Sidebar.GlobalVolume", "TS-DJ Global Volume"))}</strong>
      </header>
      <div class="expandable">
        <div class="wrapper">
          <ol class="${MODULE_ID}-sidebar-rate-body plain"></ol>
        </div>
      </div>
    </div>
  `;

  const speedBody = wrap.querySelector(`.${MODULE_ID}-sidebar-rate-speed`);
  const volumeControl = wrap.querySelector(`.${MODULE_ID}-sidebar-volume-control`);
  const rateBody = wrap.querySelector(`.${MODULE_ID}-sidebar-rate-body`);
  const volumeHeader = wrap.querySelector(`.${MODULE_ID}-sidebar-volume-control header.playlist-header`);
  if (!speedBody || !volumeControl || !rateBody || !volumeHeader) return;

  const syncRateCollapseUi = () => {
    volumeControl.classList.toggle("expanded", !sidebarUiState.rateCollapsed);
  };

  volumeHeader.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    sidebarUiState.rateCollapsed = !sidebarUiState.rateCollapsed;
    syncRateCollapseUi();
  });
  syncRateCollapseUi();

  const getVolumeIconClass = (volume) => {
    const normalized = normalizeVolume(volume);
    if (normalized <= 0) return "fa-volume-xmark";
    if (normalized < 0.5) return "fa-volume-low";
    return "fa-volume-high";
  };

  const addControlRow = ({ labelText, min, max, step, value, format, onInput, container, showValue = true, iconFromValue = null }) => {
    const rowTag = String(container?.tagName ?? "").toUpperCase() === "OL" ? "li" : "div";
    const row = document.createElement(rowTag);
    row.classList.add("control-row");
    if (rowTag === "LI") row.classList.add("flexrow");

    const label = document.createElement("label");
    label.textContent = labelText;
    label.title = labelText;

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);

    let icon = null;
    if (typeof iconFromValue === "function") {
      icon = document.createElement("i");
      icon.classList.add("volume-icon", "fa-fw", "fa-solid");
      icon.classList.add(iconFromValue(Number(input.value)));
    }

    let valueLabel = null;
    if (showValue) {
      valueLabel = document.createElement("span");
      valueLabel.classList.add("value");
      valueLabel.textContent = format(Number(input.value));
    }

    input.addEventListener("input", async (event) => {
      const rawValue = Number(event.currentTarget.value);
      const nextValue = onInput(rawValue);
      event.currentTarget.value = String(nextValue);
      if (valueLabel) valueLabel.textContent = format(nextValue);
      if (icon && typeof iconFromValue === "function") {
        icon.classList.remove("fa-volume-xmark", "fa-volume-low", "fa-volume-high");
        icon.classList.add(iconFromValue(nextValue));
      }
    });

    if (icon) row.append(label, icon, input);
    else if (valueLabel) row.append(label, input, valueLabel);
    else row.append(label, input);
    container.append(row);
  };

  addControlRow({
    labelText: t("App.LiveSpeed", "Speed (live)"),
    min: 0.5,
    max: 2,
    step: 0.25,
    value: getLiveRate(),
    format: (rate) => formatRate(rate),
    onInput: (value) => {
      const rate = normalizeRate(value);
      void setLiveRate(rate, { apply: true }).catch((error) => {
        console.warn(`${MODULE_ID} | failed to set live rate`, error);
      });
      return rate;
    },
    container: speedBody,
  });

  addControlRow({
    labelText: t("Common.Music", "Music"),
    min: 0,
    max: 1,
    step: 0.05,
    value: getLiveMusicVolume(),
    format: (volume) => formatVolumePercent(volume),
    onInput: (value) => {
      const volume = normalizeVolume(value);
      void setLiveMusicVolume(volume, { apply: true }).catch((error) => {
        console.warn(`${MODULE_ID} | failed to set live music volume`, error);
      });
      return volume;
    },
    container: rateBody,
    showValue: false,
    iconFromValue: getVolumeIconClass,
  });

  addControlRow({
    labelText: t("Common.Ambience", "Ambience"),
    min: 0,
    max: 1,
    step: 0.05,
    value: getLiveAmbienceVolume(),
    format: (volume) => formatVolumePercent(volume),
    onInput: (value) => {
      const volume = normalizeVolume(value);
      void setLiveAmbienceVolume(volume, { apply: true }).catch((error) => {
        console.warn(`${MODULE_ID} | failed to set live ambience volume`, error);
      });
      return volume;
    },
    container: rateBody,
    showValue: false,
    iconFromValue: getVolumeIconClass,
  });

  header.appendChild(wrap);
}

function injectPlaylistDirectoryDjPanel(root) {
  const canManage = canManagePlaylistControls();
  const files = getFiles();
  const fileMap = new Map(files.map((entry) => [entry.id, entry]));
  const tracks = sortEntriesByName(getTracks());
  const playlists = sortEntriesByName(getPlaylists());
  const ambienceTracks = sortEntriesByName(getAmbienceTracks());
  const ambiencePlaylists = sortEntriesByName(getAmbiencePlaylists());
  const playlistsHtml = canManage ? buildSidebarPlaylistsHtml(playlists, tracks) : "";
  const tracksHtml = canManage ? buildSidebarTracksHtml(tracks, fileMap) : "";
  const ambiencePlaylistsHtml = canManage ? buildSidebarAmbiencePlaylistsHtml(ambiencePlaylists, ambienceTracks) : "";
  const ambienceTracksHtml = canManage ? buildSidebarAmbienceTracksHtml(ambienceTracks, fileMap) : "";
  const panelMode = canManage ? "controls" : "readonly";

  let panel = root.querySelector(`.${MODULE_ID}-sidebar-panel`);
  if (panel && panel.dataset.mode !== panelMode) {
    panel.remove();
    panel = null;
  }

  if (!panel) {
    panel = document.createElement("section");
    panel.classList.add(`${MODULE_ID}-sidebar-panel`, `${MODULE_ID}-sidebar-quick-control`);
    panel.dataset.mode = panelMode;
    panel.innerHTML = canManage
      ? `
        <header class="playlist-header ${MODULE_ID}-sidebar-head" data-action="toggle-quick-panel">
          <i class="expand fa-solid fa-angle-up" inert></i>
          <strong class="title">${escapeHtml(t("Sidebar.PanelTitle", "TS-DJ Playlists"))}</strong>
          <div class="actions">
            <button type="button" data-action="open-manager" title="${escapeHtml(t("Common.OpenManager", "Open manager"))}"><i class="fas fa-sliders-h"></i></button>
            <button type="button" data-action="stop" title="${escapeHtml(t("Common.Stop", "Stop"))}"><i class="fas fa-stop"></i></button>
          </div>
        </header>
        <div class="${MODULE_ID}-sidebar-now"></div>
        <div class="expandable">
          <div class="wrapper">
            <div class="${MODULE_ID}-sidebar-body">
              <div class="${MODULE_ID}-sidebar-queue-nav">
                <button type="button" data-action="playlist-prev" title="${escapeHtml(t("Sidebar.PreviousTrack", "Previous track in playlist"))}"><i class="fas fa-step-backward"></i></button>
                <button type="button" data-action="playlist-next" title="${escapeHtml(t("Sidebar.NextTrack", "Next track in playlist"))}"><i class="fas fa-step-forward"></i></button>
              </div>
              <details ${sidebarSectionState.playlists ? "open" : ""} data-section="playlists" class="${MODULE_ID}-sidebar-section">
                <summary>${escapeHtml(t("Common.Playlists", "Playlists"))}</summary>
                <div class="${MODULE_ID}-sidebar-list"></div>
              </details>
              <details ${sidebarSectionState.music ? "open" : ""} data-section="music" class="${MODULE_ID}-sidebar-section">
                <summary>${escapeHtml(t("Common.Music", "Music"))}</summary>
                <div class="${MODULE_ID}-sidebar-list"></div>
              </details>
              <details ${sidebarSectionState.ambiencePlaylists ? "open" : ""} data-section="ambiencePlaylists" class="${MODULE_ID}-sidebar-section">
                <summary>${escapeHtml(t("Common.AmbiencePlaylists", "Ambience Playlists"))}</summary>
                <div class="${MODULE_ID}-sidebar-list"></div>
              </details>
              <details ${sidebarSectionState.ambience ? "open" : ""} data-section="ambience" class="${MODULE_ID}-sidebar-section">
                <summary>${escapeHtml(t("Common.Ambience", "Ambience"))}</summary>
                <div class="${MODULE_ID}-sidebar-list"></div>
              </details>
            </div>
          </div>
        </div>
      `
      : `
        <div class="${MODULE_ID}-sidebar-now"></div>
      `;

    if (canManage) {
      const panelHeader = panel.querySelector(`.${MODULE_ID}-sidebar-head[data-action='toggle-quick-panel']`);
      panelHeader?.addEventListener("click", (event) => {
        if (event.target.closest("button[data-action]")) return;
        event.preventDefault();
        sidebarUiState.quickPanelCollapsed = !sidebarUiState.quickPanelCollapsed;
        panel.classList.toggle("expanded", !sidebarUiState.quickPanelCollapsed);
      });

      panel.querySelectorAll(`details[data-section]`).forEach((el) => {
        const key = el.dataset.section;
        el.addEventListener("toggle", () => {
          if (!key) return;
          sidebarSectionState[key] = el.open;
        });
      });
      panel.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();

        const action = button.dataset.action;
        const id = button.dataset.id;

        if (action === "open-manager") {
          openApp();
          return;
        }
        if (action === "stop") {
          await stopPlayback();
          return;
        }
        if (action === "pause-current") {
          await pauseCurrentPlayback();
          return;
        }
        if (action === "resume-current") {
          await resumeCurrentPlayback();
          return;
        }
        if (action === "playlist-prev") {
          await playRelativeTrackInCurrentPlaylist(-1);
          return;
        }
        if (action === "playlist-next") {
          await playRelativeTrackInCurrentPlaylist(1);
          return;
        }
        if (action === "toggle-sidebar-playlist-expand" && id) {
          sidebarPlaylistExpandState[id] = !Boolean(sidebarPlaylistExpandState[id]);
          injectPlaylistDirectoryDjPanel(root);
          return;
        }
        if (action === "play-playlist-from-track") {
          const playlistId = button.dataset.playlistId ?? id;
          const trackId = button.dataset.trackId ?? null;
          if (playlistId && trackId) {
            await playPlaylistById(playlistId, { startTrackId: trackId });
          }
          return;
        }
        if (action === "play-playlist" && id) {
          await playPlaylistById(id);
          return;
        }
        if (action === "play-ambience-playlist" && id) {
          await playAmbiencePlaylistById(id);
          return;
        }
        if (action === "stop-ambience-playlist" && id) {
          await stopAmbienceByPlaylistId(id);
          return;
        }
        if (action === "toggle-playlist-loop" && id) {
          await togglePlaylistLoop(id);
          return;
        }
        if (action === "toggle-playlist-shuffle" && id) {
          await togglePlaylistShuffle(id);
          return;
        }
        if (action === "toggle-ambience-playlist-loop" && id) {
          await toggleAmbiencePlaylistLoop(id);
          return;
        }
        if (action === "toggle-ambience-playlist-shuffle" && id) {
          await toggleAmbiencePlaylistShuffle(id);
          return;
        }
        if (action === "play-track" && id) {
          await playTrackById(id);
          return;
        }
        if (action === "play-ambience" && id) {
          await playAmbienceById(id);
          return;
        }
        if (action === "stop-ambience") {
          if (id) await stopAmbienceByTrackId(id);
          return;
        }
        if (action === "toggle-track-loop" && id) {
          await toggleTrackLoop(id);
          return;
        }
        if (action === "toggle-ambience-track-loop" && id) {
          await toggleAmbienceTrackLoop(id);
        }
      });
    }

    const header = root.querySelector(".directory-header") ?? root.querySelector("header");
    const nativePlaylistsPanel = root.querySelector(`.${MODULE_ID}-native-playlists-panel`);
    const insertAnchor = nativePlaylistsPanel ?? root.querySelector(".directory-list") ?? root.querySelector(".directory-items") ?? root.querySelector("ol");
    if (insertAnchor?.parentElement) {
      insertAnchor.before(panel);
    } else if (header) {
      header.after(panel);
    } else {
      root.prepend(panel);
    }
  }

  if (canManage) {
    panel.classList.toggle("expanded", !sidebarUiState.quickPanelCollapsed);
  }

  const currentLabel = getCurrentPlaybackLabelForSidebar(tracks, playlists);
  const current = playbackState.current;
  const queueLength = Array.isArray(current?.queue) ? current.queue.length : 0;
  const inPlaylistMode = current?.mode === "playlist" && queueLength > 0;
  const atStart = !inPlaylistMode || !Number.isFinite(current.index) || current.index <= 0;
  const atEnd = !inPlaylistMode || !Number.isFinite(current.index) || current.index >= (queueLength - 1);
  const canWrap = Boolean(current?.playlistLoop);
  const canPrev = inPlaylistMode && queueLength > 1 && (!atStart || canWrap);
  const canNext = inPlaylistMode && queueLength > 1 && (!atEnd || canWrap);

  const nowTarget = panel.querySelector(`.${MODULE_ID}-sidebar-now`);
  if (nowTarget) nowTarget.textContent = currentLabel;

  if (!canManage) return;

  const prevButton = panel.querySelector("button[data-action='playlist-prev']");
  if (prevButton) prevButton.disabled = !canPrev;

  const nextButton = panel.querySelector("button[data-action='playlist-next']");
  if (nextButton) nextButton.disabled = !canNext;

  const sectionHtml = [
    { key: "playlists", html: playlistsHtml },
    { key: "music", html: tracksHtml },
    { key: "ambiencePlaylists", html: ambiencePlaylistsHtml },
    { key: "ambience", html: ambienceTracksHtml },
  ];

  sectionHtml.forEach(({ key, html }) => {
    const list = panel.querySelector(`details[data-section='${key}'] .${MODULE_ID}-sidebar-list`);
    if (list) list.innerHTML = html;
  });
}

function injectPlaylistDirectoryNativePlaylistsPanel(root) {
  const directoryList = root.querySelector(".directory-list");
  if (!directoryList) return;

  let panel = root.querySelector(`.${MODULE_ID}-native-playlists-panel`);
  if (!panel) {
    panel = document.createElement("section");
    panel.classList.add(`${MODULE_ID}-native-playlists-panel`);
    panel.innerHTML = `
      <header class="playlist-header" data-action="toggle-native-playlists-panel">
        <i class="expand fa-solid fa-angle-up" inert></i>
        <strong>${escapeHtml(t("Sidebar.FoundryPlaylists", "Foundry Playlists"))}</strong>
      </header>
      <div class="expandable">
        <div class="wrapper"></div>
      </div>
    `;

    const panelHeader = panel.querySelector("header[data-action='toggle-native-playlists-panel']");
    panelHeader?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      sidebarUiState.nativePlaylistsCollapsed = !sidebarUiState.nativePlaylistsCollapsed;
      panel.classList.toggle("expanded", !sidebarUiState.nativePlaylistsCollapsed);
    });

    directoryList.before(panel);
  }

  const wrapper = panel.querySelector(".expandable > .wrapper");
  if (wrapper && directoryList.parentElement !== wrapper) {
    wrapper.append(directoryList);
  }

  panel.classList.toggle("expanded", !sidebarUiState.nativePlaylistsCollapsed);
}
function buildSidebarPlaylistsHtml(playlists, tracks) {
  if (!playlists.length) {
    return `<div class="${MODULE_ID}-sidebar-empty">${escapeHtml(t("Notes.NoPlaylistsYet", "No playlists yet."))}</div>`;
  }

  const trackMap = new Map(tracks.map((entry) => [entry.id, entry]));
  const current = playbackState.current;
  return playlists
    .map((playlist) => {
      const active = current?.mode === "playlist" && current?.playlistId === playlist.id;
      const validTrackIds = normalizeArray(playlist.trackIds).filter((id) => trackMap.has(id));
      const count = validTrackIds.length;
      const loopEnabled = Boolean(playlist.loop);
      const shuffleEnabled = Boolean(playlist.shuffle);
      const expanded = Boolean(sidebarPlaylistExpandState[playlist.id]);
      const playAction = active ? (current?.paused ? "resume-current" : "pause-current") : "play-playlist";
      const playIcon = active && !current?.paused ? "fa-pause" : "fa-play";
      const tracksHtml = validTrackIds.length
        ? validTrackIds.map((trackId, index) => {
          const track = trackMap.get(trackId);
          const trackActive = active && current?.trackId === trackId;
          const trackPlayAction = trackActive ? (current?.paused ? "resume-current" : "pause-current") : "play-playlist-from-track";
          const trackPlayIcon = trackActive && !current?.paused ? "fa-pause" : "fa-play";
          return `
            <div class="${MODULE_ID}-sidebar-subrow ${trackActive ? "is-active" : ""}">
              <button
                type="button"
                data-action="${trackPlayAction}"
                data-playlist-id="${playlist.id}"
                data-track-id="${trackId}"
                class="play-from-track"
                title="${escapeHtml(t("Common.PlayFromTrack", "Play playlist from this track"))}"
              ><i class="fas ${trackPlayIcon}"></i></button>
              <span class="index">${index + 1}.</span>
              <span class="track-name">${escapeHtml(untitledName(track?.name))}</span>
            </div>
          `;
        }).join("")
        : `<div class="${MODULE_ID}-sidebar-subrow is-empty">${escapeHtml(t("Notes.NoTracksAvailable", "No tracks available"))}</div>`;
      return `
        <div class="${MODULE_ID}-sidebar-playlist ${expanded ? "is-expanded" : ""}">
          <div class="${MODULE_ID}-sidebar-row ${active ? "is-active" : ""}">
            <div class="row-actions">
              <button type="button" data-action="${playAction}" data-id="${playlist.id}" class="play"><i class="fas ${playIcon}"></i></button>
              <button type="button" data-action="toggle-playlist-loop" data-id="${playlist.id}" class="loop ${loopEnabled ? "is-on" : ""}" title="${escapeHtml(t("Common.Loop", "Loop"))}"><i class="fas fa-repeat"></i></button>
              <button type="button" data-action="toggle-playlist-shuffle" data-id="${playlist.id}" class="shuffle ${shuffleEnabled ? "is-on" : ""}" title="${escapeHtml(t("Common.Shuffle", "Shuffle"))}"><i class="fas fa-random"></i></button>
              <button type="button" data-action="toggle-sidebar-playlist-expand" data-id="${playlist.id}" class="expand ${expanded ? "is-on" : ""}" title="${escapeHtml(t(expanded ? "Common.HideTracks" : "Common.ShowTracks", expanded ? "Hide tracks" : "Show tracks"))}"><i class="fas ${expanded ? "fa-chevron-down" : "fa-chevron-right"}"></i></button>
            </div>
            <div class="meta">
              <strong>${escapeHtml(untitledName(playlist.name))}</strong>
              <span>${escapeHtml(formatSidebarPlaylistMeta(count, loopEnabled, shuffleEnabled))}</span>
            </div>
          </div>
          <div class="${MODULE_ID}-sidebar-sublist ${expanded ? "is-open" : ""}">
            ${tracksHtml}
          </div>
        </div>
      `;
    })
    .join("");
}

function buildSidebarTracksHtml(tracks, fileMap) {
  if (!tracks.length) {
    return `<div class="${MODULE_ID}-sidebar-empty">${escapeHtml(t("Notes.NoTracksYet", "No tracks yet."))}</div>`;
  }

  const current = playbackState.current;
  return tracks
    .map((track) => {
      const active = current?.trackId === track.id;
      const fileName = fileMap.get(track.fileId)?.name || t("Common.FileMissingShort", "File?");
      const clip = `${track.start || "0"}-${track.end || "-"}`;
      const loopEnabled = Boolean(track.loop);
      const playAction = active ? (current?.paused ? "resume-current" : "pause-current") : "play-track";
      const playIcon = active && !current?.paused ? "fa-pause" : "fa-play";
      const progress = getTrackProgressForSidebar(track);
      const progressRow = progress
        ? `
          <div class="progress">
            <span class="progress-time">${escapeHtml(progress.label)}</span>
          </div>
        `
        : "";
      return `
        <div class="${MODULE_ID}-sidebar-row ${active ? "is-active" : ""}">
          <div class="row-actions">
            <button type="button" data-action="${playAction}" data-id="${track.id}" class="play"><i class="fas ${playIcon}"></i></button>
            <button type="button" data-action="toggle-track-loop" data-id="${track.id}" class="loop ${loopEnabled ? "is-on" : ""}" title="${escapeHtml(t("Common.Loop", "Loop"))}"><i class="fas fa-repeat"></i></button>
          </div>
          <div class="meta">
            <strong>${escapeHtml(untitledName(track.name))}</strong>
            <span>${escapeHtml(formatSidebarTrackMeta(fileName, clip, loopEnabled))}</span>
            ${progressRow}
          </div>
        </div>
      `;
    })
    .join("");
}

function buildSidebarAmbiencePlaylistsHtml(playlists, tracks) {
  if (!playlists.length) {
    return `<div class="${MODULE_ID}-sidebar-empty">${escapeHtml(t("Notes.NoAmbiencePlaylistsYet", "No ambience playlists yet."))}</div>`;
  }

  const validTrackSet = new Set(tracks.map((entry) => entry.id));
  return playlists
    .map((playlist) => {
      const active = isAmbiencePlaylistActive(playlist.id);
      const count = normalizeArray(playlist.trackIds).filter((id) => validTrackSet.has(id)).length;
      const loopEnabled = Boolean(playlist.loop);
      const shuffleEnabled = Boolean(playlist.shuffle);
      const playAction = active ? "stop-ambience-playlist" : "play-ambience-playlist";
      const playIcon = active ? "fa-pause" : "fa-play";
      return `
        <div class="${MODULE_ID}-sidebar-row ${active ? "is-active" : ""}">
          <div class="row-actions">
            <button type="button" data-action="${playAction}" data-id="${playlist.id}" class="play"><i class="fas ${playIcon}"></i></button>
            <button type="button" data-action="toggle-ambience-playlist-loop" data-id="${playlist.id}" class="loop ${loopEnabled ? "is-on" : ""}" title="${escapeHtml(t("Common.Loop", "Loop"))}"><i class="fas fa-repeat"></i></button>
            <button type="button" data-action="toggle-ambience-playlist-shuffle" data-id="${playlist.id}" class="shuffle ${shuffleEnabled ? "is-on" : ""}" title="${escapeHtml(t("Common.Shuffle", "Shuffle"))}"><i class="fas fa-random"></i></button>
          </div>
          <div class="meta">
            <strong>${escapeHtml(untitledName(playlist.name))}</strong>
            <span>${escapeHtml(formatSidebarPlaylistMeta(count, loopEnabled, shuffleEnabled))}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function buildSidebarAmbienceTracksHtml(tracks, fileMap) {
  if (!tracks.length) {
    return `<div class="${MODULE_ID}-sidebar-empty">${escapeHtml(t("Notes.NoAmbienceTracksYet", "No ambience tracks yet."))}</div>`;
  }

  return tracks
    .map((track) => {
      const active = isAmbienceTrackActive(track.id);
      const fileName = fileMap.get(track.fileId)?.name || t("Common.FileMissingShort", "File?");
      const clip = `${track.start || "0"}-${track.end || "-"}`;
      const loopEnabled = Boolean(track.loop);
      return `
        <div class="${MODULE_ID}-sidebar-row ${active ? "is-active" : ""}">
          <div class="row-actions">
            <button type="button" data-action="${active ? "stop-ambience" : "play-ambience"}" data-id="${track.id}" class="play">
              <i class="fas ${active ? "fa-stop" : "fa-play"}"></i>
            </button>
            <button type="button" data-action="toggle-ambience-track-loop" data-id="${track.id}" class="loop ${loopEnabled ? "is-on" : ""}" title="${escapeHtml(t("Common.Loop", "Loop"))}"><i class="fas fa-repeat"></i></button>
          </div>
          <div class="meta">
            <strong>${escapeHtml(untitledName(track.name))}</strong>
            <span>${escapeHtml(formatSidebarTrackMeta(fileName, clip, loopEnabled))}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function getCurrentPlaybackLabelForSidebar(tracks, playlists) {
  if (!playbackState.current) return t("Sidebar.Stopped", "Stopped");

  const pausedMark = playbackState.current.paused ? t("Status.PausedMark", " [paused]") : "";
  const currentTrack = tracks.find((track) => track.id === playbackState.current.trackId);
  if (playbackState.current.mode === "playlist") {
    const playlist = playlists.find((entry) => entry.id === playbackState.current.playlistId);
    return tf("Sidebar.NowPlayingPlaylist", {
      playlist: playlist?.name ?? "?",
      track: currentTrack?.name ?? "?",
      paused: pausedMark,
    }, ({ playlist: currentPlaylist, track, paused }) => `Playing playlist: ${currentPlaylist} | ${track}${paused}`);
  }

  return tf("Sidebar.NowPlayingTrack", {
    track: currentTrack?.name ?? "?",
    paused: pausedMark,
  }, ({ track, paused }) => `Playing track: ${track}${paused}`);
}

function getCurrentPlaybackLabelForManager(tracks, playlists) {
  if (!playbackState.current) return t("Status.Stopped", "Stopped");

  const currentTrack = tracks.find((track) => track.id === playbackState.current.trackId);
  if (playbackState.current.mode === "playlist") {
    const playlist = playlists.find((entry) => entry.id === playbackState.current.playlistId);
    return tf("Status.ManagerPlaylist", {
      playlist: playlist?.name ?? "?",
      track: currentTrack?.name ?? "?",
    }, ({ playlist: currentPlaylist, track }) => `Playlist: ${currentPlaylist} | Track: ${track}`);
  }

  return tf("Status.ManagerTrack", { track: currentTrack?.name ?? "?" }, ({ track }) => `Track: ${track}`);
}

function getManagerCardTemplateState() {
  return {
    musicPlaylists: {
      expanded: Boolean(managerCardExpandState.musicPlaylists),
    },
    musicTracks: {
      expanded: Boolean(managerCardExpandState.musicTracks),
    },
    ambiencePlaylists: {
      expanded: Boolean(managerCardExpandState.ambiencePlaylists),
    },
    ambienceTracks: {
      expanded: Boolean(managerCardExpandState.ambienceTracks),
    },
  };
}

function refreshManagerRuntimeUi() {
  if (!appInstance?.rendered) return;
  const root = appInstance.element?.[0];
  if (!(root instanceof HTMLElement)) return;

  const tracks = getTracks();
  const playlists = getPlaylists();
  const current = playbackState.current;
  const paused = Boolean(current?.paused);

  const statusLabel = root.querySelector(".ts-dj-status > span");
  if (statusLabel) statusLabel.textContent = getCurrentPlaybackLabelForManager(tracks, playlists);

  const status = root.querySelector(".ts-dj-status");
  if (status) {
    let stopButton = status.querySelector("button[data-action='stop']");
    if (current) {
      if (!stopButton) {
        stopButton = document.createElement("button");
        stopButton.type = "button";
        stopButton.className = "ts-dj-icon-button";
        stopButton.dataset.action = "stop";
        stopButton.title = t("Common.Stop", "Stop");
        stopButton.setAttribute("aria-label", t("Common.Stop", "Stop"));
        stopButton.innerHTML = "<i class=\"fas fa-stop\"></i>";
        status.appendChild(stopButton);
      }
    } else if (stopButton) {
      stopButton.remove();
    }
  }

  syncManagerRangeControl(root, "[data-action='set-live-rate']", ".ts-dj-live-rate-value", getLiveRate(), formatRate);
  syncManagerRangeControl(root, "[data-action='set-live-music-volume']", ".ts-dj-live-music-volume-value", getLiveMusicVolume(), formatVolumePercent);
  syncManagerRangeControl(root, "[data-action='set-live-ambience-volume']", ".ts-dj-live-ambience-volume-value", getLiveAmbienceVolume(), formatVolumePercent);

  root.querySelectorAll(".ts-dj-row[data-track-id]").forEach((row) => {
    const trackId = row.dataset.trackId;
    if (!trackId) return;

    const active = current?.trackId === trackId;
    row.classList.toggle("is-active", active);

    const playButton = row.querySelector("button.ts-dj-play-toggle");
    if (!playButton) return;

    const action = active ? (paused ? "resume-current" : "pause-current") : "play-track";
    const icon = active && !paused ? "fa-pause" : "fa-play";
    playButton.dataset.action = action;
    playButton.innerHTML = `<i class="fas ${icon}"></i>`;
  });

  root.querySelectorAll(".ts-dj-row[data-playlist-id]").forEach((row) => {
    const playlistId = row.dataset.playlistId;
    if (!playlistId) return;

    const active = current?.mode === "playlist" && current?.playlistId === playlistId;
    row.classList.toggle("is-active", active);

    const playButton = row.querySelector("button.ts-dj-play-toggle");
    if (!playButton) return;

    const action = active ? (paused ? "resume-current" : "pause-current") : "play-playlist";
    const icon = active && !paused ? "fa-pause" : "fa-play";
    playButton.dataset.action = action;
    playButton.innerHTML = `<i class="fas ${icon}"></i>`;
  });

  root.querySelectorAll(".ts-dj-row[data-ambience-track-id]").forEach((row) => {
    const trackId = row.dataset.ambienceTrackId;
    if (!trackId) return;
    const active = isAmbienceTrackActive(trackId);
    row.classList.toggle("is-active", active);

    const playButton = row.querySelector("button.ts-dj-play-toggle");
    if (!playButton) return;

    playButton.dataset.action = active ? "stop-ambience-track" : "play-ambience-track";
    playButton.innerHTML = `<i class="fas ${active ? "fa-stop" : "fa-play"}"></i>`;
  });

  root.querySelectorAll(".ts-dj-row[data-ambience-playlist-id]").forEach((row) => {
    const playlistId = row.dataset.ambiencePlaylistId;
    if (!playlistId) return;
    const active = isAmbiencePlaylistActive(playlistId);
    row.classList.toggle("is-active", active);

    const playButton = row.querySelector("button.ts-dj-play-toggle");
    if (!playButton) return;

    playButton.dataset.action = active ? "stop-ambience-playlist" : "play-ambience-playlist";
    playButton.innerHTML = `<i class="fas ${active ? "fa-pause" : "fa-play"}"></i>`;
  });
}

function syncManagerRangeControl(root, inputSelector, labelSelector, value, format) {
  const input = root.querySelector(inputSelector);
  if (input && document.activeElement !== input) {
    input.value = String(value);
  }

  const label = root.querySelector(labelSelector);
  if (label) {
    label.textContent = format(value);
  }
}

async function updateCurrentPlaybackLoopMode(loopEnabled) {
  const current = playbackState.current;
  if (!current?.sound) return;
  current.loopEnabled = loopEnabled;

  const clipStart = Number.isFinite(current.clipStart) ? current.clipStart : 0;
  const loopMode = resolveLoopPlaybackMode({
    sound: current.sound,
    loopEnabled,
    clipStart,
    clipEnd: current.clipEnd,
  });
  current.clipEnd = loopMode.clipEnd;

  if (loopMode.hasClip && !loopMode.coversFullTrack && !current.paused) {
    const track = getTracks().find((entry) => entry.id === current.trackId);
    if (track) {
      const resumeAtRaw = getCurrentAbsoluteTime(current);
      let resumeAt = Number.isFinite(resumeAtRaw) ? resumeAtRaw : clipStart;
      if (loopEnabled) {
        const clipDuration = loopMode.clipEnd - clipStart;
        const passed = Math.max(0, resumeAt - clipStart);
        resumeAt = clipStart + (passed % clipDuration);
      } else {
        resumeAt = Math.min(resumeAt, Math.max(clipStart, loopMode.clipEnd - 0.01));
      }

      const queue = Array.isArray(current.queue) && current.queue.length ? [...current.queue] : [track.id];
      await playTrack(track, {
        mode: current.mode ?? "track",
        playlistId: current.playlistId ?? null,
        queue,
        index: Number.isFinite(current.index) ? current.index : 0,
        playlistLoop: Boolean(current.playlistLoop),
        playlistShuffle: Boolean(current.playlistShuffle),
        loopOverride: loopEnabled,
        playOffset: resumeAt,
      });
      return;
    }
  }

  try {
    current.sound.loop = loopMode.nativeLoopEnabled;
  } catch (_error) {
    // no-op
  }

  try {
    if (current.sound.element) current.sound.element.loop = loopMode.nativeLoopEnabled;
  } catch (_error) {
    // no-op
  }

  current.segmentLoopActive = bindSegmentLoopToSound(current.sound, {
    enabled: loopMode.useSegmentLoop,
    start: clipStart,
    end: loopMode.clipEnd,
    label: "music-toggle",
    onLoop: (loopStart) => markSegmentLoopRestart(current, loopStart),
    onLoopRestart: (loopStart) => restartCurrentTrackLoopPlayback(loopStart, current.token),
    getCurrentTime: () => {
      const active = playbackState.current;
      if (!active || active.token !== current.token) return null;
      return getEstimatedAbsoluteTime(active);
    },
  });

  clearClipEndMonitor(current);
  if (loopMode.hasClip && !loopEnabled && !current.paused) {
    current.clipMonitorId = startClipEndMonitor(current.sound, clipStart, loopMode.clipEnd, current.token);
  }
}

function updateAmbiencePlaybackLoopMode(entry, loopEnabled) {
  if (!entry?.sound) return;
  entry.loopEnabled = loopEnabled;
  const clipStart = Number.isFinite(entry.clipStart) ? entry.clipStart : 0;
  const loopMode = resolveLoopPlaybackMode({
    sound: entry.sound,
    loopEnabled,
    clipStart,
    clipEnd: entry.clipEnd,
  });
  entry.clipEnd = loopMode.clipEnd;

  try {
    entry.sound.loop = loopMode.nativeLoopEnabled;
  } catch (_error) {
    // no-op
  }

  try {
    if (entry.sound.element) entry.sound.element.loop = loopMode.nativeLoopEnabled;
  } catch (_error) {
    // no-op
  }

  entry.segmentLoopActive = bindSegmentLoopToSound(entry.sound, {
    enabled: loopMode.useSegmentLoop,
    start: clipStart,
    end: loopMode.clipEnd,
    label: "ambience-toggle",
    onLoop: (loopStart) => markSegmentLoopRestart(entry, loopStart),
    onLoopRestart: (loopStart) => restartAmbienceLoopPlayback(loopStart, entry.token),
    getCurrentTime: () => {
      const activeEntry = ambienceState.active.get(entry.token);
      if (!activeEntry) return null;
      return getEstimatedAbsoluteTime(activeEntry);
    },
  });

  clearAmbienceClipEndMonitor(entry);
  if (loopMode.hasClip && !loopEnabled && !entry.paused) {
    entry.clipMonitorId = startAmbienceClipEndMonitor(entry.sound, clipStart, loopMode.clipEnd, entry.token);
  }
}

function applySoundRate(sound, rate) {
  if (!sound) return;
  const safeRate = normalizeRate(rate);

  try {
    if (sound.element && Number.isFinite(sound.element.playbackRate)) {
      sound.element.playbackRate = safeRate;
      return;
    }
  } catch (_error) {
    // no-op
  }

  try {
    if (sound.sourceElement && Number.isFinite(sound.sourceElement.playbackRate)) {
      sound.sourceElement.playbackRate = safeRate;
      return;
    }
  } catch (_error) {
    // no-op
  }

  try {
    const node = sound.sourceNode;
    if (!node) return;

    if (node.playbackRate && typeof node.playbackRate.value === "number") {
      node.playbackRate.value = safeRate;
      return;
    }

    if (typeof node.playbackRate === "number") {
      node.playbackRate = safeRate;
    }
  } catch (_error) {
    // no-op
  }
}

function clearSegmentLoopBinding(sound) {
  const intervalId = segmentLoopIntervals.get(sound);
  if (!intervalId) return;
  window.clearInterval(intervalId);
  segmentLoopIntervals.delete(sound);
}

function resolveLoopPlaybackMode({ sound, loopEnabled = false, clipStart = 0, clipEnd = null } = {}) {
  const safeLoopEnabled = Boolean(loopEnabled);
  const safeStart = Number.isFinite(clipStart) ? Math.max(0, Number(clipStart)) : 0;
  const duration = getSoundDuration(sound);
  let safeEnd = Number.isFinite(clipEnd) ? Number(clipEnd) : null;

  if (Number.isFinite(safeEnd) && Number.isFinite(duration) && duration > 0) {
    if (safeEnd > duration) {
      safeEnd = duration;
    } else if (Math.abs(safeEnd - duration) <= FULL_TRACK_LOOP_TOLERANCE_SEC) {
      safeEnd = duration;
    }
  }

  const hasClip = Number.isFinite(safeEnd) && safeEnd > safeStart;
  const coversFullTrack = hasClip
    && Number.isFinite(duration)
    && duration > 0
    && safeStart <= FULL_TRACK_LOOP_TOLERANCE_SEC
    && safeEnd >= (duration - FULL_TRACK_LOOP_TOLERANCE_SEC);
  const nativeLoopEnabled = safeLoopEnabled && (!hasClip || coversFullTrack);

  return {
    clipEnd: safeEnd,
    hasClip,
    coversFullTrack,
    nativeLoopEnabled,
    useSegmentLoop: safeLoopEnabled && hasClip && !coversFullTrack,
  };
}

function hasSeekablePlaybackHandle(sound) {
  if (!sound) return false;
  if (typeof sound.seek === "function") return true;
  if (Number.isFinite(sound.currentTime)) return true;
  if (Number.isFinite(sound.element?.currentTime)) return true;
  if (Number.isFinite(sound.sourceElement?.currentTime)) return true;
  return false;
}

function hasSegmentLoopActive(state) {
  return Boolean(state?.segmentLoopActive);
}

function markSegmentLoopRestart(state, loopStart) {
  if (!state) return;
  state.loopRestarting = true;
  state.ignoreEndedUntil = Date.now() + 1200;
  state.timingBaseAbs = loopStart;
  state.timingBaseMs = Date.now();
  window.setTimeout(() => {
    if (state) state.loopRestarting = false;
  }, 250);
}

async function restartCurrentTrackLoopPlayback(loopStart, token) {
  const current = playbackState.current;
  if (!current || current.token !== token) return false;

  const track = getTracks().find((entry) => entry.id === current.trackId);
  if (!track) return false;

  const queue = Array.isArray(current.queue) && current.queue.length
    ? [...current.queue]
    : [track.id];

  return await playTrack(track, {
    mode: current.mode ?? "track",
    playlistId: current.playlistId ?? null,
    queue,
    index: Number.isFinite(current.index) ? current.index : 0,
    playlistLoop: Boolean(current.playlistLoop),
    playlistShuffle: Boolean(current.playlistShuffle),
    loopOverride: true,
    playOffset: loopStart,
  });
}

async function restartAmbienceLoopPlayback(loopStart, token) {
  const entry = ambienceState.active.get(token);
  if (!entry) return false;

  const track = getAmbienceTracks().find((item) => item.id === entry.trackId);
  if (!track) return false;

  const queue = Array.isArray(entry.queue) && entry.queue.length
    ? [...entry.queue]
    : [track.id];

  await stopAmbienceEntry(entry);
  return await playAmbienceTrack(track, {
    mode: entry.mode ?? "track",
    playlistId: entry.playlistId ?? null,
    queue,
    index: Number.isFinite(entry.index) ? entry.index : 0,
    playlistLoop: Boolean(entry.playlistLoop),
    playlistShuffle: Boolean(entry.playlistShuffle),
    loopOverride: true,
    skipStopExisting: true,
  });
}

async function ensureSoundKeepsPlaying(sound) {
  if (!sound) return false;

  try {
    if (sound.element && typeof sound.element.play === "function" && (sound.element.paused || sound.element.ended)) {
      await sound.element.play();
      return true;
    }
  } catch (_error) {
    // no-op
  }

  try {
    if (sound.sourceElement && typeof sound.sourceElement.play === "function" && (sound.sourceElement.paused || sound.sourceElement.ended)) {
      await sound.sourceElement.play();
      return true;
    }
  } catch (_error) {
    // no-op
  }

  return false;
}

function bindSegmentLoopToSound(sound, { enabled = false, start = 0, end = null, label = "music", onLoop = null, onLoopRestart = null, getCurrentTime = null } = {}) {
  clearSegmentLoopBinding(sound);

  const safeStart = Number(start);
  const safeEnd = Number(end);
  const hasSegment = Boolean(enabled) && Number.isFinite(safeStart) && Number.isFinite(safeEnd) && safeEnd > safeStart;
  if (!hasSegment) return false;
  if (!hasSeekablePlaybackHandle(sound)) {
    console.warn(`${MODULE_ID} | clip loop unavailable`, {
      label,
      start: safeStart,
      end: safeEnd,
      hasSound: Boolean(sound),
    });
    return false;
  }

  const pollMs = 80;
  const toleranceSec = 0.05;
  let cooldownUntil = 0;
  let restarting = false;
  const intervalId = window.setInterval(async () => {
    if (restarting) return;
    if (Date.now() < cooldownUntil) return;

    const currentTime = typeof getCurrentTime === "function"
      ? (getCurrentTime() ?? getSoundCurrentTime(sound))
      : getSoundCurrentTime(sound);
    if (!Number.isFinite(currentTime)) return;
    if ((currentTime + toleranceSec) < safeEnd) return;

    restarting = true;
    if (typeof onLoopRestart === "function") {
      try {
        const restarted = await onLoopRestart(safeStart);
        if (restarted !== false) {
          cooldownUntil = Date.now() + 250;
          if (typeof onLoop === "function") onLoop(safeStart);
          restarting = false;
          return;
        }
      } catch (error) {
        console.warn(`${MODULE_ID} | clip loop restart failed`, { label, error });
      }
    }

    const rewound = seekSoundToTime(sound, safeStart);
    if (rewound) {
      await ensureSoundKeepsPlaying(sound);
      cooldownUntil = Date.now() + 250;
      if (typeof onLoop === "function") onLoop(safeStart);
      restarting = false;
      return;
    }

    clearSegmentLoopBinding(sound);
    console.warn(`${MODULE_ID} | clip loop seek failed`, {
      label,
      start: safeStart,
      end: safeEnd,
    });
    restarting = false;
  }, pollMs);

  segmentLoopIntervals.set(sound, intervalId);
  console.warn(`${MODULE_ID} | clip loop bound`, {
    label,
    start: safeStart,
    end: safeEnd,
  });
  return true;
}

function applySoundVolume(sound, volume) {
  if (!sound) return;
  const safeVolume = clampNumber(Number(volume) || 0, 0, 1);

  try {
    sound.volume = safeVolume;
  } catch (_error) {
    // no-op
  }

  try {
    if (sound.element && typeof sound.element.volume === "number") {
      sound.element.volume = safeVolume;
    }
  } catch (_error) {
    // no-op
  }

  try {
    const node = sound.sourceNode;
    if (!node?.gain) return;

    if (typeof node.gain.value === "number") {
      node.gain.value = safeVolume;
      return;
    }

    const currentTime = Number(sound.context?.currentTime ?? 0);
    if (typeof node.gain.setValueAtTime === "function" && Number.isFinite(currentTime)) {
      node.gain.setValueAtTime(safeVolume, currentTime);
    }
  } catch (_error) {
    // no-op
  }
}

function getEnvironmentVolume() {
  const value = Number(game.settings.get("core", "globalAmbientVolume"));
  return clampNumber(Number.isFinite(value) ? value : 1, 0, 1);
}

function getEffectiveAmbienceVolumeForSound(sound, {
  environmentVolume = getEnvironmentVolume(),
  ambienceVolume = getLiveAmbienceVolume(),
} = {}) {
  const moduleAmbienceVolume = normalizeVolume(ambienceVolume);
  if (isSoundOnChannel(sound, "environment")) {
    return moduleAmbienceVolume;
  }
  return clampNumber(environmentVolume * moduleAmbienceVolume, 0, 1);
}

function applyEnvironmentVolumeToActiveAmbience({
  force = false,
  ambienceVolume = getLiveAmbienceVolume(),
} = {}) {
  const environmentVolume = getEnvironmentVolume();
  const normalizedAmbienceVolume = normalizeVolume(ambienceVolume);
  const fingerprint = `${environmentVolume.toFixed(3)}|${normalizedAmbienceVolume.toFixed(3)}`;
  if (!force && lastAmbienceVolumeFingerprint === fingerprint) {
    return;
  }
  lastAmbienceVolumeFingerprint = fingerprint;

  for (const entry of ambienceState.active.values()) {
    const effectiveVolume = getEffectiveAmbienceVolumeForSound(entry.sound, {
      environmentVolume,
      ambienceVolume: normalizedAmbienceVolume,
    });
    applySoundVolume(entry.sound, effectiveVolume);
  }
}

function startAmbienceEnvironmentVolumeWatcher() {
  if (ambienceEnvironmentVolumeTicker) return;
  ambienceEnvironmentVolumeTicker = window.setInterval(() => {
    if (!ambienceState.active.size) return;
    applyEnvironmentVolumeToActiveAmbience();
  }, 250);
}

function stopAmbienceEnvironmentVolumeWatcher() {
  if (!ambienceEnvironmentVolumeTicker) return;
  window.clearInterval(ambienceEnvironmentVolumeTicker);
  ambienceEnvironmentVolumeTicker = null;
}

function sortEntriesByName(entries) {
  return [...entries].sort((left, right) => {
    const byName = NAME_SORT_COLLATOR.compare(
      String(left?.name ?? "").trim(),
      String(right?.name ?? "").trim(),
    );
    if (byName !== 0) return byName;
    return NAME_SORT_COLLATOR.compare(String(left?.id ?? ""), String(right?.id ?? ""));
  });
}

function getPlaylistTrackEditorName(track) {
  return untitledName(track?.name);
}

function getPlaylistTracksForEditor(tracks, selectedTrackIds = []) {
  const normalizedTracks = tracks.map((track) => ({
    ...track,
    name: getPlaylistTrackEditorName(track),
  }));
  const sortedTracks = sortEntriesByName(normalizedTracks);
  if (!selectedTrackIds.length) return sortedTracks;

  const selectedSet = new Set(selectedTrackIds);
  const trackMap = new Map(sortedTracks.map((track) => [track.id, track]));
  const selectedTracks = selectedTrackIds
    .map((trackId) => trackMap.get(trackId))
    .filter(Boolean);
  const unselectedTracks = sortedTracks.filter((track) => !selectedSet.has(track.id));
  return [...selectedTracks, ...unselectedTracks];
}

function syncPlaylistTrackOrderInput(form) {
  if (!(form instanceof HTMLFormElement)) return;
  const orderInput = form.querySelector("input[name='trackOrder']");
  if (!(orderInput instanceof HTMLInputElement)) return;

  const orderedSelectedTrackIds = [...form.querySelectorAll("[data-track-row]")]
    .filter((row) => {
      const checkbox = row.querySelector("input[name='trackIds']");
      return checkbox instanceof HTMLInputElement && checkbox.checked;
    })
    .map((row) => row.dataset.trackId)
    .filter((trackId) => trackId);

  orderInput.value = orderedSelectedTrackIds.join(",");
}

function initPlaylistTrackPicker(form) {
  if (!(form instanceof HTMLFormElement)) return;
  const list = form.querySelector("[data-playlist-track-picker]");
  if (!(list instanceof HTMLElement)) {
    syncPlaylistTrackOrderInput(form);
    return;
  }

  const updateCheckedState = (row) => {
    const checkbox = row?.querySelector("input[name='trackIds']");
    if (!(checkbox instanceof HTMLInputElement)) return;
    row.classList.toggle("is-checked", checkbox.checked);
  };

  list.querySelectorAll("[data-track-row]").forEach((row) => {
    updateCheckedState(row);
  });
  syncPlaylistTrackOrderInput(form);

  let draggedRow = null;

  list.addEventListener("change", (event) => {
    const checkbox = event.target.closest("input[name='trackIds']");
    if (!(checkbox instanceof HTMLInputElement)) return;
    const row = checkbox.closest("[data-track-row]");
    if (row instanceof HTMLElement) updateCheckedState(row);
    syncPlaylistTrackOrderInput(form);
  });

  list.querySelectorAll("[data-track-row]").forEach((row) => {
    row.addEventListener("dragstart", (event) => {
      draggedRow = row;
      row.classList.add("is-dragging");
      event.dataTransfer?.setData("text/plain", row.dataset.trackId ?? "");
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    });

    row.addEventListener("dragend", () => {
      row.classList.remove("is-dragging");
      draggedRow = null;
      syncPlaylistTrackOrderInput(form);
    });
  });

  list.addEventListener("dragover", (event) => {
    if (!(draggedRow instanceof HTMLElement)) return;
    event.preventDefault();

    const targetRow = event.target.closest("[data-track-row]");
    if (!(targetRow instanceof HTMLElement) || targetRow === draggedRow) return;

    const bounds = targetRow.getBoundingClientRect();
    const shouldInsertAfter = (event.clientY - bounds.top) > (bounds.height / 2);
    const nextNode = shouldInsertAfter ? targetRow.nextElementSibling : targetRow;
    if (nextNode === draggedRow) return;
    list.insertBefore(draggedRow, nextNode);
  });

  list.addEventListener("drop", (event) => {
    if (!(draggedRow instanceof HTMLElement)) return;
    event.preventDefault();
    syncPlaylistTrackOrderInput(form);
  });
}

function getFiles() {
  return normalizeArray(storageState.files);
}

function getTracks() {
  return normalizeArray(storageState.tracks);
}

function getPlaylists() {
  return normalizeArray(storageState.playlists);
}

function getAmbienceTracks() {
  return normalizeArray(storageState.ambienceTracks);
}

function getAmbiencePlaylists() {
  return normalizeArray(storageState.ambiencePlaylists);
}

function getAmbienceAllowConcurrent() {
  return Boolean(storageState.ambienceAllowConcurrent);
}

async function setStorageData(nextData) {
  if (!canManagePlaylistControls()) {
    notify("warn", "NoPermission", {}, "TS-DJ-MUSIC: insufficient module permissions.");
    throw new Error("TS-DJ-MUSIC: user is not allowed to manage this module");
  }

  try {
    if (!storageLoaded) {
      await initializeStorageState();
    }
    applyStorageData(nextData);
    await persistStorageState();
  } catch (error) {
    console.warn(`${MODULE_ID} | failed to replace storage data`, error);
    notify("error", "StorageApplyFailed", {}, "TS-DJ-MUSIC: failed to apply changes to playlist storage.");
    throw error;
  }
  refreshPlaylistDirectoryUi();
}

async function setStorageValue(key, value) {
  if (!(key in storageState)) {
    throw new Error(`TS-DJ-MUSIC: invalid storage key "${key}"`);
  }
  if (!storageLoaded) {
    await initializeStorageState();
  }
  const nextData = cloneStorageData();
  nextData[key] = value;
  await setStorageData(nextData);
}

async function setFiles(files) {
  await setStorageValue("files", normalizeArray(files));
}

async function setTracks(tracks) {
  await setStorageValue("tracks", normalizeArray(tracks));
}

async function setPlaylists(playlists) {
  await setStorageValue("playlists", normalizeArray(playlists));
}

async function setAmbienceTracks(tracks) {
  await setStorageValue("ambienceTracks", normalizeArray(tracks));
}

async function setAmbiencePlaylists(playlists) {
  await setStorageValue("ambiencePlaylists", normalizeArray(playlists));
}

async function setAmbienceAllowConcurrent(enabled) {
  await setStorageValue("ambienceAllowConcurrent", Boolean(enabled));
}

function countPlaylistTracks(playlist, validTrackIds) {
  const ids = normalizeArray(playlist?.trackIds);
  if (!(validTrackIds instanceof Set)) return ids.length;
  return ids.filter((id) => validTrackIds.has(id)).length;
}

function reorderTrackIds(trackIds, movedTrackId, targetTrackId, insertAfter = false) {
  const orderedIds = normalizeArray(trackIds);
  const fromIndex = orderedIds.indexOf(movedTrackId);
  const targetIndex = orderedIds.indexOf(targetTrackId);
  if (fromIndex === -1 || targetIndex === -1 || fromIndex === targetIndex) return orderedIds;

  const [movedTrack] = orderedIds.splice(fromIndex, 1);
  let insertIndex = targetIndex;
  if (fromIndex < targetIndex) insertIndex -= 1;
  if (insertAfter) insertIndex += 1;
  orderedIds.splice(clampNumber(insertIndex, 0, orderedIds.length), 0, movedTrack);
  return orderedIds;
}

function applyVisibleTrackOrder(trackIds, orderedVisibleTrackIds) {
  const orderedIds = normalizeArray(trackIds);
  const visibleIds = normalizeArray(orderedVisibleTrackIds);
  if (!orderedIds.length || !visibleIds.length) return orderedIds;

  const visibleSet = new Set(visibleIds);
  const nextVisibleIds = [...visibleIds];
  return orderedIds.map((trackId) => (visibleSet.has(trackId) ? nextVisibleIds.shift() ?? trackId : trackId));
}

function collectNewlyEmptyPlaylists({ previousPlaylists = [], nextPlaylists = [], previousTrackIds = [], nextTrackIds = [] } = {}) {
  const previousValidTrackIds = new Set(normalizeArray(previousTrackIds));
  const nextValidTrackIds = new Set(normalizeArray(nextTrackIds));
  const nextPlaylistMap = new Map(normalizeArray(nextPlaylists).map((playlist) => [playlist.id, playlist]));

  return normalizeArray(previousPlaylists).filter((playlist) => {
    const previousCount = countPlaylistTracks(playlist, previousValidTrackIds);
    if (previousCount <= 0) return false;

    const nextPlaylist = nextPlaylistMap.get(playlist.id) ?? playlist;
    const nextCount = countPlaylistTracks(nextPlaylist, nextValidTrackIds);
    return nextCount === 0;
  });
}

function normalizeDialogSelection(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry));
  if (value === null || value === undefined || value === "") return [];
  return [String(value)];
}

async function promptEmptyPlaylistCleanup({ musicPlaylists = [], ambiencePlaylists = [] } = {}) {
  const music = normalizeArray(musicPlaylists);
  const ambience = normalizeArray(ambiencePlaylists);
  if (!music.length && !ambience.length) {
    return {
      musicPlaylistIds: [],
      ambiencePlaylistIds: [],
    };
  }

  const renderPlaylistOptions = (playlists, fieldName) => playlists.map((playlist) => `
    <label class="checkbox">
      <input type="checkbox" name="${fieldName}" value="${escapeHtml(playlist.id)}" checked>
      <span>${escapeHtml(untitledName(playlist.name))}</span>
    </label>
  `).join("");

  const content = `
    <form class="standard-form ts-dj-dialog-form">
      <p>${escapeHtml(t("Dialogs.EmptyCleanupDescription", "These playlists no longer contain any music. Select which ones should be deleted."))}</p>
      ${music.length ? `
        <div class="form-group stacked">
          <label>${escapeHtml(t("Dialogs.MusicPlaylistsLabel", "Music playlists"))}</label>
          <div class="form-fields">
            ${renderPlaylistOptions(music, "musicPlaylistIds")}
          </div>
        </div>
      ` : ""}
      ${ambience.length ? `
        <div class="form-group stacked">
          <label>${escapeHtml(t("Common.AmbiencePlaylists", "Ambience Playlists"))}</label>
          <div class="form-fields">
            ${renderPlaylistOptions(ambience, "ambiencePlaylistIds")}
          </div>
        </div>
      ` : ""}
    </form>
  `;

  const result = await promptDialog(t("Dialogs.EmptyCleanupTitle", "Delete empty playlists"), content, {
    confirmLabel: t("Dialogs.DeleteSelected", "Delete selected"),
    confirmIcon: "fa-trash",
  });

  if (!result) {
    return {
      musicPlaylistIds: [],
      ambiencePlaylistIds: [],
    };
  }

  return {
    musicPlaylistIds: normalizeDialogSelection(result.musicPlaylistIds),
    ambiencePlaylistIds: normalizeDialogSelection(result.ambiencePlaylistIds),
  };
}

async function maybeRemoveEmptyPlaylists({
  musicPreviousPlaylists = [],
  musicNextPlaylists = [],
  musicPreviousTrackIds = [],
  musicNextTrackIds = [],
  ambiencePreviousPlaylists = [],
  ambienceNextPlaylists = [],
  ambiencePreviousTrackIds = [],
  ambienceNextTrackIds = [],
} = {}) {
  const emptyMusicPlaylists = collectNewlyEmptyPlaylists({
    previousPlaylists: musicPreviousPlaylists,
    nextPlaylists: musicNextPlaylists,
    previousTrackIds: musicPreviousTrackIds,
    nextTrackIds: musicNextTrackIds,
  });
  const emptyAmbiencePlaylists = collectNewlyEmptyPlaylists({
    previousPlaylists: ambiencePreviousPlaylists,
    nextPlaylists: ambienceNextPlaylists,
    previousTrackIds: ambiencePreviousTrackIds,
    nextTrackIds: ambienceNextTrackIds,
  });

  if (!emptyMusicPlaylists.length && !emptyAmbiencePlaylists.length) {
    return {
      musicPlaylists: normalizeArray(musicNextPlaylists),
      ambiencePlaylists: normalizeArray(ambienceNextPlaylists),
      deletedMusicPlaylistIds: [],
      deletedAmbiencePlaylistIds: [],
    };
  }

  const selected = await promptEmptyPlaylistCleanup({
    musicPlaylists: emptyMusicPlaylists,
    ambiencePlaylists: emptyAmbiencePlaylists,
  });
  const deletedMusicPlaylistIds = normalizeDialogSelection(selected.musicPlaylistIds);
  const deletedAmbiencePlaylistIds = normalizeDialogSelection(selected.ambiencePlaylistIds);
  const deletedMusicIdSet = new Set(deletedMusicPlaylistIds);
  const deletedAmbienceIdSet = new Set(deletedAmbiencePlaylistIds);

  return {
    musicPlaylists: normalizeArray(musicNextPlaylists).filter((playlist) => !deletedMusicIdSet.has(String(playlist.id))),
    ambiencePlaylists: normalizeArray(ambienceNextPlaylists).filter((playlist) => !deletedAmbienceIdSet.has(String(playlist.id))),
    deletedMusicPlaylistIds,
    deletedAmbiencePlaylistIds,
  };
}

async function stopDeletedPlaylistPlayback({ deletedMusicPlaylistIds = [], deletedAmbiencePlaylistIds = [] } = {}) {
  const deletedMusicIdSet = new Set(normalizeDialogSelection(deletedMusicPlaylistIds));
  const deletedAmbienceIdSet = new Set(normalizeDialogSelection(deletedAmbiencePlaylistIds));

  if (playbackState.current?.mode === "playlist" && deletedMusicIdSet.has(String(playbackState.current.playlistId ?? ""))) {
    await stopPlayback();
  }

  for (const playlistId of deletedAmbienceIdSet) {
    await stopAmbienceByPlaylistId(playlistId);
  }
}

async function togglePlaylistLoop(playlistId) {
  const playlists = getPlaylists();
  const index = playlists.findIndex((entry) => entry.id === playlistId);
  if (index === -1) return;

  const loopEnabled = !Boolean(playlists[index].loop);
  playlists[index].loop = loopEnabled;
  await setPlaylists(playlists);

  if (playbackState.current?.mode === "playlist" && playbackState.current?.playlistId === playlistId) {
    playbackState.current.playlistLoop = loopEnabled;
  }

}

async function togglePlaylistShuffle(playlistId) {
  const playlists = getPlaylists();
  const index = playlists.findIndex((entry) => entry.id === playlistId);
  if (index === -1) return;

  const shuffleEnabled = !Boolean(playlists[index].shuffle);
  playlists[index].shuffle = shuffleEnabled;
  await setPlaylists(playlists);

  if (playbackState.current?.mode === "playlist" && playbackState.current?.playlistId === playlistId) {
    playbackState.current.playlistShuffle = shuffleEnabled;
  }

}

async function toggleTrackLoop(trackId) {
  const tracks = getTracks();
  const index = tracks.findIndex((entry) => entry.id === trackId);
  if (index === -1) return;

  const loopEnabled = !Boolean(tracks[index].loop);
  tracks[index].loop = loopEnabled;
  await setTracks(tracks);

  if (playbackState.current?.trackId === trackId) {
    await updateCurrentPlaybackLoopMode(loopEnabled);
  }

}

async function toggleAmbiencePlaylistLoop(playlistId) {
  const playlists = getAmbiencePlaylists();
  const index = playlists.findIndex((entry) => entry.id === playlistId);
  if (index === -1) return;

  const loopEnabled = !Boolean(playlists[index].loop);
  playlists[index].loop = loopEnabled;
  await setAmbiencePlaylists(playlists);

  for (const entry of ambienceState.active.values()) {
    if (entry.mode === "playlist" && entry.playlistId === playlistId) {
      entry.playlistLoop = loopEnabled;
    }
  }

}

async function toggleAmbiencePlaylistShuffle(playlistId) {
  const playlists = getAmbiencePlaylists();
  const index = playlists.findIndex((entry) => entry.id === playlistId);
  if (index === -1) return;

  const shuffleEnabled = !Boolean(playlists[index].shuffle);
  playlists[index].shuffle = shuffleEnabled;
  await setAmbiencePlaylists(playlists);

  for (const entry of ambienceState.active.values()) {
    if (entry.mode === "playlist" && entry.playlistId === playlistId) {
      entry.playlistShuffle = shuffleEnabled;
    }
  }

}

async function toggleAmbienceTrackLoop(trackId) {
  const tracks = getAmbienceTracks();
  const index = tracks.findIndex((entry) => entry.id === trackId);
  if (index === -1) return;

  const loopEnabled = !Boolean(tracks[index].loop);
  tracks[index].loop = loopEnabled;
  await setAmbienceTracks(tracks);

  const activeEntries = Array.from(ambienceState.active.values()).filter((entry) => entry.trackId === trackId);
  for (const entry of activeEntries) {
    updateAmbiencePlaybackLoopMode(entry, loopEnabled);
  }

}

function getLiveRate() {
  return normalizeRate(Number(game.settings.get(MODULE_ID, SETTING_KEYS.liveRate) ?? 1));
}

function getLiveMusicVolume() {
  return normalizeVolume(game.settings.get(MODULE_ID, SETTING_KEYS.liveMusicVolume));
}

function getLiveAmbienceVolume() {
  return normalizeVolume(game.settings.get(MODULE_ID, SETTING_KEYS.liveAmbienceVolume));
}

async function setLiveRate(rate, { apply = true, sync = true } = {}) {
  if (sync && !ensureModuleControlAccess()) {
    return;
  }

  const normalized = normalizeRate(rate);
  await game.settings.set(MODULE_ID, SETTING_KEYS.liveRate, normalized);

  if (apply) {
    if (playbackState.current?.sound) {
      const appliedRate = normalized !== 1
        ? normalized
        : normalizeRate(Number(playbackState.current.defaultRate ?? 1));
      applySoundRate(playbackState.current.sound, appliedRate);
      updateCurrentTimingRate(appliedRate);
    }
  }

  if (sync) {
    emitModuleSocketEvent(SOCKET_ACTIONS.setLiveRate, {
      rate: normalized,
      apply: Boolean(apply),
    });
  } else {
    refreshLiveControlsUi();
  }

}

async function setLiveMusicVolume(volume, { apply = true, sync = true } = {}) {
  if (sync && !ensureModuleControlAccess()) {
    return;
  }

  const normalized = normalizeVolume(volume);
  await game.settings.set(MODULE_ID, SETTING_KEYS.liveMusicVolume, normalized);

  if (apply) {
    applyMusicVolumeToCurrentPlayback({ volume: normalized, force: true });
  }

  if (sync) {
    emitModuleSocketEvent(SOCKET_ACTIONS.setLiveMusicVolume, {
      volume: normalized,
      apply: Boolean(apply),
    });
  } else {
    refreshLiveControlsUi();
  }
}

async function setLiveAmbienceVolume(volume, { apply = true, sync = true } = {}) {
  if (sync && !ensureModuleControlAccess()) {
    return;
  }

  const normalized = normalizeVolume(volume);
  await game.settings.set(MODULE_ID, SETTING_KEYS.liveAmbienceVolume, normalized);

  if (apply) {
    applyEnvironmentVolumeToActiveAmbience({ force: true, ambienceVolume: normalized });
  }

  if (sync) {
    emitModuleSocketEvent(SOCKET_ACTIONS.setLiveAmbienceVolume, {
      volume: normalized,
      apply: Boolean(apply),
    });
  } else {
    refreshLiveControlsUi();
  }
}

function applyMusicVolumeToCurrentPlayback({ volume = getLiveMusicVolume(), force = false } = {}) {
  const current = playbackState.current;
  if (!current?.sound) return;

  if (current.paused && !force) return;
  applySoundVolume(current.sound, volume);
}

function refreshPlaylistDirectoryUi() {
  enforceManagerAccessState();
  refreshManagerRuntimeUi();
  if (appInstance?.rendered) {
    void appInstance.refreshStorageCards();
  }

  const root = getRoot(ui.playlists?.element);
  if (root) {
    initializeSidebarUiStateFromSettings();
    root.classList.add(PLAYLIST_DIRECTORY_SCROLL_CLASS);
    injectPlaylistDirectoryButton(root);
    injectPlaylistDirectoryRateControl(root);
    injectPlaylistDirectoryDjPanel(root);
    injectPlaylistDirectoryNativePlaylistsPanel(root);
    return;
  }
  ui.playlists?.render(false);
}

function enforceManagerAccessState() {
  if (!appInstance?.rendered) return;
  if (canManagePlaylistControls()) return;
  appInstance.close();
}

function refreshLiveControlsUi() {
  refreshManagerRuntimeUi();
  const root = getRoot(ui.playlists?.element);
  if (root) {
    injectPlaylistDirectoryRateControl(root);
  }
}

async function resetModuleSettingsToDefaults() {
  if (!ensureModuleControlAccess()) return false;

  const confirmed = await Dialog.confirm({
    title: t("Dialogs.ResetSettingsTitle", "Reset settings"),
    content: t("Dialogs.ResetSettingsContent", "<p>Reset TS-DJ-MUSIC settings and delete all files, tracks, and playlists?</p>"),
  });
  if (!confirmed) return false;

  await stopPlayback();
  await stopAllAmbience();
  await setStorageData(defaultStorageData());
  await setLiveRate(DEFAULT_CLIENT_SETTINGS.liveRate, { apply: true });
  await setLiveMusicVolume(DEFAULT_CLIENT_SETTINGS.liveMusicVolume, { apply: true });
  await setLiveAmbienceVolume(DEFAULT_CLIENT_SETTINGS.liveAmbienceVolume, { apply: true });
  await game.settings.set(MODULE_ID, SETTING_KEYS.collapseGlobalVolumeByDefault, DEFAULT_CLIENT_SETTINGS.collapseGlobalVolumeByDefault);
  await game.settings.set(MODULE_ID, SETTING_KEYS.collapseTsDjPlaylistsByDefault, DEFAULT_CLIENT_SETTINGS.collapseTsDjPlaylistsByDefault);
  await game.settings.set(MODULE_ID, SETTING_KEYS.collapseFoundryPlaylistsByDefault, DEFAULT_CLIENT_SETTINGS.collapseFoundryPlaylistsByDefault);
  sidebarUiState.defaultsLoaded = false;
  refreshPlaylistDirectoryUi();
  notify("info", "SettingsReset", {}, "TS-DJ-MUSIC: settings reset.");
  return true;
}

function openApp() {
  if (!canManagePlaylistControls()) {
    notify("warn", "NoPermission", {}, "TS-DJ-MUSIC: insufficient module permissions.");
    return null;
  }

  if (appInstance?.rendered) {
    appInstance.bringToTop();
    return appInstance;
  }

  appInstance = new TsDjMusicApp();
  appInstance.render(true);
  return appInstance;
}

async function playTrackById(trackId, options = {}) {
  const { sync = true, ...playOptions } = options;
  if (sync && !ensureModuleControlAccess()) return;
  const tracks = getTracks();
  const track = tracks.find((entry) => entry.id === trackId);
  if (!track) {
    notify("warn", "TrackNotFound", {}, "TS-DJ-MUSIC: track not found.");
    return;
  }

  const started = await playTrack(track, playOptions);

  if (sync && started) {
    emitModuleSocketEvent(SOCKET_ACTIONS.playTrack, {
      trackId,
      options: sanitizePlayOptions(playOptions),
    });
  }
}

async function playPlaylistById(playlistId, options = {}) {
  const {
    sync = true,
    queue: queueOverride,
    index: indexOverride,
    playlistLoop: playlistLoopOverride,
    playlistShuffle: playlistShuffleOverride,
    startTrackId = null,
  } = options;
  if (sync && !ensureModuleControlAccess()) return;
  const playlists = getPlaylists();
  const playlist = playlists.find((entry) => entry.id === playlistId);
  if (!playlist) {
    notify("warn", "PlaylistNotFound", {}, "TS-DJ-MUSIC: playlist not found.");
    return;
  }

  const tracks = getTracks();
  const trackMap = new Map(tracks.map((entry) => [entry.id, entry]));
  const playlistQueue = normalizeArray(playlist.trackIds).filter((id) => trackMap.has(id));
  const overrideQueue = normalizeArray(queueOverride).filter((id) => trackMap.has(id));
  const shuffleEnabled = typeof playlistShuffleOverride === "boolean"
    ? playlistShuffleOverride
    : Boolean(playlist.shuffle);
  const queue = overrideQueue.length
    ? overrideQueue
    : (shuffleEnabled ? shuffledArray(playlistQueue) : [...playlistQueue]);
  if (!queue.length) {
    notify("warn", "PlaylistEmpty", {}, "TS-DJ-MUSIC: the playlist has no tracks.");
    return;
  }

  const canStartFromTrack = typeof startTrackId === "string" && queue.includes(startTrackId);
  const index = Number.isFinite(indexOverride)
    ? clampNumber(Math.trunc(Number(indexOverride)), 0, queue.length - 1)
    : (canStartFromTrack ? queue.indexOf(startTrackId) : 0);
  const firstTrack = trackMap.get(queue[index]);
  const playlistLoop = typeof playlistLoopOverride === "boolean"
    ? playlistLoopOverride
    : Boolean(playlist.loop);
  if (!firstTrack) return;
  const started = await playTrack(firstTrack, {
    mode: "playlist",
    playlistId: playlist.id,
    queue,
    index,
    playlistLoop,
    playlistShuffle: shuffleEnabled,
    loopOverride: false,
  });

  if (sync && started) {
    emitModuleSocketEvent(SOCKET_ACTIONS.playPlaylist, {
      playlistId,
      options: sanitizePlayOptions({
        queue,
        index,
        playlistLoop,
        playlistShuffle: shuffleEnabled,
      }),
    });
  }
}

async function playRelativeTrackInCurrentPlaylist(direction = 1, options = {}) {
  const { sync = true } = options;
  if (sync && !ensureModuleControlAccess()) return;
  const current = playbackState.current;
  if (!current || current.mode !== "playlist") return;
  const queue = normalizeArray(current.queue);
  if (!queue.length || !Number.isFinite(current.index)) return;

  const step = direction < 0 ? -1 : 1;
  if (!step) return;

  const tracks = getTracks();
  const trackMap = new Map(tracks.map((entry) => [entry.id, entry]));
  const queueLength = queue.length;
  const allowWrap = Boolean(current.playlistLoop);

  let targetIndex = -1;
  for (let hop = 1; hop <= queueLength; hop += 1) {
    let candidate = current.index + (step * hop);
    if (allowWrap) {
      candidate = ((candidate % queueLength) + queueLength) % queueLength;
    } else if (candidate < 0 || candidate >= queueLength) {
      break;
    }

    if (candidate === current.index) continue;
    if (trackMap.has(queue[candidate])) {
      targetIndex = candidate;
      break;
    }
  }

  if (targetIndex === -1) return;

  const nextTrack = trackMap.get(queue[targetIndex]);
  if (!nextTrack) return;

  const started = await playTrack(nextTrack, {
    mode: "playlist",
    playlistId: current.playlistId ?? null,
    queue,
    index: targetIndex,
    playlistLoop: allowWrap,
    playlistShuffle: Boolean(current.playlistShuffle),
    loopOverride: false,
  });

  if (sync && started) {
    emitModuleSocketEvent(SOCKET_ACTIONS.playRelativeTrack, { direction: step });
  }
}

async function playAmbienceById(trackId, options = {}) {
  const { sync = true, ...playOptions } = options;
  if (sync && !ensureModuleControlAccess()) return;
  const tracks = getAmbienceTracks();
  const track = tracks.find((entry) => entry.id === trackId);
  if (!track) {
    notify("warn", "AmbienceTrackNotFound", {}, "TS-DJ-MUSIC: ambience track not found.");
    return;
  }
  const started = await playAmbienceTrack(track, playOptions);

  if (sync && started) {
    emitModuleSocketEvent(SOCKET_ACTIONS.playAmbienceTrack, {
      trackId,
      options: sanitizePlayOptions(playOptions),
    });
  }
}

async function playAmbiencePlaylistById(playlistId, options = {}) {
  const {
    sync = true,
    queue: queueOverride,
    index: indexOverride,
    startTrackId = null,
    playlistLoop: playlistLoopOverride,
    playlistShuffle: playlistShuffleOverride,
  } = options;
  if (sync && !ensureModuleControlAccess()) return;
  const playlists = getAmbiencePlaylists();
  const playlist = playlists.find((entry) => entry.id === playlistId);
  if (!playlist) {
    notify("warn", "AmbiencePlaylistNotFound", {}, "TS-DJ-MUSIC: ambience playlist not found.");
    return;
  }

  const tracks = getAmbienceTracks();
  const trackMap = new Map(tracks.map((entry) => [entry.id, entry]));
  const playlistQueue = normalizeArray(playlist.trackIds).filter((id) => trackMap.has(id));
  const overrideQueue = normalizeArray(queueOverride).filter((id) => trackMap.has(id));
  const shuffleEnabled = typeof playlistShuffleOverride === "boolean"
    ? playlistShuffleOverride
    : Boolean(playlist.shuffle);
  const queue = overrideQueue.length
    ? overrideQueue
    : (shuffleEnabled ? shuffledArray(playlistQueue) : [...playlistQueue]);
  if (!queue.length) {
    notify("warn", "AmbiencePlaylistEmpty", {}, "TS-DJ-MUSIC: ambience playlist is empty.");
    return;
  }

  const canStartFromTrack = typeof startTrackId === "string" && queue.includes(startTrackId);
  const index = Number.isFinite(indexOverride)
    ? clampNumber(Math.trunc(Number(indexOverride)), 0, queue.length - 1)
    : (canStartFromTrack ? queue.indexOf(startTrackId) : 0);
  const firstTrack = trackMap.get(queue[index]);
  const playlistLoop = typeof playlistLoopOverride === "boolean"
    ? playlistLoopOverride
    : Boolean(playlist.loop);
  if (!firstTrack) return;
  const started = await playAmbienceTrack(firstTrack, {
    mode: "playlist",
    playlistId: playlist.id,
    queue,
    index,
    playlistLoop,
    playlistShuffle: shuffleEnabled,
    loopOverride: false,
  });

  if (sync && started) {
    emitModuleSocketEvent(SOCKET_ACTIONS.playAmbiencePlaylist, {
      playlistId,
      options: sanitizePlayOptions({
        queue,
        index,
        playlistLoop,
        playlistShuffle: shuffleEnabled,
      }),
    });
  }
}

function isAmbienceTrackActive(trackId) {
  for (const entry of ambienceState.active.values()) {
    if (entry.trackId === trackId && !entry.paused) return true;
  }
  return false;
}

function isAmbiencePlaylistActive(playlistId) {
  for (const entry of ambienceState.active.values()) {
    if (entry.mode === "playlist" && entry.playlistId === playlistId && !entry.paused) return true;
  }
  return false;
}

async function playTrack(track, options = {}) {
  const files = getFiles();
  const file = files.find((entry) => entry.id === track.fileId);
  if (!file?.path) {
    notify("warn", "TrackFileMissing", {}, "TS-DJ-MUSIC: no file is set for this track.");
    return false;
  }

  const mode = options.mode ?? "track";
  const queue = options.queue ?? [track.id];
  const index = Number.isFinite(options.index) ? options.index : 0;
  const playlistId = options.playlistId ?? null;
  const playlistLoop = Boolean(options.playlistLoop);
  const playlistShuffle = Boolean(options.playlistShuffle);

  const rawClipStart = parseTimeInput(track.start);
  const clipStart = Number.isFinite(rawClipStart) && rawClipStart >= 0 ? rawClipStart : 0;
  const requestedOffset = Number.isFinite(options.playOffset) ? Number(options.playOffset) : clipStart;
  let offset = Math.max(0, requestedOffset);
  const requestedClipEnd = parseTimeInput(track.end);

  const loop = options.loopOverride ?? Boolean(track.loop);
  const requestId = playbackState.requestId + 1;
  playbackState.requestId = requestId;
  playbackState.loading = true;
  await stopPlayback({ suppressUiRefresh: true, sync: false, cancelPending: false });

  const sound = await preloadSoundWithFileCache(file.path, { channel: "music" });
  if (playbackState.requestId !== requestId) {
    forceStopSoundNodes(sound);
    return false;
  }
  if (!sound) {
    playbackState.loading = false;
    notify("error", "FileLoadFailed", { path: file.path }, ({ path }) => `TS-DJ-MUSIC: failed to load file ${path}.`);
    return false;
  }

  const token = foundry.utils.randomID();
  const liveMusicVolume = getLiveMusicVolume();
  const defaultRate = normalizeRate(Number(track.rate ?? 1));
  const liveRate = getLiveRate();
  const finalRate = liveRate !== 1 ? liveRate : defaultRate;
  const loopMode = resolveLoopPlaybackMode({
    sound,
    loopEnabled: loop,
    clipStart,
    clipEnd: requestedClipEnd,
  });
  const clipEnd = loopMode.clipEnd;
  const hasEnd = loopMode.hasClip;
  if (hasEnd) {
    offset = Math.min(offset, Math.max(clipStart, clipEnd - 0.01));
  }

  const playOptions = {
    autoplay: true,
    loop: loopMode.nativeLoopEnabled,
    volume: liveMusicVolume,
    onended: () => {
      handleTrackEnded(token).catch((error) => console.warn(`${MODULE_ID} | onended failed`, error));
    },
  };

  if (offset > 0) playOptions.offset = offset;

  if (hasEnd) {
    if (!loop) {
      playOptions.duration = Math.max(0.01, clipEnd - offset);
    }
  }

  try {
    await playSoundWithRetry(sound, playOptions);
  } catch (error) {
    if (playbackState.requestId !== requestId) {
      forceStopSoundNodes(sound);
      return false;
    }
    playbackState.loading = false;
    console.warn(`${MODULE_ID} | failed to switch track`, error);
    ui.notifications.warn(t("Notifications.PlaybackBlocked", "TS-DJ-MUSIC: playback blocked on this client. Click inside Foundry tab and try again."));
    return false;
  }

  if (playbackState.requestId !== requestId) {
    try {
      await sound.stop();
    } catch (_error) {
      // no-op
    }
    forceStopSoundNodes(sound);
    return false;
  }

  applySoundRate(sound, finalRate);
  applySoundVolume(sound, liveMusicVolume);
  playbackState.loading = false;

  playbackState.current = {
    token,
    mode,
    sound,
    trackId: track.id,
    playlistId,
    queue,
    index,
    playlistLoop,
    playlistShuffle,
    loopEnabled: loop,
    clipEnd,
    clipStart,
    clipMonitorId: null,
    ending: false,
    paused: false,
    pausedAt: null,
    loopRestarting: false,
    segmentLoopActive: false,
    ignoreEndedUntil: 0,
    suppressNextEnd: false,
    defaultRate,
    timingBaseAbs: offset,
    timingBaseMs: Date.now(),
    timingRate: finalRate,
  };

  playbackState.current.segmentLoopActive = bindSegmentLoopToSound(sound, {
    enabled: loopMode.useSegmentLoop,
    start: clipStart,
    end: clipEnd,
    label: "music-play",
    onLoop: (loopStart) => {
      const current = playbackState.current;
      if (!current || current.token !== token) return;
      markSegmentLoopRestart(current, loopStart);
    },
    onLoopRestart: (loopStart) => restartCurrentTrackLoopPlayback(loopStart, token),
    getCurrentTime: () => {
      const current = playbackState.current;
      if (!current || current.token !== token) return null;
      return getEstimatedAbsoluteTime(current);
    },
  });

  if (hasEnd && !loop) {
    playbackState.current.clipMonitorId = startClipEndMonitor(sound, clipStart, clipEnd, token);
  }

  refreshPlaylistDirectoryUi();
  startSidebarProgressTicker();
  return true;
}

async function playAmbienceTrack(track, options = {}) {
  const files = getFiles();
  const file = files.find((entry) => entry.id === track.fileId);
  if (!file?.path) {
    ui.notifications.warn(t("Notifications.AmbienceFileMissing", "TS-DJ-MUSIC: ambience file is missing."));
    return false;
  }

  const allowConcurrent = getAmbienceAllowConcurrent();
  if (!allowConcurrent && !options.skipStopExisting) {
    await stopAllAmbience({ sync: false });
  }

  const mode = options.mode ?? "track";
  const queue = options.queue ?? [track.id];
  const index = Number.isFinite(options.index) ? options.index : 0;
  const playlistId = options.playlistId ?? null;
  const playlistLoop = Boolean(options.playlistLoop);
  const playlistShuffle = Boolean(options.playlistShuffle);

  const clipStart = parseTimeInput(track.start);
  const hasStart = Number.isFinite(clipStart) && clipStart >= 0;
  const offset = hasStart ? clipStart : 0;
  const requestedClipEnd = parseTimeInput(track.end);
  const loop = options.loopOverride ?? Boolean(track.loop);
  const requestId = ambienceState.nextRequestId + 1;
  ambienceState.nextRequestId = requestId;
  ambienceState.pending.set(requestId, {
    trackId: track.id,
    playlistId,
    mode,
  });

  const sound = await preloadSoundWithFileCache(file.path, { channel: "environment" });
  if (!ambienceState.pending.has(requestId)) {
    forceStopSoundNodes(sound);
    return false;
  }
  if (!sound) {
    ambienceState.pending.delete(requestId);
    ui.notifications.error(tf("Notifications.AmbienceLoadFailed", { path: file.path }, ({ path }) => `TS-DJ-MUSIC: failed to load ambience ${path}.`));
    return false;
  }

  const token = foundry.utils.randomID();
  const ambienceVolume = getEffectiveAmbienceVolumeForSound(sound);
  const defaultRate = normalizeRate(Number(track.rate ?? 1));
  const liveRate = getLiveRate();
  const finalRate = liveRate !== 1 ? liveRate : defaultRate;
  const loopMode = resolveLoopPlaybackMode({
    sound,
    loopEnabled: loop,
    clipStart: offset,
    clipEnd: requestedClipEnd,
  });
  const clipEnd = loopMode.clipEnd;
  const hasEnd = loopMode.hasClip;
  const playOptions = {
    autoplay: true,
    loop: loopMode.nativeLoopEnabled,
    volume: ambienceVolume,
    onended: () => {
      handleAmbienceEnded(token).catch((error) => console.warn(`${MODULE_ID} | ambience onended failed`, error));
    },
  };
  if (hasStart) playOptions.offset = offset;
  if (hasEnd) {
    if (!loop) {
      playOptions.duration = Math.max(0.01, clipEnd - offset);
    }
  }

  try {
    await playSoundWithRetry(sound, playOptions);
  } catch (error) {
    const stillPending = ambienceState.pending.has(requestId);
    ambienceState.pending.delete(requestId);
    if (!stillPending) {
      forceStopSoundNodes(sound);
      return false;
    }
    console.warn(`${MODULE_ID} | failed to switch ambience`, error);
    ui.notifications.warn(t("Notifications.AmbiencePlaybackBlocked", "TS-DJ-MUSIC: ambience playback blocked on this client. Click inside Foundry tab and try again."));
    return false;
  }

  if (!ambienceState.pending.has(requestId)) {
    try {
      await sound.stop();
    } catch (_error) {
      // no-op
    }
    forceStopSoundNodes(sound);
    return false;
  }
  ambienceState.pending.delete(requestId);

  applySoundRate(sound, finalRate);

  const entry = {
    token,
    mode,
    sound,
    trackId: track.id,
    playlistId,
    queue,
    index,
    playlistLoop,
    playlistShuffle,
    loopEnabled: loop,
    clipStart: offset,
    clipEnd,
    clipMonitorId: null,
    suppressNextEnd: false,
    ending: false,
    paused: false,
    loopRestarting: false,
    segmentLoopActive: false,
    ignoreEndedUntil: 0,
    timingBaseAbs: offset,
    timingBaseMs: Date.now(),
    timingRate: finalRate,
  };
  ambienceState.active.set(token, entry);

  entry.segmentLoopActive = bindSegmentLoopToSound(sound, {
    enabled: loopMode.useSegmentLoop,
    start: offset,
    end: clipEnd,
    label: "ambience-play",
    onLoop: (loopStart) => {
      const activeEntry = ambienceState.active.get(token);
      if (!activeEntry) return;
      markSegmentLoopRestart(activeEntry, loopStart);
    },
    onLoopRestart: (loopStart) => restartAmbienceLoopPlayback(loopStart, token),
    getCurrentTime: () => {
      const activeEntry = ambienceState.active.get(token);
      if (!activeEntry) return null;
      return getEstimatedAbsoluteTime(activeEntry);
    },
  });

  applyEnvironmentVolumeToActiveAmbience({ force: true });

  if (hasEnd && !loop) {
    entry.clipMonitorId = startAmbienceClipEndMonitor(sound, offset, clipEnd, token);
  }

  refreshPlaylistDirectoryUi();
  return true;
}

async function handleTrackEnded(token, { forceStop = false } = {}) {
  const current = playbackState.current;
  if (!current || current.token !== token) return;
  if (current.suppressNextEnd) {
    current.suppressNextEnd = false;
    return;
  }
  if (hasSegmentLoopActive(current)) {
    return;
  }
  if (Number.isFinite(current.ignoreEndedUntil) && Date.now() < current.ignoreEndedUntil) {
    return;
  }
  if (current.ending) return;

  current.ending = true;
  clearClipEndMonitor(current);
  clearSegmentLoopBinding(current.sound);

  if (forceStop) {
    try {
      await current.sound?.stop();
    } catch (_error) {
      // no-op
    }
  }

  if (current.mode !== "playlist") {
    playbackState.current = null;
    refreshPlaylistDirectoryUi();
    stopSidebarProgressTicker();
    return;
  }

  const tracks = getTracks();
  const nextIndex = current.index + 1;

  if (nextIndex < current.queue.length) {
    const nextTrack = tracks.find((entry) => entry.id === current.queue[nextIndex]);
    if (!nextTrack) {
      playbackState.current = null;
      refreshPlaylistDirectoryUi();
      stopSidebarProgressTicker();
      return;
    }

    await playTrack(nextTrack, {
      mode: "playlist",
      playlistId: current.playlistId,
      queue: current.queue,
      index: nextIndex,
      playlistLoop: current.playlistLoop,
      playlistShuffle: Boolean(current.playlistShuffle),
      loopOverride: false,
    });
    return;
  }

  if (current.playlistLoop && current.queue.length) {
    const cycleQueue = Boolean(current.playlistShuffle) && current.queue.length > 1
      ? shuffledArray(current.queue)
      : normalizeArray(current.queue);
    const nextTrack = tracks.find((entry) => entry.id === cycleQueue[0]);
    if (!nextTrack) {
      playbackState.current = null;
      refreshPlaylistDirectoryUi();
      stopSidebarProgressTicker();
      return;
    }

    await playTrack(nextTrack, {
      mode: "playlist",
      playlistId: current.playlistId,
      queue: cycleQueue,
      index: 0,
      playlistLoop: true,
      playlistShuffle: Boolean(current.playlistShuffle),
      loopOverride: false,
    });
    return;
  }

  playbackState.current = null;
  refreshPlaylistDirectoryUi();
  stopSidebarProgressTicker();
}

async function stopPlayback({ suppressUiRefresh = false, sync = true, cancelPending = true } = {}) {
  if (sync && !ensureModuleControlAccess()) return;
  if (sync) {
    emitModuleSocketEvent(SOCKET_ACTIONS.stopPlayback);
  }
  if (cancelPending) {
    playbackState.requestId += 1;
    playbackState.loading = false;
  }

  const current = playbackState.current;
  if (!current?.sound) {
    playbackState.current = null;
    if (!suppressUiRefresh) {
      refreshPlaylistDirectoryUi();
      stopSidebarProgressTicker();
    }
    return;
  }

  // Manual stop/switch: do not allow onended auto-advance logic to run.
  current.suppressNextEnd = true;
  clearClipEndMonitor(current);
  clearSegmentLoopBinding(current.sound);

  try {
    await current.sound.stop();
  } catch (_error) {
    // no-op
  }
  forceStopSoundNodes(current.sound);
  await waitMs(25);

  playbackState.current = null;
  if (!suppressUiRefresh) {
    refreshPlaylistDirectoryUi();
    stopSidebarProgressTicker();
  }
}

async function stopAllAmbience(options = {}) {
  const { sync = true, cancelPending = true } = options;
  if (sync && !ensureModuleControlAccess()) return;
  if (sync) {
    emitModuleSocketEvent(SOCKET_ACTIONS.stopAmbienceAll);
  }
  if (cancelPending) {
    clearPendingAmbienceRequests();
  }

  const active = Array.from(ambienceState.active.values());
  for (const entry of active) {
    await stopAmbienceEntry(entry);
  }
  refreshPlaylistDirectoryUi();
}

async function stopAmbienceByTrackId(trackId, options = {}) {
  const { sync = true, cancelPending = true } = options;
  if (sync && !ensureModuleControlAccess()) return;
  if (sync) {
    emitModuleSocketEvent(SOCKET_ACTIONS.stopAmbienceTrack, { trackId });
  }
  if (cancelPending) {
    clearPendingAmbienceRequests((entry) => entry.trackId === trackId);
  }

  const matches = Array.from(ambienceState.active.values()).filter((entry) => entry.trackId === trackId);
  for (const entry of matches) {
    await stopAmbienceEntry(entry);
  }
  refreshPlaylistDirectoryUi();
}

async function stopAmbienceByPlaylistId(playlistId, options = {}) {
  const { sync = true, cancelPending = true } = options;
  if (sync && !ensureModuleControlAccess()) return;
  if (sync) {
    emitModuleSocketEvent(SOCKET_ACTIONS.stopAmbiencePlaylist, { playlistId });
  }
  if (cancelPending) {
    clearPendingAmbienceRequests((entry) => entry.mode === "playlist" && entry.playlistId === playlistId);
  }

  const matches = Array.from(ambienceState.active.values()).filter(
    (entry) => entry.mode === "playlist" && entry.playlistId === playlistId
  );
  for (const entry of matches) {
    await stopAmbienceEntry(entry);
  }
  refreshPlaylistDirectoryUi();
}

async function stopAmbienceEntry(entry) {
  if (!entry?.sound) return;
  entry.suppressNextEnd = true;
  clearAmbienceClipEndMonitor(entry);
  clearSegmentLoopBinding(entry.sound);
  try {
    await entry.sound.stop();
  } catch (_error) {
    // no-op
  }
  forceStopSoundNodes(entry.sound);
  await waitMs(25);
  ambienceState.active.delete(entry.token);
}

async function handleAmbienceEnded(token, { forceStop = false } = {}) {
  const entry = ambienceState.active.get(token);
  if (!entry) return;
  if (entry.suppressNextEnd) {
    entry.suppressNextEnd = false;
    ambienceState.active.delete(token);
    refreshPlaylistDirectoryUi();
    return;
  }
  if (hasSegmentLoopActive(entry)) {
    return;
  }
  if (Number.isFinite(entry.ignoreEndedUntil) && Date.now() < entry.ignoreEndedUntil) {
    return;
  }
  if (entry.ending) return;
  entry.ending = true;
  clearAmbienceClipEndMonitor(entry);
  clearSegmentLoopBinding(entry.sound);

  if (forceStop) {
    try {
      await entry.sound?.stop();
    } catch (_error) {
      // no-op
    }
  }

  ambienceState.active.delete(token);

  if (entry.mode === "playlist") {
    const tracks = getAmbienceTracks();
    const nextIndex = entry.index + 1;
    if (nextIndex < entry.queue.length) {
      const nextTrack = tracks.find((t) => t.id === entry.queue[nextIndex]);
      if (nextTrack) {
        await playAmbienceTrack(nextTrack, {
          mode: "playlist",
          playlistId: entry.playlistId,
          queue: entry.queue,
          index: nextIndex,
          playlistLoop: entry.playlistLoop,
          playlistShuffle: Boolean(entry.playlistShuffle),
          loopOverride: false,
          skipStopExisting: true,
        });
      }
    } else if (entry.playlistLoop && entry.queue.length) {
      const cycleQueue = Boolean(entry.playlistShuffle) && entry.queue.length > 1
        ? shuffledArray(entry.queue)
        : normalizeArray(entry.queue);
      const nextTrack = tracks.find((t) => t.id === cycleQueue[0]);
      if (nextTrack) {
        await playAmbienceTrack(nextTrack, {
          mode: "playlist",
          playlistId: entry.playlistId,
          queue: cycleQueue,
          index: 0,
          playlistLoop: true,
          playlistShuffle: Boolean(entry.playlistShuffle),
          loopOverride: false,
          skipStopExisting: true,
        });
      }
    }
  }

  refreshPlaylistDirectoryUi();
}

async function pauseCurrentPlayback(options = {}) {
  const { sync = true } = options;
  if (sync && !ensureModuleControlAccess()) return;
  const current = playbackState.current;
  if (!current?.sound || current.paused) return;

  current.suppressNextEnd = true;
  current.pausedAt = getCurrentAbsoluteTime(current);
  current.paused = true;
  clearClipEndMonitor(current);
  clearSegmentLoopBinding(current.sound);

  try {
    await current.sound.stop();
  } catch (_error) {
    // no-op
  }

  refreshPlaylistDirectoryUi();
  stopSidebarProgressTicker();

  if (sync) {
    emitModuleSocketEvent(SOCKET_ACTIONS.pausePlayback);
  }
}

async function resumeCurrentPlayback(options = {}) {
  const { sync = true } = options;
  if (sync && !ensureModuleControlAccess()) return;
  const current = playbackState.current;
  if (!current?.sound || !current.paused) return;

  const resumeAtRaw = Number.isFinite(current.pausedAt) ? current.pausedAt : current.clipStart ?? 0;
  let resumeAt = Math.max(0, resumeAtRaw);
  if (Number.isFinite(current.clipEnd)) {
    resumeAt = Math.min(resumeAt, Math.max(current.clipStart ?? 0, current.clipEnd - 0.01));
  }

  const track = getTracks().find((entry) => entry.id === current.trackId);
  if (!track) {
    await stopPlayback({ sync: false });
    return;
  }

  const queue = Array.isArray(current.queue) && current.queue.length
    ? [...current.queue]
    : [track.id];

  await playTrack(track, {
    mode: current.mode ?? "track",
    playlistId: current.playlistId ?? null,
    queue,
    index: Number.isFinite(current.index) ? current.index : 0,
    playlistLoop: Boolean(current.playlistLoop),
    playlistShuffle: Boolean(current.playlistShuffle),
    loopOverride: Boolean(current.loopEnabled),
    playOffset: resumeAt,
  });

  if (sync) {
    emitModuleSocketEvent(SOCKET_ACTIONS.resumePlayback);
  }
}

class TsDjMusicApp extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "ts-dj-music-app",
      template: "modules/ts-dj-music/templates/dj-app.hbs",
      title: t("App.WindowTitle", "TS-DJ-MUSIC"),
      width: 980,
      height: 760,
      resizable: true,
      classes: ["ts-dj-music-window"],
    });
  }

  getData() {
    const current = playbackState.current;
    const files = sortEntriesByName(getFiles().map((file) => {
      const rawPath = String(file.path ?? "");
      const displayPath = decodePathForDisplay(rawPath);
      return {
        ...file,
        name: file.name || file.path || t("Common.UntitledFile", "Unnamed file"),
        path: displayPath || rawPath,
      };
    }));

    const fileMap = new Map(files.map((file) => [file.id, file]));

    const tracks = sortEntriesByName(getTracks().map((track) => {
      const file = fileMap.get(track.fileId);
      const active = current?.trackId === track.id;
      const paused = active && Boolean(current?.paused);
      return {
        ...track,
        name: untitledName(track.name),
        fileName: file?.name || t("Common.FileMissingShort", "File?"),
        startLabel: track.start || "0",
        endLabel: track.end || "-",
        rateLabel: `${formatRate(Number(track.rate ?? 1))}x`,
        loop: Boolean(track.loop),
        active,
        playAction: active ? (paused ? "resume-current" : "pause-current") : "play-track",
        playIcon: active && !paused ? "fa-pause" : "fa-play",
      };
    }));

    const trackMap = new Map(tracks.map((track) => [track.id, track]));

    const playlists = sortEntriesByName(getPlaylists().map((playlist) => {
      const trackIds = normalizeArray(playlist.trackIds);
      const validTrackIds = trackIds.filter((id) => trackMap.has(id));
      const trackNames = validTrackIds
        .map((id) => trackMap.get(id)?.name)
        .filter(Boolean)
        .join(", ");
      const active = current?.mode === "playlist" && current?.playlistId === playlist.id;
      const paused = active && Boolean(current?.paused);
      const expanded = Boolean(managerPlaylistExpandState[playlist.id]);
      const trackEntries = validTrackIds.map((id, index) => {
        const track = trackMap.get(id);
        const trackActive = active && current?.trackId === id;
        return {
          id,
          playlistId: playlist.id,
          index: index + 1,
          name: untitledName(track?.name),
          active: trackActive,
          playAction: trackActive ? (paused ? "resume-current" : "pause-current") : "play-playlist-from-track",
          playIcon: trackActive && !paused ? "fa-pause" : "fa-play",
        };
      });

      return {
        ...playlist,
        name: untitledName(playlist.name),
        trackCount: validTrackIds.length,
        trackNames: trackNames || t("Common.Empty", "Empty"),
        trackEntries,
        loop: Boolean(playlist.loop),
        shuffle: Boolean(playlist.shuffle),
        active,
        expanded,
        expandAction: "toggle-manager-playlist-expand",
        expandTitle: t(expanded ? "Common.HideTracks" : "Common.ShowTracks", expanded ? "Hide tracks" : "Show tracks"),
        expandIcon: expanded ? "fa-chevron-down" : "fa-chevron-right",
        playAction: active
          ? (paused ? "resume-current" : "pause-current")
          : "play-playlist",
        playIcon: active && !paused
          ? "fa-pause"
          : "fa-play",
      };
    }));

    const ambienceTracks = sortEntriesByName(getAmbienceTracks().map((track) => {
      const file = fileMap.get(track.fileId);
      const active = isAmbienceTrackActive(track.id);
      return {
        ...track,
        name: untitledName(track.name),
        fileName: file?.name || t("Common.FileMissingShort", "File?"),
        startLabel: track.start || "0",
        endLabel: track.end || "-",
        rateLabel: `${formatRate(Number(track.rate ?? 1))}x`,
        loop: Boolean(track.loop),
        active,
        playAction: active ? "stop-ambience-track" : "play-ambience-track",
        playIcon: active ? "fa-stop" : "fa-play",
      };
    }));

    const ambienceTrackMap = new Map(ambienceTracks.map((track) => [track.id, track]));
    const ambiencePlaylists = sortEntriesByName(getAmbiencePlaylists().map((playlist) => {
      const active = isAmbiencePlaylistActive(playlist.id);
      const trackIds = normalizeArray(playlist.trackIds);
      const validTrackIds = trackIds.filter((id) => ambienceTrackMap.has(id));
      const trackNames = validTrackIds.map((id) => ambienceTrackMap.get(id)?.name).filter(Boolean).join(", ");
      const expanded = Boolean(managerAmbiencePlaylistExpandState[playlist.id]);
      const activeTrackIds = new Set(
        Array.from(ambienceState.active.values())
          .filter((entry) => entry.mode === "playlist" && entry.playlistId === playlist.id && !entry.paused)
          .map((entry) => entry.trackId)
      );
      const trackEntries = validTrackIds.map((id, index) => {
        const track = ambienceTrackMap.get(id);
        const trackActive = activeTrackIds.has(id);
        return {
          id,
          playlistId: playlist.id,
          index: index + 1,
          name: untitledName(track?.name),
          active: trackActive,
          playAction: trackActive ? "stop-ambience-track" : "play-ambience-playlist-from-track",
          playIcon: trackActive ? "fa-stop" : "fa-play",
        };
      });
      return {
        ...playlist,
        name: untitledName(playlist.name),
        trackCount: validTrackIds.length,
        trackNames: trackNames || t("Common.Empty", "Empty"),
        trackEntries,
        loop: Boolean(playlist.loop),
        shuffle: Boolean(playlist.shuffle),
        active,
        expanded,
        expandAction: "toggle-manager-ambience-playlist-expand",
        expandTitle: t(expanded ? "Common.HideTracks" : "Common.ShowTracks", expanded ? "Hide tracks" : "Show tracks"),
        expandIcon: expanded ? "fa-chevron-down" : "fa-chevron-right",
        playAction: active ? "stop-ambience-playlist" : "play-ambience-playlist",
        playIcon: active ? "fa-pause" : "fa-play",
      };
    }));

    const currentLabel = this.#getCurrentLabel(tracks, playlists);
    const liveRate = getLiveRate();
    const liveMusicVolume = getLiveMusicVolume();
    const liveAmbienceVolume = getLiveAmbienceVolume();

    return {
      liveRate,
      liveRateLabel: formatRate(liveRate),
      liveMusicVolume,
      liveMusicVolumeLabel: formatVolumePercent(liveMusicVolume),
      liveAmbienceVolume,
      liveAmbienceVolumeLabel: formatVolumePercent(liveAmbienceVolume),
      ambienceAllowConcurrent: getAmbienceAllowConcurrent(),
      files,
      tracks,
      playlists,
      ambienceTracks,
      ambiencePlaylists,
      hasFiles: files.length > 0,
      hasTracks: tracks.length > 0,
      hasPlaylists: playlists.length > 0,
      hasAmbienceTracks: ambienceTracks.length > 0,
      hasAmbiencePlaylists: ambiencePlaylists.length > 0,
      isPlaying: Boolean(playbackState.current),
      currentLabel,
      managerSections: {
        files: Boolean(managerSectionState.files),
        music: Boolean(managerSectionState.music),
        ambience: Boolean(managerSectionState.ambience),
      },
      managerCards: getManagerCardTemplateState(),
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    const root = html[0];
    if (root instanceof HTMLElement) {
      root.querySelectorAll(".ts-dj-section[data-section]").forEach((section) => {
        section.addEventListener("toggle", () => {
          const key = section.dataset.section;
          if (!key || !(key in managerSectionState)) return;
          managerSectionState[key] = section.open;
        });
      });
      root.querySelectorAll(".ts-dj-card-collapse[data-card-key]").forEach((card) => {
        card.addEventListener("toggle", () => {
          const key = card.dataset.cardKey;
          if (!key || !(key in managerCardExpandState)) return;
          managerCardExpandState[key] = card.open;
        });
      });
      if (!root.dataset.managerPlaylistDndBound) {
        root.dataset.managerPlaylistDndBound = "true";

        root.addEventListener("dragstart", (event) => {
          const row = event.target.closest("[data-manager-playlist-track-row]");
          if (!(row instanceof HTMLElement)) return;

          managerPlaylistDragState.kind = row.dataset.playlistKind ?? null;
          managerPlaylistDragState.playlistId = row.dataset.playlistId ?? null;
          managerPlaylistDragState.trackId = row.dataset.trackId ?? null;
          row.classList.add("is-dragging");

          event.dataTransfer?.setData("text/plain", managerPlaylistDragState.trackId ?? "");
          if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
        });

        root.addEventListener("dragend", (event) => {
          const row = event.target.closest("[data-manager-playlist-track-row]");
          if (row instanceof HTMLElement) {
            row.classList.remove("is-dragging");
          }
          managerPlaylistDragState.kind = null;
          managerPlaylistDragState.playlistId = null;
          managerPlaylistDragState.trackId = null;
        });

        root.addEventListener("dragover", (event) => {
          const list = event.target.closest("[data-manager-playlist-track-list]");
          if (!(list instanceof HTMLElement)) return;
          if (!managerPlaylistDragState.trackId) return;
          if (list.dataset.playlistKind !== managerPlaylistDragState.kind) return;
          if (list.dataset.playlistId !== managerPlaylistDragState.playlistId) return;

          const targetRow = event.target.closest("[data-manager-playlist-track-row]");
          if (!(targetRow instanceof HTMLElement)) return;
          if (targetRow.dataset.trackId === managerPlaylistDragState.trackId) return;
          event.preventDefault();

          const draggedRow = [...list.querySelectorAll("[data-manager-playlist-track-row]")]
            .find((row) => row instanceof HTMLElement && row.dataset.trackId === managerPlaylistDragState.trackId);
          if (!(draggedRow instanceof HTMLElement)) return;

          const bounds = targetRow.getBoundingClientRect();
          const shouldInsertAfter = (event.clientY - bounds.top) > (bounds.height / 2);
          const nextNode = shouldInsertAfter ? targetRow.nextElementSibling : targetRow;
          if (nextNode === draggedRow) return;
          list.insertBefore(draggedRow, nextNode);
        });

        root.addEventListener("drop", async (event) => {
          const list = event.target.closest("[data-manager-playlist-track-list]");
          if (!(list instanceof HTMLElement)) return;
          if (!managerPlaylistDragState.trackId) return;
          if (list.dataset.playlistKind !== managerPlaylistDragState.kind) return;
          if (list.dataset.playlistId !== managerPlaylistDragState.playlistId) return;
          event.preventDefault();

          const orderedVisibleTrackIds = [...list.querySelectorAll("[data-manager-playlist-track-row]")]
            .map((row) => row instanceof HTMLElement ? row.dataset.trackId ?? null : null)
            .filter((trackId) => trackId);
          if (managerPlaylistDragState.kind === "music") {
            await this.#setPlaylistTrackOrder(list.dataset.playlistId, orderedVisibleTrackIds);
          } else if (managerPlaylistDragState.kind === "ambience") {
            await this.#setAmbiencePlaylistTrackOrder(list.dataset.playlistId, orderedVisibleTrackIds);
          }

          managerPlaylistDragState.kind = null;
          managerPlaylistDragState.playlistId = null;
          managerPlaylistDragState.trackId = null;
        });
      }
    }

    html.on("click", "[data-action]", async (event) => {
      const action = event.currentTarget.dataset.action;
      const id = event.currentTarget.dataset.id;

      switch (action) {
        case "create-file":
          await this.#createOrEditFile();
          break;
        case "edit-file":
          await this.#createOrEditFile(id);
          break;
        case "delete-file":
          await this.#deleteFile(id);
          break;
        case "delete-files-block":
          await this.#deleteFilesBlock();
          break;
        case "create-track":
          await this.#createOrEditTrack();
          break;
        case "edit-track":
          await this.#createOrEditTrack(id);
          break;
        case "delete-track":
          await this.#deleteTrack(id);
          break;
        case "delete-tracks-block":
          await this.#deleteTracksBlock();
          break;
        case "play-track":
          await playTrackById(id);
          break;
        case "toggle-track-loop":
          await toggleTrackLoop(id);
          await this.#refreshCards([MANAGER_CARD_IDS.musicTracks]);
          break;
        case "create-playlist":
          await this.#createOrEditPlaylist();
          break;
        case "edit-playlist":
          await this.#createOrEditPlaylist(id);
          break;
        case "delete-playlist":
          await this.#deletePlaylist(id);
          break;
        case "delete-playlists-block":
          await this.#deletePlaylistsBlock();
          break;
        case "play-playlist":
          await playPlaylistById(id);
          break;
        case "play-playlist-from-track": {
          const playlistId = event.currentTarget.dataset.playlistId ?? id;
          const trackId = event.currentTarget.dataset.trackId ?? null;
          if (playlistId && trackId) {
            await playPlaylistById(playlistId, { startTrackId: trackId });
          }
          break;
        }
        case "toggle-playlist-loop":
          await togglePlaylistLoop(id);
          await this.#refreshCards([MANAGER_CARD_IDS.musicPlaylists]);
          break;
        case "toggle-playlist-shuffle":
          await togglePlaylistShuffle(id);
          await this.#refreshCards([MANAGER_CARD_IDS.musicPlaylists]);
          break;
        case "toggle-manager-playlist-expand":
          if (id) {
            managerPlaylistExpandState[id] = !Boolean(managerPlaylistExpandState[id]);
            await this.#refreshCards([MANAGER_CARD_IDS.musicPlaylists]);
          }
          break;
        case "pause-current":
          await pauseCurrentPlayback();
          break;
        case "resume-current":
          await resumeCurrentPlayback();
          break;
        case "stop":
          await stopPlayback();
          break;
        case "export-settings":
          await exportModuleSettings();
          break;
        case "import-settings": {
          const imported = await importModuleSettings();
          if (imported?.applied) {
            await initializeStorageState();
            await stopPlayback();
            await stopAllAmbience();
            refreshPlaylistDirectoryUi();
            await this.#refreshCards(Object.values(MANAGER_CARD_IDS), { refreshToolbar: true });

            const info = imported.summary ?? {};
            notify("info", "ImportAppliedSummary", {
              files: info.importedFiles ?? 0,
              musicPlaylists: info.musicPlaylists ?? 0,
              ambiencePlaylists: info.ambiencePlaylists ?? 0,
            }, ({ files, musicPlaylists, ambiencePlaylists }) =>
              `TS-DJ-MUSIC: import complete. Files ${files}, music playlists ${musicPlaylists}, ambience playlists ${ambiencePlaylists}.`
            );
          }
          break;
        }
        case "reset-module-settings":
          if (await resetModuleSettingsToDefaults()) {
            await this.#refreshCards(Object.values(MANAGER_CARD_IDS), { refreshToolbar: true });
          }
          break;
        case "create-ambience-track":
          await this.#createOrEditAmbienceTrack();
          break;
        case "edit-ambience-track":
          await this.#createOrEditAmbienceTrack(id);
          break;
        case "delete-ambience-track":
          await this.#deleteAmbienceTrack(id);
          break;
        case "delete-ambience-tracks-block":
          await this.#deleteAmbienceTracksBlock();
          break;
        case "play-ambience-track":
          await playAmbienceById(id);
          break;
        case "stop-ambience-track":
          await stopAmbienceByTrackId(id);
          break;
        case "toggle-ambience-track-loop":
          await toggleAmbienceTrackLoop(id);
          await this.#refreshCards([MANAGER_CARD_IDS.ambienceTracks]);
          break;
        case "create-ambience-playlist":
          await this.#createOrEditAmbiencePlaylist();
          break;
        case "edit-ambience-playlist":
          await this.#createOrEditAmbiencePlaylist(id);
          break;
        case "delete-ambience-playlist":
          await this.#deleteAmbiencePlaylist(id);
          break;
        case "delete-ambience-playlists-block":
          await this.#deleteAmbiencePlaylistsBlock();
          break;
        case "play-ambience-playlist":
          await playAmbiencePlaylistById(id);
          break;
        case "play-ambience-playlist-from-track": {
          const playlistId = event.currentTarget.dataset.playlistId ?? id;
          const trackId = event.currentTarget.dataset.trackId ?? null;
          if (playlistId && trackId) {
            await playAmbiencePlaylistById(playlistId, { startTrackId: trackId });
          }
          break;
        }
        case "stop-ambience-playlist":
          await stopAmbienceByPlaylistId(id);
          break;
        case "toggle-ambience-playlist-loop":
          await toggleAmbiencePlaylistLoop(id);
          await this.#refreshCards([MANAGER_CARD_IDS.ambiencePlaylists]);
          break;
        case "toggle-ambience-playlist-shuffle":
          await toggleAmbiencePlaylistShuffle(id);
          await this.#refreshCards([MANAGER_CARD_IDS.ambiencePlaylists]);
          break;
        case "toggle-manager-ambience-playlist-expand":
          if (id) {
            managerAmbiencePlaylistExpandState[id] = !Boolean(managerAmbiencePlaylistExpandState[id]);
            await this.#refreshCards([MANAGER_CARD_IDS.ambiencePlaylists]);
          }
          break;
      }
    });

    html.on("input", "[data-action='set-live-rate']", async (event) => {
      const rate = normalizeRate(Number(event.currentTarget.value));
      event.currentTarget.value = String(rate);

      const valueTarget = html[0].querySelector(".ts-dj-live-rate-value");
      if (valueTarget) valueTarget.textContent = formatRate(rate);

      await setLiveRate(rate, { apply: true });
    });

    html.on("input", "[data-action='set-live-music-volume']", async (event) => {
      const volume = normalizeVolume(Number(event.currentTarget.value));
      event.currentTarget.value = String(volume);

      const valueTarget = html[0].querySelector(".ts-dj-live-music-volume-value");
      if (valueTarget) valueTarget.textContent = formatVolumePercent(volume);

      await setLiveMusicVolume(volume, { apply: true });
    });

    html.on("input", "[data-action='set-live-ambience-volume']", async (event) => {
      const volume = normalizeVolume(Number(event.currentTarget.value));
      event.currentTarget.value = String(volume);

      const valueTarget = html[0].querySelector(".ts-dj-live-ambience-volume-value");
      if (valueTarget) valueTarget.textContent = formatVolumePercent(volume);

      await setLiveAmbienceVolume(volume, { apply: true });
    });

    html.on("change", "[data-action='set-ambience-concurrency']", async (event) => {
      const enabled = Boolean(event.currentTarget.checked);
      await setAmbienceAllowConcurrent(enabled);
    });
  }

  #getCurrentLabel(tracks, playlists) {
    if (!playbackState.current) return t("Status.Stopped", "Stopped");

    const currentTrack = tracks.find((track) => track.id === playbackState.current.trackId);
    if (playbackState.current.mode === "playlist") {
      const playlist = playlists.find((entry) => entry.id === playbackState.current.playlistId);
      return tf("Status.ManagerPlaylist", {
        playlist: playlist?.name ?? "?",
        track: currentTrack?.name ?? "?",
      }, ({ playlist: currentPlaylist, track }) => `Playlist: ${currentPlaylist} | Track: ${track}`);
    }

    return tf("Status.ManagerTrack", { track: currentTrack?.name ?? "?" }, ({ track }) => `Track: ${track}`);
  }
  async refreshStorageCards(cardIds = Object.values(MANAGER_CARD_IDS)) {
    if (!this.rendered) return;
    await this.#refreshCards(cardIds);
  }

  async #refreshCards(cardIds = [], { refreshToolbar = false } = {}) {
    const root = this.element?.[0];
    if (!(root instanceof HTMLElement)) return;

    const uniqueCardIds = Array.from(new Set(cardIds.filter(Boolean)));
    if (!uniqueCardIds.length) {
      refreshManagerRuntimeUi();
      return;
    }

    const templateHtml = await renderTemplate(this.options.template, this.getData());
    const scratch = document.createElement("template");
    scratch.innerHTML = templateHtml.trim();
    const nextAppRoot = scratch.content.firstElementChild;
    if (!(nextAppRoot instanceof HTMLElement)) return;

    for (const cardId of uniqueCardIds) {
      const selector = `.ts-dj-card[data-card="${cardId}"]`;
      const nextCard = nextAppRoot.querySelector(selector);
      const currentCard = root.querySelector(selector);
      if (!nextCard || !currentCard) continue;
      currentCard.replaceWith(nextCard);
    }

    if (refreshToolbar) {
      const nextToolbar = nextAppRoot.querySelector(".ts-dj-toolbar");
      const currentToolbar = root.querySelector(".ts-dj-toolbar");
      if (nextToolbar && currentToolbar) {
        currentToolbar.replaceWith(nextToolbar);
      }
    }

    refreshManagerRuntimeUi();
  }

  async #createOrEditFile(fileId = null) {
    const files = getFiles();
    const current = fileId ? files.find((entry) => entry.id === fileId) : null;

    const payload = await promptFileData(current);
    if (!payload) return;

    if (current) {
      const index = files.findIndex((entry) => entry.id === fileId);
      files[index] = payload;
    } else {
      files.push(payload);
    }

    await setFiles(files);
    await this.#refreshCards([
      MANAGER_CARD_IDS.files,
      MANAGER_CARD_IDS.musicTracks,
      MANAGER_CARD_IDS.ambienceTracks,
    ]);
  }

  async #deleteFile(fileId) {
    const files = getFiles();
    const file = files.find((entry) => entry.id === fileId);
    if (!file) return;

    const confirmed = await Dialog.confirm({
      title: t("Dialogs.DeleteFileTitle", "Delete file"),
      content: tf("Dialogs.DeleteFileContent", {
        name: escapeHtml(file.name || file.path),
      }, ({ name }) => `<p>Delete file <b>${name}</b> and linked tracks?</p>`),
    });
    if (!confirmed) return;

    const tracks = getTracks();
    const removedTrackIds = tracks.filter((track) => track.fileId === fileId).map((track) => track.id);
    const ambienceTracks = getAmbienceTracks();
    const removedAmbienceTrackIds = ambienceTracks.filter((track) => track.fileId === fileId).map((track) => track.id);

    const nextFiles = files.filter((entry) => entry.id !== fileId);
    const nextTracks = tracks.filter((track) => track.fileId !== fileId);
    const nextPlaylists = getPlaylists().map((playlist) => ({
      ...playlist,
      trackIds: normalizeArray(playlist.trackIds).filter((id) => !removedTrackIds.includes(id)),
    }));
    const nextAmbienceTracks = ambienceTracks.filter((track) => track.fileId !== fileId);
    const nextAmbiencePlaylists = getAmbiencePlaylists().map((playlist) => ({
      ...playlist,
      trackIds: normalizeArray(playlist.trackIds).filter((id) => !removedAmbienceTrackIds.includes(id)),
    }));
    const cleaned = await maybeRemoveEmptyPlaylists({
      musicPreviousPlaylists: getPlaylists(),
      musicNextPlaylists: nextPlaylists,
      musicPreviousTrackIds: tracks.map((track) => track.id),
      musicNextTrackIds: nextTracks.map((track) => track.id),
      ambiencePreviousPlaylists: getAmbiencePlaylists(),
      ambienceNextPlaylists: nextAmbiencePlaylists,
      ambiencePreviousTrackIds: ambienceTracks.map((track) => track.id),
      ambienceNextTrackIds: nextAmbienceTracks.map((track) => track.id),
    });

    await setStorageData({
      files: nextFiles,
      tracks: nextTracks,
      playlists: cleaned.musicPlaylists,
      ambienceTracks: nextAmbienceTracks,
      ambiencePlaylists: cleaned.ambiencePlaylists,
      ambienceAllowConcurrent: getAmbienceAllowConcurrent(),
    });

    if (playbackState.current && removedTrackIds.includes(playbackState.current.trackId)) {
      await stopPlayback();
    }
    for (const ambienceTrackId of removedAmbienceTrackIds) {
      await stopAmbienceByTrackId(ambienceTrackId);
    }
    await stopDeletedPlaylistPlayback({
      deletedMusicPlaylistIds: cleaned.deletedMusicPlaylistIds,
      deletedAmbiencePlaylistIds: cleaned.deletedAmbiencePlaylistIds,
    });

    await this.#refreshCards(Object.values(MANAGER_CARD_IDS));
  }

  async #deleteFilesBlock() {
    const files = getFiles();
    if (!files.length) return;

    const confirmed = await Dialog.confirm({
      title: t("Dialogs.DeleteAllFilesTitle", "Delete all files"),
      content: t("Dialogs.DeleteAllFilesContent", "<p>Delete all files and their linked tracks?</p>"),
    });
    if (!confirmed) return;

    const tracks = getTracks();
    const ambienceTracks = getAmbienceTracks();
    const nextPlaylists = getPlaylists().map((playlist) => ({
      ...playlist,
      trackIds: [],
    }));
    const nextAmbiencePlaylists = getAmbiencePlaylists().map((playlist) => ({
      ...playlist,
      trackIds: [],
    }));
    const cleaned = await maybeRemoveEmptyPlaylists({
      musicPreviousPlaylists: getPlaylists(),
      musicNextPlaylists: nextPlaylists,
      musicPreviousTrackIds: tracks.map((track) => track.id),
      musicNextTrackIds: [],
      ambiencePreviousPlaylists: getAmbiencePlaylists(),
      ambienceNextPlaylists: nextAmbiencePlaylists,
      ambiencePreviousTrackIds: ambienceTracks.map((track) => track.id),
      ambienceNextTrackIds: [],
    });

    await stopPlayback();
    await stopAllAmbience();
    await setStorageData({
      files: [],
      tracks: [],
      playlists: cleaned.musicPlaylists,
      ambienceTracks: [],
      ambiencePlaylists: cleaned.ambiencePlaylists,
      ambienceAllowConcurrent: getAmbienceAllowConcurrent(),
    });

    await this.#refreshCards(Object.values(MANAGER_CARD_IDS), { refreshToolbar: true });
  }

  async #createOrEditTrack(trackId = null) {
    const files = getFiles();
    if (!files.length) {
      notify("warn", "AddFileFirst", {}, "Add at least one file first.");
      return;
    }

    const tracks = getTracks();
    const current = trackId ? tracks.find((entry) => entry.id === trackId) : null;

    const payload = await promptTrackData(current, files);
    if (!payload) return;

    if (current) {
      const index = tracks.findIndex((entry) => entry.id === trackId);
      tracks[index] = payload;
    } else {
      tracks.push(payload);
    }

    await setTracks(tracks);
    await this.#refreshCards([MANAGER_CARD_IDS.musicTracks, MANAGER_CARD_IDS.musicPlaylists]);
  }

  async #deleteTrack(trackId) {
    const tracks = getTracks();
    const track = tracks.find((entry) => entry.id === trackId);
    if (!track) return;

    const confirmed = await Dialog.confirm({
      title: t("Dialogs.DeleteTrackTitle", "Delete track"),
      content: tf("Dialogs.DeleteTrackContent", { name: escapeHtml(track.name) }, ({ name }) => `<p>Delete track <b>${name}</b>?</p>`),
    });
    if (!confirmed) return;

    const nextTracks = tracks.filter((entry) => entry.id !== trackId);
    const nextPlaylists = getPlaylists().map((playlist) => ({
      ...playlist,
      trackIds: normalizeArray(playlist.trackIds).filter((id) => id !== trackId),
    }));
    const cleaned = await maybeRemoveEmptyPlaylists({
      musicPreviousPlaylists: getPlaylists(),
      musicNextPlaylists: nextPlaylists,
      musicPreviousTrackIds: tracks.map((entry) => entry.id),
      musicNextTrackIds: nextTracks.map((entry) => entry.id),
    });

    await setStorageData({
      files: getFiles(),
      tracks: nextTracks,
      playlists: cleaned.musicPlaylists,
      ambienceTracks: getAmbienceTracks(),
      ambiencePlaylists: getAmbiencePlaylists(),
      ambienceAllowConcurrent: getAmbienceAllowConcurrent(),
    });

    if (playbackState.current?.trackId === trackId) {
      await stopPlayback();
    }
    await stopDeletedPlaylistPlayback({
      deletedMusicPlaylistIds: cleaned.deletedMusicPlaylistIds,
    });

    await this.#refreshCards([MANAGER_CARD_IDS.musicTracks, MANAGER_CARD_IDS.musicPlaylists]);
  }

  async #deleteTracksBlock() {
    const tracks = getTracks();
    if (!tracks.length) return;

    const confirmed = await Dialog.confirm({
      title: t("Dialogs.DeleteAllMusicTitle", "Delete all music"),
      content: t("Dialogs.DeleteAllMusicContent", "<p>Delete all music tracks?</p>"),
    });
    if (!confirmed) return;

    const nextPlaylists = getPlaylists().map((playlist) => ({
      ...playlist,
      trackIds: [],
    }));
    const cleaned = await maybeRemoveEmptyPlaylists({
      musicPreviousPlaylists: getPlaylists(),
      musicNextPlaylists: nextPlaylists,
      musicPreviousTrackIds: tracks.map((track) => track.id),
      musicNextTrackIds: [],
    });

    await stopPlayback();
    await setStorageData({
      files: getFiles(),
      tracks: [],
      playlists: cleaned.musicPlaylists,
      ambienceTracks: getAmbienceTracks(),
      ambiencePlaylists: getAmbiencePlaylists(),
      ambienceAllowConcurrent: getAmbienceAllowConcurrent(),
    });

    await this.#refreshCards([MANAGER_CARD_IDS.musicTracks, MANAGER_CARD_IDS.musicPlaylists], { refreshToolbar: true });
  }

  async #createOrEditPlaylist(playlistId = null) {
    const tracks = getTracks();
    const playlists = getPlaylists();
    const current = playlistId ? playlists.find((entry) => entry.id === playlistId) : null;

    const payload = await promptPlaylistData(current, tracks);
    if (!payload) return;

    if (current) {
      const index = playlists.findIndex((entry) => entry.id === playlistId);
      playlists[index] = payload;
    } else {
      playlists.push(payload);
    }

    await setPlaylists(playlists);
    await this.#refreshCards([MANAGER_CARD_IDS.musicPlaylists]);
  }

  async #reorderPlaylistTracks(playlistId, movedTrackId, targetTrackId, insertAfter = false) {
    if (!playlistId || !movedTrackId || !targetTrackId || movedTrackId === targetTrackId) return;

    const playlists = getPlaylists();
    const playlistIndex = playlists.findIndex((entry) => entry.id === playlistId);
    if (playlistIndex === -1) return;

    const nextTrackIds = reorderTrackIds(playlists[playlistIndex].trackIds, movedTrackId, targetTrackId, insertAfter);
    if (normalizeArray(playlists[playlistIndex].trackIds).join("|") === nextTrackIds.join("|")) return;

    playlists[playlistIndex] = {
      ...playlists[playlistIndex],
      trackIds: nextTrackIds,
    };

    await setPlaylists(playlists);
    await this.#refreshCards([MANAGER_CARD_IDS.musicPlaylists]);
  }

  async #setPlaylistTrackOrder(playlistId, orderedVisibleTrackIds) {
    if (!playlistId) return;

    const playlists = getPlaylists();
    const playlistIndex = playlists.findIndex((entry) => entry.id === playlistId);
    if (playlistIndex === -1) return;

    const nextTrackIds = applyVisibleTrackOrder(playlists[playlistIndex].trackIds, orderedVisibleTrackIds);
    if (normalizeArray(playlists[playlistIndex].trackIds).join("|") === nextTrackIds.join("|")) return;

    playlists[playlistIndex] = {
      ...playlists[playlistIndex],
      trackIds: nextTrackIds,
    };

    await setPlaylists(playlists);
    await this.#refreshCards([MANAGER_CARD_IDS.musicPlaylists]);
  }

  async #deletePlaylist(playlistId) {
    const playlists = getPlaylists();
    const playlist = playlists.find((entry) => entry.id === playlistId);
    if (!playlist) return;

    const confirmed = await Dialog.confirm({
      title: t("Dialogs.DeletePlaylistTitle", "Delete playlist"),
      content: tf("Dialogs.DeletePlaylistContent", { name: escapeHtml(playlist.name) }, ({ name }) => `<p>Delete playlist <b>${name}</b>?</p>`),
    });
    if (!confirmed) return;

    await setPlaylists(playlists.filter((entry) => entry.id !== playlistId));

    if (playbackState.current?.mode === "playlist" && playbackState.current?.playlistId === playlistId) {
      await stopPlayback();
    }

    await this.#refreshCards([MANAGER_CARD_IDS.musicPlaylists]);
  }

  async #deletePlaylistsBlock() {
    const playlists = getPlaylists();
    if (!playlists.length) return;

    const confirmed = await Dialog.confirm({
      title: t("Dialogs.DeleteAllPlaylistsTitle", "Delete all music playlists"),
      content: t("Dialogs.DeleteAllPlaylistsContent", "<p>Delete all music playlists?</p>"),
    });
    if (!confirmed) return;

    if (playbackState.current?.mode === "playlist") {
      await stopPlayback();
    }

    await setPlaylists([]);
    await this.#refreshCards([MANAGER_CARD_IDS.musicPlaylists], { refreshToolbar: true });
  }

  async #createOrEditAmbienceTrack(trackId = null) {
    const files = getFiles();
    if (!files.length) {
      notify("warn", "AddFileFirst", {}, "Add at least one file first.");
      return;
    }

    const tracks = getAmbienceTracks();
    const current = trackId ? tracks.find((entry) => entry.id === trackId) : null;
    const payload = await promptTrackData(current, files);
    if (!payload) return;

    if (current) {
      const index = tracks.findIndex((entry) => entry.id === trackId);
      tracks[index] = payload;
    } else {
      tracks.push(payload);
    }

    await setAmbienceTracks(tracks);
    await this.#refreshCards([MANAGER_CARD_IDS.ambienceTracks, MANAGER_CARD_IDS.ambiencePlaylists]);
  }

  async #deleteAmbienceTrack(trackId) {
    const tracks = getAmbienceTracks();
    const track = tracks.find((entry) => entry.id === trackId);
    if (!track) return;

    const confirmed = await Dialog.confirm({
      title: t("Dialogs.DeleteAmbienceTrackTitle", "Delete ambience track"),
      content: tf("Dialogs.DeleteAmbienceTrackContent", { name: escapeHtml(track.name) }, ({ name }) => `<p>Delete ambience track <b>${name}</b>?</p>`),
    });
    if (!confirmed) return;

    const nextTracks = tracks.filter((entry) => entry.id !== trackId);
    const nextPlaylists = getAmbiencePlaylists().map((playlist) => ({
      ...playlist,
      trackIds: normalizeArray(playlist.trackIds).filter((id) => id !== trackId),
    }));
    const cleaned = await maybeRemoveEmptyPlaylists({
      ambiencePreviousPlaylists: getAmbiencePlaylists(),
      ambienceNextPlaylists: nextPlaylists,
      ambiencePreviousTrackIds: tracks.map((entry) => entry.id),
      ambienceNextTrackIds: nextTracks.map((entry) => entry.id),
    });

    await setStorageData({
      files: getFiles(),
      tracks: getTracks(),
      playlists: getPlaylists(),
      ambienceTracks: nextTracks,
      ambiencePlaylists: cleaned.ambiencePlaylists,
      ambienceAllowConcurrent: getAmbienceAllowConcurrent(),
    });
    await stopAmbienceByTrackId(trackId);
    await stopDeletedPlaylistPlayback({
      deletedAmbiencePlaylistIds: cleaned.deletedAmbiencePlaylistIds,
    });
    await this.#refreshCards([MANAGER_CARD_IDS.ambienceTracks, MANAGER_CARD_IDS.ambiencePlaylists]);
  }

  async #deleteAmbienceTracksBlock() {
    const tracks = getAmbienceTracks();
    if (!tracks.length) return;

    const confirmed = await Dialog.confirm({
      title: t("Dialogs.DeleteAllAmbienceTracksTitle", "Delete all ambience"),
      content: t("Dialogs.DeleteAllAmbienceTracksContent", "<p>Delete all ambience tracks?</p>"),
    });
    if (!confirmed) return;

    const nextPlaylists = getAmbiencePlaylists().map((playlist) => ({
      ...playlist,
      trackIds: [],
    }));
    const cleaned = await maybeRemoveEmptyPlaylists({
      ambiencePreviousPlaylists: getAmbiencePlaylists(),
      ambienceNextPlaylists: nextPlaylists,
      ambiencePreviousTrackIds: tracks.map((track) => track.id),
      ambienceNextTrackIds: [],
    });

    await stopAllAmbience();
    await setStorageData({
      files: getFiles(),
      tracks: getTracks(),
      playlists: getPlaylists(),
      ambienceTracks: [],
      ambiencePlaylists: cleaned.ambiencePlaylists,
      ambienceAllowConcurrent: getAmbienceAllowConcurrent(),
    });

    await this.#refreshCards([MANAGER_CARD_IDS.ambienceTracks, MANAGER_CARD_IDS.ambiencePlaylists], { refreshToolbar: true });
  }

  async #createOrEditAmbiencePlaylist(playlistId = null) {
    const tracks = getAmbienceTracks();
    const playlists = getAmbiencePlaylists();
    const current = playlistId ? playlists.find((entry) => entry.id === playlistId) : null;
    const payload = await promptPlaylistData(current, tracks);
    if (!payload) return;

    if (current) {
      const index = playlists.findIndex((entry) => entry.id === playlistId);
      playlists[index] = payload;
    } else {
      playlists.push(payload);
    }

    await setAmbiencePlaylists(playlists);
    await this.#refreshCards([MANAGER_CARD_IDS.ambiencePlaylists]);
  }

  async #reorderAmbiencePlaylistTracks(playlistId, movedTrackId, targetTrackId, insertAfter = false) {
    if (!playlistId || !movedTrackId || !targetTrackId || movedTrackId === targetTrackId) return;

    const playlists = getAmbiencePlaylists();
    const playlistIndex = playlists.findIndex((entry) => entry.id === playlistId);
    if (playlistIndex === -1) return;

    const nextTrackIds = reorderTrackIds(playlists[playlistIndex].trackIds, movedTrackId, targetTrackId, insertAfter);
    if (normalizeArray(playlists[playlistIndex].trackIds).join("|") === nextTrackIds.join("|")) return;

    playlists[playlistIndex] = {
      ...playlists[playlistIndex],
      trackIds: nextTrackIds,
    };

    await setAmbiencePlaylists(playlists);
    await this.#refreshCards([MANAGER_CARD_IDS.ambiencePlaylists]);
  }

  async #setAmbiencePlaylistTrackOrder(playlistId, orderedVisibleTrackIds) {
    if (!playlistId) return;

    const playlists = getAmbiencePlaylists();
    const playlistIndex = playlists.findIndex((entry) => entry.id === playlistId);
    if (playlistIndex === -1) return;

    const nextTrackIds = applyVisibleTrackOrder(playlists[playlistIndex].trackIds, orderedVisibleTrackIds);
    if (normalizeArray(playlists[playlistIndex].trackIds).join("|") === nextTrackIds.join("|")) return;

    playlists[playlistIndex] = {
      ...playlists[playlistIndex],
      trackIds: nextTrackIds,
    };

    await setAmbiencePlaylists(playlists);
    await this.#refreshCards([MANAGER_CARD_IDS.ambiencePlaylists]);
  }

  async #deleteAmbiencePlaylist(playlistId) {
    const playlists = getAmbiencePlaylists();
    const playlist = playlists.find((entry) => entry.id === playlistId);
    if (!playlist) return;

    const confirmed = await Dialog.confirm({
      title: t("Dialogs.DeleteAmbiencePlaylistTitle", "Delete ambience playlist"),
      content: tf("Dialogs.DeleteAmbiencePlaylistContent", { name: escapeHtml(playlist.name) }, ({ name }) => `<p>Delete ambience playlist <b>${name}</b>?</p>`),
    });
    if (!confirmed) return;

    await setAmbiencePlaylists(playlists.filter((entry) => entry.id !== playlistId));
    await this.#refreshCards([MANAGER_CARD_IDS.ambiencePlaylists]);
  }

  async #deleteAmbiencePlaylistsBlock() {
    const playlists = getAmbiencePlaylists();
    if (!playlists.length) return;

    const confirmed = await Dialog.confirm({
      title: t("Dialogs.DeleteAllAmbiencePlaylistsTitle", "Delete all ambience playlists"),
      content: t("Dialogs.DeleteAllAmbiencePlaylistsContent", "<p>Delete all ambience playlists?</p>"),
    });
    if (!confirmed) return;

    for (const playlist of playlists) {
      await stopAmbienceByPlaylistId(playlist.id);
    }

    await setAmbiencePlaylists([]);
    await this.#refreshCards([MANAGER_CARD_IDS.ambiencePlaylists], { refreshToolbar: true });
  }
}

async function promptFileData(current = null) {
  const isNewFile = !current;
  const content = `
    <form class="standard-form ts-dj-dialog-form">
      <div class="form-group">
        <label>${escapeHtml(t("Dialogs.FileNameLabel", "Name"))}</label>
        <div class="form-fields">
          <input type="text" name="name" value="${escapeHtml(current?.name ?? "")}" placeholder="${escapeHtml(t("Dialogs.FileNamePlaceholder", "For example: YouTube Hour Mix"))}">
        </div>
      </div>
      <div class="form-group">
        <label>${escapeHtml(t("Dialogs.FilePathLabel", "File path"))}</label>
        <div class="form-fields">
          <file-picker type="audio" name="path" value="${escapeHtml(current?.path ?? "")}"></file-picker>
        </div>
      </div>
    </form>
  `;

  const result = await promptDialog(t("Dialogs.FileTitle", "File"), content, {
    render: (html) => {
      if (!isNewFile) return;

      const form = html[0]?.querySelector("form");
      const nameInput = form?.querySelector("input[name='name']");
      const pathInput = form?.querySelector("[name='path']");
      if (!nameInput || !pathInput) return;

      let nameTouched = Boolean(String(nameInput.value ?? "").trim());
      const syncNameFromPath = () => {
        if (nameTouched) return;
        const nextName = getPathBaseName(pathInput.value);
        if (nextName) nameInput.value = nextName;
      };

      nameInput.addEventListener("input", () => {
        nameTouched = Boolean(String(nameInput.value ?? "").trim());
      });
      pathInput.addEventListener("change", syncNameFromPath);
      pathInput.addEventListener("input", syncNameFromPath);
      syncNameFromPath();
    },
  });
  if (!result) return null;

  const path = String(result.path ?? "").trim();
  if (!path) {
    notify("warn", "NeedAudioPath", {}, "You must specify a path to an audio file.");
    return null;
  }

  return {
    id: current?.id ?? foundry.utils.randomID(),
    name: String(result.name ?? "").trim() || getPathBaseName(path),
    path,
  };
}

async function promptTrackData(current, files) {
  const isNewTrack = !current;
  const selectedFileId = current?.fileId ?? files[0].id;
  const selectedFile = files.find((entry) => entry.id === selectedFileId);
  const defaultName = isNewTrack ? getDefaultNameFromFileEntry(selectedFile) : "";
  const initialStart = current?.start ?? (isNewTrack ? "00:00" : "");
  const initialEnd = current?.end ?? "";

  const fileOptions = files
    .map((file) => `<option value="${file.id}" ${file.id === selectedFileId ? "selected" : ""}>${escapeHtml(file.name || file.path)}</option>`)
    .join("");

  const rateOptions = RATE_VALUES
    .map((rate) => `<option value="${rate}" ${Number(rate) === normalizeRate(Number(current?.rate ?? 1)) ? "selected" : ""}>${formatRate(rate)}x</option>`)
    .join("");

  const content = `
    <form class="standard-form ts-dj-dialog-form">
      <div class="form-group">
        <label>${escapeHtml(t("Dialogs.TrackNameLabel", "Track name"))}</label>
        <div class="form-fields">
          <input type="text" name="name" value="${escapeHtml(current?.name ?? defaultName)}" placeholder="${escapeHtml(t("Dialogs.TrackNamePlaceholder", "For example: Song 1 (00:03-01:20)"))}">
        </div>
      </div>
      <div class="form-group">
        <label>${escapeHtml(t("Dialogs.TrackFileLabel", "File"))}</label>
        <div class="form-fields">
          <select name="fileId">${fileOptions}</select>
        </div>
      </div>
      <div class="form-group">
        <label>${escapeHtml(t("Dialogs.TrackStartLabel", "Clip start"))}</label>
        <div class="form-fields">
          <input type="text" name="start" value="${escapeHtml(initialStart)}" placeholder="${escapeHtml(t("Dialogs.TrackStartPlaceholder", "00:03 or 3"))}">
        </div>
      </div>
      <div class="form-group">
        <label>${escapeHtml(t("Dialogs.TrackEndLabel", "Clip end"))}</label>
        <div class="form-fields">
          <input type="text" name="end" value="${escapeHtml(initialEnd)}" placeholder="${escapeHtml(t("Dialogs.TrackEndPlaceholder", "01:20 or 80"))}">
        </div>
      </div>
      <div class="form-group">
        <label>${escapeHtml(t("Dialogs.TrackRateLabel", "Default speed"))}</label>
        <div class="form-fields">
          <select name="rate">${rateOptions}</select>
        </div>
      </div>
      <div class="form-group">
        <div class="form-fields">
          <button type="button" class="ts-dj-preview-button" data-action="preview-track" title="${escapeHtml(t("Common.Preview", "Preview"))}" aria-label="${escapeHtml(t("Common.Preview", "Preview"))}"><i class="fas fa-play"></i></button>
        </div>
      </div>
    </form>
  `;

  const result = await promptDialog(t("Dialogs.TrackTitle", "Track"), content, {
    render: (html) => {
      const form = html[0]?.querySelector("form");
      const fileSelect = form?.querySelector("select[name='fileId']");
      const nameInput = form?.querySelector("input[name='name']");
      const startInput = form?.querySelector("input[name='start']");
      const endInput = form?.querySelector("input[name='end']");
      const rateSelect = form?.querySelector("select[name='rate']");
      const previewButton = form?.querySelector("button[data-action='preview-track']");
      if (!fileSelect || !nameInput || !startInput || !endInput || !rateSelect || !previewButton) return;

      const setPreviewButtonState = (active) => {
        previewButton.dataset.previewState = active ? "playing" : "idle";
        previewButton.title = active ? t("Common.StopPreview", "Stop preview") : t("Common.Preview", "Preview");
        previewButton.setAttribute("aria-label", active ? t("Common.StopPreview", "Stop preview") : t("Common.Preview", "Preview"));
        previewButton.innerHTML = active
          ? "<i class='fas fa-stop'></i>"
          : "<i class='fas fa-play'></i>";
      };
      const stopPreview = () =>
        stopTrackPreview().catch((error) => console.warn(`${MODULE_ID} | failed to stop track preview`, error));

      trackPreviewState.onStateChange = (active) => {
        if (!previewButton.isConnected) return;
        setPreviewButtonState(active);
      };
      setPreviewButtonState(false);
      stopPreview();

      previewButton.addEventListener("click", async () => {
        if (trackPreviewState.loading || trackPreviewState.sound) {
          await stopPreview();
          return;
        }

        const file = files.find((entry) => entry.id === String(fileSelect.value ?? ""));
        if (!file?.path) {
          notify("warn", "NeedExistingFile", {}, "You must select an existing file.");
          return;
        }

        try {
          await playTrackPreview({
            path: file.path,
            start: startInput.value,
            end: endInput.value,
            rate: rateSelect.value,
          });
        } catch (error) {
          console.warn(`${MODULE_ID} | failed to start track preview`, error);
          notify("warn", "PreviewUnavailable", {}, "TS-DJ-MUSIC: failed to start preview on this client.");
          setPreviewButtonState(false);
        }
      });

      const stopPreviewOnChange = () => {
        if (!trackPreviewState.sound) return;
        stopPreview();
      };
      fileSelect.addEventListener("change", stopPreviewOnChange);
      startInput.addEventListener("input", stopPreviewOnChange);
      endInput.addEventListener("input", stopPreviewOnChange);
      rateSelect.addEventListener("change", stopPreviewOnChange);

      if (!isNewTrack) return;

      const initialFileId = String(fileSelect.value ?? "");
      const initialDefaultName = getDefaultNameFromFileEntry(files.find((entry) => entry.id === initialFileId));
      let autoName = String(nameInput.value ?? "").trim();
      let nameTouched = Boolean(autoName) && autoName !== initialDefaultName;
      const durationCache = new Map();
      const syncNameFromFile = (fileId) => {
        if (nameTouched) return;
        const file = files.find((entry) => entry.id === fileId);
        const nextName = getDefaultNameFromFileEntry(file);
        autoName = nextName;
        if (nextName) nameInput.value = nextName;
      };

      const applyDefaults = async (fileId) => {
        const file = files.find((entry) => entry.id === fileId);
        if (!file?.path) return;

        syncNameFromFile(fileId);
        startInput.value = "00:00";

        if (durationCache.has(fileId)) {
          endInput.value = durationCache.get(fileId);
          return;
        }

        let endValue = "";
        try {
          const sound = await preloadSoundWithFileCache(file.path, { channel: "music" });
          const duration = getSoundDuration(sound);
          if (Number.isFinite(duration) && duration > 0) {
            endValue = formatDurationClock(duration);
          }
        } catch (error) {
          console.warn(`${MODULE_ID} | failed to preload track defaults for ${file.path}`, error);
        }

        durationCache.set(fileId, endValue);
        if (String(fileSelect.value ?? "") === fileId) {
          endInput.value = endValue;
        }
      };

      fileSelect.addEventListener("change", (event) => {
        const nextFileId = String(event.currentTarget.value ?? "");
        applyDefaults(nextFileId).catch((error) => console.warn(`${MODULE_ID} | failed to set track defaults`, error));
      });
      nameInput.addEventListener("input", () => {
        const currentValue = String(nameInput.value ?? "").trim();
        nameTouched = Boolean(currentValue) && currentValue !== autoName;
      });

      applyDefaults(String(fileSelect.value ?? "")).catch((error) =>
        console.warn(`${MODULE_ID} | failed to set initial track defaults`, error)
      );
    },
    close: async () => {
      trackPreviewState.onStateChange = null;
      await stopTrackPreview({ suppressUiUpdate: true });
    },
  });
  if (!result) return null;

  const fileId = String(result.fileId ?? "");
  const file = files.find((entry) => entry.id === fileId);
  if (!file) {
    notify("warn", "NeedExistingFile", {}, "You must select an existing file.");
    return null;
  }
  const name = String(result.name ?? "").trim() || getDefaultNameFromFileEntry(file);
  if (!name) {
    notify("warn", "NeedTrackName", {}, "You must specify a track name.");
    return null;
  }

  return {
    id: current?.id ?? foundry.utils.randomID(),
    name,
    fileId,
    start: String(result.start ?? "").trim(),
    end: String(result.end ?? "").trim(),
    rate: normalizeRate(Number(result.rate ?? 1)),
    loop: Boolean(current?.loop),
  };
}

function getDefaultNameFromFileEntry(file) {
  if (!file) return "";
  const fromName = String(file.name ?? "").trim();
  if (fromName) return fromName;
  return getPathBaseName(file.path);
}

function getPathBaseName(path) {
  const raw = String(path ?? "").trim();
  if (!raw) return "";
  const clean = raw.split("?")[0].split("#")[0];
  const parts = clean.split(/[\\/]/).filter(Boolean);
  return decodePathComponent(parts[parts.length - 1] ?? "");
}

function decodePathComponent(value) {
  const raw = decodeEscapedUnicode(value);
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch (_error) {
    return raw;
  }
}

function decodeEscapedUnicode(value) {
  const raw = String(value ?? "");
  if (!raw) return "";
  return raw.replace(/\\+[uU]([0-9a-fA-F]{4})/g, (_match, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function decodePathForDisplay(path) {
  const raw = decodeEscapedUnicode(path).trim();
  if (!raw) return "";
  return raw
    .split(/([\\/])/)
    .map((part) => (part === "/" || part === "\\" ? part : decodePathComponent(part)))
    .join("");
}

async function promptPlaylistData(current, tracks) {
  const checked = new Set(normalizeArray(current?.trackIds));
  const dialogTracks = getPlaylistTracksForEditor(tracks, normalizeArray(current?.trackIds));

  const trackCheckboxes = dialogTracks.length
    ? dialogTracks
        .map((track) => {
          const isChecked = checked.has(track.id) ? "checked" : "";
          return `
            <div class="ts-dj-playlist-track-row ${isChecked ? "is-checked" : ""}" data-track-row data-track-id="${escapeHtml(track.id)}" draggable="true">
              <span class="ts-dj-playlist-track-handle" title="${escapeHtml(t("Common.DragToReorder", "Drag to change order"))}">
                <i class="fas fa-grip-vertical"></i>
              </span>
              <input type="checkbox" name="trackIds" value="${escapeHtml(track.id)}" ${isChecked}>
              <span class="ts-dj-playlist-track-name">${escapeHtml(track.name)}</span>
            </div>
          `;
        })
        .join("")
    : `<p class='notes'>${escapeHtml(t("Dialogs.PlaylistTrackPickerEmpty", "Create tracks first."))}</p>`;

  const content = `
    <form class="standard-form ts-dj-dialog-form">
      <div class="form-group">
        <label>${escapeHtml(t("Dialogs.PlaylistNameLabel", "Playlist name"))}</label>
        <div class="form-fields">
          <input type="text" name="name" value="${escapeHtml(current?.name ?? "")}" placeholder="${escapeHtml(t("Dialogs.PlaylistNamePlaceholder", "For example: Mix 1"))}">
        </div>
      </div>
      <div class="form-group stacked">
        <label>${escapeHtml(t("Dialogs.PlaylistTracksLabel", "Playlist tracks"))}</label>
        <input type="hidden" name="trackOrder" value="">
        <div class="form-fields" style="display:block">
          <p class="notes">${escapeHtml(t("Dialogs.PlaylistTrackPickerNote", "The list starts in a practical order. You can reorder rows by dragging them with the mouse."))}</p>
          <div class="ts-dj-playlist-track-picker" data-playlist-track-picker>${trackCheckboxes}</div>
        </div>
      </div>
    </form>
  `;

  const result = await promptDialog(t("Dialogs.PlaylistTitle", "Playlist"), content, {
    render: (html) => {
      const form = html[0]?.querySelector("form");
      initPlaylistTrackPicker(form);
    },
  });
  if (!result) return null;

  const name = String(result.name ?? "").trim();
  if (!name) {
    notify("warn", "NeedPlaylistName", {}, "You must specify a playlist name.");
    return null;
  }

  const selected = result.trackIds;
  const selectedTrackIds = new Set(Array.isArray(selected) ? selected : selected ? [selected] : []);
  const orderedTrackIds = String(result.trackOrder ?? "")
    .split(",")
    .map((trackId) => trackId.trim())
    .filter(Boolean);
  const trackIds = orderedTrackIds.filter((trackId) => selectedTrackIds.has(trackId));

  return {
    id: current?.id ?? foundry.utils.randomID(),
    name,
    loop: Boolean(current?.loop),
    shuffle: Boolean(current?.shuffle),
    trackIds,
  };
}

async function promptDialog(title, content, {
  render,
  close: onClose,
  confirmLabel = t("Common.Save", "Save"),
  confirmIcon = "fa-save",
} = {}) {
  return new Promise((resolve) => {
    let finished = false;

    new Dialog({
      title,
      content,
      render: (html) => {
        if (typeof render !== "function") return;
        try {
          render(html);
        } catch (error) {
          console.warn(`${MODULE_ID} | dialog render handler failed`, error);
        }
      },
      buttons: {
        save: {
          label: confirmLabel,
          icon: `<i class='fas ${confirmIcon}'></i>`,
          callback: (html) => {
            finished = true;
            resolve(extractFormData(html));
          },
        },
        cancel: {
          label: t("Common.Cancel", "Cancel"),
          icon: "<i class='fas fa-times'></i>",
          callback: () => {
            finished = true;
            resolve(null);
          },
        },
      },
      default: "save",
      close: () => {
        if (typeof onClose === "function") {
          try {
            Promise.resolve(onClose()).catch((error) => {
              console.warn(`${MODULE_ID} | dialog close handler failed`, error);
            });
          } catch (error) {
            console.warn(`${MODULE_ID} | dialog close handler failed`, error);
          }
        }
        if (!finished) resolve(null);
      },
    }).render(true);
  });
}

function extractFormData(html) {
  const form = html[0]?.querySelector("form");
  if (!form) return {};

  if (typeof FormDataExtended !== "undefined") {
    return new FormDataExtended(form).object;
  }

  const data = {};
  for (const element of form.querySelectorAll("input, select, textarea")) {
    if (!element.name) continue;

    if (element.type === "checkbox") {
      if (!element.checked) continue;
      if (Object.hasOwn(data, element.name)) {
        if (!Array.isArray(data[element.name])) data[element.name] = [data[element.name]];
        data[element.name].push(element.value || true);
      } else {
        data[element.name] = element.value || true;
      }
      continue;
    }

    if (Object.hasOwn(data, element.name)) {
      if (!Array.isArray(data[element.name])) data[element.name] = [data[element.name]];
      data[element.name].push(element.value);
    } else {
      data[element.name] = element.value;
    }
  }

  return data;
}

function markSoundChannel(sound, channel) {
  if (!sound) return sound;
  try {
    sound[SOUND_CHANNEL_MARK] = String(channel ?? "");
  } catch (_error) {
    // no-op
  }
  return sound;
}

function isSoundOnChannel(sound, channel) {
  return String(sound?.[SOUND_CHANNEL_MARK] ?? "") === String(channel ?? "");
}

function getAudioContextForChannel(channel) {
  const audio = game?.audio;
  if (!audio) return null;

  const normalized = String(channel ?? "music").toLowerCase();
  if (normalized === "environment") return audio.environment ?? audio.context ?? null;
  if (normalized === "interface") return audio.interface ?? audio.context ?? null;
  return audio.music ?? audio.context ?? null;
}

async function preloadSoundForChannel(sourcePath, channel) {
  if (!sourcePath) return null;
  const context = getAudioContextForChannel(channel);

  try {
    const sound = game.audio?.create({
      src: sourcePath,
      context: context ?? undefined,
      preload: true,
      autoplay: false,
      singleton: false,
    });
    if (sound) {
      if (typeof sound.load === "function") {
        await sound.load();
      }
      return markSoundChannel(sound, channel);
    }
  } catch (error) {
    console.warn(`${MODULE_ID} | channel-aware audio create failed for ${sourcePath}`, error);
    // Fall through to preloadSound for compatibility.
  }

  const preloaded = await foundry.audio.AudioHelper.preloadSound(sourcePath);
  if (preloaded) {
    console.warn(`${MODULE_ID} | fallback preloadSound used for ${sourcePath}; channel separation may be limited on this client.`);
    return markSoundChannel(preloaded, "legacy");
  }
  return null;
}

async function preloadSoundWithFileCache(filePath, { channel = "music" } = {}) {
  const playbackPath = await ensureFileCachedAsBlobUrl(filePath);
  let sound = await preloadSoundForChannel(playbackPath, channel);
  if (!sound && playbackPath !== filePath) {
    sound = await preloadSoundForChannel(filePath, channel);
  }
  return sound;
}

async function stopTrackPreview({ suppressUiUpdate = false } = {}) {
  const sound = trackPreviewState.sound;

  trackPreviewState.requestId += 1;
  trackPreviewState.loading = false;
  trackPreviewState.sound = null;
  trackPreviewState.token = null;

  if (sound) {
    clearSegmentLoopBinding(sound);
    try {
      await sound.stop();
    } catch (_error) {
      // no-op
    }
    forceStopSoundNodes(sound);
    await waitMs(25);
  }

  if (!suppressUiUpdate && typeof trackPreviewState.onStateChange === "function") {
    trackPreviewState.onStateChange(false);
  }
}

async function playTrackPreview({ path, start, end, rate } = {}) {
  if (!path) return false;

  await stopTrackPreview({ suppressUiUpdate: true });
  const requestId = trackPreviewState.requestId;
  trackPreviewState.loading = true;
  if (typeof trackPreviewState.onStateChange === "function") {
    trackPreviewState.onStateChange(true);
  }

  const clipStartRaw = parseTimeInput(start);
  const clipStart = Number.isFinite(clipStartRaw) && clipStartRaw >= 0 ? clipStartRaw : 0;
  const clipEnd = parseTimeInput(end);
  const hasEnd = Number.isFinite(clipEnd) && clipEnd > clipStart;
  const finalRate = normalizeRate(Number(rate ?? 1));
  const sound = await preloadSoundWithFileCache(path, { channel: "music" });
  if (trackPreviewState.requestId !== requestId) {
    forceStopSoundNodes(sound);
    return false;
  }
  if (!sound) {
    trackPreviewState.loading = false;
    if (typeof trackPreviewState.onStateChange === "function") {
      trackPreviewState.onStateChange(false);
    }
    throw new Error(`Track preview load failed for ${path}`);
  }

  const token = foundry.utils.randomID();
  const volume = getLiveMusicVolume();
  const playOptions = {
    autoplay: true,
    loop: false,
    volume,
    onended: () => {
      if (trackPreviewState.token !== token) return;
      trackPreviewState.loading = false;
      trackPreviewState.sound = null;
      trackPreviewState.token = null;
      if (typeof trackPreviewState.onStateChange === "function") {
        trackPreviewState.onStateChange(false);
      }
    },
  };

  if (clipStart > 0) playOptions.offset = clipStart;
  if (hasEnd) {
    playOptions.duration = Math.max(0.01, clipEnd - clipStart);
  }

  trackPreviewState.loading = false;
  trackPreviewState.sound = sound;
  trackPreviewState.token = token;

  try {
    await playSoundWithRetry(sound, playOptions);
  } catch (error) {
    trackPreviewState.loading = false;
    trackPreviewState.sound = null;
    trackPreviewState.token = null;
    if (typeof trackPreviewState.onStateChange === "function") {
      trackPreviewState.onStateChange(false);
    }
    throw error;
  }

  if (trackPreviewState.requestId !== requestId || trackPreviewState.token !== token) {
    await stopTrackPreview({ suppressUiUpdate: true });
    if (typeof trackPreviewState.onStateChange === "function") {
      trackPreviewState.onStateChange(false);
    }
    return false;
  }

  applySoundRate(sound, finalRate);
  applySoundVolume(sound, volume);

  if (typeof trackPreviewState.onStateChange === "function") {
    trackPreviewState.onStateChange(true);
  }
  return true;
}

function forceStopSoundNodes(sound) {
  if (!sound) return;

  try {
    if (sound.element && typeof sound.element.pause === "function") {
      sound.element.pause();
    }
  } catch (_error) {
    // no-op
  }

  try {
    if (sound.sourceElement && typeof sound.sourceElement.pause === "function") {
      sound.sourceElement.pause();
    }
  } catch (_error) {
    // no-op
  }
}

function clearPendingAmbienceRequests(predicate = null) {
  for (const [requestId, entry] of ambienceState.pending.entries()) {
    if (typeof predicate === "function" && !predicate(entry)) continue;
    ambienceState.pending.delete(requestId);
  }
}

async function ensureFileCachedAsBlobUrl(filePath) {
  if (!filePath) return filePath;

  const cached = audioFileCache.get(filePath);
  if (cached?.blobUrl) return cached.blobUrl;
  if (cached?.pending) {
    try {
      return await cached.pending;
    } catch (_error) {
      audioFileCache.delete(filePath);
      return filePath;
    }
  }

  const pending = (async () => {
    const response = await fetch(filePath, { method: "GET", cache: "force-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") ?? undefined;
    const blob = contentType ? new Blob([buffer], { type: contentType }) : new Blob([buffer]);
    const blobUrl = URL.createObjectURL(blob);
    return blobUrl;
  })();

  audioFileCache.set(filePath, { pending });
  try {
    const blobUrl = await pending;
    audioFileCache.set(filePath, { blobUrl });
    return blobUrl;
  } catch (error) {
    audioFileCache.delete(filePath);
    console.warn(`${MODULE_ID} | full-file cache failed for ${filePath}`, error);
    return filePath;
  }
}

function clearAudioFileCache() {
  for (const cacheEntry of audioFileCache.values()) {
    if (!cacheEntry?.blobUrl) continue;
    try {
      URL.revokeObjectURL(cacheEntry.blobUrl);
    } catch (_error) {
      // no-op
    }
  }
  audioFileCache.clear();
}

function parseTimeInput(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);

  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.replace(",", ".");
  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    const seconds = Number(normalized);
    return Number.isFinite(seconds) ? Math.max(0, seconds) : null;
  }

  const parts = normalized.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return null;

  if (parts.length === 2) {
    return Math.max(0, parts[0] * 60 + parts[1]);
  }

  if (parts.length === 3) {
    return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }

  return null;
}

function normalizeRate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  const bounded = clampNumber(numeric, 0.5, 2);
  const snapped = Math.round(bounded * 4) / 4;
  return clampNumber(snapped, 0.5, 2);
}

function normalizeVolume(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  const bounded = clampNumber(numeric, 0, 1);
  const snapped = Math.round(bounded * 20) / 20;
  return clampNumber(snapped, 0, 1);
}

function normalizeArray(value) {
  return Array.isArray(value) ? foundry.utils.deepClone(value) : [];
}

function shuffledArray(value) {
  const array = normalizeArray(value);
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function formatRate(rate) {
  return Number(rate).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function formatVolumePercent(volume) {
  const normalized = normalizeVolume(volume);
  return `${Math.round(normalized * 100)}%`;
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true" || value === "on" || value === "1";
  return Boolean(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function startClipEndMonitor(sound, clipStart, clipEnd, token) {
  const pollMs = 100;
  const toleranceSec = 0.05;

  const id = window.setInterval(() => {
    const current = playbackState.current;
    if (!current || current.token !== token) {
      window.clearInterval(id);
      return;
    }

    const currentTime = getSoundCurrentTime(current.sound ?? sound) ?? getEstimatedAbsoluteTime(current);
    if (!Number.isFinite(currentTime)) return;

    const safeClipStart = Number.isFinite(current.clipStart) ? current.clipStart : clipStart;
    const safeClipEnd = Number.isFinite(current.clipEnd) ? current.clipEnd : clipEnd;
    if (!Number.isFinite(safeClipStart) || !Number.isFinite(safeClipEnd) || safeClipEnd <= safeClipStart) return;
    const stopThresholdReached = (currentTime + toleranceSec) >= safeClipEnd;
    if (!stopThresholdReached) return;

    window.clearInterval(id);
    handleTrackEnded(token, { forceStop: true }).catch((error) => {
      console.warn(`${MODULE_ID} | clip end handling failed`, error);
    });
  }, pollMs);

  return id;
}

function startAmbienceClipEndMonitor(sound, clipStart, clipEnd, token) {
  const pollMs = 120;
  const toleranceSec = 0.05;
  const id = window.setInterval(() => {
    const entry = ambienceState.active.get(token);
    if (!entry) {
      window.clearInterval(id);
      return;
    }
    const currentTime = getSoundCurrentTime(entry.sound ?? sound);
    if (!Number.isFinite(currentTime)) return;
    const safeClipStart = Number.isFinite(entry.clipStart) ? entry.clipStart : clipStart;
    const safeClipEnd = Number.isFinite(entry.clipEnd) ? entry.clipEnd : clipEnd;
    if (!Number.isFinite(safeClipStart) || !Number.isFinite(safeClipEnd) || safeClipEnd <= safeClipStart) return;
    const stopThresholdReached = (currentTime + toleranceSec) >= safeClipEnd;
    if (!stopThresholdReached) return;

    window.clearInterval(id);
    handleAmbienceEnded(token, { forceStop: true }).catch((error) => {
      console.warn(`${MODULE_ID} | ambience clip end failed`, error);
    });
  }, pollMs);
  return id;
}

function clearClipEndMonitor(state) {
  if (!state?.clipMonitorId) return;
  window.clearInterval(state.clipMonitorId);
  state.clipMonitorId = null;
}

function clearAmbienceClipEndMonitor(state) {
  if (!state?.clipMonitorId) return;
  window.clearInterval(state.clipMonitorId);
  state.clipMonitorId = null;
}

function getSoundCurrentTime(sound) {
  if (!sound) return null;

  if (sound.element && Number.isFinite(sound.element.currentTime)) {
    return Number(sound.element.currentTime);
  }

  if (sound.sourceElement && Number.isFinite(sound.sourceElement.currentTime)) {
    return Number(sound.sourceElement.currentTime);
  }

  if (Number.isFinite(sound.currentTime)) {
    return Number(sound.currentTime);
  }

  if (typeof sound.seek === "function") {
    const sought = sound.seek();
    if (Number.isFinite(sought)) return Number(sought);
  }

  return null;
}

function seekSoundToTime(sound, timeSec) {
  if (!sound) return false;
  const target = Math.max(0, Number(timeSec) || 0);
  let applied = false;

  try {
    if (sound.element && Number.isFinite(sound.element.currentTime)) {
      sound.element.currentTime = target;
      applied = true;
    }
  } catch (_error) {
    // no-op
  }

  try {
    if (sound.sourceElement && Number.isFinite(sound.sourceElement.currentTime)) {
      sound.sourceElement.currentTime = target;
      applied = true;
    }
  } catch (_error) {
    // no-op
  }

  try {
    if (Number.isFinite(sound.currentTime)) {
      sound.currentTime = target;
      applied = true;
    }
  } catch (_error) {
    // no-op
  }

  try {
    if (typeof sound.seek === "function") {
      sound.seek(target);
      applied = true;
    }
  } catch (_error) {
    // no-op
  }

  return applied;
}

function getSoundDuration(sound) {
  if (!sound) return null;

  if (Number.isFinite(sound.duration)) {
    return Number(sound.duration);
  }

  if (sound.element && Number.isFinite(sound.element.duration)) {
    return Number(sound.element.duration);
  }

  if (sound.sourceElement && Number.isFinite(sound.sourceElement.duration)) {
    return Number(sound.sourceElement.duration);
  }

  return null;
}

function getTrackProgressForSidebar(track) {
  const current = playbackState.current;
  if (!current || current.trackId !== track.id) return null;

  const clipStart = Number.isFinite(current.clipStart) ? current.clipStart : parseTimeInput(track.start) ?? 0;
  const requestedClipEnd = Number.isFinite(current.clipEnd) ? current.clipEnd : parseTimeInput(track.end);
  const soundDuration = getSoundDuration(current.sound);
  const clipEnd = Number.isFinite(requestedClipEnd)
    ? requestedClipEnd
    : Number.isFinite(soundDuration)
      ? soundDuration
      : null;
  const absoluteNow = getEstimatedAbsoluteTime(current) ?? getCurrentAbsoluteTime(current);
  if (!Number.isFinite(absoluteNow)) return null;
  const playbackRate = normalizeRate(Number(current.timingRate ?? 1));
  const displayRate = playbackRate > 0 ? playbackRate : 1;

  const insideClip = Math.max(0, absoluteNow - clipStart);
  const pausedMark = current.paused ? " (paused)" : "";
  if (Number.isFinite(clipEnd) && clipEnd > clipStart) {
    const clipDuration = clipEnd - clipStart;
    const boundedNow = current.loopEnabled
      ? ((insideClip % clipDuration) + clipDuration) % clipDuration
      : Math.clamp(insideClip, 0, clipDuration);
    const displayNow = Math.clamp(boundedNow / displayRate, 0, clipDuration / displayRate);
    const displayDuration = clipDuration / displayRate;
    return {
      nowSeconds: displayNow,
      maxSeconds: displayDuration,
      label: `${formatDurationClock(displayNow)} / ${formatDurationClock(displayDuration)}${pausedMark}`,
    };
  }

  const displayInsideClip = insideClip / displayRate;
  const fallbackMax = Math.max(1, displayInsideClip);
  return {
    nowSeconds: Math.clamp(displayInsideClip, 0, fallbackMax),
    maxSeconds: fallbackMax,
    label: `${formatDurationClock(displayInsideClip)}${pausedMark}`,
  };
}

function formatDurationClock(seconds) {
  if (!Number.isFinite(seconds)) return "--:--";
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function updateSidebarProgressUi() {
  const root = getRoot(ui.playlists?.element);
  if (!root) return;

  const panel = root.querySelector(`.${MODULE_ID}-sidebar-panel`);
  if (!panel) return;

  const activeRow = panel.querySelector(`[data-section="music"] .${MODULE_ID}-sidebar-row.is-active`);
  if (!activeRow) return;

  const trackId = activeRow.querySelector("button[data-id]")?.dataset.id;
  if (!trackId) return;

  const track = getTracks().find((entry) => entry.id === trackId);
  if (!track) return;

  const progress = getTrackProgressForSidebar(track);
  if (!progress) return;

  let progressWrap = activeRow.querySelector(".progress");
  if (!progressWrap) {
    const meta = activeRow.querySelector(".meta");
    if (!meta) return;

    progressWrap = document.createElement("div");
    progressWrap.classList.add("progress");
    progressWrap.innerHTML = "<span class=\"progress-time\"></span>";
    meta.appendChild(progressWrap);
  }
  const label = progressWrap.querySelector(".progress-time");
  label.textContent = progress.label;
}

function startSidebarProgressTicker() {
  if (sidebarProgressTicker) return;
  sidebarProgressTicker = window.setInterval(() => {
    if (!playbackState.current) {
      stopSidebarProgressTicker();
      return;
    }
    if (playbackState.current.paused) return;
    updateSidebarProgressUi();
  }, 1000);
}

function stopSidebarProgressTicker() {
  if (!sidebarProgressTicker) return;
  window.clearInterval(sidebarProgressTicker);
  sidebarProgressTicker = null;
}

function updateCurrentTimingRate(newRate) {
  const current = playbackState.current;
  if (!current || current.paused) return;
  const nowAbs = getCurrentAbsoluteTime(current);
  current.timingBaseAbs = Number.isFinite(nowAbs) ? nowAbs : (current.timingBaseAbs ?? current.clipStart ?? 0);
  current.timingBaseMs = Date.now();
  current.timingRate = normalizeRate(newRate);
}

function getCurrentAbsoluteTime(current) {
  if (!current) return null;
  if (current.paused && Number.isFinite(current.pausedAt)) return current.pausedAt;
  const direct = getSoundCurrentTime(current.sound);
  if (Number.isFinite(direct)) {
    current.timingBaseAbs = direct;
    current.timingBaseMs = Date.now();
    return direct;
  }
  return getEstimatedAbsoluteTime(current);
}

function getEstimatedAbsoluteTime(current) {
  if (!current) return null;
  if (current.paused && Number.isFinite(current.pausedAt)) return current.pausedAt;
  if (!Number.isFinite(current.timingBaseAbs) || !Number.isFinite(current.timingBaseMs)) return null;
  const rate = normalizeRate(Number(current.timingRate ?? 1));
  const elapsedSec = Math.max(0, (Date.now() - current.timingBaseMs) / 1000);
  return current.timingBaseAbs + elapsedSec * rate;
}

async function playSoundWithRetry(sound, playOptions) {
  const delays = [0, 40, 90];
  let lastError = null;

  for (const delayMs of delays) {
    if (delayMs > 0) await waitMs(delayMs);
    try {
      await sound.play(playOptions);
      return;
    } catch (error) {
      lastError = error;
      try {
        await sound.stop();
      } catch (_error) {
        // no-op
      }
    }
  }

  throw lastError ?? new Error("Failed to play sound");
}

function waitMs(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
