const dbName = "our-little-player";
const defaultRoom = "林干嘛";
const savedProfileId = localStorage.getItem("currentProfileId");
const state = {
  songs: [],
  playlists: [],
  profiles: [],
  messages: [],
  currentSong: null,
  playQueue: null,
  playMode: localStorage.getItem("playMode") || "order",
  room: defaultRoom,
  currentProfileId: savedProfileId || "shuishui",
  artist: localStorage.getItem("artistName") || "",
  supabaseUrl: "",
  supabaseAnonKey: "",
  cloud: false,
  chatOpen: false,
  chatReady: true,
  activeView: "main",
};

let deferredInstallPrompt = null;
let messagePollTimer = null;

const els = {
  forceUpdateButton: document.querySelector("#force-update-button"),
  messageButton: document.querySelector("#message-button"),
  messageBadge: document.querySelector("#message-badge"),
  installAppButton: document.querySelector("#install-app-button"),
  installTip: document.querySelector("#install-tip"),
  installTipText: document.querySelector("#install-tip-text"),
  closeInstallTip: document.querySelector("#close-install-tip"),
  profileButton: document.querySelector("#profile-button"),
  profileAvatar: document.querySelector("#profile-avatar"),
  profileName: document.querySelector("#profile-name"),
  profilePanel: document.querySelector("#profile-panel"),
  profileHint: document.querySelector("#profile-hint"),
  closeProfileButton: document.querySelector("#close-profile-button"),
  profileOptions: document.querySelectorAll(".profile-option"),
  profileDisplayName: document.querySelector("#profile-display-name"),
  profileAvatarFile: document.querySelector("#profile-avatar-file"),
  avatarCropper: document.querySelector("#avatar-cropper"),
  avatarCropFrame: document.querySelector("#avatar-crop-frame"),
  avatarCropImage: document.querySelector("#avatar-crop-image"),
  avatarCropStatus: document.querySelector("#avatar-crop-status"),
  avatarZoom: document.querySelector("#avatar-zoom"),
  saveProfileButton: document.querySelector("#save-profile-button"),
  chatPanel: document.querySelector("#chat-panel"),
  chatTitle: document.querySelector("#chat-title"),
  closeChatButton: document.querySelector("#close-chat-button"),
  chatList: document.querySelector("#chat-list"),
  chatForm: document.querySelector("#chat-form"),
  chatInput: document.querySelector("#chat-input"),
  sendMessageButton: document.querySelector("#send-message-button"),
  chatStatus: document.querySelector("#chat-status"),
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
  previousButton: document.querySelector("#previous-button"),
  playToggleButton: document.querySelector("#play-toggle-button"),
  nextButton: document.querySelector("#next-button"),
  progressSlider: document.querySelector("#progress-slider"),
  currentTime: document.querySelector("#current-time"),
  durationTime: document.querySelector("#duration-time"),
  currentTitle: document.querySelector("#current-title"),
  currentMeta: document.querySelector("#current-meta"),
  nowPlaying: document.querySelector(".now-playing"),
  tabs: document.querySelectorAll(".tab"),
  views: document.querySelectorAll(".view"),
  songList: document.querySelector("#song-list"),
  songCount: document.querySelector("#song-count"),
  libraryPlaybackActions: document.querySelector("#library-playback-actions"),
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
  reader: null,
};

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fmtBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function fmtTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${rest}`;
}

function fmtChatTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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
  els.profileHint.hidden = Boolean(localStorage.getItem("currentProfileId"));
  els.profileOptions.forEach((button) => {
    button.classList.toggle("active", button.dataset.profileId === state.currentProfileId);
  });
}

function askForProfileIfNeeded() {
  if (savedProfileId) return;
  els.profilePanel.hidden = false;
  els.profileHint.hidden = false;
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
  els.profileHint.hidden = true;
  resetAvatarCrop();
  renderProfile();
  loadMessages();
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

function resetAvatarCrop(clearInput = true) {
  if (cropState.objectUrl) URL.revokeObjectURL(cropState.objectUrl);
  if (cropState.reader?.readyState === 1) cropState.reader.abort();
  cropState.image = null;
  cropState.objectUrl = "";
  cropState.reader = null;
  cropState.scale = 1;
  cropState.offsetX = 0;
  cropState.offsetY = 0;
  cropState.dragging = false;
  els.avatarCropper.hidden = true;
  els.avatarCropImage.removeAttribute("src");
  els.avatarCropStatus.textContent = "图片读取中...";
  els.avatarZoom.value = "1";
  if (clearInput) els.profileAvatarFile.value = "";
}

function prepareAvatarCrop(file) {
  resetAvatarCrop(false);
  if (!file) return;

  els.avatarCropper.hidden = false;
  els.avatarCropStatus.textContent = "图片读取中...";

  const image = new Image();
  image.onload = () => {
    cropState.image = image;
    cropState.reader = null;
    els.avatarCropStatus.textContent = "拖动图片调整位置";
    renderAvatarCrop();
  };
  image.onerror = () => {
    cropState.reader = null;
    els.avatarCropStatus.textContent = "这张图片没有读取成功，可以换一张试试";
  };

  const reader = new FileReader();
  cropState.reader = reader;
  reader.onload = () => {
    els.avatarCropImage.src = reader.result;
    image.src = reader.result;
  };
  reader.onerror = () => {
    cropState.reader = null;
    els.avatarCropStatus.textContent = "这张图片没有读取成功，可以换一张试试";
  };
  reader.readAsDataURL(file);
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
  showAppView("upload");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showLibraryPage() {
  showAppView("main");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showAppView(view) {
  state.activeView = view;
  state.chatOpen = view === "chat";
  els.workspace.hidden = view !== "main";
  els.uploadPage.hidden = view !== "upload";
  els.chatPanel.hidden = view !== "chat";
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

function isStandaloneApp() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function installGuideText() {
  const ua = navigator.userAgent;
  if (/MicroMessenger/i.test(ua)) {
    return "请先点右上角菜单，在浏览器打开；再点浏览器菜单，选择“添加到主屏幕”或“安装应用”。";
  }
  if (/Android/i.test(ua)) {
    return "请点浏览器右上角菜单，选择“添加到主屏幕”或“安装应用”。Chrome、Edge、三星浏览器一般都支持。";
  }
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return "请用 Safari 打开，点分享按钮，再选择“添加到主屏幕”。";
  }
  return "请点浏览器菜单，选择“添加到主屏幕”或“安装应用”。";
}

function updateInstallButton() {
  els.installAppButton.hidden = isStandaloneApp();
}

function showInstallTip(message = installGuideText()) {
  els.installTipText.textContent = message;
  els.installTip.hidden = false;
}

async function installApp() {
  els.installTip.hidden = true;

  if (!deferredInstallPrompt) {
    showInstallTip();
    return;
  }

  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  updateInstallButton();

  if (choice.outcome !== "accepted") {
    showInstallTip("如果安装弹窗没有完成，也可以点浏览器菜单，选择“添加到主屏幕”或“安装应用”。");
  }
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

function unreadMessages() {
  return state.messages.filter(
    (message) => message.senderId !== state.currentProfileId && !message.readBy.includes(state.currentProfileId),
  );
}

function renderMessageBadge() {
  const count = unreadMessages().length;
  els.messageBadge.hidden = count === 0;
  els.messageBadge.textContent = count > 9 ? "9+" : String(count);
}

async function loadMessages({ markRead = false } = {}) {
  if (!state.cloud) {
    state.messages = [];
    state.chatReady = false;
    renderChat();
    renderMessageBadge();
    return;
  }

  try {
    const rows = await supabaseRest(
      `messages?select=*&room_code=eq.${encodeURIComponent(state.room)}&order=created_at.desc&limit=200`,
    );
    state.messages = rows.reverse().map((message) => ({
      id: message.id,
      room: message.room_code,
      senderId: message.sender_id,
      senderName: message.sender_name,
      body: message.body,
      readBy: message.read_by || [],
      createdAt: message.created_at,
    }));
    state.chatReady = true;
    if (markRead) await markMessagesRead();
  } catch (error) {
    console.warn("Messages are not ready yet", error);
    state.chatReady = false;
    state.messages = [];
  }

  renderChat();
  renderMessageBadge();
}

async function markMessagesRead() {
  const unread = unreadMessages();
  if (!state.cloud || !unread.length) return;

  await Promise.all(
    unread.map((message) => {
      const readBy = [...new Set([...message.readBy, state.currentProfileId])];
      message.readBy = readBy;
      return supabaseRest(`messages?id=eq.${message.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ read_by: readBy }),
      });
    }),
  );
}

