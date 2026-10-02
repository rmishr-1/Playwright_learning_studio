/**
 * The launch window's bridge to the main process: the only things the page can ask for, and the
 * one thing it is told (the window's state changed: the download's progress, a problem, the licence).
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('setup', {
  state: () => ipcRenderer.invoke('setup:state'),
  chooseLicence: () => ipcRenderer.invoke('setup:choose'),
  copyMachineCode: () => ipcRenderer.invoke('setup:copy-machine'),
  retry: () => ipcRenderer.invoke('setup:retry'),
  quit: () => ipcRenderer.invoke('setup:quit'),
  onUpdate: (fn: (state: unknown) => void) => {
    ipcRenderer.on('setup:update', (_e, state: unknown) => fn(state));
  },
});
