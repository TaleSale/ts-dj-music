const MODULE_ID = "ts-dj-music";

const SETTING_KEYS = Object.freeze({
  files: "files",
  tracks: "tracks",
  playlists: "playlists",
  ambienceTracks: "ambienceTracks",
  ambiencePlaylists: "ambiencePlaylists",
  ambienceAllowConcurrent: "ambienceAllowConcurrent",
  liveRate: "liveRate",
  liveMusicVolume: "liveMusicVolume",
  liveAmbienceVolume: "liveAmbienceVolume",
});

const AUDIO_EXTENSIONS = new Set([".mp3", ".ogg", ".wav", ".webm", ".flac", ".m4a", ".aac"]);
let importInProgress = false;

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function extractBrowsePath(entry) {
  if (typeof entry === "string") return normalizePath(entry);
  const object = normalizeObject(entry);
  return normalizePath(object.path ?? object.dir ?? object.url ?? object.name ?? "");
}

function normalizePath(path) {
  return String(path ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/\/$/, "");
}

function toPathKey(path) {
  return normalizePath(path).replace(/^\/+/, "").toLowerCase();
}

function stripLeadingSlash(path) {
  return normalizePath(path).replace(/^\/+/, "");
}

function getFileName(path) {
  const normalized = normalizePath(path);
  if (!normalized) return "";
  const parts = normalized.split("/");
  return decodePathComponent(parts.at(-1) ?? "");
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

function joinPath(left, right) {
  const a = normalizePath(left);
  const b = normalizePath(right);
  if (!a) return b;
  if (!b) return a;
  return `${a}/${b}`.replace(/\/{2,}/g, "/");
}

function normalizeRate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(0.5, Math.min(2, number));
}

function normalizeVolume(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(0, Math.min(1, number));
}

