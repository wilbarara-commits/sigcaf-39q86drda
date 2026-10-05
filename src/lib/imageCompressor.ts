/**
 * Utilitário para compactação e redimensionamento de fotos no cliente
 * antes de salvar em base64 (offline) e upload para o PocketBase.
 * Redimensiona para max ~1280px mantendo proporção e converte para JPEG qualidade ~0.8.
 */

export interface ImageCompressionOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
}

export async function compressImage(
  fileOrBlob: File | Blob,
  options?: ImageCompressionOptions,
): Promise<{ dataUrl: string; blob: Blob; width: number; height: number }> {
  const maxWidth = options?.maxWidth ?? 1280
  const maxHeight = options?.maxHeight ?? 1280
  const quality = options?.quality ?? 0.8

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Erro ao ler arquivo de imagem'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Erro ao carregar elemento de imagem'))
      img.onload = () => {
        let width = img.naturalWidth || img.width
        let height = img.naturalHeight || img.height

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          reject(new Error('Contexto 2D do Canvas indisponível'))
          return
        }

        ctx.drawImage(img, 0, 0, width, height)

        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Falha ao gerar blob comprimido'))
              return
            }
            resolve({ dataUrl, blob, width, height })
          },
          'image/jpeg',
          quality,
        )
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(fileOrBlob)
  })
}

/**
 * Converte dataURL base64 para Blob/File para envio via FormData
 */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const parts = dataUrl.split(',')
    if (parts.length < 2) return null
    const mimeMatch = parts[0].match(/:(.*?);/)
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg'
    const bstr = atob(parts[1])
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n)
    }
    return new Blob([u8arr], { type: mime })
  } catch (e) {
    console.warn('Erro ao converter dataUrl para Blob:', e)
    return null
  }
}
