/**
 * UI State, Screen Transitions, Focus Navigation and DOM Rendering
 * Universal: Works both in Web Browsers and inside Electron
 */
class UIManager {
  constructor() {
    this.currentScreen = 'login';
    this.focusIndex = 0;
    this.focusables = [];
    this.toastTimeout = null;
    this.isGuideVisible = false;

    // Cache common DOM nodes
    this.dom = {};
  }

  init() {
    this.dom = {
      toast: document.getElementById('toast'),
      loading: document.getElementById('loading'),
      nowPlayingBar: document.getElementById('now-playing-bar'),
      controllerGuide: document.getElementById('controller-guide'),
      controllerStatus: document.getElementById('controller-status'),

      // Bar elements
      barArt: document.getElementById('bar-art'),
      barTrack: document.getElementById('bar-track'),
      barArtist: document.getElementById('bar-artist'),
      barPlayState: document.getElementById('bar-play-state'),
      barVolume: document.getElementById('bar-volume'),

      // Now Playing Screen
      npArt: document.getElementById('np-album-art'),
      npTrack: document.getElementById('np-track-name'),
      npArtist: document.getElementById('np-artist-name'),
      npAlbum: document.getElementById('np-album-name'),
      npProgress: document.getElementById('np-progress'),
      npTimeCurrent: document.getElementById('np-time-current'),
      npTimeTotal: document.getElementById('np-time-total'),
      npShuffle: document.getElementById('np-shuffle-state'),
      npRepeat: document.getElementById('np-repeat-state'),
      npVolume: document.getElementById('np-volume'),
      npLiked: document.getElementById('np-liked'),

      // Login screen elements
      clientIdInput: document.getElementById('client-id-input'),
      redirectUriBadge: document.getElementById('redirect-uri-badge'),
      clientIdContainer: document.getElementById('client-id-container'),

      // Screens
      screens: {
        login: document.getElementById('screen-login'),
        home: document.getElementById('screen-home'),
        nowPlaying: document.getElementById('screen-nowPlaying'),
        liked: document.getElementById('screen-liked'),
        playlists: document.getElementById('screen-playlists'),
        playlistDetail: document.getElementById('screen-playlistDetail'),
        artistDetail: document.getElementById('screen-artistDetail'),
        search: document.getElementById('screen-search'),
        queue: document.getElementById('screen-queue'),
        artists: document.getElementById('screen-artists'),
        albums: document.getElementById('screen-albums')
      },

      // Lists and grids
      playlistsList: document.getElementById('playlists-list'),
      playlistTracksList: document.getElementById('playlist-tracks-list'),
      likedTracksList: document.getElementById('liked-tracks-list'),
      likedCount: document.getElementById('liked-count'),
      artistTracksList: document.getElementById('artist-tracks-list'),
      artistAlbumsGrid: document.getElementById('artist-albums-grid'),
      searchResults: document.getElementById('search-results'),
      queueList: document.getElementById('queue-list'),
      artistsGrid: document.getElementById('artists-grid'),
      albumsGrid: document.getElementById('albums-grid'),
      searchInput: document.getElementById('search-input'),

      // Playlist detail info
      pdCover: document.getElementById('pd-cover'),
      pdName: document.getElementById('pd-name'),
      pdDesc: document.getElementById('pd-desc'),
      pdCount: document.getElementById('pd-count'),

      // Artist detail info
      adCover: document.getElementById('ad-cover'),
      adName: document.getElementById('ad-name'),
      adGenres: document.getElementById('ad-genres'),
      adFollowers: document.getElementById('ad-followers'),

      // Device elements
      homeDeviceStatus: document.getElementById('home-device-status'),
      homeDeviceName: document.getElementById('home-device-name'),
      barDevice: document.getElementById('bar-device'),
      barDeviceName: document.getElementById('bar-device-name'),
      deviceModal: document.getElementById('device-modal'),
      deviceList: document.getElementById('device-list'),
      btnCloseDeviceModal: document.getElementById('btn-close-device-modal'),
      btnRefreshDevices: document.getElementById('btn-refresh-devices'),
      btnOpenSpotifyApp: document.getElementById('btn-open-spotify-app'),
      btnOpenWebPlayer: document.getElementById('btn-open-web-player'),

      // Playlists toolbar
      playlistsHeaderTitle: document.getElementById('playlists-header-title'),
      btnPlaylistFilterAll: document.getElementById('btn-playlist-filter-all'),
      btnPlaylistFilterOwned: document.getElementById('btn-playlist-filter-owned'),
      btnPlaylistSort: document.getElementById('btn-playlist-sort'),
      playlistSortLabel: document.getElementById('playlist-sort-label'),

      // Albums toolbar
      albumsHeaderTitle: document.getElementById('albums-header-title'),
      btnAlbumSort: document.getElementById('btn-album-sort'),
      albumSortLabel: document.getElementById('album-sort-label')
    };

    // Controller status listener
    window.addEventListener('controller:status', (e) => {
      this.updateControllerStatus(e.detail);
    });

    this.attachScrollSync();
    this.refreshFocusables();
  }

  getActiveScreenElement() {
    return this.dom.screens[this.currentScreen] || null;
  }

