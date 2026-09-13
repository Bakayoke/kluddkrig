/** Make near-white / cream pixels fully transparent (avatar cutout). */
export function punchNearWhiteTransparent(
  source: HTMLCanvasElement | HTMLImageElement,
): HTMLCanvasElement {
  const w = 'naturalWidth' in source ? source.naturalWidth || source.width : source.width
  const h = 'naturalHeight' in source ? source.naturalHeight || source.height : source.height
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')
  if (!ctx || w === 0 || h === 0) return out
  ctx.drawImage(source, 0, 0)
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]!
    const g = d[i + 1]!
    const b = d[i + 2]!
    // Near-white / paper cream → transparent
    if (r >= 235 && g >= 230 && b >= 220) {
      d[i + 3] = 0
    }
  }
  ctx.putImageData(img, 0, 0)
  return out
}

export function canvasToTransparentPng(canvas: HTMLCanvasElement): string {
  return punchNearWhiteTransparent(canvas).toDataURL('image/png')
}
