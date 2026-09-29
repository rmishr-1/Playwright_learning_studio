/**
 * The setup window's bridge to the main process: the only things the page can ask for.
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('setup', {
  state: () => ipcRenderer.invoke('setup:state'),
  chooseLicence: () => ipcRenderer.invoke('setup:choose'),
  copyMachineCode: () => ipcRenderer.invoke('setup:copy-machine'),
  accept: () => ipcRenderer.invoke('setup:accept'),
  quit: () => ipcRenderer.invoke('setup:quit'),
});
