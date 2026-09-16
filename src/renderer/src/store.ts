import { create } from 'zustand'
import type { Album, Annotations, Library, RootStatus, Shape, ShapeType } from '@shared/types'
import { emptyAnnotations } from '@shared/types'

export type Mode = 'single' | 'onion' | 'overlay' | 'strobo'
export type Blend = 'equal' | 'lighten' | 'darken' | 'difference'
export type Tool = 'pan' | ShapeType
export type Scope = 'album' | 'frame'

export const COLORS = ['#ff3b30', '#ffb84d', '#34c759', '#4da3ff', '#ff6ad5', '#ffffff']

export interface State {
  /** データルートの状態。null は問い合わせ前（起動直後）。 */
  root: RootStatus | null
  library: Library | null
  error: string | null
  albumIndex: number
  album: Album | null

  mode: Mode
  cur: number
  selected: Set<number>
  userOpacity: Record<number, number>
  master: number
  blend: Blend

  onionN: number
  onionDir: 'prev' | 'next' | 'both'
  onionOp: number

  align: boolean
  stThresh: number
  stGhost: number

  scale: number
  panX: number
  panY: number

  tool: Tool
  color: string
  strokeW: number
  scope: Scope
  anno: Annotations
  undoStack: Shape[]

  tab: 'layers' | 'draw'
  message: string
}

export interface Actions {
  init(): Promise<void>
  chooseRoot(): Promise<void>
  openAlbum(i: number): Promise<void>
  setMode(m: Mode): void
  setCur(i: number): void
  step(d: number): void
  toggleSelect(i: number): void
  selectAll(): void
  selectKey(): void
  clearSelect(): void
  set<K extends keyof State>(k: K, v: State[K]): void
  setView(scale: number, panX: number, panY: number): void
  addShape(s: Shape): void
  undo(): void
  clearAnno(): void
  keyFrames(): number[]
  offsetOf(i: number): { dx: number; dy: number }
  msg(m: string): void
}

/**
 * 均等透過の不透明度列。
 * 下から k 番目に 1/(k+1) を与えるとアルファ合成の結果が全コマ均等になる。
 * 一定値を全レイヤーに与えると寄与が指数的に減衰し、古いコマが事実上消える。
 */
export const equalWeights = (n: number): number[] =>
  Array.from({ length: n }, (_, k) => 1 / (k + 1))

let saveTimer: ReturnType<typeof setTimeout> | null = null

