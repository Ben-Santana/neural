import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('band', {
  getSettings: () => ipcRenderer.invoke('app:settings'),
  updateSettings: (settings: unknown) => ipcRenderer.invoke('app:settings', settings),
  send: (command: unknown) => ipcRenderer.send('band:command', command),
  onMessage: (callback: (message: unknown) => void) => {
    const listener = (_event: unknown, message: unknown) => callback(message);
    ipcRenderer.on('band:message', listener);
    return () => ipcRenderer.removeListener('band:message', listener);
  }
});
