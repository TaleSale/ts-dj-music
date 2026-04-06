import { exportModuleSettings, importModuleSettings, transferMusicPlaylist } from "./settings-io.js";
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
  collapseManagerNormalizationByDefault: "collapseManagerNormalizationByDefault",
  collapseManagerFilesByDefault: "collapseManagerFilesByDefault",
  collapseManagerMusicByDefault: "collapseManagerMusicByDefault",
  collapseManagerAmbienceByDefault: "collapseManagerAmbienceByDefault",
  collapseManagerNowPlayingByDefault: "collapseManagerNowPlayingByDefault",
  collapseManagerMusicPlaylistsByDefault: "collapseManagerMusicPlaylistsByDefault",
  collapseManagerMusicTracksByDefault: "collapseManagerMusicTracksByDefault",
  collapseManagerAmbiencePlaylistsByDefault: "collapseManagerAmbiencePlaylistsByDefault",
  collapseManagerAmbienceTracksByDefault: "collapseManagerAmbienceTracksByDefault",
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
  seekPlayback: "seek-playback",
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
  SOCKET_ACTIONS.seekPlayback,
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
const NORMALIZATION_ANALYSIS_VERSION = 11;
const MAX_NORMALIZATION_ANALYSIS_SEC = 1;
const NORMALIZATION_POLL_MS = 50;
const NORMALIZATION_BIND_RETRY_MS = 75;
const NORMALIZATION_BIND_MAX_WAIT_MS = 1500;
const PRELOAD_NORMALIZATION_MAX_WAIT_MS = 8000;
const PRELOAD_NORMALIZATION_RATE = 2;
const NORMALIZATION_SCAN_WINDOW_SEC = 0.5;
const DEFAULT_NORMALIZATION_SCAN_PROFILE = "normal";
const NORMALIZATION_SCAN_PROFILES = Object.freeze({
  shallow: Object.freeze({
    id: "shallow",
    windowCount: 2,
    sampleStep: 1,
  }),
  normal: Object.freeze({
    id: "normal",
    windowCount: 3,
    sampleStep: 1,
  }),
  deep: Object.freeze({
    id: "deep",
    windowCount: 5,
    sampleStep: 1,
  }),
});
const NORMALIZATION_SCAN_PROFILE_ORDER = Object.freeze(["shallow", "normal", "deep"]);
const MIN_NORMALIZATION_RMS = 0.00001;
const MIN_NORMALIZATION_ACTIVE_SAMPLE = 0.0001;
const NORMALIZATION_TOP_BLOCK_PORTION = 0.2;
const MIN_NORMALIZATION_GAIN = 0.1;
const MAX_NORMALIZATION_GAIN = 12;
const MAX_SOUND_GAIN = 12;
const NORMALIZATION_DEBUG_LOGS = true;
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
  collapseManagerNormalizationByDefault: false,
  collapseManagerFilesByDefault: false,
  collapseManagerMusicByDefault: false,
  collapseManagerAmbienceByDefault: false,
  collapseManagerNowPlayingByDefault: false,
  collapseManagerMusicPlaylistsByDefault: false,
  collapseManagerMusicTracksByDefault: false,
  collapseManagerAmbiencePlaylistsByDefault: false,
  collapseManagerAmbienceTracksByDefault: false,
});
const QUICK_PANEL_COLLAPSE_SETTINGS = Object.freeze([
  {
    key: SETTING_KEYS.collapseGlobalVolumeByDefault,
    nameKey: i18nKey("Settings.CollapseGlobalVolumeName"),
    hintKey: i18nKey("Settings.CollapseGlobalVolumeHint"),
  },
  {
    key: SETTING_KEYS.collapseTsDjPlaylistsByDefault,
    nameKey: i18nKey("Settings.CollapsePlaylistsName"),
    hintKey: i18nKey("Settings.CollapsePlaylistsHint"),
  },
  {
    key: SETTING_KEYS.collapseFoundryPlaylistsByDefault,
    nameKey: i18nKey("Settings.CollapseFoundryName"),
    hintKey: i18nKey("Settings.CollapseFoundryHint"),
  },
]);
const MANAGER_SECTION_COLLAPSE_SETTINGS = Object.freeze([
  {
    key: SETTING_KEYS.collapseManagerNormalizationByDefault,
    sectionKey: "normalization",
    nameKey: i18nKey("Settings.CollapseWindowNormalizationName"),
    hintKey: i18nKey("Settings.CollapseWindowNormalizationHint"),
  },
  {
    key: SETTING_KEYS.collapseManagerFilesByDefault,
    sectionKey: "files",
    nameKey: i18nKey("Settings.CollapseWindowFilesName"),
    hintKey: i18nKey("Settings.CollapseWindowFilesHint"),
  },
  {
    key: SETTING_KEYS.collapseManagerMusicByDefault,
    sectionKey: "music",
    nameKey: i18nKey("Settings.CollapseWindowMusicName"),
    hintKey: i18nKey("Settings.CollapseWindowMusicHint"),
  },
  {
    key: SETTING_KEYS.collapseManagerAmbienceByDefault,
    sectionKey: "ambience",
    nameKey: i18nKey("Settings.CollapseWindowAmbienceName"),
    hintKey: i18nKey("Settings.CollapseWindowAmbienceHint"),
  },
]);
const MANAGER_CARD_COLLAPSE_SETTINGS = Object.freeze([
  {
    key: SETTING_KEYS.collapseManagerNowPlayingByDefault,
    cardKey: "nowPlaying",
    nameKey: i18nKey("Settings.CollapseWindowNowPlayingName"),
    hintKey: i18nKey("Settings.CollapseWindowNowPlayingHint"),
  },
  {
    key: SETTING_KEYS.collapseManagerMusicPlaylistsByDefault,
    cardKey: "musicPlaylists",
    nameKey: i18nKey("Settings.CollapseWindowMusicPlaylistsName"),
    hintKey: i18nKey("Settings.CollapseWindowMusicPlaylistsHint"),
  },
  {
    key: SETTING_KEYS.collapseManagerMusicTracksByDefault,
    cardKey: "musicTracks",
    nameKey: i18nKey("Settings.CollapseWindowMusicTracksName"),
    hintKey: i18nKey("Settings.CollapseWindowMusicTracksHint"),
  },
  {
    key: SETTING_KEYS.collapseManagerAmbiencePlaylistsByDefault,
    cardKey: "ambiencePlaylists",
    nameKey: i18nKey("Settings.CollapseWindowAmbiencePlaylistsName"),
    hintKey: i18nKey("Settings.CollapseWindowAmbiencePlaylistsHint"),
  },
  {
    key: SETTING_KEYS.collapseManagerAmbienceTracksByDefault,
    cardKey: "ambienceTracks",
    nameKey: i18nKey("Settings.CollapseWindowAmbienceTracksName"),
    hintKey: i18nKey("Settings.CollapseWindowAmbienceTracksHint"),
  },
]);

let appInstance = null;
const managerSectionState = {
  normalization: true,
  files: true,
  music: true,
  ambience: true,
};
const managerUiState = {
  defaultsLoaded: false,
};
const managerCardExpandState = {
  nowPlaying: true,
  musicPlaylists: true,
  musicTracks: true,
  ambiencePlaylists: true,
  ambienceTracks: true,
};
const managerPlaylistExpandState = {};
const managerAmbiencePlaylistExpandState = {};
const managerTrackRootExpandState = {
  music: true,
  ambience: true,
};
const managerPlaylistDragState = {
  source: null,
  kind: null,
  playlistId: null,
  folderId: null,
  trackId: null,
};
const managerTrackFolderDragState = {
  kind: null,
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
  trackFolders: [],
  trackRootName: "",
  ambienceTracks: [],
  ambiencePlaylists: [],
  ambienceTrackFolders: [],
  ambienceTrackRootName: "",
  ambienceAllowConcurrent: false,
  normalizationCache: {},
  normalizationReferences: {
    music: null,
    ambience: null,
  },
};
let storageLoaded = false;
const audioFileCache = new Map();
let sidebarProgressTicker = null;
let ambienceEnvironmentVolumeTicker = null;
let lastAmbienceVolumeFingerprint = null;
const pendingPlaybackSyncRequests = new Map();
const segmentLoopIntervals = new WeakMap();
const normalizationAnalysisCache = new Map();
const normalizationScanState = {
  music: null,
  ambience: null,
};
const sessionNormalizationState = {
  music: {
    displayCurrentDb: null,
    referenceDb: null,
    manualReferenceDb: null,
    displayOriginalDb: null,
    displayTargetDb: null,
  },
  ambience: {
    displayCurrentDb: null,
    referenceDb: null,
    manualReferenceDb: null,
    displayOriginalDb: null,
    displayTargetDb: null,
  },
};

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

function localizedFallback(ruText, enText) {
  return String(game?.i18n?.lang ?? "").toLowerCase().startsWith("ru")
    ? ruText
    : enText;
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

function getBooleanSettingsFormData(settingDefinitions) {
  return settingDefinitions.map(({ key, nameKey, hintKey }) => ({
    key,
    nameKey,
    hintKey,
    value: Boolean(game.settings.get(MODULE_ID, key)),
  }));
}

function buildWindowSettingsGroups() {
  const sectionSettings = new Map(
    getBooleanSettingsFormData(MANAGER_SECTION_COLLAPSE_SETTINGS).map((setting) => [setting.key, setting])
  );
  const cardSettings = new Map(
    getBooleanSettingsFormData(MANAGER_CARD_COLLAPSE_SETTINGS).map((setting) => [setting.key, setting])
  );

  return [
    {
      parent: cardSettings.get(SETTING_KEYS.collapseManagerNowPlayingByDefault),
      children: [],
      hasChildren: false,
    },
    {
      parent: sectionSettings.get(SETTING_KEYS.collapseManagerNormalizationByDefault),
      children: [],
      hasChildren: false,
    },
    {
      parent: sectionSettings.get(SETTING_KEYS.collapseManagerFilesByDefault),
      children: [],
      hasChildren: false,
    },
    {
      parent: sectionSettings.get(SETTING_KEYS.collapseManagerMusicByDefault),
      children: [
        cardSettings.get(SETTING_KEYS.collapseManagerMusicPlaylistsByDefault),
        cardSettings.get(SETTING_KEYS.collapseManagerMusicTracksByDefault),
      ].filter(Boolean),
      hasChildren: true,
    },
    {
      parent: sectionSettings.get(SETTING_KEYS.collapseManagerAmbienceByDefault),
      children: [
        cardSettings.get(SETTING_KEYS.collapseManagerAmbiencePlaylistsByDefault),
        cardSettings.get(SETTING_KEYS.collapseManagerAmbienceTracksByDefault),
      ].filter(Boolean),
      hasChildren: true,
    },
  ].filter((group) => group.parent);
}

async function saveBooleanSettingsFormData(formData, settingDefinitions) {
  const values = foundry.utils.expandObject(formData)?.settings ?? {};
  const getBoolean = (key) => Boolean(values[key]);

  for (const { key } of settingDefinitions) {
    await game.settings.set(MODULE_ID, key, getBoolean(key));
  }
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
    data.settings = getBooleanSettingsFormData(QUICK_PANEL_COLLAPSE_SETTINGS);
    data.saveLabel = t("Common.Save", "Save");
    return data;
  }

  async _updateObject(_event, formData) {
    await saveBooleanSettingsFormData(formData, QUICK_PANEL_COLLAPSE_SETTINGS);
  }
}

