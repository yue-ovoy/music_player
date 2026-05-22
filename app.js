const dbName = "our-little-player";
const defaultRoom = "林干嘛";
const state = {
  songs: [],
  playlists: [],
  profiles: [],
  currentSong: null,
  room: defaultRoom,
  currentProfileId: localStorage.getItem("currentProfileId") || "shuishui",
  artist: localStorage.getItem("artistName") || "",
  supabaseUrl: "",
  supabaseAnonKey: "",
  cloud: false,
};

const els = {
  forceUpdateButton: document.querySelector("#force-update-button"),
  profileButton: document.querySelector("#profile-button"),
  profileAvatar: document.querySelector("#profile-avatar"),
  profileName: document.querySelector("#profile-name"),
  profilePanel: document.querySelector("#profile-panel"),
  closeProfileButton: document.querySelector("#close-profile-button"),
  profileOptions: document.querySelectorAll(".profile-option"),
  profileDisplayName: document.querySelector("#profile-display-name"),
  profileAvatarFile: document.querySelector("#profile-avatar-file"),
  avatarCropper: document.querySelector("#avatar-cropper"),
  avatarCropFrame: document.querySelector("#avatar-crop-frame"),
  avatarCropImage: document.querySelector("#avatar-crop-image"),
  avatarZoom: document.querySelector("#avatar-zoom"),
  saveProfileButton: document.querySelector("#save-profile-button"),
  workspace: document.querySelector(".workspace"),
  uploadPage: document.querySelector("#upload-page"),
  openUploadButton: document.querySelector("#open-upload-button"),
  backToLibraryButton: document.querySelector("#back-to-library-button"),
  artistName: document.querySelector("#artist-name"),
  uploadForm: document.querySelector("#upload-form"),
  musicFile: document.querySelector("#music-file"),
  selectedFiles: document.querySelector("#selected-files"),
  uploadButton: document.querySelector("#upload-form button"),
  clearRoomButton: document.querySelector("#clear-room-button"),
  modeNote: document.querySelector("#mode-note"),
  audio: document.querySelector("#audio-player"),
  currentTitle: document.querySelector("#current-title"),
  currentMeta: document.querySelector("#current-meta"),
  nowPlaying: document.querySelector(".now-playing"),
  tabs: document.querySelectorAll(".tab"),
  views: document.querySelectorAll(".view"),
  songList: document.querySelector("#song-list"),
  songCount: document.querySelector("#song-count"),
  playlistForm: document.querySelector("#playlist-form"),
  playlistName: document.querySelector("#playlist-name"),
  playlistGrid: document.querySelector("#playlist-grid"),
};

const cropState = {
  image: null,
  objectUrl: "",
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  dragging: false,
  startX: 0,
  startY: 0,
  startOffsetX: 0,
  startOffsetY: 0,
};

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fmtDate(value) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(value));
}

function fmtBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function fileExtension(name) {
  const match = name.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : "audio";
}

function storageSafeSegment(value) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug) return slug.slice(0, 48);

  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  }
  return `room-${hash.toString(16)}`;
}

function getConfig() {
  return window.LITTLE_PLAYER_CONFIG || {};
}

function setArtist(value) {
  state.artist = value.trim();
  localStorage.setItem("artistName", state.artist);
}

function fallbackProfiles() {
  return [
    { id: "shuishui", displayName: "水水", avatarUrl: "" },
    { id: "zhi", displayName: "知", avatarUrl: "" },
  ];
}

function currentProfile() {
  return state.profiles.find((profile) => profile.id === state.currentProfileId) || state.profiles[0] || fallbackProfiles()[0];
}

function profileInitial(name) {
  return (name || "?").slice(0, 1);
}

function avatarDataUrl(name) {
  const initial = profileInitial(name);
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <rect width="120" height="120" rx="60" fill="#c95169"/>
      <text x="60" y="74" text-anchor="middle" font-size="52" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-weight="700" fill="#fffaf2">${initial}</text>
    </svg>
  `)}`;
}

function renderProfile() {
  const profile = currentProfile();
  els.profileName.textContent = profile.displayName;
  els.profileAvatar.src = profile.avatarUrl || avatarDataUrl(profile.displayName);
  els.profileDisplayName.value = profile.displayName;
  els.profileOptions.forEach((button) => {
    button.classList.toggle("active", button.dataset.profileId === state.currentProfileId);
  });
}

