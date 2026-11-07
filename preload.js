const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveTokens: (tokens) => ipcRenderer.invoke('save-tokens', tokens),
  getTokens: () => ipcRenderer.invoke('get-tokens'),
  saveClientId: (id) => ipcRenderer.invoke('save-client-id', id),
  openAuthWindow: (url) => ipcRenderer.invoke('open-auth-window', url),
  onOAuthCallback: (callback) => {
    const handler = (_event, url) => {
      if (typeof callback === 'function') {
        callback(url);
      }
    };
    ipcRenderer.on('oauth-callback', handler);
    return () => ipcRenderer.removeListener('oauth-callback', handler);
  },
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  quitApp: () => ipcRenderer.invoke('quit-app')
});

