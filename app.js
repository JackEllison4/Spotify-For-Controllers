/**
 * Spotify For Controllers - Main Application Controller
 * Universal: Works both as a Web App (in any browser) and as an Electron Desktop App
 */

const PLAYLIST_SORTS = [
  { id: 'default', label: 'Recently Added' },
  { id: 'name-asc', label: 'Name (A–Z)' },
  { id: 'name-desc', label: 'Name (Z–A)' },
  { id: 'tracks-desc', label: 'Most Tracks' },
  { id: 'tracks-asc', label: 'Fewest Tracks' }
];

const ALBUM_SORTS = [
  { id: 'default', label: 'Recently Added' },
  { id: 'name-asc', label: 'Album (A–Z)' },
  { id: 'name-desc', label: 'Album (Z–A)' },
  { id: 'artist-asc', label: 'Artist (A–Z)' },
  { id: 'date-desc', label: 'Release Date (Newest)' },
  { id: 'date-asc', label: 'Release Date (Oldest)' }
];

class AppController {
  constructor() {
    this.screenStack = ['home'];
    this.currentPlayback = null;
    this.currentVolume = 50;
    this.isTrackLiked = false;
    this.pollInterval = null;
    this.isSearchBusy = false;
    this.lastSearchQuery = '';
    this.currentPlaylistContext = null;

    // Playlists state
    this.cachedPlaylists = [];
    this.playlistFilter = 'all'; // 'all' | 'owned'
    this.playlistSort = 'default';
    this.currentUser = null;

    // Saved albums state
    this.cachedAlbums = [];
    this.albumSort = 'default';
    this.totalAlbumsCount = 0;

    // Liked songs state
    this.cachedLikedSongs = [];
    this.totalLikedCount = 0;
  }

  async start() {
    // 1. Initialize UI DOM mappings
    window.uiManager.init();

    // 2. Load configuration: Electron IPC or window.APP_CONFIG
    let config = null;
    if (window.electronAPI && typeof window.electronAPI.getConfig === 'function') {
      try {
        config = await window.electronAPI.getConfig();
      } catch (e) {
        config = null;
      }
    }
    if (!config && typeof window.APP_CONFIG !== 'undefined') {
      config = window.APP_CONFIG;
    }

    // 3. Initialize Spotify API Client
    try {
      await window.spotifyClient.init(config);
    } catch (err) {
      console.warn('Init error (e.g. auth redirect error):', err);
      window.uiManager.showToast(`Login notice: ${err.message}`, 4000);
    }

    // 4. Update login screen hints (Redirect URI and saved Client ID)
    this.setupLoginScreen();

    // 5. Setup listeners
    this.bindControllerEvents();
    this.bindOAuthCallback();
    this.bindSearchInput();
    this.bindMouseAndTouch();
    this.setupDeviceModalListeners();

    // 6. Initial screen selection based on auth status
    if (window.spotifyClient.isAuthenticated()) {
      this.screenStack = ['home'];
      window.uiManager.showScreen('home');
      this.startPlaybackPolling();
      this.loadHomeScreenData();
      this.pollDevices();
    } else {
      this.screenStack = ['login'];
      window.uiManager.showScreen('login');
    }
  }

