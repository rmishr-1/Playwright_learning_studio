/** The Studio Tools page's bridge to the main process: only these calls, and these three events. */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('tools', {
  info: () => ipcRenderer.invoke('tools:info'),
  status: () => ipcRenderer.invoke('tools:status'),
  checkGithub: () => ipcRenderer.invoke('tools:check-github'),
  run: (req: unknown) => ipcRenderer.invoke('tools:run', req),
  input: (data: string) => ipcRenderer.invoke('tools:input', data),
  resize: (size: unknown) => ipcRenderer.invoke('tools:resize', size),
  stop: () => ipcRenderer.invoke('tools:stop'),
  pickFile: (req: unknown) => ipcRenderer.invoke('tools:pick-file', req),
  openFolder: (req: unknown) => ipcRenderer.invoke('tools:open-folder', req),
  onData: (fn: (data: string) => void) => {
    ipcRenderer.on('tools:data', (_e, data: string) => fn(data));
  },
  onStarted: (fn: (s: unknown) => void) => {
    ipcRenderer.on('tools:started', (_e, s: unknown) => fn(s));
  },
  onExit: (fn: (e: unknown) => void) => {
    ipcRenderer.on('tools:exit', (_e, s: unknown) => fn(s));
  },
});