async function loadProfiles() {
  if (!state.cloud) {
    state.profiles = fallbackProfiles();
    renderProfile();
    return;
  }

  let rows = [];
  try {
    rows = await supabaseRest("profiles?select=*&order=id.asc");
  } catch (error) {
    console.warn("Profiles are not ready yet", error);
    state.profiles = fallbackProfiles();
    renderProfile();
    return;
  }
  state.profiles = rows.map((profile) => ({
    id: profile.id,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url || "",
  }));
  if (!state.profiles.some((profile) => profile.id === state.currentProfileId)) {
    state.currentProfileId = state.profiles[0]?.id || "shuishui";
    localStorage.setItem("currentProfileId", state.currentProfileId);
  }
  renderProfile();
}

function selectProfile(id) {
  state.currentProfileId = id;
  localStorage.setItem("currentProfileId", id);
  resetAvatarCrop();
  renderProfile();
}

function cropFrameSize() {
  return els.avatarCropFrame.getBoundingClientRect().width || 220;
}

function avatarMetrics() {
  if (!cropState.image) return null;
  const frame = cropFrameSize();
  const coverScale = Math.max(frame / cropState.image.naturalWidth, frame / cropState.image.naturalHeight);
  const width = cropState.image.naturalWidth * coverScale * cropState.scale;
  const height = cropState.image.naturalHeight * coverScale * cropState.scale;
  const minX = Math.min(0, frame - width);
  const minY = Math.min(0, frame - height);
  const left = Math.min(0, Math.max(minX, (frame - width) / 2 + cropState.offsetX));
  const top = Math.min(0, Math.max(minY, (frame - height) / 2 + cropState.offsetY));
  return { frame, width, height, left, top };
}

function renderAvatarCrop() {
  const metrics = avatarMetrics();
  if (!metrics) return;
  cropState.offsetX = metrics.left - (metrics.frame - metrics.width) / 2;
  cropState.offsetY = metrics.top - (metrics.frame - metrics.height) / 2;
  Object.assign(els.avatarCropImage.style, {
    width: `${metrics.width}px`,
    height: `${metrics.height}px`,
    transform: `translate(${metrics.left}px, ${metrics.top}px)`,
  });
}

function resetAvatarCrop() {
  if (cropState.objectUrl) URL.revokeObjectURL(cropState.objectUrl);
  cropState.image = null;
  cropState.objectUrl = "";
  cropState.scale = 1;
  cropState.offsetX = 0;
  cropState.offsetY = 0;
  cropState.dragging = false;
  els.avatarCropper.hidden = true;
  els.avatarCropImage.removeAttribute("src");
  els.avatarZoom.value = "1";
  els.profileAvatarFile.value = "";
}

function prepareAvatarCrop(file) {
  resetAvatarCrop();
  if (!file) return;

  const image = new Image();
  const objectUrl = URL.createObjectURL(file);
  image.onload = () => {
    cropState.image = image;
    cropState.objectUrl = objectUrl;
    els.avatarCropImage.src = objectUrl;
    els.avatarCropper.hidden = false;
    renderAvatarCrop();
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    alert("这张图片没有读取成功，可以换一张试试。");
  };
  image.src = objectUrl;
}

function createCroppedAvatarBlob() {
  if (!cropState.image) return Promise.resolve(null);
  const metrics = avatarMetrics();
  const outputSize = 512;
  const multiplier = outputSize / metrics.frame;
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff8ef";
  ctx.fillRect(0, 0, outputSize, outputSize);
  ctx.drawImage(
    cropState.image,
    metrics.left * multiplier,
    metrics.top * multiplier,
    metrics.width * multiplier,
    metrics.height * multiplier,
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

async function uploadAvatar(file, profileId) {
  const path = `${profileId}-${Date.now()}.jpg`;
  await uploadToSupabaseStorage("avatars", path, file, () => {}, true);
  return `${state.supabaseUrl}/storage/v1/object/public/avatars/${encodeStoragePath(path)}`;
}

async function saveProfile() {
  const displayName = els.profileDisplayName.value.trim() || profileInitial(currentProfile().displayName);
  let avatarUrl = currentProfile().avatarUrl || "";

  els.saveProfileButton.disabled = true;
  els.saveProfileButton.textContent = "保存中...";

  try {
    const file = await createCroppedAvatarBlob();
    if (file && state.cloud) {
      avatarUrl = await uploadAvatar(file, state.currentProfileId);
    } else if (file) {
      avatarUrl = await blobToDataUrl(file);
    }

    if (state.cloud) {
      await supabaseRest("profiles?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ id: state.currentProfileId, display_name: displayName, avatar_url: avatarUrl }),
      });
      await loadProfiles();
    } else {
      state.profiles = state.profiles.map((profile) =>
        profile.id === state.currentProfileId ? { ...profile, displayName, avatarUrl } : profile,
      );
      renderProfile();
    }
    resetAvatarCrop();
  } finally {
    els.saveProfileButton.disabled = false;
    els.saveProfileButton.textContent = "保存资料";
  }
}

function showUploadPage() {
  els.workspace.hidden = true;
  els.uploadPage.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showLibraryPage() {
  els.uploadPage.hidden = true;
  els.workspace.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function forceAppUpdate() {
  els.forceUpdateButton.disabled = true;
  els.forceUpdateButton.textContent = "…";

  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.update()));
  }

  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  }

  const url = new URL(window.location.href);
  url.searchParams.set("updated", Date.now().toString());
  window.location.replace(url.toString());
}

function openLocalDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("songs", { keyPath: "id" });
      db.createObjectStore("playlists", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function localAll(storeName) {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result.filter((item) => item.room === state.room));
    req.onerror = () => reject(req.error);
  });
}

async function localPut(storeName, value) {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function localDelete(storeName, id) {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function localClearRoom() {
  const [songs, playlists] = await Promise.all([localAll("songs"), localAll("playlists")]);
  await Promise.all([
    ...songs.map((song) => localDelete("songs", song.id)),
    ...playlists.map((playlist) => localDelete("playlists", playlist.id)),
  ]);
}

async function initSupabase() {
  const config = getConfig();
  if (!config.supabaseUrl || !config.supabaseAnonKey) return;

  state.supabaseUrl = config.supabaseUrl.replace(/\/$/, "");
  state.supabaseAnonKey = config.supabaseAnonKey;
  state.cloud = true;
  els.modeNote.textContent = "已连接 Supabase。你们打开同一个链接时，上传的歌和歌单会同步共享。";
}

async function supabaseRest(path, options = {}) {
  const response = await fetch(`${state.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: state.supabaseAnonKey,
      Authorization: `Bearer ${state.supabaseAnonKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let message = `Supabase 请求失败：HTTP ${response.status}`;
    try {
      message = (await response.json()).message || message;
    } catch {
      message = (await response.text()) || message;
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function loadData() {
  if (state.cloud) {
    const [songsResult, playlistsResult] = await Promise.all([
      supabaseRest(`songs?select=*&room_code=eq.${encodeURIComponent(state.room)}&order=created_at.desc`),
      supabaseRest(`playlists?select=*&room_code=eq.${encodeURIComponent(state.room)}&order=created_at.desc`),
    ]);

    state.songs = songsResult.map((song) => ({
      id: song.id,
      room: song.room_code,
      title: song.title,
      artist: song.artist || "",
      uploader: song.uploader_name,
      createdAt: song.created_at,
      url: song.public_url,
      storagePath: song.storage_path,
    }));
    state.playlists = playlistsResult.map((playlist) => ({
      id: playlist.id,
      room: playlist.room_code,
      name: playlist.name,
      songIds: playlist.song_ids || [],
      createdAt: playlist.created_at,
    }));
  } else {
    state.songs = (await localAll("songs"))
      .map((song) => ({ ...song, artist: song.artist || "" }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    state.playlists = (await localAll("playlists")).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  render();
}

function encodeStoragePath(path) {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function uploadToSupabaseStorage(bucket, path, file, onProgress, upsert = false) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${state.supabaseUrl}/storage/v1/object/${bucket}/${encodeStoragePath(path)}`;

    xhr.open("POST", url);
    xhr.setRequestHeader("apikey", state.supabaseAnonKey);
    xhr.setRequestHeader("Authorization", `Bearer ${state.supabaseAnonKey}`);
    xhr.setRequestHeader("x-upsert", upsert ? "true" : "false");
    xhr.setRequestHeader("Content-Type", file.type || "audio/wav");

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        let message = `上传失败：HTTP ${xhr.status}`;
        try {
          message = JSON.parse(xhr.responseText).message || message;
        } catch {
          message = xhr.responseText || message;
        }
        reject(new Error(message));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("网络连接失败，上传没有完成。")));
    xhr.addEventListener("abort", () => reject(new Error("上传已取消。")));
    xhr.send(file);
  });
}

async function deleteSupabaseStorage(path) {
  const response = await fetch(`${state.supabaseUrl}/storage/v1/object/songs/${encodeStoragePath(path)}`, {
    method: "DELETE",
    headers: {
      apikey: state.supabaseAnonKey,
      Authorization: `Bearer ${state.supabaseAnonKey}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    let message = `删除文件失败：HTTP ${response.status}`;
    try {
      message = (await response.json()).message || message;
    } catch {
      message = (await response.text()) || message;
    }
    throw new Error(message);
  }
}

async function uploadSong(file, onProgress = () => {}) {
  const song = {
    id: uid(),
    room: state.room,
    title: file.name.replace(/\.[^.]+$/, ""),
    artist: state.artist || "未知歌手",
    uploader: currentProfile().displayName || "匿名",
    createdAt: new Date().toISOString(),
  };

  if (state.cloud) {
    const path = `${storageSafeSegment(state.room)}/${song.id}.${fileExtension(file.name)}`;
    await uploadToSupabaseStorage("songs", path, file, onProgress);
    const publicUrl = `${state.supabaseUrl}/storage/v1/object/public/songs/${encodeStoragePath(path)}`;
    await supabaseRest("songs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id: song.id,
        room_code: song.room,
        title: song.title,
        artist: song.artist,
        uploader_name: song.uploader,
        storage_path: path,
        public_url: publicUrl,
      }),
    });
  } else {
    song.blob = file;
    song.url = URL.createObjectURL(file);
    onProgress(100);
    await localPut("songs", song);
  }
}

async function createPlaylist(name) {
  const playlist = {
    id: uid(),
    room: state.room,
    name,
    songIds: [],
    createdAt: new Date().toISOString(),
  };

  if (state.cloud) {
    await supabaseRest("playlists", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id: playlist.id,
        room_code: playlist.room,
        name: playlist.name,
        song_ids: [],
      }),
    });
  } else {
    await localPut("playlists", playlist);
  }
}

async function addToPlaylist(songId, playlistId) {
  const playlist = state.playlists.find((item) => item.id === playlistId);
  if (!playlist || playlist.songIds.includes(songId)) return;
  playlist.songIds = [...playlist.songIds, songId];

  if (state.cloud) {
    await supabaseRest(`playlists?id=eq.${playlist.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ song_ids: playlist.songIds }),
    });
  } else {
    await localPut("playlists", playlist);
  }

  render();
}

async function removeSongFromPlaylists(songId) {
  const changed = state.playlists
    .map((playlist) => ({ ...playlist, songIds: playlist.songIds.filter((id) => id !== songId) }))
    .filter((playlist, index) => playlist.songIds.length !== state.playlists[index].songIds.length);

  if (state.cloud) {
    await Promise.all(
      changed.map((playlist) =>
        supabaseRest(`playlists?id=eq.${playlist.id}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ song_ids: playlist.songIds }),
        }),
      ),
    );
  } else {
    await Promise.all(changed.map((playlist) => localPut("playlists", playlist)));
  }
}