async function sendMessage(body) {
  const text = body.trim();
  if (!text || !state.cloud) return;
  const profile = currentProfile();

  await supabaseRest("messages", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      id: uid(),
      room_code: state.room,
      sender_id: profile.id,
      sender_name: profile.displayName,
      body: text,
      read_by: [profile.id],
    }),
  });

  await loadMessages({ markRead: state.chatOpen });
}

function otherProfileName() {
  return state.profiles.find((profile) => profile.id !== state.currentProfileId)?.displayName || "她";
}

function renderChatTitle() {
  els.chatTitle.textContent = otherProfileName();
}

function renderChat() {
  if (!els.chatList) return;
  renderChatTitle();

  if (!state.chatReady) {
    els.chatList.innerHTML = '<div class="chat-empty">聊天还没配置好。先在 Supabase 里重新运行 SQL。</div>';
    els.chatStatus.textContent = state.cloud ? "等待 messages 表。" : "聊天需要云端模式。";
    return;
  }

  els.chatStatus.textContent = state.messages.length ? "" : `给${otherProfileName()}发第一条消息。`;
  els.chatList.innerHTML = "";

  if (!state.messages.length) {
    els.chatList.innerHTML = '<div class="chat-empty">还没有消息。</div>';
    return;
  }

  state.messages.forEach((message) => {
    const isMine = message.senderId === state.currentProfileId;
    const profile =
      state.profiles.find((item) => item.id === message.senderId) || {
        displayName: message.senderName,
        avatarUrl: "",
      };
    const item = document.createElement("article");
    item.className = `chat-message ${isMine ? "is-mine" : "is-theirs"}`;
    item.innerHTML = `
      <time class="chat-time"></time>
      <img class="chat-avatar" alt="" />
      <div class="chat-bubble">
        <div class="chat-text"></div>
      </div>
    `;
    item.querySelector(".chat-avatar").src = profile.avatarUrl || avatarDataUrl(profile.displayName);
    item.querySelector(".chat-time").textContent = fmtChatTime(message.createdAt);
    item.querySelector(".chat-text").textContent = message.body;
    els.chatList.append(item);
  });

  requestAnimationFrame(() => {
    els.chatList.scrollTop = els.chatList.scrollHeight;
  });
}

