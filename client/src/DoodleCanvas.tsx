import { useEffect, useRef, useState } from 'react'
import { canvasToTransparentPng } from './punchWhite'

type Props = {
  disabled?: boolean
  onSubmit: (dataUrl: string) => void
  submitLabel: string
}

const COLORS = ['#1a0f2e', '#ff6b9d', '#5ce1e6', '#ffe566', '#7c5cff', '#ff8a3d', '#ffffff']

export function DoodleCanvas({ disabled, onSubmit, submitLabel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [color, setColor] = useState(COLORS[0]!)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled || submitted) return
    drawing.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const p = pos(e)
    // White acts as eraser so “white background” never sticks to the avatar
    if (color === '#ffffff') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
      ctx.lineWidth = 14
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = color
      ctx.lineWidth = 6
    }
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const p = pos(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }

  function onPointerUp() {
    drawing.current = false
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) ctx.globalCompositeOperation = 'source-over'
  }

  function clear() {
    if (disabled || submitted) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  function submit() {
    const canvas = canvasRef.current
    if (!canvas || submitted) return
    setSubmitted(true)
    onSubmit(canvasToTransparentPng(canvas))
  }

  return (
    <div className="doodle-wrap">
      <canvas
        ref={canvasRef}
        width={320}
        height={320}
        className="doodle-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div className="doodle-colors">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`swatch${color === c ? ' active' : ''}${c === '#ffffff' ? ' eraser' : ''}`}
            style={{ background: c === '#ffffff' ? undefined : c }}
            aria-label={c === '#ffffff' ? 'Eraser' : c}
            title={c === '#ffffff' ? 'Suddgummi' : c}
            disabled={disabled || submitted}
            onClick={() => setColor(c)}
          />
        ))}
        <button type="button" className="btn ghost" disabled={disabled || submitted} onClick={clear}>
          Clear
        </button>
      </div>
      <button type="button" className="btn primary wide" disabled={disabled || submitted} onClick={submit}>
        {submitLabel}
      </button>
    </div>
  )
}
