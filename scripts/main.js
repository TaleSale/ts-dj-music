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
};

const RATE_VALUES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const SOCKET_CHANNEL = `module.${MODULE_ID}`;
const SOUND_CHANNEL_MARK = Symbol("ts-dj-channel");
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
});

let appInstance = null;
const sidebarSectionState = {
  playlists: true,
  music: true,
  ambiencePlaylists: true,
  ambience: true,
};
const sidebarPlaylistExpandState = {};

const playbackState = {
  current: null,
};
const ambienceState = {
  active: new Map(),
};
const playlistClipWatchers = new Map();
const audioFileCache = new Map();
let sidebarProgressTicker = null;
let ambienceEnvironmentVolumeTicker = null;
let lastAmbienceEnvironmentVolume = null;

Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | ready`);
  registerModuleSocket();
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

  injectPlaylistDirectoryButton(root);
  injectPlaylistDirectoryRateControl(root);
  injectPlaylistDirectoryDjPanel(root);
});

Hooks.on("renderPlaylistSoundConfig", (app, html) => {
  const root = getRoot(html);
  if (!root) return;
  injectPlaylistSoundConfig(app, root);
});

Hooks.on("updatePlaylistSound", (soundDoc, change) => {
  const moduleFlags = foundry.utils.getProperty(change, `flags.${MODULE_ID}`) ?? null;
  if (Object.hasOwn(change, "playing") && change.playing === false) {
    clearPlaylistClipWatcher(soundDoc);
  }
  const started = Object.hasOwn(change, "playing") && change.playing === true;
  if (!started && !moduleFlags) return;

  const restart = started || Object.hasOwn(moduleFlags ?? {}, "clipStart") || Object.hasOwn(moduleFlags ?? {}, "clipEnd");
  window.setTimeout(() => {
    applyPlaylistSoundSettings(soundDoc, { restart }).catch((error) => {
      console.warn(`${MODULE_ID} | failed to apply PlaylistSound settings`, error);
    });
  }, 75);
});

Hooks.on("updateSetting", (setting) => {
  const key = setting?.key ?? null;
  if (key !== "core.globalAmbientVolume") return;
  applyEnvironmentVolumeToActiveAmbience({ force: true });
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
    default:
      break;
  }
}

function registerSettings() {
  game.settings.register(MODULE_ID, SETTING_KEYS.files, {
    name: "DJ Files",
    scope: "world",
    config: false,
    type: Object,
    default: [],
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.tracks, {
    name: "DJ Tracks",
    scope: "world",
    config: false,
    type: Object,
    default: [],
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.playlists, {
    name: "DJ Playlists",
    scope: "world",
    config: false,
    type: Object,
    default: [],
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.ambienceTracks, {
    name: "DJ Ambience Tracks",
    scope: "world",
    config: false,
    type: Object,
    default: [],
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.ambiencePlaylists, {
    name: "DJ Ambience Playlists",
    scope: "world",
    config: false,
    type: Object,
    default: [],
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.ambienceAllowConcurrent, {
    name: "Allow Multiple Ambience",
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.liveRate, {
    name: "DJ Live Rate",
    scope: "client",
    config: false,
    type: Number,
    default: 1,
  });
}

function getRoot(html) {
  if (!html) return null;
  if (html instanceof HTMLElement) return html;
  if (html[0] instanceof HTMLElement) return html[0];
  return null;
}

function injectPlaylistDirectoryButton(root) {
  const buttonContainer = root.querySelector(".header-actions.action-buttons") ?? root.querySelector(".header-actions");
  if (!buttonContainer || buttonContainer.querySelector(`button[data-action=\"${MODULE_ID}-open\"]`)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = `${MODULE_ID}-open`;
  button.innerHTML = `<i class=\"fas fa-music\"></i> TS-DJ-MUSIC`;
  button.addEventListener("click", () => openApp());
  buttonContainer.appendChild(button);
}

function injectPlaylistDirectoryRateControl(root) {
  const header = root.querySelector(".directory-header") ?? root.querySelector("header");
  if (!header || header.querySelector(`.${MODULE_ID}-sidebar-rate`)) return;

  const wrap = document.createElement("div");
  wrap.classList.add(`${MODULE_ID}-sidebar-rate`);

  const label = document.createElement("label");
  label.textContent = "TS-DJ Speed";

  const input = document.createElement("input");
  input.type = "range";
  input.min = "0.5";
  input.max = "2";
  input.step = "0.25";
  input.value = String(getLiveRate());

  const value = document.createElement("span");
  value.classList.add("value");
  value.textContent = formatRate(Number(input.value));

  input.addEventListener("input", async (event) => {
    const rate = normalizeRate(Number(event.currentTarget.value));
    event.currentTarget.value = String(rate);
    value.textContent = formatRate(rate);
    await setLiveRate(rate, { apply: true });
  });

  wrap.append(label, input, value);
  header.appendChild(wrap);
}

