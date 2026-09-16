import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Shape } from '@shared/types'
import { equalWeights, useStore } from '../store'

/** 分離ボックスブラー。スライディングウィンドウで O(n)。 */
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src
  const d = 2 * r + 1
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  const cl = (v: number, m: number): number => (v < 0 ? 0 : v > m ? m : v)
  for (let y = 0; y < h; y++) {
    const row = y * w
    let sum = 0
    for (let x = -r; x <= r; x++) sum += src[row + cl(x, w - 1)]
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / d
      sum += src[row + cl(x + r + 1, w - 1)] - src[row + cl(x - r, w - 1)]
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0
    for (let y = -r; y <= r; y++) sum += tmp[cl(y, h - 1) * w + x]
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / d
      sum += tmp[cl(y + r + 1, h - 1) * w + x] - tmp[cl(y - r, h - 1) * w + x]
    }
  }
  return out
}

export default function Stage(): JSX.Element {
  const s = useStore()
  const { album } = s
  const hostRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const stroboRef = useRef<HTMLCanvasElement>(null)
  const imgsRef = useRef<HTMLImageElement[]>([])
  const bgRef = useRef<HTMLImageElement | null>(null)
  const maskCache = useRef<{ th: number; data: Record<number, Float32Array> }>({ th: -1, data: {} })
  const [draft, setDraft] = useState<Shape | null>(null)

  const W = album?.width ?? 0
  const H = album?.height ?? 0
  const urls = useMemo(
    () => (album ? album.frames.map((f) => window.swing.assetUrl(album.dir + '/' + f)) : []),
    [album],
  )

  // アルバムが変わったら背景（ストロボ用）を読み直す
  useEffect(() => {
    bgRef.current = null
    maskCache.current = { th: -1, data: {} }
    if (!album?.has_background) return
    const im = new Image()
    im.onload = () => {
      bgRef.current = im
      if (useStore.getState().mode === 'strobo') drawStrobo()
    }
    im.src = window.swing.assetUrl(album.dir + '/derived/background.jpg')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [album?.dir])

  const fit = useCallback(() => {
    const host = hostRef.current
    if (!host || !W || !H) return
    const r = host.getBoundingClientRect()
    const sc = Math.min(r.width / W, r.height / H) * 0.98
    useStore.getState().setView(sc, (r.width - W * sc) / 2, (r.height - H * sc) / 2)
  }, [W, H])

  useEffect(() => {
    fit()
    const on = (): void => fit()
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [fit])

  /** 表示するレイヤーの積み順・不透明度・ブレンドを決める。 */
  const layers = useMemo(() => {
    if (!album) return [] as { i: number; opacity: number; blend: string }[]
    const sel = [...s.selected].sort((a, b) => a - b)
    if (s.mode === 'single') return [{ i: s.cur, opacity: 1, blend: 'normal' }]
    if (s.mode === 'onion') {
      // 残像は現在コマの**上**に半透明で置く。下だと不透明な写真に完全に隠れる。
      const out = [{ i: s.cur, opacity: 1, blend: 'normal' }]
      const ghosts: number[] = []
      for (let k = 0; k < s.onionN; k++) {
        if (s.onionDir !== 'next') ghosts.push(s.cur - 1 - k)
        if (s.onionDir !== 'prev') ghosts.push(s.cur + 1 + k)
      }
      ghosts
        .filter((i) => i >= 0 && i < album.frames.length)
        .forEach((i, k) => out.push({ i, opacity: s.onionOp * Math.pow(0.62, k), blend: 'normal' }))
      return out
    }
    if (s.mode === 'overlay') {
      if (!sel.length) return [{ i: s.cur, opacity: 1, blend: 'normal' }]
      if (s.blend === 'equal') {
        const w = equalWeights(sel.length)
        return sel.map((i, k) => ({
          i,
          opacity: (s.userOpacity[i] ?? 1) * w[k] * s.master,
          blend: 'normal',
        }))
      }
      return sel.map((i, k) => ({
        i,
        opacity: (s.userOpacity[i] ?? 1) * s.master,
        blend: k === 0 ? 'normal' : s.blend,
      }))
    }
    return []
  }, [album, s.mode, s.cur, s.selected, s.blend, s.master, s.userOpacity, s.onionN, s.onionDir, s.onionOp])

  /** ストロボ合成: 背景差分で被写体だけを抽出して重ねる。 */
  const drawStrobo = useCallback(() => {
    const cv = stroboRef.current
    const album = useStore.getState().album
    if (!cv || !album) return
    const g = cv.getContext('2d', { willReadFrequently: true })
    if (!g) return
    const bg = bgRef.current
    const imgs = imgsRef.current
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, W, H)
    if (!bg || !imgs.length || !imgs.every((x) => x && x.complete)) {
      g.fillStyle = '#111'
      g.fillRect(0, 0, W, H)
      g.fillStyle = '#fff'
      g.font = `${Math.round(H / 18)}px sans-serif`
      g.fillText('背景データを読み込み中…', 40, H / 2)
      return
    }
    g.drawImage(bg, 0, 0, W, H)
    const bgData = g.getImageData(0, 0, W, H).data

    const st = useStore.getState()
    const sel = st.selected.size ? [...st.selected].sort((a, b) => a - b) : [st.cur]
    const work = document.createElement('canvas')
    work.width = W
    work.height = H
    const wg = work.getContext('2d', { willReadFrequently: true })
    if (!wg) return
    if (maskCache.current.th !== st.stThresh) maskCache.current = { th: st.stThresh, data: {} }

    for (const i of sel) {
      const o = st.offsetOf(i)
      wg.setTransform(1, 0, 0, 1, 0, 0)
      wg.clearRect(0, 0, W, H)
      wg.setTransform(1, 0, 0, 1, o.dx, o.dy)
      wg.drawImage(imgs[i], 0, 0, W, H)
      wg.setTransform(1, 0, 0, 1, 0, 0)
      const fd = wg.getImageData(0, 0, W, H)
      const d = fd.data
      const n = W * H

      let alpha = maskCache.current.data[i]
      if (!alpha) {
        const dev = new Float32Array(n)
        for (let p = 0, q = 0; q < n; p += 4, q++) {
          dev[q] = Math.max(
            Math.abs(d[p] - bgData[p]),
            Math.abs(d[p + 1] - bgData[p + 1]),
            Math.abs(d[p + 2] - bgData[p + 2]),
          )
        }
        // 素朴な閾値だと斑点が出る。ぼかし→smoothstep→再ぼかしで穴を埋める
        const devB = boxBlur(dev, W, H, 4)
        const lo = st.stThresh * 0.5
        const hi = st.stThresh * 1.5
        const a1 = new Float32Array(n)
        for (let q = 0; q < n; q++) {
          let t = (devB[q] - lo) / (hi - lo)
          t = t < 0 ? 0 : t > 1 ? 1 : t
          a1[q] = t * t * (3 - 2 * t)
        }
        const a2 = boxBlur(a1, W, H, 3)
        alpha = new Float32Array(n)
        for (let q = 0; q < n; q++) alpha[q] = Math.max(a1[q], Math.min(1, a2[q] * 1.9))
        maskCache.current.data[i] = alpha
      }

      const ghost = i === st.cur ? 1 : st.stGhost
      const out = new ImageData(new Uint8ClampedArray(d), W, H)
      const od = out.data
      for (let q = 0, p = 3; q < n; q++, p += 4) od[p] = (alpha[q] * ghost * 255) | 0
      wg.putImageData(out, 0, 0)
      g.drawImage(work, 0, 0)
    }
  }, [W, H])

  useEffect(() => {
    if (s.mode === 'strobo') drawStrobo()
  }, [s.mode, s.cur, s.selected, s.stThresh, s.stGhost, s.align, drawStrobo])

  // ---- ズーム / パン / 描画 ----
  const toImg = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = hostRef.current!.getBoundingClientRect()
    return [(e.clientX - r.left - s.panX) / s.scale, (e.clientY - r.top - s.panY) / s.scale]
  }
  const panRef = useRef<{ x: number; y: number } | null>(null)
  const drawRef = useRef<Shape | null>(null)

  const onWheel = (e: React.WheelEvent): void => {
    if (e.ctrlKey) {
      const r = hostRef.current!.getBoundingClientRect()
      const cx = e.clientX - r.left
      const cy = e.clientY - r.top
      const f = e.deltaY < 0 ? 1.15 : 1 / 1.15
      const ns = Math.min(8, Math.max(0.05, s.scale * f))
      s.setView(ns, cx - (cx - s.panX) * (ns / s.scale), cy - (cy - s.panY) * (ns / s.scale))
    } else {
      s.step(e.deltaY > 0 ? 1 : -1)
    }
  }

  const onDown = (e: React.PointerEvent): void => {
    if (e.button !== 0 || !album) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    if (s.tool === 'pan' || e.shiftKey) {
      panRef.current = { x: e.clientX - s.panX, y: e.clientY - s.panY }
      return
    }
    const [x, y] = toImg(e)
    const base = { id: 's' + Date.now(), color: s.color, width: s.strokeW }
    if (s.tool === 'hline') return s.addShape({ ...base, type: 'hline', y: y / H })
    if (s.tool === 'vline') return s.addShape({ ...base, type: 'vline', x: x / W })
    drawRef.current = { ...base, type: s.tool, p1: [x / W, y / H], p2: [x / W, y / H] }
    setDraft(drawRef.current)
  }
  const onMove = (e: React.PointerEvent): void => {
    if (panRef.current) {
      s.setView(s.scale, e.clientX - panRef.current.x, e.clientY - panRef.current.y)
      return
    }
    if (drawRef.current) {
      const [x, y] = toImg(e)
      const d = { ...drawRef.current, p2: [x / W, y / H] as [number, number] }
      drawRef.current = d
      setDraft(d)
    }
  }
  const onUp = (): void => {
    panRef.current = null
    const d = drawRef.current
    if (d?.p1 && d.p2) {
      const dx = (d.p2[0] - d.p1[0]) * W
      const dy = (d.p2[1] - d.p1[1]) * H
      if (Math.hypot(dx, dy) > 4) s.addShape(d)
    }
    drawRef.current = null
    setDraft(null)
  }

  const shapes = useMemo(() => {
    if (!album) return [] as Shape[]
    const k = album.frames[s.cur]
    return [...s.anno.album.shapes, ...(s.anno.frames[k]?.shapes ?? [])]
  }, [album, s.anno, s.cur])

  if (!album) return <div className="stage" ref={hostRef} />

  return (
    <div
      className={'stage' + (s.tool !== 'pan' ? ' tool' : '') + (panRef.current ? ' panning' : '')}
      ref={hostRef}
      onWheel={onWheel}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      <div
        ref={worldRef}
        className="world"
        style={{
          width: W,
          height: H,
          transform: `translate(${s.panX}px, ${s.panY}px) scale(${s.scale})`,
        }}
      >
        {urls.map((u, i) => {
          const l = layers.find((x) => x.i === i)
          const z = l ? layers.indexOf(l) + 1 : 0
          const o = s.offsetOf(i)
          return (
            <img
              key={u}
              ref={(el) => {
                if (el) imgsRef.current[i] = el
              }}
              className="lay"
              src={u}
              width={W}
              height={H}
              style={{
                display: s.mode !== 'strobo' && l ? 'block' : 'none',
                opacity: l?.opacity ?? 1,
                mixBlendMode: (l?.blend ?? 'normal') as React.CSSProperties['mixBlendMode'],
                zIndex: z,
                transform: `translate(${o.dx}px, ${o.dy}px)`,
              }}
            />
          )
        })}
        <canvas
          ref={stroboRef}
          className="lay"
          width={W}
          height={H}
          style={{ display: s.mode === 'strobo' ? 'block' : 'none', zIndex: 1 }}
        />
        <svg className="anno" viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ zIndex: 999 }}>
          {[...shapes, ...(draft ? [draft] : [])].map((sh) => (
            <ShapeEl key={sh.id + (sh === draft ? 'd' : '')} s={sh} W={W} H={H} />
          ))}
        </svg>
      </div>
    </div>
  )
}

