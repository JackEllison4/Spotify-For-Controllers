/**
 * Spotify Web API Client with PKCE OAuth 2.0 Flow
 * Universal: Works both in Web Browsers and inside Electron
 */
class SpotifyClient {
  constructor() {
    this.clientId = '';
    this.redirectUri = '';
    this.scopes = [];
    this.accessToken = null;
    this.refreshToken = null;
    this.expiresAt = null;
    this.isRefreshing = null;
    this.currentUser = null;
  }

  /**
   * Determine the appropriate redirect URI based on runtime environment
   */
  getEffectiveRedirectUri() {
    // If running on the web (http or https), redirect back to the current web page
    if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin.startsWith('http')) {
      return window.location.origin + window.location.pathname;
    }
    // Desktop App mode fallback
    return this.redirectUri || 'spotifyxbox://callback';
  }

  /**
   * Initialize with configuration from config.js or localStorage
   */
  async init(config) {
    const appConfig = config || (typeof window !== 'undefined' ? window.APP_CONFIG : null) || {};

    // Prioritize client ID stored in browser localStorage (set via UI), then config file
    const storedClientId = typeof localStorage !== 'undefined' ? localStorage.getItem('spotify_client_id') : null;
    const configuredId = (appConfig.CLIENT_ID && appConfig.CLIENT_ID !== 'YOUR_SPOTIFY_CLIENT_ID_HERE') ? appConfig.CLIENT_ID : '';
    this.clientId = storedClientId || configuredId || '';
    this.scopes = appConfig.SCOPES || [
      'user-read-playback-state',
      'user-modify-playback-state',
      'user-read-currently-playing',
      'playlist-read-private',
      'playlist-read-collaborative',
      'playlist-modify-public',
      'playlist-modify-private',
      'user-read-private',
      'user-library-read',
      'user-library-modify',
      'user-top-read',
      'user-read-recently-played',
      'streaming'
    ];

    this.redirectUri = this.getEffectiveRedirectUri();

    // 1. Try loading persisted tokens from Electron IPC
    let tokens = null;
    if (window.electronAPI && typeof window.electronAPI.getTokens === 'function') {
      try {
        tokens = await window.electronAPI.getTokens();
      } catch (e) {
        tokens = null;
      }
    }

    // 2. Fall back to standard browser localStorage
    if (!tokens && typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('spotify_tokens');
        if (raw) tokens = JSON.parse(raw);
      } catch (e) {
        tokens = null;
      }
    }

    if (tokens && tokens.access_token) {
      this.accessToken = tokens.access_token;
      this.refreshToken = tokens.refresh_token || null;
      this.expiresAt = tokens.expires_at || 0;
    }

    // 3. Check for web OAuth redirect in URL search params (?code=... or ?error=...)
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('code') || urlParams.has('error')) {
        return this.handleWebRedirect(urlParams);
      }
    }

    return null;
  }

  /**
   * Check if user is authenticated with a valid or refreshable token
   */
  isAuthenticated() {
    return Boolean(this.accessToken || this.refreshToken);
  }

  /**
   * Save custom Client ID to localStorage
   */
  setClientId(clientId) {
    this.clientId = clientId.trim();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('spotify_client_id', this.clientId);
    }
    if (window.electronAPI && typeof window.electronAPI.saveClientId === 'function') {
      window.electronAPI.saveClientId(this.clientId).catch(() => {});
    }
  }

  getClientId() {
    return this.clientId;
  }

  /**
   * Generate cryptographic 128-char Code Verifier for PKCE
   */
  generateCodeVerifier(length = 128) {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const values = window.crypto.getRandomValues(new Uint8Array(length));
    return Array.from(values)
      .map((x) => charset[x % charset.length])
      .join('');
  }

  /**
   * Generate SHA-256 Code Challenge from Verifier
   */
  async generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  /**
   * Start Spotify PKCE authorization
   */
  async startAuth(forceBrowser = false) {
    if (!this.clientId || this.clientId === 'YOUR_SPOTIFY_CLIENT_ID_HERE') {
      throw new Error('Spotify Client ID is not configured. Please enter your Client ID.');
    }

    this.redirectUri = this.getEffectiveRedirectUri();

    const codeVerifier = this.generateCodeVerifier(128);
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    const state = this.generateCodeVerifier(16);

    this.codeVerifier = codeVerifier;
    localStorage.setItem('spotify_code_verifier', codeVerifier);
    localStorage.setItem('spotify_auth_state', state);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      scope: this.scopes.join(' '),
      redirect_uri: this.redirectUri,
      state: state,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge
    });

    const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;

    // If external browser requested or openAuthWindow not available:
    if (forceBrowser) {
      if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
        const extRes = await window.electronAPI.openExternal(authUrl);
        if (extRes && extRes.success === false) {
          throw new Error(extRes.error || 'Failed to open browser.');
        }
        return;
      }
      window.location.href = authUrl;
      return;
    }

    // Default: in-app authentication window for a seamless TV / gamepad experience
    if (window.electronAPI && typeof window.electronAPI.openAuthWindow === 'function') {
      const res = await window.electronAPI.openAuthWindow(authUrl);
      if (res && res.success) {
        return;
      }
      if (res && res.reason === 'closed') {
        throw new Error('Sign in was canceled.');
      }
    } else if (window.electronAPI && typeof window.electronAPI.openExternal === 'function' && !window.location.origin.startsWith('http')) {
      const extRes = await window.electronAPI.openExternal(authUrl);
      if (extRes && extRes.success === false) {
        throw new Error(extRes.error || 'Failed to open browser.');
      }
    } else {
      // Standard web browser flow: redirect current window to Spotify
      window.location.href = authUrl;
    }
  }

  /**
   * Handle web browser redirect (?code=...&state=...)
   */
  async handleWebRedirect(urlParams) {
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');

    // Clean up the URL query parameters without reloading the page
    const cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, document.title, cleanUrl);

    if (error) {
      throw new Error(`Spotify authorization failed: ${error}`);
    }

    if (code) {
      return this.exchangeAuthCode(code, state);
    }

    return null;
  }

  /**
   * Handle deep link or URL callback
   */
  async handleCallback(callbackInput) {
    try {
      if (!callbackInput) throw new Error('No callback URL or code provided.');
      let clean = callbackInput.replace(/^["']|["']$/g, '').trim();

      let code = null;
      let state = null;

      if (clean.includes('code=')) {
        if (!clean.includes('://')) {
          clean = 'spotifyxbox://callback?' + clean.replace(/^\?/, '');
        }
        const url = new URL(clean);
        const error = url.searchParams.get('error');
        if (error) {
          throw new Error(`Spotify authorization failed: ${error}`);
        }
        code = url.searchParams.get('code');
        state = url.searchParams.get('state');
      } else {
        code = clean;
      }

      if (!code) {
        throw new Error('No authorization code found in callback URL.');
      }

      return this.exchangeAuthCode(code, state);
    } catch (err) {
      console.error('Error in handleCallback:', err);
      throw err;
    }
  }

  /**
   * Exchange authorization code for access and refresh tokens
   */
  async exchangeAuthCode(code, state) {
    const storedState = localStorage.getItem('spotify_auth_state');
    if (storedState && state && storedState !== state) {
      console.warn('State parameter mismatch in OAuth response.');
    }

    const codeVerifier = this.codeVerifier || localStorage.getItem('spotify_code_verifier');
    if (!codeVerifier) {
      throw new Error('Missing code verifier. Please restart the sign in process.');
    }

    const redirectUri = this.getEffectiveRedirectUri();

    const bodyParams = new URLSearchParams({
      client_id: this.clientId,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier
    });

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: bodyParams.toString()
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error_description || data.error || 'Failed to exchange authorization token.');
    }

    localStorage.removeItem('spotify_code_verifier');
    localStorage.removeItem('spotify_auth_state');

    await this.saveTokens(data);
    return data;
  }

  /**
   * Save token payload to memory, localStorage, and Electron IPC
   */
  async saveTokens(tokenData) {
    this.accessToken = tokenData.access_token;
    if (tokenData.refresh_token) {
      this.refreshToken = tokenData.refresh_token;
    }
    const expiresIn = tokenData.expires_in || 3600;
    this.expiresAt = Date.now() + (expiresIn * 1000);

    const toStore = {
      access_token: this.accessToken,
      refresh_token: this.refreshToken,
      expires_at: this.expiresAt
    };

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('spotify_tokens', JSON.stringify(toStore));
    }

    if (window.electronAPI && typeof window.electronAPI.saveTokens === 'function') {
      try {
        await window.electronAPI.saveTokens(toStore);
      } catch (e) {
        // Ignored
      }
    }
  }

  /**
   * Clear saved tokens (Sign Out)
   */
  async clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    this.expiresAt = null;
    this.currentUser = null;

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('spotify_tokens');
    }

    if (window.electronAPI && typeof window.electronAPI.saveTokens === 'function') {
      try {
        await window.electronAPI.saveTokens({});
      } catch (e) {
        // Ignored
      }
    }
  }

  /**
   * Refresh the access token using the stored refresh_token
   */
  async refreshTokens() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available. Re-authentication required.');
    }

    if (this.isRefreshing) {
      return this.isRefreshing;
    }

    this.isRefreshing = (async () => {
      try {
        const bodyParams = new URLSearchParams({
          client_id: this.clientId,
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken
        });

        const response = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: bodyParams.toString()
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error_description || data.error || 'Failed to refresh token');
        }

        await this.saveTokens(data);
        return this.accessToken;
      } finally {
        this.isRefreshing = null;
      }
    })();

    return this.isRefreshing;
  }

  /**
   * Wrapper for authenticated Spotify Web API requests
   */
  async fetchWithAuth(endpoint, options = {}) {
    if (this.expiresAt && Date.now() > this.expiresAt - 60000) {
      await this.refreshTokens();
    }

    if (!this.accessToken) {
      throw new Error('Not authenticated. Please sign in with Spotify.');
    }

    const headers = {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (!options.body) {
      delete headers['Content-Type'];
    }

    const url = endpoint.startsWith('http') ? endpoint : `https://api.spotify.com/v1${endpoint}`;

    let response = await fetch(url, {
      ...options,
      headers
    });

    if (response.status === 401 && this.refreshToken) {
      await this.refreshTokens();
      headers.Authorization = `Bearer ${this.accessToken}`;
      response = await fetch(url, {
        ...options,
        headers
      });
    }

    if (response.status === 204) {
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    let responseData = null;
    if (contentType.includes('application/json')) {
      responseData = await response.json().catch(() => null);
    } else {
      const text = await response.text().catch(() => '');
      responseData = text ? { message: text } : null;
    }

    if (!response.ok) {
      const message = responseData?.error?.message || responseData?.error_description || response.statusText || 'Spotify API error';
      const error = new Error(message);
      error.status = response.status;
      error.details = responseData;
      throw error;
    }

    return responseData;
  }

  // ==========================================
  // Spotify Web API Endpoint Methods
  // ==========================================

  async getCurrentPlayback() {
    return this.fetchWithAuth('/me/player');
  }

  async getDevices() {
    return this.fetchWithAuth('/me/player/devices');
  }

  async transferPlayback(deviceId, play = false) {
    return this.fetchWithAuth('/me/player', {
      method: 'PUT',
      body: JSON.stringify({
        device_ids: [deviceId],
        play: Boolean(play)
      })
    });
  }

  async play(contextUri, uris, offset, deviceId) {
    let targetDeviceId = deviceId;

    // If no specific deviceId provided, try to find an active device or any available device
    if (!targetDeviceId) {
      try {
        const devicesRes = await this.getDevices();
        const devices = devicesRes?.devices || [];
        const active = devices.find((d) => d.is_active);
        if (active) {
          targetDeviceId = active.id;
        } else if (devices.length > 0) {
          // If no device is currently active, wake up the first available Spotify device!
          targetDeviceId = devices[0].id;
          console.log(`Activating available Spotify device: ${devices[0].name} (${targetDeviceId})`);
        }
      } catch (e) {
        console.warn('Could not auto-detect devices:', e);
      }
    }

    const body = {};
    if (contextUri) body.context_uri = contextUri;
    if (uris && uris.length > 0) body.uris = uris;
    if (offset !== undefined) {
      body.offset = typeof offset === 'number' ? { position: offset } : offset;
    }

    const endpoint = targetDeviceId
      ? `/me/player/play?device_id=${encodeURIComponent(targetDeviceId)}`
      : '/me/player/play';

    return this.fetchWithAuth(endpoint, {
      method: 'PUT',
      body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined
    });
  }

  async pause() {
    return this.fetchWithAuth('/me/player/pause', { method: 'PUT' });
  }

  async nextTrack() {
    return this.fetchWithAuth('/me/player/next', { method: 'POST' });
  }

  async previousTrack() {
    return this.fetchWithAuth('/me/player/previous', { method: 'POST' });
  }

  async setVolume(percent) {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    return this.fetchWithAuth(`/me/player/volume?volume_percent=${clamped}`, {
      method: 'PUT'
    });
  }

  async setShuffle(state) {
    return this.fetchWithAuth(`/me/player/shuffle?state=${Boolean(state)}`, {
      method: 'PUT'
    });
  }

  async setRepeat(state = 'off') {
    return this.fetchWithAuth(`/me/player/repeat?state=${state}`, {
      method: 'PUT'
    });
  }

  async getCurrentUser() {
    if (this.currentUser) return this.currentUser;
    try {
      this.currentUser = await this.fetchWithAuth('/me');
      return this.currentUser;
    } catch (e) {
      console.warn('Failed to fetch current user profile:', e);
      return null;
    }
  }

  async getPlaylists(limit = 50, offset = 0) {
    return this.fetchWithAuth(`/me/playlists?limit=${Math.min(limit, 50)}&offset=${offset}`);
  }

  async getAllPlaylists() {
    let all = [];
    let offset = 0;
    const limit = 50;
    while (true) {
      const page = await this.getPlaylists(limit, offset);
      if (!page?.items || page.items.length === 0) break;
      all = all.concat(page.items);
      if (all.length >= (page.total || 0) || page.items.length < limit) break;
      offset += limit;
    }
    return all;
  }

  async getPlaylist(playlistId) {
    return this.fetchWithAuth(`/playlists/${encodeURIComponent(playlistId)}`);
  }

  async getPlaylistTracks(playlistId, limit = 50, offset = 0) {
    const clampedLimit = Math.min(Math.max(1, limit), 50);

    // 1. Try modern Spotify API endpoint (/playlists/{id}/items)
    try {
      const data = await this.fetchWithAuth(`/playlists/${encodeURIComponent(playlistId)}/items?limit=${clampedLimit}&offset=${offset}`);
      if (data && Array.isArray(data.items)) {
        return data;
      }
    } catch (itemsErr) {
      console.warn('Playlist /items call failed, trying /tracks fallback...', itemsErr);
    }

    // 2. Fallback to legacy endpoint (/playlists/{id}/tracks)
    try {
      return await this.fetchWithAuth(`/playlists/${encodeURIComponent(playlistId)}/tracks?limit=${clampedLimit}&offset=${offset}`);
    } catch (tracksErr) {
      console.warn('Playlist /tracks call failed, fetching full playlist object...', tracksErr);
      // 3. Fallback to fetching playlist object directly
      const playlist = await this.getPlaylist(playlistId);
      return playlist.tracks || playlist.items || { items: [] };
    }
  }

  async getTopTracks(limit = 20, timeRange = 'medium_term') {
    return this.fetchWithAuth(`/me/top/tracks?limit=${limit}&time_range=${timeRange}`);
  }

  async getTopArtists(limit = 20, timeRange = 'medium_term') {
    return this.fetchWithAuth(`/me/top/artists?limit=${limit}&time_range=${timeRange}`);
  }

  async getRecentlyPlayed(limit = 20) {
    return this.fetchWithAuth(`/me/player/recently-played?limit=${limit}`);
  }

  async search(query, types = ['track', 'artist', 'album', 'playlist'], limit = 20) {
    const typeStr = Array.isArray(types) ? types.join(',') : types;
    return this.fetchWithAuth(`/search?q=${encodeURIComponent(query)}&type=${typeStr}&limit=${limit}`);
  }

  async getLikedSongs(limit = 50, offset = 0) {
    return this.fetchWithAuth(`/me/tracks?limit=${limit}&offset=${offset}`);
  }

  async checkSavedTracks(trackIds) {
    const ids = Array.isArray(trackIds) ? trackIds.join(',') : trackIds;
    return this.fetchWithAuth(`/me/tracks/contains?ids=${encodeURIComponent(ids)}`);
  }

  async toggleLike(trackId, isLiked) {
    const method = isLiked ? 'DELETE' : 'PUT';
    return this.fetchWithAuth(`/me/tracks?ids=${encodeURIComponent(trackId)}`, {
      method
    });
  }

  async addToQueue(uri) {
    return this.fetchWithAuth(`/me/player/queue?uri=${encodeURIComponent(uri)}`, {
      method: 'POST'
    });
  }

  async getQueue() {
    return this.fetchWithAuth('/me/player/queue');
  }

  async getAlbum(albumId) {
    return this.fetchWithAuth(`/albums/${albumId}`);
  }

  async getSavedAlbums(limit = 50, offset = 0) {
    const clampedLimit = Math.min(Math.max(1, limit), 50);
    return this.fetchWithAuth(`/me/albums?limit=${clampedLimit}&offset=${offset}`);
  }

  async getArtist(artistId) {
    return this.fetchWithAuth(`/artists/${encodeURIComponent(artistId)}`);
  }

  async getArtistAlbums(artistId, limit = 20) {
    const clampedLimit = Math.min(Math.max(1, limit), 50);
    return this.fetchWithAuth(`/artists/${encodeURIComponent(artistId)}/albums?limit=${clampedLimit}`);
  }

  async getArtistTopTracks(artistId, artistName, market = 'from_token') {
    // 1. Try Spotify /top-tracks endpoint
    try {
      const data = await this.fetchWithAuth(`/artists/${encodeURIComponent(artistId)}/top-tracks?market=${market}`);
      if (data && Array.isArray(data.tracks) && data.tracks.length > 0) {
        return data;
      }
    } catch (e) {
      console.warn('Artist /top-tracks returned error, falling back to search query...', e);
    }

    // 2. Fallback: Search tracks by artist name to bypass Spotify's restricted top-tracks API
    if (artistName) {
      try {
        const searchRes = await this.search(`artist:${artistName}`, 'track', 10);
        if (searchRes && searchRes.tracks?.items) {
          return { tracks: searchRes.tracks.items };
        }
      } catch (err) {
        console.warn('Artist track search fallback failed:', err);
      }
    }

    return { tracks: [] };
  }
}

// Global instance
window.spotifyClient = new SpotifyClient();