function injectPlaylistDirectoryDjPanel(root) {
  const files = getFiles();
  const fileMap = new Map(files.map((entry) => [entry.id, entry]));
  const tracks = getTracks();
  const playlists = getPlaylists();
  const ambienceTracks = getAmbienceTracks();
  const ambiencePlaylists = getAmbiencePlaylists();
  const playlistsHtml = buildSidebarPlaylistsHtml(playlists, tracks);
  const tracksHtml = buildSidebarTracksHtml(tracks, fileMap);
  const ambiencePlaylistsHtml = buildSidebarAmbiencePlaylistsHtml(ambiencePlaylists, ambienceTracks);
  const ambienceTracksHtml = buildSidebarAmbienceTracksHtml(ambienceTracks, fileMap);

  let panel = root.querySelector(`.${MODULE_ID}-sidebar-panel`);
  if (!panel) {
    panel = document.createElement("section");
    panel.classList.add(`${MODULE_ID}-sidebar-panel`);
    panel.innerHTML = `
      <div class="${MODULE_ID}-sidebar-head">
        <span class="title">TS-DJ Quick</span>
        <div class="actions">
          <button type="button" data-action="open-manager" title="Open manager"><i class="fas fa-sliders-h"></i></button>
          <button type="button" data-action="stop" title="Stop"><i class="fas fa-stop"></i></button>
        </div>
      </div>
      <div class="${MODULE_ID}-sidebar-now"></div>
      <div class="${MODULE_ID}-sidebar-queue-nav">
        <button type="button" data-action="playlist-prev" title="Previous track in playlist"><i class="fas fa-step-backward"></i></button>
        <button type="button" data-action="playlist-next" title="Next track in playlist"><i class="fas fa-step-forward"></i></button>
      </div>
      <details ${sidebarSectionState.playlists ? "open" : ""} data-section="playlists" class="${MODULE_ID}-sidebar-section">
        <summary>Playlists</summary>
        <div class="${MODULE_ID}-sidebar-list"></div>
      </details>
      <details ${sidebarSectionState.music ? "open" : ""} data-section="music" class="${MODULE_ID}-sidebar-section">
        <summary>Music</summary>
        <div class="${MODULE_ID}-sidebar-list"></div>
      </details>
      <details ${sidebarSectionState.ambiencePlaylists ? "open" : ""} data-section="ambiencePlaylists" class="${MODULE_ID}-sidebar-section">
        <summary>Ambience Playlists</summary>
        <div class="${MODULE_ID}-sidebar-list"></div>
      </details>
      <details ${sidebarSectionState.ambience ? "open" : ""} data-section="ambience" class="${MODULE_ID}-sidebar-section">
        <summary>Ambience</summary>
        <div class="${MODULE_ID}-sidebar-list"></div>
      </details>
    `;

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

    const header = root.querySelector(".directory-header") ?? root.querySelector("header");
    const insertAnchor = root.querySelector(".directory-list") ?? root.querySelector(".directory-items") ?? root.querySelector("ol");
    if (insertAnchor?.parentElement) {
      insertAnchor.before(panel);
    } else if (header) {
      header.after(panel);
    } else {
      root.prepend(panel);
    }
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
function buildSidebarPlaylistsHtml(playlists, tracks) {
  if (!playlists.length) {
    return `<div class="${MODULE_ID}-sidebar-empty">Плейлистов пока нет</div>`;
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
                title="Запустить плейлист с этого трека"
              ><i class="fas ${trackPlayIcon}"></i></button>
              <span class="index">${index + 1}.</span>
              <span class="track-name">${escapeHtml(track?.name || "Без названия")}</span>
            </div>
          `;
        }).join("")
        : `<div class="${MODULE_ID}-sidebar-subrow is-empty">Треки отсутствуют</div>`;
      return `
        <div class="${MODULE_ID}-sidebar-playlist ${expanded ? "is-expanded" : ""}">
          <div class="${MODULE_ID}-sidebar-row ${active ? "is-active" : ""}">
            <div class="row-actions">
              <button type="button" data-action="${playAction}" data-id="${playlist.id}" class="play"><i class="fas ${playIcon}"></i></button>
              <button type="button" data-action="toggle-playlist-loop" data-id="${playlist.id}" class="loop ${loopEnabled ? "is-on" : ""}" title="Loop"><i class="fas fa-repeat"></i></button>
              <button type="button" data-action="toggle-playlist-shuffle" data-id="${playlist.id}" class="shuffle ${shuffleEnabled ? "is-on" : ""}" title="Shuffle"><i class="fas fa-random"></i></button>
              <button type="button" data-action="toggle-sidebar-playlist-expand" data-id="${playlist.id}" class="expand ${expanded ? "is-on" : ""}" title="${expanded ? "Свернуть треки" : "Показать треки"}"><i class="fas ${expanded ? "fa-chevron-down" : "fa-chevron-right"}"></i></button>
            </div>
            <div class="meta">
              <strong>${escapeHtml(playlist.name || "Без названия")}</strong>
              <span>${count} tracks | loop: ${loopEnabled ? "on" : "off"} | shuffle: ${shuffleEnabled ? "on" : "off"}</span>
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
    return `<div class="${MODULE_ID}-sidebar-empty">Треков пока нет</div>`;
  }

  const current = playbackState.current;
  return tracks
    .map((track) => {
      const active = current?.trackId === track.id;
      const fileName = fileMap.get(track.fileId)?.name || "Файл?";
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
            <button type="button" data-action="toggle-track-loop" data-id="${track.id}" class="loop ${loopEnabled ? "is-on" : ""}" title="Loop"><i class="fas fa-repeat"></i></button>
          </div>
          <div class="meta">
            <strong>${escapeHtml(track.name || "Без названия")}</strong>
            <span>${escapeHtml(fileName)} | ${escapeHtml(clip)} | loop: ${loopEnabled ? "on" : "off"}</span>
            ${progressRow}
          </div>
        </div>
      `;
    })
    .join("");
}

function buildSidebarAmbiencePlaylistsHtml(playlists, tracks) {
  if (!playlists.length) {
    return `<div class="${MODULE_ID}-sidebar-empty">No ambience playlists</div>`;
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
            <button type="button" data-action="toggle-ambience-playlist-loop" data-id="${playlist.id}" class="loop ${loopEnabled ? "is-on" : ""}" title="Loop"><i class="fas fa-repeat"></i></button>
            <button type="button" data-action="toggle-ambience-playlist-shuffle" data-id="${playlist.id}" class="shuffle ${shuffleEnabled ? "is-on" : ""}" title="Shuffle"><i class="fas fa-random"></i></button>
          </div>
          <div class="meta">
            <strong>${escapeHtml(playlist.name || "No name")}</strong>
            <span>${count} tracks | loop: ${loopEnabled ? "on" : "off"} | shuffle: ${shuffleEnabled ? "on" : "off"}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function buildSidebarAmbienceTracksHtml(tracks, fileMap) {
  if (!tracks.length) {
    return `<div class="${MODULE_ID}-sidebar-empty">No ambience tracks</div>`;
  }

  return tracks
    .map((track) => {
      const active = isAmbienceTrackActive(track.id);
      const fileName = fileMap.get(track.fileId)?.name || "File?";
      const clip = `${track.start || "0"}-${track.end || "-"}`;
      const loopEnabled = Boolean(track.loop);
      return `
        <div class="${MODULE_ID}-sidebar-row ${active ? "is-active" : ""}">
          <div class="row-actions">
            <button type="button" data-action="${active ? "stop-ambience" : "play-ambience"}" data-id="${track.id}" class="play">
              <i class="fas ${active ? "fa-stop" : "fa-play"}"></i>
            </button>
            <button type="button" data-action="toggle-ambience-track-loop" data-id="${track.id}" class="loop ${loopEnabled ? "is-on" : ""}" title="Loop"><i class="fas fa-repeat"></i></button>
          </div>
          <div class="meta">
            <strong>${escapeHtml(track.name || "No name")}</strong>
            <span>${escapeHtml(fileName)} | ${escapeHtml(clip)} | loop: ${loopEnabled ? "on" : "off"}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function getCurrentPlaybackLabelForSidebar(tracks, playlists) {
  if (!playbackState.current) return "Остановлено";

  const pausedMark = playbackState.current.paused ? " [paused]" : "";
  const currentTrack = tracks.find((track) => track.id === playbackState.current.trackId);
  if (playbackState.current.mode === "playlist") {
    const playlist = playlists.find((entry) => entry.id === playbackState.current.playlistId);
    return `Играет плейлист: ${playlist?.name ?? "?"} | ${currentTrack?.name ?? "?"}${pausedMark}`;
  }

  return `Играет трек: ${currentTrack?.name ?? "?"}${pausedMark}`;
}

function getCurrentPlaybackLabelForManager(tracks, playlists) {
  if (!playbackState.current) return "Остановлено";

  const currentTrack = tracks.find((track) => track.id === playbackState.current.trackId);
  if (playbackState.current.mode === "playlist") {
    const playlist = playlists.find((entry) => entry.id === playbackState.current.playlistId);
    return `Плейлист: ${playlist?.name ?? "?"} | Трек: ${currentTrack?.name ?? "?"}`;
  }

  return `Трек: ${currentTrack?.name ?? "?"}`;
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
        stopButton.dataset.action = "stop";
        stopButton.innerHTML = "<i class=\"fas fa-stop\"></i> Stop";
        status.appendChild(stopButton);
      }
    } else if (stopButton) {
      stopButton.remove();
    }
  }

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
function updateCurrentPlaybackLoopMode(loopEnabled) {
  const current = playbackState.current;
  if (!current?.sound) return;
  current.loopEnabled = loopEnabled;

  try {
    current.sound.loop = loopEnabled;
  } catch (_error) {
    // no-op
  }

  try {
    if (current.sound.element) current.sound.element.loop = loopEnabled;
  } catch (_error) {
    // no-op
  }

  if (!loopEnabled && Number.isFinite(current.clipEnd)) {
    clearClipEndMonitor(current);
    if (!current.paused) current.clipMonitorId = startClipEndMonitor(current.sound, current.clipEnd, current.token);
  }

  if (loopEnabled) {
    clearClipEndMonitor(current);
  }
}

function updateAmbiencePlaybackLoopMode(entry, loopEnabled) {
  if (!entry?.sound) return;
  entry.loopEnabled = loopEnabled;

  try {
    entry.sound.loop = loopEnabled;
  } catch (_error) {
    // no-op
  }

  try {
    if (entry.sound.element) entry.sound.element.loop = loopEnabled;
  } catch (_error) {
    // no-op
  }

  if (!loopEnabled && Number.isFinite(entry.clipEnd)) {
    clearAmbienceClipEndMonitor(entry);
    if (!entry.paused) entry.clipMonitorId = startAmbienceClipEndMonitor(entry.sound, entry.clipEnd, entry.token);
    return;
  }

  if (loopEnabled) {
    clearAmbienceClipEndMonitor(entry);
  }
}

function injectPlaylistSoundConfig(app, root) {
  if (root.querySelector(`.${MODULE_ID}-sound-settings`)) return;

  const soundDoc = app?.document;
  const currentRate = normalizeRate(Number(soundDoc?.getFlag(MODULE_ID, "rate") ?? 1));
  const clipStart = soundDoc?.getFlag(MODULE_ID, "clipStart") ?? "";
  const clipEnd = soundDoc?.getFlag(MODULE_ID, "clipEnd") ?? "";

  const box = document.createElement("div");
  box.classList.add("form-group-stacked", `${MODULE_ID}-sound-settings`);
  box.innerHTML = `
    <fieldset>
      <legend>TS-DJ-MUSIC</legend>
      <div class="form-group">
        <label>Скорость (по умолчанию)</label>
        <div class="form-fields">
          <select name="flags.${MODULE_ID}.rate">
            ${RATE_VALUES.map((rate) => `<option value="${rate}" ${Number(rate) === currentRate ? "selected" : ""}>${formatRate(rate)}x</option>`).join("")}
          </select>
        </div>
        <p class="notes">Диапазон: 0.5 - 2.0, шаг 0.25. Можно менять и во время проигрывания.</p>
      </div>
      <div class="form-group">
        <label>Начало отрезка</label>
        <div class="form-fields">
          <input type="text" name="flags.${MODULE_ID}.clipStart" value="${escapeHtml(String(clipStart))}" placeholder="00:03 или 3">
        </div>
      </div>
      <div class="form-group">
        <label>Конец отрезка</label>
        <div class="form-fields">
          <input type="text" name="flags.${MODULE_ID}.clipEnd" value="${escapeHtml(String(clipEnd))}" placeholder="01:20 или 80">
        </div>
        <p class="notes">Формат времени: <code>секунды</code>, <code>мм:сс</code> или <code>чч:мм:сс</code>.</p>
      </div>
    </fieldset>
  `;

  const anchor = root.querySelector("[name='path']")?.closest(".form-group") ?? root.querySelector(".form-group:last-of-type");
  if (anchor) anchor.after(box);
}

async function applyPlaylistSoundSettings(soundDoc, { restart = false } = {}) {
  const sound = soundDoc?.sound;
  if (!sound) return;

  const defaultRate = normalizeRate(Number(soundDoc.getFlag(MODULE_ID, "rate") ?? 1));
  const liveRate = normalizeRate(getLiveRate());

  const clipStartRaw = soundDoc.getFlag(MODULE_ID, "clipStart");
  const clipEndRaw = soundDoc.getFlag(MODULE_ID, "clipEnd");
  const clipStart = parseTimeInput(clipStartRaw);
  const clipEnd = parseTimeInput(clipEndRaw);

  const hasStart = Number.isFinite(clipStart) && clipStart >= 0;
  const offset = hasStart ? clipStart : 0;
  const hasEnd = Number.isFinite(clipEnd) && clipEnd > offset;

  if (restart && (hasStart || hasEnd)) {
    const playOptions = {
      autoplay: true,
      loop: Boolean(soundDoc.repeat),
      volume: Number(soundDoc.effectiveVolume ?? soundDoc.volume ?? 1),
    };

    if (hasStart) playOptions.offset = offset;

    if (hasEnd) {
      if (playOptions.loop) {
        playOptions.loopStart = offset;
        playOptions.loopEnd = clipEnd;
      } else {
        playOptions.duration = clipEnd - offset;
      }
    }

    await sound.play(playOptions);
  }

  const finalRate = liveRate !== 1 ? liveRate : defaultRate;
  applySoundRate(sound, finalRate);
  setPlaylistClipWatcher(soundDoc, !soundDoc.repeat && hasEnd ? clipEnd : null);
}

function applySoundRate(sound, rate) {
  if (!sound) return;
  const safeRate = normalizeRate(rate);

  try {
    if (sound.element && Number.isFinite(sound.element.playbackRate)) {
      sound.element.playbackRate = safeRate;
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

function applyEnvironmentVolumeToActiveAmbience({ force = false } = {}) {
  const volume = getEnvironmentVolume();
  if (!force && Number.isFinite(lastAmbienceEnvironmentVolume) && Math.abs(lastAmbienceEnvironmentVolume - volume) < 0.001) {
    return;
  }
  lastAmbienceEnvironmentVolume = volume;
  for (const entry of ambienceState.active.values()) {
    if (isSoundOnChannel(entry.sound, "environment")) continue;
    applySoundVolume(entry.sound, volume);
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

function getFiles() {
  return normalizeArray(game.settings.get(MODULE_ID, SETTING_KEYS.files));
}

function getTracks() {
  return normalizeArray(game.settings.get(MODULE_ID, SETTING_KEYS.tracks));
}

function getPlaylists() {
  return normalizeArray(game.settings.get(MODULE_ID, SETTING_KEYS.playlists));
}

function getAmbienceTracks() {
  return normalizeArray(game.settings.get(MODULE_ID, SETTING_KEYS.ambienceTracks));
}

function getAmbiencePlaylists() {
  return normalizeArray(game.settings.get(MODULE_ID, SETTING_KEYS.ambiencePlaylists));
}

function getAmbienceAllowConcurrent() {
  return Boolean(game.settings.get(MODULE_ID, SETTING_KEYS.ambienceAllowConcurrent));
}

async function setFiles(files) {
  await game.settings.set(MODULE_ID, SETTING_KEYS.files, files);
  refreshPlaylistDirectoryUi();
}

async function setTracks(tracks) {
  await game.settings.set(MODULE_ID, SETTING_KEYS.tracks, tracks);
  refreshPlaylistDirectoryUi();
}

async function setPlaylists(playlists) {
  await game.settings.set(MODULE_ID, SETTING_KEYS.playlists, playlists);
  refreshPlaylistDirectoryUi();
}

async function setAmbienceTracks(tracks) {
  await game.settings.set(MODULE_ID, SETTING_KEYS.ambienceTracks, tracks);
  refreshPlaylistDirectoryUi();
}

async function setAmbiencePlaylists(playlists) {
  await game.settings.set(MODULE_ID, SETTING_KEYS.ambiencePlaylists, playlists);
  refreshPlaylistDirectoryUi();
}

async function setAmbienceAllowConcurrent(enabled) {
  await game.settings.set(MODULE_ID, SETTING_KEYS.ambienceAllowConcurrent, Boolean(enabled));
  refreshPlaylistDirectoryUi();
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
    updateCurrentPlaybackLoopMode(loopEnabled);
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

async function setLiveRate(rate, { apply = true, sync = true } = {}) {
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
    applyRateToPlayingPlaylistSounds(normalized);
  }

  if (sync) {
    emitModuleSocketEvent(SOCKET_ACTIONS.setLiveRate, {
      rate: normalized,
      apply: Boolean(apply),
    });
  }

}

function applyRateToPlayingPlaylistSounds(rate) {
  for (const playlist of game.playlists.contents) {
    for (const soundDoc of playlist.sounds.contents) {
      if (!soundDoc.playing || !soundDoc.sound) continue;
      applySoundRate(soundDoc.sound, rate);
    }
  }
}

function refreshPlaylistDirectoryUi() {
  refreshManagerRuntimeUi();

  const root = getRoot(ui.playlists?.element);
  if (root) {
    injectPlaylistDirectoryButton(root);
    injectPlaylistDirectoryRateControl(root);
    injectPlaylistDirectoryDjPanel(root);
    return;
  }
  ui.playlists?.render(false);
}

function openApp() {
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
  const tracks = getTracks();
  const track = tracks.find((entry) => entry.id === trackId);
  if (!track) {
    ui.notifications.warn("TS-DJ-MUSIC: трек не найден");
    return;
  }

  await playTrack(track, playOptions);

  if (sync) {
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
  const playlists = getPlaylists();
  const playlist = playlists.find((entry) => entry.id === playlistId);
  if (!playlist) {
    ui.notifications.warn("TS-DJ-MUSIC: плейлист не найден");
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
    ui.notifications.warn("TS-DJ-MUSIC: в плейлисте нет треков");
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
  await playTrack(firstTrack, {
    mode: "playlist",
    playlistId: playlist.id,
    queue,
    index,
    playlistLoop,
    playlistShuffle: shuffleEnabled,
    loopOverride: false,
  });

  if (sync) {
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

  await playTrack(nextTrack, {
    mode: "playlist",
    playlistId: current.playlistId ?? null,
    queue,
    index: targetIndex,
    playlistLoop: allowWrap,
    playlistShuffle: Boolean(current.playlistShuffle),
    loopOverride: false,
  });

  if (sync) {
    emitModuleSocketEvent(SOCKET_ACTIONS.playRelativeTrack, { direction: step });
  }
}

async function playAmbienceById(trackId, options = {}) {
  const { sync = true, ...playOptions } = options;
  const tracks = getAmbienceTracks();
  const track = tracks.find((entry) => entry.id === trackId);
  if (!track) {
    ui.notifications.warn("TS-DJ-MUSIC: ambience track not found");
    return;
  }
  await playAmbienceTrack(track, playOptions);

  if (sync) {
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
    playlistLoop: playlistLoopOverride,
    playlistShuffle: playlistShuffleOverride,
  } = options;
  const playlists = getAmbiencePlaylists();
  const playlist = playlists.find((entry) => entry.id === playlistId);
  if (!playlist) {
    ui.notifications.warn("TS-DJ-MUSIC: ambience playlist not found");
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
    ui.notifications.warn("TS-DJ-MUSIC: ambience playlist is empty");
    return;
  }

  const index = Number.isFinite(indexOverride)
    ? clampNumber(Math.trunc(Number(indexOverride)), 0, queue.length - 1)
    : 0;
  const firstTrack = trackMap.get(queue[index]);
  const playlistLoop = typeof playlistLoopOverride === "boolean"
    ? playlistLoopOverride
    : Boolean(playlist.loop);
  if (!firstTrack) return;
  await playAmbienceTrack(firstTrack, {
    mode: "playlist",
    playlistId: playlist.id,
    queue,
    index,
    playlistLoop,
    playlistShuffle: shuffleEnabled,
    loopOverride: false,
  });

  if (sync) {
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
    ui.notifications.warn("TS-DJ-MUSIC: для трека не указан файл");
    return;
  }

  const mode = options.mode ?? "track";
  const queue = options.queue ?? [track.id];
  const index = Number.isFinite(options.index) ? options.index : 0;
  const playlistId = options.playlistId ?? null;
  const playlistLoop = Boolean(options.playlistLoop);
  const playlistShuffle = Boolean(options.playlistShuffle);

  const rawClipStart = parseTimeInput(track.start);
  const clipStart = Number.isFinite(rawClipStart) && rawClipStart >= 0 ? rawClipStart : 0;
  const clipEnd = parseTimeInput(track.end);
  const requestedOffset = Number.isFinite(options.playOffset) ? Number(options.playOffset) : clipStart;
  let offset = Math.max(0, requestedOffset);
  if (Number.isFinite(clipEnd)) {
    offset = Math.min(offset, Math.max(clipStart, clipEnd - 0.01));
  }
  const hasEnd = Number.isFinite(clipEnd) && clipEnd > clipStart;

  const loop = options.loopOverride ?? Boolean(track.loop);
  await stopPlayback({ suppressUiRefresh: true, sync: false });

  const sound = await preloadSoundWithFileCache(file.path, { channel: "music" });
  if (!sound) {
    ui.notifications.error(`TS-DJ-MUSIC: не удалось загрузить файл ${file.path}`);
    return;
  }

  const token = foundry.utils.randomID();

  const playOptions = {
    autoplay: true,
    loop,
    volume: 1,
    onended: () => {
      handleTrackEnded(token).catch((error) => console.warn(`${MODULE_ID} | onended failed`, error));
    },
  };

  if (offset > 0) playOptions.offset = offset;

  if (hasEnd) {
    if (loop) {
      playOptions.loopStart = clipStart;
      playOptions.loopEnd = clipEnd;
    } else {
      playOptions.duration = Math.max(0.01, clipEnd - offset);
    }
  }

  try {
    await playSoundWithRetry(sound, playOptions);
  } catch (error) {
    console.warn(`${MODULE_ID} | failed to switch track`, error);
    ui.notifications.warn("TS-DJ-MUSIC: playback blocked on this client. Click inside Foundry tab and try again.");
    return;
  }

  const defaultRate = normalizeRate(Number(track.rate ?? 1));
  const liveRate = getLiveRate();
  const finalRate = liveRate !== 1 ? liveRate : defaultRate;
  applySoundRate(sound, finalRate);

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
    suppressNextEnd: false,
    defaultRate,
    timingBaseAbs: offset,
    timingBaseMs: Date.now(),
    timingRate: finalRate,
  };

  if (hasEnd && !loop) {
    playbackState.current.clipMonitorId = startClipEndMonitor(sound, clipEnd, token);
  }

  refreshPlaylistDirectoryUi();
  startSidebarProgressTicker();
}

async function playAmbienceTrack(track, options = {}) {
  const files = getFiles();
  const file = files.find((entry) => entry.id === track.fileId);
  if (!file?.path) {
    ui.notifications.warn("TS-DJ-MUSIC: ambience file is missing");
    return;
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
  const clipEnd = parseTimeInput(track.end);
  const hasStart = Number.isFinite(clipStart) && clipStart >= 0;
  const offset = hasStart ? clipStart : 0;
  const hasEnd = Number.isFinite(clipEnd) && clipEnd > offset;
  const loop = options.loopOverride ?? Boolean(track.loop);

  const sound = await preloadSoundWithFileCache(file.path, { channel: "environment" });
  if (!sound) {
    ui.notifications.error(`TS-DJ-MUSIC: failed to load ambience ${file.path}`);
    return;
  }

  const token = foundry.utils.randomID();
  const playOptions = {
    autoplay: true,
    loop,
    volume: 1,
    onended: () => {
      handleAmbienceEnded(token).catch((error) => console.warn(`${MODULE_ID} | ambience onended failed`, error));
    },
  };
  if (hasStart) playOptions.offset = offset;
  if (hasEnd) {
    if (loop) {
      playOptions.loopStart = offset;
      playOptions.loopEnd = clipEnd;
    } else {
      playOptions.duration = clipEnd - offset;
    }
  }

  try {
    await playSoundWithRetry(sound, playOptions);
  } catch (error) {
    console.warn(`${MODULE_ID} | failed to switch ambience`, error);
    ui.notifications.warn("TS-DJ-MUSIC: ambience playback blocked on this client. Click inside Foundry tab and try again.");
    return;
  }

  const defaultRate = normalizeRate(Number(track.rate ?? 1));
  const liveRate = getLiveRate();
  const finalRate = liveRate !== 1 ? liveRate : defaultRate;
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
  };
  ambienceState.active.set(token, entry);
  applyEnvironmentVolumeToActiveAmbience({ force: true });

  if (hasEnd && !loop) {
    entry.clipMonitorId = startAmbienceClipEndMonitor(sound, clipEnd, token);
  }

  refreshPlaylistDirectoryUi();
}

async function handleTrackEnded(token, { forceStop = false } = {}) {
  const current = playbackState.current;
  if (!current || current.token !== token) return;
  if (current.suppressNextEnd) {
    current.suppressNextEnd = false;
    return;
  }
  if (current.ending) return;

  current.ending = true;
  clearClipEndMonitor(current);

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

async function stopPlayback({ suppressUiRefresh = false, sync = true } = {}) {
  if (sync) {
    emitModuleSocketEvent(SOCKET_ACTIONS.stopPlayback);
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

  try {
    await current.sound.stop();
  } catch (_error) {
    // no-op
  }
  await waitMs(25);

  playbackState.current = null;
  if (!suppressUiRefresh) {
    refreshPlaylistDirectoryUi();
    stopSidebarProgressTicker();
  }
}

async function stopAllAmbience(options = {}) {
  const { sync = true } = options;
  if (sync) {
    emitModuleSocketEvent(SOCKET_ACTIONS.stopAmbienceAll);
  }

  const active = Array.from(ambienceState.active.values());
  for (const entry of active) {
    await stopAmbienceEntry(entry);
  }
  refreshPlaylistDirectoryUi();
}

async function stopAmbienceByTrackId(trackId, options = {}) {
  const { sync = true } = options;
  if (sync) {
    emitModuleSocketEvent(SOCKET_ACTIONS.stopAmbienceTrack, { trackId });
  }

  const matches = Array.from(ambienceState.active.values()).filter((entry) => entry.trackId === trackId);
  for (const entry of matches) {
    await stopAmbienceEntry(entry);
  }
  refreshPlaylistDirectoryUi();
}

async function stopAmbienceByPlaylistId(playlistId, options = {}) {
  const { sync = true } = options;
  if (sync) {
    emitModuleSocketEvent(SOCKET_ACTIONS.stopAmbiencePlaylist, { playlistId });
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
  try {
    await entry.sound.stop();
  } catch (_error) {
    // no-op
  }
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
  if (entry.ending) return;
  entry.ending = true;
  clearAmbienceClipEndMonitor(entry);

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
  const current = playbackState.current;
  if (!current?.sound || current.paused) return;

  current.suppressNextEnd = true;
  current.pausedAt = getCurrentAbsoluteTime(current);
  current.paused = true;
  clearClipEndMonitor(current);

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
      title: "TS-DJ-MUSIC",
      width: 980,
      height: 760,
      resizable: true,
      classes: ["ts-dj-music-window"],
    });
  }

  getData() {
    const current = playbackState.current;
    const files = getFiles().map((file) => ({
      ...file,
      name: file.name || file.path || "Без имени",
    }));

    const fileMap = new Map(files.map((file) => [file.id, file]));

    const tracks = getTracks().map((track) => {
      const file = fileMap.get(track.fileId);
      const active = current?.trackId === track.id;
      const paused = active && Boolean(current?.paused);
      return {
        ...track,
        name: track.name || "Без названия",
        fileName: file?.name || "Файл не найден",
        startLabel: track.start || "0",
        endLabel: track.end || "-",
        rateLabel: `${formatRate(Number(track.rate ?? 1))}x`,
        loop: Boolean(track.loop),
        active,
        playAction: active ? (paused ? "resume-current" : "pause-current") : "play-track",
        playIcon: active && !paused ? "fa-pause" : "fa-play",
      };
    });

    const trackMap = new Map(tracks.map((track) => [track.id, track]));

    const playlists = getPlaylists().map((playlist) => {
      const trackIds = normalizeArray(playlist.trackIds);
      const trackNames = trackIds
        .map((id) => trackMap.get(id)?.name)
        .filter(Boolean)
        .join(", ");

      return {
        ...playlist,
        name: playlist.name || "Без названия",
        trackCount: trackIds.length,
        trackNames: trackNames || "Пусто",
        loop: Boolean(playlist.loop),
        shuffle: Boolean(playlist.shuffle),
        active: current?.mode === "playlist" && current?.playlistId === playlist.id,
        playAction: (current?.mode === "playlist" && current?.playlistId === playlist.id)
          ? (current?.paused ? "resume-current" : "pause-current")
          : "play-playlist",
        playIcon: (current?.mode === "playlist" && current?.playlistId === playlist.id) && !current?.paused
          ? "fa-pause"
          : "fa-play",
      };
    });

    const ambienceTracks = getAmbienceTracks().map((track) => {
      const file = fileMap.get(track.fileId);
      const active = isAmbienceTrackActive(track.id);
      return {
        ...track,
        name: track.name || "No name",
        fileName: file?.name || "File not found",
        startLabel: track.start || "0",
        endLabel: track.end || "-",
        rateLabel: `${formatRate(Number(track.rate ?? 1))}x`,
        loop: Boolean(track.loop),
        active,
        playAction: active ? "stop-ambience-track" : "play-ambience-track",
        playIcon: active ? "fa-stop" : "fa-play",
      };
    });

    const ambienceTrackMap = new Map(ambienceTracks.map((track) => [track.id, track]));
    const ambiencePlaylists = getAmbiencePlaylists().map((playlist) => {
      const active = isAmbiencePlaylistActive(playlist.id);
      const trackIds = normalizeArray(playlist.trackIds);
      const trackNames = trackIds.map((id) => ambienceTrackMap.get(id)?.name).filter(Boolean).join(", ");
      return {
        ...playlist,
        name: playlist.name || "No name",
        trackCount: trackIds.length,
        trackNames: trackNames || "Empty",
        loop: Boolean(playlist.loop),
        shuffle: Boolean(playlist.shuffle),
        active,
        playAction: active ? "stop-ambience-playlist" : "play-ambience-playlist",
        playIcon: active ? "fa-pause" : "fa-play",
      };
    });

    const currentLabel = this.#getCurrentLabel(tracks, playlists);

    return {
      liveRate: getLiveRate(),
      liveRateLabel: formatRate(getLiveRate()),
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
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

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
        case "create-track":
          await this.#createOrEditTrack();
          break;
        case "edit-track":
          await this.#createOrEditTrack(id);
          break;
        case "delete-track":
          await this.#deleteTrack(id);
          break;
        case "play-track":
          await playTrackById(id);
          break;
        case "toggle-track-loop":
          await toggleTrackLoop(id);
          this.render(false);
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
        case "play-playlist":
          await playPlaylistById(id);
          break;
        case "toggle-playlist-loop":
          await togglePlaylistLoop(id);
          this.render(false);
          break;
        case "toggle-playlist-shuffle":
          await togglePlaylistShuffle(id);
          this.render(false);
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
            await stopPlayback();
            await stopAllAmbience();
            refreshPlaylistDirectoryUi();
            this.render(false);

            const info = imported.summary ?? {};
            ui.notifications.info(
              `TS-DJ-MUSIC: import complete. Files ${info.importedFiles ?? 0}, music playlists ${info.musicPlaylists ?? 0}, ambience playlists ${info.ambiencePlaylists ?? 0}.`
            );
          }
          break;
        }
        case "create-ambience-track":
          await this.#createOrEditAmbienceTrack();
          break;
        case "edit-ambience-track":
          await this.#createOrEditAmbienceTrack(id);
          break;
        case "delete-ambience-track":
          await this.#deleteAmbienceTrack(id);
          break;
        case "play-ambience-track":
          await playAmbienceById(id);
          break;
        case "stop-ambience-track":
          await stopAmbienceByTrackId(id);
          break;
        case "toggle-ambience-track-loop":
          await toggleAmbienceTrackLoop(id);
          this.render(false);
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
        case "play-ambience-playlist":
          await playAmbiencePlaylistById(id);
          break;
        case "stop-ambience-playlist":
          await stopAmbienceByPlaylistId(id);
          break;
        case "toggle-ambience-playlist-loop":
          await toggleAmbiencePlaylistLoop(id);
          this.render(false);
          break;
        case "toggle-ambience-playlist-shuffle":
          await toggleAmbiencePlaylistShuffle(id);
          this.render(false);
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

    html.on("change", "[data-action='set-ambience-concurrency']", async (event) => {
      const enabled = Boolean(event.currentTarget.checked);
      await setAmbienceAllowConcurrent(enabled);
    });
  }

  #getCurrentLabel(tracks, playlists) {
    if (!playbackState.current) return "Остановлено";

    const currentTrack = tracks.find((track) => track.id === playbackState.current.trackId);
    if (playbackState.current.mode === "playlist") {
      const playlist = playlists.find((entry) => entry.id === playbackState.current.playlistId);
      return `Плейлист: ${playlist?.name ?? "?"} | Трек: ${currentTrack?.name ?? "?"}`;
    }

    return `Трек: ${currentTrack?.name ?? "?"}`;
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
    this.render(false);
  }

  async #deleteFile(fileId) {
    const files = getFiles();
    const file = files.find((entry) => entry.id === fileId);
    if (!file) return;

    const confirmed = await Dialog.confirm({
      title: "Удалить файл",
      content: `<p>Удалить файл <b>${escapeHtml(file.name || file.path)}</b> и связанные треки?</p>`,
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

    await setFiles(nextFiles);
    await setTracks(nextTracks);
    await setPlaylists(nextPlaylists);
    await setAmbienceTracks(nextAmbienceTracks);
    await setAmbiencePlaylists(nextAmbiencePlaylists);

    if (playbackState.current && removedTrackIds.includes(playbackState.current.trackId)) {
      await stopPlayback();
    }
    for (const ambienceTrackId of removedAmbienceTrackIds) {
      await stopAmbienceByTrackId(ambienceTrackId);
    }

    this.render(false);
  }

  async #createOrEditTrack(trackId = null) {
    const files = getFiles();
    if (!files.length) {
      ui.notifications.warn("Сначала добавьте хотя бы один файл");
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
    this.render(false);
  }

  async #deleteTrack(trackId) {
    const tracks = getTracks();
    const track = tracks.find((entry) => entry.id === trackId);
    if (!track) return;

    const confirmed = await Dialog.confirm({
      title: "Удалить трек",
      content: `<p>Удалить трек <b>${escapeHtml(track.name)}</b>?</p>`,
    });
    if (!confirmed) return;

    const nextTracks = tracks.filter((entry) => entry.id !== trackId);
    const nextPlaylists = getPlaylists().map((playlist) => ({
      ...playlist,
      trackIds: normalizeArray(playlist.trackIds).filter((id) => id !== trackId),
    }));

    await setTracks(nextTracks);
    await setPlaylists(nextPlaylists);

    if (playbackState.current?.trackId === trackId) {
      await stopPlayback();
    }

    this.render(false);
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
    this.render(false);
  }

  async #deletePlaylist(playlistId) {
    const playlists = getPlaylists();
    const playlist = playlists.find((entry) => entry.id === playlistId);
    if (!playlist) return;

    const confirmed = await Dialog.confirm({
      title: "Удалить плейлист",
      content: `<p>Удалить плейлист <b>${escapeHtml(playlist.name)}</b>?</p>`,
    });
    if (!confirmed) return;

    await setPlaylists(playlists.filter((entry) => entry.id !== playlistId));

    if (playbackState.current?.mode === "playlist" && playbackState.current?.playlistId === playlistId) {
      await stopPlayback();
    }

    this.render(false);
  }

  async #createOrEditAmbienceTrack(trackId = null) {
    const files = getFiles();
    if (!files.length) {
      ui.notifications.warn("Add at least one file first");
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
    this.render(false);
  }

  async #deleteAmbienceTrack(trackId) {
    const tracks = getAmbienceTracks();
    const track = tracks.find((entry) => entry.id === trackId);
    if (!track) return;

    const confirmed = await Dialog.confirm({
      title: "Delete ambience track",
      content: `<p>Delete ambience track <b>${escapeHtml(track.name)}</b>?</p>`,
    });
    if (!confirmed) return;

    const nextTracks = tracks.filter((entry) => entry.id !== trackId);
    const nextPlaylists = getAmbiencePlaylists().map((playlist) => ({
      ...playlist,
      trackIds: normalizeArray(playlist.trackIds).filter((id) => id !== trackId),
    }));

    await setAmbienceTracks(nextTracks);
    await setAmbiencePlaylists(nextPlaylists);
    await stopAmbienceByTrackId(trackId);
    this.render(false);
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
    this.render(false);
  }

  async #deleteAmbiencePlaylist(playlistId) {
    const playlists = getAmbiencePlaylists();
    const playlist = playlists.find((entry) => entry.id === playlistId);
    if (!playlist) return;

    const confirmed = await Dialog.confirm({
      title: "Delete ambience playlist",
      content: `<p>Delete ambience playlist <b>${escapeHtml(playlist.name)}</b>?</p>`,
    });
    if (!confirmed) return;

    await setAmbiencePlaylists(playlists.filter((entry) => entry.id !== playlistId));
    this.render(false);
  }
}

async function promptFileData(current = null) {
  const isNewFile = !current;
  const content = `
    <form class="standard-form">
      <div class="form-group">
        <label>Название</label>
        <div class="form-fields">
          <input type="text" name="name" value="${escapeHtml(current?.name ?? "")}" placeholder="Например: YouTube Hour Mix">
        </div>
      </div>
      <div class="form-group">
        <label>Путь к файлу</label>
        <div class="form-fields">
          <file-picker type="audio" name="path" value="${escapeHtml(current?.path ?? "")}"></file-picker>
        </div>
      </div>
    </form>
  `;

  const result = await promptDialog("Файл", content, {
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
    ui.notifications.warn("Нужно указать путь к аудио-файлу");
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
    <form class="standard-form">
      <div class="form-group">
        <label>Название трека</label>
        <div class="form-fields">
          <input type="text" name="name" value="${escapeHtml(current?.name ?? defaultName)}" placeholder="Например: Песня 1 (00:03-01:20)">
        </div>
      </div>
      <div class="form-group">
        <label>Файл</label>
        <div class="form-fields">
          <select name="fileId">${fileOptions}</select>
        </div>
      </div>
      <div class="form-group">
        <label>Начало отрезка</label>
        <div class="form-fields">
          <input type="text" name="start" value="${escapeHtml(initialStart)}" placeholder="00:03 или 3">
        </div>
      </div>
      <div class="form-group">
        <label>Конец отрезка</label>
        <div class="form-fields">
          <input type="text" name="end" value="${escapeHtml(initialEnd)}" placeholder="01:20 или 80">
        </div>
      </div>
      <div class="form-group">
        <label>Скорость по умолчанию</label>
        <div class="form-fields">
          <select name="rate">${rateOptions}</select>
        </div>
      </div>
    </form>
  `;

  const result = await promptDialog("Трек", content, {
    render: (html) => {
      if (!isNewTrack) return;

      const form = html[0]?.querySelector("form");
      const fileSelect = form?.querySelector("select[name='fileId']");
      const nameInput = form?.querySelector("input[name='name']");
      const startInput = form?.querySelector("input[name='start']");
      const endInput = form?.querySelector("input[name='end']");
      if (!fileSelect || !nameInput || !startInput || !endInput) return;

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
  });
  if (!result) return null;

  const fileId = String(result.fileId ?? "");
  const file = files.find((entry) => entry.id === fileId);
  if (!file) {
    ui.notifications.warn("Нужно выбрать существующий файл");
    return null;
  }
  const name = String(result.name ?? "").trim() || getDefaultNameFromFileEntry(file);
  if (!name) {
    ui.notifications.warn("Нужно указать название трека");
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
  const raw = String(value ?? "");
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch (_error) {
    return raw;
  }
}

async function promptPlaylistData(current, tracks) {
  const checked = new Set(normalizeArray(current?.trackIds));

  const trackCheckboxes = tracks.length
    ? tracks
        .map((track) => {
          const isChecked = checked.has(track.id) ? "checked" : "";
          return `<label class="checkbox"><input type="checkbox" name="trackIds" value="${track.id}" ${isChecked}> ${escapeHtml(track.name)}</label>`;
        })
        .join("<br>")
    : "<p class='notes'>Сначала создайте треки.</p>";

  const content = `
    <form class="standard-form">
      <div class="form-group">
        <label>Название плейлиста</label>
        <div class="form-fields">
          <input type="text" name="name" value="${escapeHtml(current?.name ?? "")}" placeholder="Например: Микс 1">
        </div>
      </div>
      <div class="form-group stacked">
        <label>Треки плейлиста</label>
        <div class="form-fields" style="display:block">${trackCheckboxes}</div>
      </div>
    </form>
  `;

  const result = await promptDialog("Плейлист", content);
  if (!result) return null;

  const name = String(result.name ?? "").trim();
  if (!name) {
    ui.notifications.warn("Нужно указать название плейлиста");
    return null;
  }

  const selected = result.trackIds;
  const trackIds = Array.isArray(selected) ? selected : selected ? [selected] : [];

  return {
    id: current?.id ?? foundry.utils.randomID(),
    name,
    loop: Boolean(current?.loop),
    shuffle: Boolean(current?.shuffle),
    trackIds,
  };
}

async function promptDialog(title, content, { render } = {}) {
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
          label: "Сохранить",
          icon: "<i class='fas fa-save'></i>",
          callback: (html) => {
            finished = true;
            resolve(extractFormData(html));
          },
        },
        cancel: {
          label: "Отмена",
          icon: "<i class='fas fa-times'></i>",
          callback: () => {
            finished = true;
            resolve(null);
          },
        },
      },
      default: "save",
      close: () => {
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

function startClipEndMonitor(sound, clipEnd, token) {
  const pollMs = 100;
  const toleranceSec = 0.05;

  const id = window.setInterval(() => {
    const current = playbackState.current;
    if (!current || current.token !== token) {
      window.clearInterval(id);
      return;
    }

    const currentTime = getSoundCurrentTime(sound) ?? getEstimatedAbsoluteTime(current);
    if (!Number.isFinite(currentTime)) return;

    if (currentTime + toleranceSec >= clipEnd) {
      window.clearInterval(id);
      handleTrackEnded(token, { forceStop: true }).catch((error) => {
        console.warn(`${MODULE_ID} | clip end handling failed`, error);
      });
    }
  }, pollMs);

  return id;
}

function startAmbienceClipEndMonitor(sound, clipEnd, token) {
  const pollMs = 120;
  const toleranceSec = 0.05;
  const id = window.setInterval(() => {
    const entry = ambienceState.active.get(token);
    if (!entry) {
      window.clearInterval(id);
      return;
    }
    const currentTime = getSoundCurrentTime(sound);
    if (!Number.isFinite(currentTime)) return;
    if (currentTime + toleranceSec >= clipEnd) {
      window.clearInterval(id);
      handleAmbienceEnded(token, { forceStop: true }).catch((error) => {
        console.warn(`${MODULE_ID} | ambience clip end failed`, error);
      });
    }
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

  if (Number.isFinite(sound.currentTime)) {
    return Number(sound.currentTime);
  }

  if (sound.element && Number.isFinite(sound.element.currentTime)) {
    return Number(sound.element.currentTime);
  }

  if (sound.sourceElement && Number.isFinite(sound.sourceElement.currentTime)) {
    return Number(sound.sourceElement.currentTime);
  }

  if (typeof sound.seek === "function") {
    const sought = sound.seek();
    if (Number.isFinite(sought)) return Number(sought);
  }

  return null;
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
  const absoluteNow = getCurrentAbsoluteTime(current);
  if (!Number.isFinite(absoluteNow)) return null;

  const insideClip = Math.max(0, absoluteNow - clipStart);
  const pausedMark = current.paused ? " (paused)" : "";
  if (Number.isFinite(clipEnd) && clipEnd > clipStart) {
    const clipDuration = clipEnd - clipStart;
    const boundedNow = Math.clamp(insideClip, 0, clipDuration);
    return {
      nowSeconds: boundedNow,
      maxSeconds: clipDuration,
      label: `${formatDurationClock(boundedNow)} / ${formatDurationClock(clipDuration)}${pausedMark}`,
    };
  }

  const fallbackMax = Math.max(1, insideClip);
  return {
    nowSeconds: Math.clamp(insideClip, 0, fallbackMax),
    maxSeconds: fallbackMax,
    label: `${formatDurationClock(insideClip)}${pausedMark}`,
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

function setPlaylistClipWatcher(soundDoc, clipEnd) {
  clearPlaylistClipWatcher(soundDoc);
  if (!soundDoc?.playing || !soundDoc?.sound) return;
  if (!Number.isFinite(clipEnd)) return;

  const key = soundDoc.uuid ?? soundDoc.id;
  const pollMs = 120;
  const toleranceSec = 0.05;

  const id = window.setInterval(async () => {
    const liveSound = soundDoc.sound;
    if (!soundDoc.playing || !liveSound) {
      clearPlaylistClipWatcher(soundDoc);
      return;
    }

    const currentTime = getSoundCurrentTime(liveSound);
    if (!Number.isFinite(currentTime)) return;

    if (currentTime + toleranceSec >= clipEnd) {
      clearPlaylistClipWatcher(soundDoc);
      try {
        await soundDoc.update({ playing: false });
      } catch (_error) {
        try {
          await liveSound.stop();
        } catch (__error) {
          // no-op
        }
      }
    }
  }, pollMs);

  playlistClipWatchers.set(key, id);
}

function clearPlaylistClipWatcher(soundDoc) {
  if (!soundDoc) return;
  const key = soundDoc.uuid ?? soundDoc.id;
  const id = playlistClipWatchers.get(key);
  if (!id) return;
  window.clearInterval(id);
  playlistClipWatchers.delete(key);
}