  attachScrollSync() {
    Object.values(this.dom.screens).forEach((screenEl) => {
      if (!screenEl || screenEl._hasScrollSync) return;
      screenEl._hasScrollSync = true;
      let scrollTimer = null;
      screenEl.addEventListener('scroll', () => {
        if (this.isProgrammaticScroll) return;
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          this.keepFocusVisibleOnScroll();
        }, 50);
      }, { passive: true });
    });
  }

  /**
   * Keeps the focus ring on a visible element during scrolling without jumping arbitrarily
   */
  keepFocusVisibleOnScroll() {
    const currentScreenEl = this.getActiveScreenElement();
    if (!currentScreenEl || !this.focusables || this.focusables.length === 0) return;

    const focusedEl = this.focusables[this.focusIndex];
    const sRect = currentScreenEl.getBoundingClientRect();

    if (focusedEl && focusedEl.offsetParent) {
      const elRect = focusedEl.getBoundingClientRect();
      // If the currently focused element is still visible on screen, keep it! Do not touch it!
      if (elRect.bottom > sRect.top + 20 && elRect.top < sRect.bottom - 30) {
        return;
      }

      // If it scrolled off the top of the screen (user scrolled down):
      if (elRect.top < sRect.top + 20) {
        for (let i = this.focusIndex; i < this.focusables.length; i++) {
          const el = this.focusables[i];
          if (!el.offsetParent) continue;
          const r = el.getBoundingClientRect();
          if (r.top >= sRect.top && r.bottom <= sRect.bottom + 60) {
            this.focusIndex = i;
            this.applyFocus({ scroll: false });
            return;
          }
        }
      } else {
        // It scrolled off the bottom of the screen (user scrolled up):
        for (let i = this.focusIndex; i >= 0; i--) {
          const el = this.focusables[i];
          if (!el.offsetParent) continue;
          const r = el.getBoundingClientRect();
          if (r.bottom <= sRect.bottom && r.top >= sRect.top - 60) {
            this.focusIndex = i;
            this.applyFocus({ scroll: false });
            return;
          }
        }
      }
    }
  }

  scrollToFocused(focusedEl) {
    const screenEl = focusedEl.closest('.screen');
    if (!screenEl) {
      try {
        focusedEl.scrollIntoView({ behavior: 'auto', block: 'nearest' });
      } catch (e) {}
      return;
    }

    this.isProgrammaticScroll = true;
    clearTimeout(this._scrollLockTimeout);
    this._scrollLockTimeout = setTimeout(() => {
      this.isProgrammaticScroll = false;
    }, 180);

    const sRect = screenEl.getBoundingClientRect();
    const elRect = focusedEl.getBoundingClientRect();

    const topSafetyMargin = 90;
    const bottomSafetyMargin = 120;

    if (elRect.top < sRect.top + topSafetyMargin) {
      const delta = (sRect.top + topSafetyMargin) - elRect.top;
      screenEl.scrollTop = Math.max(0, screenEl.scrollTop - delta);
    } else if (elRect.bottom > sRect.bottom - bottomSafetyMargin) {
      const delta = elRect.bottom - (sRect.bottom - bottomSafetyMargin);
      screenEl.scrollTop += delta;
    }
  }

  updateControllerStatus(status) {
    if (this.dom.controllerStatus) {
      if (status.connected) {
        this.dom.controllerStatus.textContent = `🎮 ${status.name || 'Xbox Controller'}`;
        this.dom.controllerStatus.classList.add('connected');
      } else {
        this.dom.controllerStatus.textContent = '🎮 No controller detected';
        this.dom.controllerStatus.classList.remove('connected');
      }
    }
  }

  showScreen(name, keepFocusIndex = false) {
    if (!this.dom.screens[name]) {
      console.warn(`Screen '${name}' not found.`);
      return;
    }

    // Hide all screens
    Object.keys(this.dom.screens).forEach((key) => {
      const screenEl = this.dom.screens[key];
      if (screenEl) {
        screenEl.classList.add('hidden');
        screenEl.classList.remove('active');
      }
    });

    this.currentScreen = name;
    const targetScreen = this.dom.screens[name];
    targetScreen.classList.remove('hidden');
    targetScreen.classList.add('active');

    // Bottom Now Playing bar visibility
    if (name === 'login' || name === 'nowPlaying') {
      this.hideNowPlayingBar();
    } else {
      this.showNowPlayingBar();
    }

    if (!keepFocusIndex) {
      this.focusIndex = 0;
    }

    this.refreshFocusables();
  }

  refreshFocusables() {
    // If device modal is visible, scope focus navigation inside the modal
    if (this.dom.deviceModal && !this.dom.deviceModal.classList.contains('hidden')) {
      const items = this.dom.deviceModal.querySelectorAll(
        '.device-item, .modal-action-btn, .modal-close-btn'
      );
      this.focusables = Array.from(items);
      if (this.focusables.length === 0) {
        this.focusIndex = 0;
        return;
      }
      this.focusIndex = Math.max(0, Math.min(this.focusables.length - 1, this.focusIndex));
      this.applyFocus();
      return;
    }

    const currentScreenEl = this.dom.screens[this.currentScreen];
    if (!currentScreenEl) return;

    // Find all focusable items in current screen
    const items = currentScreenEl.querySelectorAll(
      '.focusable, .menu-item, .list-item, .grid-item, button:not([disabled]), input:not([type="hidden"])'
    );

    this.focusables = Array.from(items);

    if (this.focusables.length === 0) {
      this.focusIndex = 0;
      return;
    }

    if (this.focusIndex >= this.focusables.length) {
      this.focusIndex = this.focusables.length - 1;
    }
    if (this.focusIndex < 0) {
      this.focusIndex = 0;
    }

    this.applyFocus();
  }

  setFocusIndex(index) {
    if (this.focusables.length === 0) return;
    this.focusIndex = Math.max(0, Math.min(this.focusables.length - 1, index));
    this.applyFocus({ scroll: true });
  }

  applyFocus(options = { scroll: true }) {
    document.querySelectorAll('.focused').forEach((el) => {
      el.classList.remove('focused');
    });

    const focusedEl = this.focusables[this.focusIndex];
    if (focusedEl) {
      focusedEl.classList.add('focused');
      if (options.scroll !== false) {
        this.scrollToFocused(focusedEl);
      }

      // If it's an input field, focus it for direct keyboard typing
      if (focusedEl.tagName === 'INPUT') {
        focusedEl.focus();
      } else if (document.activeElement && document.activeElement.tagName === 'INPUT') {
        document.activeElement.blur();
      }
    }
  }

  getSelectedItem() {
    if (this.focusables.length > 0 && this.focusIndex >= 0 && this.focusIndex < this.focusables.length) {
      return this.focusables[this.focusIndex];
    }
    return null;
  }

  /**
   * Fast, reliable controller navigation with dedicated list indexing & page skips
   */
  navigateDirection(direction) {
    if (!this.focusables || this.focusables.length === 0) return;

    const screen = this.currentScreen;

    // 1. Pure vertical list screens: Liked Songs, Playlist Detail, Queue, Playlists
    if (screen === 'liked' || screen === 'playlistDetail' || screen === 'queue' || screen === 'playlists') {
      if (direction === 'down') {
        if (this.focusIndex < this.focusables.length - 1) {
          this.setFocusIndex(this.focusIndex + 1);
        }
        return;
      }
      if (direction === 'up') {
        if (this.focusIndex > 0) {
          this.setFocusIndex(this.focusIndex - 1);
        }
        return;
      }
      if (direction === 'right') {
        // Fast Page Down: skip ahead by 6 tracks
        this.setFocusIndex(Math.min(this.focusables.length - 1, this.focusIndex + 6));
        return;
      }
      if (direction === 'left') {
        // Fast Page Up: skip back by 6 tracks
        this.setFocusIndex(Math.max(0, this.focusIndex - 6));
        return;
      }
      return;
    }

    // 2. Dedicated Home Screen Navigation: 3x3 Grid (indices 0..8) + Jump Back In row (indices 9+)
    if (screen === 'home') {
      const idx = this.focusIndex;

      // Inside the 3x3 menu
      if (idx >= 0 && idx < 9) {
        const row = Math.floor(idx / 3);
        const col = idx % 3;

        if (direction === 'left') {
          if (col > 0) this.setFocusIndex(idx - 1);
          return;
        }
        if (direction === 'right') {
          if (col < 2) this.setFocusIndex(idx + 1);
          return;
        }
        if (direction === 'up') {
          if (row > 0) this.setFocusIndex(idx - 3);
          return;
        }
        if (direction === 'down') {
          if (row < 2) {
            this.setFocusIndex(idx + 3);
          } else if (this.focusables.length > 9) {
            // From Row 2 (Albums/Devices/Sign Out) down into Jump Back In row
            const target = Math.min(this.focusables.length - 1, 9 + col);
            this.setFocusIndex(target);
          }
          return;
        }
        return;
      }

      // Inside Jump Back In row (indices 9+)
      if (idx >= 9) {
        if (direction === 'left') {
          if (idx > 9) this.setFocusIndex(idx - 1);
          return;
        }
        if (direction === 'right') {
          if (idx < this.focusables.length - 1) this.setFocusIndex(idx + 1);
          return;
        }
        if (direction === 'up') {
          // Return to Row 2 of home menu (matching column)
          const col = Math.min(2, idx - 9);
          this.setFocusIndex(6 + col);
          return;
        }
        if (direction === 'down') {
          // Bottom boundary: stay on current card
          return;
        }
        return;
      }
    }

    // 3. Spatial 2D geometric navigation for Grids (Albums, Artists, Search, ArtistDetail)
    const currentEl = this.focusables[this.focusIndex];
    if (!currentEl || !currentEl.offsetParent) {
      this.focusIndex = 0;
      this.applyFocus({ scroll: true });
      return;
    }

    const currentRect = currentEl.getBoundingClientRect();
    const currentCenter = {
      x: currentRect.left + currentRect.width / 2,
      y: currentRect.top + currentRect.height / 2
    };

    let bestCandidate = null;
    let bestScore = Infinity;

    for (let i = 0; i < this.focusables.length; i++) {
      if (i === this.focusIndex) continue;
      const el = this.focusables[i];
      if (!el.offsetParent) continue;

      const r = el.getBoundingClientRect();
      const center = {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2
      };

      let isValid = false;
      let primaryDist = 0;
      let secondaryDist = 0;

      if (direction === 'down') {
        if (center.y > currentCenter.y + 6 || r.top >= currentRect.bottom - 4) {
          primaryDist = center.y - currentCenter.y;
          secondaryDist = Math.abs(center.x - currentCenter.x);
          // Cone constraint: target cannot be more than ~60 degrees off primary axis
          if (primaryDist > 0 && secondaryDist <= primaryDist * 1.8) {
            isValid = true;
          }
        }
      } else if (direction === 'up') {
        if (center.y < currentCenter.y - 6 || r.bottom <= currentRect.top + 4) {
          primaryDist = currentCenter.y - center.y;
          secondaryDist = Math.abs(center.x - currentCenter.x);
          if (primaryDist > 0 && secondaryDist <= primaryDist * 1.8) {
            isValid = true;
          }
        }
      } else if (direction === 'right') {
        if (center.x > currentCenter.x + 6 || r.left >= currentRect.right - 4) {
          primaryDist = center.x - currentCenter.x;
          secondaryDist = Math.abs(center.y - currentCenter.y);
          if (primaryDist > 0 && secondaryDist <= primaryDist * 1.8) {
            isValid = true;
          }
        }
      } else if (direction === 'left') {
        if (center.x < currentCenter.x - 6 || r.right <= currentRect.left + 4) {
          primaryDist = currentCenter.x - center.x;
          secondaryDist = Math.abs(center.y - currentCenter.y);
          if (primaryDist > 0 && secondaryDist <= primaryDist * 1.8) {
            isValid = true;
          }
        }
      }

      if (isValid) {
        const score = primaryDist + secondaryDist * 1.8;
        if (score < bestScore) {
          bestScore = score;
          bestCandidate = el;
        }
      }
    }

    if (bestCandidate) {
      this.focusIndex = this.focusables.indexOf(bestCandidate);
      this.applyFocus({ scroll: true });
    }
    // Note: When no candidate exists in the pressed direction, do not fall back to linear index shift.
    // At corners and boundaries, pressing into a boundary wall safely stops without moving sideways.
  }

  navigateList(direction) {
    this.navigateDirection(direction);
  }

  navigateGrid(direction) {
    this.navigateDirection(direction);
  }

  showNowPlayingBar() {
    if (this.dom.nowPlayingBar) {
      this.dom.nowPlayingBar.classList.remove('hidden');
    }
  }

  hideNowPlayingBar() {
    if (this.dom.nowPlayingBar) {
      this.dom.nowPlayingBar.classList.add('hidden');
    }
  }

  updateNowPlayingBar(track, isPlaying, volumePercent = 50) {
    if (!track) {
      if (this.dom.barTrack) this.dom.barTrack.textContent = 'Not Playing';
      if (this.dom.barArtist) this.dom.barArtist.textContent = 'Press A on any song or playlist to start';
      if (this.dom.barPlayState) this.dom.barPlayState.textContent = '⏸';
      return;
    }

    const artists = track.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';
    const trackName = track.name || 'Unknown Track';
    const albumArt = track.album?.images?.[0]?.url || 'https://via.placeholder.com/80?text=Spotify';

    if (this.dom.barArt) this.dom.barArt.src = albumArt;
    if (this.dom.barTrack) this.dom.barTrack.textContent = trackName;
    if (this.dom.barArtist) this.dom.barArtist.textContent = artists;
    if (this.dom.barPlayState) this.dom.barPlayState.textContent = isPlaying ? '▶' : '⏸';
    if (this.dom.barVolume) this.dom.barVolume.textContent = `${volumePercent}%`;
  }

  updateNowPlayingScreen(playback) {
    if (!playback || !playback.item) return;

    const track = playback.item;
    const artists = track.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';
    const albumName = track.album?.name || 'Unknown Album';
    const albumArt = track.album?.images?.[0]?.url || '';

    if (this.dom.npArt && albumArt) this.dom.npArt.src = albumArt;
    if (this.dom.npTrack) this.dom.npTrack.textContent = track.name;
    if (this.dom.npArtist) this.dom.npArtist.textContent = artists;
    if (this.dom.npAlbum) this.dom.npAlbum.textContent = albumName;

    const progressMs = playback.progress_ms || 0;
    const durationMs = track.duration_ms || 1;
    const progressPercent = Math.min(100, Math.max(0, (progressMs / durationMs) * 100));

    if (this.dom.npProgress) this.dom.npProgress.style.width = `${progressPercent}%`;
    if (this.dom.npTimeCurrent) this.dom.npTimeCurrent.textContent = this.formatTime(progressMs);
    if (this.dom.npTimeTotal) this.dom.npTimeTotal.textContent = this.formatTime(durationMs);

    if (this.dom.npShuffle) {
      this.dom.npShuffle.textContent = `Shuffle: ${playback.shuffle_state ? 'On' : 'Off'}`;
    }
    if (this.dom.npRepeat) {
      const mode = playback.repeat_state || 'off';
      this.dom.npRepeat.textContent = `Repeat: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`;
    }
    if (this.dom.npVolume) {
      const vol = playback.device?.volume_percent ?? 50;
      this.dom.npVolume.textContent = `Volume: ${vol}%`;
    }
  }

  formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  }

  showToast(message, duration = 2500) {
    if (!this.dom.toast) return;

    clearTimeout(this.toastTimeout);
    this.dom.toast.textContent = message;
    this.dom.toast.classList.remove('hidden');
    this.dom.toast.classList.add('visible');

    this.toastTimeout = setTimeout(() => {
      this.dom.toast.classList.remove('visible');
      setTimeout(() => {
        this.dom.toast.classList.add('hidden');
      }, 300);
    }, duration);
  }

  showLoading() {
    if (this.dom.loading) {
      this.dom.loading.classList.remove('hidden');
    }
  }

  hideLoading() {
    if (this.dom.loading) {
      this.dom.loading.classList.add('hidden');
    }
  }

  toggleGuide(forceState) {
    if (!this.dom.controllerGuide) return;
    this.isGuideVisible = typeof forceState === 'boolean' ? forceState : !this.isGuideVisible;

    if (this.isGuideVisible) {
      this.dom.controllerGuide.classList.remove('hidden');
    } else {
      this.dom.controllerGuide.classList.add('hidden');
    }
  }

  // ==========================================
  // List and Grid Renderers
  // ==========================================

  renderPlaylists(playlists, state = {}) {
    if (this.dom.playlistsHeaderTitle) {
      if (state.filter === 'owned') {
        this.dom.playlistsHeaderTitle.textContent = `📋 Playlists (${playlists ? playlists.length : 0} by you)`;
      } else if (playlists && playlists.length > 0) {
        this.dom.playlistsHeaderTitle.textContent = `📋 Playlists (${playlists.length})`;
      } else {
        this.dom.playlistsHeaderTitle.textContent = '📋 Playlists';
      }
    }

    if (this.dom.btnPlaylistFilterAll && this.dom.btnPlaylistFilterOwned) {
      if (state.filter === 'owned') {
        this.dom.btnPlaylistFilterAll.classList.remove('active');
        this.dom.btnPlaylistFilterOwned.classList.add('active');
      } else {
        this.dom.btnPlaylistFilterAll.classList.add('active');
        this.dom.btnPlaylistFilterOwned.classList.remove('active');
      }
    }

    if (this.dom.playlistSortLabel && state.sortLabel) {
      this.dom.playlistSortLabel.textContent = state.sortLabel;
    }

    if (!this.dom.playlistsList) return;
    this.dom.playlistsList.innerHTML = '';

    if (!playlists || playlists.length === 0) {
      const msg = state.filter === 'owned'
        ? 'No playlists created by you found.'
        : 'No playlists found.';
      this.dom.playlistsList.innerHTML = `<div class="empty-state">${msg}</div>`;
      this.refreshFocusables();
      return;
    }

    playlists.forEach((playlist) => {
      const item = document.createElement('div');
      item.className = 'list-item';
      item.dataset.id = playlist.id;
      item.dataset.uri = playlist.uri;
      item.dataset.type = 'playlist';

      const trackCount = playlist.items?.total ?? playlist.tracks?.total ?? 0;
      const imgUrl = playlist.images?.[0]?.url || 'https://via.placeholder.com/70?text=Playlist';
      item.innerHTML = `
        <img class="item-art" src="${imgUrl}" alt="${playlist.name}">
        <div class="item-meta">
          <div class="item-title">${playlist.name}</div>
          <div class="item-subtitle">${trackCount} tracks • By ${playlist.owner?.display_name || 'Spotify'}</div>
        </div>
        <div class="item-action"><span class="btn-badge btn-a">A</span> Open</div>
      `;
      this.dom.playlistsList.appendChild(item);
    });

    this.refreshFocusables();
  }

  renderPlaylistDetail(playlist, tracks = []) {
    if (!playlist) return;
    const trackCount = playlist.items?.total ?? playlist.tracks?.total ?? (tracks ? tracks.length : 0);
    if (this.dom.pdName) this.dom.pdName.textContent = playlist.name || 'Playlist';
    if (this.dom.pdDesc) this.dom.pdDesc.textContent = playlist.description || 'No description';
    if (this.dom.pdCount) this.dom.pdCount.textContent = `${trackCount} tracks`;
    if (this.dom.pdCover) {
      const coverUrl = playlist.images?.[0]?.url || 'https://via.placeholder.com/200?text=Playlist';
      this.dom.pdCover.src = coverUrl;
      this.dom.pdCover.alt = playlist.name || 'Cover';
    }

    if (!this.dom.playlistTracksList) return;
    const screenPD = this.dom.screens.playlistDetail;
    const prevPDScroll = screenPD ? screenPD.scrollTop : 0;
    const prevPDFocusedId = this.focusables[this.focusIndex]?.dataset?.id;

    this.dom.playlistTracksList.innerHTML = '';

    if (!tracks || tracks.length === 0) {
      this.dom.playlistTracksList.innerHTML = '<div class="empty-state">This playlist has no tracks or is loading...</div>';
      return;
    }

    tracks.forEach((item, index) => {
      const track = item.track || item.item || item;
      if (!track || !track.id) return;

      const trackItem = document.createElement('div');
      trackItem.className = 'list-item';
      trackItem.dataset.id = track.id;
      trackItem.dataset.uri = track.uri;
      trackItem.dataset.contextUri = playlist.uri;
      trackItem.dataset.index = index;
      trackItem.dataset.type = 'track';

      const imgUrl = track.album?.images?.[0]?.url || 'https://via.placeholder.com/60?text=Track';
      const artists = track.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';
      const duration = this.formatTime(track.duration_ms || 0);

      trackItem.innerHTML = `
        <span class="track-number">${index + 1}</span>
        <img class="item-art small" src="${imgUrl}" alt="${track.name}">
        <div class="item-meta">
          <div class="item-title">${track.name}</div>
          <div class="item-subtitle">${artists} • ${track.album?.name || ''}</div>
        </div>
        <div class="track-duration">${duration}</div>
      `;
      this.dom.playlistTracksList.appendChild(trackItem);
    });

    if (screenPD) {
      const items = screenPD.querySelectorAll(
        '.focusable, .menu-item, .list-item, .grid-item, button:not([disabled]), input:not([type="hidden"])'
      );
      this.focusables = Array.from(items);
      if (prevPDFocusedId) {
        const found = this.focusables.findIndex((el) => el.dataset?.id === prevPDFocusedId);
        if (found !== -1) this.focusIndex = found;
      }
      if (prevPDScroll > 0) screenPD.scrollTop = prevPDScroll;
    }

    this.applyFocus({ scroll: false });
  }

  renderLikedSongs(tracks = [], totalCount = null) {
    if (!this.dom.likedTracksList) return;

    const screenLiked = this.dom.screens.liked;
    const prevScrollTop = screenLiked ? screenLiked.scrollTop : 0;
    const prevFocusedEl = this.focusables[this.focusIndex];
    const prevFocusedId = prevFocusedEl?.dataset?.id;

    this.dom.likedTracksList.innerHTML = '';

    const count = totalCount !== null ? totalCount : tracks.length;
    if (this.dom.likedCount) {
      this.dom.likedCount.textContent = `${count} ${count === 1 ? 'song' : 'songs'}`;
    }

    if (!tracks || tracks.length === 0) {
      this.dom.likedTracksList.innerHTML = '<div class="empty-state">No liked songs found. Press X on any playing song to like it!</div>';
      this.refreshFocusables();
      return;
    }

    tracks.forEach((item, index) => {
      const track = item.track || item;
      if (!track || !track.id) return;

      const trackItem = document.createElement('div');
      trackItem.className = 'list-item track-item';
      trackItem.dataset.id = track.id;
      trackItem.dataset.uri = track.uri;
      trackItem.dataset.type = 'liked-track';
      trackItem.dataset.index = index;

      const imgUrl = track.album?.images?.[0]?.url || 'https://via.placeholder.com/60?text=Track';
      const artists = track.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';
      const duration = this.formatTime(track.duration_ms || 0);

      trackItem.innerHTML = `
        <span class="track-number">${index + 1}</span>
        <img class="item-art small" src="${imgUrl}" alt="${track.name}">
        <div class="item-meta">
          <div class="item-title">${track.name}</div>
          <div class="item-subtitle">${artists} • ${track.album?.name || ''}</div>
        </div>
        <span class="liked-heart-badge" title="Liked">❤️</span>
        <div class="track-duration">${duration}</div>
      `;
      this.dom.likedTracksList.appendChild(trackItem);
    });

    if (screenLiked) {
      const items = screenLiked.querySelectorAll(
        '.focusable, .menu-item, .list-item, .grid-item, button:not([disabled]), input:not([type="hidden"])'
      );
      this.focusables = Array.from(items);
      if (prevFocusedId) {
        const found = this.focusables.findIndex((el) => el.dataset?.id === prevFocusedId);
        if (found !== -1) this.focusIndex = found;
      }
      if (prevScrollTop > 0) screenLiked.scrollTop = prevScrollTop;
    }

    this.applyFocus({ scroll: false });
  }

  renderSearchResults(results) {
    if (!this.dom.searchResults) return;
    this.dom.searchResults.innerHTML = '';

    const tracks = results.tracks?.items || [];
    const artists = results.artists?.items || [];
    const albums = results.albums?.items || [];

    if (tracks.length === 0 && artists.length === 0 && albums.length === 0) {
      this.dom.searchResults.innerHTML = '<div class="empty-state">No results found. Type a query above.</div>';
      return;
    }

    if (tracks.length > 0) {
      const header = document.createElement('h3');
      header.className = 'section-title';
      header.textContent = 'Songs';
      this.dom.searchResults.appendChild(header);

      tracks.slice(0, 15).forEach((track) => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.dataset.id = track.id;
        item.dataset.uri = track.uri;
        item.dataset.type = 'track';

        const imgUrl = track.album?.images?.[0]?.url || 'https://via.placeholder.com/60?text=Music';
        const artistNames = track.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';

        item.innerHTML = `
          <img class="item-art small" src="${imgUrl}" alt="${track.name}">
          <div class="item-meta">
            <div class="item-title">${track.name}</div>
            <div class="item-subtitle">${artistNames}</div>
          </div>
          <div class="track-duration">${this.formatTime(track.duration_ms || 0)}</div>
        `;
        this.dom.searchResults.appendChild(item);
      });
    }

    if (albums.length > 0) {
      const header = document.createElement('h3');
      header.className = 'section-title';
      header.textContent = 'Albums';
      this.dom.searchResults.appendChild(header);

      albums.slice(0, 8).forEach((album) => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.dataset.id = album.id;
        item.dataset.uri = album.uri;
        item.dataset.type = 'album';

        const imgUrl = album.images?.[0]?.url || 'https://via.placeholder.com/60?text=Album';
        item.innerHTML = `
          <img class="item-art small" src="${imgUrl}" alt="${album.name}">
          <div class="item-meta">
            <div class="item-title">${album.name}</div>
            <div class="item-subtitle">Album • ${album.artists?.map((a) => a.name).join(', ')}</div>
          </div>
        `;
        this.dom.searchResults.appendChild(item);
      });
    }

    this.refreshFocusables();
  }

  renderQueue(queueData) {
    if (!this.dom.queueList) return;
    this.dom.queueList.innerHTML = '';

    const currentlyPlaying = queueData?.currently_playing;
    const queue = queueData?.queue || [];

    if (currentlyPlaying) {
      const curSection = document.createElement('div');
      curSection.innerHTML = '<h3 class="section-title">Now Playing</h3>';
      const item = document.createElement('div');
      item.className = 'list-item active-playback';
      item.dataset.id = currentlyPlaying.id;
      item.dataset.uri = currentlyPlaying.uri;
      item.dataset.isCurrent = 'true';

      const imgUrl = currentlyPlaying.album?.images?.[0]?.url || 'https://via.placeholder.com/60?text=Now';
      item.innerHTML = `
        <span class="playing-indicator">▶</span>
        <img class="item-art small" src="${imgUrl}" alt="${currentlyPlaying.name}">
        <div class="item-meta">
          <div class="item-title">${currentlyPlaying.name}</div>
          <div class="item-subtitle">${currentlyPlaying.artists?.map((a) => a.name).join(', ')}</div>
        </div>
      `;
      curSection.appendChild(item);
      this.dom.queueList.appendChild(curSection);
    }

    if (queue.length > 0) {
      const nextHeader = document.createElement('h3');
      nextHeader.className = 'section-title';
      nextHeader.textContent = 'Next Up';
      this.dom.queueList.appendChild(nextHeader);

      queue.forEach((track, index) => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.dataset.id = track.id;
        item.dataset.uri = track.uri;
        item.dataset.type = 'track';
        item.dataset.queueIndex = index;

        const imgUrl = track.album?.images?.[0]?.url || 'https://via.placeholder.com/60?text=Queue';
        item.innerHTML = `
          <span class="track-number">${index + 1}</span>
          <img class="item-art small" src="${imgUrl}" alt="${track.name}">
          <div class="item-meta">
            <div class="item-title">${track.name}</div>
            <div class="item-subtitle">${track.artists?.map((a) => a.name).join(', ')}</div>
          </div>
          <div class="track-duration">${this.formatTime(track.duration_ms || 0)}</div>
        `;
        this.dom.queueList.appendChild(item);
      });
    } else if (!currentlyPlaying) {
      this.dom.queueList.innerHTML = '<div class="empty-state">Queue is empty.</div>';
    }

    this.refreshFocusables();
  }

  renderArtists(artists) {
    if (!this.dom.artistsGrid) return;
    this.dom.artistsGrid.innerHTML = '';

    if (!artists || artists.length === 0) {
      this.dom.artistsGrid.innerHTML = '<div class="empty-state">No top artists found.</div>';
      return;
    }

    artists.forEach((artist) => {
      const card = document.createElement('div');
      card.className = 'grid-item artist-card';
      card.dataset.id = artist.id;
      card.dataset.uri = artist.uri;
      card.dataset.type = 'artist';

      const imgUrl = artist.images?.[0]?.url || 'https://via.placeholder.com/180?text=Artist';
      card.innerHTML = `
        <div class="grid-card-art-wrap round">
          <img src="${imgUrl}" alt="${artist.name}" class="grid-card-art round">
        </div>
        <div class="grid-card-title">${artist.name}</div>
        <div class="grid-card-sub">Artist • View Page</div>
      `;
      this.dom.artistsGrid.appendChild(card);
    });

    this.refreshFocusables();
  }

  renderArtistDetail(artist, tracks = [], albums = []) {
    if (!artist) return;

    if (this.dom.adName) this.dom.adName.textContent = artist.name || 'Artist';
    if (this.dom.adGenres) {
      this.dom.adGenres.textContent = artist.genres?.length ? artist.genres.slice(0, 3).join(', ') : 'Artist';
    }
    if (this.dom.adFollowers) {
      const followers = artist.followers?.total;
      this.dom.adFollowers.textContent = typeof followers === 'number'
        ? `${followers.toLocaleString()} followers`
        : '';
    }
    if (this.dom.adCover) {
      const coverUrl = artist.images?.[0]?.url || 'https://via.placeholder.com/200?text=Artist';
      this.dom.adCover.src = coverUrl;
      this.dom.adCover.alt = artist.name || 'Artist';
    }

    // Render popular tracks
    if (this.dom.artistTracksList) {
      this.dom.artistTracksList.innerHTML = '';
      if (!tracks || tracks.length === 0) {
        this.dom.artistTracksList.innerHTML = '<div class="empty-state">Loading popular songs...</div>';
      } else {
        tracks.slice(0, 8).forEach((item, index) => {
          const track = item.track || item.item || item;
          if (!track || !track.id) return;

          const trackItem = document.createElement('div');
          trackItem.className = 'list-item';
          trackItem.dataset.id = track.id;
          trackItem.dataset.uri = track.uri;
          trackItem.dataset.type = 'track';

          const imgUrl = track.album?.images?.[0]?.url || 'https://via.placeholder.com/60?text=Track';
          const duration = this.formatTime(track.duration_ms || 0);

          trackItem.innerHTML = `
            <span class="track-number">${index + 1}</span>
            <img class="item-art small" src="${imgUrl}" alt="${track.name}">
            <div class="item-meta">
              <div class="item-title">${track.name}</div>
              <div class="item-subtitle">${track.album?.name || ''}</div>
            </div>
            <div class="track-duration">${duration}</div>
          `;
          this.dom.artistTracksList.appendChild(trackItem);
        });
      }
    }

    // Render artist albums
    if (this.dom.artistAlbumsGrid) {
      this.dom.artistAlbumsGrid.innerHTML = '';
      if (!albums || albums.length === 0) {
        this.dom.artistAlbumsGrid.innerHTML = '<div class="empty-state">No albums found.</div>';
      } else {
        albums.slice(0, 10).forEach((album) => {
          const card = document.createElement('div');
          card.className = 'grid-item album-card';
          card.dataset.id = album.id;
          card.dataset.uri = album.uri;
          card.dataset.type = 'album';

          const imgUrl = album.images?.[0]?.url || 'https://via.placeholder.com/180?text=Album';
          const releaseYear = album.release_date ? album.release_date.split('-')[0] : '';

          card.innerHTML = `
            <div class="grid-card-art-wrap">
              <img src="${imgUrl}" alt="${album.name}" class="grid-card-art">
            </div>
            <div class="grid-card-title">${album.name}</div>
            <div class="grid-card-sub">${album.album_type === 'single' ? 'Single' : 'Album'}${releaseYear ? ` • ${releaseYear}` : ''}</div>
          `;
          this.dom.artistAlbumsGrid.appendChild(card);
        });
      }
    }

    this.refreshFocusables();
  }

  renderAlbums(albums, totalCount, state = {}) {
    if (!this.dom.albumsGrid) return;

    if (this.dom.albumsHeaderTitle) {
      this.dom.albumsHeaderTitle.textContent = `💿 Saved Albums (${albums ? albums.length : 0}${totalCount && totalCount > (albums ? albums.length : 0) ? ` / ${totalCount}` : ''})`;
    } else {
      const headerTitle = document.querySelector('#screen-albums .screen-header h2');
      if (headerTitle) {
        headerTitle.textContent = `💿 Saved Albums (${albums ? albums.length : 0}${totalCount && totalCount > (albums ? albums.length : 0) ? ` / ${totalCount}` : ''})`;
      }
    }

    if (this.dom.albumSortLabel && state?.sortLabel) {
      this.dom.albumSortLabel.textContent = state.sortLabel;
    }

    this.dom.albumsGrid.innerHTML = '';

    if (!albums || albums.length === 0) {
      this.dom.albumsGrid.innerHTML = '<div class="empty-state">No saved albums found.</div>';
      this.refreshFocusables();
      return;
    }

    albums.forEach((item) => {
      const album = item.album || item;
      const card = document.createElement('div');
      card.className = 'grid-item album-card';
      card.dataset.id = album.id;
      card.dataset.uri = album.uri;
      card.dataset.type = 'album';

      const imgUrl = album.images?.[0]?.url || 'https://via.placeholder.com/180?text=Album';
      const releaseYear = album.release_date ? album.release_date.split('-')[0] : '';
      const artistName = album.artists?.map((a) => a.name).join(', ') || '';

      card.innerHTML = `
        <div class="grid-card-art-wrap">
          <img src="${imgUrl}" alt="${album.name}" class="grid-card-art">
        </div>
        <div class="grid-card-title">${album.name}</div>
        <div class="grid-card-sub">${artistName}${releaseYear ? ` • ${releaseYear}` : ''}</div>
      `;
      this.dom.albumsGrid.appendChild(card);
    });

    this.refreshFocusables();
  }

  renderHomeRecentlyPlayed(items = []) {
    const homeMenu = document.getElementById('home-menu');
    if (!homeMenu) return;

    let recentSection = document.getElementById('home-recently-played');
    if (!recentSection) {
      recentSection = document.createElement('div');
      recentSection.id = 'home-recently-played';
      recentSection.className = 'recent-container';
      homeMenu.parentNode.appendChild(recentSection);
    }

    recentSection.innerHTML = '<h3 class="section-title">Jump Back In</h3><div class="recent-scroll-row" id="recent-row"></div>';
    const row = document.getElementById('recent-row');

    if (!items || items.length === 0) {
      recentSection.innerHTML = '';
      return;
    }

    items.forEach((item) => {
      const card = document.createElement('div');
      const isArtist = item.type === 'artist';
      card.className = `grid-item recent-card ${isArtist ? 'artist-card' : ''}`;
      card.dataset.id = item.id || '';
      card.dataset.uri = item.uri || '';
      card.dataset.type = item.type || 'playlist';

      const imgUrl = item.imageUrl || (isArtist ? 'https://via.placeholder.com/140?text=Artist' : 'https://via.placeholder.com/140?text=Music');

      let subText = 'Playlist';
      if (item.type === 'playlist') {
        subText = item.subtitle ? `Playlist • ${item.subtitle}` : 'Playlist';
      } else if (item.type === 'album') {
        subText = item.subtitle ? `Album • ${item.subtitle}` : 'Album';
      } else if (item.type === 'artist') {
        subText = 'Artist';
      }

      card.innerHTML = `
        <div class="grid-card-art-wrap ${isArtist ? 'round' : ''}">
          <img src="${imgUrl}" alt="${item.name}" class="grid-card-art ${isArtist ? 'round' : ''}">
        </div>
        <div class="grid-card-title">${item.name}</div>
        <div class="grid-card-sub">${subText}</div>
      `;
      row.appendChild(card);
    });

    this.refreshFocusables();
  }

  // ==========================================
  // Spotify Connect Device Management UI
  // ==========================================

  updateDeviceBadge(device) {
    const hasDevice = Boolean(device && device.name);
    const displayName = hasDevice ? device.name : 'No Device';

    if (this.dom.homeDeviceName) {
      this.dom.homeDeviceName.textContent = displayName;
    }
    if (this.dom.barDeviceName) {
      this.dom.barDeviceName.textContent = displayName;
    }

    if (this.dom.homeDeviceStatus) {
      if (hasDevice && device.is_active) {
        this.dom.homeDeviceStatus.classList.add('active-device');
      } else {
        this.dom.homeDeviceStatus.classList.remove('active-device');
      }
    }

    if (this.dom.barDevice) {
      if (hasDevice && device.is_active) {
        this.dom.barDevice.classList.add('active-device');
      } else {
        this.dom.barDevice.classList.remove('active-device');
      }
    }
  }

  showDeviceModal(devices = []) {
    if (!this.dom.deviceModal) return;
    this.renderDeviceList(devices);
    this.dom.deviceModal.classList.remove('hidden');
    this.refreshFocusables();
  }

  hideDeviceModal() {
    if (!this.dom.deviceModal) return;
    this.dom.deviceModal.classList.add('hidden');
    this.refreshFocusables();
  }

  renderDeviceList(devices = []) {
    if (!this.dom.deviceList) return;
    this.dom.deviceList.innerHTML = '';

    if (!devices || devices.length === 0) {
      this.dom.deviceList.innerHTML = `
        <div class="empty-state" style="padding: 24px 0; font-size: 15px;">
          <div style="font-size: 32px; margin-bottom: 8px;">⚠️</div>
          <strong style="color: #fff;">No Spotify players found</strong><br><br>
          <span style="color: #b3b3b3; font-size: 13px; line-height: 1.5; display: inline-block; max-width: 440px;">
            Open Spotify on this PC, your mobile phone, or your console so this app can stream to it!
          </span>
        </div>
      `;
      return;
    }

    devices.forEach((device) => {
      const item = document.createElement('div');
      item.className = `device-item ${device.is_active ? 'active' : ''}`;
      item.dataset.deviceId = device.id;
      item.dataset.name = device.name;

      let icon = '📱';
      const type = (device.type || '').toLowerCase();
      if (type.includes('computer')) icon = '💻';
      else if (type.includes('speaker') || type.includes('cast')) icon = '🔊';
      else if (type.includes('gameconsole')) icon = '🎮';
      else if (type.includes('tv')) icon = '📺';

      item.innerHTML = `
        <div class="device-info-left">
          <span class="device-type-icon">${icon}</span>
          <div>
            <div class="device-name-text">${device.name}</div>
            <div class="device-type-sub">${device.type || 'Spotify Player'} • Volume ${device.volume_percent ?? 50}%</div>
          </div>
        </div>
        <span class="device-status-pill">${device.is_active ? 'Active' : 'Click to Play Here'}</span>
      `;

      this.dom.deviceList.appendChild(item);
    });
  }
}

// Global instance
window.uiManager = new UIManager();

