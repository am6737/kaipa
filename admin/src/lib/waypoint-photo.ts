// Waypoint photos are thumbnails on the trail, so the browser shrinks and
// re-encodes them before an upload ticket is asked for.
const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIDE = 1600
const JPEG_QUALITY = 0.85

export function isAcceptedPhotoType(mime: string) {
  return ACCEPTED_MIME.includes(mime)
}

async function encodeToJpeg(bitmap: ImageBitmap): Promise<File> {
  if (!bitmap.width || !bitmap.height) throw new Error('图片尺寸为 0，请换一张')
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器无法处理图片，请重试')
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
  )
  if (!blob) throw new Error('图片压缩失败，请重试或换一张')
  return new File([blob], 'waypoint.jpg', { type: 'image/jpeg' })
}

export async function prepareWaypointPhoto(file: File): Promise<File> {
  if (!isAcceptedPhotoType(file.type)) {
    throw new Error('只支持 JPG、PNG、WebP 图片，请重新选择文件')
  }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('图片无法解码，请用原图或换一张')
  }
  try {
    return await encodeToJpeg(bitmap)
  } finally {
    bitmap.close()
  }
}
