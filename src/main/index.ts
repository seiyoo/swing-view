import { app, BrowserWindow, dialog, ipcMain, protocol, net, shell } from 'electron'
import type { IpcMainEvent } from 'electron'
import { join, resolve, sep } from 'path'
import { pathToFileURL } from 'url'
import { readFile, writeFile } from 'fs/promises'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import type { Annotations, Library, RootStatus, Settings } from '@shared/types'

/**
 * データルート = images/ と videos/ がある場所。
 * アプリと素材リポジトリは別なので、既定値は持たず設定で覚える。
 *   1. 環境変数 SWINGVIEW_DATA_ROOT（あれば固定。UIからは変更させない）
 *   2. userData/settings.json の dataRoot
 *   3. 未設定 → 初回セットアップ画面を出す
 */
const ENV_ROOT = process.env.SWINGVIEW_DATA_ROOT || process.env.SWINGVIEW_ROOT || ''
const SETTINGS_FILE = join(app.getPath('userData'), 'settings.json')

let dataRoot: string | null = null

function readSettings(): Settings {
  try {
    return JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8')) as Settings
  } catch {
    return {}
  }
}

function writeSettings(s: Settings): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2) + '\n', 'utf-8')
}

/** 解析済みライブラリの位置。ここの有無でデータルートの妥当性を判定する。 */
const libraryFile = (root: string): string => join(root, 'images', 'library.json')

function status(): RootStatus {
  return {
    path: dataRoot,
    source: ENV_ROOT ? 'env' : dataRoot ? 'settings' : 'none',
    exists: !!dataRoot && existsSync(dataRoot),
    hasLibrary: !!dataRoot && existsSync(libraryFile(dataRoot)),
    locked: !!ENV_ROOT,
    settingsFile: SETTINGS_FILE,
  }
}

function initRoot(): void {
  if (ENV_ROOT) {
    dataRoot = resolve(ENV_ROOT)
    return
  }
  const saved = readSettings().dataRoot
  dataRoot = saved ? resolve(saved) : null
}

/**
 * 画像・動画は file:// ではなく専用スキームで配る。
 * webSecurity を落とさずに済み、データルートの外へ出る要求を確実に弾ける。
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'swing',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#1b1d21',
    show: false,
    // フレームレス。タイトルバーはレンダラー側（.titlebar）が兼ねる。
    frame: false,
    title: 'SwingView',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  win.on('ready-to-show', () => win.show())

  // 開発時の診断。レンダラー側のエラーはウィンドウを開かないと見えないので端末に流す。
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    if (level >= 2) console.error(`[renderer] ${message}  (${source}:${line})`)
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url) =>
    console.error(`[renderer] 読み込み失敗 ${code} ${desc} ${url}`),
  )
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** データルート配下に収まる絶対パスに解決する。外に出る指定と未設定は null。 */
function safeResolve(rel: string): string | null {
  if (!dataRoot) return null
  const abs = resolve(join(dataRoot, rel))
  if (abs !== dataRoot && !abs.startsWith(dataRoot + sep)) return null
  return abs
}

app.whenReady().then(() => {
  initRoot()
  console.log(
    `[main] データルート: ${dataRoot ?? '(未設定)'}` +
      (ENV_ROOT ? '  ※環境変数で固定' : `  設定: ${SETTINGS_FILE}`),
  )

  protocol.handle('swing', async (req) => {
    try {
      const u = new URL(req.url)
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '')
      const abs = safeResolve(rel)
      if (!abs || !existsSync(abs)) return new Response('not found', { status: 404 })
      return net.fetch(pathToFileURL(abs).toString())
    } catch {
      return new Response('bad request', { status: 400 })
    }
  })

  // ---- ウィンドウ操作（送信元ウィンドウを対象に） ----
  const winOf = (e: IpcMainEvent): BrowserWindow | null => BrowserWindow.fromWebContents(e.sender)
  ipcMain.on('win:minimize', (e) => winOf(e)?.minimize())
  ipcMain.on('win:maximize-toggle', (e) => {
    const win = winOf(e)
    if (!win) return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })
  ipcMain.on('win:close', (e) => winOf(e)?.close())

  ipcMain.handle('root:get', (): RootStatus => status())

  ipcMain.handle('root:choose', async (): Promise<RootStatus> => {
    if (ENV_ROOT) return status()
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const r = await dialog.showOpenDialog(win, {
      title: 'スイング素材フォルダ（images/ がある場所）を選択',
      properties: ['openDirectory'],
      defaultPath: dataRoot ?? app.getPath('home'),
    })
    if (r.canceled || !r.filePaths[0]) return status()
    dataRoot = resolve(r.filePaths[0])
    writeSettings({ ...readSettings(), dataRoot })
    console.log(`[main] データルート変更: ${dataRoot}`)
    return status()
  })

  ipcMain.handle('root:reveal', () => {
    if (dataRoot && existsSync(dataRoot)) void shell.openPath(dataRoot)
  })

  ipcMain.handle('library:load', async (): Promise<Library> => {
    if (!dataRoot) throw new Error('データルートが未設定です。')
    const p = libraryFile(dataRoot)
    if (!existsSync(p)) {
      throw new Error(
        `images/library.json がありません。\n` +
          `アルバムの索引を作成してから起動してください。\n` +
          `(探した場所: ${p})`,
      )
    }
    const lib = JSON.parse(await readFile(p, 'utf-8')) as Library
    console.log(
      `[main] library.json 読込: ${lib.albums.length} アルバム / ` +
        `${lib.albums.reduce((n, a) => n + a.frames.length, 0)} 枚  (root=${dataRoot})`,
    )
    return lib
  })

  ipcMain.handle('anno:load', async (_e, albumDir: string): Promise<Annotations | null> => {
    const abs = safeResolve(join(albumDir, 'annotations.json'))
    if (!abs || !existsSync(abs)) return null
    try {
      return JSON.parse(await readFile(abs, 'utf-8')) as Annotations
    } catch {
      return null
    }
  })

  ipcMain.handle('anno:save', async (_e, albumDir: string, data: Annotations) => {
    const abs = safeResolve(join(albumDir, 'annotations.json'))
    if (!abs) throw new Error('保存先が不正です: ' + albumDir)
    await writeFile(abs, JSON.stringify(data, null, 2) + '\n', 'utf-8')
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
