import { useCallback, useEffect, useRef, useState } from 'react'

type Props = {
  beforeUrl: string
  afterUrl: string
  beforeLabel: string
  afterLabel: string
  hint: string
}

/** Interactive before/after reveal slider */
export function BeforeAfter({ beforeUrl, afterUrl, beforeLabel, afterLabel, hint }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [pct, setPct] = useState(55)
  const [stageW, setStageW] = useState(320)
  const dragging = useRef(false)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const sync = () => setStageW(el.clientWidth)
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const setFromClientX = useCallback((clientX: number) => {
    const el = wrapRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width)
    setPct((x / rect.width) * 100)
  }, [])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return
      setFromClientX(e.clientX)
    }
    const onUp = () => {
      dragging.current = false
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [setFromClientX])

  return (
    <div className="ba-wrap">
      <div
        ref={wrapRef}
        className="ba-stage"
        onPointerDown={(e) => {
          dragging.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          setFromClientX(e.clientX)
        }}
      >
        <img className="ba-img ba-after" src={afterUrl} alt={afterLabel} draggable={false} />
        <div className="ba-before-clip" style={{ width: `${pct}%` }}>
          <img
            className="ba-img ba-before"
            src={beforeUrl}
            alt={beforeLabel}
            draggable={false}
            style={{ width: stageW }}
          />
        </div>
        <div className="ba-handle" style={{ left: `${pct}%` }}>
          <span className="ba-knob" />
        </div>
        <span className="ba-tag ba-tag-before">{beforeLabel}</span>
        <span className="ba-tag ba-tag-after">{afterLabel}</span>
      </div>
      <p className="ba-hint muted">{hint}</p>
    </div>
  )
}