class WindowSettingsForm extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-window-settings`,
      classes: ["form", "ts-dj-quick-panel-settings"],
      template: `modules/${MODULE_ID}/templates/quick-panel-settings.hbs`,
      width: 520,
    });
  }

  get title() {
    return t("Settings.WindowMenuTitle", "Window Settings");
  }

  getData(options = {}) {
    const data = super.getData(options);
    data.groupedSettings = buildWindowSettingsGroups();
    data.saveLabel = t("Common.Save", "Save");
    return data;
  }

  async _updateObject(_event, formData) {
    await saveBooleanSettingsFormData(formData, [
      ...MANAGER_SECTION_COLLAPSE_SETTINGS,
      ...MANAGER_CARD_COLLAPSE_SETTINGS,
    ]);
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
  storageState.trackFolders = [];
  storageState.trackRootName = "";
  storageState.ambienceTracks = [];
  storageState.ambiencePlaylists = [];
  storageState.ambienceTrackFolders = [];
  storageState.ambienceTrackRootName = "";
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
    case SOCKET_ACTIONS.seekPlayback:
      await seekCurrentPlayback(payload.timeSec, { sync: false });
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
    trackFolders: [],
    trackRootName: "",
    ambienceTracks: [],
    ambiencePlaylists: [],
    ambienceTrackFolders: [],
    ambienceTrackRootName: "",
    ambienceAllowConcurrent: false,
    normalizationCache: {},
    normalizationReferences: {
      music: null,
      ambience: null,
    },
  };
}

function normalizeNormalizationCacheStore(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const normalized = {};

  for (const [key, value] of Object.entries(source)) {
    const cacheKey = String(key ?? "");
    const numeric = Number(value);
    if (!cacheKey || !Number.isFinite(numeric)) continue;
    normalized[cacheKey] = numeric;
  }

  return normalized;
}

function applyNormalizationCacheStore(cacheStore = {}) {
  normalizationAnalysisCache.clear();
  const normalized = normalizeNormalizationCacheStore(cacheStore);
  for (const [key, value] of Object.entries(normalized)) {
    normalizationAnalysisCache.set(key, value);
  }
  return normalized;
}

function cloneNormalizationCacheStore(cacheStore = null) {
  if (cacheStore && typeof cacheStore === "object") {
    return { ...normalizeNormalizationCacheStore(cacheStore) };
  }

  const cloned = {};
  for (const [key, value] of normalizationAnalysisCache.entries()) {
    const cacheKey = String(key ?? "");
    const numeric = Number(value);
    if (!cacheKey || !Number.isFinite(numeric)) continue;
    cloned[cacheKey] = numeric;
  }
  return cloned;
}

function normalizeNormalizationReferenceStore(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    music: normalizeOptionalDecibel(source.music),
    ambience: normalizeOptionalDecibel(source.ambience),
  };
}

function cloneNormalizationReferenceStore(store = null) {
  const normalized = normalizeNormalizationReferenceStore(store);
  return {
    music: normalized.music,
    ambience: normalized.ambience,
  };
}

function hydrateTrackNormalizationMetadata(tracks = [], files = [], normalizationCache = {}) {
  const normalizedTracks = normalizeArray(tracks).map((entry) => ({ ...entry }));
  const fileMap = new Map(normalizeArray(files).map((file) => [file.id, file?.path ?? ""]));
  const cacheStore = normalizeNormalizationCacheStore(normalizationCache);

  for (const track of normalizedTracks) {
    const filePath = fileMap.get(track?.fileId) ?? "";
    if (!filePath) continue;
    const profileId = getTrackNormalizationScanProfileId(track);

    const storedLoudnessDb = getStoredTrackNormalizationLoudnessDb(track, filePath);
    if (Number.isFinite(storedLoudnessDb)) {
      track.normalizationScanProfile = profileId;
      continue;
    }

    const cacheKey = getTrackNormalizationCacheKeyForProfile(track, filePath, profileId);
    const cachedValue = Number(cacheStore[cacheKey]);
    if (!Number.isFinite(cachedValue)) continue;

    track.normalizationAnalysisVersion = NORMALIZATION_ANALYSIS_VERSION;
    track.normalizationScanProfile = profileId;
    track.normalizationCacheKey = cacheKey;
    track.normalizationLoudnessDb = cachedValue;
  }

  return normalizedTracks;
}

function normalizeStorageData(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const files = normalizeArray(source.files);
  const normalizationCache = normalizeNormalizationCacheStore(source.normalizationCache);
  const normalizationReferences = normalizeNormalizationReferenceStore(source.normalizationReferences);
  const trackFolders = normalizeArray(source.trackFolders).map((entry) => normalizeTrackFolderEntry(entry));
  const ambienceTrackFolders = normalizeArray(source.ambienceTrackFolders).map((entry) => normalizeTrackFolderEntry(entry));
  const tracks = hydrateTrackNormalizationMetadata(source.tracks, files, normalizationCache);
  const ambienceTracks = hydrateTrackNormalizationMetadata(source.ambienceTracks, files, normalizationCache);
  return {
    files,
    tracks: tracks.map((track) => ({
      ...track,
      folderId: normalizeTrackFolderId(track.folderId, trackFolders),
    })),
    playlists: normalizeArray(source.playlists).map((entry) => normalizeMusicPlaylistEntry(entry)),
    trackFolders,
    trackRootName: normalizeTrackRootName(source.trackRootName),
    ambienceTracks: ambienceTracks.map((track) => ({
      ...track,
      folderId: normalizeTrackFolderId(track.folderId, ambienceTrackFolders),
    })),
    ambiencePlaylists: normalizeArray(source.ambiencePlaylists),
    ambienceTrackFolders,
    ambienceTrackRootName: normalizeTrackRootName(source.ambienceTrackRootName),
    ambienceAllowConcurrent: Boolean(source.ambienceAllowConcurrent),
    normalizationCache,
    normalizationReferences,
  };
}

function cloneStorageData(data = storageState) {
  return {
    files: normalizeArray(data.files).map((entry) => ({ ...entry })),
    tracks: normalizeArray(data.tracks).map((entry) => ({ ...entry })),
    playlists: normalizeArray(data.playlists).map((entry) => cloneMusicPlaylistEntry(entry)),
    trackFolders: normalizeArray(data.trackFolders).map((entry) => ({ ...entry })),
    trackRootName: normalizeTrackRootName(data.trackRootName),
    ambienceTracks: normalizeArray(data.ambienceTracks).map((entry) => ({ ...entry })),
    ambiencePlaylists: normalizeArray(data.ambiencePlaylists).map((entry) => ({ ...entry, trackIds: normalizeArray(entry.trackIds) })),
    ambienceTrackFolders: normalizeArray(data.ambienceTrackFolders).map((entry) => ({ ...entry })),
    ambienceTrackRootName: normalizeTrackRootName(data.ambienceTrackRootName),
    ambienceAllowConcurrent: Boolean(data.ambienceAllowConcurrent),
    normalizationCache: cloneNormalizationCacheStore(),
    normalizationReferences: cloneNormalizationReferenceStore(data.normalizationReferences),
  };
}

function applyStorageData(next) {
  const normalized = normalizeStorageData(next);
  storageState.files = normalized.files;
  storageState.tracks = normalized.tracks;
  storageState.playlists = normalized.playlists;
  storageState.trackFolders = normalized.trackFolders;
  storageState.trackRootName = normalized.trackRootName;
  storageState.ambienceTracks = normalized.ambienceTracks;
  storageState.ambiencePlaylists = normalized.ambiencePlaylists;
  storageState.ambienceTrackFolders = normalized.ambienceTrackFolders;
  storageState.ambienceTrackRootName = normalized.ambienceTrackRootName;
  storageState.ambienceAllowConcurrent = normalized.ambienceAllowConcurrent;
  storageState.normalizationCache = applyNormalizationCacheStore(normalized.normalizationCache);
  storageState.normalizationReferences = cloneNormalizationReferenceStore(normalized.normalizationReferences);
  applyStoredNormalizationReferences(storageState.normalizationReferences, { refresh: false });
  storageLoaded = true;
}

function getNormalizationChannelKey(channel) {
  return String(channel ?? "music").toLowerCase() === "ambience"
    ? "ambience"
    : "music";
}

function getSessionNormalizationReferenceDb(channel) {
  const key = getNormalizationChannelKey(channel);
  const raw = sessionNormalizationState[key]?.referenceDb;
  const value = raw === null || raw === undefined || raw === ""
    ? null
    : Number(raw);
  return Number.isFinite(value) ? value : null;
}

function getSessionManualNormalizationReferenceDb(channel) {
  const key = getNormalizationChannelKey(channel);
  const raw = sessionNormalizationState[key]?.manualReferenceDb;
  const value = raw === null || raw === undefined || raw === ""
    ? null
    : Number(raw);
  return Number.isFinite(value) ? value : null;
}

function normalizeOptionalDecibel(value) {
  const raw = value;
  const numeric = raw === null || raw === undefined || raw === "" || typeof raw === "boolean"
    ? null
    : Number(raw);
  return Number.isFinite(numeric) ? numeric : null;
}

function setSessionNormalizationReferenceDb(channel, value, { refresh = true } = {}) {
  const key = getNormalizationChannelKey(channel);
  sessionNormalizationState[key].referenceDb = normalizeOptionalDecibel(value);
  if (refresh) {
    refreshLiveControlsUi();
  }
}

function setSessionManualNormalizationReferenceDb(channel, value, { refresh = true } = {}) {
  const key = getNormalizationChannelKey(channel);
  sessionNormalizationState[key].manualReferenceDb = normalizeOptionalDecibel(value);
  if (refresh) {
    refreshLiveControlsUi();
  }
}

function getSessionNormalizationDisplay(channel) {
  const key = getNormalizationChannelKey(channel);
  return {
    currentDb: normalizeOptionalDecibel(sessionNormalizationState[key]?.displayCurrentDb),
    originalDb: normalizeOptionalDecibel(sessionNormalizationState[key]?.displayOriginalDb),
    targetDb: normalizeOptionalDecibel(sessionNormalizationState[key]?.displayTargetDb),
  };
}

function setSessionNormalizationDisplay(channel, {
  currentDb = undefined,
  originalDb = undefined,
  targetDb = undefined,
} = {}, { refresh = true } = {}) {
  const key = getNormalizationChannelKey(channel);
  if (currentDb !== undefined) {
    sessionNormalizationState[key].displayCurrentDb = normalizeOptionalDecibel(currentDb);
  }
  if (originalDb !== undefined) {
    sessionNormalizationState[key].displayOriginalDb = normalizeOptionalDecibel(originalDb);
  }
  if (targetDb !== undefined) {
    sessionNormalizationState[key].displayTargetDb = normalizeOptionalDecibel(targetDb);
  }
  if (refresh) {
    refreshLiveControlsUi();
  }
}

function applyStoredNormalizationReference(channel, referenceDb, { refresh = true } = {}) {
  const channelKey = getNormalizationChannelKey(channel);
  const normalizedReferenceDb = normalizeOptionalDecibel(referenceDb);

  setSessionManualNormalizationReferenceDb(channelKey, normalizedReferenceDb, { refresh: false });
  setSessionNormalizationReferenceDb(channelKey, normalizedReferenceDb, { refresh: false });

  if (channelKey === "music") {
    const current = playbackState.current;
    if (Number.isFinite(normalizedReferenceDb)) {
      if (current?.normalizationEnabled && Number.isFinite(current.normalizationDb)) {
        const normalized = calculateNormalizationGain("music", current.normalizationDb);
        current.normalizationGain = normalized.gain;
        setSessionNormalizationDisplay("music", {
          currentDb: getAppliedNormalizationDb(current.normalizationDb, normalized.gain),
          originalDb: current.normalizationDb,
          targetDb: normalized.referenceDb,
        }, { refresh: false });
        applyMusicVolumeToCurrentPlayback({ force: true });
      } else {
        setSessionNormalizationDisplay("music", {
          currentDb: null,
          originalDb: Number.isFinite(current?.normalizationDb) ? current.normalizationDb : null,
          targetDb: normalizedReferenceDb,
        }, { refresh: false });
      }
    } else {
      if (current?.normalizationEnabled) {
        current.normalizationGain = 1;
        applyMusicVolumeToCurrentPlayback({ force: true });
      }
      setSessionNormalizationDisplay("music", {
        currentDb: null,
        originalDb: null,
        targetDb: null,
      }, { refresh: false });
    }
  } else {
    let displayEntry = null;
    for (const entry of ambienceState.active.values()) {
      if (!entry?.normalizationEnabled || !Number.isFinite(entry.normalizationDb)) continue;
      const normalized = Number.isFinite(normalizedReferenceDb)
        ? calculateNormalizationGain("ambience", entry.normalizationDb)
        : { gain: 1, referenceDb: null };
      entry.normalizationGain = normalized.gain;
      displayEntry = entry;
    }

    if (Number.isFinite(normalizedReferenceDb)) {
      if (displayEntry) {
        const normalized = calculateNormalizationGain("ambience", displayEntry.normalizationDb);
        setSessionNormalizationDisplay("ambience", {
          currentDb: getAppliedNormalizationDb(displayEntry.normalizationDb, normalized.gain),
          originalDb: displayEntry.normalizationDb,
          targetDb: normalized.referenceDb,
        }, { refresh: false });
        applyEnvironmentVolumeToActiveAmbience({ force: true });
      } else {
        setSessionNormalizationDisplay("ambience", {
          currentDb: null,
          originalDb: null,
          targetDb: normalizedReferenceDb,
        }, { refresh: false });
      }
    } else {
      if (ambienceState.active.size > 0) {
        applyEnvironmentVolumeToActiveAmbience({ force: true });
      }
      setSessionNormalizationDisplay("ambience", {
        currentDb: null,
        originalDb: null,
        targetDb: null,
      }, { refresh: false });
    }
  }

  if (refresh) {
    refreshLiveControlsUi();
  }
}

function applyStoredNormalizationReferences(referenceStore = {}, { refresh = true } = {}) {
  const normalized = normalizeNormalizationReferenceStore(referenceStore);
  applyStoredNormalizationReference("music", normalized.music, { refresh: false });
  applyStoredNormalizationReference("ambience", normalized.ambience, { refresh: false });
  if (refresh) {
    refreshLiveControlsUi();
  }
}

function clearSessionNormalizationState({ refresh = true } = {}) {
  sessionNormalizationState.music.referenceDb = null;
  sessionNormalizationState.music.manualReferenceDb = null;
  sessionNormalizationState.ambience.referenceDb = null;
  sessionNormalizationState.ambience.manualReferenceDb = null;
  sessionNormalizationState.music.displayCurrentDb = null;
  sessionNormalizationState.music.displayOriginalDb = null;
  sessionNormalizationState.music.displayTargetDb = null;
  sessionNormalizationState.ambience.displayCurrentDb = null;
  sessionNormalizationState.ambience.displayOriginalDb = null;
  sessionNormalizationState.ambience.displayTargetDb = null;
  if (refresh) {
    refreshLiveControlsUi();
  }
}

function getSessionNormalizationSnapshot() {
  return {
    musicReferenceDb: getSessionNormalizationReferenceDb("music"),
    musicManualReferenceDb: getSessionManualNormalizationReferenceDb("music"),
    ambienceReferenceDb: getSessionNormalizationReferenceDb("ambience"),
    ambienceManualReferenceDb: getSessionManualNormalizationReferenceDb("ambience"),
    musicDisplayCurrentDb: getSessionNormalizationDisplay("music").currentDb,
    musicDisplayOriginalDb: getSessionNormalizationDisplay("music").originalDb,
    musicDisplayTargetDb: getSessionNormalizationDisplay("music").targetDb,
    ambienceDisplayCurrentDb: getSessionNormalizationDisplay("ambience").currentDb,
    ambienceDisplayOriginalDb: getSessionNormalizationDisplay("ambience").originalDb,
    ambienceDisplayTargetDb: getSessionNormalizationDisplay("ambience").targetDb,
  };
}

function applySessionNormalizationSnapshot(snapshot = {}) {
  if (!snapshot || typeof snapshot !== "object") return;
  setSessionNormalizationReferenceDb("music", snapshot.musicReferenceDb, { refresh: false });
  setSessionManualNormalizationReferenceDb("music", snapshot.musicManualReferenceDb, { refresh: false });
  setSessionNormalizationReferenceDb("ambience", snapshot.ambienceReferenceDb, { refresh: false });
  setSessionManualNormalizationReferenceDb("ambience", snapshot.ambienceManualReferenceDb, { refresh: false });
  setSessionNormalizationDisplay("music", {
    currentDb: snapshot.musicDisplayCurrentDb,
    originalDb: snapshot.musicDisplayOriginalDb,
    targetDb: snapshot.musicDisplayTargetDb,
  }, { refresh: false });
  setSessionNormalizationDisplay("ambience", {
    currentDb: snapshot.ambienceDisplayCurrentDb,
    originalDb: snapshot.ambienceDisplayOriginalDb,
    targetDb: snapshot.ambienceDisplayTargetDb,
  }, { refresh: false });
  refreshLiveControlsUi();
}

function isTrackNormalizationEnabled(track) {
  return track?.normalize !== false;
}

function formatMilliHertz(value) {
  const raw = value;
  const numeric = raw === null || raw === undefined || raw === ""
    ? null
    : Number(raw);
  if (!Number.isFinite(numeric)) return "-";
  const linear = Math.pow(10, numeric / 20);
  if (!Number.isFinite(linear) || linear <= 0) return "-";
  const milliValue = linear * 1000;
  if (milliValue < 0.001) return "<0.001 mHz";
  if (milliValue < 1) return `${milliValue.toFixed(3)} mHz`;
  if (milliValue < 10) return `${milliValue.toFixed(2)} mHz`;
  if (milliValue < 100) return `${milliValue.toFixed(1)} mHz`;
  return `${Math.round(milliValue)} mHz`;
}

function formatCompactMilliHertz(value) {
  const milliHertz = decibelToMilliHertz(value);
  if (!Number.isFinite(milliHertz) || milliHertz <= 0) return "-";

  if (milliHertz < 0.001) return "0,001";

  const decimals = milliHertz < 1
    ? 3
    : milliHertz < 10
      ? 2
      : milliHertz < 100
        ? 1
        : 0;
  const text = decimals > 0
    ? milliHertz.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "")
    : String(Math.round(milliHertz));
  return text.replace(".", ",");
}

function decibelToMilliHertz(value) {
  const numeric = normalizeOptionalDecibel(value);
  if (!Number.isFinite(numeric)) return null;
  const linear = Math.pow(10, numeric / 20);
  if (!Number.isFinite(linear) || linear <= 0) return null;
  return linear * 1000;
}

function formatMilliHertzInputValue(value) {
  const milliHertz = decibelToMilliHertz(value);
  if (!Number.isFinite(milliHertz) || milliHertz <= 0) return "";
  if (milliHertz < 1) return milliHertz.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  if (milliHertz < 10) return milliHertz.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  if (milliHertz < 100) return milliHertz.toFixed(1).replace(/0+$/, "").replace(/\.$/, "");
  return String(Math.round(milliHertz));
}

function formatManualNormalizationInputValue(channel) {
  const value = formatMilliHertzInputValue(getSessionManualNormalizationReferenceDb(channel));
  return value || "";
}

function getNormalizationScanProfile(profileId = null) {
  const normalized = String(profileId ?? "").trim().toLowerCase();
  return NORMALIZATION_SCAN_PROFILES[normalized] ?? NORMALIZATION_SCAN_PROFILES[DEFAULT_NORMALIZATION_SCAN_PROFILE];
}

function getTrackNormalizationScanProfileId(track = null) {
  return getNormalizationScanProfile(track?.normalizationScanProfile).id;
}

function getNormalizationScanProfileLabel(profileId) {
  const profile = getNormalizationScanProfile(profileId);
  switch (profile.id) {
    case "shallow":
      return t("App.NormalizationScanShallow", localizedFallback("Поверхностный скан", "Shallow scan"));
    case "deep":
      return t("App.NormalizationScanDeep", localizedFallback("Глубокий скан", "Deep scan"));
    default:
      return t("App.NormalizationScanNormal", localizedFallback("Нормальный скан", "Normal scan"));
  }
}

function getNormalizationScanButtonLabel(channel, profileId = DEFAULT_NORMALIZATION_SCAN_PROFILE) {
  const channelKey = getNormalizationChannelKey(channel);
  const profile = getNormalizationScanProfile(profileId);
  if (normalizationScanState[channelKey] === profile.id) {
    return t("Common.Scanning", localizedFallback("Сканирование...", "Scanning..."));
  }
  return getNormalizationScanProfileLabel(profile.id);
}

function isNormalizationScanRunning(channel) {
  const channelKey = getNormalizationChannelKey(channel);
  return Boolean(normalizationScanState[channelKey]);
}

function getNormalizationScanButtons(channel) {
  const channelKey = getNormalizationChannelKey(channel);
  const disabled = isNormalizationScanRunning(channelKey);
  return NORMALIZATION_SCAN_PROFILE_ORDER.map((profileId) => ({
    mode: profileId,
    label: getNormalizationScanButtonLabel(channelKey, profileId),
    disabled,
  }));
}

function getNormalizationScanButtonLabelLegacy(channel) {
  const channelKey = getNormalizationChannelKey(channel);
  if (normalizationScanState[channelKey]) {
    return t("Common.Scanning", localizedFallback("Сканирование...", "Scanning..."));
  }
  return channelKey === "ambience"
    ? t("App.ScanAmbienceNormalization", localizedFallback("Скан треков эмбиенса", "Scan ambience tracks"))
    : t("App.ScanMusicNormalization", localizedFallback("Скан треков музыки", "Scan music tracks"));
}

function parseMilliHertzInput(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 ? value : null;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.toLowerCase().replace(/mhz/g, "").replace(",", ".").trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;

  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function milliHertzToDecibel(value) {
  const milliHertz = parseMilliHertzInput(value);
  if (!Number.isFinite(milliHertz) || milliHertz <= 0) return null;
  return 20 * Math.log10(milliHertz / 1000);
}

function getAppliedNormalizationDb(originalDb, gain = 1) {
  const safeOriginalDb = normalizeOptionalDecibel(originalDb);
  const safeGain = normalizeGain(gain, 1);
  if (!Number.isFinite(safeOriginalDb) || !(safeGain > 0)) return null;
  return safeOriginalDb + (20 * Math.log10(safeGain));
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
    normalization: getSessionNormalizationSnapshot(),
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
  applySessionNormalizationSnapshot(snapshot.normalization);

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
  game.settings.registerMenu(MODULE_ID, "windowSettings", {
    name: i18nKey("Settings.WindowMenuName"),
    label: i18nKey("Settings.WindowMenuLabel"),
    hint: i18nKey("Settings.WindowMenuHint"),
    icon: "fa-solid fa-window-maximize",
    type: WindowSettingsForm,
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

  const registerManagerDefaultCollapseSetting = (key, name, hint) => {
    game.settings.register(MODULE_ID, key, {
      name,
      hint,
      scope: "client",
      config: false,
      type: Boolean,
      default: false,
      onChange: () => {
        managerUiState.defaultsLoaded = false;
        if (appInstance?.rendered) {
          appInstance.render(false);
        }
      },
    });
  };

  for (const { key, nameKey, hintKey } of [...MANAGER_SECTION_COLLAPSE_SETTINGS, ...MANAGER_CARD_COLLAPSE_SETTINGS]) {
    registerManagerDefaultCollapseSetting(key, nameKey, hintKey);
  }
}

function initializeSidebarUiStateFromSettings() {
  if (sidebarUiState.defaultsLoaded) return;

  sidebarUiState.rateCollapsed = Boolean(game.settings.get(MODULE_ID, SETTING_KEYS.collapseGlobalVolumeByDefault));
  sidebarUiState.quickPanelCollapsed = Boolean(game.settings.get(MODULE_ID, SETTING_KEYS.collapseTsDjPlaylistsByDefault));
  sidebarUiState.nativePlaylistsCollapsed = Boolean(game.settings.get(MODULE_ID, SETTING_KEYS.collapseFoundryPlaylistsByDefault));
  sidebarUiState.defaultsLoaded = true;
}

function initializeManagerSectionStateFromSettings() {
  if (managerUiState.defaultsLoaded) return;

  for (const { key, sectionKey } of MANAGER_SECTION_COLLAPSE_SETTINGS) {
    managerSectionState[sectionKey] = !Boolean(game.settings.get(MODULE_ID, key));
  }
  for (const { key, cardKey } of MANAGER_CARD_COLLAPSE_SETTINGS) {
    managerCardExpandState[cardKey] = !Boolean(game.settings.get(MODULE_ID, key));
  }

  managerUiState.defaultsLoaded = true;
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

function getVolumeIconClass(volume) {
  const normalized = normalizeVolume(volume);
  if (normalized <= 0) return "fa-volume-xmark";
  if (normalized < 0.5) return "fa-volume-low";
  return "fa-volume-high";
}

function getSidebarLiveControlRoot(root = null) {
  const candidate = root instanceof HTMLElement ? root : getRoot(ui.playlists?.element);
  if (!(candidate instanceof HTMLElement)) return null;
  if (candidate.classList.contains(`${MODULE_ID}-sidebar-rate`)) return candidate;
  return candidate.querySelector(`.${MODULE_ID}-sidebar-rate`);
}

function syncSidebarRangeControl(root, controlKey, value, format, { iconFromValue = null } = {}) {
  const input = root.querySelector(`[data-live-control='${controlKey}']`);
  if (input instanceof HTMLInputElement && document.activeElement !== input) {
    input.value = String(value);
  }

  const label = root.querySelector(`[data-live-control-value='${controlKey}']`);
  if (label) {
    label.textContent = format(value);
  }

  const icon = root.querySelector(`[data-live-control-icon='${controlKey}']`);
  if (icon && typeof iconFromValue === "function") {
    icon.classList.remove("fa-volume-xmark", "fa-volume-low", "fa-volume-high");
    icon.classList.add(iconFromValue(value));
  }
}

function syncSidebarMonitorControl(root, monitorKey, value) {
  const monitor = root.querySelector(`[data-live-monitor='${monitorKey}']`);
  if (!monitor) return;

  if (value && typeof value === "object") {
    const source = monitor.querySelector("[data-live-monitor-part='source']");
    const target = monitor.querySelector("[data-live-monitor-part='target']");
    if (source) source.textContent = String(value.source ?? "");
    if (target) target.textContent = String(value.target ?? "");
    return;
  }

  monitor.textContent = String(value ?? "");
}

function syncSidebarLiveControls(root = null) {
  const sidebarRoot = getSidebarLiveControlRoot(root);
  if (!(sidebarRoot instanceof HTMLElement)) return false;

  syncSidebarRangeControl(sidebarRoot, "rate", getLiveRate(), formatRate);
  syncSidebarMonitorControl(sidebarRoot, "music", getNormalizationMonitorParts("music"));
  syncSidebarMonitorControl(sidebarRoot, "ambience", getNormalizationMonitorParts("ambience"));
  syncSidebarRangeControl(sidebarRoot, "music-volume", getLiveMusicVolume(), formatVolumePercent, {
    iconFromValue: getVolumeIconClass,
  });
  syncSidebarRangeControl(sidebarRoot, "ambience-volume", getLiveAmbienceVolume(), formatVolumePercent, {
    iconFromValue: getVolumeIconClass,
  });

  return true;
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

  const addControlRow = ({
    labelText,
    min,
    max,
    step,
    value,
    format,
    onInput,
    container,
    showValue = true,
    iconFromValue = null,
    controlKey = null,
  }) => {
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
    if (controlKey) {
      input.dataset.liveControl = controlKey;
    }

    let icon = null;
    if (typeof iconFromValue === "function") {
      icon = document.createElement("i");
      icon.classList.add("volume-icon", "fa-fw", "fa-solid");
      icon.classList.add(iconFromValue(Number(input.value)));
      if (controlKey) {
        icon.dataset.liveControlIcon = controlKey;
      }
    }

    let valueLabel = null;
    if (showValue) {
      valueLabel = document.createElement("span");
      valueLabel.classList.add("value");
      valueLabel.textContent = format(Number(input.value));
      if (controlKey) {
        valueLabel.dataset.liveControlValue = controlKey;
      }
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

  const addMonitorRow = ({ labelText, valueText, container, monitorKey = null }) => {
    const row = document.createElement("div");
    row.classList.add("monitor-row");

    const label = document.createElement("label");
    label.textContent = labelText;
    label.title = labelText;

    const value = document.createElement("span");
    value.classList.add("monitor-value");
    if (monitorKey) {
      value.dataset.liveMonitor = monitorKey;
    }

    const source = document.createElement("span");
    source.classList.add("monitor-value-source");
    source.dataset.liveMonitorPart = "source";

    const arrow = document.createElement("span");
    arrow.classList.add("monitor-value-arrow");
    arrow.textContent = "->";

    const target = document.createElement("span");
    target.classList.add("monitor-value-target");
    target.dataset.liveMonitorPart = "target";

    if (valueText && typeof valueText === "object") {
      source.textContent = String(valueText.source ?? "");
      target.textContent = String(valueText.target ?? "");
    } else {
      source.textContent = String(valueText ?? "");
      target.textContent = "";
    }

    value.append(source, arrow, target);

    row.append(label, value);
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
    controlKey: "rate",
  });

  addMonitorRow({
    labelText: t("App.MusicNormalization", localizedFallback("РќРѕСЂРј. РјСѓР·С‹РєРё:", "Norm. music:")),
    valueText: getNormalizationMonitorParts("music"),
    container: speedBody,
    monitorKey: "music",
  });

  addMonitorRow({
    labelText: t("App.AmbienceNormalization", localizedFallback("РќРѕСЂРј. СЌРјР±РёРµРЅСЃР°:", "Norm. ambience:")),
    valueText: getNormalizationMonitorParts("ambience"),
    container: speedBody,
    monitorKey: "ambience",
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
    controlKey: "music-volume",
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
    controlKey: "ambience-volume",
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
      const validTrackIds = getMusicPlaylistOrderedTrackIds(playlist, new Set(trackMap.keys()));
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
      playlist: untitledName(playlist?.name),
      track: untitledName(currentTrack?.name),
      paused: pausedMark,
    }, ({ playlist: currentPlaylist, track, paused }) => `Playing playlist: ${currentPlaylist} | ${track}${paused}`);
  }

  return tf("Sidebar.NowPlayingTrack", {
    track: untitledName(currentTrack?.name),
    paused: pausedMark,
  }, ({ track, paused }) => `Playing track: ${track}${paused}`);
}

function getCurrentPlaybackLabelForManager(tracks, playlists) {
  if (!playbackState.current) return t("Status.Stopped", "Stopped");

  const currentTrack = tracks.find((track) => track.id === playbackState.current.trackId);
  if (playbackState.current.mode === "playlist") {
    const playlist = playlists.find((entry) => entry.id === playbackState.current.playlistId);
    return tf("Status.ManagerPlaylist", {
      playlist: untitledName(playlist?.name),
      track: untitledName(currentTrack?.name),
    }, ({ playlist: currentPlaylist, track }) => `Playlist: ${currentPlaylist} | Track: ${track}`);
  }

  return tf("Status.ManagerTrack", { track: untitledName(currentTrack?.name) }, ({ track }) => `Track: ${track}`);
}

function getManagerNowPlayingDetails(tracks = getTracks(), playlists = getPlaylists(), files = getFiles()) {
  const current = playbackState.current;
  const liveMusicVolume = getLiveMusicVolume();
  const liveRate = getLiveRate();
  const summary = getCurrentPlaybackLabelForManager(tracks, playlists);

  if (!current) {
    return {
      active: false,
      summary,
      title: t("Status.NothingPlaying", localizedFallback("Ничего не играет", "Nothing playing")),
      context: t(
        "Status.NothingPlayingHint",
        localizedFallback("Запустите трек или плейлист в секциях ниже.", "Start a track or playlist from the sections below."),
      ),
      stateLabel: t("Status.Stopped", "Stopped"),
      sourceName: t("Common.Empty", "Empty"),
      sourcePath: "-",
      volumePrimary: formatVolumePercent(liveMusicVolume),
      volumeSecondary: localizedFallback("текущая live-громкость", "current live volume"),
      hertzPrimary: t("Common.Off", "off"),
      hertzSecondary: localizedFallback("нормализация не активна", "normalization inactive"),
      speedPrimary: `${formatRate(liveRate)}x`,
      speedSecondary: localizedFallback("текущая live-скорость", "current live speed"),
      clipLabel: "-",
      progressLabel: "-",
      progressPercent: 0,
      canSeek: false,
    };
  }

  const track = tracks.find((entry) => entry.id === current.trackId) ?? null;
  const playlist = current.mode === "playlist"
    ? playlists.find((entry) => entry.id === current.playlistId) ?? null
    : null;
  const file = track?.fileId
    ? files.find((entry) => entry.id === track.fileId) ?? null
    : null;

  const rawPath = String(file?.path ?? "");
  const sourcePath = decodePathForDisplay(rawPath) || rawPath || "-";
  const sourcePathParts = sourcePath.split(/[\\/]/).filter(Boolean);
  const sourceName = untitledName(
    file?.name
      ?? sourcePathParts[sourcePathParts.length - 1]
      ?? t("Common.FileMissingShort", "File?"),
  );

  const progress = track ? getTrackProgressForSidebar(track) : null;
  const progressPercent = progress?.maxSeconds
    ? clampNumber((progress.nowSeconds / progress.maxSeconds) * 100, 0, 100)
    : 0;
  const seekState = getCurrentPlaybackSeekState(current);
  const clipStart = seekState?.clipStart ?? 0;
  const clipEnd = seekState?.clipEnd ?? null;

  const effectiveVolume = getEffectiveMusicVolume({
    liveMusicVolume,
    normalizationGain: current.normalizationGain,
  });
  const defaultRate = normalizeRate(Number(track?.rate ?? current.defaultRate ?? 1));
  const appliedRate = normalizeRate(Number(current.timingRate ?? defaultRate));
  const targetDb = getSessionNormalizationReferenceDb("music");
  const hasNormalization = Boolean(current.normalizationEnabled) && Number.isFinite(current.normalizationDb);

  const contextParts = [];
  if (playlist) {
    contextParts.push(`${t("Common.Playlist", "Playlist")}: ${untitledName(playlist.name)}`);
  } else {
    contextParts.push(t("Common.Track", "Track"));
  }
  if (current.mode === "playlist" && Array.isArray(current.queue) && current.queue.length) {
    contextParts.push(`${Math.max(1, Number(current.index ?? 0) + 1)}/${current.queue.length}`);
  }
  if (current.paused) {
    contextParts.push(t("Status.Paused", localizedFallback("Пауза", "Paused")));
  }

  return {
    active: true,
    summary,
    title: untitledName(track?.name),
    context: contextParts.join(" | "),
    stateLabel: current.paused
      ? t("Status.Paused", localizedFallback("Пауза", "Paused"))
      : t("Status.Playing", localizedFallback("Играет", "Playing")),
    sourceName,
    sourcePath,
    volumePrimary: `${formatVolumePercent(liveMusicVolume)} / ${formatVolumePercent(effectiveVolume)}`,
    volumeSecondary: localizedFallback("live / итоговая", "live / final"),
    hertzPrimary: hasNormalization
      ? Number.isFinite(targetDb)
        ? `${formatCompactMilliHertz(current.normalizationDb)} -> ${formatCompactMilliHertz(targetDb)} mHz`
        : `${formatCompactMilliHertz(current.normalizationDb)} mHz`
      : t("Common.Off", "off"),
    hertzSecondary: hasNormalization
      ? localizedFallback("текущие / целевые", "current / target")
      : localizedFallback("нормализация выключена", "normalization off"),
    speedPrimary: `${formatRate(defaultRate)}x / ${formatRate(liveRate)}x / ${formatRate(appliedRate)}x`,
    speedSecondary: localizedFallback("трек / live / итоговая", "track / live / final"),
    clipLabel: `${formatDurationClock(clipStart)} - ${Number.isFinite(clipEnd) ? formatDurationClock(clipEnd) : "--:--"}`,
    progressLabel: progress?.label ?? "-",
    progressPercent,
    canSeek: Boolean(seekState?.canSeek),
  };
}

function syncManagerNowPlayingUi(root, details = getManagerNowPlayingDetails()) {
  const card = root.querySelector("[data-now-playing]");
  if (!(card instanceof HTMLElement)) return;

  card.classList.toggle("is-active", Boolean(details.active));
  card.classList.toggle("is-idle", !details.active);

  syncManagerTextControl(root, "[data-now-playing-summary]", details.summary);
  syncManagerTextControl(root, "[data-now-playing-title]", details.title);
  syncManagerTextControl(root, "[data-now-playing-context]", details.context);
  syncManagerTextControl(root, "[data-now-playing-state]", details.stateLabel);
  syncManagerTextControl(root, "[data-now-playing-source-name]", details.sourceName);
  syncManagerTextControl(root, "[data-now-playing-source-path]", details.sourcePath);
  syncManagerTextControl(root, "[data-now-playing-volume-primary]", details.volumePrimary);
  syncManagerTextControl(root, "[data-now-playing-volume-secondary]", details.volumeSecondary);
  syncManagerTextControl(root, "[data-now-playing-hertz-primary]", details.hertzPrimary);
  syncManagerTextControl(root, "[data-now-playing-hertz-secondary]", details.hertzSecondary);
  syncManagerTextControl(root, "[data-now-playing-speed-primary]", details.speedPrimary);
  syncManagerTextControl(root, "[data-now-playing-speed-secondary]", details.speedSecondary);
  syncManagerTextControl(root, "[data-now-playing-clip]", details.clipLabel);
  syncManagerTextControl(root, "[data-now-playing-progress-label]", details.progressLabel);

  const progressFill = root.querySelector("[data-now-playing-progress-fill]");
  if (progressFill instanceof HTMLElement) {
    progressFill.style.width = `${details.progressPercent}%`;
  }

  const progressBar = root.querySelector("[data-now-playing-progress-bar]");
  if (progressBar instanceof HTMLElement) {
    progressBar.classList.toggle("is-seekable", Boolean(details.canSeek));
    progressBar.setAttribute("aria-disabled", details.canSeek ? "false" : "true");
  }

  const status = root.querySelector(".ts-dj-now-playing-actions");
  if (status instanceof HTMLElement) {
    let stopButton = status.querySelector("button[data-action='stop']");
    if (details.active) {
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
}

function getManagerCardTemplateState() {
  return {
    nowPlaying: {
      expanded: Boolean(managerCardExpandState.nowPlaying),
    },
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
  const nowPlaying = getManagerNowPlayingDetails(tracks, playlists, getFiles());
  syncManagerNowPlayingUi(root, nowPlaying);

  syncManagerRangeControl(root, "[data-action='set-live-rate']", ".ts-dj-live-rate-value", getLiveRate(), formatRate);
  syncManagerTextControl(root, "[data-normalization-label='music']", t("App.MusicNormalization", localizedFallback("РќРѕСЂРј. РјСѓР·С‹РєРё:", "Norm. music:")));
  syncManagerTextControl(root, "[data-normalization-label='ambience']", t("App.AmbienceNormalization", localizedFallback("РќРѕСЂРј. СЌРјР±РёРµРЅСЃР°:", "Norm. ambience:")));
  syncManagerTextControl(root, "[data-normalization-monitor='music']", getNormalizationMonitorLabel("music"));
  syncManagerTextControl(root, "[data-normalization-monitor='ambience']", getNormalizationMonitorLabel("ambience"));
  syncManagerInputControl(root, "[data-normalization-input='music']", formatManualNormalizationInputValue("music"));
  syncManagerInputControl(root, "[data-normalization-input='ambience']", formatManualNormalizationInputValue("ambience"));
  for (const profileId of NORMALIZATION_SCAN_PROFILE_ORDER) {
    syncManagerButtonControl(root, `[data-normalization-scan-button='music'][data-normalization-scan-profile='${profileId}']`, {
      label: getNormalizationScanButtonLabel("music", profileId),
      disabled: isNormalizationScanRunning("music"),
    });
    syncManagerButtonControl(root, `[data-normalization-scan-button='ambience'][data-normalization-scan-profile='${profileId}']`, {
      label: getNormalizationScanButtonLabel("ambience", profileId),
      disabled: isNormalizationScanRunning("ambience"),
    });
  }
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

function syncManagerTextControl(root, selector, value) {
  const target = root.querySelector(selector);
  if (target) {
    target.textContent = String(value ?? "");
  }
}

function syncManagerInputControl(root, selector, value) {
  const input = root.querySelector(selector);
  if (!(input instanceof HTMLInputElement)) return;
  if (document.activeElement === input) return;
  input.value = String(value ?? "");
}

function syncManagerButtonControl(root, selector, {
  label = null,
  disabled = null,
} = {}) {
  const button = root.querySelector(selector);
  if (!(button instanceof HTMLButtonElement)) return;
  if (label !== null) {
    button.textContent = String(label);
  }
  if (disabled !== null) {
    button.disabled = Boolean(disabled);
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
  const safeGain = clampNumber(Number(volume) || 0, 0, MAX_SOUND_GAIN);
  const safeMediaVolume = clampNumber(safeGain, 0, 1);

  try {
    sound.volume = safeMediaVolume;
  } catch (_error) {
    // no-op
  }

  try {
    if (sound.element && typeof sound.element.volume === "number") {
      sound.element.volume = safeMediaVolume;
    }
  } catch (_error) {
    // no-op
  }

  try {
    const node = sound.sourceNode;
    if (!node?.gain) return;

    if (typeof node.gain.value === "number") {
      node.gain.value = safeGain;
      return;
    }

    const currentTime = Number(sound.context?.currentTime ?? 0);
    if (typeof node.gain.setValueAtTime === "function" && Number.isFinite(currentTime)) {
      node.gain.setValueAtTime(safeGain, currentTime);
    }
  } catch (_error) {
    // no-op
  }
}

function normalizeGain(value, fallback = 1) {
  const numeric = Number(value);
  return clampNumber(Number.isFinite(numeric) ? numeric : fallback, 0, MAX_SOUND_GAIN);
}

function getEffectiveMusicVolume({
  liveMusicVolume = getLiveMusicVolume(),
  normalizationGain = 1,
} = {}) {
  return clampNumber(normalizeVolume(liveMusicVolume) * normalizeGain(normalizationGain), 0, MAX_SOUND_GAIN);
}

function getNormalizationMonitorLabel(channel) {
  const display = getSessionNormalizationDisplay(channel);
  return `${formatCompactMilliHertz(display.originalDb)} → ${formatCompactMilliHertz(display.targetDb)}`;
}

function getTrackNormalizationCacheKey(track, filePath) {
  return getTrackNormalizationCacheKeyForProfile(track, filePath, getTrackNormalizationScanProfileId(track));
}

function getNormalizationMonitorParts(channel) {
  const display = getSessionNormalizationDisplay(channel);
  return {
    source: formatCompactMilliHertz(display.originalDb),
    target: formatCompactMilliHertz(display.targetDb),
  };
}

function getTrackNormalizationCacheKeyForProfile(track, filePath, profileId = DEFAULT_NORMALIZATION_SCAN_PROFILE) {
  const clipStartRaw = parseTimeInput(track?.start);
  const clipStart = Number.isFinite(clipStartRaw) && clipStartRaw >= 0 ? clipStartRaw : 0;
  const clipEndRaw = parseTimeInput(track?.end);
  const clipEnd = Number.isFinite(clipEndRaw) && clipEndRaw > clipStart ? clipEndRaw : null;
  const profile = getNormalizationScanProfile(profileId);
  return [
    NORMALIZATION_ANALYSIS_VERSION,
    filePath,
    clipStart.toFixed(3),
    Number.isFinite(clipEnd) ? clipEnd.toFixed(3) : "end",
    NORMALIZATION_SCAN_WINDOW_SEC,
    profile.windowCount,
    profile.sampleStep,
  ].join("|");
}

function exportCurrentNormalizationCacheStore() {
  const currentVersionPrefix = `${NORMALIZATION_ANALYSIS_VERSION}|`;
  const normalized = {};

  for (const [key, value] of normalizationAnalysisCache.entries()) {
    const cacheKey = String(key ?? "");
    const numeric = Number(value);
    if (!cacheKey.startsWith(currentVersionPrefix) || !Number.isFinite(numeric)) continue;
    normalized[cacheKey] = numeric;
  }

  return normalized;
}

function getStoredTrackNormalizationLoudnessDb(track, filePath) {
  if (!track || !filePath) return null;
  const version = Number(track.normalizationAnalysisVersion);
  const cacheKey = getTrackNormalizationCacheKey(track, filePath);
  const storedKey = String(track.normalizationCacheKey ?? "");
  const loudnessDb = Number(track.normalizationLoudnessDb);
  if (version !== NORMALIZATION_ANALYSIS_VERSION) return null;
  if (storedKey !== cacheKey) return null;
  return Number.isFinite(loudnessDb) ? loudnessDb : null;
}

function updateTrackNormalizationMetadata(track, filePath, loudnessDb, { channel = null, profileId = null } = {}) {
  const numeric = Number(loudnessDb);
  if (!track || !filePath || !Number.isFinite(numeric)) return null;

  const profile = getNormalizationScanProfile(profileId ?? getTrackNormalizationScanProfileId(track));
  const cacheKey = getTrackNormalizationCacheKeyForProfile(track, filePath, profile.id);
  const applyToTrack = (target) => {
    if (!target || typeof target !== "object") return;
    target.normalizationAnalysisVersion = NORMALIZATION_ANALYSIS_VERSION;
    target.normalizationScanProfile = profile.id;
    target.normalizationCacheKey = cacheKey;
    target.normalizationLoudnessDb = numeric;
  };

  applyToTrack(track);

  const collections = channel === "music"
    ? [storageState.tracks]
    : channel === "ambience"
      ? [storageState.ambienceTracks]
      : [storageState.tracks, storageState.ambienceTracks];

  for (const collection of collections) {
    const index = collection.findIndex((entry) => entry?.id === track?.id);
    if (index === -1) continue;
    applyToTrack(collection[index]);
    break;
  }

  return cacheKey;
}

function getCachedTrackLoudnessDb(track, filePath) {
  const storedValue = getStoredTrackNormalizationLoudnessDb(track, filePath);
  if (Number.isFinite(storedValue)) return storedValue;
  const cacheKey = getTrackNormalizationCacheKey(track, filePath);
  const value = Number(normalizationAnalysisCache.get(cacheKey));
  return Number.isFinite(value) ? value : null;
}

function setCachedTrackLoudnessDb(track, filePath, loudnessDb, { channel = null, profileId = null } = {}) {
  const numeric = Number(loudnessDb);
  if (!Number.isFinite(numeric)) return;
  const profile = getNormalizationScanProfile(profileId ?? getTrackNormalizationScanProfileId(track));
  const cacheKey = updateTrackNormalizationMetadata(track, filePath, numeric, { channel, profileId: profile.id })
    ?? getTrackNormalizationCacheKeyForProfile(track, filePath, profile.id);
  normalizationAnalysisCache.set(cacheKey, numeric);
  if (!storageState.normalizationCache || typeof storageState.normalizationCache !== "object") {
    storageState.normalizationCache = {};
  }
  storageState.normalizationCache[cacheKey] = numeric;
}

function logNormalizationDebug(stage, {
  channel = "music",
  track = null,
  filePath = "",
  extra = {},
} = {}) {
  if (!NORMALIZATION_DEBUG_LOGS) return;
  console.warn(`${MODULE_ID} | normalization ${stage}`, {
    channel,
    trackId: track?.id ?? null,
    trackName: track?.name ?? null,
    filePath,
    ...extra,
  });
}

function getNormalizationTargetDurationSec(maxDurationSec) {
  const safeDuration = Number.isFinite(maxDurationSec) ? Math.max(0, Number(maxDurationSec)) : MAX_NORMALIZATION_ANALYSIS_SEC;
  if (!(safeDuration > 0)) return 0;
  if (safeDuration < MAX_NORMALIZATION_ANALYSIS_SEC) {
    return safeDuration / 2;
  }
  return MAX_NORMALIZATION_ANALYSIS_SEC;
}

function getNormalizationProbeOffsets(clipStart, clipEnd, analysisDuration, { windowCount = null } = {}) {
  const safeClipStart = Number.isFinite(clipStart) ? Math.max(0, Number(clipStart)) : 0;
  const safeAnalysisDuration = Number.isFinite(analysisDuration)
    ? Math.max(0.05, Number(analysisDuration))
    : NORMALIZATION_SCAN_WINDOW_SEC;
  const safeClipEnd = Number.isFinite(clipEnd) && clipEnd > safeClipStart
    ? Number(clipEnd)
    : safeClipStart + safeAnalysisDuration;
  const availableDuration = Math.max(0.05, safeClipEnd - safeClipStart);
  const windowDuration = Math.min(safeAnalysisDuration, availableDuration);
  const maxOffset = Math.max(safeClipStart, safeClipEnd - windowDuration);
  const offsets = [];
  const seen = new Set();

  const pushOffset = (value) => {
    const numeric = clampNumber(Number(value), safeClipStart, maxOffset);
    const cacheKey = numeric.toFixed(3);
    if (seen.has(cacheKey)) return;
    seen.add(cacheKey);
    offsets.push(numeric);
  };

  const positions = Math.max(1, Number(windowCount) || getNormalizationScanProfile().windowCount);
  if (positions === 1) {
    pushOffset(safeClipStart + ((availableDuration - windowDuration) / 2));
  } else {
    const spread = Math.max(0, availableDuration - windowDuration);
    for (let index = 0; index < positions; index += 1) {
      const ratio = index / (positions - 1);
      pushOffset(safeClipStart + (spread * ratio));
    }
  }

  if (!offsets.length) {
    pushOffset(safeClipStart);
  }

  return offsets;
}

function getWorkingBlockRms(tracker) {
  const values = Array.isArray(tracker?.blockRmsValues) ? tracker.blockRmsValues.filter((value) => Number.isFinite(value) && value > 0) : [];
  if (!values.length) return null;
  values.sort((left, right) => right - left);
  const takeCount = Math.max(1, Math.ceil(values.length * NORMALIZATION_TOP_BLOCK_PORTION));
  const selected = values.slice(0, takeCount);
  const meanSquare = selected.reduce((sum, value) => sum + (value * value), 0) / selected.length;
  const rms = Math.sqrt(meanSquare);
  return Number.isFinite(rms) && rms > 0 ? rms : null;
}

function analyzeSamplesSparse(channelData, step = null) {
  const sampleStep = Math.max(1, Number(step) || getNormalizationScanProfile().sampleStep);
  let peak = 0;
  let sumSq = 0;
  let count = 0;

  for (let index = 0; index < channelData.length; index += sampleStep) {
    const sample = channelData[index];
    const absolute = Math.abs(sample);
    if (absolute > peak) peak = absolute;
    sumSq += sample * sample;
    count += 1;
  }

  if (!count) return null;

  const rms = Math.sqrt(sumSq / count);
  const rmsDb = rms > 1e-9 ? 20 * Math.log10(rms) : -120;
  const peakDb = peak > 1e-9 ? 20 * Math.log10(peak) : -120;
  return { rmsDb, peakDb };
}

function combineSparseAnalyses(analyses = []) {
  const valid = analyses.filter((analysis) =>
    analysis
    && Number.isFinite(analysis.rmsDb)
    && Number.isFinite(analysis.peakDb)
  );
  if (!valid.length) return null;

  let peak = 0;
  let sumSq = 0;
  for (const analysis of valid) {
    const rms = Math.pow(10, analysis.rmsDb / 20);
    const currentPeak = Math.pow(10, analysis.peakDb / 20);
    if (currentPeak > peak) peak = currentPeak;
    sumSq += rms * rms;
  }

  const rms = Math.sqrt(sumSq / valid.length);
  return {
    rmsDb: rms > 1e-9 ? 20 * Math.log10(rms) : -120,
    peakDb: peak > 1e-9 ? 20 * Math.log10(peak) : -120,
  };
}

function getTrackNormalizationClipRange(track, durationSec = null) {
  const clipStartRaw = parseTimeInput(track?.start);
  const clipStart = Number.isFinite(clipStartRaw) && clipStartRaw >= 0 ? clipStartRaw : 0;
  const clipEndRaw = parseTimeInput(track?.end);
  const clipEnd = Number.isFinite(clipEndRaw) && clipEndRaw > clipStart
    ? clipEndRaw
    : (Number.isFinite(durationSec) && durationSec > clipStart ? Number(durationSec) : null);
  return { clipStart, clipEnd };
}

function getNormalizationMediaError(audio) {
  const code = Number(audio?.error?.code ?? 0);
  const details = audio?.error?.message ? `: ${audio.error.message}` : "";
  switch (code) {
    case 1: return `Media aborted${details}`;
    case 2: return `Media network error${details}`;
    case 3: return `Media decode error${details}`;
    case 4: return `Media source unsupported${details}`;
    default: return details ? `Media error${details}` : "Media error";
  }
}

function cleanupNormalizationMediaAnalyzer(analyzer) {
  if (!analyzer) return;

  const {
    audio,
    sourceNode,
    analyser,
    silentGain,
  } = analyzer;

  try {
    if (audio && typeof audio.pause === "function") {
      audio.pause();
    }
  } catch (_error) {
    // no-op
  }

  disconnectAudioNode(sourceNode, analyser);
  disconnectAudioNode(analyser, silentGain);
  disconnectAudioNode(silentGain);

  try {
    if (audio) {
      audio.removeAttribute("src");
      audio.load();
    }
  } catch (_error) {
    // no-op
  }
}

async function waitForNormalizationMediaState(audio, {
  timeoutMs = 10000,
  predicate = null,
  events = ["loadedmetadata", "canplay", "loadeddata"],
} = {}) {
  if (!audio) throw new Error("No media element available");
  if (typeof predicate === "function" && predicate()) return;

  await new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId = null;
    const cleanups = [];

    const finish = (handler) => {
      if (settled) return;
      settled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      for (const cleanup of cleanups) cleanup();
      handler();
    };

    const onSuccess = () => finish(resolve);
    const onError = () => finish(() => reject(new Error(getNormalizationMediaError(audio))));
    const onTimeout = () => finish(() => reject(new Error(`Media state timeout after ${timeoutMs}ms`)));

    for (const eventName of events) {
      const handler = () => {
        if (typeof predicate === "function" && !predicate()) return;
        onSuccess();
      };
      audio.addEventListener(eventName, handler);
      cleanups.push(() => audio.removeEventListener(eventName, handler));
    }

    audio.addEventListener("error", onError);
    cleanups.push(() => audio.removeEventListener("error", onError));
    timeoutId = window.setTimeout(onTimeout, timeoutMs);
  });
}

async function createNormalizationAnalysisResources(channel = "music") {
  const ContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext ?? null;
  const sharedContext = getAudioContextForChannel(channel);
  const context = (
    sharedContext?.createAnalyser
    && typeof sharedContext?.createMediaElementSource === "function"
  )
    ? sharedContext
    : (ContextCtor ? new ContextCtor() : null);

  if (!context?.createAnalyser || typeof context.createMediaElementSource !== "function" || !context.destination) {
    throw new Error("No media-element audio analyser available");
  }

  if (context.state === "suspended" && typeof context.resume === "function") {
    try {
      await context.resume();
    } catch (_error) {
      // no-op
    }
  }

  return {
    context,
    temporary: context !== sharedContext,
  };
}

async function disposeNormalizationAnalysisResources(resources) {
  if (!resources?.temporary || typeof resources.context?.close !== "function") return;
  try {
    await resources.context.close();
  } catch (_error) {
    // no-op
  }
}

async function createNormalizationMediaAnalyzer(filePath, resources) {
  const audio = new Audio();
  audio.preload = "auto";
  audio.muted = false;
  audio.volume = 1;
  audio.crossOrigin = "anonymous";
  audio.src = filePath;
  audio.load();

  await waitForNormalizationMediaState(audio, {
    timeoutMs: 12000,
    predicate: () => Number.isFinite(audio.duration) && audio.duration > 0,
    events: ["loadedmetadata", "durationchange", "loadeddata", "canplay"],
  });

  const analyser = resources.context.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0;
  const silentGain = resources.context.createGain();
  silentGain.gain.value = 0;
  const sourceNode = resources.context.createMediaElementSource(audio);
  sourceNode.connect(analyser);
  analyser.connect(silentGain);
  silentGain.connect(resources.context.destination);

  return {
    audio,
    sourceNode,
    analyser,
    silentGain,
    floatData: typeof analyser.getFloatTimeDomainData === "function"
      ? new Float32Array(analyser.fftSize)
      : null,
    byteData: typeof analyser.getFloatTimeDomainData === "function"
      ? null
      : new Uint8Array(analyser.fftSize),
  };
}

async function seekNormalizationMediaElement(audio, timeSec) {
  if (!audio) throw new Error("No media element available");

  const safeTarget = clampNumber(
    Number(timeSec) || 0,
    0,
    Number.isFinite(audio.duration) && audio.duration > 0 ? Math.max(0, audio.duration - 0.01) : Number.MAX_SAFE_INTEGER,
  );

  if (Math.abs((Number(audio.currentTime) || 0) - safeTarget) <= 0.01) return safeTarget;

  await new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId = null;

    const finish = (handler) => {
      if (settled) return;
      settled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      audio.removeEventListener("seeked", onSeeked);
      audio.removeEventListener("error", onError);
      handler();
    };

    const onSeeked = () => finish(resolve);
    const onError = () => finish(() => reject(new Error(getNormalizationMediaError(audio))));

    audio.addEventListener("seeked", onSeeked);
    audio.addEventListener("error", onError);
    timeoutId = window.setTimeout(() => {
      finish(() => reject(new Error(`Media seek timeout after 4000ms (${safeTarget.toFixed(3)}s)`)));
    }, 4000);

    try {
      audio.currentTime = safeTarget;
    } catch (error) {
      finish(() => reject(error));
    }
  });

  await waitForNormalizationMediaState(audio, {
    timeoutMs: 4000,
    predicate: () => audio.readyState >= (globalThis.HTMLMediaElement?.HAVE_CURRENT_DATA ?? 2),
    events: ["loadeddata", "canplay", "canplaythrough", "timeupdate"],
  });

  return safeTarget;
}

function sampleSparseAnalyserFrame(analyser, floatData = null, byteData = null, { sampleStep = null } = {}) {
  if (!analyser) return null;

  if (floatData && typeof analyser.getFloatTimeDomainData === "function") {
    analyser.getFloatTimeDomainData(floatData);
    return analyzeSamplesSparse(floatData, sampleStep);
  }

  if (byteData && typeof analyser.getByteTimeDomainData === "function") {
    analyser.getByteTimeDomainData(byteData);
    const effectiveStep = Math.max(1, Number(sampleStep) || getNormalizationScanProfile().sampleStep);
    let peak = 0;
    let sumSq = 0;
    let count = 0;

    for (let index = 0; index < byteData.length; index += effectiveStep) {
      const sample = (byteData[index] - 128) / 128;
      const absolute = Math.abs(sample);
      if (absolute > peak) peak = absolute;
      sumSq += sample * sample;
      count += 1;
    }

    if (!count) return null;

    const rms = Math.sqrt(sumSq / count);
    return {
      rmsDb: rms > 1e-9 ? 20 * Math.log10(rms) : -120,
      peakDb: peak > 1e-9 ? 20 * Math.log10(peak) : -120,
    };
  }

  return null;
}

async function analyzeNormalizationMediaWindow(analyzer, startSec, durationSec, { sampleStep = null } = {}) {
  if (!analyzer?.audio || !(durationSec > 0)) return null;

  const windowDuration = Math.max(0.05, Number(durationSec) || 0);
  const startTime = await seekNormalizationMediaElement(analyzer.audio, startSec);
  const targetEnd = Math.min(
    Number.isFinite(analyzer.audio.duration) ? analyzer.audio.duration : startTime + windowDuration,
    startTime + windowDuration,
  );
  if (!(targetEnd > startTime)) return null;

  analyzer.audio.playbackRate = PRELOAD_NORMALIZATION_RATE;
  analyzer.audio.defaultPlaybackRate = PRELOAD_NORMALIZATION_RATE;
  const startedAtMs = Date.now();
  const maxWallMs = ((windowDuration / PRELOAD_NORMALIZATION_RATE) * 1000) + 1200;
  const frameAnalyses = [];

  try {
    await analyzer.audio.play();
  } catch (error) {
    throw new Error(`Failed to play media window: ${error?.message ?? error}`);
  }

  try {
    while ((Number(analyzer.audio.currentTime) || 0) < (targetEnd - 0.01)) {
      const frame = sampleSparseAnalyserFrame(analyzer.analyser, analyzer.floatData, analyzer.byteData, { sampleStep });
      if (frame) {
        frameAnalyses.push(frame);
      }

      if (analyzer.audio.ended) break;
      if ((Date.now() - startedAtMs) >= maxWallMs) break;
      await waitMs(NORMALIZATION_POLL_MS);
    }

    const finalFrame = sampleSparseAnalyserFrame(analyzer.analyser, analyzer.floatData, analyzer.byteData, { sampleStep });
    if (finalFrame) {
      frameAnalyses.push(finalFrame);
    }
  } finally {
    try {
      analyzer.audio.pause();
    } catch (_error) {
      // no-op
    }
  }

  return combineSparseAnalyses(frameAnalyses);
}

async function scanTrackNormalizationLoudnessWithAnalyzer(track, filePath, analyzer, {
  channel = "music",
  profileId = null,
} = {}) {
  const profile = getNormalizationScanProfile(profileId ?? getTrackNormalizationScanProfileId(track));
  const { clipStart, clipEnd } = getTrackNormalizationClipRange(track, analyzer?.audio?.duration ?? null);
  const availableDuration = Number.isFinite(clipEnd) && clipEnd > clipStart
    ? (clipEnd - clipStart)
    : Math.max(0.05, (analyzer?.audio?.duration ?? 0) - clipStart);
  if (!(availableDuration > 0)) return null;

  const windowDuration = Math.max(0.05, Math.min(NORMALIZATION_SCAN_WINDOW_SEC, availableDuration));
  const windowOffsets = getNormalizationProbeOffsets(clipStart, clipEnd, windowDuration, {
    windowCount: profile.windowCount,
  });
  const windowAnalyses = [];

  for (const offset of windowOffsets) {
    const analysis = await analyzeNormalizationMediaWindow(analyzer, offset, windowDuration, {
      sampleStep: profile.sampleStep,
    });
    if (analysis) {
      windowAnalyses.push(analysis);
    }
  }

  const loudnessDb = resolveSparseWindowLoudnessDb(windowAnalyses);
  if (Number.isFinite(loudnessDb)) {
    setCachedTrackLoudnessDb(track, filePath, loudnessDb, { channel, profileId: profile.id });
    return loudnessDb;
  }
  return null;
}

function resolveSparseWindowLoudnessDb(windowAnalyses = []) {
  const minRmsDb = 20 * Math.log10(MIN_NORMALIZATION_RMS);
  const minPeakDb = 20 * Math.log10(MIN_NORMALIZATION_ACTIVE_SAMPLE);
  const valid = windowAnalyses
    .filter((analysis) =>
      analysis
      && Number.isFinite(analysis.rmsDb)
      && Number.isFinite(analysis.peakDb)
      && analysis.rmsDb >= minRmsDb
      && analysis.peakDb >= minPeakDb
    )
    .sort((left, right) => right.rmsDb - left.rmsDb);
  if (!valid.length) return null;

  const takeCount = Math.max(1, Math.min(valid.length, Math.ceil(valid.length * 0.67)));
  const selected = valid.slice(0, takeCount);
  const sumSq = selected.reduce((sum, analysis) => {
    const rms = Math.pow(10, analysis.rmsDb / 20);
    return sum + (rms * rms);
  }, 0);
  const rms = Math.sqrt(sumSq / selected.length);
  return rms > 1e-9 ? 20 * Math.log10(rms) : null;
}

async function scanTrackNormalizationLoudness(track, filePath, {
  channel = "music",
  analysisResources = null,
  profileId = null,
} = {}) {
  const profile = getNormalizationScanProfile(profileId ?? getTrackNormalizationScanProfileId(track));
  const cacheKey = getTrackNormalizationCacheKeyForProfile(track, filePath, profile.id);
  const cachedLoudness = Number(normalizationAnalysisCache.get(cacheKey));
  if (Number.isFinite(cachedLoudness)) {
    return cachedLoudness;
  }

  const ownResources = !analysisResources;
  const resources = analysisResources ?? await createNormalizationAnalysisResources(channel);

  try {
    const analyzer = await createNormalizationMediaAnalyzer(filePath, resources);
    try {
      return await scanTrackNormalizationLoudnessWithAnalyzer(track, filePath, analyzer, { channel, profileId: profile.id });
    } finally {
      cleanupNormalizationMediaAnalyzer(analyzer);
    }
  } finally {
    if (ownResources) {
      await disposeNormalizationAnalysisResources(resources);
    }
  }
}

async function scanNormalizationTracks(channel, profileId = DEFAULT_NORMALIZATION_SCAN_PROFILE) {
  const channelKey = getNormalizationChannelKey(channel);
  if (normalizationScanState[channelKey]) return false;
  const profile = getNormalizationScanProfile(profileId);

  normalizationScanState[channelKey] = profile.id;
  refreshLiveControlsUi();
  let analysisResources = null;

  try {
    const trackList = channelKey === "ambience" ? getAmbienceTracks() : getTracks();
    const fileMap = new Map(getFiles().map((file) => [file.id, file]));
    const candidates = trackList
      .map((track) => ({
        track,
        filePath: fileMap.get(track.fileId)?.path ?? "",
      }))
      .filter(({ track, filePath }) => isTrackNormalizationEnabled(track) && filePath);

    if (!candidates.length) {
      ui.notifications.warn(
        channelKey === "ambience"
          ? localizedFallback("TS-DJ-MUSIC: нет треков эмбиенса для сканирования нормализации.", "TS-DJ-MUSIC: no ambience tracks available for normalization scan.")
          : localizedFallback("TS-DJ-MUSIC: нет музыкальных треков для сканирования нормализации.", "TS-DJ-MUSIC: no music tracks available for normalization scan."),
      );
      return false;
    }

    let scanned = 0;
    let skipped = 0;
    let failed = 0;
    let metadataUpdated = false;
    const tracksByFile = new Map();

    for (const { track, filePath } of candidates) {
      const cacheKey = getTrackNormalizationCacheKeyForProfile(track, filePath, profile.id);
      const cachedLoudnessDb = Number(normalizationAnalysisCache.get(cacheKey));
      if (Number.isFinite(cachedLoudnessDb)) {
        updateTrackNormalizationMetadata(track, filePath, cachedLoudnessDb, {
          channel: channelKey,
          profileId: profile.id,
        });
        metadataUpdated = true;
        skipped += 1;
        continue;
      }
      const groupedTracks = tracksByFile.get(filePath) ?? [];
      groupedTracks.push(track);
      tracksByFile.set(filePath, groupedTracks);
    }

    if (!tracksByFile.size) {
      if (metadataUpdated) {
        if (channelKey === "ambience") {
          await setAmbienceTracks(storageState.ambienceTracks);
        } else {
          await setTracks(storageState.tracks);
        }
      }
      const summary = channelKey === "ambience"
        ? localizedFallback(
          `TS-DJ-MUSIC: скан эмбиенса завершён. Успешно ${scanned}, пропущено ${skipped}, ошибок ${failed}.`,
          `TS-DJ-MUSIC: ambience scan finished. Scanned ${scanned}, skipped ${skipped}, failed ${failed}.`,
        )
        : localizedFallback(
          `TS-DJ-MUSIC: скан музыки завершён. Успешно ${scanned}, пропущено ${skipped}, ошибок ${failed}.`,
          `TS-DJ-MUSIC: music scan finished. Scanned ${scanned}, skipped ${skipped}, failed ${failed}.`,
        );
      ui.notifications.info?.(summary);
      return true;
    }

    analysisResources = await createNormalizationAnalysisResources(channelKey);
    for (const [filePath, tracks] of tracksByFile.entries()) {
      let analyzer = null;
      try {
        analyzer = await createNormalizationMediaAnalyzer(filePath, analysisResources);
        for (const track of tracks) {
          try {
            const loudnessDb = await scanTrackNormalizationLoudnessWithAnalyzer(track, filePath, analyzer, {
              channel: channelKey,
              profileId: profile.id,
            });
            if (Number.isFinite(loudnessDb)) {
              scanned += 1;
            } else {
              skipped += 1;
            }
          } catch (error) {
            failed += 1;
            console.warn(`${MODULE_ID} | normalization scan failed`, {
              channel: channelKey,
              trackId: track?.id ?? null,
              trackName: track?.name ?? null,
              filePath,
              error,
            });
          }

          await waitMs(0);
        }
      } catch (error) {
        failed += 1;
        skipped += tracks.length;
        console.warn(`${MODULE_ID} | normalization scan failed`, {
          channel: channelKey,
          trackId: null,
          trackName: null,
          filePath,
          error,
        });
      } finally {
        cleanupNormalizationMediaAnalyzer(analyzer);
      }
    }

    if (scanned > 0 || metadataUpdated) {
      if (channelKey === "ambience") {
        await setAmbienceTracks(storageState.ambienceTracks);
      } else {
        await setTracks(storageState.tracks);
      }
    }

    const summary = channelKey === "ambience"
      ? localizedFallback(
        `TS-DJ-MUSIC: скан эмбиенса завершён. Успешно ${scanned}, пропущено ${skipped}, ошибок ${failed}.`,
        `TS-DJ-MUSIC: ambience scan finished. Scanned ${scanned}, skipped ${skipped}, failed ${failed}.`,
      )
      : localizedFallback(
        `TS-DJ-MUSIC: скан музыки завершён. Успешно ${scanned}, пропущено ${skipped}, ошибок ${failed}.`,
        `TS-DJ-MUSIC: music scan finished. Scanned ${scanned}, skipped ${skipped}, failed ${failed}.`,
      );
    ui.notifications[failed > 0 ? "warn" : "info"]?.(summary);
    return failed === 0;
  } finally {
    await disposeNormalizationAnalysisResources(analysisResources);
    normalizationScanState[channelKey] = null;
    refreshLiveControlsUi();
  }
}

function calculateNormalizationGain(channel, loudnessDb) {
  const numeric = Number(loudnessDb);
  if (!Number.isFinite(numeric)) {
    return {
      gain: 1,
      referenceDb: getSessionNormalizationReferenceDb(channel),
    };
  }

  let referenceDb = getSessionNormalizationReferenceDb(channel);
  if (!Number.isFinite(referenceDb)) {
    return {
      gain: 1,
      referenceDb: null,
    };
  }

  const rawGain = Math.pow(10, (referenceDb - numeric) / 20);
  return {
    gain: clampNumber(rawGain, MIN_NORMALIZATION_GAIN, MAX_NORMALIZATION_GAIN),
    referenceDb,
  };
}

function resolveTrackNormalization(track, filePath, { channel = "music" } = {}) {
  const normalizationEnabled = isTrackNormalizationEnabled(track);
  if (!normalizationEnabled) {
    setSessionNormalizationDisplay(channel, {
      currentDb: null,
      originalDb: null,
      targetDb: getSessionNormalizationReferenceDb(channel),
    }, { refresh: false });
    return {
      enabled: false,
      gain: 1,
      loudnessDb: null,
      referenceDb: getSessionNormalizationReferenceDb(channel),
      needsAnalysis: false,
    };
  }

  const loudnessDb = getCachedTrackLoudnessDb(track, filePath);
  if (Number.isFinite(loudnessDb)) {
    const normalized = calculateNormalizationGain(channel, loudnessDb);
    setSessionNormalizationDisplay(channel, {
      currentDb: getAppliedNormalizationDb(loudnessDb, normalized.gain),
      originalDb: loudnessDb,
      targetDb: normalized.referenceDb,
    }, { refresh: false });
    return {
      enabled: true,
      gain: normalized.gain,
      loudnessDb,
      referenceDb: normalized.referenceDb,
      needsAnalysis: false,
    };
  }

  setSessionNormalizationDisplay(channel, {
    currentDb: null,
    originalDb: null,
    targetDb: getSessionNormalizationReferenceDb(channel),
  }, { refresh: false });
  return {
    enabled: true,
    gain: 1,
    loudnessDb: null,
    referenceDb: getSessionNormalizationReferenceDb(channel),
    needsAnalysis: false,
  };
}

function disconnectAudioNode(node, target = undefined) {
  if (!node || typeof node.disconnect !== "function") return;
  try {
    if (target !== undefined) {
      node.disconnect(target);
      return;
    }
    node.disconnect();
  } catch (_error) {
    // no-op
  }
}

function clearNormalizationBindRetry(entry) {
  if (!entry?.normalizationBindRetryId) return;
  window.clearInterval(entry.normalizationBindRetryId);
  entry.normalizationBindRetryId = null;
}

function clearNormalizationTracker(entry, { clearRetry = true } = {}) {
  if (clearRetry) {
    clearNormalizationBindRetry(entry);
  }
  const tracker = entry?.normalizationTracker;
  if (!tracker) return;
  if (tracker.intervalId) {
    window.clearInterval(tracker.intervalId);
  }
  disconnectAudioNode(tracker.sourceNode, tracker.analyser);
  disconnectAudioNode(tracker.analyser);
  disconnectAudioNode(tracker.silentGain);
  entry.normalizationTracker = null;
}

function sampleNormalizationTracker(entry, track, filePath, { channel = "music", onVolumeChange = null } = {}) {
  const tracker = entry?.normalizationTracker;
  if (!tracker || entry?.paused || entry?.ending) {
    clearNormalizationTracker(entry);
    return;
  }

  const directTime = getCurrentAbsoluteTime(entry) ?? getEstimatedAbsoluteTime(entry);
  const fallbackElapsedSec = Math.max(0, (Date.now() - tracker.startedAtMs) / 1000);
  const analyzedSec = Number.isFinite(directTime)
    ? Math.max(0, directTime - tracker.startTime)
    : fallbackElapsedSec;

  try {
    if (tracker.floatData) {
      tracker.analyser.getFloatTimeDomainData(tracker.floatData);
      let blockSumSquares = 0;
      let blockPeak = 0;
      let blockSampleCount = 0;
      for (const sample of tracker.floatData) {
        const absSample = Math.abs(sample);
        if (absSample > blockPeak) blockPeak = absSample;
        blockSumSquares += sample * sample;
        blockSampleCount += 1;
      }
      if (blockSampleCount > 0 && blockPeak >= MIN_NORMALIZATION_ACTIVE_SAMPLE) {
        const blockRms = Math.sqrt(blockSumSquares / blockSampleCount);
        if (Number.isFinite(blockRms) && blockRms > 0) {
          tracker.blockRmsValues.push(blockRms);
          tracker.blockCount = Number(tracker.blockCount ?? 0) + 1;
        }
      }
    } else if (tracker.byteData) {
      tracker.analyser.getByteTimeDomainData(tracker.byteData);
      let blockSumSquares = 0;
      let blockPeak = 0;
      let blockSampleCount = 0;
      for (const sample of tracker.byteData) {
        const normalized = (sample - 128) / 128;
        const absSample = Math.abs(normalized);
        if (absSample > blockPeak) blockPeak = absSample;
        blockSumSquares += normalized * normalized;
        blockSampleCount += 1;
      }
      if (blockSampleCount > 0 && blockPeak >= MIN_NORMALIZATION_ACTIVE_SAMPLE) {
        const blockRms = Math.sqrt(blockSumSquares / blockSampleCount);
        if (Number.isFinite(blockRms) && blockRms > 0) {
          tracker.blockRmsValues.push(blockRms);
          tracker.blockCount = Number(tracker.blockCount ?? 0) + 1;
        }
      }
    }
  } catch (error) {
    console.warn(`${MODULE_ID} | failed to sample normalization tracker`, error);
    if (typeof tracker.onAnalysisComplete === "function") {
      tracker.onAnalysisComplete(false);
      tracker.onAnalysisComplete = null;
    }
    logNormalizationDebug("sample-error", {
      channel,
      track,
      filePath,
      extra: {
        analyzedSec,
        blockCount: tracker.blockCount,
        workingBlockRms: getWorkingBlockRms(tracker),
        error: String(error?.message ?? error),
      },
    });
    clearNormalizationTracker(entry);
    return;
  }

  const targetDurationSec = Number.isFinite(tracker.targetDurationSec)
    ? Math.min(tracker.targetDurationSec, tracker.maxDurationSec)
    : tracker.maxDurationSec;
  if ((tracker.blockCount ?? 0) > 0 && analyzedSec >= targetDurationSec) {
    const workingBlockRms = Number(getWorkingBlockRms(tracker) ?? 0);
    if (workingBlockRms > MIN_NORMALIZATION_RMS) {
      const loudnessDb = 20 * Math.log10(workingBlockRms);
      if (Number.isFinite(loudnessDb)) {
        entry.normalizationDb = loudnessDb;
        setCachedTrackLoudnessDb(track, filePath, loudnessDb, { channel });
        void persistNormalizationCacheToStorage().catch((error) => {
          console.warn(`${MODULE_ID} | failed to persist normalization cache`, error);
        });
        const normalized = calculateNormalizationGain(channel, loudnessDb);
        setSessionNormalizationDisplay(channel, {
          currentDb: getAppliedNormalizationDb(loudnessDb, normalized.gain),
          originalDb: loudnessDb,
          targetDb: normalized.referenceDb,
        });
        if (!Number.isFinite(entry.normalizationGain) || Math.abs(entry.normalizationGain - normalized.gain) > 0.01) {
          entry.normalizationGain = normalized.gain;
          if (typeof onVolumeChange === "function") {
            onVolumeChange(entry);
          }
        }
        if (typeof tracker.onAnalysisComplete === "function") {
          tracker.onAnalysisComplete(true);
          tracker.onAnalysisComplete = null;
        }
        logNormalizationDebug("analysis-success", {
          channel,
          track,
          filePath,
          extra: {
            analyzedSec,
            targetDurationSec,
            blockCount: tracker.blockCount,
            workingBlockRms,
            loudnessDb,
            gain: normalized.gain,
            referenceDb: normalized.referenceDb,
          },
        });
        clearNormalizationTracker(entry);
        return;
      }
    }
  }

  if (analyzedSec >= tracker.maxDurationSec) {
    if (typeof tracker.onAnalysisComplete === "function") {
      tracker.onAnalysisComplete(false);
      tracker.onAnalysisComplete = null;
    }
    logNormalizationDebug("analysis-finished-without-result", {
      channel,
      track,
      filePath,
      extra: {
        analyzedSec,
        targetDurationSec,
        maxDurationSec: tracker.maxDurationSec,
        blockCount: tracker.blockCount,
        workingBlockRms: getWorkingBlockRms(tracker),
      },
    });
    clearNormalizationTracker(entry);
  }
}

function bindNormalizationTracker(entry, track, filePath, {
  channel = "music",
  onVolumeChange = null,
  onAnalysisComplete = null,
} = {}) {
  if (!entry?.sound || !isTrackNormalizationEnabled(track)) return false;
  clearNormalizationTracker(entry, { clearRetry: false });

  const context = entry.sound.context;
  const sourceNode = entry.sound.sourceNode;
  if (!context?.createAnalyser || !context?.createGain || !context.destination || typeof sourceNode?.connect !== "function") {
    logNormalizationDebug("bind-unavailable", {
      channel,
      track,
      filePath,
      extra: {
        hasContext: Boolean(context),
        hasAnalyserFactory: Boolean(context?.createAnalyser),
        hasGainFactory: Boolean(context?.createGain),
        hasDestination: Boolean(context?.destination),
        hasSourceNode: Boolean(sourceNode),
        canConnect: typeof sourceNode?.connect === "function",
      },
    });
    return false;
  }

  const clipStart = Number.isFinite(entry.clipStart) ? entry.clipStart : 0;
  const clipEnd = Number.isFinite(entry.clipEnd) && entry.clipEnd > clipStart
    ? entry.clipEnd
    : null;
  const analysisStartTime = getCurrentAbsoluteTime(entry) ?? getEstimatedAbsoluteTime(entry) ?? clipStart;
  const maxDurationSec = clipEnd
    ? Math.min(MAX_NORMALIZATION_ANALYSIS_SEC, Math.max(0.1, clipEnd - analysisStartTime))
    : MAX_NORMALIZATION_ANALYSIS_SEC;
  const targetDurationSec = getNormalizationTargetDurationSec(maxDurationSec);

  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0;
  const silentGain = context.createGain();
  silentGain.gain.value = 0;

  try {
    sourceNode.connect(analyser);
    analyser.connect(silentGain);
    silentGain.connect(context.destination);
  } catch (error) {
    console.warn(`${MODULE_ID} | failed to bind normalization tracker`, error);
    disconnectAudioNode(sourceNode, analyser);
    disconnectAudioNode(analyser);
    disconnectAudioNode(silentGain);
    return false;
  }

  entry.normalizationTracker = {
    sourceNode,
    analyser,
    silentGain,
    startedAtMs: Date.now(),
    startTime: analysisStartTime,
    maxDurationSec,
    targetDurationSec,
    blockCount: 0,
    blockRmsValues: [],
    floatData: typeof analyser.getFloatTimeDomainData === "function"
      ? new Float32Array(analyser.fftSize)
      : null,
    byteData: typeof analyser.getFloatTimeDomainData === "function"
      ? null
      : new Uint8Array(analyser.fftSize),
    onAnalysisComplete,
    intervalId: window.setInterval(() => {
      sampleNormalizationTracker(entry, track, filePath, { channel, onVolumeChange });
    }, NORMALIZATION_POLL_MS),
  };

  logNormalizationDebug("bind-success", {
    channel,
    track,
    filePath,
    extra: {
      analysisStartTime,
      maxDurationSec,
      targetDurationSec,
    },
  });

  return true;
}

async function waitForNormalizationAnalysis(entry, track, filePath, {
  channel = "music",
  onVolumeChange = null,
  maxWaitMs = NORMALIZATION_BIND_MAX_WAIT_MS,
} = {}) {
  if (!entry?.sound || !isTrackNormalizationEnabled(track)) return false;

  logNormalizationDebug("preload-wait-start", {
    channel,
    track,
    filePath,
    extra: {
      maxWaitMs,
    },
  });

  return await new Promise((resolve) => {
    let settled = false;
    const startedAtMs = Date.now();

    const finish = (success) => {
      if (settled) return;
      settled = true;
      clearNormalizationBindRetry(entry);
      logNormalizationDebug(success ? "preload-wait-success" : "preload-wait-failed", {
        channel,
        track,
        filePath,
        extra: {
          waitedMs: Date.now() - startedAtMs,
        },
      });
      resolve(Boolean(success));
    };

    const tryBind = () => {
      const bound = bindNormalizationTracker(entry, track, filePath, {
        channel,
        onVolumeChange,
        onAnalysisComplete: (success) => finish(success),
      });
      if (bound) {
        clearNormalizationBindRetry(entry);
      }
      return bound;
    };

    if (tryBind()) {
      return;
    }

    entry.normalizationBindRetryId = window.setInterval(() => {
      if (settled || entry?.ending) {
        finish(false);
        return;
      }

      if ((Date.now() - startedAtMs) >= maxWaitMs) {
        finish(false);
        return;
      }

      tryBind();
    }, NORMALIZATION_BIND_RETRY_MS);
  });
}

function retryBindNormalizationTracker(entry, track, filePath, {
  channel = "music",
  onVolumeChange = null,
  maxWaitMs = NORMALIZATION_BIND_MAX_WAIT_MS,
} = {}) {
  if (!entry?.sound || !isTrackNormalizationEnabled(track)) return false;

  clearNormalizationBindRetry(entry);
  const startedAtMs = Date.now();
  logNormalizationDebug("live-retry-start", {
    channel,
    track,
    filePath,
    extra: {
      maxWaitMs,
    },
  });

  const tryBind = () => {
    const bound = bindNormalizationTracker(entry, track, filePath, {
      channel,
      onVolumeChange,
    });
    if (bound) {
      clearNormalizationBindRetry(entry);
    }
    return bound;
  };

  if (tryBind()) {
    return true;
  }

  entry.normalizationBindRetryId = window.setInterval(() => {
    if (!entry || entry.ending || entry.paused) {
      clearNormalizationBindRetry(entry);
      return;
    }

    if ((Date.now() - startedAtMs) >= maxWaitMs) {
      logNormalizationDebug("live-retry-timeout", {
        channel,
        track,
        filePath,
        extra: {
          waitedMs: Date.now() - startedAtMs,
        },
      });
      clearNormalizationBindRetry(entry);
      return;
    }

    tryBind();
  }, NORMALIZATION_BIND_RETRY_MS);

  return false;
}

function getPreloadNormalizationWaitMs(targetDurationSec, analysisDurationSec) {
  const safeTargetDurationSec = Number.isFinite(targetDurationSec) && targetDurationSec > 0
    ? targetDurationSec
    : getNormalizationTargetDurationSec(analysisDurationSec);
  const safeAnalysisDurationSec = Number.isFinite(analysisDurationSec) && analysisDurationSec > 0
    ? analysisDurationSec
    : MAX_NORMALIZATION_ANALYSIS_SEC;
  const bufferedWallMs = ((safeTargetDurationSec / PRELOAD_NORMALIZATION_RATE) * 1000) + (NORMALIZATION_POLL_MS * 2);
  const maxTrackWallMs = ((safeAnalysisDurationSec / PRELOAD_NORMALIZATION_RATE) * 1000) + (NORMALIZATION_POLL_MS * 2);
  return Math.max(150, Math.min(bufferedWallMs, maxTrackWallMs));
}

async function persistTrackNormalizationMetadata(channel) {
  const channelKey = getNormalizationChannelKey(channel);
  if (channelKey === "ambience") {
    await setAmbienceTracks(storageState.ambienceTracks);
    return;
  }
  await setTracks(storageState.tracks);
}

async function preAnalyzeTrackNormalizationBeforePlayback(track, filePath, {
  channel = "music",
  preloadChannel = channel === "ambience" ? "environment" : "music",
} = {}) {
  const resolved = resolveTrackNormalization(track, filePath, { channel });
  if (!resolved.enabled || Number.isFinite(resolved.loudnessDb)) {
    logNormalizationDebug("playback-source", {
      channel,
      track,
      filePath,
      extra: {
        source: resolved.enabled ? "scan-cache" : "disabled",
        loudnessDb: resolved.loudnessDb,
        gain: resolved.gain,
        referenceDb: resolved.referenceDb,
      },
    });
    return resolved;
  }

  const sound = await preloadSoundWithFileCache(filePath, { channel: preloadChannel });
  if (!sound) {
    return resolved;
  }

  const clipStartRaw = parseTimeInput(track?.start);
  const clipStart = Number.isFinite(clipStartRaw) && clipStartRaw >= 0 ? clipStartRaw : 0;
  const clipEndRaw = parseTimeInput(track?.end);
  const soundDuration = getSoundDuration(sound);
  const clipEnd = Number.isFinite(clipEndRaw) && clipEndRaw > clipStart
    ? clipEndRaw
    : (Number.isFinite(soundDuration) && soundDuration > clipStart ? soundDuration : null);
  const analysisDurationSec = clipEnd
    ? Math.min(MAX_NORMALIZATION_ANALYSIS_SEC, Math.max(0.1, clipEnd - clipStart))
    : MAX_NORMALIZATION_ANALYSIS_SEC;
  const targetDurationSec = getNormalizationTargetDurationSec(analysisDurationSec);
  const waitMsLimit = Math.min(
    PRELOAD_NORMALIZATION_MAX_WAIT_MS,
    getPreloadNormalizationWaitMs(targetDurationSec, analysisDurationSec) + 250,
  );

  const preloadEntry = {
    sound,
    clipStart,
    clipEnd,
    paused: false,
    ending: false,
    normalizationTracker: null,
    normalizationBindRetryId: null,
    timingBaseAbs: clipStart,
    timingBaseMs: Date.now(),
    timingRate: PRELOAD_NORMALIZATION_RATE,
  };

  try {
    applySoundRate(sound, PRELOAD_NORMALIZATION_RATE);
    applySoundVolume(sound, 0);

    const playOptions = {
      autoplay: true,
      loop: false,
      volume: 0,
    };
    if (clipStart > 0) {
      playOptions.offset = clipStart;
    }
    if (Number.isFinite(clipEnd) && clipEnd > clipStart) {
      playOptions.duration = Math.max(0.01, Math.min(analysisDurationSec, clipEnd - clipStart));
    } else {
      playOptions.duration = Math.max(0.01, analysisDurationSec);
    }

    await playSoundWithRetry(sound, playOptions);
    await waitForNormalizationAnalysis(preloadEntry, track, filePath, {
      channel,
      maxWaitMs: waitMsLimit,
    });
  } catch (error) {
    console.warn(`${MODULE_ID} | preload normalization analysis failed`, {
      channel,
      trackId: track?.id ?? null,
      trackName: track?.name ?? null,
      filePath,
      error,
    });
  } finally {
    clearNormalizationTracker(preloadEntry);
    try {
      await sound.stop();
    } catch (_error) {
      // no-op
    }
    forceStopSoundNodes(sound);
    await waitMs(25);
  }

  const refreshed = resolveTrackNormalization(track, filePath, { channel });
  logNormalizationDebug("playback-source", {
    channel,
    track,
    filePath,
    extra: {
      source: Number.isFinite(refreshed.loudnessDb) ? "preload" : "unavailable",
      loudnessDb: refreshed.loudnessDb,
      gain: refreshed.gain,
      referenceDb: refreshed.referenceDb,
    },
  });
  if (Number.isFinite(refreshed.loudnessDb)) {
    await persistTrackNormalizationMetadata(channel);
  }
  return refreshed;
}

function getEnvironmentVolume() {
  const value = Number(game.settings.get("core", "globalAmbientVolume"));
  return clampNumber(Number.isFinite(value) ? value : 1, 0, 1);
}

function getEffectiveAmbienceVolumeForSound(sound, {
  environmentVolume = getEnvironmentVolume(),
  ambienceVolume = getLiveAmbienceVolume(),
  normalizationGain = 1,
} = {}) {
  const moduleAmbienceVolume = clampNumber(
    normalizeVolume(ambienceVolume) * normalizeGain(normalizationGain),
    0,
    MAX_SOUND_GAIN
  );
  if (isSoundOnChannel(sound, "environment")) {
    return moduleAmbienceVolume;
  }
  return clampNumber(environmentVolume * moduleAmbienceVolume, 0, MAX_SOUND_GAIN);
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
      normalizationGain: entry.normalizationGain,
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

function normalizeMusicPlaylistFolderEntry(raw, seenTrackIds = new Set()) {
  const source = raw && typeof raw === "object" ? raw : {};
  const trackIds = normalizeArray(source.trackIds)
    .map((trackId) => String(trackId ?? "").trim())
    .filter((trackId) => trackId && !seenTrackIds.has(trackId));
  for (const trackId of trackIds) {
    seenTrackIds.add(trackId);
  }

  return {
    id: String(source.id ?? "").trim() || foundry.utils.randomID(),
    name: String(source.name ?? "").trim(),
    collapsed: Boolean(source.collapsed),
    trackIds,
  };
}

function normalizeMusicPlaylistEntry(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const seenTrackIds = new Set();
  const folders = normalizeArray(source.folders)
    .map((folder) => normalizeMusicPlaylistFolderEntry(folder, seenTrackIds));
  const rootTrackIds = normalizeArray(source.trackIds)
    .map((trackId) => String(trackId ?? "").trim())
    .filter((trackId) => trackId && !seenTrackIds.has(trackId));
  for (const trackId of rootTrackIds) {
    seenTrackIds.add(trackId);
  }
  return {
    ...source,
    id: String(source.id ?? "").trim() || foundry.utils.randomID(),
    name: String(source.name ?? "").trim(),
    loop: Boolean(source.loop),
    shuffle: Boolean(source.shuffle),
    trackIds: rootTrackIds,
    folders,
  };
}

function cloneMusicPlaylistEntry(raw) {
  const playlist = normalizeMusicPlaylistEntry(raw);
  return {
    ...playlist,
    trackIds: [...playlist.trackIds],
    folders: playlist.folders.map((folder) => ({
      ...folder,
      trackIds: [...folder.trackIds],
    })),
  };
}

function getMusicPlaylistFolders(playlist) {
  const normalized = normalizeMusicPlaylistEntry(playlist);
  return normalized.folders.map((folder) => ({
    ...folder,
    trackIds: [...folder.trackIds],
  }));
}

function getMusicPlaylistOrderedTrackIds(playlist, validTrackIds = null) {
  const normalized = normalizeMusicPlaylistEntry(playlist);
  const orderedIds = [
    ...normalized.trackIds,
    ...normalized.folders.flatMap((folder) => folder.trackIds),
  ];
  if (!(validTrackIds instanceof Set)) return orderedIds;
  return orderedIds.filter((trackId) => validTrackIds.has(trackId));
}

function getMusicPlaylistTrackContainerIds(playlist, folderId = null) {
  const normalized = normalizeMusicPlaylistEntry(playlist);
  if (!folderId) {
    return [...normalized.trackIds];
  }

  const folder = normalized.folders.find((entry) => entry.id === folderId);
  return folder ? [...folder.trackIds] : [];
}

function upsertMusicPlaylistTrackContainerIds(playlist, folderId, trackIds) {
  const normalized = cloneMusicPlaylistEntry(playlist);
  const nextTrackIds = normalizeArray(trackIds)
    .map((trackId) => String(trackId ?? "").trim())
    .filter(Boolean);

  if (!folderId) {
    normalized.trackIds = nextTrackIds;
    return normalizeMusicPlaylistEntry(normalized);
  }

  const folderIndex = normalized.folders.findIndex((entry) => entry.id === folderId);
  if (folderIndex === -1) return normalized;

  normalized.folders[folderIndex] = {
    ...normalized.folders[folderIndex],
    trackIds: nextTrackIds,
  };
  return normalizeMusicPlaylistEntry(normalized);
}

function removeTrackFromMusicPlaylistEntry(playlist, trackId) {
  if (!trackId) return cloneMusicPlaylistEntry(playlist);
  const normalized = cloneMusicPlaylistEntry(playlist);
  normalized.trackIds = normalized.trackIds.filter((entry) => entry !== trackId);
  normalized.folders = normalized.folders.map((folder) => ({
    ...folder,
    trackIds: folder.trackIds.filter((entry) => entry !== trackId),
  }));
  return normalizeMusicPlaylistEntry(normalized);
}

function placeTrackInMusicPlaylistEntry(playlist, trackId, {
  folderId = null,
  beforeTrackId = null,
  insertAfter = false,
} = {}) {
  const normalizedTrackId = String(trackId ?? "").trim();
  if (!normalizedTrackId) return cloneMusicPlaylistEntry(playlist);

  const basePlaylist = cloneMusicPlaylistEntry(playlist);
  const normalizedFolderId = String(folderId ?? "").trim() || null;
  const targetFolderId = normalizedFolderId && basePlaylist.folders.some((entry) => entry.id === normalizedFolderId)
    ? normalizedFolderId
    : null;

  let nextPlaylist = removeTrackFromMusicPlaylistEntry(basePlaylist, normalizedTrackId);
  const containerTrackIds = getMusicPlaylistTrackContainerIds(nextPlaylist, targetFolderId);
  let insertIndex = containerTrackIds.length;
  if (beforeTrackId) {
    const targetIndex = containerTrackIds.indexOf(String(beforeTrackId));
    if (targetIndex !== -1) {
      insertIndex = insertAfter ? targetIndex + 1 : targetIndex;
    }
  }

  containerTrackIds.splice(clampNumber(insertIndex, 0, containerTrackIds.length), 0, normalizedTrackId);
  nextPlaylist = upsertMusicPlaylistTrackContainerIds(nextPlaylist, targetFolderId, containerTrackIds);
  return normalizeMusicPlaylistEntry(nextPlaylist);
}

function createMusicPlaylistFolderEntry(name = "") {
  return {
    id: foundry.utils.randomID(),
    name: String(name ?? "").trim(),
    collapsed: false,
    trackIds: [],
  };
}

function normalizeTrackFolderEntry(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    id: String(source.id ?? "").trim() || foundry.utils.randomID(),
    name: String(source.name ?? "").trim(),
    collapsed: Boolean(source.collapsed),
  };
}

function normalizeTrackRootName(value) {
  return String(value ?? "").trim();
}

function normalizeTrackFolderId(value, folders = []) {
  const folderId = String(value ?? "").trim();
  if (!folderId) return "";
  return normalizeArray(folders).some((folder) => String(folder?.id ?? "") === folderId)
    ? folderId
    : "";
}

function createTrackFolderEntry(name = "") {
  return {
    id: foundry.utils.randomID(),
    name: String(name ?? "").trim(),
    collapsed: false,
  };
}

function getPlaylistTrackEditorName(track) {
  return untitledName(track?.name);
}

function getPlaylistTrackGroupsForEditor(tracks, folders = [], selectedTrackIds = [], rootName = "") {
  const normalizedTracks = tracks.map((track) => ({
    ...track,
    name: getPlaylistTrackEditorName(track),
  }));
  const sortedTracks = sortEntriesByName(normalizedTracks);
  const sortedFolders = sortEntriesByName(normalizeArray(folders).map((folder) => normalizeTrackFolderEntry(folder)));
  const orderedTracks = selectedTrackIds.length
    ? (() => {
      const selectedSet = new Set(selectedTrackIds);
      const trackMap = new Map(sortedTracks.map((track) => [track.id, track]));
      const selectedTracks = selectedTrackIds
        .map((trackId) => trackMap.get(trackId))
        .filter(Boolean);
      const unselectedTracks = sortedTracks.filter((track) => !selectedSet.has(track.id));
      return [...selectedTracks, ...unselectedTracks];
    })()
    : sortedTracks;

  const groups = [
    {
      id: "",
      key: "__root__",
      name: normalizeTrackRootName(rootName) || t("Common.WithoutFolder", "Without folder"),
      tracks: [],
    },
    ...sortedFolders.map((folder) => ({
      id: folder.id,
      key: folder.id,
      name: untitledName(folder.name),
      tracks: [],
    })),
  ];
  const groupMap = new Map(groups.map((group) => [group.id, group]));
  const validFolderIds = new Set(sortedFolders.map((folder) => folder.id));

  for (const track of orderedTracks) {
    const folderId = normalizeTrackFolderId(track.folderId, sortedFolders);
    const targetGroup = groupMap.get(validFolderIds.has(folderId) ? folderId : "");
    targetGroup?.tracks.push(track);
  }

  return groups.filter((group) => group.tracks.length > 0);
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

  const updateGroupState = (groupHeader) => {
    if (!(groupHeader instanceof HTMLElement)) return;
    const toggle = groupHeader.querySelector("input[data-folder-toggle]");
    if (!(toggle instanceof HTMLInputElement)) return;

    const folderKey = groupHeader.dataset.folderKey ?? "";
    const rowCheckboxes = [...list.querySelectorAll(`[data-track-row][data-folder-key='${folderKey}'] input[name='trackIds']`)]
      .filter((entry) => entry instanceof HTMLInputElement);
    const checkedCount = rowCheckboxes.filter((checkbox) => checkbox.checked).length;
    toggle.checked = rowCheckboxes.length > 0 && checkedCount === rowCheckboxes.length;
    toggle.indeterminate = checkedCount > 0 && checkedCount < rowCheckboxes.length;
  };

  list.querySelectorAll("[data-track-row]").forEach((row) => {
    updateCheckedState(row);
  });
  list.querySelectorAll("[data-track-group]").forEach((groupHeader) => {
    updateGroupState(groupHeader);
  });
  syncPlaylistTrackOrderInput(form);

  let draggedRow = null;

  list.addEventListener("change", (event) => {
    const folderToggle = event.target.closest("input[data-folder-toggle]");
    if (folderToggle instanceof HTMLInputElement) {
      const groupHeader = folderToggle.closest("[data-track-group]");
      const folderKey = groupHeader instanceof HTMLElement ? (groupHeader.dataset.folderKey ?? "") : "";
      list.querySelectorAll(`[data-track-row][data-folder-key='${folderKey}'] input[name='trackIds']`).forEach((checkbox) => {
        if (checkbox instanceof HTMLInputElement) {
          checkbox.checked = folderToggle.checked;
          const row = checkbox.closest("[data-track-row]");
          if (row instanceof HTMLElement) updateCheckedState(row);
        }
      });
      updateGroupState(groupHeader);
      syncPlaylistTrackOrderInput(form);
      return;
    }

    const checkbox = event.target.closest("input[name='trackIds']");
    if (!(checkbox instanceof HTMLInputElement)) return;
    const row = checkbox.closest("[data-track-row]");
    if (row instanceof HTMLElement) updateCheckedState(row);
    const groupHeader = row?.closest("[data-playlist-track-picker]")?.querySelector(`[data-track-group][data-folder-key='${row?.dataset.folderKey ?? ""}']`);
    if (groupHeader instanceof HTMLElement) updateGroupState(groupHeader);
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
  return normalizeArray(storageState.playlists).map((entry) => normalizeMusicPlaylistEntry(entry));
}

function getTrackFolders() {
  return normalizeArray(storageState.trackFolders).map((entry) => normalizeTrackFolderEntry(entry));
}

function getTrackRootName() {
  return normalizeTrackRootName(storageState.trackRootName);
}

function getAmbienceTracks() {
  return normalizeArray(storageState.ambienceTracks);
}

function getAmbiencePlaylists() {
  return normalizeArray(storageState.ambiencePlaylists);
}

function getAmbienceTrackFolders() {
  return normalizeArray(storageState.ambienceTrackFolders).map((entry) => normalizeTrackFolderEntry(entry));
}

function getAmbienceTrackRootName() {
  return normalizeTrackRootName(storageState.ambienceTrackRootName);
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
    const mergedData = {
      ...cloneStorageData(),
      ...(nextData && typeof nextData === "object" ? nextData : {}),
    };
    applyStorageData(mergedData);
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
  await setStorageValue("playlists", normalizeArray(playlists).map((entry) => normalizeMusicPlaylistEntry(entry)));
}

async function setTrackFolders(folders) {
  await setStorageValue("trackFolders", normalizeArray(folders).map((entry) => normalizeTrackFolderEntry(entry)));
}

async function setTrackRootName(name) {
  await setStorageValue("trackRootName", normalizeTrackRootName(name));
}

async function setAmbienceTracks(tracks) {
  await setStorageValue("ambienceTracks", normalizeArray(tracks));
}

async function setAmbiencePlaylists(playlists) {
  await setStorageValue("ambiencePlaylists", normalizeArray(playlists));
}

async function setAmbienceTrackFolders(folders) {
  await setStorageValue("ambienceTrackFolders", normalizeArray(folders).map((entry) => normalizeTrackFolderEntry(entry)));
}

async function setAmbienceTrackRootName(name) {
  await setStorageValue("ambienceTrackRootName", normalizeTrackRootName(name));
}

async function setAmbienceAllowConcurrent(enabled) {
  await setStorageValue("ambienceAllowConcurrent", Boolean(enabled));
}

async function persistNormalizationCacheToStorage() {
  await setStorageValue("normalizationCache", exportCurrentNormalizationCacheStore());
}

async function persistStoredNormalizationReference(channel, referenceDb) {
  const channelKey = getNormalizationChannelKey(channel);
  if (!storageLoaded) {
    await initializeStorageState();
  }
  const nextReferences = cloneNormalizationReferenceStore(storageState.normalizationReferences);
  nextReferences[channelKey] = normalizeOptionalDecibel(referenceDb);
  await setStorageValue("normalizationReferences", nextReferences);
}

function countPlaylistTracks(playlist, validTrackIds) {
  const ids = getMusicPlaylistOrderedTrackIds(playlist, validTrackIds instanceof Set ? validTrackIds : null);
  if (!(validTrackIds instanceof Set)) return ids.length;
  return ids.length;
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
  }
  refreshLiveControlsUi();
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
  }
  refreshLiveControlsUi();
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
  }
  refreshLiveControlsUi();
}

function applyMusicVolumeToCurrentPlayback({ volume = getLiveMusicVolume(), force = false } = {}) {
  const current = playbackState.current;
  if (!current?.sound) return;

  if (current.paused && !force) return;
  const effectiveVolume = getEffectiveMusicVolume({
    liveMusicVolume: volume,
    normalizationGain: current.normalizationGain,
  });
  applySoundVolume(current.sound, effectiveVolume);
}

async function applyManualNormalizationReference(channel, milliHertzValue) {
  const channelKey = getNormalizationChannelKey(channel);
  const channelLabel = channelKey === "ambience"
    ? t("Common.Ambience", "Ambience")
    : t("Common.Music", "Music");
  const referenceDb = milliHertzToDecibel(milliHertzValue);

  if (!Number.isFinite(referenceDb)) {
    ui.notifications.warn(
      tf(
        "Notifications.ManualNormalizationInvalid",
        { channel: channelLabel },
        ({ channel: label }) => `TS-DJ-MUSIC: enter a valid ${String(label).toLowerCase()} normalization value in mHz greater than 0.`,
      ),
    );
    return false;
  }

  applyStoredNormalizationReference(channelKey, referenceDb, { refresh: true });
  await persistStoredNormalizationReference(channelKey, referenceDb);
  ui.notifications.info(
    tf(
      "Notifications.ManualNormalizationApplied",
      { channel: channelLabel, value: formatMilliHertz(referenceDb) },
      ({ channel: label, value }) => `TS-DJ-MUSIC: ${label} normalization reference set to ${value}.`,
    ),
  );
  return true;
}

async function resetManualNormalizationReference(channel) {
  const channelKey = getNormalizationChannelKey(channel);
  const channelLabel = channelKey === "ambience"
    ? t("Common.Ambience", "Ambience")
    : t("Common.Music", "Music");

  applyStoredNormalizationReference(channelKey, null, { refresh: true });
  await persistStoredNormalizationReference(channelKey, null);
  ui.notifications.info(
    tf(
      "Notifications.ManualNormalizationReset",
      { channel: channelLabel },
      ({ channel: label }) => `TS-DJ-MUSIC: manual ${String(label).toLowerCase()} normalization reference cleared.`,
    ),
  );
  return true;
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
    if (!syncSidebarLiveControls(root)) {
      injectPlaylistDirectoryRateControl(root);
    }
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
  clearSessionNormalizationState({ refresh: false });
  await setLiveRate(DEFAULT_CLIENT_SETTINGS.liveRate, { apply: true });
  await setLiveMusicVolume(DEFAULT_CLIENT_SETTINGS.liveMusicVolume, { apply: true });
  await setLiveAmbienceVolume(DEFAULT_CLIENT_SETTINGS.liveAmbienceVolume, { apply: true });
  await game.settings.set(MODULE_ID, SETTING_KEYS.collapseGlobalVolumeByDefault, DEFAULT_CLIENT_SETTINGS.collapseGlobalVolumeByDefault);
  await game.settings.set(MODULE_ID, SETTING_KEYS.collapseTsDjPlaylistsByDefault, DEFAULT_CLIENT_SETTINGS.collapseTsDjPlaylistsByDefault);
  await game.settings.set(MODULE_ID, SETTING_KEYS.collapseFoundryPlaylistsByDefault, DEFAULT_CLIENT_SETTINGS.collapseFoundryPlaylistsByDefault);
  await game.settings.set(MODULE_ID, SETTING_KEYS.collapseManagerNormalizationByDefault, DEFAULT_CLIENT_SETTINGS.collapseManagerNormalizationByDefault);
  await game.settings.set(MODULE_ID, SETTING_KEYS.collapseManagerFilesByDefault, DEFAULT_CLIENT_SETTINGS.collapseManagerFilesByDefault);
  await game.settings.set(MODULE_ID, SETTING_KEYS.collapseManagerMusicByDefault, DEFAULT_CLIENT_SETTINGS.collapseManagerMusicByDefault);
  await game.settings.set(MODULE_ID, SETTING_KEYS.collapseManagerAmbienceByDefault, DEFAULT_CLIENT_SETTINGS.collapseManagerAmbienceByDefault);
  await game.settings.set(MODULE_ID, SETTING_KEYS.collapseManagerNowPlayingByDefault, DEFAULT_CLIENT_SETTINGS.collapseManagerNowPlayingByDefault);
  await game.settings.set(MODULE_ID, SETTING_KEYS.collapseManagerMusicPlaylistsByDefault, DEFAULT_CLIENT_SETTINGS.collapseManagerMusicPlaylistsByDefault);
  await game.settings.set(MODULE_ID, SETTING_KEYS.collapseManagerMusicTracksByDefault, DEFAULT_CLIENT_SETTINGS.collapseManagerMusicTracksByDefault);
  await game.settings.set(MODULE_ID, SETTING_KEYS.collapseManagerAmbiencePlaylistsByDefault, DEFAULT_CLIENT_SETTINGS.collapseManagerAmbiencePlaylistsByDefault);
  await game.settings.set(MODULE_ID, SETTING_KEYS.collapseManagerAmbienceTracksByDefault, DEFAULT_CLIENT_SETTINGS.collapseManagerAmbienceTracksByDefault);
  sidebarUiState.defaultsLoaded = false;
  managerUiState.defaultsLoaded = false;
  refreshPlaylistDirectoryUi();
  if (appInstance?.rendered) {
    appInstance.render(false);
  }
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

  managerUiState.defaultsLoaded = false;
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
  const playlistQueue = getMusicPlaylistOrderedTrackIds(playlist, new Set(trackMap.keys()));
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

  const normalization = await preAnalyzeTrackNormalizationBeforePlayback(track, file.path, { channel: "music" });
  if (playbackState.requestId !== requestId) {
    return false;
  }

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
  const effectiveVolume = getEffectiveMusicVolume({
    liveMusicVolume,
    normalizationGain: normalization.gain,
  });
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
    volume: effectiveVolume,
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
  applySoundVolume(sound, effectiveVolume);
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
    normalizationEnabled: normalization.enabled,
    normalizationGain: normalization.gain,
    normalizationDb: normalization.loudnessDb,
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

  const normalization = await preAnalyzeTrackNormalizationBeforePlayback(track, file.path, {
    channel: "ambience",
    preloadChannel: "environment",
  });
  if (!ambienceState.pending.has(requestId)) {
    return false;
  }

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
  const ambienceVolume = getEffectiveAmbienceVolumeForSound(sound, {
    normalizationGain: normalization.gain,
  });
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
    normalizationEnabled: normalization.enabled,
    normalizationGain: normalization.gain,
    normalizationDb: normalization.loudnessDb,
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
  clearNormalizationTracker(current);

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
  clearNormalizationTracker(current);

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
  clearNormalizationTracker(entry);
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
  clearNormalizationTracker(entry);

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
  clearNormalizationTracker(current);

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

function getCurrentPlaybackSeekState(current = playbackState.current) {
  if (!current) return null;

  const track = getTracks().find((entry) => entry.id === current.trackId) ?? null;
  const clipStart = Number.isFinite(current.clipStart) ? Number(current.clipStart) : parseTimeInput(track?.start) ?? 0;
  const requestedClipEnd = Number.isFinite(current.clipEnd) ? Number(current.clipEnd) : parseTimeInput(track?.end);
  const soundDuration = getSoundDuration(current.sound);
  const clipEnd = Number.isFinite(requestedClipEnd)
    ? Number(requestedClipEnd)
    : Number.isFinite(soundDuration)
      ? Number(soundDuration)
      : null;
  const canSeek = Number.isFinite(clipEnd) && clipEnd > clipStart;

  return {
    current,
    track,
    clipStart,
    clipEnd,
    canSeek,
    maxSeekTime: canSeek ? Math.max(clipStart, clipEnd - 0.01) : clipStart,
  };
}

async function seekCurrentPlayback(timeSec, options = {}) {
  const { sync = true } = options;
  if (sync && !ensureModuleControlAccess()) return false;

  const seekState = getCurrentPlaybackSeekState();
  if (!seekState?.canSeek) return false;

  const current = seekState.current;
  const targetTime = clampNumber(Number(timeSec), seekState.clipStart, seekState.maxSeekTime);
  const appliedRate = normalizeRate(Number(current.timingRate ?? current.defaultRate ?? getLiveRate()));

  if (current.paused) {
    current.pausedAt = targetTime;
    current.timingBaseAbs = targetTime;
    current.timingBaseMs = Date.now();
    current.timingRate = appliedRate;
    updateSidebarProgressUi();
    updateManagerProgressUi();
    if (sync) {
      emitModuleSocketEvent(SOCKET_ACTIONS.seekPlayback, { timeSec: targetTime });
    }
    return true;
  }

  clearClipEndMonitor(current);
  current.ignoreEndedUntil = Date.now() + 1200;

  if (seekSoundToTime(current.sound, targetTime)) {
    current.pausedAt = null;
    current.timingBaseAbs = targetTime;
    current.timingBaseMs = Date.now();
    current.timingRate = appliedRate;

    if (Number.isFinite(seekState.clipEnd) && !current.loopEnabled) {
      current.clipMonitorId = startClipEndMonitor(current.sound, seekState.clipStart, seekState.clipEnd, current.token);
    }

    await ensureSoundKeepsPlaying(current.sound);
    updateSidebarProgressUi();
    updateManagerProgressUi();
    startSidebarProgressTicker();

    if (sync) {
      emitModuleSocketEvent(SOCKET_ACTIONS.seekPlayback, { timeSec: targetTime });
    }
    return true;
  }

  if (!seekState.track) return false;

  const queue = Array.isArray(current.queue) && current.queue.length
    ? [...current.queue]
    : [seekState.track.id];
  const restarted = await playTrack(seekState.track, {
    mode: current.mode ?? "track",
    playlistId: current.playlistId ?? null,
    queue,
    index: Number.isFinite(current.index) ? current.index : 0,
    playlistLoop: Boolean(current.playlistLoop),
    playlistShuffle: Boolean(current.playlistShuffle),
    loopOverride: Boolean(current.loopEnabled),
    playOffset: targetTime,
  });

  if (sync && restarted) {
    emitModuleSocketEvent(SOCKET_ACTIONS.seekPlayback, { timeSec: targetTime });
  }
  return restarted;
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
    initializeManagerSectionStateFromSettings();

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
        normalizeTitle: t("Common.Normalize", "Normalize"),
        normalizeLabel: yesNo(isTrackNormalizationEnabled(track)),
        loop: Boolean(track.loop),
        folderId: String(track.folderId ?? "").trim(),
        active,
        playAction: active ? (paused ? "resume-current" : "pause-current") : "play-track",
        playIcon: active && !paused ? "fa-pause" : "fa-play",
        draggable: true,
      };
    }));

    const trackMap = new Map(tracks.map((track) => [track.id, track]));
    const trackFolders = sortEntriesByName(getTrackFolders().map((folder) => {
      const folderId = String(folder.id ?? "").trim();
      const folderTracks = tracks.filter((track) => track.folderId === folderId);
      return {
        ...folder,
        name: untitledName(folder.name),
        trackCount: folderTracks.length,
        collapsed: Boolean(folder.collapsed),
        trackEntries: folderTracks,
        hasTracks: folderTracks.length > 0,
      };
    }));
    const looseTracks = tracks.filter((track) => !normalizeTrackFolderId(track.folderId, trackFolders));
    const musicRootName = getTrackRootName() || t("Common.WithoutFolder", "Without folder");

    const playlists = sortEntriesByName(getPlaylists().map((playlist) => {
      const validTrackIds = getMusicPlaylistOrderedTrackIds(playlist, new Set(trackMap.keys()));
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
        normalizeTitle: t("Common.Normalize", "Normalize"),
        normalizeLabel: yesNo(isTrackNormalizationEnabled(track)),
        loop: Boolean(track.loop),
        folderId: String(track.folderId ?? "").trim(),
        active,
        playAction: active ? "stop-ambience-track" : "play-ambience-track",
        playIcon: active ? "fa-stop" : "fa-play",
        draggable: true,
      };
    }));

    const ambienceTrackFolders = sortEntriesByName(getAmbienceTrackFolders().map((folder) => {
      const folderId = String(folder.id ?? "").trim();
      const folderTracks = ambienceTracks.filter((track) => track.folderId === folderId);
      return {
        ...folder,
        name: untitledName(folder.name),
        trackCount: folderTracks.length,
        collapsed: Boolean(folder.collapsed),
        trackEntries: folderTracks,
        hasTracks: folderTracks.length > 0,
      };
    }));
    const looseAmbienceTracks = ambienceTracks.filter((track) => !normalizeTrackFolderId(track.folderId, ambienceTrackFolders));
    const ambienceRootName = getAmbienceTrackRootName() || t("Common.WithoutFolder", "Without folder");

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
    const nowPlaying = getManagerNowPlayingDetails(tracks, playlists, files);
    const liveRate = getLiveRate();
    const liveMusicVolume = getLiveMusicVolume();
    const liveAmbienceVolume = getLiveAmbienceVolume();

    return {
      liveRate,
      liveRateLabel: formatRate(liveRate),
      normalizationSectionTitle: t("Common.Normalization", "Normalization"),
      musicAutoLevelLabel: t("App.MusicNormalization", localizedFallback("РќРѕСЂРј. РјСѓР·С‹РєРё:", "Norm. music:")),
      musicAutoLevelMonitor: getNormalizationMonitorLabel("music"),
      musicNormalizationInputValue: formatManualNormalizationInputValue("music"),
      musicNormalizationScanButtons: getNormalizationScanButtons("music"),
      normalizationSetLabel: t("Settings.ManualNormalizationSet", "Set"),
      normalizationResetLabel: t("Settings.ManualNormalizationReset", "Reset"),
      ambienceAutoLevelLabel: t("App.AmbienceNormalization", localizedFallback("РќРѕСЂРј. СЌРјР±РёРµРЅСЃР°:", "Norm. ambience:")),
      ambienceAutoLevelMonitor: getNormalizationMonitorLabel("ambience"),
      ambienceNormalizationInputValue: formatManualNormalizationInputValue("ambience"),
      ambienceNormalizationScanButtons: getNormalizationScanButtons("ambience"),
      liveMusicVolume,
      liveMusicVolumeLabel: formatVolumePercent(liveMusicVolume),
      liveAmbienceVolume,
      liveAmbienceVolumeLabel: formatVolumePercent(liveAmbienceVolume),
      ambienceAllowConcurrent: getAmbienceAllowConcurrent(),
      files,
      tracks,
      trackFolders,
      musicRootName,
      looseTracks,
      musicRootCollapsed: !Boolean(managerTrackRootExpandState.music),
      musicRootTrackCount: looseTracks.length,
      playlists,
      ambienceTracks,
      ambienceTrackFolders,
      ambienceRootName,
      looseAmbienceTracks,
      ambienceRootCollapsed: !Boolean(managerTrackRootExpandState.ambience),
      ambienceRootTrackCount: looseAmbienceTracks.length,
      ambiencePlaylists,
      hasFiles: files.length > 0,
      hasTracks: tracks.length > 0,
      hasTrackFolders: trackFolders.length > 0,
      hasTrackGroups: tracks.length > 0 || trackFolders.length > 0,
      hasPlaylists: playlists.length > 0,
      hasAmbienceTracks: ambienceTracks.length > 0,
      hasAmbienceTrackFolders: ambienceTrackFolders.length > 0,
      hasAmbienceTrackGroups: ambienceTracks.length > 0 || ambienceTrackFolders.length > 0,
      hasAmbiencePlaylists: ambiencePlaylists.length > 0,
      isPlaying: Boolean(playbackState.current),
      currentLabel,
      nowPlaying,
      nowPlayingTitle: t("Status.NowPlayingTitle", localizedFallback("Сейчас играет", "Now playing")),
      nowPlayingSourceTitle: t("Status.Source", localizedFallback("Источник", "Source")),
      nowPlayingVolumesTitle: t("Status.Volumes", localizedFallback("Громкости", "Volumes")),
      nowPlayingHertzTitle: t("Status.Hertz", localizedFallback("Герцы", "Hertz")),
      nowPlayingSpeedsTitle: t("Status.Speeds", localizedFallback("Скорости", "Speeds")),
      nowPlayingClipTitle: t("Common.Clip", "Clip"),
      nowPlayingProgressTitle: t("Status.Progress", localizedFallback("Прогресс", "Progress")),
      managerSections: {
        normalization: Boolean(managerSectionState.normalization),
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
        const resetManagerPlaylistDragState = () => {
          managerPlaylistDragState.source = null;
          managerPlaylistDragState.kind = null;
          managerPlaylistDragState.playlistId = null;
          managerPlaylistDragState.folderId = null;
          managerPlaylistDragState.trackId = null;
        };

        root.addEventListener("dragstart", (event) => {
          const row = event.target.closest("[data-manager-playlist-track-row]");
          if (row instanceof HTMLElement) {
            managerPlaylistDragState.source = "playlist";
            managerPlaylistDragState.kind = row.dataset.playlistKind ?? null;
            managerPlaylistDragState.playlistId = row.dataset.playlistId ?? null;
            managerPlaylistDragState.folderId = row.dataset.folderId ?? null;
            managerPlaylistDragState.trackId = row.dataset.trackId ?? null;
            row.classList.add("is-dragging");

            event.dataTransfer?.setData("text/plain", managerPlaylistDragState.trackId ?? "");
            if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
          }
        });

        root.addEventListener("dragend", (event) => {
          const row = event.target.closest("[data-manager-playlist-track-row]");
          if (row instanceof HTMLElement) {
            row.classList.remove("is-dragging");
          }
          resetManagerPlaylistDragState();
        });

        root.addEventListener("dragover", (event) => {
          const list = event.target.closest("[data-manager-playlist-track-list]");
          if (!(list instanceof HTMLElement)) return;
          if (!managerPlaylistDragState.trackId) return;
          if (list.dataset.playlistKind !== managerPlaylistDragState.kind) return;
          if (list.dataset.playlistId !== managerPlaylistDragState.playlistId) return;
          event.preventDefault();
          autoScrollContainerOnDrag(event, list.closest(".ts-dj-list"));

          const targetRow = event.target.closest("[data-manager-playlist-track-row]");
          if (!(targetRow instanceof HTMLElement)) return;
          if (targetRow.dataset.trackId === managerPlaylistDragState.trackId) return;

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

          resetManagerPlaylistDragState();
        });
      }

      if (!root.dataset.managerTrackFolderDndBound) {
        root.dataset.managerTrackFolderDndBound = "true";
        const clearTrackDropZones = () => {
          root.querySelectorAll("[data-manager-track-drop-zone].is-drop-target").forEach((zone) => {
            zone.classList.remove("is-drop-target");
          });
        };
        const resetTrackFolderDragState = () => {
          clearTrackDropZones();
          managerTrackFolderDragState.kind = null;
          managerTrackFolderDragState.trackId = null;
        };

        root.addEventListener("dragstart", (event) => {
          const row = event.target.closest("[data-manager-track-row]");
          if (!(row instanceof HTMLElement)) return;
          managerTrackFolderDragState.kind = row.dataset.trackKind ?? null;
          managerTrackFolderDragState.trackId = row.dataset.trackId ?? null;
          row.classList.add("is-dragging");
          event.dataTransfer?.setData("text/plain", managerTrackFolderDragState.trackId ?? "");
          if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
        });

        root.addEventListener("dragend", (event) => {
          const row = event.target.closest("[data-manager-track-row]");
          if (row instanceof HTMLElement) {
            row.classList.remove("is-dragging");
          }
          resetTrackFolderDragState();
        });

        root.addEventListener("dragover", (event) => {
          const dropZone = event.target.closest("[data-manager-track-drop-zone]");
          if (!(dropZone instanceof HTMLElement)) return;
          if (!managerTrackFolderDragState.trackId) return;
          if (dropZone.dataset.trackKind !== managerTrackFolderDragState.kind) return;
          event.preventDefault();
          autoScrollContainerOnDrag(event, dropZone.closest(".ts-dj-list"));
          clearTrackDropZones();
          dropZone.classList.add("is-drop-target");
        });

        root.addEventListener("drop", async (event) => {
          const dropZone = event.target.closest("[data-manager-track-drop-zone]");
          if (!(dropZone instanceof HTMLElement)) return;
          if (!managerTrackFolderDragState.trackId) return;
          if (dropZone.dataset.trackKind !== managerTrackFolderDragState.kind) return;
          event.preventDefault();

          const folderId = dropZone.dataset.folderId ?? "";
          if (managerTrackFolderDragState.kind === "music") {
            await this.#moveTrackToFolder(managerTrackFolderDragState.trackId, folderId);
          } else if (managerTrackFolderDragState.kind === "ambience") {
            await this.#moveAmbienceTrackToFolder(managerTrackFolderDragState.trackId, folderId);
          }

          resetTrackFolderDragState();
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
        case "create-tracks-from-file":
          await this.#createTracksFromFile(id);
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
          await this.#createOrEditTrack(null, { folderId: event.currentTarget.dataset.folderId ?? "" });
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
        case "create-track-folder":
          await this.#createTrackFolder();
          break;
        case "edit-track-root-folder":
          await this.#editTrackRootFolder();
          break;
        case "edit-track-folder":
          await this.#editTrackFolder(id);
          break;
        case "toggle-track-folder":
          await this.#toggleTrackFolderCollapsed(id);
          break;
        case "toggle-track-root-folder":
          managerTrackRootExpandState.music = !managerTrackRootExpandState.music;
          await this.#refreshCards([MANAGER_CARD_IDS.musicTracks]);
          break;
        case "delete-track-folder":
          await this.#deleteTrackFolder(id);
          break;
        case "create-playlist":
          await this.#createOrEditPlaylist();
          break;
        case "transfer-playlist": {
          const transferred = await transferMusicPlaylist();
          if (transferred?.action === "import" && transferred?.applied) {
            await initializeStorageState();
            refreshPlaylistDirectoryUi();
            await this.#refreshCards([
              MANAGER_CARD_IDS.files,
              MANAGER_CARD_IDS.musicTracks,
              MANAGER_CARD_IDS.musicPlaylists,
            ], { refreshToolbar: true });

            const info = transferred.summary ?? {};
            notify("info", "PlaylistImportAppliedSummary", {
              files: info.importedFiles ?? 0,
              tracks: info.musicTracks ?? 0,
              playlists: info.musicPlaylists ?? 0,
            }, ({ files, tracks, playlists }) =>
              `TS-DJ-MUSIC: playlist import complete. Files ${files}, tracks ${tracks}, playlists ${playlists}.`
            );
          }
          break;
        }
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
        case "apply-manual-normalization": {
          const channel = event.currentTarget.dataset.channel ?? "music";
          const input = root?.querySelector(`[data-normalization-input='${channel}']`);
          const rawValue = input instanceof HTMLInputElement ? input.value : "";
          await applyManualNormalizationReference(channel, rawValue);
          break;
        }
        case "reset-manual-normalization": {
          const channel = event.currentTarget.dataset.channel ?? "music";
          await resetManualNormalizationReference(channel);
          break;
        }
        case "scan-normalization-tracks": {
          const channel = event.currentTarget.dataset.channel ?? "music";
          const profileId = event.currentTarget.dataset.normalizationScanProfile ?? DEFAULT_NORMALIZATION_SCAN_PROFILE;
          await scanNormalizationTracks(channel, profileId);
          break;
        }
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
          await this.#createOrEditAmbienceTrack(null, { folderId: event.currentTarget.dataset.folderId ?? "" });
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
        case "create-ambience-track-folder":
          await this.#createAmbienceTrackFolder();
          break;
        case "edit-ambience-track-root-folder":
          await this.#editAmbienceTrackRootFolder();
          break;
        case "edit-ambience-track-folder":
          await this.#editAmbienceTrackFolder(id);
          break;
        case "toggle-ambience-track-folder":
          await this.#toggleAmbienceTrackFolderCollapsed(id);
          break;
        case "toggle-ambience-track-root-folder":
          managerTrackRootExpandState.ambience = !managerTrackRootExpandState.ambience;
          await this.#refreshCards([MANAGER_CARD_IDS.ambienceTracks]);
          break;
        case "delete-ambience-track-folder":
          await this.#deleteAmbienceTrackFolder(id);
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

    html.on("click", "[data-now-playing-progress-bar]", async (event) => {
      if (event.button !== 0) return;
      const progressBar = event.currentTarget;
      if (!(progressBar instanceof HTMLElement)) return;

      const seekState = getCurrentPlaybackSeekState();
      if (!seekState?.canSeek) return;

      const bounds = progressBar.getBoundingClientRect();
      if (!Number.isFinite(bounds.width) || bounds.width <= 0) return;

      const ratio = clampNumber((event.clientX - bounds.left) / bounds.width, 0, 1);
      const targetTime = seekState.clipStart + ((seekState.clipEnd - seekState.clipStart) * ratio);
      await seekCurrentPlayback(targetTime);
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
    return getCurrentPlaybackLabelForManager(tracks, playlists);
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

  async #createTracksFromFile(fileId) {
    if (!fileId) return;
    const file = getFiles().find((entry) => entry.id === fileId);
    if (!file) return;

    const parsedEntries = await promptBulkTrackImportData(file);
    if (!parsedEntries) return;
    if (!parsedEntries.length) {
      notify("warn", "NeedTracks", {}, "No valid track rows were found.");
      return;
    }

    const folderName = untitledName(getDefaultNameFromFileEntry(file));
    const tracks = getTracks();
    const folders = getTrackFolders();
    const existingFolder = folders.find((entry) => String(entry.name ?? "").trim().toLowerCase() === folderName.toLowerCase());
    const folderId = existingFolder?.id ?? foundry.utils.randomID();
    const nextFolders = existingFolder
      ? folders
      : [...folders, { ...createTrackFolderEntry(folderName), id: folderId, name: folderName }];

    const nextTracks = [
      ...tracks,
      ...parsedEntries.map((entry) => ({
        id: foundry.utils.randomID(),
        name: entry.name,
        fileId,
        folderId,
        start: entry.start,
        end: entry.end,
        rate: 1,
        normalize: true,
        loop: false,
      })),
    ];

    await setStorageData({
      tracks: nextTracks,
      trackFolders: nextFolders,
    });
    await this.#refreshCards([MANAGER_CARD_IDS.files, MANAGER_CARD_IDS.musicTracks]);

    notify("info", "TracksCreated", { count: parsedEntries.length }, ({ count }) => `Created ${count} tracks.`);
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
    const removedTrackIdSet = new Set(removedTrackIds);
    const nextPlaylists = getPlaylists().map((playlist) => {
      let nextPlaylist = cloneMusicPlaylistEntry(playlist);
      for (const trackId of removedTrackIdSet) {
        nextPlaylist = removeTrackFromMusicPlaylistEntry(nextPlaylist, trackId);
      }
      return nextPlaylist;
    });
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
      ...cloneMusicPlaylistEntry(playlist),
      trackIds: [],
      folders: getMusicPlaylistFolders(playlist).map((folder) => ({
        ...folder,
        trackIds: [],
      })),
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

  async #createOrEditTrack(trackId = null, { folderId = "" } = {}) {
    const files = getFiles();
    if (!files.length) {
      notify("warn", "AddFileFirst", {}, "Add at least one file first.");
      return;
    }

    const tracks = getTracks();
    const current = trackId ? tracks.find((entry) => entry.id === trackId) : null;
    const folders = getTrackFolders();
    const targetFolderId = current
      ? normalizeTrackFolderId(current.folderId, folders)
      : normalizeTrackFolderId(folderId, folders);

    const payload = await promptTrackData(current, files);
    if (!payload) return;
    payload.folderId = targetFolderId;

    if (current) {
      const index = tracks.findIndex((entry) => entry.id === trackId);
      tracks[index] = payload;
    } else {
      tracks.push(payload);
    }

    await setTracks(tracks);
    await this.#refreshCards([MANAGER_CARD_IDS.musicTracks, MANAGER_CARD_IDS.musicPlaylists]);
  }

  async #createTrackFolder() {
    const name = await promptPlaylistFolderName();
    if (!name) return;

    const folders = getTrackFolders();
    folders.push(createTrackFolderEntry(name));
    await setTrackFolders(folders);
    await this.#refreshCards([MANAGER_CARD_IDS.musicTracks]);
  }

  async #editTrackRootFolder() {
    const name = await promptPlaylistFolderName(getTrackRootName(), { allowEmpty: true });
    if (name === null) return;
    await setTrackRootName(name);
    await this.#refreshCards([MANAGER_CARD_IDS.musicTracks]);
  }

  async #editTrackFolder(folderId) {
    if (!folderId) return;
    const folders = getTrackFolders();
    const folderIndex = folders.findIndex((entry) => entry.id === folderId);
    if (folderIndex === -1) return;

    const name = await promptPlaylistFolderName(folders[folderIndex].name);
    if (!name) return;

    folders[folderIndex] = {
      ...folders[folderIndex],
      name,
    };
    await setTrackFolders(folders);
    await this.#refreshCards([MANAGER_CARD_IDS.musicTracks]);
  }

  async #toggleTrackFolderCollapsed(folderId) {
    if (!folderId) return;
    const folders = getTrackFolders();
    const folderIndex = folders.findIndex((entry) => entry.id === folderId);
    if (folderIndex === -1) return;
    folders[folderIndex] = {
      ...folders[folderIndex],
      collapsed: !Boolean(folders[folderIndex].collapsed),
    };
    await setTrackFolders(folders);
    await this.#refreshCards([MANAGER_CARD_IDS.musicTracks]);
  }

  async #deleteTrackFolder(folderId) {
    if (!folderId) return;
    const folders = getTrackFolders();
    const folder = folders.find((entry) => entry.id === folderId);
    if (!folder) return;

    const confirmed = await Dialog.confirm({
      title: t("Dialogs.DeleteFolderTitle", "Delete folder"),
      content: tf("Dialogs.DeleteFolderContent", {
        name: escapeHtml(untitledName(folder.name)),
      }, ({ name }) => `<p>Delete folder <b>${name}</b>? Tracks will be moved outside the folder.</p>`),
    });
    if (!confirmed) return;

    const nextTracks = getTracks().map((track) => track.folderId === folderId ? { ...track, folderId: "" } : track);
    const nextFolders = folders.filter((entry) => entry.id !== folderId);
    await setStorageData({
      tracks: nextTracks,
      trackFolders: nextFolders,
    });
    await this.#refreshCards([MANAGER_CARD_IDS.musicTracks]);
  }

  async #moveTrackToFolder(trackId, folderId = "") {
    if (!trackId) return;
    const tracks = getTracks();
    const folders = getTrackFolders();
    const normalizedFolderId = normalizeTrackFolderId(folderId, folders);
    const index = tracks.findIndex((entry) => entry.id === trackId);
    if (index === -1) return;
    if (String(tracks[index].folderId ?? "") === normalizedFolderId) return;

    tracks[index] = {
      ...tracks[index],
      folderId: normalizedFolderId,
    };
    await setTracks(tracks);
    await this.#refreshCards([MANAGER_CARD_IDS.musicTracks]);
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
    const nextPlaylists = getPlaylists().map((playlist) => removeTrackFromMusicPlaylistEntry(playlist, trackId));
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
      ...cloneMusicPlaylistEntry(playlist),
      trackIds: [],
      folders: getMusicPlaylistFolders(playlist).map((folder) => ({
        ...folder,
        trackIds: [],
      })),
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
    const folders = getTrackFolders();
    const playlists = getPlaylists();
    const current = playlistId ? playlists.find((entry) => entry.id === playlistId) : null;

    const payload = await promptPlaylistData(current, tracks, folders, getTrackRootName());
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

  async #createPlaylistFolder(playlistId) {
    const playlists = getPlaylists();
    const playlistIndex = playlists.findIndex((entry) => entry.id === playlistId);
    if (playlistIndex === -1) return;

    const name = await promptPlaylistFolderName();
    if (!name) return;

    playlists[playlistIndex] = {
      ...cloneMusicPlaylistEntry(playlists[playlistIndex]),
      folders: [
        ...getMusicPlaylistFolders(playlists[playlistIndex]),
        createMusicPlaylistFolderEntry(name),
      ],
    };

    await setPlaylists(playlists);
    await this.#refreshCards([MANAGER_CARD_IDS.musicPlaylists]);
  }

  async #togglePlaylistFolderCollapsed(playlistId, folderId) {
    if (!playlistId || !folderId) return;

    const playlists = getPlaylists();
    const playlistIndex = playlists.findIndex((entry) => entry.id === playlistId);
    if (playlistIndex === -1) return;

    const nextPlaylist = cloneMusicPlaylistEntry(playlists[playlistIndex]);
    const folderIndex = nextPlaylist.folders.findIndex((entry) => entry.id === folderId);
    if (folderIndex === -1) return;

    nextPlaylist.folders[folderIndex] = {
      ...nextPlaylist.folders[folderIndex],
      collapsed: !Boolean(nextPlaylist.folders[folderIndex].collapsed),
    };
    playlists[playlistIndex] = nextPlaylist;

    await setPlaylists(playlists);
    await this.#refreshCards([MANAGER_CARD_IDS.musicPlaylists]);
  }

  async #deletePlaylistFolder(playlistId, folderId) {
    if (!playlistId || !folderId) return;

    const playlists = getPlaylists();
    const playlistIndex = playlists.findIndex((entry) => entry.id === playlistId);
    if (playlistIndex === -1) return;

    const nextPlaylist = cloneMusicPlaylistEntry(playlists[playlistIndex]);
    const folder = nextPlaylist.folders.find((entry) => entry.id === folderId);
    if (!folder) return;

    const confirmed = await Dialog.confirm({
      title: t("Dialogs.DeleteFolderTitle", "Delete folder"),
      content: tf("Dialogs.DeleteFolderContent", {
        name: escapeHtml(untitledName(folder.name)),
      }, ({ name }) => `<p>Delete folder <b>${name}</b>? Tracks will be moved outside the folder.</p>`),
    });
    if (!confirmed) return;

    nextPlaylist.trackIds = [...nextPlaylist.trackIds, ...folder.trackIds];
    nextPlaylist.folders = nextPlaylist.folders.filter((entry) => entry.id !== folderId);
    playlists[playlistIndex] = normalizeMusicPlaylistEntry(nextPlaylist);

    await setPlaylists(playlists);
    await this.#refreshCards([MANAGER_CARD_IDS.musicPlaylists]);
  }

  async #dropTrackIntoMusicPlaylist({
    playlistId,
    folderId = null,
    trackId,
    beforeTrackId = null,
    insertAfter = false,
  } = {}) {
    const normalizedTrackId = String(trackId ?? "").trim();
    if (!playlistId || !normalizedTrackId) return;

    const tracks = getTracks();
    if (!tracks.some((entry) => entry.id === normalizedTrackId)) return;

    const playlists = getPlaylists();
    const playlistIndex = playlists.findIndex((entry) => entry.id === playlistId);
    if (playlistIndex === -1) return;

    const currentSnapshot = JSON.stringify(cloneMusicPlaylistEntry(playlists[playlistIndex]));
    playlists[playlistIndex] = placeTrackInMusicPlaylistEntry(playlists[playlistIndex], normalizedTrackId, {
      folderId,
      beforeTrackId,
      insertAfter,
    });
    if (JSON.stringify(cloneMusicPlaylistEntry(playlists[playlistIndex])) === currentSnapshot) return;

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

  async #createOrEditAmbienceTrack(trackId = null, { folderId = "" } = {}) {
    const files = getFiles();
    if (!files.length) {
      notify("warn", "AddFileFirst", {}, "Add at least one file first.");
      return;
    }

    const tracks = getAmbienceTracks();
    const current = trackId ? tracks.find((entry) => entry.id === trackId) : null;
    const folders = getAmbienceTrackFolders();
    const targetFolderId = current
      ? normalizeTrackFolderId(current.folderId, folders)
      : normalizeTrackFolderId(folderId, folders);
    const payload = await promptTrackData(current, files);
    if (!payload) return;
    payload.folderId = targetFolderId;

    if (current) {
      const index = tracks.findIndex((entry) => entry.id === trackId);
      tracks[index] = payload;
    } else {
      tracks.push(payload);
    }

    await setAmbienceTracks(tracks);
    await this.#refreshCards([MANAGER_CARD_IDS.ambienceTracks, MANAGER_CARD_IDS.ambiencePlaylists]);
  }

  async #createAmbienceTrackFolder() {
    const name = await promptPlaylistFolderName();
    if (!name) return;

    const folders = getAmbienceTrackFolders();
    folders.push(createTrackFolderEntry(name));
    await setAmbienceTrackFolders(folders);
    await this.#refreshCards([MANAGER_CARD_IDS.ambienceTracks]);
  }

  async #editAmbienceTrackRootFolder() {
    const name = await promptPlaylistFolderName(getAmbienceTrackRootName(), { allowEmpty: true });
    if (name === null) return;
    await setAmbienceTrackRootName(name);
    await this.#refreshCards([MANAGER_CARD_IDS.ambienceTracks]);
  }

  async #editAmbienceTrackFolder(folderId) {
    if (!folderId) return;
    const folders = getAmbienceTrackFolders();
    const folderIndex = folders.findIndex((entry) => entry.id === folderId);
    if (folderIndex === -1) return;

    const name = await promptPlaylistFolderName(folders[folderIndex].name);
    if (!name) return;

    folders[folderIndex] = {
      ...folders[folderIndex],
      name,
    };
    await setAmbienceTrackFolders(folders);
    await this.#refreshCards([MANAGER_CARD_IDS.ambienceTracks]);
  }

  async #toggleAmbienceTrackFolderCollapsed(folderId) {
    if (!folderId) return;
    const folders = getAmbienceTrackFolders();
    const folderIndex = folders.findIndex((entry) => entry.id === folderId);
    if (folderIndex === -1) return;
    folders[folderIndex] = {
      ...folders[folderIndex],
      collapsed: !Boolean(folders[folderIndex].collapsed),
    };
    await setAmbienceTrackFolders(folders);
    await this.#refreshCards([MANAGER_CARD_IDS.ambienceTracks]);
  }

  async #deleteAmbienceTrackFolder(folderId) {
    if (!folderId) return;
    const folders = getAmbienceTrackFolders();
    const folder = folders.find((entry) => entry.id === folderId);
    if (!folder) return;

    const confirmed = await Dialog.confirm({
      title: t("Dialogs.DeleteFolderTitle", "Delete folder"),
      content: tf("Dialogs.DeleteFolderContent", {
        name: escapeHtml(untitledName(folder.name)),
      }, ({ name }) => `<p>Delete folder <b>${name}</b>? Tracks will be moved outside the folder.</p>`),
    });
    if (!confirmed) return;

    const nextTracks = getAmbienceTracks().map((track) => track.folderId === folderId ? { ...track, folderId: "" } : track);
    const nextFolders = folders.filter((entry) => entry.id !== folderId);
    await setStorageData({
      ambienceTracks: nextTracks,
      ambienceTrackFolders: nextFolders,
    });
    await this.#refreshCards([MANAGER_CARD_IDS.ambienceTracks]);
  }

  async #moveAmbienceTrackToFolder(trackId, folderId = "") {
    if (!trackId) return;
    const tracks = getAmbienceTracks();
    const folders = getAmbienceTrackFolders();
    const normalizedFolderId = normalizeTrackFolderId(folderId, folders);
    const index = tracks.findIndex((entry) => entry.id === trackId);
    if (index === -1) return;
    if (String(tracks[index].folderId ?? "") === normalizedFolderId) return;

    tracks[index] = {
      ...tracks[index],
      folderId: normalizedFolderId,
    };
    await setAmbienceTracks(tracks);
    await this.#refreshCards([MANAGER_CARD_IDS.ambienceTracks]);
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
    const folders = getAmbienceTrackFolders();
    const playlists = getAmbiencePlaylists();
    const current = playlistId ? playlists.find((entry) => entry.id === playlistId) : null;
    const payload = await promptPlaylistData(current, tracks, folders, getAmbienceTrackRootName());
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

async function promptPlaylistFolderName(currentName = "", { allowEmpty = false } = {}) {
  const content = `
    <form class="standard-form ts-dj-dialog-form">
      <div class="form-group">
        <label>${escapeHtml(t("Dialogs.FolderNameLabel", "Folder name"))}</label>
        <div class="form-fields">
          <input type="text" name="name" value="${escapeHtml(currentName)}" placeholder="${escapeHtml(t("Dialogs.FolderNamePlaceholder", "For example: Combat"))}">
        </div>
      </div>
    </form>
  `;

  const result = await promptDialog(t("Dialogs.FolderTitle", "Folder"), content);
  if (!result) return null;

  const name = String(result.name ?? "").trim();
  if (!name && !allowEmpty) {
    notify("warn", "NeedFolderName", {}, "You must specify a folder name.");
    return null;
  }
  return name;
}

async function promptBulkTrackImportData(file) {
  const fileName = untitledName(getDefaultNameFromFileEntry(file));
  const content = `
    <form class="standard-form ts-dj-dialog-form">
      <div class="form-group stacked">
        <label>${escapeHtml(localizedFallback("Список треков", "Track list"))}</label>
        <div class="form-fields" style="display:block">
          <p class="notes">${escapeHtml(localizedFallback(
            "Вставьте строки вида: 0:00 Название. Треки будут созданы в папку с именем файла.",
            "Paste lines like: 0:00 Title. Tracks will be created in a folder named after the file."
          ))}</p>
          <textarea name="trackList" rows="16" placeholder="${escapeHtml("0:00 Intro\n2:57 Battle Theme")}"></textarea>
        </div>
      </div>
    </form>
  `;

  const result = await promptDialog(
    localizedFallback(`Создать треки | ${fileName}`, `Create tracks | ${fileName}`),
    content,
    {
      confirmLabel: localizedFallback("Создать треки", "Create tracks"),
      confirmIcon: "fa-music",
    }
  );
  if (!result) return null;

  return parseBulkTrackList(String(result.trackList ?? ""), file);
}

async function promptTrackData(current, files) {
  const isNewTrack = !current;
  const selectedFileId = current?.fileId ?? files[0].id;
  const selectedFile = files.find((entry) => entry.id === selectedFileId);
  const defaultName = isNewTrack ? getDefaultNameFromFileEntry(selectedFile) : "";
  const initialStart = current?.start ?? (isNewTrack ? "00:00" : "");
  const initialEnd = current?.end ?? "";
  const initialNormalize = isTrackNormalizationEnabled(current);

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
        <label>${escapeHtml(t("Dialogs.TrackNormalizeLabel", "Normalize"))}</label>
        <div class="form-fields">
          <input type="checkbox" name="normalize" ${initialNormalize ? "checked" : ""}>
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
    normalize: Boolean(result.normalize),
    loop: Boolean(current?.loop),
  };
}

function getDefaultNameFromFileEntry(file) {
  if (!file) return "";
  const fromName = String(file.name ?? "").trim();
  if (fromName) return fromName;
  return getPathBaseName(file.path);
}

async function parseBulkTrackList(input, file = null) {
  const lines = String(input ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const parsed = [];

  for (const line of lines) {
    const match = line.match(/^(\d+(?::\d{2}){1,2})\s+(.+)$/);
    if (!match) continue;

    const startSeconds = parseTimeInput(match[1]);
    const name = String(match[2] ?? "").trim();
    if (!Number.isFinite(startSeconds) || !name) continue;

    parsed.push({
      startSeconds,
      name,
    });
  }

  let fileDuration = null;
  const filePath = String(file?.path ?? "").trim();
  if (filePath) {
    try {
      const sound = await preloadSoundWithFileCache(filePath, { channel: "music" });
      const duration = getSoundDuration(sound);
      if (Number.isFinite(duration) && duration > 0) {
        fileDuration = duration;
      }
    } catch (_error) {
      // Ignore and keep the last end empty if metadata cannot be loaded.
    }
  }

  return parsed.map((entry, index) => {
    const next = parsed[index + 1];
    const clipStart = Math.max(0, entry.startSeconds + 1);
    const clipEnd = Number.isFinite(next?.startSeconds)
      ? Math.max(0, next.startSeconds - 1)
      : (Number.isFinite(fileDuration) ? fileDuration : null);
    const hasEnd = Number.isFinite(clipEnd) && clipEnd > clipStart;
    return {
      name: entry.name,
      start: formatDurationClock(clipStart),
      end: hasEnd ? formatDurationClock(clipEnd) : "",
    };
  });
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

async function promptPlaylistData(current, tracks, folders = [], rootName = "") {
  const currentPlaylist = current ? normalizeMusicPlaylistEntry(current) : null;
  const currentSelectedTrackIds = currentPlaylist ? getMusicPlaylistOrderedTrackIds(currentPlaylist) : [];
  const hasFolders = Boolean(currentPlaylist?.folders?.length);
  const checked = new Set(currentSelectedTrackIds);
  const dialogGroups = getPlaylistTrackGroupsForEditor(tracks, folders, currentSelectedTrackIds, rootName);

  const trackCheckboxes = dialogGroups.length
    ? dialogGroups
        .map((group) => {
          const checkedCount = group.tracks.filter((track) => checked.has(track.id)).length;
          const allChecked = checkedCount > 0 && checkedCount === group.tracks.length;
          const folderLabel = escapeHtml(group.name);
          const folderKey = escapeHtml(group.key);
          const rowsHtml = group.tracks.map((track) => {
            const isChecked = checked.has(track.id) ? "checked" : "";
            return `
              <div class="ts-dj-playlist-track-row ${isChecked ? "is-checked" : ""}" data-track-row data-folder-key="${folderKey}" data-track-id="${escapeHtml(track.id)}" draggable="true">
                <span class="ts-dj-playlist-track-handle" title="${escapeHtml(t("Common.DragToReorder", "Drag to change order"))}">
                  <i class="fas fa-grip-vertical"></i>
                </span>
                <input type="checkbox" name="trackIds" value="${escapeHtml(track.id)}" ${isChecked}>
                <span class="ts-dj-playlist-track-name">${escapeHtml(track.name)}</span>
              </div>
            `;
          }).join("");
          return `
            <div class="ts-dj-playlist-track-group" data-track-group data-folder-key="${folderKey}">
              <label class="ts-dj-playlist-track-group-label">
                <input type="checkbox" data-folder-toggle ${allChecked ? "checked" : ""}>
                <strong>${folderLabel}</strong>
                <span>${group.tracks.length}</span>
              </label>
            </div>
            ${rowsHtml}
          `;
        })
        .join("")
    : `<p class='notes'>${escapeHtml(t("Dialogs.PlaylistTrackPickerEmpty", "Create tracks first."))}</p>`;

  const nameField = `
      <div class="form-group">
        <label>${escapeHtml(t("Dialogs.PlaylistNameLabel", "Playlist name"))}</label>
        <div class="form-fields">
          <input type="text" name="name" value="${escapeHtml(current?.name ?? "")}" placeholder="${escapeHtml(t("Dialogs.PlaylistNamePlaceholder", "For example: Mix 1"))}">
        </div>
      </div>
  `;

  const content = hasFolders
    ? `
    <form class="standard-form ts-dj-dialog-form">
      ${nameField}
      <p class="notes">${escapeHtml(t("Dialogs.PlaylistFolderStructureNote", "This playlist already uses folders. Track structure is managed directly in the playlist card."))}</p>
    </form>
  `
    : `
    <form class="standard-form ts-dj-dialog-form">
      ${nameField}
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
      if (hasFolders) return;
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

  if (hasFolders && currentPlaylist) {
    return {
      ...currentPlaylist,
      name,
    };
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
    folders: currentPlaylist?.folders ?? [],
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

function autoScrollContainerOnDrag(event, container, {
  threshold = 44,
  maxStep = 24,
} = {}) {
  if (!(container instanceof HTMLElement)) return;
  const rect = container.getBoundingClientRect();
  if (!rect.height) return;

  const topDistance = event.clientY - rect.top;
  const bottomDistance = rect.bottom - event.clientY;
  if (topDistance >= 0 && topDistance < threshold) {
    const factor = 1 - (topDistance / threshold);
    container.scrollTop -= Math.ceil(maxStep * factor);
    return;
  }
  if (bottomDistance >= 0 && bottomDistance < threshold) {
    const factor = 1 - (bottomDistance / threshold);
    container.scrollTop += Math.ceil(maxStep * factor);
  }
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

function updateManagerProgressUi() {
  if (!appInstance?.rendered) return;
  const root = appInstance.element?.[0];
  if (!(root instanceof HTMLElement)) return;
  syncManagerNowPlayingUi(root, getManagerNowPlayingDetails(getTracks(), getPlaylists(), getFiles()));
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
    updateManagerProgressUi();
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