function focusChatInput() {
  requestAnimationFrame(() => {
    els.chatForm.scrollIntoView({ block: "end", behavior: "smooth" });
    els.chatInput.focus({ preventScroll: true });
  });
}

async function openChat() {
  showAppView("chat");
  focusChatInput();
  await loadMessages({ markRead: true });
  focusChatInput();
}

async function closeChat() {
  showAppView("main");
  renderMessageBadge();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function startMessagePolling() {
  if (messagePollTimer) clearInterval(messagePollTimer);
  messagePollTimer = setInterval(() => {
    loadMessages({ markRead: state.chatOpen });
  }, 8000);
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

  return playlist;
}

async function createPlaylistAndAddSong(song) {
  const name = prompt("新歌单叫什么名字？");
  const trimmedName = name?.trim();
  if (!trimmedName) return;

  const playlist = await createPlaylist(trimmedName);
  await loadData();
  await addToPlaylist(song.id, playlist.id);
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

async function removeSongFromPlaylist(song, playlist) {
  if (!playlist || !playlist.songIds.includes(song.id)) return;
  if (!confirm(`确定把《${song.title}》从「${playlist.name}」里移除吗？`)) return;

  playlist.songIds = playlist.songIds.filter((id) => id !== song.id);

  if (state.cloud) {
    await supabaseRest(`playlists?id=eq.${playlist.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ song_ids: playlist.songIds }),
    });
  } else {
    await localPut("playlists", playlist);
  }

  await loadData();
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
  state.playQueue = null;
  els.currentTitle.textContent = "还没有播放歌曲";
  els.currentMeta.textContent = "上传一首歌，或者从曲库点播放。";
  updatePlayingRows();
  updateProgress();
  updatePlayerControls();
}

function playbackMeta(song) {
  const base = song.artist || "未知歌手";
  if (!state.playQueue) return base;
  const modeNames = {
    order: "顺序播放",
    shuffle: "随机播放",
    repeatOne: "单曲循环",
  };
  const mode = modeNames[state.playQueue.mode] || "顺序播放";
  const index = state.playQueue.songIds.indexOf(song.id);
  if (index < 0) return `${base} · 下一首：${state.playQueue.name} · ${mode}`;
  const position = ` · ${index + 1}/${state.playQueue.songIds.length}`;
  return `${base} · ${state.playQueue.name}${position} · ${mode}`;
}

function queueSongs() {
  if (!state.playQueue) return [];
  return state.playQueue.songIds.map((id) => state.songs.find((song) => song.id === id)).filter(Boolean);
}

function canUseQueueControls() {
  return Boolean(state.playQueue && queueSongs().length);
}

function updatePlayerControls() {
  const hasSong = Boolean(state.currentSong);
  const hasQueue = canUseQueueControls();
  els.playToggleButton.disabled = !hasSong;
  els.previousButton.disabled = !hasQueue;
  els.nextButton.disabled = !hasQueue;
  els.playToggleButton.classList.toggle("is-playing", hasSong && !els.audio.paused);
  els.playToggleButton.title = hasSong && !els.audio.paused ? "暂停" : "播放";
  els.playToggleButton.setAttribute("aria-label", hasSong && !els.audio.paused ? "暂停" : "播放");
  updatePlaybackButtonStates();
}

function updateProgress() {
  const duration = els.audio.duration;
  const current = els.audio.currentTime;
  const hasDuration = Number.isFinite(duration) && duration > 0;

  els.progressSlider.disabled = !state.currentSong || !hasDuration;
  els.progressSlider.value = hasDuration ? String((current / duration) * 100) : "0";
  els.currentTime.textContent = fmtTime(current);
  els.durationTime.textContent = fmtTime(duration);
}

function seekAudio(event) {
  const duration = els.audio.duration;
  if (!Number.isFinite(duration) || duration <= 0) return;
  els.audio.currentTime = (Number(event.target.value) / 100) * duration;
  updateProgress();
}

function playSong(song, options = {}) {
  if (options.clearQueue !== false) {
    state.playQueue = null;
  }
  state.currentSong = song;
  els.audio.src = song.url || URL.createObjectURL(song.blob);
  els.audio.play();
  els.currentTitle.textContent = song.title;
  els.currentMeta.textContent = playbackMeta(song);
  updatePlayingRows();
  updatePlayerControls();
}

function setQueueContextForSong(song, name, songs) {
  const index = songs.findIndex((item) => item.id === song.id);
  state.playQueue = {
    id: name,
    name,
    mode: state.playMode,
    songIds: songs.map((item) => item.id),
    currentIndex: Math.max(0, index),
  };
  if (state.currentSong?.id === song.id) {
    els.currentMeta.textContent = playbackMeta(song);
  }
  updatePlayerControls();
}

function playSongInCollection(song, name, songs) {
  setQueueContextForSong(song, name, songs);
  playSong(song, { clearQueue: false });
}

function setPlaybackMode(name, songs, mode) {
  state.playMode = mode;
  localStorage.setItem("playMode", mode);

  state.playQueue = {
    id: name,
    name,
    mode,
    songIds: songs.map((song) => song.id),
    currentIndex: state.currentSong ? songs.findIndex((song) => song.id === state.currentSong.id) : -1,
  };

  if (!songs.length) {
    state.playQueue = null;
  }

  if (state.currentSong) {
    els.currentMeta.textContent = playbackMeta(state.currentSong);
  }
  updatePlayerControls();
}

function playNextInQueue() {
  if (!state.playQueue) return;

  const songs = state.playQueue.songIds.map((id) => state.songs.find((song) => song.id === id)).filter(Boolean);
  if (!songs.length) {
    resetPlayer();
    return;
  }

  if (state.playQueue.mode === "shuffle") {
    if (songs.length === 1) {
      state.playQueue.currentIndex = 0;
    } else {
      let nextIndex = state.playQueue.currentIndex;
      while (nextIndex === state.playQueue.currentIndex) {
        nextIndex = Math.floor(Math.random() * songs.length);
      }
      state.playQueue.currentIndex = nextIndex;
    }
  } else if (state.playQueue.mode === "repeatOne") {
    state.playQueue.currentIndex = Math.max(0, state.playQueue.currentIndex);
  } else {
    state.playQueue.currentIndex = (state.playQueue.currentIndex + 1) % songs.length;
  }

  playSong(songs[state.playQueue.currentIndex], { clearQueue: false });
}

function playPreviousInQueue() {
  if (!state.playQueue) return;

  const songs = queueSongs();
  if (!songs.length) {
    resetPlayer();
    return;
  }

  if (state.playQueue.mode === "shuffle") {
    if (songs.length > 1) {
      let nextIndex = state.playQueue.currentIndex;
      while (nextIndex === state.playQueue.currentIndex) {
        nextIndex = Math.floor(Math.random() * songs.length);
      }
      state.playQueue.currentIndex = nextIndex;
    }
  } else if (state.playQueue.mode === "repeatOne") {
    state.playQueue.currentIndex = Math.max(0, state.playQueue.currentIndex);
  } else {
    state.playQueue.currentIndex = (state.playQueue.currentIndex - 1 + songs.length) % songs.length;
  }

  playSong(songs[state.playQueue.currentIndex], { clearQueue: false });
}

function togglePlayback() {
  if (!state.currentSong) return;
  if (els.audio.paused) {
    els.audio.play();
  } else {
    els.audio.pause();
  }
}

function closeSongMenus(exceptMenu = null) {
  document.querySelectorAll(".song-menu").forEach((menu) => {
    if (menu !== exceptMenu) menu.hidden = true;
  });
}

function hasOpenSongMenu() {
  return Array.from(document.querySelectorAll(".song-menu")).some((menu) => !menu.hidden);
}

function handleOutsideSongMenuClick(event) {
  if (!hasOpenSongMenu()) return;
  if (event.target.closest(".song-menu") || event.target.closest('[data-action="menu"]')) return;

  closeSongMenus();
  event.preventDefault();
  event.stopPropagation();
}

function updatePlayingRows() {
  document.querySelectorAll(".song-row[data-song-id]").forEach((row) => {
    updateSongRow(row);
  });
}

function handleSongCardClick(song, name, songs) {
  const isCurrent = state.currentSong?.id === song.id;
  if (isCurrent) {
    setQueueContextForSong(song, name, songs);
    togglePlayback();
    return;
  }
  playSongInCollection(song, name, songs);
}

function updateSongRow(row) {
  const isCurrent = state.currentSong?.id === row.dataset.songId;
  const status = row.querySelector(".song-status");
  row.classList.toggle("is-current", isCurrent);
  if (status) {
    status.textContent = isCurrent ? (els.audio.paused ? "已暂停" : "正在播放") : "";
  }
}

function playbackButtonsHtml() {
  return `
    <button class="icon-button" type="button" data-mode="order" title="顺序播放" aria-label="顺序播放">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h10M4 12h10M4 17h8"></path>
        <path d="m17 8 3 4-3 4"></path>
      </svg>
    </button>
    <button class="icon-button" type="button" data-mode="shuffle" title="随机播放" aria-label="随机播放">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h3c4 0 5 10 9 10h4"></path>
        <path d="M4 17h3c1.8 0 3-1.8 4.2-3.8"></path>
        <path d="m17 4 3 3-3 3"></path>
        <path d="m17 14 3 3-3 3"></path>
      </svg>
    </button>
    <button class="icon-button" type="button" data-mode="repeatOne" title="单曲循环" aria-label="单曲循环">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M17 2l4 4-4 4"></path>
        <path d="M3 11V9a3 3 0 0 1 3-3h15"></path>
        <path d="M7 22l-4-4 4-4"></path>
        <path d="M21 13v2a3 3 0 0 1-3 3H3"></path>
        <path d="M12 9v6"></path>
      </svg>
    </button>
  `;
}

function updatePlaybackButtonStates() {
  document.querySelectorAll(".icon-button[data-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.playMode);
  });
}

function bindPlaybackButtons(container, getSongs, name, stopSummary = false) {
  container.querySelectorAll(".icon-button").forEach((button) => {
    button.disabled = !getSongs().length;
    button.classList.toggle("active", button.dataset.mode === state.playMode);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      if (stopSummary) event.stopPropagation();
      setPlaybackMode(name, getSongs(), event.currentTarget.dataset.mode);
    });
  });
}

function renderSongMenu(row, song, context = {}) {
  const menu = row.querySelector(".song-menu");
  const mainActions = menu.querySelector(".song-menu-main");
  const playlistPanel = menu.querySelector(".song-menu-playlists");
  const playlistList = menu.querySelector(".song-menu-playlist-list");
  const playlist = context.playlist || null;

  if (playlist) {
    mainActions.innerHTML = "";
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "danger";
    removeButton.textContent = "删除";
    removeButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      closeSongMenus();
      await removeSongFromPlaylist(song, playlist);
    });
    mainActions.append(removeButton);
    return;
  }

  playlistList.innerHTML = "";

  const newPlaylistButton = document.createElement("button");
  newPlaylistButton.type = "button";
  newPlaylistButton.className = "muted";
  newPlaylistButton.textContent = "+ 新建歌单";
  newPlaylistButton.addEventListener("click", async (event) => {
    event.stopPropagation();
    closeSongMenus();
    await createPlaylistAndAddSong(song);
  });
  playlistList.append(newPlaylistButton);

  if (!state.playlists.length) {
    const empty = document.createElement("div");
    empty.className = "song-menu-empty";
    empty.textContent = "还没有歌单";
    playlistList.append(empty);
  } else {
    state.playlists.forEach((playlist) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = playlist.name;
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        await addToPlaylist(song.id, playlist.id);
        closeSongMenus();
      });
      playlistList.append(button);
    });
  }

  menu.querySelector('[data-action="show-playlists"]').addEventListener("click", (event) => {
    event.stopPropagation();
    mainActions.hidden = true;
    playlistPanel.hidden = false;
  });

  menu.querySelector('[data-action="delete"]').addEventListener("click", (event) => {
    event.stopPropagation();
    closeSongMenus();
    deleteSong(song);
  });
}

function resetSongMenu(row) {
  const mainActions = row.querySelector(".song-menu-main");
  const playlistPanel = row.querySelector(".song-menu-playlists");
  if (mainActions) mainActions.hidden = false;
  if (playlistPanel) playlistPanel.hidden = true;
}

function renderSong(song, context = {}) {
  const collectionName = context.collectionName || "共享曲库";
  const getSongs = context.getSongs || (() => state.songs);
  const isPlaylistSong = Boolean(context.playlist);
  const row = document.createElement("article");
  row.className = "song-row";
  row.dataset.songId = song.id;
  row.innerHTML = `
    <div>
      <div class="song-title"><span class="song-status"></span><span class="song-title-text"></span></div>
      <div class="song-meta"></div>
    </div>
    <button class="song-menu-button" type="button" data-action="menu" title="更多" aria-label="更多操作">...</button>
    <div class="song-menu" hidden>
      <div class="song-menu-main">
        ${
          isPlaylistSong
            ? ""
            : '<button type="button" data-action="show-playlists">加入歌单</button><button class="danger" type="button" data-action="delete">删除</button>'
        }
      </div>
      <div class="song-menu-playlists" hidden>
        <div class="song-menu-playlist-list"></div>
      </div>
    </div>
  `;
  row.querySelector(".song-title-text").textContent = song.title;
  row.querySelector(".song-meta").textContent = song.artist || "未知歌手";

  row.addEventListener("click", () => handleSongCardClick(song, collectionName, getSongs()));
  row.querySelector('[data-action="menu"]').addEventListener("click", (event) => {
    event.stopPropagation();
    const menu = row.querySelector(".song-menu");
    const shouldOpen = menu.hidden;
    closeSongMenus(menu);
    resetSongMenu(row);
    menu.hidden = !shouldOpen;
  });
  row.querySelector(".song-menu").addEventListener("click", (event) => event.stopPropagation());
  renderSongMenu(row, song, context);
  updateSongRow(row);

  return row;
}

function renderPlaylist(playlist) {
  const card = document.createElement("details");
  card.className = "playlist-card";
  const songs = playlist.songIds.map((id) => state.songs.find((song) => song.id === id)).filter(Boolean);
  card.innerHTML = `
    <summary>
      <span class="playlist-name"></span>
      <span class="playlist-count"></span>
      <span class="playlist-actions">
        ${playbackButtonsHtml()}
      </span>
    </summary>
    <ul></ul>
  `;
  card.querySelector(".playlist-name").textContent = playlist.name;
  card.querySelector(".playlist-count").textContent = `${songs.length} 首`;
  bindPlaybackButtons(card.querySelector(".playlist-actions"), () => songs, playlist.name, true);
  const list = card.querySelector("ul");

  if (!songs.length) {
    const empty = document.createElement("li");
    empty.className = "song-meta";
    empty.textContent = "还没有歌曲，去曲库里加入。";
    list.append(empty);
    return card;
  }

  songs.forEach((song) => {
    const item = renderSong(song, {
      collectionName: playlist.name,
      getSongs: () => songs,
      playlist,
    });
    list.append(item);
  });

  return card;
}

function render() {
  els.songCount.textContent = `${state.songs.length} 首`;
  els.libraryPlaybackActions.innerHTML = playbackButtonsHtml();
  bindPlaybackButtons(els.libraryPlaybackActions, () => state.songs, "共享曲库");
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
  els.installAppButton.addEventListener("click", installApp);
  els.closeInstallTip.addEventListener("click", () => {
    els.installTip.hidden = true;
  });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallButton();
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    els.installTip.hidden = true;
    updateInstallButton();
  });
  const standaloneQuery = window.matchMedia("(display-mode: standalone)");
  if (standaloneQuery.addEventListener) {
    standaloneQuery.addEventListener("change", updateInstallButton);
  } else if (standaloneQuery.addListener) {
    standaloneQuery.addListener(updateInstallButton);
  }
  updateInstallButton();
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
  els.messageButton.addEventListener("click", openChat);
  els.closeChatButton.addEventListener("click", closeChat);
  els.chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = els.chatInput.value;
    if (!text.trim()) return;
    els.sendMessageButton.disabled = true;
    try {
      await sendMessage(text);
      els.chatInput.value = "";
    } catch (error) {
      els.chatStatus.textContent = `发送失败：${error.message}`;
      console.error(error);
    } finally {
      els.sendMessageButton.disabled = false;
    }
  });
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
  els.audio.addEventListener("play", updatePlayingRows);
  els.audio.addEventListener("play", updatePlayerControls);
  els.audio.addEventListener("pause", () => els.nowPlaying.classList.remove("is-playing"));
  els.audio.addEventListener("pause", updatePlayingRows);
  els.audio.addEventListener("pause", updatePlayerControls);
  els.audio.addEventListener("ended", playNextInQueue);
  els.audio.addEventListener("loadedmetadata", updateProgress);
  els.audio.addEventListener("timeupdate", updateProgress);
  els.audio.addEventListener("durationchange", updateProgress);
  els.progressSlider.addEventListener("input", seekAudio);
  els.previousButton.addEventListener("click", playPreviousInQueue);
  els.playToggleButton.addEventListener("click", togglePlayback);
  els.nextButton.addEventListener("click", playNextInQueue);
  document.addEventListener("click", handleOutsideSongMenuClick, true);
  updatePlayerControls();
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
  askForProfileIfNeeded();
  await loadMessages();
  startMessagePolling();
  await loadData();
}

boot().catch((error) => {
  console.error(error);
  els.modeNote.textContent = `出错了：${error.message}`;
});
