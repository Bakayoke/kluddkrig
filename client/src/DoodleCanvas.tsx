import { useEffect, useRef, useState } from 'react'

type Props = {
  disabled?: boolean
  onSubmit: (dataUrl: string) => void
  submitLabel: string
  /** When set, load under drawings (sabotage pass) */
  baseImageUrl?: string | null
  paper?: boolean
}

const COLORS = ['#1a0f2e', '#ff6b9d', '#5ce1e6', '#ffe566', '#7c5cff', '#ff8a3d', '#ffffff']

export function DoodleCanvas({
  disabled,
  onSubmit,
  submitLabel,
  baseImageUrl,
  paper = true,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [color, setColor] = useState(COLORS[0]!)
  const [submitted, setSubmitted] = useState(false)
  const [ready, setReady] = useState(!baseImageUrl)

  useEffect(() => {
    setSubmitted(false)
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const paintPaper = () => {
      if (paper) {
        ctx.fillStyle = '#fff6e8'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }

    paintPaper()

    if (!baseImageUrl) {
      setReady(true)
      return
    }

    setReady(false)
    const img = new Image()
    img.onload = () => {
      paintPaper()
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      setReady(true)
    }
    img.onerror = () => setReady(true)
    img.src = baseImageUrl
  }, [baseImageUrl, paper])

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled || submitted || !ready) return
    drawing.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const p = pos(e)
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
    if (disabled || submitted || !ready) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    if (paper) {
      ctx.fillStyle = '#fff6e8'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
    if (baseImageUrl) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      img.src = baseImageUrl
    }
  }

  function submit() {
    const canvas = canvasRef.current
    if (!canvas || submitted || !ready) return
    setSubmitted(true)
    onSubmit(canvas.toDataURL('image/png'))
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
            disabled={disabled || submitted || !ready}
            onClick={() => setColor(c)}
          />
        ))}
        <button
          type="button"
          className="btn ghost"
          disabled={disabled || submitted || !ready}
          onClick={clear}
        >
          Clear
        </button>
      </div>
      <button
        type="button"
        className="btn primary wide"
        disabled={disabled || submitted || !ready}
        onClick={submit}
      >
        {submitLabel}
      </button>
    </div>
  )
}
