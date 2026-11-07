/**
 * SpotifyXbox / Spotify For Controllers Configuration
 * Universal Module: Compatible with both Node.js (Electron) and Web Browsers
 */

function getDefaultRedirectUri() {
  if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin.startsWith('http')) {
    // Web mode: use current website URL as redirect URI
    return window.location.origin + window.location.pathname;
  }
  // Desktop app mode: custom deep link scheme
  return 'spotifyxbox://callback';
}

// Optional local configuration override (gitignored, keeps personal keys off GitHub)
let localConfig = {};
try {
  if (typeof require !== 'undefined') {
    localConfig = require('./config.local.js');
  }
} catch (e) {
  // config.local.js is optional and untracked in git
}

const APP_CONFIG = {
  // Your Spotify Client ID from developer.spotify.com
  // Can be set via config.local.js (gitignored), the in-app login input box, or here:
  CLIENT_ID: (localConfig && localConfig.CLIENT_ID) || 'YOUR_SPOTIFY_CLIENT_ID_HERE',

  // Automatically detects web URL when running in browser or fallback to spotifyxbox://callback in Electron
  REDIRECT_URI: getDefaultRedirectUri(),

  SCOPES: [
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
  ]
};

// Export for Node.js / Electron
if (typeof module !== 'undefined' && module.exports) {
  module.exports = APP_CONFIG;
}

// Export for Web Browser
if (typeof window !== 'undefined') {
  window.APP_CONFIG = APP_CONFIG;
}