function ShapeEl({ s, W, H }: { s: Shape; W: number; H: number }): JSX.Element | null {
  const common = {
    stroke: s.color,
    strokeWidth: s.width,
    vectorEffect: 'non-scaling-stroke' as const,
    fill: 'none',
  }
  if (s.type === 'hline' && s.y != null)
    return <line x1={0} x2={W} y1={s.y * H} y2={s.y * H} {...common} />
  if (s.type === 'vline' && s.x != null)
    return <line y1={0} y2={H} x1={s.x * W} x2={s.x * W} {...common} />
  if (!s.p1 || !s.p2) return null
  const [x1, y1] = [s.p1[0] * W, s.p1[1] * H]
  const [x2, y2] = [s.p2[0] * W, s.p2[1] * H]
  if (s.type === 'circle')
    return <circle cx={x1} cy={y1} r={Math.hypot(x2 - x1, y2 - y1)} {...common} />
  if (s.type === 'extline') {
    const dx = x2 - x1
    const dy = y2 - y1
    const L = (4 * Math.max(W, H)) / (Math.hypot(dx, dy) || 1)
    return (
      <line x1={x1 - dx * L} y1={y1 - dy * L} x2={x2 + dx * L} y2={y2 + dy * L} {...common} />
    )
  }
  return <line x1={x1} y1={y1} x2={x2} y2={y2} {...common} />
}
