const dbName = "our-little-player";
const defaultRoom = "our-room";
const state = {
  songs: [],
  playlists: [],
  currentSong: null,
  room: localStorage.getItem("roomCode") || defaultRoom,
  uploader: localStorage.getItem("uploaderName") || "",
  supabase: null,
  cloud: false,
};

const els = {
  syncStatus: document.querySelector("#sync-status"),
  roomCode: document.querySelector("#room-code"),
  uploaderName: document.querySelector("#uploader-name"),
  uploadForm: document.querySelector("#upload-form"),
  musicFile: document.querySelector("#music-file"),
  modeNote: document.querySelector("#mode-note"),
  refreshButton: document.querySelector("#refresh-button"),
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

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fmtDate(value) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(value));
}

function getConfig() {
  return window.LITTLE_PLAYER_CONFIG || {};
}

function setRoom(value) {
  state.room = value.trim() || defaultRoom;
  localStorage.setItem("roomCode", state.room);
}

function setUploader(value) {
  state.uploader = value.trim();
  localStorage.setItem("uploaderName", state.uploader);
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

async function initSupabase() {
  const config = getConfig();
  if (!config.supabaseUrl || !config.supabaseAnonKey) return;

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  state.supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
  state.cloud = true;
  els.syncStatus.textContent = "云端共享";
  els.modeNote.textContent = "已连接 Supabase。你们使用同一个房间码时，上传的歌和歌单会同步共享。";
}

async function loadData() {
  if (state.cloud) {
    const [songsResult, playlistsResult] = await Promise.all([
      state.supabase.from("songs").select("*").eq("room_code", state.room).order("created_at", { ascending: false }),
      state.supabase.from("playlists").select("*").eq("room_code", state.room).order("created_at", { ascending: false }),
    ]);

    if (songsResult.error) throw songsResult.error;
    if (playlistsResult.error) throw playlistsResult.error;

    state.songs = songsResult.data.map((song) => ({
      id: song.id,
      room: song.room_code,
      title: song.title,
      uploader: song.uploader_name,
      createdAt: song.created_at,
      url: song.public_url,
    }));
    state.playlists = playlistsResult.data.map((playlist) => ({
      id: playlist.id,
      room: playlist.room_code,
      name: playlist.name,
      songIds: playlist.song_ids || [],
      createdAt: playlist.created_at,
    }));
  } else {
    state.songs = (await localAll("songs")).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    state.playlists = (await localAll("playlists")).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  render();
}

async function uploadSong(file) {
  const song = {
    id: uid(),
    room: state.room,
    title: file.name.replace(/\.[^.]+$/, ""),
    uploader: state.uploader || "匿名",
    createdAt: new Date().toISOString(),
  };

  if (state.cloud) {
    const path = `${state.room}/${song.id}-${file.name}`;
    const storage = await state.supabase.storage.from("songs").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "audio/wav",
    });
    if (storage.error) throw storage.error;

    const { data } = state.supabase.storage.from("songs").getPublicUrl(path);
    const insert = await state.supabase.from("songs").insert({
      id: song.id,
      room_code: song.room,
      title: song.title,
      uploader_name: song.uploader,
      storage_path: path,
      public_url: data.publicUrl,
    });
    if (insert.error) throw insert.error;
  } else {
    song.blob = file;
    song.url = URL.createObjectURL(file);
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
    const result = await state.supabase.from("playlists").insert({
      id: playlist.id,
      room_code: playlist.room,
      name: playlist.name,
      song_ids: [],
    });
    if (result.error) throw result.error;
  } else {
    await localPut("playlists", playlist);
  }
}

async function addToPlaylist(songId, playlistId) {
  const playlist = state.playlists.find((item) => item.id === playlistId);
  if (!playlist || playlist.songIds.includes(songId)) return;
  playlist.songIds = [...playlist.songIds, songId];

  if (state.cloud) {
    const result = await state.supabase.from("playlists").update({ song_ids: playlist.songIds }).eq("id", playlist.id);
    if (result.error) throw result.error;
  } else {
    await localPut("playlists", playlist);
  }

  render();
}

function playSong(song) {
  state.currentSong = song;
  els.audio.src = song.url || URL.createObjectURL(song.blob);
  els.audio.play();
  els.currentTitle.textContent = song.title;
  els.currentMeta.textContent = `${song.uploader} 上传 · ${fmtDate(song.createdAt)}`;
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
    </div>
  `;
  row.querySelector(".song-title").textContent = song.title;
  row.querySelector(".song-meta").textContent = `${song.uploader} · ${fmtDate(song.createdAt)}`;

  const select = row.querySelector("select");
  state.playlists.forEach((playlist) => {
    const option = document.createElement("option");
    option.value = playlist.id;
    option.textContent = playlist.name;
    select.append(option);
  });

  row.querySelector('[data-action="play"]').addEventListener("click", () => playSong(song));
  select.addEventListener("change", async (event) => {
    if (!event.target.value) return;
    await addToPlaylist(song.id, event.target.value);
    event.target.value = "";
  });

  return row;
}

function renderPlaylist(playlist) {
  const card = document.createElement("article");
  card.className = "playlist-card";
  const songs = playlist.songIds.map((id) => state.songs.find((song) => song.id === id)).filter(Boolean);
  card.innerHTML = `<h4></h4><ul></ul>`;
  card.querySelector("h4").textContent = `${playlist.name} · ${songs.length} 首`;
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
    item.querySelector(".song-meta").textContent = song.uploader;
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

function bindEvents() {
  els.roomCode.value = state.room;
  els.uploaderName.value = state.uploader;

  els.roomCode.addEventListener("change", async (event) => {
    setRoom(event.target.value);
    await loadData();
  });

  els.uploaderName.addEventListener("change", (event) => setUploader(event.target.value));
  els.refreshButton.addEventListener("click", loadData);

  els.uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const files = [...els.musicFile.files];
    if (!files.length) return;
    els.uploadForm.querySelector("button").textContent = "上传中...";
    for (const file of files) {
      await uploadSong(file);
    }
    els.musicFile.value = "";
    els.uploadForm.querySelector("button").textContent = "上传到曲库";
    await loadData();
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
  bindEvents();
  await initSupabase();
  await loadData();
}

boot().catch((error) => {
  console.error(error);
  els.modeNote.textContent = `出错了：${error.message}`;
});
