import { contextBridge, ipcRenderer } from 'electron'
import type { Annotations, Library, RootStatus, SwingApi } from '@shared/types'

/** images/ 配下の相対パスを専用スキームのURLにする。日本語パスがあるので各要素をエンコードする。 */
const assetUrl = (relPath: string): string =>
  'swing://asset/' + relPath.split('/').map(encodeURIComponent).join('/')

const api: SwingApi = {
  loadLibrary: () => ipcRenderer.invoke('library:load') as Promise<Library>,
  loadAnnotations: (dir) => ipcRenderer.invoke('anno:load', dir) as Promise<Annotations>,
  saveAnnotations: (dir, data) => ipcRenderer.invoke('anno:save', dir, data) as Promise<void>,
  assetUrl,
  getRoot: () => ipcRenderer.invoke('root:get') as Promise<RootStatus>,
  chooseRoot: () => ipcRenderer.invoke('root:choose') as Promise<RootStatus>,
  revealRoot: () => ipcRenderer.invoke('root:reveal') as Promise<void>,
  window: {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximizeToggle: () => ipcRenderer.send('win:maximize-toggle'),
    close: () => ipcRenderer.send('win:close'),
  },
}

contextBridge.exposeInMainWorld('swing', api)
