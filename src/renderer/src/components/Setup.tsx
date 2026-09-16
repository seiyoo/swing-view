import { useStore } from '../store'

/**
 * 初回セットアップ画面。
 * アプリと素材（images/ videos/）は別リポジトリなので、
 * 最初にデータルートを指定してもらう。設定は userData に保存される。
 */
export default function Setup(): JSX.Element {
  const s = useStore()
  const r = s.root

  const state = !r || r.source === 'none' ? 'unset' : !r.exists ? 'missing' : 'unanalyzed'

  return (
    <div className="setup">
      <div className="card">
        {state === 'unset' && (
          <>
            <h2>素材フォルダを選んでください</h2>
            <p>
              連続写真を置いたフォルダ（直下に <code>images/</code> があるもの）を指定します。
              選んだ場所は次回以降も記憶されます。
            </p>
          </>
        )}

        {state === 'missing' && (
          <>
            <h2>素材フォルダが見つかりません</h2>
            <p>
              前回の場所が無くなっているか、移動されています。あらためて選び直してください。
            </p>
          </>
        )}

        {state === 'unanalyzed' && (
          <>
            <h2>ライブラリが未作成です</h2>
            <p>
              フォルダは見つかりましたが <code>images/library.json</code> がありません。
              索引を作成してから「再読み込み」を押してください。
            </p>
          </>
        )}

        {r?.path && (
          <dl className="kv">
            <dt>現在の指定</dt>
            <dd>
              {r.path}
              {!r.locked && r.exists && (
                <button className="btn mini" onClick={() => void window.swing.revealRoot()}>
                  開く
                </button>
              )}
            </dd>
          </dl>
        )}

        <div className="br">
          <button className="btn primary" disabled={r?.locked} onClick={() => void s.chooseRoot()}>
            フォルダを選択…
          </button>
          <button className="btn" onClick={() => void s.init()}>
            再読み込み
          </button>
        </div>

        {r?.locked ? (
          <p className="hint">
            環境変数 <code>SWINGVIEW_DATA_ROOT</code> で固定されているため、ここからは変更できません。
          </p>
        ) : (
          <p className="hint">設定の保存先: {r?.settingsFile}</p>
        )}
      </div>
    </div>
  )
}
