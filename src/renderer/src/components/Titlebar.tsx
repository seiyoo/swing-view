import type { ReactNode } from 'react'

/**
 * フレームレスウィンドウのタイトルバー。
 * 空き領域（.titledrag）と自身が -webkit-app-region: drag なのでここを掴んで動かす。
 * ボタン類は no-drag にしないとクリックが効かない。
 */
export default function Titlebar({
  children,
  right,
}: {
  children?: ReactNode
  right?: ReactNode
}): JSX.Element {
  const w = window.swing.window
  return (
    <div className="titlebar">
      <div className="logo">
        Swing<span>View</span>
      </div>
      {children}
      <div className="titledrag" />
      {right}
      <div className="win-ctrls">
        <button title="最小化" onClick={() => w.minimize()}>
          ─
        </button>
        <button title="最大化 / 元に戻す" onClick={() => w.maximizeToggle()}>
          ▢
        </button>
        <button className="close" title="閉じる" onClick={() => w.close()}>
          ✕
        </button>
      </div>
    </div>
  )
}