async function deleteSong(song) {
  if (!confirm(`确定删除《${song.title}》吗？这会从曲库和所有歌单里移除。`)) return;

  await removeSongFromPlaylists(song.id);

  if (state.cloud) {
    if (song.storagePath) await deleteSupabaseStorage(song.storagePath);
    await supabaseRest(`songs?id=eq.${song.id}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  } else {
    await localDelete("songs", song.id);
  }

  if (state.currentSong?.id === song.id) {
    resetPlayer();
  }

  await loadData();
}

async function clearRoom() {
  if (!confirm("确定清空所有内容吗？歌曲和歌单都会删除。")) return;
  if (!confirm("这个操作不能撤销。真的要继续吗？")) return;

  if (state.cloud) {
    await Promise.all(state.songs.map((song) => (song.storagePath ? deleteSupabaseStorage(song.storagePath) : null)));
    await supabaseRest(`playlists?room_code=eq.${encodeURIComponent(state.room)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    await supabaseRest(`songs?room_code=eq.${encodeURIComponent(state.room)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  } else {
    await localClearRoom();
  }

  resetPlayer();
  await loadData();
}

function resetPlayer() {
  els.audio.pause();
  els.audio.removeAttribute("src");
  els.audio.load();
  state.currentSong = null;
  els.currentTitle.textContent = "还没有播放歌曲";
  els.currentMeta.textContent = "上传一首歌，或者从曲库点播放。";
}

function playSong(song) {
  state.currentSong = song;
  els.audio.src = song.url || URL.createObjectURL(song.blob);
  els.audio.play();
  els.currentTitle.textContent = song.title;
  els.currentMeta.textContent = `${song.artist || "未知歌手"} · ${song.uploader} 上传 · ${fmtDate(song.createdAt)}`;
}

function renderSong(song) {
  const row = document.createElement("article");
  row.className = "song-row";
  row.innerHTML = `
    <div>
      <div class="song-title"></div>
      <div class="song-meta"></div>
    </div>
    <div class="row-actions">
      <button class="ghost-button" type="button" data-action="play">播放</button>
      <select class="ghost-button" data-action="playlist">
        <option value="">加入歌单</option>
      </select>
      <button class="ghost-button danger" type="button" data-action="delete">删除</button>
    </div>
  `;
  row.querySelector(".song-title").textContent = song.title;
  row.querySelector(".song-meta").textContent = `${song.artist || "未知歌手"} · ${song.uploader} · ${fmtDate(song.createdAt)}`;

  const select = row.querySelector("select");
  state.playlists.forEach((playlist) => {
    const option = document.createElement("option");
    option.value = playlist.id;
    option.textContent = playlist.name;
    select.append(option);
  });

  row.querySelector('[data-action="play"]').addEventListener("click", () => playSong(song));
  row.querySelector('[data-action="delete"]').addEventListener("click", () => deleteSong(song));
  select.addEventListener("change", async (event) => {
    if (!event.target.value) return;
    await addToPlaylist(song.id, event.target.value);
    event.target.value = "";
  });

  return row;
}

function renderPlaylist(playlist) {
  const card = document.createElement("details");
  card.className = "playlist-card";
  const songs = playlist.songIds.map((id) => state.songs.find((song) => song.id === id)).filter(Boolean);
  card.innerHTML = `
    <summary>
      <span></span>
      <span class="playlist-count"></span>
    </summary>
    <ul></ul>
  `;
  card.querySelector("summary span:first-child").textContent = playlist.name;
  card.querySelector(".playlist-count").textContent = `${songs.length} 首`;
  const list = card.querySelector("ul");

  if (!songs.length) {
    const empty = document.createElement("li");
    empty.className = "song-meta";
    empty.textContent = "还没有歌曲，去曲库里加入。";
    list.append(empty);
    return card;
  }

  songs.forEach((song) => {
    const item = document.createElement("li");
    item.className = "song-row";
    item.innerHTML = `
      <div>
        <div class="song-title"></div>
        <div class="song-meta"></div>
      </div>
      <button class="ghost-button" type="button">播放</button>
    `;
    item.querySelector(".song-title").textContent = song.title;
    item.querySelector(".song-meta").textContent = `${song.artist || "未知歌手"} · ${song.uploader}`;
    item.querySelector("button").addEventListener("click", () => playSong(song));
    list.append(item);
  });

  return card;
}

function render() {
  els.songCount.textContent = `${state.songs.length} 首`;
  els.songList.innerHTML = "";
  els.playlistGrid.innerHTML = "";

  if (!state.songs.length) {
    els.songList.innerHTML = '<div class="empty">还没有上传歌曲。</div>';
  } else {
    state.songs.forEach((song) => els.songList.append(renderSong(song)));
  }

  if (!state.playlists.length) {
    els.playlistGrid.innerHTML = '<div class="empty">还没有歌单。</div>';
  } else {
    state.playlists.forEach((playlist) => els.playlistGrid.append(renderPlaylist(playlist)));
  }
}

function renderSelectedFiles(files, statuses = {}) {
  els.selectedFiles.innerHTML = "";
  files.forEach((file, index) => {
    const status = statuses[index] || { progress: 0, label: "待上传", state: "idle" };
    const chip = document.createElement("div");
    chip.className = `file-chip ${status.state === "done" ? "is-done" : ""} ${status.state === "error" ? "is-error" : ""}`;
    chip.innerHTML = `
      <div class="file-chip-top">
        <div class="file-name"></div>
        <div class="file-size"></div>
      </div>
      <div class="progress-track" aria-hidden="true"><div class="progress-bar"></div></div>
      <div class="file-status"></div>
    `;
    chip.querySelector(".file-name").textContent = file.name;
    chip.querySelector(".file-size").textContent = fmtBytes(file.size);
    chip.querySelector(".progress-bar").style.width = `${status.progress || 0}%`;
    chip.querySelector(".file-status").textContent = status.label;
    els.selectedFiles.append(chip);
  });
}

function bindEvents() {
  els.artistName.value = state.artist;

  els.forceUpdateButton.addEventListener("click", forceAppUpdate);
  els.profileButton.addEventListener("click", () => {
    els.profilePanel.hidden = !els.profilePanel.hidden;
  });
  els.closeProfileButton.addEventListener("click", () => {
    els.profilePanel.hidden = true;
  });
  els.profileOptions.forEach((button) => {
    button.addEventListener("click", () => selectProfile(button.dataset.profileId));
  });
  els.profileAvatarFile.addEventListener("change", () => prepareAvatarCrop(els.profileAvatarFile.files[0]));
  els.avatarZoom.addEventListener("input", (event) => {
    cropState.scale = Number(event.target.value);
    renderAvatarCrop();
  });
  els.avatarCropFrame.addEventListener("pointerdown", (event) => {
    if (!cropState.image) return;
    cropState.dragging = true;
    cropState.startX = event.clientX;
    cropState.startY = event.clientY;
    cropState.startOffsetX = cropState.offsetX;
    cropState.startOffsetY = cropState.offsetY;
    els.avatarCropFrame.setPointerCapture(event.pointerId);
  });
  els.avatarCropFrame.addEventListener("pointermove", (event) => {
    if (!cropState.dragging) return;
    cropState.offsetX = cropState.startOffsetX + event.clientX - cropState.startX;
    cropState.offsetY = cropState.startOffsetY + event.clientY - cropState.startY;
    renderAvatarCrop();
  });
  els.avatarCropFrame.addEventListener("pointerup", () => {
    cropState.dragging = false;
  });
  els.avatarCropFrame.addEventListener("pointercancel", () => {
    cropState.dragging = false;
  });
  els.saveProfileButton.addEventListener("click", saveProfile);
  els.openUploadButton.addEventListener("click", showUploadPage);
  els.backToLibraryButton.addEventListener("click", showLibraryPage);
  els.artistName.addEventListener("change", (event) => setArtist(event.target.value));
  els.clearRoomButton.addEventListener("click", clearRoom);
  els.musicFile.addEventListener("change", () => renderSelectedFiles([...els.musicFile.files]));

  els.uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const files = [...els.musicFile.files];
    if (!files.length) return;
    const statuses = files.map(() => ({ progress: 0, label: "等待上传", state: "idle" }));
    els.uploadButton.disabled = true;
    els.uploadButton.textContent = "上传中...";
    renderSelectedFiles(files, statuses);

    try {
      for (const [index, file] of files.entries()) {
        statuses[index] = { progress: 0, label: `正在上传 ${index + 1}/${files.length}`, state: "uploading" };
        renderSelectedFiles(files, statuses);
        await uploadSong(file, (progress) => {
          statuses[index] = { progress, label: `正在上传 ${index + 1}/${files.length} · ${progress}%`, state: "uploading" };
          renderSelectedFiles(files, statuses);
        });
        statuses[index] = { progress: 100, label: "上传完成", state: "done" };
        renderSelectedFiles(files, statuses);
      }
      els.musicFile.value = "";
      await loadData();
      showLibraryPage();
    } catch (error) {
      const current = statuses.findIndex((item) => item.state === "uploading");
      if (current >= 0) {
        statuses[current] = { ...statuses[current], label: error.message, state: "error" };
        renderSelectedFiles(files, statuses);
      }
      els.modeNote.textContent = `上传失败：${error.message}`;
      console.error(error);
    } finally {
      els.uploadButton.disabled = false;
      els.uploadButton.textContent = "上传到曲库";
    }
  });

  els.playlistForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = els.playlistName.value.trim();
    if (!name) return;
    await createPlaylist(name);
    els.playlistName.value = "";
    await loadData();
  });

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const view = tab.dataset.view;
      els.tabs.forEach((item) => item.classList.toggle("active", item === tab));
      els.views.forEach((item) => item.classList.toggle("active", item.id === `${view}-view`));
    });
  });

  els.audio.addEventListener("play", () => els.nowPlaying.classList.add("is-playing"));
  els.audio.addEventListener("pause", () => els.nowPlaying.classList.remove("is-playing"));
}

async function boot() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  }

  bindEvents();
  await initSupabase();
  await loadProfiles();
  await loadData();
}

boot().catch((error) => {
  console.error(error);
  els.modeNote.textContent = `出错了：${error.message}`;
});