function asString(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function uniqueId(preferred, usedIds) {
  const candidate = asString(preferred, foundry.utils.randomID());
  if (!usedIds.has(candidate)) {
    usedIds.add(candidate);
    return candidate;
  }

  let next = `${candidate}-${foundry.utils.randomID(4)}`;
  while (usedIds.has(next)) {
    next = `${candidate}-${foundry.utils.randomID(4)}`;
  }
  usedIds.add(next);
  return next;
}

function getCurrentSettingsSnapshot() {
  return {
    files: normalizeArray(game.settings.get(MODULE_ID, SETTING_KEYS.files)),
    tracks: normalizeArray(game.settings.get(MODULE_ID, SETTING_KEYS.tracks)),
    playlists: normalizeArray(game.settings.get(MODULE_ID, SETTING_KEYS.playlists)),
    ambienceTracks: normalizeArray(game.settings.get(MODULE_ID, SETTING_KEYS.ambienceTracks)),
    ambiencePlaylists: normalizeArray(game.settings.get(MODULE_ID, SETTING_KEYS.ambiencePlaylists)),
    ambienceAllowConcurrent: Boolean(game.settings.get(MODULE_ID, SETTING_KEYS.ambienceAllowConcurrent)),
    liveRate: normalizeRate(game.settings.get(MODULE_ID, SETTING_KEYS.liveRate)),
    liveMusicVolume: normalizeVolume(game.settings.get(MODULE_ID, SETTING_KEYS.liveMusicVolume)),
    liveAmbienceVolume: normalizeVolume(game.settings.get(MODULE_ID, SETTING_KEYS.liveAmbienceVolume)),
  };
}

function toImportShape(payload) {
  const root = normalizeObject(payload);
  const source = normalizeObject(root.settings);
  const data = Object.keys(source).length ? source : root;

  return {
    files: normalizeArray(data.files),
    tracks: normalizeArray(data.tracks),
    playlists: normalizeArray(data.playlists),
    ambienceTracks: normalizeArray(data.ambienceTracks),
    ambiencePlaylists: normalizeArray(data.ambiencePlaylists),
    ambienceAllowConcurrent: Boolean(data.ambienceAllowConcurrent),
    liveRate: normalizeRate(data.liveRate ?? 1),
    liveMusicVolume: normalizeVolume(data.liveMusicVolume ?? 1),
    liveAmbienceVolume: normalizeVolume(data.liveAmbienceVolume ?? 1),
  };
}

async function promptExportTarget(defaultName) {
  return new Promise((resolve) => {
    new Dialog({
      title: "TS-DJ-MUSIC | Export settings",
      content: `
        <p>Choose folder and file name for exported settings.</p>
        <div style="display:grid; gap:8px;">
          <div style="display:flex; gap:8px; align-items:center;">
            <label style="min-width:64px;">Folder</label>
            <input type="text" id="ts-dj-export-folder" style="flex:1;" value="worlds">
            <button type="button" id="ts-dj-export-folder-browse">Browse</button>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <label style="min-width:64px;">File</label>
            <input type="text" id="ts-dj-export-file" style="flex:1;" value="${foundry.utils.escapeHTML(defaultName)}">
          </div>
        </div>
      `,
      buttons: {
        save: {
          label: "Save",
          callback: (html) => {
            const folder = normalizePath(html.find("#ts-dj-export-folder").val());
            const file = asString(html.find("#ts-dj-export-file").val(), defaultName);
            resolve({ folder, file });
          },
        },
        cancel: {
          label: "Cancel",
          callback: () => resolve(null),
        },
      },
      default: "save",
      render: (html) => {
        html.find("#ts-dj-export-folder-browse").on("click", () => {
          new FilePicker({
            type: "folder",
            source: "data",
            callback: (folderPath) => {
              html.find("#ts-dj-export-folder").val(folderPath);
            },
          }).render(true);
        });
      },
    }).render(true);
  });
}

async function uploadJsonToDataFolder(payload, folderPath, fileName) {
  const normalizedFolder = normalizePath(folderPath);
  const normalizedFileName = asString(fileName, `${MODULE_ID}-settings.json`).toLowerCase().endsWith(".json")
    ? asString(fileName, `${MODULE_ID}-settings.json`)
    : `${asString(fileName, `${MODULE_ID}-settings`)}.json`;

  if (!normalizedFolder) {
    throw new Error("Folder path is required.");
  }

  const json = JSON.stringify(payload, null, 2);
  const file = new File([json], normalizedFileName, { type: "application/json" });

  const response = await FilePicker.upload("data", normalizedFolder, file, {}, { notify: false });
  const savedPath = normalizePath(response?.path ?? joinPath(normalizedFolder, normalizedFileName));
  return savedPath;
}

async function promptImportPath(initialValue = "") {
  return new Promise((resolve) => {
    let settled = false;
    const picker = new FilePicker({
      type: "text",
      source: "data",
      current: normalizePath(initialValue) || undefined,
      callback: (filePath) => {
        settled = true;
        resolve(normalizePath(filePath) || null);
      },
    });

    const originalClose = picker.close.bind(picker);
    picker.close = async (...args) => {
      const result = await originalClose(...args);
      if (!settled) {
        settled = true;
        resolve(null);
      }
      return result;
    };

    picker.render(true);
  });
}

async function fetchJsonFromFoundryPath(filePath) {
  const normalizedPath = normalizePath(filePath);
  if (!normalizedPath) throw new Error("Path is empty.");

  const urls = [normalizedPath, `/${normalizedPath}`];
  let lastError = null;

  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Failed to load JSON file.");
}

async function promptFolderPath(_message, initialValue = "") {
  return new Promise((resolve) => {
    let settled = false;
    const picker = new FilePicker({
      type: "folder",
      source: "data",
      current: normalizePath(initialValue) || undefined,
      callback: (folderPath) => {
        settled = true;
        resolve(normalizePath(folderPath) || null);
      },
    });

    const originalClose = picker.close.bind(picker);
    picker.close = async (...args) => {
      const result = await originalClose(...args);
      if (!settled) {
        settled = true;
        resolve(null);
      }
      return result;
    };

    picker.render(true);
  });
}

async function browseDataDirectory(directory) {
  const normalizedDirectory = normalizePath(directory);
  const withoutLeadingSlash = stripLeadingSlash(normalizedDirectory);
  const candidates = normalizedDirectory
    ? [normalizedDirectory, withoutLeadingSlash, `/${withoutLeadingSlash}`]
    : ["", "/", "."];

  const uniqueCandidates = [...new Set(candidates)];
  let lastError = null;

  for (const candidate of uniqueCandidates) {
    try {
      return await FilePicker.browse("data", candidate);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Failed to browse data directory.");
}

async function buildFolderIndex(folderPath) {
  const byPath = new Map();
  const byName = new Map();
  const visited = new Set();

  const visit = async (directory) => {
    const normalizedDirectory = normalizePath(directory);

    const key = toPathKey(normalizedDirectory) || "<root>";
    if (visited.has(key)) return;
    visited.add(key);

    let result;
    try {
      result = await browseDataDirectory(normalizedDirectory);
    } catch (_error) {
      return;
    }

    for (const filePath of normalizeArray(result.files)) {
      const normalizedFilePath = extractBrowsePath(filePath);
      if (!normalizedFilePath) continue;
      const extension = `.${(normalizedFilePath.split(".").at(-1) ?? "").toLowerCase()}`;
      if (!AUDIO_EXTENSIONS.has(extension)) continue;

      byPath.set(toPathKey(normalizedFilePath), normalizedFilePath);

      const fileName = getFileName(normalizedFilePath).toLowerCase();
      if (!byName.has(fileName)) byName.set(fileName, []);
      byName.get(fileName).push(normalizedFilePath);
    }

    for (const nested of normalizeArray(result.dirs)) {
      const nestedPath = extractBrowsePath(nested);
      if (!nestedPath) continue;
      await visit(nestedPath);
    }
  };

  await visit(folderPath);
  return { byPath, byName };
}

function resolvePath(rawPath, folderIndex, selectedFolder) {
  const normalizedPath = normalizePath(rawPath);
  const normalizedPathWithoutSlash = stripLeadingSlash(normalizedPath);
  const fileName = getFileName(normalizedPath);
  const candidates = [];

  if (normalizedPath) {
    candidates.push(normalizedPath);
    if (normalizedPathWithoutSlash && normalizedPathWithoutSlash !== normalizedPath) {
      candidates.push(normalizedPathWithoutSlash);
    }
    if (selectedFolder) candidates.push(joinPath(selectedFolder, fileName || normalizedPath));
  } else if (selectedFolder && fileName) {
    candidates.push(joinPath(selectedFolder, fileName));
  }

  for (const candidate of candidates) {
    const match = folderIndex.byPath.get(toPathKey(candidate));
    if (match) return match;
  }

  if (fileName) {
    const byName = folderIndex.byName.get(fileName.toLowerCase());
    if (Array.isArray(byName) && byName.length > 0) return byName[0];
  }

  return null;
}

function normalizeImportedFiles(importedFiles, folderIndex, selectedFolder) {
  const resultFiles = [];
  const oldToNewId = new Map();
  const usedIds = new Set();
  let missing = 0;

  for (const rawFile of normalizeArray(importedFiles)) {
    const file = normalizeObject(rawFile);
    const rawPath = asString(file.path);
    if (!rawPath) {
      missing += 1;
      continue;
    }

    const resolvedPath = resolvePath(rawPath, folderIndex, selectedFolder);
    if (!resolvedPath) {
      missing += 1;
      continue;
    }

    const oldId = asString(file.id, foundry.utils.randomID());
    const newId = uniqueId(oldId, usedIds);
    oldToNewId.set(oldId, newId);

    resultFiles.push({
      id: newId,
      name: asString(file.name, getFileName(resolvedPath)),
      path: resolvedPath,
    });
  }

  return { resultFiles, oldToNewId, missing };
}

function normalizeImportedTracks(importedTracks, oldToNewFileId) {
  const tracks = [];
  const oldToNewTrackId = new Map();
  const usedIds = new Set();

  for (const rawTrack of normalizeArray(importedTracks)) {
    const track = normalizeObject(rawTrack);
    const oldTrackId = asString(track.id, foundry.utils.randomID());
    const oldFileId = asString(track.fileId);
    const mappedFileId = oldToNewFileId.get(oldFileId);
    if (!mappedFileId) continue;

    const newTrackId = uniqueId(oldTrackId, usedIds);
    oldToNewTrackId.set(oldTrackId, newTrackId);

    tracks.push({
      id: newTrackId,
      name: asString(track.name, "Track"),
      fileId: mappedFileId,
      start: asString(track.start),
      end: asString(track.end),
      rate: normalizeRate(track.rate ?? 1),
      loop: Boolean(track.loop),
    });
  }

  return { tracks, oldToNewTrackId };
}

function normalizeImportedPlaylists(importedPlaylists, oldToNewTrackId) {
  const playlists = [];
  const usedIds = new Set();
  let skipped = 0;

  for (const rawPlaylist of normalizeArray(importedPlaylists)) {
    const playlist = normalizeObject(rawPlaylist);
    const trackIds = normalizeArray(playlist.trackIds)
      .map((id) => oldToNewTrackId.get(asString(id)))
      .filter(Boolean);

    if (trackIds.length === 0) {
      skipped += 1;
      continue;
    }

    playlists.push({
      id: uniqueId(asString(playlist.id, foundry.utils.randomID()), usedIds),
      name: asString(playlist.name, "Playlist"),
      loop: Boolean(playlist.loop),
      shuffle: Boolean(playlist.shuffle),
      trackIds,
    });
  }

  return { playlists, skipped };
}

async function applyImportedSettings(payload, selectedFolder = "") {
  const incoming = toImportShape(payload);
  const normalizedSelectedFolder = normalizePath(selectedFolder);

  const requiredPaths = incoming.files
    .map((entry) => normalizePath(normalizeObject(entry).path))
    .filter(Boolean);
  const requiredNames = new Set(requiredPaths.map((path) => getFileName(path).toLowerCase()).filter(Boolean));

  let folderIndex = { byPath: new Map(), byName: new Map() };

  if (requiredNames.size > 0 && normalizedSelectedFolder) {
    folderIndex = await buildFolderIndex(normalizedSelectedFolder);
  }

  const { resultFiles, oldToNewId, missing } = normalizeImportedFiles(
    incoming.files,
    folderIndex,
    normalizedSelectedFolder
  );

  const { tracks, oldToNewTrackId } = normalizeImportedTracks(incoming.tracks, oldToNewId);
  const { tracks: ambienceTracks, oldToNewTrackId: oldToNewAmbienceTrackId } = normalizeImportedTracks(incoming.ambienceTracks, oldToNewId);

  const { playlists, skipped: skippedPlaylists } = normalizeImportedPlaylists(incoming.playlists, oldToNewTrackId);
  const { playlists: ambiencePlaylists, skipped: skippedAmbiencePlaylists } = normalizeImportedPlaylists(incoming.ambiencePlaylists, oldToNewAmbienceTrackId);

  await game.settings.set(MODULE_ID, SETTING_KEYS.files, resultFiles);
  await game.settings.set(MODULE_ID, SETTING_KEYS.tracks, tracks);
  await game.settings.set(MODULE_ID, SETTING_KEYS.playlists, playlists);
  await game.settings.set(MODULE_ID, SETTING_KEYS.ambienceTracks, ambienceTracks);
  await game.settings.set(MODULE_ID, SETTING_KEYS.ambiencePlaylists, ambiencePlaylists);
  await game.settings.set(MODULE_ID, SETTING_KEYS.ambienceAllowConcurrent, Boolean(incoming.ambienceAllowConcurrent));
  await game.settings.set(MODULE_ID, SETTING_KEYS.liveRate, normalizeRate(incoming.liveRate));
  await game.settings.set(MODULE_ID, SETTING_KEYS.liveMusicVolume, normalizeVolume(incoming.liveMusicVolume));
  await game.settings.set(MODULE_ID, SETTING_KEYS.liveAmbienceVolume, normalizeVolume(incoming.liveAmbienceVolume));

  return {
    applied: true,
    cancelled: false,
    summary: {
      importedFiles: resultFiles.length,
      missingFiles: missing,
      musicTracks: tracks.length,
      ambienceTracks: ambienceTracks.length,
      musicPlaylists: playlists.length,
      ambiencePlaylists: ambiencePlaylists.length,
      skippedMusicPlaylists: skippedPlaylists,
      skippedAmbiencePlaylists: skippedAmbiencePlaylists,
    },
  };
}

export async function exportModuleSettings() {
  if (!game.user?.isGM) {
    ui.notifications.warn("TS-DJ-MUSIC: only GM can export settings.");
    return false;
  }

  const settings = getCurrentSettingsSnapshot();
  const payload = {
    version: 1,
    moduleId: MODULE_ID,
    exportedAt: new Date().toISOString(),
    settings,
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = await promptExportTarget(`${MODULE_ID}-settings-${stamp}.json`);
  if (!target) return false;

  try {
    const savedPath = await uploadJsonToDataFolder(payload, target.folder, target.file);
    ui.notifications.info(`TS-DJ-MUSIC: settings exported to ${savedPath}.`);
  } catch (error) {
    console.warn(`${MODULE_ID} | export failed`, error);
    ui.notifications.error("TS-DJ-MUSIC: export failed.");
    return false;
  }

  return true;
}

export async function importModuleSettings() {
  if (!game.user?.isGM) {
    ui.notifications.warn("TS-DJ-MUSIC: only GM can import settings.");
    return { applied: false, cancelled: false };
  }

  if (importInProgress) {
    return { applied: false, cancelled: true };
  }
  importInProgress = true;

  try {
    const filePath = await promptImportPath();
    if (!filePath) {
      return { applied: false, cancelled: true };
    }

    let payload;
    try {
      payload = await fetchJsonFromFoundryPath(filePath);
    } catch (error) {
      console.warn(`${MODULE_ID} | import read failed`, error);
      ui.notifications.error("TS-DJ-MUSIC: failed to load JSON from Foundry Data.");
      return { applied: false, cancelled: false };
    }

    if (!payload || typeof payload !== "object") {
      ui.notifications.error("TS-DJ-MUSIC: invalid import payload.");
      return { applied: false, cancelled: false };
    }

    const selectedFolder = await promptFolderPath("Select folder with audio files for imported settings.");
    if (!selectedFolder) {
      return { applied: false, cancelled: true };
    }

    const result = await applyImportedSettings(payload, selectedFolder);
    if (!result.applied && !result.cancelled) {
      ui.notifications.warn("TS-DJ-MUSIC: import finished with no changes.");
    }

    return result;
  } finally {
    importInProgress = false;
  }
}
