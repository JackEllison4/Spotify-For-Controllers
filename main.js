const { app, BrowserWindow, ipcMain, shell, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let pendingDeepLinkUrl = null;

// Ensure single instance lock for deep linking
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  // Handle second-instance for Windows deep links
  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isFullScreen()) mainWindow.setFullScreen(true);
      mainWindow.focus();

      // Deep link URL in commandLine on Windows
      const deepLinkUrl = commandLine
        .map((arg) => (arg || '').replace(/^["']|["']$/g, '').trim())
        .find((arg) => arg.startsWith('spotifyxbox://'));
      if (deepLinkUrl) {
        handleOAuthCallback(deepLinkUrl);
      }
    }
  });
}

// Register as default protocol client for spotifyxbox://
const PROTOCOL_NAME = 'spotifyxbox';
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL_NAME, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL_NAME);
}

// Check initial commandLine args for Windows and Linux on cold boot
if (process.platform === 'win32' || process.platform === 'linux') {
  const deepLink = process.argv
    .map((arg) => (arg || '').replace(/^["']|["']$/g, '').trim())
    .find((arg) => arg.startsWith('spotifyxbox://'));
  if (deepLink) {
    pendingDeepLinkUrl = deepLink;
  }
}

// macOS open-url handler
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleOAuthCallback(url);
});

function handleOAuthCallback(url) {
  if (!url) return;
  const cleanUrl = url.replace(/^["']|["']$/g, '').trim();
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isFullScreen()) mainWindow.setFullScreen(true);
    mainWindow.focus();
    if (mainWindow.webContents && !mainWindow.webContents.isLoading()) {
      mainWindow.webContents.send('oauth-callback', cleanUrl);
    } else {
      pendingDeepLinkUrl = cleanUrl;
    }
  } else {
    pendingDeepLinkUrl = cleanUrl;
  }
}

function getTokensFilePath() {
  return path.join(app.getPath('userData'), 'tokens.json');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: true,
    frame: false,
    backgroundColor: '#0a0a0a',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (pendingDeepLinkUrl) {
      setTimeout(() => {
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('oauth-callback', pendingDeepLinkUrl);
          pendingDeepLinkUrl = null;
        }
      }, 500);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Intercept spotifyxbox:// protocol internally via protocol.handle (Electron 28+)
protocol.registerSchemesAsPrivileged([
  {
    scheme: PROTOCOL_NAME,
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true
    }
  }
]);

app.whenReady().then(() => {
  try {
    protocol.handle(PROTOCOL_NAME, (request) => {
      handleOAuthCallback(request.url);
      return new Response('Authentication received. You may return to Spotify for Controllers.', {
        status: 200,
        headers: { 'content-type': 'text/plain' }
      });
    });
  } catch (err) {
    console.warn('Protocol handler registration notice:', err.message);
  }

  // Register IPC handlers
  let authWindow = null;

  ipcMain.handle('get-config', async () => {
    let config = {};
    try {
      const configPath = path.join(__dirname, 'config.js');
      delete require.cache[require.resolve(configPath)];
      config = require(configPath);
    } catch (error) {
      config = {};
    }

    // Try reading local config file (gitignored)
    try {
      const localPath = path.join(__dirname, 'config.local.js');
      if (fs.existsSync(localPath)) {
        delete require.cache[require.resolve(localPath)];
        const local = require(localPath);
        if (local && local.CLIENT_ID && local.CLIENT_ID !== 'YOUR_SPOTIFY_CLIENT_ID_HERE') {
          config.CLIENT_ID = local.CLIENT_ID;
        }
      }
    } catch (e) {}

    // Try reading user data persistent config
    try {
      const userConfigPath = path.join(app.getPath('userData'), 'config.json');
      if (fs.existsSync(userConfigPath)) {
        const raw = fs.readFileSync(userConfigPath, 'utf8').replace(/^\uFEFF/, '');
        const userCfg = JSON.parse(raw);
        if (userCfg && userCfg.CLIENT_ID && userCfg.CLIENT_ID !== 'YOUR_SPOTIFY_CLIENT_ID_HERE') {
          config.CLIENT_ID = userCfg.CLIENT_ID;
        }
      }
    } catch (e) {}

    return config;
  });

  ipcMain.handle('save-client-id', async (_event, clientId) => {
    try {
      if (!clientId) return { success: false };
      const userConfigPath = path.join(app.getPath('userData'), 'config.json');
      let data = {};
      if (fs.existsSync(userConfigPath)) {
        try {
          const raw = fs.readFileSync(userConfigPath, 'utf8').replace(/^\uFEFF/, '');
          data = JSON.parse(raw);
        } catch (e) {}
      }
      data.CLIENT_ID = clientId.trim();
      fs.writeFileSync(userConfigPath, JSON.stringify(data, null, 2), 'utf-8');
      return { success: true };
    } catch (error) {
      console.error('Failed to save client ID:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('open-auth-window', async (_event, authUrl) => {
    return new Promise((resolve) => {
      if (authWindow) {
        try { authWindow.destroy(); } catch (e) {}
        authWindow = null;
      }

      // Temporarily drop fullscreen on mainWindow so modal/child windows render properly on Windows
      if (mainWindow && typeof mainWindow.isFullScreen === 'function' && mainWindow.isFullScreen()) {
        try { mainWindow.setFullScreen(false); } catch (e) {}
      }

      authWindow = new BrowserWindow({
        width: 560,
        height: 780,
        center: true,
        show: true,
        alwaysOnTop: true,
        title: 'Sign in to Spotify',
        icon: path.join(__dirname, 'assets', 'icon.png'),
        backgroundColor: '#121212',
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true
        }
      });

      authWindow.setAlwaysOnTop(true, 'screen-saver');
      authWindow.focus();

      authWindow.webContents.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      );

      let handled = false;

      const checkUrl = (targetUrl) => {
        if (handled || !targetUrl) return;
        if (targetUrl.startsWith('spotifyxbox://') || (targetUrl.includes('spotifyxbox') && targetUrl.includes('code='))) {
          handled = true;
          handleOAuthCallback(targetUrl);
          setTimeout(() => {
            if (authWindow) {
              try { authWindow.destroy(); } catch (e) {}
              authWindow = null;
            }
          }, 200);
          resolve({ success: true, url: targetUrl });
        }
      };

      authWindow.webContents.on('will-redirect', (event, url) => {
        if (url.startsWith('spotifyxbox://') || url.includes('code=')) {
          event.preventDefault();
          checkUrl(url);
        }
      });

      authWindow.webContents.on('will-navigate', (event, url) => {
        if (url.startsWith('spotifyxbox://') || url.includes('code=')) {
          event.preventDefault();
          checkUrl(url);
        }
      });

      authWindow.webContents.on('did-navigate', (_event, url) => {
        checkUrl(url);
      });

      authWindow.webContents.on('did-fail-load', (_event, _errorCode, _errorDescription, validatedURL) => {
        if (validatedURL && (validatedURL.startsWith('spotifyxbox://') || validatedURL.includes('code='))) {
          checkUrl(validatedURL);
        }
      });

      authWindow.webContents.on('did-fail-provisional-load', (_event, _errorCode, _errorDescription, validatedURL) => {
        if (validatedURL && (validatedURL.startsWith('spotifyxbox://') || validatedURL.includes('code='))) {
          checkUrl(validatedURL);
        }
      });

      authWindow.webContents.on('did-finish-load', () => {
        if (authWindow && !authWindow.isDestroyed()) {
          authWindow.show();
          authWindow.focus();
        }
      });

      authWindow.on('closed', () => {
        authWindow = null;
        if (mainWindow) {
          try {
            if (!mainWindow.isFullScreen()) mainWindow.setFullScreen(true);
            mainWindow.focus();
          } catch (e) {}
        }
        if (!handled) {
          resolve({ success: false, reason: 'closed' });
        }
      });

      authWindow.loadURL(authUrl);
    });
  });

  ipcMain.handle('save-tokens', async (_event, tokens) => {
    try {
      const filePath = getTokensFilePath();
      fs.writeFileSync(filePath, JSON.stringify(tokens, null, 2), 'utf-8');
      return { success: true };
    } catch (error) {
      console.error('Failed to save tokens:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-tokens', async () => {
    try {
      const filePath = getTokensFilePath();
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const data = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to read tokens:', error);
      return null;
    }
  });

  ipcMain.handle('open-external', async (_event, url) => {
    try {
      // Temporarily minimize / exit fullscreen so external browser is visible in front
      if (mainWindow && typeof mainWindow.isFullScreen === 'function' && mainWindow.isFullScreen()) {
        try {
          mainWindow.setFullScreen(false);
          mainWindow.minimize();
        } catch (e) {}
      }
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error('Failed to open external url:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('quit-app', () => {
    app.quit();
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