  setupLoginScreen() {
    const badge = document.getElementById('redirect-uri-badge');
    const saveBtn = document.getElementById('btn-save-client-id');
    const input = document.getElementById('client-id-input');

    if (badge) {
      badge.textContent = window.spotifyClient.getEffectiveRedirectUri();
    }

    const currentId = window.spotifyClient.getClientId();
    if (input && currentId && currentId !== 'YOUR_SPOTIFY_CLIENT_ID_HERE') {
      input.value = currentId;
    }

    // Save & Sign In button (opens auth window)
    if (saveBtn) {
      saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.startSignIn(false);
      });
    }

    // Allow pressing Enter in the Client ID field to submit
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.startSignIn(false);
        }
      });
    }
  }

  async startSignIn(forceBrowser = false) {
    if (this.isSigningIn) return;
    this.isSigningIn = true;

    try {
      const input = document.getElementById('client-id-input');
      const val = input ? input.value.trim() : '';
      if (val) {
        window.spotifyClient.setClientId(val);
      }

      const clientId = window.spotifyClient.getClientId();
      if (!clientId || clientId === 'YOUR_SPOTIFY_CLIENT_ID_HERE') {
        window.uiManager.showToast('Please enter your Spotify Client ID first.');
        if (input) input.focus();
        this.isSigningIn = false;
        return;
      }

      window.uiManager.showLoading();
      window.uiManager.showToast(forceBrowser ? 'Opening Spotify in default browser...' : 'Opening Spotify sign in window...');
      await window.spotifyClient.startAuth(forceBrowser);
    } catch (err) {
      console.error('Sign in error:', err);
      window.uiManager.showToast(`Error: ${err.message}`, 4500);
    } finally {
      this.isSigningIn = false;
      window.uiManager.hideLoading();
    }
  }

  // ==========================================
  // OAuth Deep Link Listener (Electron only)
  // ==========================================
  bindOAuthCallback() {
    if (window.electronAPI && typeof window.electronAPI.onOAuthCallback === 'function') {
      window.electronAPI.onOAuthCallback(async (url) => {
        console.log('Received OAuth callback deep link:', url);
        window.uiManager.showLoading();

        try {
          await window.spotifyClient.handleCallback(url);
          window.uiManager.showToast('✅ Signed in successfully!');
          this.screenStack = ['home'];
          window.uiManager.showScreen('home');
          this.startPlaybackPolling();
          this.loadHomeScreenData();
          this.pollDevices();
        } catch (err) {
          console.error('Login error:', err);
          window.uiManager.showToast(`Login failed: ${err.message}`, 4000);
        } finally {
          window.uiManager.hideLoading();
        }
      });
    }
  }

  // ==========================================
  // Playback Polling Loop
  // ==========================================
  startPlaybackPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);

    this.checkPlayback();

    this.pollInterval = setInterval(() => {
      this.checkPlayback();
    }, 2000);
  }

  async checkPlayback() {
    if (!window.spotifyClient.isAuthenticated()) return;

    try {
      const playback = await window.spotifyClient.getCurrentPlayback();
      this.currentPlayback = playback;

      if (playback && playback.item) {
        if (playback.device) {
          if (typeof playback.device.volume_percent === 'number') {
            this.currentVolume = playback.device.volume_percent;
          }
          window.uiManager.updateDeviceBadge(playback.device);
        }

        window.uiManager.updateNowPlayingBar(playback.item, playback.is_playing, this.currentVolume);

        if (window.uiManager.currentScreen === 'nowPlaying') {
          window.uiManager.updateNowPlayingScreen(playback);
        }

        if (!this.lastTrackId || this.lastTrackId !== playback.item.id) {
          this.lastTrackId = playback.item.id;
          this.checkCurrentTrackLiked(playback.item.id);
        }
      } else {
        window.uiManager.updateNowPlayingBar(null, false, this.currentVolume);
        this.pollDevices();
      }
    } catch (err) {
      // Quiet catch
    }
  }

  async pollDevices() {
    if (!window.spotifyClient.isAuthenticated()) return;
    const now = Date.now();
    if (this.lastDevicePoll && (now - this.lastDevicePoll) < 8000) return;
    this.lastDevicePoll = now;

    try {
      const res = await window.spotifyClient.getDevices();
      const devices = res?.devices || [];
      const active = devices.find((d) => d.is_active);
      window.uiManager.updateDeviceBadge(active || devices[0] || null);
    } catch (e) {
      // Quiet fail
    }
  }

  async checkCurrentTrackLiked(trackId) {
    try {
      const result = await window.spotifyClient.checkSavedTracks([trackId]);
      this.isTrackLiked = Array.isArray(result) && result[0] === true;
      const likedEl = document.getElementById('np-liked');
      if (likedEl) {
        likedEl.textContent = this.isTrackLiked ? '❤️' : '🤍';
      }
    } catch (err) {
      // Ignored
    }
  }

  // ==========================================
  // Screen Navigation Stack
  // ==========================================
  navigateTo(screenName, params = {}) {
    if (window.uiManager.currentScreen === screenName) return;

    this.screenStack.push(screenName);
    window.uiManager.showScreen(screenName);
    this.handleScreenLoad(screenName, params);
  }

  navigateBack() {
    if (window.uiManager.dom.deviceModal && !window.uiManager.dom.deviceModal.classList.contains('hidden')) {
      window.uiManager.hideDeviceModal();
      return;
    }

    if (window.uiManager.isGuideVisible) {
      window.uiManager.toggleGuide(false);
      return;
    }

    if (this.screenStack.length > 1) {
      this.screenStack.pop();
      const prevScreen = this.screenStack[this.screenStack.length - 1];
      window.uiManager.showScreen(prevScreen, true);
    }
  }

  async handleScreenLoad(screenName, params = {}) {
    window.uiManager.showLoading();

    try {
      switch (screenName) {
        case 'home':
          await this.loadHomeScreenData();
          break;

        case 'nowPlaying':
          if (this.currentPlayback) {
            window.uiManager.updateNowPlayingScreen(this.currentPlayback);
          }
          break;

        case 'liked': {
          if (this.cachedLikedSongs.length > 0) {
            window.uiManager.renderLikedSongs(this.cachedLikedSongs, this.totalLikedCount);
          } else {
            window.uiManager.showLoading();
          }

          try {
            const res = await window.spotifyClient.getLikedSongs(50, 0);
            const items = res?.items || [];
            this.totalLikedCount = res?.total ?? items.length;
            this.cachedLikedSongs = items;
            window.uiManager.renderLikedSongs(this.cachedLikedSongs, this.totalLikedCount);

            // Stream remaining pages in background
            if (this.totalLikedCount > 50) {
              (async () => {
                let offset = 50;
                while (offset < this.totalLikedCount && window.uiManager.currentScreen === 'liked') {
                  try {
                    const page = await window.spotifyClient.getLikedSongs(50, offset);
                    if (!page?.items || page.items.length === 0) break;
                    this.cachedLikedSongs = this.cachedLikedSongs.concat(page.items);
                    window.uiManager.renderLikedSongs(this.cachedLikedSongs, this.totalLikedCount);
                    offset += 50;
                    if (offset >= 500) break;
                  } catch (e) {
                    break;
                  }
                }
              })();
            }
          } catch (err) {
            window.uiManager.showToast(this.formatErrorMessage(err), 3500);
          } finally {
            window.uiManager.hideLoading();
          }
          break;
        }

        case 'playlists': {
          if (!this.currentUser) {
            this.currentUser = await window.spotifyClient.getCurrentUser();
          }
          const playlists = await window.spotifyClient.getAllPlaylists();
          this.cachedPlaylists = playlists || [];
          this.applyPlaylistFilterAndSort();
          break;
        }

        case 'playlistDetail': {
          if (params.playlist) {
            this.currentPlaylistContext = params.playlist;
            // Pre-render immediately with metadata to avoid dashes or broken image
            window.uiManager.renderPlaylistDetail(params.playlist, []);
            try {
              const tracksData = await window.spotifyClient.getPlaylistTracks(params.playlist.id, 50);
              window.uiManager.renderPlaylistDetail(params.playlist, tracksData?.items || []);
            } catch (tracksErr) {
              console.error('Failed to load playlist tracks:', tracksErr);
              window.uiManager.showToast(`Error: ${this.formatErrorMessage(tracksErr)}`, 4000);
            }
          }
          break;
        }

        case 'queue': {
          const queueData = await window.spotifyClient.getQueue();
          window.uiManager.renderQueue(queueData);
          break;
        }

        case 'artists': {
          const artistsData = await window.spotifyClient.getTopArtists(50);
          window.uiManager.renderArtists(artistsData?.items || []);
          break;
        }

        case 'artistDetail': {
          if (params.artist) {
            this.currentArtistContext = params.artist;
            // Pre-render immediately with known metadata
            window.uiManager.renderArtistDetail(params.artist, [], []);
            try {
              const [artistData, albumsData, tracksData] = await Promise.allSettled([
                window.spotifyClient.getArtist(params.artist.id),
                window.spotifyClient.getArtistAlbums(params.artist.id, 20),
                window.spotifyClient.getArtistTopTracks(params.artist.id, params.artist.name)
              ]);
              const artist = artistData.status === 'fulfilled' ? artistData.value : params.artist;
              const albums = albumsData.status === 'fulfilled' ? (albumsData.value?.items || []) : [];
              const tracks = tracksData.status === 'fulfilled' ? (tracksData.value?.tracks?.items || tracksData.value?.tracks || tracksData.value?.items || []) : [];
              window.uiManager.renderArtistDetail(artist, tracks, albums);
            } catch (err) {
              console.error('Failed to load artist detail:', err);
              window.uiManager.showToast(`Error: ${this.formatErrorMessage(err)}`, 3500);
            }
          }
          break;
        }

        case 'albums': {
          const initial = await window.spotifyClient.getSavedAlbums(50, 0);
          const firstItems = initial?.items || [];
          this.totalAlbumsCount = initial?.total || firstItems.length;
          this.cachedAlbums = [...firstItems];
          this.applyAlbumSort();

          if (this.totalAlbumsCount > firstItems.length) {
            (async () => {
              let offset = 50;
              while (offset < this.totalAlbumsCount) {
                if (window.uiManager.currentScreen !== 'albums') break;
                const batch = await window.spotifyClient.getSavedAlbums(50, offset);
                if (!batch?.items || batch.items.length === 0) break;
                this.cachedAlbums = this.cachedAlbums.concat(batch.items);
                offset += 50;
                if (window.uiManager.currentScreen === 'albums') {
                  this.applyAlbumSort();
                }
              }
            })().catch((err) => console.warn('Background album loading error:', err));
          }
          break;
        }

        case 'search': {
          const input = document.getElementById('search-input');
          if (input) {
            setTimeout(() => input.focus(), 100);
          }
          break;
        }
      }
    } catch (err) {
      console.error(`Error loading screen ${screenName}:`, err);
      window.uiManager.showToast(`Error: ${this.formatErrorMessage(err)}`, 3500);
    } finally {
      window.uiManager.hideLoading();
    }
  }

  async loadHomeScreenData() {
    try {
      // 1. Fetch recent history, user playlists, saved albums, and top artists in parallel
      const [recentRes, playlistsRes, albumsRes, artistsRes] = await Promise.allSettled([
        window.spotifyClient.getRecentlyPlayed(30),
        window.spotifyClient.getAllPlaylists(),
        window.spotifyClient.getSavedAlbums(15),
        window.spotifyClient.getTopArtists(15)
      ]);

      const recentItems = recentRes.status === 'fulfilled' && recentRes.value?.items ? recentRes.value.items : [];
      const userPlaylists = playlistsRes.status === 'fulfilled' && Array.isArray(playlistsRes.value) ? playlistsRes.value : [];
      const savedAlbums = albumsRes.status === 'fulfilled' && albumsRes.value?.items ? albumsRes.value.items : [];
      const topArtists = artistsRes.status === 'fulfilled' && artistsRes.value?.items ? artistsRes.value.items : [];

      const jumpBackInItems = [];
      const seenUris = new Set();

      // Quick lookup map for user playlists by URI and ID
      const playlistMap = new Map();
      userPlaylists.forEach((p) => {
        if (p.uri) playlistMap.set(p.uri, p);
        if (p.id) playlistMap.set(p.id, p);
      });

      // Quick lookup map for artists by ID
      const artistMap = new Map();
      topArtists.forEach((a) => {
        if (a.id) artistMap.set(a.id, a);
      });

      // A) Extract containers (Playlists, Albums, Artists) from recently-played history
      for (const item of recentItems) {
        if (jumpBackInItems.length >= 8) break;

        // 1. Playlist context if user was listening inside a playlist
        if (item.context && item.context.type === 'playlist' && item.context.uri) {
          const pUri = item.context.uri;
          if (!seenUris.has(pUri)) {
            seenUris.add(pUri);
            const pId = pUri.split(':')[2];
            const matched = playlistMap.get(pUri) || playlistMap.get(pId);
            jumpBackInItems.push({
              type: 'playlist',
              id: pId,
              uri: pUri,
              name: matched?.name || 'Recent Playlist',
              subtitle: matched ? `${matched.items?.total ?? matched.tracks?.total ?? ''} tracks` : 'Playlist',
              imageUrl: matched?.images?.[0]?.url || item.track?.album?.images?.[0]?.url || ''
            });
          }
        }

        // 2. Album from track (albums played recently)
        const album = item.track?.album;
        if (album && album.id && album.uri && !seenUris.has(album.uri)) {
          seenUris.add(album.uri);
          jumpBackInItems.push({
            type: 'album',
            id: album.id,
            uri: album.uri,
            name: album.name,
            subtitle: album.artists?.[0]?.name || '',
            imageUrl: album.images?.[0]?.url || ''
          });
        }

        // 3. Artist from track
        const artist = item.track?.artists?.[0];
        if (artist && artist.id && artist.uri && !seenUris.has(artist.uri)) {
          seenUris.add(artist.uri);
          const matchedArtist = artistMap.get(artist.id);
          jumpBackInItems.push({
            type: 'artist',
            id: artist.id,
            uri: artist.uri,
            name: artist.name,
            subtitle: 'Artist',
            imageUrl: matchedArtist?.images?.[0]?.url || ''
          });
        }
      }

      // B) Backfill if we have fewer than 8 items using user playlists, saved albums, and top artists
      if (jumpBackInItems.length < 8) {
        for (const p of userPlaylists) {
          if (jumpBackInItems.length >= 8) break;
          if (p.uri && !seenUris.has(p.uri)) {
            seenUris.add(p.uri);
            jumpBackInItems.push({
              type: 'playlist',
              id: p.id,
              uri: p.uri,
              name: p.name,
              subtitle: `${p.items?.total ?? p.tracks?.total ?? ''} tracks`,
              imageUrl: p.images?.[0]?.url || ''
            });
          }
        }
      }

      if (jumpBackInItems.length < 8) {
        for (const aItem of savedAlbums) {
          if (jumpBackInItems.length >= 8) break;
          const album = aItem.album || aItem;
          if (album && album.uri && !seenUris.has(album.uri)) {
            seenUris.add(album.uri);
            jumpBackInItems.push({
              type: 'album',
              id: album.id,
              uri: album.uri,
              name: album.name,
              subtitle: album.artists?.[0]?.name || '',
              imageUrl: album.images?.[0]?.url || ''
            });
          }
        }
      }

      if (jumpBackInItems.length < 8) {
        for (const art of topArtists) {
          if (jumpBackInItems.length >= 8) break;
          if (art.uri && !seenUris.has(art.uri)) {
            seenUris.add(art.uri);
            jumpBackInItems.push({
              type: 'artist',
              id: art.id,
              uri: art.uri,
              name: art.name,
              subtitle: 'Artist',
              imageUrl: art.images?.[0]?.url || ''
            });
          }
        }
      }

      window.uiManager.renderHomeRecentlyPlayed(jumpBackInItems.slice(0, 8));
    } catch (err) {
      console.warn('Failed to load Jump Back In:', err);
    }
  }

  formatErrorMessage(err) {
    if (!err) return 'Unknown error';
    const msg = err.message || '';
    if (msg.includes('No active device') || msg.includes('Player command failed') || err.status === 404) {
      return 'No active Spotify player found. Launch Spotify on your PC or phone first.';
    }
    if (
      msg.toLowerCase().includes('premium required') ||
      err.details?.error?.reason === 'PREMIUM_REQUIRED'
    ) {
      return 'Spotify Premium is required for remote playback control.';
    }
    if (err.status === 403) {
      return msg || 'Access denied (403 Forbidden). Spotify endpoint or permission restricted.';
    }
    return msg || (err.status ? `Request failed (${err.status})` : 'Spotify API error');
  }

  // ==========================================
  // Controller Event Binding
  // ==========================================
  bindControllerEvents() {
    // Confirm (A)
    window.addEventListener('action:confirm', () => this.handleActionConfirm());

    // Back (B)
    window.addEventListener('action:back', () => this.navigateBack());

    // Like (X)
    window.addEventListener('action:like', () => this.handleActionLike());

    // Shuffle (Y)
    window.addEventListener('action:shuffle', () => this.handleActionShuffle());

    // Previous Track (LB)
    window.addEventListener('action:previous', () => this.handleActionPrevious());

    // Next Track (RB)
    window.addEventListener('action:next', () => this.handleActionNext());

    // Volume Triggers (LT & RT)
    window.addEventListener('action:volumeDown', () => this.adjustVolume(-5));
    window.addEventListener('action:volumeUp', () => this.adjustVolume(5));

    // Controller Guide / View (Select)
    window.addEventListener('action:queue', () => {
      window.uiManager.toggleGuide();
    });

    // Jump to Search (Start)
    window.addEventListener('action:search', () => {
      this.navigateTo('search');
    });

    // Analog Stick (Right Stick & Left Stick in vertical lists) smooth scrolling
    window.addEventListener('scroll:page', (e) => {
      const screenEl = window.uiManager.getActiveScreenElement();
      if (!screenEl || !e.detail?.deltaY) return;

      const isScrollable = screenEl.scrollHeight > screenEl.clientHeight + 15;
      if (isScrollable) {
        screenEl.scrollTop += e.detail.deltaY;
        window.uiManager.keepFocusVisibleOnScroll();
      } else {
        // If list is too short to scroll, allow left stick to step through items
        if (e.detail.source === 'leftStick' && Math.abs(e.detail.axisY || 0) > 0.45) {
          const now = Date.now();
          if (!this._stickStepTime || now - this._stickStepTime > 190) {
            this._stickStepTime = now;
            const dir = (e.detail.axisY || 0) > 0 ? 'down' : 'up';
            window.uiManager.navigateDirection(dir);
          }
        }
      }
    });

    // Directional Navigation
    window.addEventListener('nav:up', () => this.handleDirectionalNav('up'));
    window.addEventListener('nav:down', () => this.handleDirectionalNav('down'));
    window.addEventListener('nav:left', () => this.handleDirectionalNav('left'));
    window.addEventListener('nav:right', () => this.handleDirectionalNav('right'));
  }

  handleDirectionalNav(direction) {
    window.uiManager.navigateDirection(direction);
  }

  async handleActionConfirm(itemOverride = null) {
    // If device modal is open, handle clicks/selection inside it
    if (window.uiManager.dom.deviceModal && !window.uiManager.dom.deviceModal.classList.contains('hidden')) {
      const modalItem = itemOverride || window.uiManager.getSelectedItem();
      if (!modalItem) return;

      const deviceId = modalItem.dataset?.deviceId || modalItem.closest('.device-item')?.dataset?.deviceId;
      if (deviceId) {
        await this.activateDevice(deviceId);
        return;
      }
      if (modalItem.id === 'btn-refresh-devices') {
        await this.showDevicePicker();
        return;
      }
      if (modalItem.id === 'btn-open-spotify-app') {
        this.openSpotifyApp();
        return;
      }
      if (modalItem.id === 'btn-open-web-player') {
        this.openWebPlayer();
        return;
      }
      if (modalItem.id === 'btn-close-device-modal') {
        window.uiManager.hideDeviceModal();
        return;
      }
      return;
    }

    const screen = window.uiManager.currentScreen;
    const selectedItem = itemOverride || window.uiManager.getSelectedItem();

    // 1. Login Screen
    if (screen === 'login') {
      await this.startSignIn(false);
      return;
    }

    // 2. Now Playing Screen -> Toggle Play / Pause
    if (screen === 'nowPlaying') {
      await this.togglePlayPause();
      return;
    }

    // 3. Search input enter
    if (screen === 'search' && selectedItem && selectedItem.tagName === 'INPUT') {
      this.executeSearch(selectedItem.value);
      return;
    }

    if (!selectedItem) return;

    // 4. Home Screen Menu Item or Recent Track
    if (screen === 'home') {
      const targetScreen = selectedItem.dataset.screen;
      if (targetScreen) {
        if (targetScreen === 'devices') {
          await this.showDevicePicker();
          return;
        }
        if (targetScreen === 'signout') {
          await window.spotifyClient.clearTokens();
          this.currentUser = null;
          this.cachedPlaylists = [];
          this.cachedAlbums = [];
          window.uiManager.showToast('Signed out.');
          this.screenStack = ['login'];
          window.uiManager.showScreen('login');
          return;
        }
        this.navigateTo(targetScreen);
        return;
      }

      // Jump Back In cards (Playlists, Albums, Artists)
      const itemType = selectedItem.dataset.type;
      const itemUri = selectedItem.dataset.uri;
      const itemId = selectedItem.dataset.id;
      const itemName = selectedItem.querySelector('.grid-card-title')?.textContent || '';
      const itemImg = selectedItem.querySelector('.grid-card-art')?.src || '';

      if (itemType === 'playlist') {
        this.navigateTo('playlistDetail', {
          playlist: {
            id: itemId,
            name: itemName,
            uri: itemUri,
            images: [{ url: itemImg }]
          }
        });
        return;
      }

      if (itemType === 'album') {
        if (itemUri) {
          window.uiManager.showToast(`▶ Playing album: ${itemName}`);
          await this.playContext(itemUri);
        }
        return;
      }

      if (itemType === 'artist') {
        this.navigateTo('artistDetail', {
          artist: {
            id: itemId,
            name: itemName,
            images: [{ url: itemImg }]
          }
        });
        return;
      }

      if (itemUri) {
        await this.playTrack(itemUri);
        return;
      }
    }

    // 5. Playlists Screen
    if (screen === 'playlists') {
      const playlistId = selectedItem.dataset.id;
      const playlistName = selectedItem.querySelector('.item-title')?.textContent || 'Playlist';
      const playlistImg = selectedItem.querySelector('.item-art')?.src || '';
      const playlistUri = selectedItem.dataset.uri;
      const subtitleText = selectedItem.querySelector('.item-subtitle')?.textContent || '';
      const trackMatch = subtitleText.match(/^(\d+)\s+tracks/);
      const trackTotal = trackMatch ? parseInt(trackMatch[1], 10) : undefined;

      this.navigateTo('playlistDetail', {
        playlist: {
          id: playlistId,
          name: playlistName,
          uri: playlistUri,
          images: [{ url: playlistImg }],
          items: trackTotal !== undefined ? { total: trackTotal } : undefined
        }
      });
      return;
    }

    // 6. Playlist Detail Screen
    if (screen === 'playlistDetail') {
      const trackUri = selectedItem.dataset.uri;
      const contextUri = selectedItem.dataset.contextUri;
      const trackIndex = parseInt(selectedItem.dataset.index, 10);

      if (contextUri && !isNaN(trackIndex)) {
        await this.playContext(contextUri, trackIndex);
      } else if (trackUri) {
        await this.playTrack(trackUri);
      }
      return;
    }

    // 6b. Liked Songs Screen
    if (screen === 'liked') {
      const trackUri = selectedItem.dataset.uri;
      const trackIndex = parseInt(selectedItem.dataset.index, 10);
      if (trackUri) {
        window.uiManager.showToast('▶ Playing liked songs...');
        window.uiManager.showLoading();
        try {
          let playedWithContext = false;
          if (!this.currentUser) {
            this.currentUser = await window.spotifyClient.getCurrentUser();
          }
          if (this.currentUser?.id) {
            try {
              await window.spotifyClient.play(`spotify:user:${this.currentUser.id}:collection`, undefined, { uri: trackUri });
              playedWithContext = true;
            } catch (e) {
              playedWithContext = false;
            }
          }

          if (!playedWithContext) {
            const uris = this.cachedLikedSongs
              .map((item) => (item.track || item).uri)
              .filter(Boolean);
            const startIdx = !isNaN(trackIndex) && trackIndex >= 0 ? trackIndex : uris.indexOf(trackUri);
            const slice = startIdx !== -1 ? uris.slice(startIdx, startIdx + 80) : [trackUri];
            await window.spotifyClient.play(undefined, slice);
          }

          setTimeout(() => this.checkPlayback(), 500);
        } catch (err) {
          this.handlePlaybackError(err);
        } finally {
          window.uiManager.hideLoading();
        }
      }
      return;
    }

    // 7. Search Screen
    if (screen === 'search') {
      const type = selectedItem.dataset.type;
      const uri = selectedItem.dataset.uri;
      if (type === 'track') {
        await this.playTrack(uri);
      } else if (type === 'album') {
        await this.playContext(uri);
      }
      return;
    }

    // 8. Queue Screen
    if (screen === 'queue') {
      const isCurrent = selectedItem.dataset.isCurrent === 'true';
      if (isCurrent) {
        await this.togglePlayPause();
        return;
      }

      const queueIndexStr = selectedItem.dataset.queueIndex;
      const trackUri = selectedItem.dataset.uri;
      const trackName = selectedItem.querySelector('.item-title')?.textContent || 'Song';

      if (queueIndexStr !== undefined && queueIndexStr !== '') {
        const queueIndex = parseInt(queueIndexStr, 10);
        window.uiManager.showToast(`⏭ Skipping to ${trackName}...`);
        window.uiManager.showLoading();

        try {
          let jumpedWithContext = false;
          if (this.currentPlayback?.context?.uri) {
            try {
              await window.spotifyClient.play(this.currentPlayback.context.uri, undefined, { uri: trackUri });
              jumpedWithContext = true;
            } catch (e) {
              jumpedWithContext = false;
            }
          }

          if (!jumpedWithContext) {
            const skips = Math.min(queueIndex + 1, 10);
            for (let i = 0; i < skips; i++) {
              await window.spotifyClient.nextTrack();
              if (i < skips - 1) {
                await new Promise((r) => setTimeout(r, 120));
              }
            }
          }

          setTimeout(async () => {
            this.checkPlayback();
            try {
              const queueData = await window.spotifyClient.getQueue();
              window.uiManager.renderQueue(queueData);
            } catch (e) {}
          }, 600);
        } catch (err) {
          this.handlePlaybackError(err);
        } finally {
          window.uiManager.hideLoading();
        }
      }
      return;
    }

    // 9. Artists Screen -> Navigate to Artist Detail Page
    if (screen === 'artists') {
      const artistId = selectedItem.dataset.id;
      const artistName = selectedItem.querySelector('.grid-card-title')?.textContent || 'Artist';
      const artistImg = selectedItem.querySelector('.grid-card-art')?.src || '';
      this.navigateTo('artistDetail', {
        artist: {
          id: artistId,
          name: artistName,
          images: [{ url: artistImg }]
        }
      });
      return;
    }

    // 9b. Artist Detail Screen
    if (screen === 'artistDetail') {
      const type = selectedItem.dataset.type;
      const uri = selectedItem.dataset.uri;
      if (type === 'track') {
        await this.playTrack(uri);
      } else if (type === 'album') {
        await this.playContext(uri);
      }
      return;
    }

    // 10. Albums Screen
    if (screen === 'albums') {
      const albumUri = selectedItem.dataset.uri;
      if (albumUri) {
        await this.playContext(albumUri);
      }
    }
  }

  async togglePlayPause() {
    try {
      if (this.currentPlayback && this.currentPlayback.is_playing) {
        await window.spotifyClient.pause();
        window.uiManager.showToast('⏸ Paused');
      } else {
        await window.spotifyClient.play();
        window.uiManager.showToast('▶ Playing');
      }
      setTimeout(() => this.checkPlayback(), 300);
    } catch (err) {
      this.handlePlaybackError(err);
    }
  }

  async playTrack(uri) {
    try {
      window.uiManager.showToast('▶ Playing song...');
      await window.spotifyClient.play(undefined, [uri]);
      setTimeout(() => this.checkPlayback(), 500);
    } catch (err) {
      this.handlePlaybackError(err);
    }
  }

  async playContext(contextUri, offsetPosition = 0) {
    try {
      window.uiManager.showToast('▶ Starting playback...');
      await window.spotifyClient.play(contextUri, undefined, offsetPosition);
      setTimeout(() => this.checkPlayback(), 500);
    } catch (err) {
      this.handlePlaybackError(err);
    }
  }

  handlePlaybackError(err) {
    console.error('Playback error:', err);
    const msg = this.formatErrorMessage(err);
    window.uiManager.showToast(msg, 4000);
    if (!err) return;
    const errText = (err.message || '') + ' ' + (err.status || '');
    if (err.status === 404 || errText.includes('No active device') || errText.includes('Player command failed')) {
      // Auto-open device picker after brief delay so user can select an active player
      setTimeout(() => {
        this.showDevicePicker();
      }, 700);
    }
  }

  // ==========================================
  // Playlist Filter and Sort Logic
  // ==========================================
  getCurrentPlaylistSort() {
    return PLAYLIST_SORTS.find((s) => s.id === this.playlistSort) || PLAYLIST_SORTS[0];
  }

  applyPlaylistFilterAndSort() {
    if (!this.cachedPlaylists) return;

    let items = [...this.cachedPlaylists];

    // 1. Filter by owner
    if (this.playlistFilter === 'owned') {
      const currentUserId = this.currentUser?.id;
      const currentUserName = this.currentUser?.display_name;
      items = items.filter((p) => {
        if (!p) return false;
        if (currentUserId && p.owner?.id === currentUserId) return true;
        if (currentUserName && p.owner?.display_name === currentUserName) return true;
        return false;
      });
    }

    // 2. Sort
    switch (this.playlistSort) {
      case 'name-asc':
        items.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
        break;
      case 'name-desc':
        items.sort((a, b) => (b.name || '').localeCompare(a.name || '', undefined, { sensitivity: 'base' }));
        break;
      case 'tracks-desc':
        items.sort((a, b) => {
          const aCount = a.items?.total ?? a.tracks?.total ?? 0;
          const bCount = b.items?.total ?? b.tracks?.total ?? 0;
          return bCount - aCount;
        });
        break;
      case 'tracks-asc':
        items.sort((a, b) => {
          const aCount = a.items?.total ?? a.tracks?.total ?? 0;
          const bCount = b.items?.total ?? b.tracks?.total ?? 0;
          return aCount - bCount;
        });
        break;
      case 'default':
      default:
        // Original order
        break;
    }

    const sortObj = this.getCurrentPlaylistSort();
    window.uiManager.renderPlaylists(items, {
      filter: this.playlistFilter,
      sort: this.playlistSort,
      sortLabel: sortObj.label
    });
  }

  cyclePlaylistSort() {
    const curIdx = PLAYLIST_SORTS.findIndex((s) => s.id === this.playlistSort);
    const nextIdx = (curIdx + 1) % PLAYLIST_SORTS.length;
    this.playlistSort = PLAYLIST_SORTS[nextIdx].id;
    const sortObj = PLAYLIST_SORTS[nextIdx];
    this.applyPlaylistFilterAndSort();
    window.uiManager.showToast(`Sort: ${sortObj.label}`);
  }

  setPlaylistFilter(filter) {
    if (this.playlistFilter === filter) return;
    this.playlistFilter = filter;
    this.applyPlaylistFilterAndSort();
    window.uiManager.showToast(filter === 'owned' ? 'Filter: Created by You' : 'Filter: All Playlists');
  }

  togglePlaylistOwnerFilter() {
    const next = this.playlistFilter === 'owned' ? 'all' : 'owned';
    this.setPlaylistFilter(next);
  }

  // ==========================================
  // Album Sort Logic
  // ==========================================
  getCurrentAlbumSort() {
    return ALBUM_SORTS.find((s) => s.id === this.albumSort) || ALBUM_SORTS[0];
  }

  applyAlbumSort() {
    if (!this.cachedAlbums) return;

    let items = [...this.cachedAlbums];

    const getAlbum = (item) => item.album || item;

    switch (this.albumSort) {
      case 'name-asc':
        items.sort((a, b) => (getAlbum(a).name || '').localeCompare(getAlbum(b).name || '', undefined, { sensitivity: 'base' }));
        break;
      case 'name-desc':
        items.sort((a, b) => (getAlbum(b).name || '').localeCompare(getAlbum(a).name || '', undefined, { sensitivity: 'base' }));
        break;
      case 'artist-asc':
        items.sort((a, b) => {
          const artA = getAlbum(a).artists?.[0]?.name || '';
          const artB = getAlbum(b).artists?.[0]?.name || '';
          return artA.localeCompare(artB, undefined, { sensitivity: 'base' });
        });
        break;
      case 'date-desc':
        items.sort((a, b) => {
          const dateA = getAlbum(a).release_date || '';
          const dateB = getAlbum(b).release_date || '';
          return dateB.localeCompare(dateA);
        });
        break;
      case 'date-asc':
        items.sort((a, b) => {
          const dateA = getAlbum(a).release_date || '';
          const dateB = getAlbum(b).release_date || '';
          return dateA.localeCompare(dateB);
        });
        break;
      case 'default':
      default:
        // Original order
        break;
    }

    const sortObj = this.getCurrentAlbumSort();
    window.uiManager.renderAlbums(items, this.totalAlbumsCount, {
      sort: this.albumSort,
      sortLabel: sortObj.label
    });
  }

  cycleAlbumSort() {
    const curIdx = ALBUM_SORTS.findIndex((s) => s.id === this.albumSort);
    const nextIdx = (curIdx + 1) % ALBUM_SORTS.length;
    this.albumSort = ALBUM_SORTS[nextIdx].id;
    const sortObj = ALBUM_SORTS[nextIdx];
    this.applyAlbumSort();
    window.uiManager.showToast(`Sort: ${sortObj.label}`);
  }

  async handleActionLike() {
    const screen = window.uiManager.currentScreen;
    if (screen === 'playlists') {
      this.cyclePlaylistSort();
      return;
    }
    if (screen === 'albums') {
      this.cycleAlbumSort();
      return;
    }

    if (screen === 'liked') {
      const selected = window.uiManager.getSelectedItem();
      const trackId = selected?.dataset?.id;
      if (trackId) {
        try {
          await window.spotifyClient.toggleLike(trackId, true);
          this.cachedLikedSongs = this.cachedLikedSongs.filter(
            (item) => (item.track || item).id !== trackId
          );
          this.totalLikedCount = Math.max(0, this.totalLikedCount - 1);
          window.uiManager.renderLikedSongs(this.cachedLikedSongs, this.totalLikedCount);
          window.uiManager.showToast('💔 Removed from Liked Songs');
        } catch (err) {
          window.uiManager.showToast(this.formatErrorMessage(err), 3000);
        }
        return;
      }
    }

    const trackId = this.currentPlayback?.item?.id;
    if (!trackId) {
      window.uiManager.showToast('No song currently playing to like');
      return;
    }

    try {
      const newStatus = !this.isTrackLiked;
      await window.spotifyClient.toggleLike(trackId, !newStatus);
      this.isTrackLiked = newStatus;

      const likedEl = document.getElementById('np-liked');
      if (likedEl) likedEl.textContent = newStatus ? '❤️' : '🤍';

      window.uiManager.showToast(newStatus ? '❤️ Added to Liked Songs' : '💔 Removed from Liked Songs');
    } catch (err) {
      window.uiManager.showToast(this.formatErrorMessage(err), 3000);
    }
  }

  async handleActionShuffle() {
    const screen = window.uiManager.currentScreen;
    if (screen === 'playlists') {
      this.togglePlaylistOwnerFilter();
      return;
    }

    try {
      const currentShuffle = Boolean(this.currentPlayback?.shuffle_state);
      const nextShuffle = !currentShuffle;
      await window.spotifyClient.setShuffle(nextShuffle);

      if (this.currentPlayback) {
        this.currentPlayback.shuffle_state = nextShuffle;
      }

      const shuffleEl = document.getElementById('np-shuffle-state');
      if (shuffleEl) shuffleEl.textContent = `Shuffle: ${nextShuffle ? 'On' : 'Off'}`;

      window.uiManager.showToast(nextShuffle ? '🔀 Shuffle On' : '➡️ Shuffle Off');
    } catch (err) {
      window.uiManager.showToast(this.formatErrorMessage(err), 3000);
    }
  }

  async handleActionPrevious() {
    try {
      await window.spotifyClient.previousTrack();
      window.uiManager.showToast('⏮ Previous Track');
      setTimeout(() => this.checkPlayback(), 400);
    } catch (err) {
      window.uiManager.showToast(this.formatErrorMessage(err), 3000);
    }
  }

  async handleActionNext() {
    try {
      await window.spotifyClient.nextTrack();
      window.uiManager.showToast('⏭ Next Track');
      setTimeout(() => this.checkPlayback(), 400);
    } catch (err) {
      window.uiManager.showToast(this.formatErrorMessage(err), 3000);
    }
  }

  async adjustVolume(deltaPercent) {
    this.currentVolume = Math.max(0, Math.min(100, this.currentVolume + deltaPercent));

    const volBar = document.getElementById('bar-volume');
    if (volBar) volBar.textContent = `${this.currentVolume}%`;

    const npVol = document.getElementById('np-volume');
    if (npVol) npVol.textContent = `Volume: ${this.currentVolume}%`;

    try {
      await window.spotifyClient.setVolume(this.currentVolume);
    } catch (err) {
      // Ignored for rapid volume adjustments
    }
  }

  // ==========================================
  // Search Input and Keyboard Handling
  // ==========================================
  bindSearchInput() {
    const input = document.getElementById('search-input');
    if (!input) return;

    let debounceTimer = null;

    input.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      const query = e.target.value.trim();

      if (query.length > 1) {
        debounceTimer = setTimeout(() => {
          this.executeSearch(query);
        }, 500);
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(debounceTimer);
        this.executeSearch(input.value.trim());
      }
    });
  }

  async executeSearch(query) {
    if (!query || query === this.lastSearchQuery || this.isSearchBusy) return;

    this.isSearchBusy = true;
    this.lastSearchQuery = query;
    window.uiManager.showLoading();

    try {
      const results = await window.spotifyClient.search(query);
      window.uiManager.renderSearchResults(results);
    } catch (err) {
      window.uiManager.showToast(this.formatErrorMessage(err), 3500);
    } finally {
      this.isSearchBusy = false;
      window.uiManager.hideLoading();
    }
  }

  // ==========================================
  // Mouse, Touch and Interactive UI Binding
  // ==========================================
  setupDeviceModalListeners() {
    const { btnCloseDeviceModal, btnRefreshDevices, btnOpenSpotifyApp, btnOpenWebPlayer } = window.uiManager.dom;
    if (btnCloseDeviceModal) {
      btnCloseDeviceModal.addEventListener('click', () => window.uiManager.hideDeviceModal());
    }
    if (btnRefreshDevices) {
      btnRefreshDevices.addEventListener('click', () => this.showDevicePicker());
    }
    if (btnOpenSpotifyApp) {
      btnOpenSpotifyApp.addEventListener('click', () => this.openSpotifyApp());
    }
    if (btnOpenWebPlayer) {
      btnOpenWebPlayer.addEventListener('click', () => this.openWebPlayer());
    }
  }

  bindMouseAndTouch() {
    // 1. Click delegation for all interactive elements
    document.addEventListener('click', (e) => {
      // If clicking outside device-modal card, dismiss
      if (window.uiManager.dom.deviceModal && !window.uiManager.dom.deviceModal.classList.contains('hidden')) {
        if (e.target === window.uiManager.dom.deviceModal) {
          window.uiManager.hideDeviceModal();
          return;
        }
      }

      // Check device indicator buttons
      if (e.target.closest('#home-device-status') || e.target.closest('#bar-device') || e.target.closest('.device-indicator-btn')) {
        this.showDevicePicker();
        return;
      }

      // Check filter & sort toolbar pill clicks
      const filterPill = e.target.closest('.filter-pill');
      if (filterPill) {
        const action = filterPill.dataset.action;
        if (action === 'playlist-filter') {
          const val = filterPill.dataset.value;
          this.setPlaylistFilter(val);
        } else if (action === 'playlist-sort') {
          this.cyclePlaylistSort();
        } else if (action === 'album-sort') {
          this.cycleAlbumSort();
        }
        return;
      }

      // Check device item clicks inside modal
      const deviceItem = e.target.closest('.device-item');
      if (deviceItem && deviceItem.dataset.deviceId) {
        this.activateDevice(deviceItem.dataset.deviceId);
        return;
      }

      // Check now-playing-bar clicks
      const bar = e.target.closest('#now-playing-bar');
      if (bar) {
        if (e.target.closest('#bar-play-state')) {
          this.togglePlayPause();
          return;
        }
        if (e.target.closest('.bar-guide-hint')) {
          window.uiManager.toggleGuide();
          return;
        }
        // Clicking bar navigates to full Now Playing screen
        this.navigateTo('nowPlaying');
        return;
      }

      // Check focusable interactive elements
      const target = e.target.closest('.menu-item, .recent-card, .list-item, .grid-item, .big-button');
      if (target) {
        // Sync visual focus
        const idx = window.uiManager.focusables.indexOf(target);
        if (idx !== -1) {
          window.uiManager.focusIndex = idx;
          window.uiManager.applyFocus();
        }
        this.handleActionConfirm(target);
      }
    });

    // 2. Hover delegation to sync focus indicator without hijacking scroll
    document.addEventListener('mouseover', (e) => {
      const item = e.target.closest('.menu-item, .recent-card, .list-item, .grid-item');
      if (item && window.uiManager.focusables.includes(item)) {
        const idx = window.uiManager.focusables.indexOf(item);
        if (idx !== -1 && idx !== window.uiManager.focusIndex) {
          window.uiManager.focusIndex = idx;
          window.uiManager.applyFocus({ scroll: false });
        }
      }
    });
  }

  async showDevicePicker() {
    window.uiManager.showLoading();
    try {
      const res = await window.spotifyClient.getDevices();
      const devices = res?.devices || [];
      window.uiManager.showDeviceModal(devices);
      const active = devices.find((d) => d.is_active);
      window.uiManager.updateDeviceBadge(active || devices[0] || null);
    } catch (err) {
      window.uiManager.showToast(this.formatErrorMessage(err), 3000);
    } finally {
      window.uiManager.hideLoading();
    }
  }

  async activateDevice(deviceId) {
    if (!deviceId) return;
    window.uiManager.showLoading();
    try {
      await window.spotifyClient.transferPlayback(deviceId, true);
      window.uiManager.hideDeviceModal();
      window.uiManager.showToast('📱 Switched playback to device!');
      setTimeout(() => {
        this.checkPlayback();
      }, 700);
    } catch (err) {
      window.uiManager.showToast(this.formatErrorMessage(err), 3500);
    } finally {
      window.uiManager.hideLoading();
    }
  }

  openSpotifyApp() {
    const url = 'spotify:';
    if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
      window.electronAPI.openExternal(url).catch(() => {});
    } else {
      window.location.href = url;
    }
    window.uiManager.showToast('Launching Spotify Desktop app...');
    setTimeout(() => this.showDevicePicker(), 2500);
  }

  openWebPlayer() {
    const url = 'https://open.spotify.com';
    if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
      window.electronAPI.openExternal(url).catch(() => {});
    } else {
      window.open(url, '_blank');
    }
    window.uiManager.showToast('Opening Spotify Web Player...');
    setTimeout(() => this.showDevicePicker(), 3500);
  }
}

// Instantiate and start app on window load
window.addEventListener('DOMContentLoaded', () => {
  window.appController = new AppController();
  window.appController.start();
});