export const useStore = create<State & Actions>((set, get) => ({
  root: null,
  library: null,
  error: null,
  albumIndex: -1,
  album: null,

  mode: 'single',
  cur: 0,
  selected: new Set<number>(),
  userOpacity: {},
  master: 1,
  blend: 'equal',

  onionN: 1,
  onionDir: 'prev',
  onionOp: 0.5,

  align: true,
  stThresh: 26,
  stGhost: 0.65,

  scale: 1,
  panX: 0,
  panY: 0,

  tool: 'pan',
  color: COLORS[0],
  strokeW: 2,
  scope: 'album',
  anno: emptyAnnotations(),
  undoStack: [],

  tab: 'layers',
  message: '',

  /**
   * データルートを確認してからライブラリを読む。
   * 素材フォルダは別リポジトリなので、未設定・未解析ならセットアップ画面に落とす。
   */
  async init() {
    const root = await window.swing.getRoot()
    set({ root })
    if (!root.hasLibrary) {
      set({ library: null, album: null, albumIndex: -1, error: null })
      return
    }
    try {
      const library = await window.swing.loadLibrary()
      set({ library, error: null })
      if (library.albums.length) await get().openAlbum(0)
      else set({ message: 'アルバムがありません' })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  async chooseRoot() {
    const root = await window.swing.chooseRoot()
    set({ root, error: null })
    await get().init()
  },

  async openAlbum(i) {
    const lib = get().library
    if (!lib || !lib.albums[i]) return
    const album = lib.albums[i]
    const anno = (await window.swing.loadAnnotations(album.dir)) ?? emptyAnnotations()
    set({
      albumIndex: i,
      album,
      anno,
      undoStack: [],
      cur: 0,
      selected: new Set<number>(),
      userOpacity: {},
      mode: 'single',
      message: '',
    })
  },

  setMode(m) {
    const { album, selected } = get()
    if (!album) return
    const next = new Set(selected)
    // 空のまま入っても比較できないので既定選択を入れる。
    // ストロボは背景を除去するので全コマでも潰れない。オーバーレイは主要コマのみ。
    if (next.size === 0) {
      if (m === 'strobo') album.frames.forEach((_, i) => next.add(i))
      else if (m === 'overlay') get().keyFrames().forEach((i) => next.add(i))
    }
    set({ mode: m, selected: next })
  },

  setCur(i) {
    const n = get().album?.frames.length ?? 1
    set({ cur: Math.max(0, Math.min(n - 1, i)) })
  },
  step(d) {
    get().setCur(get().cur + d)
  },

  toggleSelect(i) {
    const s = new Set(get().selected)
    s.has(i) ? s.delete(i) : s.add(i)
    const m = get().mode
    set({ selected: s, mode: m === 'single' && s.size ? 'overlay' : m })
  },
  selectAll() {
    const a = get().album
    if (!a) return
    const cur = get().selected
    const s =
      cur.size === a.frames.length ? new Set<number>() : new Set(a.frames.map((_, i) => i))
    set({ selected: s })
    if (s.size && get().mode === 'single') set({ mode: 'overlay' })
  },
  selectKey() {
    set({ selected: new Set(get().keyFrames()) })
    if (get().mode === 'single') set({ mode: 'overlay' })
  },
  clearSelect() {
    set({ selected: new Set<number>() })
  },

  set: (k, v) => set({ [k]: v } as Pick<State, typeof k>),
  setView: (scale, panX, panY) => set({ scale, panX, panY }),

  addShape(s) {
    const { anno, scope, cur, album } = get()
    if (!album) return
    const next: Annotations = {
      ...anno,
      album: { shapes: [...anno.album.shapes] },
      frames: { ...anno.frames },
    }
    if (scope === 'album') next.album.shapes.push(s)
    else {
      const key = album.frames[cur]
      next.frames[key] = { shapes: [...(next.frames[key]?.shapes ?? []), s] }
    }
    set({ anno: next, undoStack: [...get().undoStack, s] })
    scheduleSave()
  },

  undo() {
    const st = [...get().undoStack]
    const s = st.pop()
    if (!s) return
    const anno = get().anno
    const next: Annotations = {
      ...anno,
      album: { shapes: anno.album.shapes.filter((x) => x.id !== s.id) },
      frames: Object.fromEntries(
        Object.entries(anno.frames).map(([k, v]) => [
          k,
          { shapes: v.shapes.filter((x) => x.id !== s.id) },
        ]),
      ),
    }
    set({ anno: next, undoStack: st })
    scheduleSave()
  },

  clearAnno() {
    set({ anno: emptyAnnotations(), undoStack: [] })
    scheduleSave()
  },

  /** 0始まりのキーフレーム index。無ければ割合モデルで補う。 */
  keyFrames() {
    const a = get().album
    if (!a) return []
    const n = a.frames.length
    const kf = a.keyframes?.frames
    if (kf) return [kf.address, kf.top, kf.impact, kf.finish].map((v) => v - 1)
    return [0, Math.round((n - 1) / 3), Math.round((n - 1) * 0.75), n - 1]
  },

  offsetOf(i) {
    const { align, album } = get()
    if (!align || !album?.alignment) return { dx: 0, dy: 0 }
    const f = album.alignment.frames[album.frames[i]]
    return f ? { dx: f.dx, dy: f.dy } : { dx: 0, dy: 0 }
  },

  msg: (m) => set({ message: m }),
}))

/** 注釈はデバウンスしてアルバム内 annotations.json に書く。 */
function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const { album, anno } = useStore.getState()
    if (album) void window.swing.saveAnnotations(album.dir, anno)
  }, 400)
}
