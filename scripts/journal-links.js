// Journal links store stable TS-DJ IDs rather than file paths or executable code.
export function registerJournalLinks({ getTracks, getAmbienceTracks, playTrack, playPlaylist, playAmbience, canControl }) {
  const tokenFor = (data, label) => {
    if (!["music", "ambience"].includes(data.kind) || !/^[\w-]+$/.test(data.trackId ?? "")) return null;
    const playlistId = /^[\w-]+$/.test(data.playlistId ?? "") ? data.playlistId : "";
    const name = String(label ?? data.name ?? "TS-DJ").replace(/[{}\r\n]/g, " ");
    return `@TSDJ[${data.kind}:${data.trackId}${playlistId ? `:${playlistId}` : ""}]{${name}}`;
  };
  // Keep the configured class identity: Foundry redirects enrichHTML calls to
  // that class, while libWrapper may bind existing wrappers to the original.
  // Replacing it with a subclass sends those calls into an infinite loop.
  const editor = CONFIG.ux.TextEditor;
  const originalGetContentLink = editor.getContentLink;
  editor.getContentLink = async function(data, options = {}) {
    if (data?.type === "TSDJTrack") return tokenFor(data, options.label);
    return originalGetContentLink.call(this, data, options);
  };
  CONFIG.TextEditor.enrichers.push({
    pattern: /@TSDJ\[(music|ambience):([\w-]+)(?::([\w-]+))?\](?:\{([^}]*)\})?/g,
    enricher: async (match) => {
      const link = document.createElement("span");
      link.className = "ts-dj-journal-link";
      link.setAttribute("role", "button");
      link.tabIndex = 0;
      link.dataset.kind = match[1];
      link.dataset.trackId = match[2];
      if (match[3]) link.dataset.playlistId = match[3];
      const icon = document.createElement("i");
      icon.className = "fas fa-play";
      link.append(icon, document.createTextNode(` ${match[4] || "TS-DJ"}`));
      return link;
    },
  });
  const activateJournalTrack = (event) => {
    const link = event.target.closest?.(".ts-dj-journal-link");
    if (!link) return;
    if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!canControl()) return;
    const { kind, trackId, playlistId } = link.dataset;
    Promise.resolve().then(() => kind === "ambience" ? playAmbience(trackId)
      : playlistId ? playPlaylist(playlistId, { startTrackId: trackId }) : playTrack(trackId)).catch((error) => {
      console.error("ts-dj-music | Journal playback failed", error);
      ui.notifications.error(game.i18n.localize("TS_DJ_MUSIC.Notifications.JournalPlaybackFailed"));
    });
  };
  // Capture before Foundry's body-level external-link handler. This also
  // prevents navigation for anchors rendered before the update.
  document.addEventListener("click", activateJournalTrack, true);
  document.addEventListener("keydown", activateJournalTrack, true);
  document.addEventListener("dragstart", (event) => {
    const row = event.target.closest?.("[data-manager-playlist-track-row], [data-manager-track-row], [data-ts-dj-journal-track]");
    if (!row || !event.dataTransfer) return;
    const kind = row.dataset.playlistKind ?? row.dataset.trackKind ?? "music";
    const trackId = row.dataset.trackId;
    const tracks = kind === "ambience" ? getAmbienceTracks() : getTracks();
    const track = tracks.find((entry) => entry.id === trackId);
    if (!track) return;
    const data = { type: "TSDJTrack", kind, trackId, name: track.name,
      playlistId: kind === "music" ? row.dataset.playlistId : undefined };
    if (!tokenFor(data)) return;
    event.dataTransfer.setData("text/plain", JSON.stringify(data));
    event.dataTransfer.effectAllowed = "copyMove";
  });
}
