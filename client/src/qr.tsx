import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

export function JoinQr({ url, size = 280, alt }: { url: string; size?: number; alt: string }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void QRCode.toDataURL(url, {
      width: size,
      margin: 1,
      color: { dark: '#1a0f2e', light: '#fff6e8' },
    }).then((data) => {
      if (!cancelled) setSrc(data)
    })
    return () => {
      cancelled = true
    }
  }, [url, size])

  if (!src) {
    return <div className="qr-placeholder" style={{ width: size, height: size }} aria-hidden />
  }
  return <img src={src} width={size} height={size} alt={alt} />
}
