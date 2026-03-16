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

const STORAGE_PLAYLIST_NAME = "TS-DJ-MUSIC Storage";
const STORAGE_FLAG_KEYS = Object.freeze({
  isStorage: "isStoragePlaylist",
  dataStore: "dataStore",
});

const AUDIO_EXTENSIONS = new Set([".mp3", ".ogg", ".wav", ".webm", ".flac", ".m4a", ".aac"]);
let importInProgress = false;

const I18N_PREFIX = "TS_DJ_MUSIC";

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

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function decodeEscapedUnicode(value) {
  const raw = String(value ?? "");
  if (!raw) return "";
  return raw.replace(/\\+[uU]([0-9a-fA-F]{4})/g, (_match, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function extractBrowsePath(entry) {
  if (typeof entry === "string") return normalizePath(entry);
  const object = normalizeObject(entry);
  return normalizePath(object.path ?? object.dir ?? object.url ?? object.name ?? "");
}

function normalizePath(path) {
  const raw = decodeEscapedUnicode(path)
    .split("#")[0]
    .split("?")[0];

  return String(raw ?? "")
    .trim()
    .replace(/^\[(data|public|s3)\]\s*/i, "")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/\/$/, "");
}

function toPathKey(path) {
  return normalizePath(path)
    .split("/")
    .map((segment) => decodePathComponent(segment))
    .join("/")
    .replace(/^\/+/, "")
    .toLowerCase();
}

function stripLeadingSlash(path) {
  return normalizePath(path).replace(/^\/+/, "");
}

function stripSourcePrefix(path) {
  return stripLeadingSlash(path).replace(/^(data|public)\//i, "");
}

function getPathLookupCandidates(path) {
  const normalizedPath = normalizePath(path);
  const candidates = [];

  if (!normalizedPath) return candidates;

  candidates.push(normalizedPath);

  const withoutLeadingSlash = stripLeadingSlash(normalizedPath);
  if (withoutLeadingSlash && withoutLeadingSlash !== normalizedPath) {
    candidates.push(withoutLeadingSlash);
  }

  const withoutSourcePrefix = stripSourcePrefix(normalizedPath);
  if (withoutSourcePrefix && !candidates.includes(withoutSourcePrefix)) {
    candidates.push(withoutSourcePrefix);
  }

  return candidates;
}

function getFileName(path) {
  const normalized = normalizePath(path);
  if (!normalized) return "";
  const parts = normalized.split("/");
  return decodePathComponent(parts.at(-1) ?? "");
}

function getParentDirectory(path) {
  const normalized = normalizePath(path);
  if (!normalized) return "";
  const parts = normalized.split("/");
  parts.pop();
  return parts.join("/");
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

function updateImportProgress(label, pct = 0) {
  const progress = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  const displayProgressBar = globalThis.SceneNavigation?.displayProgressBar;
  if (typeof displayProgressBar === "function") {
    displayProgressBar.call(globalThis.SceneNavigation, { label, pct: progress });
    return true;
  }
  return false;
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

function normalizeStorageData(raw) {
  const source = normalizeObject(raw);
  return {
    files: normalizeArray(source.files),
    tracks: normalizeArray(source.tracks),
    playlists: normalizeArray(source.playlists),
    ambienceTracks: normalizeArray(source.ambienceTracks),
    ambiencePlaylists: normalizeArray(source.ambiencePlaylists),
    ambienceAllowConcurrent: Boolean(source.ambienceAllowConcurrent),
  };
}

function isStoragePlaylistDocument(playlist) {
  return Boolean(playlist?.getFlag?.(MODULE_ID, STORAGE_FLAG_KEYS.isStorage));
}

function findStoragePlaylist() {
  const byFlag = game.playlists?.contents?.find((playlist) => isStoragePlaylistDocument(playlist));
  if (byFlag) return byFlag;
  return game.playlists?.contents?.find((playlist) => String(playlist?.name ?? "") === STORAGE_PLAYLIST_NAME) ?? null;
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

function canCurrentUserExportSettings(user = game.user) {
  if (!user) return false;
  if (user.isGM) return true;
  const playlist = findStoragePlaylist();
  if (!playlist) return false;
  return canUserUpdatePlaylist(playlist, user);
}

async function ensureStoragePlaylist() {
  let playlist = findStoragePlaylist();
  if (playlist) {
    if (!isStoragePlaylistDocument(playlist)) {
      await playlist.setFlag(MODULE_ID, STORAGE_FLAG_KEYS.isStorage, true);
    }
    return playlist;
  }

  const playlistClass = globalThis.Playlist ?? game.playlists?.documentClass;
  if (!playlistClass?.create) {
    throw new Error("Playlist document class is unavailable.");
  }

  playlist = await playlistClass.create({
    name: STORAGE_PLAYLIST_NAME,
    description: "TS-DJ-MUSIC data storage playlist",
  });
  await playlist.setFlag(MODULE_ID, STORAGE_FLAG_KEYS.isStorage, true);
  await playlist.setFlag(MODULE_ID, STORAGE_FLAG_KEYS.dataStore, normalizeStorageData({}));
  return playlist;
}

function getStorageSnapshot() {
  const playlist = findStoragePlaylist();
  if (!playlist) return null;
  return normalizeStorageData(playlist.getFlag(MODULE_ID, STORAGE_FLAG_KEYS.dataStore));
}

async function setStorageSnapshot(payload) {
  const playlist = await ensureStoragePlaylist();
  await playlist.setFlag(MODULE_ID, STORAGE_FLAG_KEYS.dataStore, normalizeStorageData(payload));
}

async function getCurrentSettingsSnapshot() {
  const storage = getStorageSnapshot();
  const store = storage ?? {
    files: normalizeArray(game.settings.get(MODULE_ID, SETTING_KEYS.files)),
    tracks: normalizeArray(game.settings.get(MODULE_ID, SETTING_KEYS.tracks)),
    playlists: normalizeArray(game.settings.get(MODULE_ID, SETTING_KEYS.playlists)),
    ambienceTracks: normalizeArray(game.settings.get(MODULE_ID, SETTING_KEYS.ambienceTracks)),
    ambiencePlaylists: normalizeArray(game.settings.get(MODULE_ID, SETTING_KEYS.ambiencePlaylists)),
    ambienceAllowConcurrent: Boolean(game.settings.get(MODULE_ID, SETTING_KEYS.ambienceAllowConcurrent)),
  };

  return {
    files: normalizeArray(store.files),
    tracks: normalizeArray(store.tracks),
    playlists: normalizeArray(store.playlists),
    ambienceTracks: normalizeArray(store.ambienceTracks),
    ambiencePlaylists: normalizeArray(store.ambiencePlaylists),
    ambienceAllowConcurrent: Boolean(store.ambienceAllowConcurrent),
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

function ensureJsonFileName(fileName, fallbackName = `${MODULE_ID}-settings.json`) {
  const normalized = asString(fileName, fallbackName);
  return normalized.toLowerCase().endsWith(".json") ? normalized : `${normalized}.json`;
}

async function promptExportTarget(defaultName) {
  return new Promise((resolve) => {
    new Dialog({
      title: t("Transfer.ExportTitle", "TS-DJ-MUSIC | Export settings"),
      content: `
        <div class="ts-dj-transfer-dialog">
          <p class="ts-dj-transfer-dialog__lead">${t("Transfer.ExportLead", "Choose where to export the settings JSON.")}</p>
          <section class="ts-dj-transfer-dialog__section">
            <div class="ts-dj-transfer-dialog__title-row">
              <h3>${t("Transfer.FoundryDataTitle", "Foundry Data")}</h3>
              <span>${t("Transfer.FoundryDataDescription", "Save into a folder accessible from the world.")}</span>
            </div>
            <div class="ts-dj-transfer-dialog__field">
              <label for="ts-dj-export-folder">${t("Transfer.FolderLabel", "Folder")}</label>
              <div class="ts-dj-transfer-dialog__control ts-dj-transfer-dialog__control--stacked">
                <button type="button" id="ts-dj-export-folder-browse">${t("Transfer.Browse", "Browse")}</button>
                <input type="text" id="ts-dj-export-folder" value="worlds">
              </div>
            </div>
          </section>
          <section class="ts-dj-transfer-dialog__section">
            <div class="ts-dj-transfer-dialog__title-row">
              <h3>${t("Transfer.FileSectionTitle", "File")}</h3>
              <span>${t("Transfer.FileSectionDescription", "The same file name is used for both export options.")}</span>
            </div>
            <div class="ts-dj-transfer-dialog__field">
              <label for="ts-dj-export-file">${t("Transfer.FileNameLabel", "File name")}</label>
              <div class="ts-dj-transfer-dialog__control">
                <input type="text" id="ts-dj-export-file" value="${foundry.utils.escapeHTML(defaultName)}">
              </div>
            </div>
          </section>
          <section class="ts-dj-transfer-dialog__section ts-dj-transfer-dialog__section--muted">
            <div class="ts-dj-transfer-dialog__title-row">
              <h3>${t("Transfer.ComputerTitle", "Computer")}</h3>
              <span>${t("Transfer.ComputerDescription", "Use Download to save the JSON directly to your device.")}</span>
            </div>
          </section>
        </div>
      `,
      buttons: {
        saveToData: {
          label: t("Transfer.ExportToFoundryData", "Export to Foundry Data"),
          callback: (html) => {
            const folder = normalizePath(html.find("#ts-dj-export-folder").val());
            const file = ensureJsonFileName(html.find("#ts-dj-export-file").val(), defaultName);
            resolve({ mode: "data", folder, file });
          },
        },
        saveToComputer: {
          label: t("Transfer.ExportToComputer", "Export to Computer"),
          callback: (html) => {
            const file = ensureJsonFileName(html.find("#ts-dj-export-file").val(), defaultName);
            resolve({ mode: "download", file });
          },
        },
        cancel: {
          label: t("Common.Cancel", "Cancel"),
          callback: () => resolve(null),
        },
      },
      default: "saveToData",
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
    }, { width: 560 }).render(true);
  });
}

async function uploadJsonToDataFolder(payload, folderPath, fileName) {
  const normalizedFolder = normalizePath(folderPath);
  const normalizedFileName = ensureJsonFileName(fileName, `${MODULE_ID}-settings.json`);

  if (!normalizedFolder) {
    throw new Error("Folder path is required.");
  }

  const json = JSON.stringify(payload, null, 2);
  const file = new File([json], normalizedFileName, { type: "application/json" });

  const response = await FilePicker.upload("data", normalizedFolder, file, {}, { notify: false });
  const savedPath = normalizePath(response?.path ?? joinPath(normalizedFolder, normalizedFileName));
  return savedPath;
}

async function downloadJsonToComputer(payload, fileName) {
  const normalizedFileName = ensureJsonFileName(fileName, `${MODULE_ID}-settings.json`);
  const json = JSON.stringify(payload, null, 2);
  foundry.utils.saveDataToFile(json, "text/json", normalizedFileName);
  return normalizedFileName;
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

async function promptImportSource(initialValue = "") {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    new Dialog({
      title: t("Transfer.ImportTitle", "TS-DJ-MUSIC | Import settings"),
      content: `
        <div class="ts-dj-transfer-dialog">
          <p class="ts-dj-transfer-dialog__lead">${t("Transfer.ImportLead", "Choose where to load the settings JSON from.")}</p>
          <section class="ts-dj-transfer-dialog__section">
            <div class="ts-dj-transfer-dialog__title-row">
              <h3>${t("Transfer.FoundryDataTitle", "Foundry Data")}</h3>
              <span>${t("Transfer.FoundryDataImportDescription", "Select an existing JSON file from the data directory.")}</span>
            </div>
            <div class="ts-dj-transfer-dialog__field">
              <label for="ts-dj-import-path">${t("Transfer.JsonFileLabel", "JSON file")}</label>
              <div class="ts-dj-transfer-dialog__control ts-dj-transfer-dialog__control--stacked">
                <button type="button" id="ts-dj-import-path-browse">${t("Transfer.Browse", "Browse")}</button>
                <input type="text" id="ts-dj-import-path" value="${foundry.utils.escapeHTML(initialValue)}" placeholder="worlds/.../ts-dj-music-settings.json">
              </div>
            </div>
          </section>
          <section class="ts-dj-transfer-dialog__section">
            <div class="ts-dj-transfer-dialog__title-row">
              <h3>${t("Transfer.ComputerTitle", "Computer")}</h3>
              <span>${t("Transfer.ComputerImportDescription", "Choose a local JSON file from your device.")}</span>
            </div>
            <div class="ts-dj-transfer-dialog__field">
              <label for="ts-dj-import-file">${t("Transfer.LocalFileLabel", "Local file")}</label>
              <div class="ts-dj-transfer-dialog__control ts-dj-transfer-dialog__control--file-picker">
                <input type="file" id="ts-dj-import-file" class="ts-dj-transfer-dialog__file-input" accept=".json,application/json">
                <button type="button" id="ts-dj-import-file-browse">${t("Transfer.Browse", "Browse")}</button>
                <div id="ts-dj-import-file-name" class="ts-dj-transfer-dialog__file-name">${t("Transfer.NoFileChosen", "No file chosen")}</div>
              </div>
            </div>
          </section>
        </div>
      `,
      buttons: {
        importFromData: {
          label: t("Transfer.ImportFromFoundryData", "Import from Foundry Data"),
          callback: (html) => {
            const path = normalizePath(html.find("#ts-dj-import-path").val());
            settle(path ? { mode: "data", path } : null);
          },
        },
        importFromComputer: {
          label: t("Transfer.ImportFromComputer", "Import from Computer"),
          callback: (html) => {
            const input = html.find("#ts-dj-import-file")[0];
            const file = input?.files?.[0] ?? null;
            settle(file ? { mode: "file", file } : null);
          },
        },
        cancel: {
          label: t("Common.Cancel", "Cancel"),
          callback: () => settle(null),
        },
      },
      default: "importFromData",
      close: () => settle(null),
      render: (html) => {
        const updateLocalFileName = () => {
          const file = html.find("#ts-dj-import-file")[0]?.files?.[0] ?? null;
          html.find("#ts-dj-import-file-name").text(file?.name || t("Transfer.NoFileChosen", "No file chosen"));
        };

        const updateImportButtons = () => {
          const hasPath = Boolean(normalizePath(html.find("#ts-dj-import-path").val()));
          const hasLocalFile = Boolean(html.find("#ts-dj-import-file")[0]?.files?.length);

          html.find("[data-button='importFromData']").prop("disabled", !hasPath);
          html.find("[data-button='importFromComputer']").prop("disabled", !hasLocalFile);
        };

        html.find("#ts-dj-import-path-browse").on("click", async () => {
          const picked = await promptImportPath(html.find("#ts-dj-import-path").val());
          if (picked) {
            html.find("#ts-dj-import-path").val(picked);
          }
          updateImportButtons();
        });

        html.find("#ts-dj-import-file-browse").on("click", () => {
          html.find("#ts-dj-import-file").trigger("click");
        });

        html.find("#ts-dj-import-path").on("input change", updateImportButtons);
        html.find("#ts-dj-import-file").on("change", () => {
          updateLocalFileName();
          updateImportButtons();
        });
        updateLocalFileName();
        updateImportButtons();
      },
    }, { width: 560 }).render(true);
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

async function readJsonFromLocalFile(file) {
  if (!(file instanceof File)) {
    throw new Error("File is required.");
  }

  const text = await file.text();
  return JSON.parse(text);
}

async function browseDataDirectory(directory) {
  const normalizedDirectory = normalizePath(directory);
  const withoutLeadingSlash = stripLeadingSlash(normalizedDirectory);
  const withoutSourcePrefix = stripSourcePrefix(normalizedDirectory);
  const candidates = normalizedDirectory
    ? [normalizedDirectory, withoutLeadingSlash, withoutSourcePrefix, `/${withoutLeadingSlash}`, `/${withoutSourcePrefix}`]
    : ["", "/", "."];

  const uniqueCandidates = [...new Set(candidates.filter((candidate) => candidate !== null && candidate !== undefined))];
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

function resolveBrowseEntryPath(baseDirectory, rawEntryPath) {
  const entryPath = normalizePath(rawEntryPath);
  if (!entryPath) return "";

  const basePath = normalizePath(baseDirectory);
  if (!basePath) return entryPath;

  const entryKey = toPathKey(entryPath);
  const baseKey = toPathKey(basePath);
  if (entryKey === baseKey || entryKey.startsWith(`${baseKey}/`)) {
    return entryPath;
  }

  if (entryPath.startsWith("/")) return entryPath;

  const entryRoot = entryPath.split("/")[0]?.toLowerCase();
  if (["worlds", "systems", "modules", "assets", "packs"].includes(entryRoot)) {
    return entryPath;
  }

  return joinPath(basePath, entryPath);
}

function createImportRequirements(importedFiles) {
  const byPathKey = new Map();
  const byName = new Map();
  const unresolvedExact = new Set();

  let requirementId = 0;

  for (const rawFile of normalizeArray(importedFiles)) {
    const file = normalizeObject(rawFile);
    const rawPath = asString(file.path);
    if (!rawPath) continue;

    const candidatePaths = [...new Set(getPathLookupCandidates(rawPath))];
    const candidateKeys = candidatePaths.map((path) => toPathKey(path)).filter(Boolean);
    const fileName = getFileName(rawPath).toLowerCase();
    if (candidateKeys.length === 0 && !fileName) continue;

    const currentId = requirementId;
    requirementId += 1;
    if (candidateKeys.length > 0) {
      unresolvedExact.add(currentId);
    }

    for (const candidateKey of candidateKeys) {
      if (!byPathKey.has(candidateKey)) byPathKey.set(candidateKey, []);
      byPathKey.get(candidateKey).push(currentId);
    }

    if (fileName) {
      if (!byName.has(fileName)) byName.set(fileName, []);
      byName.get(fileName).push(currentId);
    }
  }

  return { byPathKey, byName, unresolvedExact };
}

async function buildExactPathIndex(importedFiles) {
  const byPath = new Map();
  const candidateDirectories = new Map();

  for (const rawFile of normalizeArray(importedFiles)) {
    const file = normalizeObject(rawFile);
    const rawPath = asString(file.path);
    if (!rawPath) continue;

    for (const candidatePath of getPathLookupCandidates(rawPath)) {
      const directory = getParentDirectory(candidatePath);
      candidateDirectories.set(directory, (candidateDirectories.get(directory) ?? 0) + 1);
    }
  }

  const directories = [...candidateDirectories.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([directory]) => directory);

  for (const directory of directories) {
    let result;
    try {
      result = await browseDataDirectory(directory);
    } catch (_error) {
      continue;
    }

    for (const filePath of normalizeArray(result.files)) {
      const normalizedFilePath = resolveBrowseEntryPath(directory, extractBrowsePath(filePath));
      if (!normalizedFilePath) continue;

      const extension = `.${(normalizedFilePath.split(".").at(-1) ?? "").toLowerCase()}`;
      if (!AUDIO_EXTENSIONS.has(extension)) continue;

      const pathKey = toPathKey(normalizedFilePath);
      byPath.set(pathKey, normalizedFilePath);
    }
  }

  return { byPath, byName: new Map() };
}

function mergeFolderIndexes(...indexes) {
  const result = { byPath: new Map(), byName: new Map() };

  for (const index of indexes) {
    if (!index) continue;

    for (const [pathKey, pathValue] of index.byPath ?? new Map()) {
      result.byPath.set(pathKey, pathValue);
    }

    for (const [fileName, matches] of index.byName ?? new Map()) {
      if (!result.byName.has(fileName)) result.byName.set(fileName, []);
      const nextMatches = result.byName.get(fileName);
      for (const match of matches) {
        if (!nextMatches.includes(match)) {
          nextMatches.push(match);
        }
      }
    }
  }

  return result;
}

async function buildFolderIndex(folderPath, requirements = null) {
  const byPath = new Map();
  const byName = new Map();
  const visited = new Set();
  const byRequiredPathKey = requirements?.byPathKey ?? new Map();
  const byRequiredName = requirements?.byName ?? new Map();
  const unresolvedExact = requirements?.unresolvedExact ?? null;
  const hotDirectoryKeys = new Map();
  const hasRelevantNestedPath = (directoryPath) => {
    if (!unresolvedExact || unresolvedExact.size === 0) return false;

    const directoryKey = toPathKey(directoryPath);
    if (!directoryKey) return true;

    for (const [candidateKey, requirementIds] of byRequiredPathKey.entries()) {
      if (candidateKey !== directoryKey && !candidateKey.startsWith(`${directoryKey}/`)) continue;
      if (requirementIds.some((requirementId) => unresolvedExact.has(requirementId))) {
        return true;
      }
    }

    return false;
  };
  const getParentDirectoryKey = (directoryKey) => {
    const parts = directoryKey.split("/");
    parts.pop();
    return parts.join("/");
  };
  const markHotDirectory = (directoryPath, weight = 1) => {
    const directoryKey = toPathKey(directoryPath);
    if (!directoryKey) return;
    hotDirectoryKeys.set(directoryKey, (hotDirectoryKeys.get(directoryKey) ?? 0) + weight);
  };
  const getHotDirectoryScore = (directoryPath) => {
    const directoryKey = toPathKey(directoryPath);
    if (!directoryKey) return 0;

    let score = hotDirectoryKeys.get(directoryKey) ?? 0;
    const parentKey = getParentDirectoryKey(directoryKey);

    for (const [hotKey, hotWeight] of hotDirectoryKeys.entries()) {
      if (hotKey === directoryKey) {
        score += hotWeight * 8;
        continue;
      }
      if (hotKey.startsWith(`${directoryKey}/`)) {
        score += hotWeight * 6;
        continue;
      }
      if (directoryKey.startsWith(`${hotKey}/`)) {
        score += hotWeight * 4;
        continue;
      }
      if (parentKey && parentKey === getParentDirectoryKey(hotKey)) {
        score += hotWeight * 2;
      }
    }

    return score;
  };

  const visit = async (directory) => {
    const normalizedDirectory = normalizePath(directory);

    const key = toPathKey(normalizedDirectory) || "<root>";
    if (visited.has(key)) return;
    visited.add(key);
    if (unresolvedExact && unresolvedExact.size === 0) return;

    let result;
    try {
      result = await browseDataDirectory(normalizedDirectory);
    } catch (_error) {
      return;
    }

    let matchedInDirectory = 0;
    for (const filePath of normalizeArray(result.files)) {
      const normalizedFilePath = resolveBrowseEntryPath(normalizedDirectory, extractBrowsePath(filePath));
      if (!normalizedFilePath) continue;
      const extension = `.${(normalizedFilePath.split(".").at(-1) ?? "").toLowerCase()}`;
      if (!AUDIO_EXTENSIONS.has(extension)) continue;
      const pathKey = toPathKey(normalizedFilePath);
      const fileName = getFileName(normalizedFilePath).toLowerCase();

      if (requirements) {
        const matchesPath = byRequiredPathKey.has(pathKey);
        const matchesName = fileName && byRequiredName.has(fileName);
        if (!matchesPath && !matchesName) continue;

        if (matchesPath) {
          byPath.set(pathKey, normalizedFilePath);
          for (const requirementId of byRequiredPathKey.get(pathKey)) {
            unresolvedExact.delete(requirementId);
          }
          matchedInDirectory += 2;
        }

        if (matchesName) {
          if (!byName.has(fileName)) byName.set(fileName, []);
          const fileMatches = byName.get(fileName);
          if (!fileMatches.includes(normalizedFilePath)) {
            fileMatches.push(normalizedFilePath);
          }
          matchedInDirectory += 1;
        }
        continue;
      }

      byPath.set(pathKey, normalizedFilePath);
      if (!byName.has(fileName)) byName.set(fileName, []);
      byName.get(fileName).push(normalizedFilePath);
    }

    if (matchedInDirectory > 0) {
      markHotDirectory(normalizedDirectory, matchedInDirectory);
    }

    const pendingDirectories = normalizeArray(result.dirs)
      .map((nested) => resolveBrowseEntryPath(normalizedDirectory, extractBrowsePath(nested)))
      .filter(Boolean);

    while (pendingDirectories.length > 0) {
      if (unresolvedExact && unresolvedExact.size === 0) break;

      let nextIndex = 0;
      let nextScore = -1;
      for (let index = 0; index < pendingDirectories.length; index += 1) {
        const candidate = pendingDirectories[index];
        let candidateScore = 0;
        if (requirements && unresolvedExact && unresolvedExact.size > 0 && hasRelevantNestedPath(candidate)) {
          candidateScore += 1000;
        }
        if (requirements) {
          candidateScore += getHotDirectoryScore(candidate);
        }
        if (candidateScore > nextScore) {
          nextIndex = index;
          nextScore = candidateScore;
        }
      }

      const [nextDirectory] = pendingDirectories.splice(nextIndex, 1);
      await visit(nextDirectory);
    }
  };

  await visit(folderPath);
  return { byPath, byName };
}

function resolvePath(rawPath, folderIndex) {
  const normalizedPath = normalizePath(rawPath);
  const fileName = getFileName(normalizedPath);
  const candidates = getPathLookupCandidates(normalizedPath);

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

function normalizeImportedFiles(importedFiles, folderIndex) {
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

    const resolvedPath = resolvePath(rawPath, folderIndex);
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
      name: asString(track.name, t("Transfer.TrackFallback", "Track")),
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
      name: asString(playlist.name, t("Transfer.PlaylistFallback", "Playlist")),
      loop: Boolean(playlist.loop),
      shuffle: Boolean(playlist.shuffle),
      trackIds,
    });
  }

  return { playlists, skipped };
}

async function applyImportedSettings(payload) {
  const incoming = toImportShape(payload);
  let folderIndex = { byPath: new Map(), byName: new Map() };

  if (incoming.files.length > 0) {
    updateImportProgress(t("Transfer.ProgressCheckPaths", "TS-DJ-MUSIC: import in progress. Checking JSON paths..."), 10);
    folderIndex = mergeFolderIndexes(folderIndex, await buildExactPathIndex(incoming.files));
  }

  const missingImportedFiles = incoming.files.filter((rawFile) => {
    const file = normalizeObject(rawFile);
    const rawPath = asString(file.path);
    if (!rawPath) return false;
    return !resolvePath(rawPath, folderIndex);
  });

  if (missingImportedFiles.length > 0) {
    const requirements = createImportRequirements(missingImportedFiles);
    updateImportProgress(t("Transfer.ProgressSearchFiles", "TS-DJ-MUSIC: import in progress. Searching missing audio files..."), 25);
    folderIndex = mergeFolderIndexes(folderIndex, await buildFolderIndex("", requirements));
  }

  const { resultFiles, oldToNewId, missing } = normalizeImportedFiles(incoming.files, folderIndex);

  const { tracks, oldToNewTrackId } = normalizeImportedTracks(incoming.tracks, oldToNewId);
  const { tracks: ambienceTracks, oldToNewTrackId: oldToNewAmbienceTrackId } = normalizeImportedTracks(incoming.ambienceTracks, oldToNewId);

  const { playlists, skipped: skippedPlaylists } = normalizeImportedPlaylists(incoming.playlists, oldToNewTrackId);
  const { playlists: ambiencePlaylists, skipped: skippedAmbiencePlaylists } = normalizeImportedPlaylists(incoming.ambiencePlaylists, oldToNewAmbienceTrackId);

  updateImportProgress(t("Transfer.ProgressApply", "TS-DJ-MUSIC: import in progress. Applying settings..."), 80);
  await setStorageSnapshot({
    files: resultFiles,
    tracks,
    playlists,
    ambienceTracks,
    ambiencePlaylists,
    ambienceAllowConcurrent: Boolean(incoming.ambienceAllowConcurrent),
  });
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
  if (!canCurrentUserExportSettings(game.user)) {
    ui.notifications.warn(t("Transfer.ExportPermissionDenied", "TS-DJ-MUSIC: no permission to export settings."));
    return false;
  }

  const settings = await getCurrentSettingsSnapshot();
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
    if (target.mode === "download") {
      const savedFile = await downloadJsonToComputer(payload, target.file);
      ui.notifications.info(tf("Transfer.ExportSavedFile", { path: savedFile }, ({ path }) => `TS-DJ-MUSIC: settings exported to ${path}.`));
    } else {
      const savedPath = await uploadJsonToDataFolder(payload, target.folder, target.file);
      ui.notifications.info(tf("Transfer.ExportSavedPath", { path: savedPath }, ({ path }) => `TS-DJ-MUSIC: settings exported to ${path}.`));
    }
  } catch (error) {
    console.warn(`${MODULE_ID} | export failed`, error);
    ui.notifications.error(t("Transfer.ExportFailed", "TS-DJ-MUSIC: export failed."));
    return false;
  }

  return true;
}

export async function importModuleSettings() {
  if (!canCurrentUserExportSettings(game.user)) {
    ui.notifications.warn(t("Transfer.ImportPermissionDenied", "TS-DJ-MUSIC: no permission to import settings."));
    return { applied: false, cancelled: false };
  }

  if (importInProgress) {
    return { applied: false, cancelled: true };
  }
  importInProgress = true;

  try {
    const source = await promptImportSource();
    if (!source) {
      return { applied: false, cancelled: true };
    }

    let payload;
    try {
      if (source.mode === "file") {
        payload = await readJsonFromLocalFile(source.file);
      } else {
        payload = await fetchJsonFromFoundryPath(source.path);
      }
    } catch (error) {
      console.warn(`${MODULE_ID} | import read failed`, error);
      ui.notifications.error(source.mode === "file"
        ? t("Transfer.ImportReadFailedComputer", "TS-DJ-MUSIC: failed to load JSON from your computer.")
        : t("Transfer.ImportReadFailedFoundry", "TS-DJ-MUSIC: failed to load JSON from Foundry Data."));
      return { applied: false, cancelled: false };
    }

    if (!payload || typeof payload !== "object") {
      ui.notifications.error(t("Transfer.ImportInvalidPayload", "TS-DJ-MUSIC: invalid import payload."));
      return { applied: false, cancelled: false };
    }

    if (!updateImportProgress(t("Transfer.ProgressStarted", "TS-DJ-MUSIC: import started..."), 5)) {
      ui.notifications.info(t("Transfer.ImportStartedFallback", "TS-DJ-MUSIC: import started. Searching audio files..."));
    }

    try {
      const result = await applyImportedSettings(payload);
      updateImportProgress(t("Transfer.ProgressComplete", "TS-DJ-MUSIC: import complete."), 100);
      if (!result.applied && !result.cancelled) {
        ui.notifications.warn(t("Transfer.ImportNoChanges", "TS-DJ-MUSIC: import finished with no changes."));
      }

      return result;
    } catch (error) {
      updateImportProgress(t("Transfer.ProgressFailed", "TS-DJ-MUSIC: import failed."), 100);
      console.warn(`${MODULE_ID} | import apply failed`, error);
      ui.notifications.error(t("Transfer.ImportFailedApply", "TS-DJ-MUSIC: import failed while applying settings."));
      return { applied: false, cancelled: false };
    }
  } finally {
    importInProgress = false;
  }
}
