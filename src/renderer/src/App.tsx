import { useEffect, useMemo } from 'react'
import type { Album } from '@shared/types'
import { useStore } from './store'
import type { Mode, Tool } from './store'
import Stage from './components/Stage'
import SidePanel from './components/SidePanel'
import Setup from './components/Setup'
import Titlebar from './components/Titlebar'

const MODES: { m: Mode; label: string }[] = [
  { m: 'single', label: 'シングル' },
  { m: 'onion', label: 'オニオン (O)' },
  { m: 'overlay', label: 'オーバーレイ (V)' },
  { m: 'strobo', label: 'ストロボ (S)' },
]
const KF_LABEL = ['アドレス', 'トップ', 'インパクト', 'フィニッシュ']

export default function App(): JSX.Element {
  const s = useStore()

  useEffect(() => {
    void s.init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- キーボード ----
  useEffect(() => {
    const on = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return
      const st = useStore.getState()
      if (e.ctrlKey && e.key === 'z') return st.undo()
      const n = st.album?.frames.length ?? 0
      switch (e.key) {
        case 'ArrowLeft': st.step(-1); break
        case 'ArrowRight': st.step(1); break
        case 'Home': st.setCur(0); break
        case 'End': st.setCur(n - 1); break
        case 'o': case 'O': st.setMode(st.mode === 'onion' ? 'single' : 'onion'); break
        case 'v': case 'V': st.setMode(st.mode === 'overlay' ? 'single' : 'overlay'); break
        case 's': case 'S': st.setMode(st.mode === 'strobo' ? 'single' : 'strobo'); break
        case 'a': case 'A': st.selectAll(); break
        case 'l': case 'L': st.set('tool', 'line' as Tool); st.set('tab', 'draw'); break
        case 'c': case 'C': st.set('tool', 'circle' as Tool); st.set('tab', 'draw'); break
        case 'h': case 'H': st.set('tool', 'hline' as Tool); st.set('tab', 'draw'); break
        case 'g': case 'G': st.set('tool', 'vline' as Tool); st.set('tab', 'draw'); break
        case 'Escape': st.set('tool', 'pan' as Tool); break
        default:
          if (/^[0-9]$/.test(e.key)) {
            const v = e.key === '0' ? 10 : +e.key
            if (v <= n) st.setCur(v - 1)
          }
      }
    }
    document.addEventListener('keydown', on)
    return () => document.removeEventListener('keydown', on)
  }, [])

  const tree = useMemo(() => buildTree(s.library?.albums ?? []), [s.library])
  const kf = s.keyFrames()
  const a = s.album

  // 起動直後はデータルートの問い合わせ待ち。未設定・未解析ならセットアップ画面。
  // フレームレスなので、どの画面でもタイトルバー（＝移動・閉じる手段）は必ず出す。
  if (!s.root) {
    return (
      <div className="plain">
        <Titlebar />
        <div className="setup" />
      </div>
    )
  }
  if (!s.root.hasLibrary) {
    return (
      <div className="plain">
        <Titlebar />
        <Setup />
      </div>
    )
  }

  if (s.error) {
    return (
      <div className="plain">
        <Titlebar />
        <div className="fatal">
          <h2>ライブラリを読み込めませんでした</h2>
          <pre>{s.error}</pre>
          <div className="br">
            <button className="btn" disabled={s.root.locked} onClick={() => void s.chooseRoot()}>
              素材フォルダを選び直す…
            </button>
            <button className="btn" onClick={() => void s.init()}>再読み込み</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <Titlebar
        right={
          <button
            className="btn mini root"
            title={s.root.locked ? '環境変数で固定されています' : s.root.path ?? ''}
            disabled={s.root.locked}
            onClick={() => void s.chooseRoot()}
          >
            素材: {folderName(s.root.path)}
          </button>
        }
      >
        <span>{a ? a.album_title : 'ライブラリ読込中…'}</span>
      </Titlebar>

      <div className="lib">
        <h3>ライブラリ (images/)</h3>
        {tree.map((row, i) =>
          row.kind === 'album' ? (
            <div
              key={i}
              className={'album' + (s.albumIndex === row.index ? ' on' : '')}
              title={row.title}
              onClick={() => void s.openAlbum(row.index!)}
            >
              {row.label}
            </div>
          ) : (
            <div key={i} className={row.kind}>{row.label}</div>
          ),
        )}
      </div>

      <Stage />
      <SidePanel />

      <div className="strip">
        <div className="modes">
          {MODES.map((m) => (
            <button key={m.m} className={'btn' + (s.mode === m.m ? ' on' : '')}
              onClick={() => s.setMode(m.m)}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="thumbs">
          {a?.frames.map((f, i) => {
            const k = kf.indexOf(i)
            const selIdx = [...s.selected].sort((x, y) => x - y).indexOf(i)
            return (
              <div
                key={f}
                className={'thumb' + (i === s.cur ? ' cur' : '') + (s.selected.has(i) ? ' sel' : '')}
                onClick={(e) => (e.ctrlKey ? s.toggleSelect(i) : s.setCur(i))}
              >
                <img src={window.swing.assetUrl(a.dir + '/' + f)} loading="lazy" alt="" />
                <span className="no">{i + 1}</span>
                {s.selected.has(i) && <span className="mk">{selIdx === 0 ? '基準' : '✓'}</span>}
                {k >= 0 && <span className="kf">{KF_LABEL[k]}</span>}
              </div>
            )
          })}
        </div>
      </div>

      <div className="status">
        <span>{a ? `${a.player} / ${a.club} / ${a.direction}` : ''}</span>
        <span>コマ <b>{s.cur + 1}</b>/{a?.frames.length ?? 0}</span>
        <span>ズーム <b>{Math.round(s.scale * 100)}%</b></span>
        <span>モード <b>{MODES.find((m) => m.m === s.mode)?.label}</b></span>
        {!s.align && <span className="warn">⚠ 整列OFF</span>}
        <span className="r">
          {s.message || '←→:送り ｜ ホイール:送り ｜ Ctrl+ホイール:ズーム ｜ Ctrl+クリック:重ね選択'}
        </span>
      </div>
    </div>
  )
}

/** タイトルバー表示用に末尾のフォルダ名だけ取り出す。 */
function folderName(p: string | null): string {
  if (!p) return '未設定'
  const parts = p.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? p
}

interface Row {
  kind: 'lv1' | 'lv2' | 'lv3' | 'album'
  label: string
  index?: number
  title?: string
}

/** 選手 > クラブ > 方向 > アルバム の4階層に並べる。 */
function buildTree(albums: Album[]): Row[] {
  const rows: Row[] = []
  const seen = new Set<string>()
  albums.forEach((a, i) => {
    const parts: [Row['kind'], string][] = [
      ['lv1', a.player],
      ['lv2', a.club],
      ['lv3', a.direction],
    ]
    parts.forEach(([kind, label], d) => {
      const path = [a.player, a.club, a.direction].slice(0, d + 1).join('/')
      if (seen.has(kind + path)) return
      seen.add(kind + path)
      rows.push({ kind, label })
    })
    rows.push({
      kind: 'album',
      index: i,
      title: a.album_title,
      label: `${a.published_date} ${a.situation || a.album_id}（${a.frames.length}枚）`,
    })
  })
  return rows
}
