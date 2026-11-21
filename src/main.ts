import { getCurrentWindow } from '@tauri-apps/api/window';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';

type SpotifyTrack = {
  title: string;
  artists: string;
  spotify_url: string;
  artwork_url?: string;
  source_url?: string;
  duration?: number;
};

type StreamingSearchTrack = {
  title: string;
  artists: string;
  provider: 'spotify' | 'youtube' | 'soundcloud';
  source_url: string;
  spotify_url?: string;
  artwork_url?: string;
  duration?: number;
};

type DownloadedTrack = {
  path: string;
  title: string;
  artist: string;
  duration?: number;
  artwork_data_url?: string;
  artwork_url?: string;
};

type BackgroundVideo = {
  name: string;
  path: string;
};

type LibraryTrack = {
  name: string;
  title: string;
  artist: string;
  file?: File;
  path?: string;
  artworkDataUrl?: string;
  artworkUrl?: string;
  artworkPromise?: Promise<string | undefined>;
  duration?: number;
  downloadStatus?: 'queued' | 'downloading' | 'failed';
  spotifyTrack?: SpotifyTrack;
  downloadProvider?: string;
};

type Playlist = {
  id: string;
  name: string;
  trackIds: string[];
};

function initializeControls() {
  const appWindow = getCurrentWindow();
  void appWindow.onFocusChanged(({ payload: focused }) => {
    document.body.classList.toggle('window-inactive', !focused);
  }).catch(console.error);

  document.getElementById('btn-close')?.addEventListener('click', () => {
    void appWindow.close().catch(console.error);
  });

  document.getElementById('btn-minimize')?.addEventListener('click', () => {
    void appWindow.minimize().catch(console.error);
  });

  document.getElementById('btn-maximize')?.addEventListener('click', () => {
    void appWindow.toggleMaximize().catch(console.error);
  });

  const titlebar = document.querySelector<HTMLElement>('.titlebar');
  titlebar?.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    if (event.target.closest('button, a, input, select, textarea, [role="button"]')) return;
    void appWindow.startDragging().catch(console.error);
  });

  const playerGrid = document.querySelector<HTMLElement>('.player-grid');
  const queueScreen = document.getElementById('queue-screen');
  const playlistsScreen = document.getElementById('playlists-screen');
  const lyricsScreen = document.getElementById('lyrics-screen');
  const sourceToggle = document.querySelector<HTMLElement>('.source-toggle');
  let sourcePillTimeout = 0;
  let activeMainView = 'library';
  const animatePanel = (panel: HTMLElement | null) => {
    if (!panel) return;
    panel.classList.remove('panel-enter');
    void panel.offsetWidth;
    panel.classList.add('panel-enter');
  };
  document.querySelectorAll<HTMLButtonElement>('.source-option').forEach((option) => {
    option.addEventListener('click', () => {
      const nextView = option.dataset.view ?? 'library';
      const changedView = nextView !== activeMainView;
      activeMainView = nextView;
      const viewIndex = ['library', 'playlists', 'lyrics', 'queue'].indexOf(nextView);
      document.querySelectorAll('.source-option').forEach((item) => {
        const active = item === option;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      if (sourceToggle && changedView && viewIndex >= 0) {
        sourceToggle.dataset.index = String(viewIndex);
        sourceToggle.classList.remove('is-transitioning');
        void sourceToggle.offsetWidth;
        sourceToggle.classList.add('is-transitioning');
        window.clearTimeout(sourcePillTimeout);
        sourcePillTimeout = window.setTimeout(() => sourceToggle.classList.remove('is-transitioning'), 440);
      }
      const showLibrary = nextView === 'library';
      const showQueue = nextView === 'queue';
      if (playerGrid) playerGrid.hidden = !showLibrary;
      if (queueScreen) queueScreen.hidden = !showQueue;
      if (playlistsScreen) playlistsScreen.hidden = nextView !== 'playlists';
      if (lyricsScreen) lyricsScreen.hidden = nextView !== 'lyrics';
      if (changedView) animatePanel(showLibrary ? playerGrid : showQueue ? queueScreen : nextView === 'playlists' ? playlistsScreen : lyricsScreen);
    });
  });

  const settingsDialog = document.getElementById('settings-dialog') as HTMLDialogElement | null;
  const settingsButton = document.querySelector<HTMLButtonElement>('.settings-button');
  let settingsButtonPlaceholder: HTMLSpanElement | null = null;
  let settingsButtonWasDisabled = false;
  settingsDialog?.addEventListener('close', () => {
    if (!settingsButton || !settingsButtonPlaceholder) return;
    settingsButton.classList.remove('settings-corner-gear', 'is-spinning', 'is-reversing');
    settingsButton.disabled = settingsButtonWasDisabled;
    settingsButton.removeAttribute('aria-hidden');
    settingsButton.tabIndex = 0;
    settingsButtonPlaceholder.replaceWith(settingsButton);
    settingsButtonPlaceholder = null;
  });
  settingsButton?.addEventListener('animationend', (event) => {
    if (event.animationName === 'settings-gear-spin') settingsButton.classList.remove('is-spinning');
    if (event.animationName === 'settings-gear-reverse') settingsButton.classList.remove('is-reversing');
  });
  const openSettings = () => {
    if (!settingsDialog || settingsDialog.open) return;
    settingsButton?.classList.remove('is-spinning');
    if (settingsButton) void settingsButton.offsetWidth;
    settingsButton?.classList.add('is-spinning');
    settingsDialog.showModal();
    if (settingsButton?.parentElement) {
      settingsButtonPlaceholder = document.createElement('span');
      settingsButtonPlaceholder.className = 'settings-button-placeholder';
      settingsButtonPlaceholder.style.width = `${settingsButton.offsetWidth}px`;
      settingsButtonPlaceholder.style.height = `${settingsButton.offsetHeight}px`;
      settingsButtonPlaceholder.style.flex = `0 0 ${settingsButton.offsetWidth}px`;
      settingsButton.before(settingsButtonPlaceholder);
      settingsButtonWasDisabled = settingsButton.disabled;
      settingsButton.disabled = true;
      settingsButton.setAttribute('aria-hidden', 'true');
      settingsButton.tabIndex = -1;
      settingsDialog.append(settingsButton);
      settingsButton.classList.add('settings-corner-gear');
    }
    requestAnimationFrame(() => settingsDialog.classList.add('is-open'));
  };
  const closeSettings = () => {
    if (!settingsDialog?.open) return;
    settingsButton?.classList.remove('is-spinning');
    if (settingsButton) {
      void settingsButton.offsetWidth;
      settingsButton.classList.add('is-reversing');
    }
    settingsDialog.classList.remove('is-open');
    window.setTimeout(() => {
      if (settingsDialog.open && !settingsDialog.classList.contains('is-open')) settingsDialog.close();
    }, 320);
  };
  document.querySelector('.settings-button')?.addEventListener('click', openSettings);
  document.getElementById('settings-close')?.addEventListener('click', closeSettings);
  settingsDialog?.addEventListener('click', (event) => {
    if (event.target === settingsDialog) closeSettings();
  });
  settingsDialog?.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeSettings();
  });

  const readSetting = (key: string, fallback: string) => {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  };
  const storeSetting = (key: string, value: string) => {
    try { localStorage.setItem(key, value); } catch { /* Settings still work for this session. */ }
  };
  const removeSetting = (key: string) => {
    try { localStorage.removeItem(key); } catch { /* Settings still work for this session. */ }
  };
  const settingsTabs = [...document.querySelectorAll<HTMLButtonElement>('[data-settings-tab]')];
  const settingsTabNav = document.getElementById('settings-tabs');
  let settingsTabAnimationTimeout = 0;
  const activateSettingsTab = (name: string, animate = false) => {
    const activeIndex = settingsTabs.findIndex((tab) => tab.dataset.settingsTab === name);
    const changedTab = activeIndex >= 0 && activeIndex !== Number(settingsTabNav?.dataset.index ?? 0);
    if (settingsTabNav && activeIndex >= 0) {
      settingsTabNav.dataset.index = String(activeIndex);
      if (animate && changedTab) {
        settingsTabNav.classList.remove('is-transitioning');
        void settingsTabNav.offsetWidth;
        settingsTabNav.classList.add('is-transitioning');
        window.clearTimeout(settingsTabAnimationTimeout);
        settingsTabAnimationTimeout = window.setTimeout(() => settingsTabNav.classList.remove('is-transitioning'), 440);
      }
    }
    settingsTabs.forEach((tab) => {
      const active = tab.dataset.settingsTab === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll<HTMLElement>('[data-settings-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.settingsPanel !== name;
      if (animate && changedTab && !panel.hidden) animatePanel(panel);
    });
  };
  settingsTabs.forEach((tab) => tab.addEventListener('click', () => activateSettingsTab(tab.dataset.settingsTab ?? 'appearance', true)));
  const videoElement = document.getElementById('app-background-video') as HTMLVideoElement | null;
  const videoSelect = document.getElementById('background-video-select') as HTMLSelectElement | null;
  const videoStatus = document.getElementById('background-video-status');
  const savedVideos: BackgroundVideo[] = [];
  const activateBackgroundVideo = (name: string) => {
    const selected = savedVideos.find((video) => video.name === name);
    if (!videoElement) return;
    if (!selected) {
      videoElement.pause();
      videoElement.removeAttribute('src');
      videoElement.load();
      videoElement.hidden = true;
      document.body.classList.remove('has-background-video');
      return;
    }
    videoElement.src = convertFileSrc(selected.path);
    videoElement.hidden = false;
    document.body.classList.add('has-background-video');
    videoElement.load();
    void videoElement.play().catch((error: unknown) => console.warn('Could not play the selected background video:', error));
  };
  const refreshBackgroundVideos = async (selectName?: string) => {
    const videos = await invoke<BackgroundVideo[]>('list_background_videos');
    savedVideos.splice(0, savedVideos.length, ...videos);
    if (videoSelect) {
      videoSelect.replaceChildren(new Option('No video background', ''));
      videos.forEach((video) => videoSelect.add(new Option(video.name, video.name)));
      const preferredName = selectName ?? readSetting('glass-player-background-video', '');
      const selectedName = videos.some((video) => video.name === preferredName) ? preferredName : '';
      videoSelect.value = selectedName;
      if (selectedName) storeSetting('glass-player-background-video', selectedName);
      else removeSetting('glass-player-background-video');
      activateBackgroundVideo(selectedName);
    }
  };
  void refreshBackgroundVideos().catch((error: unknown) => {
    console.error('Could not list saved background videos:', error);
    if (videoStatus) videoStatus.textContent = 'Could not load saved videos.';
  });
  videoSelect?.addEventListener('change', () => {
    const name = videoSelect.value;
    storeSetting('glass-player-background-video', name);
    activateBackgroundVideo(name);
  });
  const videoFileInput = document.getElementById('background-video-file') as HTMLInputElement | null;
  document.getElementById('upload-background-video')?.addEventListener('click', () => videoFileInput?.click());
  videoFileInput?.addEventListener('change', () => {
    const file = videoFileInput.files?.[0];
    if (!file) return;
    void (async () => {
      const status = videoStatus;
      const chunkSize = 256 * 1024;
      let savedName = '';
      try {
        if (file.size === 0) throw new Error('The selected video is empty.');
        for (let start = 0, chunkIndex = 0; start < file.size; start += chunkSize, chunkIndex += 1) {
          const end = Math.min(start + chunkSize, file.size);
          const bytes = Array.from(new Uint8Array(await file.slice(start, end).arrayBuffer()));
          savedName = await invoke<string>('write_background_video_chunk', {
            fileName: file.name,
            chunkIndex,
            isLast: end === file.size,
            bytes,
          });
          if (status) status.textContent = `Saving video… ${Math.round((end / file.size) * 100)}%`;
        }
        await refreshBackgroundVideos(savedName);
        if (videoSelect) videoSelect.value = savedName;
        storeSetting('glass-player-background-video', savedName);
        activateBackgroundVideo(savedName);
        if (status) status.textContent = 'Video saved and playing.';
      } catch (error) {
        if (status) status.textContent = error instanceof Error ? error.message : String(error);
      } finally {
        videoFileInput.value = '';
      }
    })();
  });
  const sourceControl = document.getElementById('default-audio-source');
  const validSources = ['auto', 'youtube-music', 'soundcloud'];
  let defaultAudioSource = readSetting('glass-player-default-audio-source', 'auto');
  if (!validSources.includes(defaultAudioSource)) defaultAudioSource = 'auto';
  const formatControl = document.getElementById('audio-format');
  let audioFormat = readSetting('glass-player-audio-format', 'm4a');
  if (!['m4a', 'mp3'].includes(audioFormat)) audioFormat = 'm4a';
  const bindRangeSetting = (inputId: string, valueId: string, storageKey: string, defaultValue: number, max: number, unit: string, apply: (value: number) => void) => {
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    const output = document.getElementById(valueId) as HTMLOutputElement | null;
    if (!input) return;
    const stored = Number(readSetting(storageKey, String(defaultValue)));
    const initial = Number.isFinite(stored) ? Math.max(0, Math.min(max, stored)) : defaultValue;
    input.value = String(initial);
    const update = () => {
      const value = Number(input.value);
      if (output) output.value = `${value}${unit}`;
      storeSetting(storageKey, String(value));
      apply(value);
    };
    if (output) output.value = `${initial}${unit}`;
    apply(initial);
    input.addEventListener('input', update);
  };
  const selectSegment = (control: HTMLElement | null, value: string) => {
    if (!control) return;
    const buttons = [...control.querySelectorAll<HTMLButtonElement>('.settings-segment')];
    const index = buttons.findIndex((button) => button.dataset.value === value);
    control.dataset.index = String(Math.max(index, 0));
    buttons.forEach((button, buttonIndex) => {
      const active = buttonIndex === index;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  };
  selectSegment(sourceControl, defaultAudioSource);
  selectSegment(formatControl, audioFormat);
  let uiTransparency = 88;
  let backgroundTransparency = 0;
  let uiBlur = 24;
  let backgroundBlur = 24;
  const applyUiBlur = () => document.body.style.setProperty('--ui-blur', `${uiBlur * Math.min(1, (100 - uiTransparency) / 12)}px`);
  const applyBackgroundBlur = () => document.body.style.setProperty('--background-blur', `${backgroundBlur * Math.min(1, (100 - backgroundTransparency) / 12)}px`);
  bindRangeSetting('ui-transparency', 'ui-transparency-value', 'glass-player-ui-transparency', 88, 100, '%', (value) => {
    uiTransparency = value;
    const opacity = (baseline: number) => String(Math.min(1, (baseline * (100 - value)) / 12).toFixed(3));
    document.body.style.setProperty('--ui-panel-alpha', opacity(0.04));
    document.body.style.setProperty('--ui-card-alpha', opacity(0.075));
    document.body.style.setProperty('--ui-control-alpha', opacity(0.09));
    document.body.style.setProperty('--ui-primary-alpha', opacity(0.2));
    document.body.style.setProperty('--ui-modal-alpha', opacity(0.65));
    applyUiBlur();
  });
  bindRangeSetting('background-transparency', 'background-transparency-value', 'glass-player-background-transparency', 0, 100, '%', (value) => {
    backgroundTransparency = value;
    document.body.style.setProperty('--background-visibility', String(1 - value / 100));
    applyBackgroundBlur();
  });
  bindRangeSetting('ui-blur', 'ui-blur-value', 'glass-player-ui-blur', 24, 48, 'px', (value) => {
    uiBlur = value;
    applyUiBlur();
  });
  bindRangeSetting('background-blur', 'background-blur-value', 'glass-player-background-blur', 24, 48, 'px', (value) => {
    backgroundBlur = value;
    applyBackgroundBlur();
  });
  sourceControl?.querySelectorAll<HTMLButtonElement>('.settings-segment').forEach((button) => {
    button.addEventListener('click', () => {
      defaultAudioSource = button.dataset.value ?? 'auto';
      selectSegment(sourceControl, defaultAudioSource);
      storeSetting('glass-player-default-audio-source', defaultAudioSource);
    });
  });
  formatControl?.querySelectorAll<HTMLButtonElement>('.settings-segment').forEach((button) => {
    button.addEventListener('click', () => {
      audioFormat = button.dataset.value === 'mp3' ? 'mp3' : 'm4a';
      selectSegment(formatControl, audioFormat);
      storeSetting('glass-player-audio-format', audioFormat);
    });
  });
  const ambientGlowToggle = document.getElementById('ambient-glow-toggle') as HTMLInputElement | null;
  let ambientArtworkGlow = readSetting('glass-player-ambient-artwork-glow', 'true') !== 'false';
  if (ambientGlowToggle) ambientGlowToggle.checked = ambientArtworkGlow;
  ambientGlowToggle?.addEventListener('change', () => {
    ambientArtworkGlow = ambientGlowToggle.checked;
    storeSetting('glass-player-ambient-artwork-glow', String(ambientArtworkGlow));
    if (ambientArtworkGlow) {
      const cover = audio?.dataset.cover;
      if (cover) applyAmbientCover(cover);
    } else {
      document.body.style.removeProperty('--album-glow');
    }
  });
  const discordPresenceToggle = document.getElementById('discord-presence-toggle') as HTMLInputElement | null;
  let discordPresenceEnabled = readSetting('glass-player-discord-presence', 'false') === 'true';
  if (discordPresenceToggle) discordPresenceToggle.checked = discordPresenceEnabled;
  discordPresenceToggle?.addEventListener('change', () => {
    discordPresenceEnabled = discordPresenceToggle.checked;
    storeSetting('glass-player-discord-presence', String(discordPresenceEnabled));
    refreshDiscordPresence(discordPresenceEnabled && !!audio && !audio.paused);
  });
  document.getElementById('reset-settings')?.addEventListener('click', () => {
    sourceControl?.querySelector<HTMLButtonElement>('[data-value="auto"]')?.click();
    formatControl?.querySelector<HTMLButtonElement>('[data-value="m4a"]')?.click();
    const defaults: Array<[string, number]> = [
      ['ui-transparency', 88],
      ['background-transparency', 0],
      ['ui-blur', 24],
      ['background-blur', 24],
    ];
    defaults.forEach(([id, value]) => {
      const input = document.getElementById(id) as HTMLInputElement | null;
      if (!input) return;
      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    if (ambientGlowToggle) {
      ambientGlowToggle.checked = true;
      ambientGlowToggle.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (discordPresenceToggle) {
      discordPresenceToggle.checked = false;
      discordPresenceToggle.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (videoSelect) videoSelect.value = '';
    removeSetting('glass-player-background-video');
    activateBackgroundVideo('');
  });

  const spotifyInput = document.getElementById('spotify-link') as HTMLInputElement | null;
  const spotifySearch = document.getElementById('search-spotify') as HTMLButtonElement | null;
  const searchStatus = document.getElementById('search-status');
  const spotifyResults = document.getElementById('spotify-results');
  const clearDownloadsButton = document.getElementById('clear-downloads') as HTMLButtonElement | null;
  const storageStatus = document.getElementById('storage-status');
  const downloadAllRow = document.getElementById('download-all-row') as HTMLDivElement | null;
  const downloadAllButton = document.getElementById('download-all') as HTMLButtonElement | null;
  let loadedSpotifyTracks: SpotifyTrack[] = [];

  const renderSpotifyResults = (tracks: SpotifyTrack[]) => {
    if (!spotifyResults) return;
    loadedSpotifyTracks = tracks;
    if (downloadAllRow) downloadAllRow.hidden = tracks.length < 2;
    spotifyResults.replaceChildren(...tracks.map((track) => {
      const card = document.createElement('article');
      card.className = 'spotify-result';
      const heading = document.createElement('strong');
      heading.textContent = track.title;
      const byline = document.createElement('span');
      byline.textContent = track.artists || 'Spotify track';
      const links = document.createElement('div');
      links.className = 'service-links';
      const services = [
        ['SoundCloud', 'soundcloud'],
        ['YouTube Music', 'youtube-music'],
        ['YouTube', 'youtube'],
      ];
      for (const [name, provider] of services) {
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'service-link';
        link.textContent = name;
        link.addEventListener('click', () => enqueueSpotifyDownload(track, provider));
        links.append(link);
      }
      card.append(heading, byline, links);
      return card;
    }));
  };

  const searchSpotifyLink = async () => {
    const url = spotifyInput?.value.trim();
    if (!url || !spotifySearch || spotifySearch.disabled) return;
    spotifySearch.disabled = true;
    spotifySearch.classList.add('is-loading');
    spotifySearch.setAttribute('aria-busy', 'true');
    spotifySearch.textContent = 'Searching…';
    if (searchStatus) searchStatus.textContent = 'Searching Spotify…';
    spotifyResults?.replaceChildren();
    loadedSpotifyTracks = [];
    if (downloadAllRow) downloadAllRow.hidden = true;
    try {
      const tracks = await invoke<SpotifyTrack[]>('inspect_spotify_link', { url });
      renderSpotifyResults(tracks);
      if (searchStatus) searchStatus.textContent = tracks.length > 1
        ? `Found ${tracks.length} tracks. Choose a provider or download the playlist.`
        : `Found ${tracks.length} track. Choose a provider to download it.`;
    } catch (error) {
      if (searchStatus) searchStatus.textContent = String(error);
    } finally {
      spotifySearch.disabled = false;
      spotifySearch.classList.remove('is-loading');
      spotifySearch.removeAttribute('aria-busy');
      spotifySearch.textContent = 'Search Spotify';
    }
  };
  spotifySearch?.addEventListener('click', () => void searchSpotifyLink());
  spotifyInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') void searchSpotifyLink();
  });

  const audio = document.getElementById('audio-player') as HTMLAudioElement | null;
  const filePicker = document.getElementById('audio-files') as HTMLInputElement | null;
  const importButton = document.getElementById('import-audio');
  const libraryFilter = document.getElementById('library-filter') as HTMLInputElement | null;
  const library = document.getElementById('library-list');
  const queueList = document.getElementById('queue-list');
  const title = document.getElementById('track-title');
  const artist = document.getElementById('track-artist');
  const playButton = document.getElementById('toggle-playback');
  const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement | null;
  const setPlaybackButton = (playing: boolean) => {
    if (!playButton) return;
    playButton.innerHTML = playing
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM14 5h4v14h-4z" /></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" /></svg>';
    playButton.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    playButton.title = playing ? 'Pause' : 'Play';
  };
  if (audio && volumeSlider) volumeSlider.value = String(audio.volume);
  volumeSlider?.addEventListener('input', () => {
    if (audio) audio.volume = Number(volumeSlider.value);
  });
  const seek = document.getElementById('seek-slider') as HTMLInputElement | null;
  const seekWavePath = document.querySelector<SVGPathElement>('.seek-wave-base');
  const seekWaveProgress = document.getElementById('seek-wave-progress') as SVGPathElement | null;
  const seekWaveDot = document.getElementById('seek-wave-dot');
  const seekControl = seekWaveDot?.parentElement;
  let seekControlWidth = seekControl?.getBoundingClientRect().width ?? 0;
  let seekControlHeight = seekControl?.getBoundingClientRect().height ?? 0;
  let seekWaveLength = 0;
  try { seekWaveLength = seekWavePath?.getTotalLength() ?? 0; } catch { /* SVG can initialize after layout. */ }
  if (seekControl && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(([entry]) => {
      seekControlWidth = entry.contentRect.width;
      seekControlHeight = entry.contentRect.height;
    }).observe(seekControl);
  }
  const artwork = document.getElementById('artwork-placeholder');
  let tracks: LibraryTrack[] = [];
  let currentTrack = -1;
  let activePlaybackPlaylistId: string | null = null;
  const playlistStorageKey = 'glass-player-playlists';
  const playlistSelectionKey = 'glass-player-selected-playlist';
  const playlists: Playlist[] = (() => {
    try {
      const value: unknown = JSON.parse(readSetting(playlistStorageKey, '[]'));
      if (!Array.isArray(value)) return [];
      return value.filter((item): item is Playlist => Boolean(item && typeof item.id === 'string' && typeof item.name === 'string' && Array.isArray(item.trackIds) && item.trackIds.every((id: unknown) => typeof id === 'string')));
    } catch { return []; }
  })();
  let selectedPlaylistId = readSetting(playlistSelectionKey, '') || playlists[0]?.id || '';
  let libraryPlaylistId: string | null = null;
  const refreshDiscordPresence = (isPlaying: boolean) => {
    void invoke('update_discord_presence', {
      title: discordPresenceEnabled && isPlaying
        ? tracks[currentTrack]?.title?.trim() || tracks[currentTrack]?.name?.trim() || 'Unknown track'
        : '',
      artist: discordPresenceEnabled && isPlaying
        ? tracks[currentTrack]?.artist?.trim() || 'Unknown artist'
        : '',
    }).catch((error: unknown) => console.error('Could not update Discord Rich Presence:', error));
  };
  type LyricWord = { text: string; start: number; end: number; line: number };
  const lyricWordList = document.getElementById('lyrics-word-list');
  const lyricStatus = document.getElementById('lyrics-status');
  const lyricHeading = document.getElementById('lyrics-track-heading');
  let lyricWords: LyricWord[] = [];
  let lyricWordElements: HTMLElement[] = [];
  let lyricLineElements: HTMLElement[] = [];
  let activeLyricWord = -1;
  let activeLyricLine = -1;
  let lyricRequestId = 0;
  const playlistTrackId = (track: LibraryTrack) => {
    if (track.file) return `local:${track.file.name}:${track.file.size}:${track.file.lastModified}`;
    const metadataKey = `${track.artist.trim()}\u0000${track.title.trim()}`.normalize('NFKC').toLocaleLowerCase();
    return `track:${metadataKey}`;
  };
  const savePlaylists = () => {
    storeSetting(playlistStorageKey, JSON.stringify(playlists));
    storeSetting(playlistSelectionKey, selectedPlaylistId);
  };
  const loadLyrics = async (track: LibraryTrack) => {
    const requestId = ++lyricRequestId;
    lyricWords = [];
    lyricWordElements = [];
    lyricLineElements = [];
    activeLyricWord = -1;
    activeLyricLine = -2;
    if (lyricHeading) lyricHeading.textContent = `${track.title}${track.artist ? ` · ${track.artist}` : ''}`;
    if (lyricWordList) lyricWordList.replaceChildren();
    if (lyricStatus) lyricStatus.textContent = 'Checking for verified word timings…';
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 25_000);
    try {
      if (!track.duration || !Number.isFinite(track.duration)) throw new Error('Waiting for the track duration before checking lyrics.');
      const query = new URLSearchParams({
        title: track.title,
        artist: track.artist,
        duration: String(Math.round(track.duration)),
        level: 'word',
        strict: 'true',
        format: 'json',
      });
      const response = await fetch(`https://api.lrcmux.dev/get?${query}`, { signal: controller.signal });
      if (requestId !== lyricRequestId) return;
      if (!response.ok) {
        if (response.status === 400 || response.status === 404) throw new Error('No verified word-synchronized lyrics found for this recording.');
        throw new Error(response.status === 429 ? 'Lyrics lookup is rate limited. Try again in a moment.' : `Lyrics lookup failed (${response.status}).`);
      }
      const result = await response.json() as {
        track?: { title?: string; artist?: string; duration?: number };
        meta?: { level?: string; source?: { name?: string } };
        lines?: Array<{ words?: Array<{ text?: string; start?: number; end?: number }> }>;
      };
      const normalizeMatch = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      const exactTitle = !!result.track?.title && normalizeMatch(result.track.title) === normalizeMatch(track.title);
      const exactArtist = !!result.track?.artist && normalizeMatch(result.track.artist) === normalizeMatch(track.artist);
      const exactDuration = typeof result.track?.duration === 'number' && Math.abs(result.track.duration - track.duration) <= 2;
      if (!exactTitle || !exactArtist || !exactDuration || result.meta?.level !== 'word') {
        throw new Error('No exact, word-synchronized lyrics match was found for this recording.');
      }
      lyricWords = (result.lines ?? []).flatMap((line, lineIndex) => (line.words ?? []).map((word) => ({
        text: word.text ?? '',
        start: typeof word.start === 'number' ? word.start / 1000 : Number.NaN,
        end: typeof word.end === 'number' ? word.end / 1000 : Number.NaN,
        line: lineIndex,
      }))).filter((word) => word.text.length > 0 && Number.isFinite(word.start) && Number.isFinite(word.end) && word.end > word.start);
      if (!lyricWords.length) throw new Error('The word timing data for this track is incomplete.');
      if (lyricWordList) {
        const fragment = document.createDocumentFragment();
        let lineElement: HTMLParagraphElement | null = null;
        let previousLine = -1;
        lyricWords.forEach((word, index) => {
          if (word.line !== previousLine) {
            lineElement = document.createElement('p');
            lineElement.className = 'lyrics-line';
            fragment.append(lineElement);
            previousLine = word.line;
            lyricLineElements[word.line] = lineElement;
          }
          const element = document.createElement('span');
          element.className = 'lyrics-word';
          element.textContent = word.text;
          lineElement?.append(element);
          lyricWordElements[index] = element;
        });
        lyricWordList.replaceChildren(fragment);
      }
      if (lyricStatus) lyricStatus.textContent = '';
      updateLyrics(audio?.currentTime ?? 0);
    } catch (error) {
      if (requestId !== lyricRequestId) return;
      lyricWords = [];
      lyricWordElements = [];
      lyricLineElements = [];
      activeLyricLine = -2;
      if (lyricWordList) lyricWordList.replaceChildren();
      if (lyricStatus) lyricStatus.textContent = error instanceof Error && error.name === 'AbortError' ? 'Lyrics lookup timed out.' : String(error).replace(/^Error: /, '');
    } finally {
      window.clearTimeout(timeout);
    }
  };
  const updateLyrics = (time: number) => {
    let nextActive = -1;
    let latestStarted = -1;
    for (let index = 0; index < lyricWords.length; index += 1) {
      if (time >= lyricWords[index].start) latestStarted = index;
      if (time >= lyricWords[index].start && time < lyricWords[index].end) { nextActive = index; break; }
    }
    const focusWord = nextActive >= 0 ? nextActive : latestStarted;
    const nextLine = focusWord >= 0 ? lyricWords[focusWord].line : -1;
    const wordChanged = nextActive !== activeLyricWord;
    if (!wordChanged && nextLine === activeLyricLine) return;
    activeLyricWord = nextActive;
    if (wordChanged) {
      lyricWordElements.forEach((element, index) => {
        element.classList.toggle('is-active', index === nextActive);
        element.classList.toggle('is-past', nextActive >= 0 && index < nextActive);
      });
    }
    if (nextLine !== activeLyricLine) {
      activeLyricLine = nextLine;
      lyricLineElements.forEach((element, lineIndex) => {
        const distance = nextLine >= 0 ? Math.abs(lineIndex - nextLine) : lineIndex + 1;
        element.style.filter = `blur(${Math.min(distance * 0.9, 4)}px)`;
        element.style.opacity = String(Math.max(0.2, 1 - distance * 0.18));
        element.style.transform = `scale(${Math.max(0.94, 1 - distance * 0.015)})`;
        element.classList.toggle('is-current', lineIndex === nextLine);
      });
      if (nextLine >= 0) lyricLineElements[nextLine]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };
  let streamingSearchQuery = '';
  let streamingSearchStatus = '';
  let streamingSearchResults: StreamingSearchTrack[] = [];
  let streamingSearchTimer = 0;
  let streamingSearchRequest = 0;

  const visualizerCanvas = document.getElementById('artwork-visualizer') as HTMLCanvasElement | null;
  const visualizerContext = visualizerCanvas?.getContext('2d') ?? null;
  let audioContext: AudioContext | null = null;
  let audioAnalyser: AnalyserNode | null = null;
  let audioAnalyserSource: MediaElementAudioSourceNode | null = null;
  let visualizerMonitor: HTMLAudioElement | null = null;
  let visualizerMute: GainNode | null = null;
  let visualizerSamples: Uint8Array<ArrayBuffer> | null = null;
  let visualizerFrame = 0;
  let visualizerColor = { red: 240, green: 243, blue: 250 };
  const visualizerPointCount = 160;
  const visualizerLevels = new Float32Array(visualizerPointCount);
  const visualizerPoints: Array<[number, number]> = Array.from({ length: visualizerPointCount }, () => [0, 0]);

  const drawArtworkVisualizer = () => {
    if (!visualizerCanvas || !visualizerContext) return;
    const rect = visualizerCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const pixelRatio = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(rect.width * pixelRatio);
    const pixelHeight = Math.round(rect.height * pixelRatio);
    if (visualizerCanvas.width !== pixelWidth || visualizerCanvas.height !== pixelHeight) {
      visualizerCanvas.width = pixelWidth;
      visualizerCanvas.height = pixelHeight;
    }
    visualizerContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    visualizerContext.clearRect(0, 0, rect.width, rect.height);
    visualizerContext.lineCap = 'round';
    const artworkRect = visualizerCanvas.parentElement?.getBoundingClientRect();
    if (!artworkRect?.width || !artworkRect.height) return;
    const left = (rect.width - artworkRect.width) / 2;
    const top = (rect.height - artworkRect.height) / 2;
    const right = rect.width - left;
    const bottom = rect.height - top;
    const artworkCorner = Number.parseFloat(getComputedStyle(artwork!).borderTopLeftRadius) || 22;
    const corner = Math.min(artworkCorner, (right - left) / 2, (bottom - top) / 2);
    const horizontal = right - left - corner * 2;
    const vertical = bottom - top - corner * 2;
    const arcLength = (Math.PI * corner) / 2;
    const perimeter = 2 * horizontal + 2 * vertical + 4 * arcLength;
    const count = visualizerPointCount;
    const pointOnRoundedRect = (distance: number): [number, number, number, number] => {
      let d = distance % perimeter;
      if (d < horizontal) return [left + corner + d, top, 0, -1];
      d -= horizontal;
      if (d < arcLength) {
        const angle = -Math.PI / 2 + d / corner;
        return [right - corner + Math.cos(angle) * corner, top + corner + Math.sin(angle) * corner, Math.cos(angle), Math.sin(angle)];
      }
      d -= arcLength;
      if (d < vertical) return [right, top + corner + d, 1, 0];
      d -= vertical;
      if (d < arcLength) {
        const angle = d / corner;
        return [right - corner + Math.cos(angle) * corner, bottom - corner + Math.sin(angle) * corner, Math.cos(angle), Math.sin(angle)];
      }
      d -= arcLength;
      if (d < horizontal) return [right - corner - d, bottom, 0, 1];
      d -= horizontal;
      if (d < arcLength) {
        const angle = Math.PI / 2 + d / corner;
        return [left + corner + Math.cos(angle) * corner, bottom - corner + Math.sin(angle) * corner, Math.cos(angle), Math.sin(angle)];
      }
      d -= arcLength;
      if (d < vertical) return [left, bottom - corner - d, -1, 0];
      d -= vertical;
      const angle = Math.PI + d / corner;
      return [left + corner + Math.cos(angle) * corner, top + corner + Math.sin(angle) * corner, Math.cos(angle), Math.sin(angle)];
    };
    let lowBandEnergy = 0;
    if (!audio?.paused && visualizerSamples?.length) {
      const lowBandCount = Math.min(96, visualizerSamples.length);
      for (let bin = 0; bin < lowBandCount; bin++) lowBandEnergy += visualizerSamples[bin] ?? 0;
      lowBandEnergy = Math.pow((lowBandEnergy / lowBandCount) / 255, 0.62);
    }
    for (let index = 0; index < count; index++) {
      let localEnergy = 0;
      if (!audio?.paused && visualizerSamples?.length) {
        const position = (index / count) ** 1.15;
        const firstBin = Math.floor(position * visualizerSamples.length * 0.68);
        const binCount = Math.min(12, visualizerSamples.length - firstBin);
        for (let bin = 0; bin < binCount; bin++) localEnergy += visualizerSamples[firstBin + bin] ?? 0;
        localEnergy = Math.pow((localEnergy / Math.max(1, binCount)) / 255, 0.78);
      }
      const targetLevel = Math.min(0.82, localEnergy * 0.62 + lowBandEnergy * 0.38);
      const smoothing = targetLevel > visualizerLevels[index] ? 0.13 : 0.08;
      visualizerLevels[index] += (targetLevel - visualizerLevels[index]) * smoothing;
    }
    for (let index = 0; index < count; index++) {
      let neighborhood = 0;
      for (let offset = -4; offset <= 4; offset++) {
        const weight = 5 - Math.abs(offset);
        neighborhood += visualizerLevels[(index + offset + count) % count] * weight;
      }
      const level = neighborhood / 25;
      const [x, y, nx, ny] = pointOnRoundedRect((index / count) * perimeter);
      const distance = 4 + level * 13;
      visualizerPoints[index][0] = x + nx * distance;
      visualizerPoints[index][1] = y + ny * distance;
    }
    visualizerContext.beginPath();
    for (let index = 0; index < count; index++) {
      const current = visualizerPoints[index];
      const next = visualizerPoints[(index + 1) % count];
      if (index === 0) visualizerContext.moveTo((visualizerPoints[count - 1][0] + current[0]) / 2, (visualizerPoints[count - 1][1] + current[1]) / 2);
      visualizerContext.quadraticCurveTo(current[0], current[1], (current[0] + next[0]) / 2, (current[1] + next[1]) / 2);
    }
    visualizerContext.closePath();
    visualizerContext.strokeStyle = `rgba(${visualizerColor.red}, ${visualizerColor.green}, ${visualizerColor.blue}, 0.82)`;
    visualizerContext.lineWidth = 2;
    visualizerContext.shadowColor = `rgba(${visualizerColor.red}, ${visualizerColor.green}, ${visualizerColor.blue}, 0.3)`;
    visualizerContext.shadowBlur = 4;
    visualizerContext.stroke();
    visualizerContext.shadowBlur = 0;
  };
  const animateArtworkVisualizer = () => {
    if (!audio || audio.paused || !visualizerMonitor || visualizerMonitor.paused || !audioAnalyser || !visualizerSamples) {
      visualizerFrame = 0;
      return;
    }
    audioAnalyser.getByteFrequencyData(visualizerSamples);
    drawArtworkVisualizer();
    visualizerFrame = requestAnimationFrame(animateArtworkVisualizer);
  };
  const startArtworkVisualizer = async () => {
    if (!audio) return;
    try {
      if (!audioAnalyser) {
        visualizerMonitor = new Audio();
        visualizerMonitor.preload = 'auto';
        visualizerMonitor.crossOrigin = 'anonymous';
        visualizerMonitor.playbackRate = audio.playbackRate;
        visualizerMonitor.src = audio.currentSrc || audio.src;
        audioContext = new AudioContext();
        audioAnalyser = audioContext.createAnalyser();
        audioAnalyser.fftSize = 1024;
        audioAnalyser.minDecibels = -88;
        audioAnalyser.maxDecibels = -20;
        audioAnalyser.smoothingTimeConstant = 0.74;
        audioAnalyserSource = audioContext.createMediaElementSource(visualizerMonitor);
        audioAnalyserSource.connect(audioAnalyser);
        visualizerMute = audioContext.createGain();
        // Keep the analysis graph active while making the second, monitor-only stream inaudible.
        visualizerMute.gain.value = 0.0001;
        audioAnalyser.connect(visualizerMute);
        visualizerMute.connect(audioContext.destination);
        visualizerSamples = new Uint8Array(audioAnalyser.frequencyBinCount);
      }
      if (visualizerMonitor && visualizerMonitor.src !== (audio.currentSrc || audio.src)) {
        visualizerMonitor.src = audio.currentSrc || audio.src;
        visualizerMonitor.load();
      }
      const resumeContext = audioContext?.resume() ?? Promise.resolve();
      let playMonitor: Promise<void> = Promise.resolve();
      if (visualizerMonitor) {
        visualizerMonitor.playbackRate = audio.playbackRate;
        if (visualizerMonitor.readyState >= HTMLMediaElement.HAVE_METADATA) {
          visualizerMonitor.currentTime = audio.currentTime;
        }
        if (visualizerMonitor.paused) playMonitor = visualizerMonitor.play();
      }
      await Promise.all([resumeContext, playMonitor]);
    } catch (error) {
      console.error('Could not start the audio visualizer:', error);
      return;
    }
    if (!visualizerFrame) visualizerFrame = requestAnimationFrame(animateArtworkVisualizer);
  };
  drawArtworkVisualizer();
  if (visualizerCanvas && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => drawArtworkVisualizer()).observe(visualizerCanvas);
  }

  const setIdleBackground = () => {
    document.body.style.removeProperty('--album-cover');
    document.body.style.removeProperty('--album-glow');
    document.body.classList.remove('has-album-cover');
  };

  const lookupItunesArtwork = async (artistName: string, titleName: string): Promise<string | undefined> => {
    const term = `${artistName} ${titleName}`.trim();
    if (!term) return undefined;
    try {
      const params = new URLSearchParams({ term, entity: 'song', limit: '1' });
      const response = await fetch(`https://itunes.apple.com/search?${params}`);
      if (!response.ok) return undefined;
      const result = await response.json() as { results?: Array<{ artworkUrl100?: string }> };
      const artworkUrl = result.results?.[0]?.artworkUrl100;
      return artworkUrl?.replace(/\d+x\d+bb/, '1200x1200bb') ?? artworkUrl;
    } catch {
      return undefined;
    }
  };

  const applyTrackArtwork = (coverUrl: string) => {
    if (!artwork || !audio) return;
    artwork.textContent = '';
    artwork.style.backgroundImage = `url("${coverUrl}")`;
    artwork.classList.add('has-artwork');
    audio.dataset.cover = coverUrl;
    if (!audio.paused) applyAmbientCover(coverUrl);
  };

  const applyAmbientCover = (coverUrl: string) => {
    document.body.style.setProperty('--album-cover', `url("${coverUrl}")`);
    document.body.classList.add('has-album-cover');
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 24;
        canvas.height = 24;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let red = 0;
        let green = 0;
        let blue = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          red += pixels[i];
          green += pixels[i + 1];
          blue += pixels[i + 2];
        }
        const count = pixels.length / 4;
        const averageRed = Math.round(red / count);
        const averageGreen = Math.round(green / count);
        const averageBlue = Math.round(blue / count);
        visualizerColor = {
          red: Math.round(averageRed * 0.68 + 255 * 0.32),
          green: Math.round(averageGreen * 0.68 + 255 * 0.32),
          blue: Math.round(averageBlue * 0.68 + 255 * 0.32),
        };
        if (ambientArtworkGlow) {
          document.body.style.setProperty('--album-glow', `rgba(${averageRed}, ${averageGreen}, ${averageBlue}, 0.55)`);
        } else {
          document.body.style.removeProperty('--album-glow');
        }
        drawArtworkVisualizer();
      } catch {
        document.body.style.removeProperty('--album-glow');
      }
    };
    image.src = coverUrl;
  };

  const formatDuration = (duration?: number) => duration == null || !Number.isFinite(duration)
    ? ''
    : `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}`;

  const updateSeekVisual = (progress: number) => {
    if (!seekWavePath || !seekWaveProgress || !seekWaveDot) return;
    try {
      const amount = Math.max(0, Math.min(100, progress)) / 100;
      if (!seekWaveLength) seekWaveLength = seekWavePath.getTotalLength();
      const point = seekWavePath.getPointAtLength(seekWaveLength * amount);
      if (!seekWaveProgress.style.strokeDasharray) seekWaveProgress.style.strokeDasharray = String(seekWaveLength);
      seekWaveProgress.style.strokeDashoffset = String(seekWaveLength * (1 - amount));
      if (seekControlWidth && seekControlHeight) {
        seekWaveDot.style.left = '0';
        seekWaveDot.style.top = '0';
        seekWaveDot.style.transform = `translate3d(${point.x / 1000 * seekControlWidth}px, ${point.y / 48 * seekControlHeight}px, 0) translate(-50%, -50%)`;
      } else {
        seekWaveDot.style.left = `${point.x / 1000 * 100}%`;
        seekWaveDot.style.top = `${point.y / 48 * 100}%`;
      }
    } catch {
      // The range input remains usable if SVG geometry is temporarily unavailable.
    }
  };
  let seekAnimationFrame = 0;
  let estimatedPlaybackTime = 0;
  let seekFrameTime = 0;
  const animateSeekProgress = (frameTime: number) => {
    if (!audio || !seek || audio.paused || !Number.isFinite(audio.duration) || audio.duration <= 0) {
      seekAnimationFrame = 0;
      return;
    }
    if (!seekFrameTime) {
      estimatedPlaybackTime = audio.currentTime;
    } else {
      estimatedPlaybackTime += ((frameTime - seekFrameTime) / 1000) * audio.playbackRate;
      // Correct clock drift gradually so media timeupdate ticks never jerk the dot.
      estimatedPlaybackTime += (audio.currentTime - estimatedPlaybackTime) * 0.08;
    }
    seekFrameTime = frameTime;
    estimatedPlaybackTime = Math.max(0, Math.min(audio.duration, estimatedPlaybackTime));
    updateLyrics(estimatedPlaybackTime);
    const progress = (estimatedPlaybackTime / audio.duration) * 100;
    if (!seek.matches(':active')) seek.value = String(progress);
    updateSeekVisual(seek.matches(':active') ? Number(seek.value) : progress);
    seekAnimationFrame = requestAnimationFrame(animateSeekProgress);
  };
  updateSeekVisual(0);

  const readFileDuration = (file: File): Promise<number | undefined> => new Promise((resolve) => {
    const probe = document.createElement('audio');
    const source = URL.createObjectURL(file);
    let settled = false;
    const finish = (duration?: number) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      probe.removeAttribute('src');
      probe.load();
      URL.revokeObjectURL(source);
      resolve(duration);
    };
    const timeout = window.setTimeout(() => finish(), 10000);
    probe.preload = 'metadata';
    probe.addEventListener('loadedmetadata', () => finish(Number.isFinite(probe.duration) ? probe.duration : undefined), { once: true });
    probe.addEventListener('error', () => finish(), { once: true });
    probe.src = source;
  });

  const findEmbeddedCover = async (file: File): Promise<string | undefined> => {
    const extension = file.name.toLowerCase();
    if (!extension.endsWith('.mp3')) {
      if (!extension.endsWith('.m4a') && !extension.endsWith('.mp4')) return undefined;
      const scanMp4Atoms = (bytes: Uint8Array) => {
        const readUint32 = (offset: number) => ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
        for (let i = 4; i + 16 < bytes.length; i++) {
          if (bytes[i] !== 99 || bytes[i + 1] !== 111 || bytes[i + 2] !== 118 || bytes[i + 3] !== 114) continue;
          const atomStart = i + 4;
          const atomSize = readUint32(atomStart);
          if (bytes[atomStart + 4] !== 100 || bytes[atomStart + 5] !== 97 || bytes[atomStart + 6] !== 116 || bytes[atomStart + 7] !== 97 || atomSize < 16) continue;
          const imageStart = atomStart + 16;
          const imageEnd = Math.min(atomStart + atomSize, bytes.length);
          if (imageEnd <= imageStart) continue;
          const imageKind = readUint32(atomStart + 8);
          const mime = imageKind === 14 ? 'image/png' : 'image/jpeg';
          return URL.createObjectURL(new Blob([bytes.slice(imageStart, imageEnd)], { type: mime }));
        }
        return undefined;
      };
      const windowSize = 16 * 1024 * 1024;
      const headCover = scanMp4Atoms(new Uint8Array(await file.slice(0, windowSize).arrayBuffer()));
      if (headCover) return headCover;
      const tailStart = Math.max(0, file.size - windowSize);
      if (tailStart > 0) return scanMp4Atoms(new Uint8Array(await file.slice(tailStart).arrayBuffer()));
      return undefined;
    }
    const bytes = new Uint8Array(await file.slice(0, 16 * 1024 * 1024).arrayBuffer());
    if (String.fromCharCode(...bytes.slice(0, 3)) !== 'ID3') return undefined;
    const version = bytes[3];
    const tagSize = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
    let offset = 10;
    const end = Math.min(offset + tagSize, bytes.length);
    while (offset + 10 <= end) {
      const frameId = String.fromCharCode(...bytes.slice(offset, offset + 4));
      if (!/^[A-Z0-9]{4}$/.test(frameId)) break;
      const frameSize = version === 4
        ? ((bytes[offset + 4] & 0x7f) << 21) | ((bytes[offset + 5] & 0x7f) << 14) | ((bytes[offset + 6] & 0x7f) << 7) | (bytes[offset + 7] & 0x7f)
        : (bytes[offset + 4] * 0x1000000) + (bytes[offset + 5] << 16) + (bytes[offset + 6] << 8) + bytes[offset + 7];
      if (frameSize <= 0 || offset + 10 + frameSize > end) break;
      if (frameId === 'APIC') {
        const frame = bytes.slice(offset + 10, offset + 10 + frameSize);
        const encoding = frame[0];
        let cursor = 1;
        while (cursor < frame.length && frame[cursor] !== 0) cursor++;
        const mime = new TextDecoder().decode(frame.slice(1, cursor)) || 'image/jpeg';
        cursor += 2; // MIME terminator and picture type
        if (encoding === 1 || encoding === 2) {
          while (cursor + 1 < frame.length && (frame[cursor] !== 0 || frame[cursor + 1] !== 0)) cursor += 2;
          cursor += 2;
        } else {
          while (cursor < frame.length && frame[cursor] !== 0) cursor++;
          cursor++;
        }
        if (cursor < frame.length) return URL.createObjectURL(new Blob([frame.slice(cursor)], { type: mime }));
      }
      offset += 10 + frameSize;
    }
    return undefined;
  };

  const selectTrack = async (index: number, playlistId: string | null = null) => {
    if (!audio || !tracks.length) return;
    activePlaybackPlaylistId = playlistId;
    currentTrack = (index + tracks.length) % tracks.length;
    const track = tracks[currentTrack];
    refreshDiscordPresence(true);
    setIdleBackground();
    if (seek) seek.value = '0';
    updateSeekVisual(0);
    audio.src = track.file ? URL.createObjectURL(track.file) : convertFileSrc(track.path!);
    if (title) title.textContent = track.title;
    if (artist) artist.textContent = [track.artist || 'LOCAL AUDIO', formatDuration(track.duration)].filter(Boolean).join(' · ');
    if (artwork) {
      artwork.textContent = 'Loading artwork...';
      artwork.style.removeProperty('background-image');
      artwork.classList.remove('has-artwork');
    }
    delete audio.dataset.cover;
    const selectedIndex = currentTrack;
    void ensureTrackArtwork(track).then((coverUrl) => {
      renderLibrary();
      if (coverUrl && currentTrack === selectedIndex) applyTrackArtwork(coverUrl);
      else if (!coverUrl && currentTrack === selectedIndex && artwork) artwork.textContent = '';
    });
    void startArtworkVisualizer();
    await audio.play().catch((error: unknown) => console.error('Could not play audio:', error));
  };

  const renderLibrary = () => {
    const libraryHeading = document.getElementById('library-heading');
    const libraryPlaylistClear = document.getElementById('library-playlist-clear') as HTMLButtonElement | null;
    const libraryPlaylist = playlists.find((playlist) => playlist.id === libraryPlaylistId);
    if (libraryHeading) libraryHeading.textContent = libraryPlaylist?.name ?? 'Library';
    if (libraryPlaylistClear) libraryPlaylistClear.hidden = !libraryPlaylist;
    const makeTrackButton = (track: LibraryTrack, index: number) => {
      const card = document.createElement('div');
      card.className = `library-track${track.downloadStatus ? ` is-${track.downloadStatus}` : ''}`;
      const cover = document.createElement('span');
      cover.className = 'library-track-cover';
      cover.setAttribute('aria-hidden', 'true');
      const coverUrl = track.artworkDataUrl ?? track.artworkUrl;
      if (coverUrl) { cover.style.backgroundImage = `url("${coverUrl}")`; cover.classList.add('has-cover'); }
      else cover.textContent = '?';
      const label = document.createElement('span');
      label.className = 'library-track-label';
      label.textContent = track.title;
      const byline = document.createElement('span');
      byline.className = 'library-track-artist';
      byline.textContent = track.artist;
      const info = document.createElement('span');
      info.className = 'library-track-info';
      info.append(label, byline);
      const duration = document.createElement('span');
      duration.className = 'library-track-duration';
      duration.textContent = track.downloadStatus === 'queued' ? 'Queued' : track.downloadStatus === 'downloading' ? 'Downloading' : track.downloadStatus === 'failed' ? 'Failed' : formatDuration(track.duration);
      const main = document.createElement('button');
      main.type = 'button';
      main.className = 'library-track-main';
      main.setAttribute('aria-label', track.artist ? `${track.title} by ${track.artist}` : track.title);
      main.disabled = !!track.downloadStatus;
      main.append(cover, info, duration);
      if (!track.downloadStatus) main.addEventListener('click', () => void selectTrack(index, libraryPlaylistId));
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'library-track-action';
      if (track.downloadStatus === 'queued' || track.downloadStatus === 'downloading') {
        action.classList.add('is-busy'); action.disabled = true;
        action.setAttribute('aria-label', track.downloadStatus === 'queued' ? 'Download queued' : 'Downloading');
        const spinner = document.createElement('span'); spinner.className = 'library-download-spinner'; action.append(spinner);
      } else if (track.downloadStatus === 'failed') {
        action.classList.add('is-retry'); action.setAttribute('aria-label', 'Retry download');
        action.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 6a5.5 5.5 0 1 0 1 3M13 2v4h-4" /></svg>';
        action.addEventListener('click', () => { if (track.spotifyTrack) enqueueSpotifyDownload(track.spotifyTrack, track.downloadProvider ?? 'youtube-music', track); });
      } else {
        action.classList.add('is-play'); action.setAttribute('aria-label', 'Play track');
        action.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" /></svg>';
        action.addEventListener('click', () => void selectTrack(index, libraryPlaylistId));
      }
      card.append(main, action);
      return card;
    };
    const filter = libraryFilter?.value.trim().toLowerCase() ?? '';
    const visibleTracks = tracks.map((track, index) => ({ track, index }))
      .filter(({ track }) => (!libraryPlaylist || libraryPlaylist.trackIds.includes(playlistTrackId(track)))
        && (!filter || `${track.title} ${track.artist}`.toLowerCase().includes(filter)));
    if (library) {
      const content: HTMLElement[] = visibleTracks.map(({ track, index }) => makeTrackButton(track, index));
      if (!libraryPlaylist && streamingSearchQuery.length >= 2) {
        const section = document.createElement('section');
        section.className = 'streaming-search-section';
        const heading = document.createElement('div');
        heading.className = 'streaming-search-heading';
        heading.textContent = 'Streaming services';
        const status = document.createElement('p');
        status.className = 'streaming-search-status';
        status.textContent = streamingSearchStatus;
        status.setAttribute('aria-live', 'polite');
        status.classList.toggle('is-loading', streamingSearchStatus.startsWith('Searching'));
        section.append(heading, status);
        streamingSearchResults.forEach((result) => {
          const card = document.createElement('article');
          card.className = 'streaming-search-result';
          const cover = document.createElement('span');
          cover.className = 'streaming-search-cover';
          if (result.artwork_url) cover.style.backgroundImage = `url("${result.artwork_url}")`;
          const info = document.createElement('span');
          info.className = 'streaming-search-info';
          const title = document.createElement('strong');
          title.textContent = result.title;
          const byline = document.createElement('span');
          const serviceName = result.provider === 'spotify' ? 'Spotify' : result.provider === 'soundcloud' ? 'SoundCloud' : 'YouTube Music / YouTube';
          byline.textContent = result.artists || serviceName;
          const service = document.createElement('span');
          service.className = 'streaming-search-service';
          service.textContent = serviceName;
          info.append(title, byline, service);
          const add = document.createElement('button');
          add.type = 'button';
          add.className = 'streaming-search-add';
          add.textContent = '+';
          add.setAttribute('aria-label', `Add ${result.title} from ${serviceName} to the library`);
          add.addEventListener('click', () => enqueueSpotifyDownload({
            title: result.title,
            artists: result.artists,
            spotify_url: result.spotify_url ?? '',
            source_url: result.source_url || undefined,
            artwork_url: result.artwork_url,
            duration: result.duration,
          }, result.provider === 'spotify' ? defaultAudioSource : result.provider));
          card.append(cover, info, add);
          section.append(card);
        });
        content.push(section);
      }
      library.replaceChildren(...content);
    }
    if (queueList) queueList.replaceChildren(...tracks.map(makeTrackButton));
    renderPlaylists();
  };

  const searchStreamingServices = (query: string) => {
    streamingSearchQuery = query.trim();
    streamingSearchResults = [];
        streamingSearchStatus = streamingSearchQuery.length >= 2 ? 'Searching Spotify, YouTube Music, and SoundCloud…' : '';
    window.clearTimeout(streamingSearchTimer);
    const request = ++streamingSearchRequest;
    renderLibrary();
    if (streamingSearchQuery.length < 2) return;
    const queryToSearch = streamingSearchQuery;
    streamingSearchTimer = window.setTimeout(() => {
      void invoke<StreamingSearchTrack[]>('search_streaming_services', { query: queryToSearch }).then((results) => {
        if (request !== streamingSearchRequest || libraryFilter?.value.trim() !== queryToSearch) return;
        streamingSearchResults = results;
        streamingSearchStatus = results.length ? `Found ${results.length} songs across Spotify, YouTube, and SoundCloud.` : 'No streaming results found.';
        renderLibrary();
      }).catch((error: unknown) => {
        if (request !== streamingSearchRequest || libraryFilter?.value.trim() !== queryToSearch) return;
        streamingSearchStatus = String(error);
        renderLibrary();
      });
    }, 500);
  };

  const renderPlaylists = () => {
    const collection = document.getElementById('playlist-collection');
    const selectedName = document.getElementById('playlist-selected-name');
    const trackCount = document.getElementById('playlist-track-count');
    const trackPicker = document.getElementById('playlist-track-picker') as HTMLSelectElement | null;
    const addTrackButton = document.getElementById('add-track-to-playlist') as HTMLButtonElement | null;
    const deleteButton = document.getElementById('delete-playlist') as HTMLButtonElement | null;
    const playlistTracks = document.getElementById('playlist-tracks');
    if (!collection || !playlistTracks) return;
    if (!playlists.some((playlist) => playlist.id === selectedPlaylistId)) selectedPlaylistId = playlists[0]?.id ?? '';
    const selected = playlists.find((playlist) => playlist.id === selectedPlaylistId);
    collection.replaceChildren();
    if (!playlists.length) {
      const empty = document.createElement('p');
      empty.className = 'playlist-empty';
      empty.textContent = 'Create a playlist to get started.';
      collection.append(empty);
    }
    playlists.forEach((playlist) => {
      const choice = document.createElement('div');
      choice.className = `playlist-choice${playlist.id === selectedPlaylistId ? ' is-active' : ''}`;
      const details = document.createElement('button');
      details.type = 'button';
      details.className = 'playlist-choice-info';
      const name = document.createElement('span');
      name.textContent = playlist.name;
      const count = document.createElement('span');
      count.textContent = String(playlist.trackIds.length);
      details.append(name, count);
      details.setAttribute('aria-pressed', String(playlist.id === selectedPlaylistId));
      details.addEventListener('click', () => {
        selectedPlaylistId = playlist.id;
        savePlaylists();
        renderPlaylists();
      });
      const select = document.createElement('button');
      select.type = 'button';
      select.className = 'playlist-choice-select';
      select.setAttribute('aria-label', `Show ${playlist.name} in Library`);
      select.title = `Show ${playlist.name} in Library`;
      select.addEventListener('click', () => {
        selectedPlaylistId = playlist.id;
        libraryPlaylistId = playlist.id;
        activePlaybackPlaylistId = playlist.id;
        savePlaylists();
        renderPlaylists();
        renderLibrary();
        document.querySelector<HTMLButtonElement>('.source-option[data-view="library"]')?.click();
      });
      choice.append(details, select);
      collection.append(choice);
    });
    if (selectedName) selectedName.textContent = selected?.name ?? 'Select a playlist';
    if (trackCount) trackCount.textContent = selected ? `${selected.trackIds.length} ${selected.trackIds.length === 1 ? 'track' : 'tracks'}` : 'Choose a playlist or create one.';
    if (deleteButton) deleteButton.disabled = !selected;
    if (trackPicker) {
      const previousValue = trackPicker.value;
      trackPicker.replaceChildren(new Option('Choose a track from your library', ''));
      tracks.forEach((track) => {
        const id = playlistTrackId(track);
        const option = new Option(`${track.title}${track.artist ? ` - ${track.artist}` : ''}`, id);
        option.disabled = !!track.downloadStatus || !!selected?.trackIds.includes(id);
        trackPicker.add(option);
      });
      trackPicker.value = [...trackPicker.options].some((option) => option.value === previousValue && !option.disabled) ? previousValue : '';
      trackPicker.disabled = !selected || tracks.length === 0;
      if (addTrackButton) addTrackButton.disabled = !selected || !trackPicker.value;
    }
    playlistTracks.replaceChildren();
    if (!selected) return;
    if (!selected.trackIds.length) {
      const empty = document.createElement('p');
      empty.className = 'playlist-empty';
      empty.textContent = 'Add tracks from your library to this playlist.';
      playlistTracks.append(empty);
      return;
    }
    selected.trackIds.forEach((id, playlistIndex) => {
      const trackIndex = tracks.findIndex((track) => playlistTrackId(track) === id);
      const row = document.createElement('div');
      row.className = 'playlist-track-row';
      if (trackIndex < 0) {
        const missing = document.createElement('span');
        missing.className = 'playlist-track-unavailable';
        missing.textContent = 'Track unavailable. Re-import the local file to restore it.';
        row.append(missing);
      } else {
        const track = tracks[trackIndex];
        const play = document.createElement('button');
        play.type = 'button';
        play.className = 'playlist-track-play';
        play.disabled = !!track.downloadStatus || !(track.file || track.path);
        const label = document.createElement('span');
        label.textContent = track.artist ? `${track.title} - ${track.artist}` : track.title;
        const duration = document.createElement('span');
        duration.textContent = track.duration ? formatDuration(track.duration) : '';
        play.append(label, duration);
        play.addEventListener('click', () => void selectTrack(trackIndex, selected.id));
        row.append(play);
      }
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'playlist-track-remove';
      remove.textContent = '−';
      remove.setAttribute('aria-label', `Remove track ${playlistIndex + 1} from ${selected.name}`);
      remove.addEventListener('click', () => {
        selected.trackIds.splice(playlistIndex, 1);
        savePlaylists();
        renderPlaylists();
        renderLibrary();
      });
      row.append(remove);
      playlistTracks.append(row);
    });
  };
  const playlistNameInput = document.getElementById('playlist-name-input') as HTMLInputElement | null;
  document.getElementById('playlist-create-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = playlistNameInput?.value.trim();
    if (!name) { playlistNameInput?.focus(); return; }
    const existing = playlists.find((playlist) => playlist.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing) {
      selectedPlaylistId = existing.id;
    } else {
      const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      playlists.push({ id, name, trackIds: [] });
      selectedPlaylistId = id;
    }
    if (playlistNameInput) playlistNameInput.value = '';
    savePlaylists();
    renderPlaylists();
  });
  document.getElementById('delete-playlist')?.addEventListener('click', () => {
    const index = playlists.findIndex((playlist) => playlist.id === selectedPlaylistId);
    if (index < 0) return;
    const deletedPlaylistId = playlists[index].id;
    playlists.splice(index, 1);
    selectedPlaylistId = playlists[Math.min(index, playlists.length - 1)]?.id ?? '';
    if (libraryPlaylistId === deletedPlaylistId) libraryPlaylistId = null;
    if (activePlaybackPlaylistId && !playlists.some((playlist) => playlist.id === activePlaybackPlaylistId)) activePlaybackPlaylistId = null;
    savePlaylists();
    renderPlaylists();
    renderLibrary();
  });
  const playlistTrackPicker = document.getElementById('playlist-track-picker') as HTMLSelectElement | null;
  playlistTrackPicker?.addEventListener('change', renderPlaylists);
  document.getElementById('add-track-to-playlist')?.addEventListener('click', () => {
    const playlist = playlists.find((item) => item.id === selectedPlaylistId);
    const track = tracks.find((item) => playlistTrackId(item) === playlistTrackPicker?.value);
    if (!playlist || !track) return;
    const id = playlistTrackId(track);
    if (!playlist.trackIds.includes(id)) playlist.trackIds.push(id);
    savePlaylists();
    renderPlaylists();
    renderLibrary();
  });
  document.getElementById('library-playlist-clear')?.addEventListener('click', () => {
    libraryPlaylistId = null;
    activePlaybackPlaylistId = null;
    renderLibrary();
  });
  renderPlaylists();

  const ensureTrackArtwork = (track: LibraryTrack): Promise<string | undefined> => {
    if (track.artworkDataUrl) return Promise.resolve(track.artworkDataUrl);
    if (track.artworkUrl) return Promise.resolve(track.artworkUrl);
    if (!track.artworkPromise) {
      track.artworkPromise = (async () => {
        const embedded = track.file ? await findEmbeddedCover(track.file) : undefined;
        if (embedded) {
          track.artworkDataUrl = embedded;
          return embedded;
        }
        const fallback = await lookupItunesArtwork(track.artist, track.title);
        if (fallback) track.artworkUrl = fallback;
        return fallback;
      })();
    }
    return track.artworkPromise!;
  };

  const normalizeTrackText = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

  const addDownloadedTrack = (downloaded: DownloadedTrack, spotifyArtworkUrl?: string) => {
    const downloadedTitle = normalizeTrackText(downloaded.title);
    const downloadedArtist = normalizeTrackText(downloaded.artist);
    const existing = tracks.findIndex((track) => track.path === downloaded.path || (
      downloadedTitle.length > 0
      && downloadedArtist.length > 0
      && normalizeTrackText(track.title) === downloadedTitle
      && normalizeTrackText(track.artist) === downloadedArtist
    ));
    const track: LibraryTrack = {
      name: downloaded.path.split(/[\\/]/).pop() ?? downloaded.title,
      title: downloaded.title,
      artist: downloaded.artist,
      path: downloaded.path,
      artworkDataUrl: downloaded.artwork_data_url,
      artworkUrl: downloaded.artwork_url ?? spotifyArtworkUrl,
      duration: downloaded.duration,
    };
    if (existing >= 0) {
      tracks[existing] = track;
      return existing;
    }
    tracks.push(track);
    return tracks.length - 1;
  };

  type DownloadTask = {
    track: LibraryTrack;
    source: SpotifyTrack;
    provider: string;
    finish: (success: boolean) => void;
  };
  const downloadQueue: DownloadTask[] = [];
  const pendingDownloads = new Map<LibraryTrack, Promise<boolean>>();
  let downloadWorkerRunning = false;
  const enqueueSpotifyDownload = async (source: SpotifyTrack, provider: string, existingTrack?: LibraryTrack, keepSettingsOpen = false) => {
    await restoreDownloadedTracks;
    const sourceKey = normalizeTrackText(`${source.artists}${source.title}`);
    const existing = existingTrack ?? tracks.find((item) => (source.spotify_url && item.spotifyTrack?.spotify_url === source.spotify_url) || (!item.file && sourceKey.length > 0 && normalizeTrackText(`${item.artist}${item.title}`) === sourceKey));
    if (existing) {
      const pending = pendingDownloads.get(existing);
      if (pending) return pending;
      if (!existing.downloadStatus && existing.path) return true;
    }
    const track: LibraryTrack = existing ?? { name: source.title, title: source.title, artist: source.artists, artworkUrl: source.artwork_url, duration: source.duration, spotifyTrack: source, downloadProvider: provider, downloadStatus: 'queued' };
    track.spotifyTrack = source;
    track.downloadProvider = provider;
    track.downloadStatus = 'queued';
    if (!existing) tracks.push(track);
    const completion = new Promise<boolean>((finish) => {
      downloadQueue.push({ track, source, provider, finish });
    });
    pendingDownloads.set(track, completion);
    renderLibrary();
    if (!keepSettingsOpen) closeSettings();
    void runDownloadQueue();
    return completion;
  };
  const runDownloadQueue = async () => {
    if (downloadWorkerRunning) return;
    downloadWorkerRunning = true;
    try {
      while (downloadQueue.length) {
        const task = downloadQueue.shift()!;
        task.track.downloadStatus = 'downloading';
        renderLibrary();
        try {
          const previousPlaylistTrackId = playlistTrackId(task.track);
          const downloaded = await invoke<DownloadedTrack>('download_spotify_track', {
            query: `${task.source.artists} - ${task.source.title}`.trim().replace(/^ - /, ''),
            provider: task.provider,
            spotifyUrl: task.source.spotify_url,
            sourceUrl: task.source.source_url ?? null,
            audioFormat,
          });
          Object.assign(task.track, {
            name: downloaded.path.split(/[\\/]/).pop() ?? downloaded.title,
            title: downloaded.title || task.source.title,
            artist: downloaded.artist || task.source.artists,
            path: downloaded.path,
            duration: downloaded.duration,
            artworkDataUrl: downloaded.artwork_data_url,
            artworkUrl: downloaded.artwork_url ?? task.source.artwork_url,
            downloadStatus: undefined,
          });
          const nextPlaylistTrackId = playlistTrackId(task.track);
          if (previousPlaylistTrackId !== nextPlaylistTrackId) {
            for (const playlist of playlists) {
              playlist.trackIds = playlist.trackIds.map((id) => id === previousPlaylistTrackId ? nextPlaylistTrackId : id);
            }
            savePlaylists();
          }
          void ensureTrackArtwork(task.track).then(() => renderLibrary());
        } catch (error) {
          console.error(`Could not download ${task.source.title}:`, error);
          task.track.downloadStatus = 'failed';
        } finally {
          pendingDownloads.delete(task.track);
          task.finish(task.track.downloadStatus !== 'failed');
        }
        renderLibrary();
      }
    } finally {
      downloadWorkerRunning = false;
      if (downloadQueue.length) void runDownloadQueue();
    }
  };
  clearDownloadsButton?.addEventListener('click', () => {
    if (!clearDownloadsButton || clearDownloadsButton.disabled) return;
    void (async () => {
      clearDownloadsButton.disabled = true;
      clearDownloadsButton.textContent = 'Clearing...';
      if (storageStatus) storageStatus.textContent = 'Removing saved audio files...';
      const activeTrack = tracks[currentTrack];
      if (activeTrack?.path && audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        currentTrack = -1;
        setIdleBackground();
      }
      try {
        const removed = await invoke<number>('clear_downloaded_tracks');
        tracks = tracks.filter((track) => !track.path);
        if (activeTrack && !activeTrack.path) currentTrack = tracks.indexOf(activeTrack);
        if (activeTrack?.path) {
          if (title) title.textContent = 'Nothing playing';
          if (artist) artist.textContent = 'LOCAL AUDIO';
          if (artwork) {
            artwork.textContent = 'Artwork appears here';
            artwork.style.removeProperty('background-image');
            artwork.classList.remove('has-artwork');
          }
        }
        renderLibrary();
        if (storageStatus) storageStatus.textContent = `Cleared ${removed} downloaded ${removed === 1 ? 'song' : 'songs'}.`;
      } catch (error) {
        if (storageStatus) storageStatus.textContent = `Could not clear downloads: ${String(error)}`;
      } finally {
        clearDownloadsButton.disabled = false;
        clearDownloadsButton.textContent = 'Clear downloaded songs';
      }
    })();
  });

  downloadAllButton?.addEventListener('click', async () => {
    if (downloadAllButton.disabled || clearDownloadsButton?.disabled || loadedSpotifyTracks.length < 2) return;
    const playlist = [...loadedSpotifyTracks];
    const provider = defaultAudioSource;
    downloadAllButton.disabled = true;
    if (spotifySearch) spotifySearch.disabled = true;
    if (clearDownloadsButton) clearDownloadsButton.disabled = true;
    let imported = 0;
    try {
      for (const [index, track] of playlist.entries()) {
        if (searchStatus) searchStatus.textContent = `Importing track ${index + 1} of ${playlist.length}…`;
        if (await enqueueSpotifyDownload(track, provider, undefined, true)) imported += 1;
      }
      const skipped = playlist.length - imported;
      if (searchStatus) searchStatus.textContent = `Imported ${imported} of ${playlist.length} tracks. ${skipped} skipped.`;
    } finally {
      downloadAllButton.disabled = false;
      if (spotifySearch) spotifySearch.disabled = false;
      if (clearDownloadsButton) clearDownloadsButton.disabled = false;
    }
  });
  importButton?.addEventListener('click', () => filePicker?.click());
  document.getElementById('toggle-library-search')?.addEventListener('click', () => {
    if (!libraryFilter) return;
    const opening = libraryFilter.hidden;
    libraryFilter.hidden = !opening;
    document.getElementById('toggle-library-search')?.setAttribute('aria-expanded', String(opening));
    if (opening) libraryFilter.focus();
    else {
      libraryFilter.value = '';
      searchStreamingServices('');
    }
  });
  libraryFilter?.addEventListener('input', () => searchStreamingServices(libraryFilter.value));
  filePicker?.addEventListener('change', () => {
    const firstImportedIndex = tracks.length;
    const importedTracks = [...(filePicker.files ?? [])]
      .filter((file) => !tracks.some((track) => track.file && track.file.name === file.name && track.file.size === file.size))
      .map((file) => {
        const name = file.name.replace(/\.[^.]+$/, '');
        const separator = name.indexOf(' - ');
        return {
          name: file.name,
          title: separator >= 0 ? name.slice(separator + 3) : name,
          artist: separator >= 0 ? name.slice(0, separator) : '',
          file,
        };
      });
    tracks.push(...importedTracks);
    renderLibrary();
    tracks.forEach((track, index) => {
      if (track.file) {
        void readFileDuration(track.file).then((duration) => {
          track.duration = duration;
          renderLibrary();
          if (currentTrack === index && artist) {
            artist.textContent = [track.artist || 'LOCAL AUDIO', formatDuration(duration)].filter(Boolean).join(' Â· ');
          }
        });
      }
      void ensureTrackArtwork(track).then((coverUrl) => {
        renderLibrary();
        if (coverUrl && currentTrack === index) applyTrackArtwork(coverUrl);
      });
    });
    if (importedTracks.length) void selectTrack(firstImportedIndex);
  });
  playButton?.addEventListener('click', () => {
    if (!audio) return;
    if (audio.paused) {
      if (currentTrack < 0 && tracks.length) void selectTrack(0);
      else {
        void startArtworkVisualizer();
        void audio.play().catch((error: unknown) => console.error('Could not play audio:', error));
      }
    } else audio.pause();
  });
  const advancePlayback = (direction: -1 | 1) => {
    const playlist = playlists.find((item) => item.id === activePlaybackPlaylistId);
    if (playlist) {
      const playableIndices = playlist.trackIds
        .map((id) => tracks.findIndex((track) => playlistTrackId(track) === id))
        .filter((index) => index >= 0 && !!(tracks[index].file || tracks[index].path) && !tracks[index].downloadStatus);
      if (playableIndices.length) {
        const position = playableIndices.indexOf(currentTrack);
        const nextPosition = position < 0 ? 0 : (position + direction + playableIndices.length) % playableIndices.length;
        void selectTrack(playableIndices[nextPosition], playlist.id);
        return;
      }
    }
    void selectTrack(currentTrack + direction);
  };
  document.getElementById('previous-track')?.addEventListener('click', () => advancePlayback(-1));
  document.getElementById('next-track')?.addEventListener('click', () => advancePlayback(1));
  audio?.addEventListener('playing', () => {
    refreshDiscordPresence(true);
    setPlaybackButton(true);
    document.querySelector('.main-pane')?.classList.add('is-playing');
    void startArtworkVisualizer();
    const cover = audio.dataset.cover;
    if (cover) applyAmbientCover(cover);
    if (!seekAnimationFrame) {
      estimatedPlaybackTime = audio.currentTime;
      seekFrameTime = 0;
      seekAnimationFrame = requestAnimationFrame(animateSeekProgress);
    }
  });
  audio?.addEventListener('pause', () => {
    refreshDiscordPresence(false);
    setPlaybackButton(false);
    document.querySelector('.main-pane')?.classList.remove('is-playing');
    visualizerMonitor?.pause();
    if (visualizerFrame) cancelAnimationFrame(visualizerFrame);
    visualizerFrame = 0;
    visualizerLevels.fill(0);
    drawArtworkVisualizer();
    if (seekAnimationFrame) cancelAnimationFrame(seekAnimationFrame);
    seekAnimationFrame = 0;
    seekFrameTime = 0;
    if (audio.duration && seek) updateSeekVisual((audio.currentTime / audio.duration) * 100);
  });
  audio?.addEventListener('volumechange', () => {
    if (volumeSlider) volumeSlider.value = String(audio.volume);
  });
  audio?.addEventListener('ended', () => advancePlayback(1));
  audio?.addEventListener('loadedmetadata', () => {
    const activeTrack = tracks[currentTrack];
    if (activeTrack && Number.isFinite(audio.duration) && audio.duration > 0) {
      activeTrack.duration = audio.duration;
      void loadLyrics(activeTrack);
    }
    if (audio.duration && seek) {
      estimatedPlaybackTime = audio.currentTime;
      seekFrameTime = 0;
      const progress = (audio.currentTime / audio.duration) * 100;
      seek.value = String(progress);
      updateSeekVisual(progress);
    }
  });
  audio?.addEventListener('timeupdate', () => {
    if (!seekAnimationFrame || audio.paused) updateLyrics(audio.currentTime);
    if (audio.duration && seek) {
      const progress = (audio.currentTime / audio.duration) * 100;
      if (!seek.matches(':active')) seek.value = String(progress);
      if (!seekAnimationFrame) updateSeekVisual(seek.matches(':active') ? Number(seek.value) : progress);
    }
    if (visualizerMonitor && !visualizerMonitor.paused && Math.abs(visualizerMonitor.currentTime - audio.currentTime) > 0.5) {
      try { visualizerMonitor.currentTime = audio.currentTime; } catch { /* Wait for the monitor media to become seekable. */ }
    }
  });
  seek?.addEventListener('input', () => {
    const progress = Number(seek.value);
    if (audio) estimatedPlaybackTime = (progress / 100) * audio.duration;
    if (audio) updateLyrics(audio.currentTime);
    updateSeekVisual(progress);
    if (audio?.duration) {
      audio.currentTime = (progress / 100) * audio.duration;
      if (visualizerMonitor?.readyState && visualizerMonitor.readyState >= HTMLMediaElement.HAVE_METADATA) {
        try { visualizerMonitor.currentTime = audio.currentTime; } catch { /* Wait for the monitor media to become seekable. */ }
      }
    }
  });
  audio?.addEventListener('seeked', () => refreshDiscordPresence(!!audio && !audio.paused));

  const restoreDownloadedTracks = invoke<DownloadedTrack[]>('list_downloaded_tracks').then((savedTracks) => {
    let changed = false;
    for (const savedTrack of savedTracks) {
      if (!tracks.some((track) => track.path === savedTrack.path)) {
        const index = addDownloadedTrack(savedTrack);
        void ensureTrackArtwork(tracks[index]).then(() => renderLibrary());
        changed = true;
      }
    }
    if (changed) renderLibrary();
  }).catch((error: unknown) => console.error('Could not restore downloaded tracks:', error));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeControls, { once: true });
} else {
  initializeControls();
}
