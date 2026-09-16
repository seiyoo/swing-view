import { COLORS, equalWeights, useStore } from '../store'
import type { Blend, Tool } from '../store'

const BLEND_HINT: Record<Blend, string> = {
  equal: '全コマが同じ濃さで写ります。位置合わせ済みなので背景は濁りません。',
  lighten: '各画素の明るい方を採用。白ウェア × 芝ではこれが軌跡を残します。',
  darken: '各画素の暗い方を採用。黒ウェアやクラブの軌跡向き。白ウェアは消えます。',
  difference: '背景との差だけが光ります。動いた量の確認用。',
}

const TOOLS: { t: Tool; label: string }[] = [
  { t: 'pan', label: 'パン' },
  { t: 'line', label: '直線 (L)' },
  { t: 'extline', label: '延長直線' },
  { t: 'hline', label: '水平線 (H)' },
  { t: 'vline', label: '垂直線 (G)' },
  { t: 'circle', label: '円 (C)' },
]

export default function SidePanel(): JSX.Element {
  const s = useStore()
  const a = s.album
  const sel = [...s.selected].sort((x, y) => x - y)
  const w = s.blend === 'equal' ? equalWeights(sel.length) : null
  const v = a?.alignment?.validation

  return (
    <div className="side">
      <div className="tabs">
        <button className={s.tab === 'layers' ? 'on' : ''} onClick={() => s.set('tab', 'layers')}>
          レイヤー
        </button>
        <button className={s.tab === 'draw' ? 'on' : ''} onClick={() => s.set('tab', 'draw')}>
          描画
        </button>
      </div>

      {s.tab === 'layers' ? (
        <div className="body">
          <h4>位置合わせ</h4>
          <label className="chk">
            <input type="checkbox" checked={s.align} onChange={(e) => s.set('align', e.target.checked)} />
            背景を自動整列（推奨）
          </label>
          <p className="hint">
            {!a?.alignment
              ? 'alignment.json がありません'
              : v && v.residual_before != null
                ? `背景残差 ${v.residual_before} → ${v.residual_after}` +
                  (v.rejected_frames.length ? ` / ${v.rejected_frames.length}コマ棄却` : '')
                : '検出済み'}
          </p>

          <h4>オーバーレイ選択</h4>
          <div className="br">
            <button className="btn" onClick={s.selectAll}>全コマ (A)</button>
            <button className="btn" onClick={s.selectKey}>主要4コマ</button>
            <button className="btn" onClick={s.clearSelect}>クリア</button>
          </div>
          <div className="layers">
            {a?.frames.map((_, i) => {
              const on = s.selected.has(i)
              const k = sel.indexOf(i)
              const eff = !on ? 0 : w ? 1 / sel.length : (s.userOpacity[i] ?? 1)
              return (
                <div className={'li' + (on && k === 0 ? ' base' : '')} key={i}>
                  <input type="checkbox" checked={on} onChange={() => s.toggleSelect(i)} />
                  <span className="no">{i + 1}</span>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    disabled={!!w}
                    value={Math.round((s.userOpacity[i] ?? 1) * 100)}
                    onChange={(e) =>
                      s.set('userOpacity', { ...s.userOpacity, [i]: +e.target.value / 100 })
                    }
                  />
                  <span className="pct">{on ? Math.round(eff * 100) + '%' : '–'}</span>
                </div>
              )
            })}
          </div>

          <h4>合成</h4>
          <div className="row">
            <label>方式</label>
            <select value={s.blend} onChange={(e) => s.set('blend', e.target.value as Blend)}>
              <option value="equal">均等透過（推奨）</option>
              <option value="lighten">比較(明) — 白ウェア向き</option>
              <option value="darken">比較(暗) — 黒ウェア向き</option>
              <option value="difference">差の絶対値</option>
            </select>
          </div>
          <div className="row">
            <label>全体濃度</label>
            <input type="range" min={20} max={100} value={Math.round(s.master * 100)}
              onChange={(e) => s.set('master', +e.target.value / 100)} />
          </div>
          <p className="hint">{BLEND_HINT[s.blend]}</p>

          <h4>オニオンスキン</h4>
          <div className="row">
            <label>残像コマ数</label>
            <select value={s.onionN} onChange={(e) => s.set('onionN', +e.target.value)}>
              <option>1</option><option>2</option><option>3</option>
            </select>
          </div>
          <div className="row">
            <label>方向</label>
            <select value={s.onionDir} onChange={(e) => s.set('onionDir', e.target.value as never)}>
              <option value="prev">前</option><option value="next">後</option><option value="both">前後</option>
            </select>
          </div>
          <div className="row">
            <label>残像の濃さ</label>
            <input type="range" min={15} max={80} value={Math.round(s.onionOp * 100)}
              onChange={(e) => s.set('onionOp', +e.target.value / 100)} />
          </div>

          <h4>ストロボ（被写体抽出）</h4>
          <p className="hint">背景を除去し、動いている体とクラブだけを重ねます。</p>
          <div className="row">
            <label>感度</label>
            <input type="range" min={8} max={60} value={s.stThresh}
              onChange={(e) => s.set('stThresh', +e.target.value)} />
          </div>
          <div className="row">
            <label>ゴースト濃度</label>
            <input type="range" min={30} max={100} value={Math.round(s.stGhost * 100)}
              onChange={(e) => s.set('stGhost', +e.target.value / 100)} />
          </div>
        </div>
      ) : (
        <div className="body">
          <h4>ツール</h4>
          <div className="br">
            {TOOLS.map((t) => (
              <button key={t.t} className={'btn' + (s.tool === t.t ? ' on' : '')}
                onClick={() => s.set('tool', t.t)}>
                {t.label}
              </button>
            ))}
          </div>

          <h4>色 / 線幅</h4>
          <div className="br">
            {COLORS.map((c) => (
              <div key={c} className={'sw' + (s.color === c ? ' on' : '')}
                style={{ background: c }} onClick={() => s.set('color', c)} />
            ))}
          </div>
          <div className="row">
            <label>線幅</label>
            <select value={s.strokeW} onChange={(e) => s.set('strokeW', +e.target.value)}>
              <option value={1}>細</option><option value={2}>中</option><option value={4}>太</option>
            </select>
          </div>

          <h4>スコープ</h4>
          <label className="chk">
            <input type="radio" checked={s.scope === 'album'} onChange={() => s.set('scope', 'album')} />
            アルバム共通（全コマ表示）
          </label>
          <label className="chk">
            <input type="radio" checked={s.scope === 'frame'} onChange={() => s.set('scope', 'frame')} />
            このコマのみ
          </label>

          <h4>操作</h4>
          <div className="br">
            <button className="btn" onClick={s.undo}>元に戻す (Ctrl+Z)</button>
            <button className="btn" onClick={s.clearAnno}>全消去</button>
          </div>
          <p className="hint">注釈はアルバム内 annotations.json に自動保存されます。</p>
        </div>
      )}
    </div>
  )
}
