/** main / renderer で共有する型。library.json / album.json の形をそのまま写したもの。 */

export type Direction = '後方' | '正面' | '斜め' | '側面' | '上方' | string

export interface Keyframes {
  address: number
  top: number
  impact: number
  finish: number
}

export interface AlignmentFrame {
  dx: number
  dy: number
  confidence: number
}

export interface Alignment {
  version: number
  reference_frame: string
  image_size: [number, number]
  frames: Record<string, AlignmentFrame>
  validation?: {
    residual_before: number | null
    residual_after: number | null
    rejected_frames: string[]
    modal_size?: [number, number]
    odd_size_frames?: string[]
  }
}

export interface Album {
  /** images/ からの相対パス（スラッシュ区切り） */
  dir: string
  player: string
  club: string
  direction: Direction
  situation: string
  published_date: string
  album_id: string
  album_title: string
  /** 時系列順のファイル名。exclude_frames は除外済み */
  frames: string[]
  width: number
  height: number
  has_background: boolean
  excluded_frames?: string[]
  alignment?: Alignment
  keyframes?: { source: string; frames: Keyframes }
  /** 動画由来アルバムのみ */
  video?: {
    source?: string
    start_sec?: number
    end_sec?: number
    times_sec?: number[]
    clip?: string
  }
}

export interface Library {
  version: number
  albums: Album[]
}

/** 注釈。アルバム内 annotations.json に保存する。座標は 0..1 の正規化値。 */
export type ShapeType = 'line' | 'extline' | 'hline' | 'vline' | 'circle'

export interface Shape {
  id: string
  type: ShapeType
  color: string
  width: number
  /** line / extline / circle */
  p1?: [number, number]
  p2?: [number, number]
  /** hline */
  y?: number
  /** vline */
  x?: number
}

export interface Annotations {
  version: number
  album: { shapes: Shape[] }
  frames: Record<string, { shapes: Shape[] }>
}

export const emptyAnnotations = (): Annotations => ({
  version: 1,
  album: { shapes: [] },
  frames: {},
})

/** userData/settings.json の中身 */
export interface Settings {
  /** images/ と videos/ を置いた素材フォルダの絶対パス */
  dataRoot?: string
}

/** データルートの状態。初回セットアップ画面の出し分けに使う。 */
export interface RootStatus {
  path: string | null
  source: 'env' | 'settings' | 'none'
  /** フォルダ自体が存在するか */
  exists: boolean
  /** images/library.json があるか（解析済みか） */
  hasLibrary: boolean
  /** 環境変数で固定されている間は UI から変更できない */
  locked: boolean
  settingsFile: string
}

/** preload が公開する API */
export interface SwingApi {
  loadLibrary(): Promise<Library>
  loadAnnotations(albumDir: string): Promise<Annotations>
  saveAnnotations(albumDir: string, data: Annotations): Promise<void>
  /** 画像URL（カスタムプロトコル）に変換する */
  assetUrl(relPath: string): string
  /** 現在のデータルート */
  getRoot(): Promise<RootStatus>
  /** フォルダ選択ダイアログを出して保存する。キャンセル時は現状のまま返る */
  chooseRoot(): Promise<RootStatus>
  /** データルートをエクスプローラーで開く */
  revealRoot(): Promise<void>
  /** フレームレスなので最小化・最大化・閉じるは自前で呼ぶ */
  window: {
    minimize(): void
    maximizeToggle(): void
    close(): void
  }
}
