/**
 * Utilitário para compactação e redimensionamento de fotos no cliente
 * antes de salvar em base64 (offline) e upload para o PocketBase.
 * Redimensiona para max ~1280px mantendo proporção e converte para JPEG qualidade ~0.75-0.8.
 */

export interface ImageCompressionOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
  allowUpscale?: boolean
  /**
   * Tamanho máximo em bytes abaixo do qual, se a imagem já couber dentro de maxWidth/maxHeight,
   * ela não precisa ser reprocessada.
   * Padrão para fotos de entrega: ~300KB (307.200 bytes).
   */
  maxBytesToSkipProcessing?: number
}

export interface CompressedImageResult {
  dataUrl: string
  blob: Blob
  width: number
  height: number
  originalSizeBytes: number
  compressedSizeBytes: number
  wasCompressed: boolean
}

/**
 * Redimensiona e compacta uma imagem no navegador usando Canvas.
 * Se a imagem já estiver dentro das dimensões máximas e abaixo de maxBytesToSkipProcessing,
 * ela é mantida sem recompressão desnecessária.
 */
export async function compressImage(
  fileOrBlob: File | Blob,
  options?: ImageCompressionOptions,
): Promise<CompressedImageResult> {
  const maxWidth = options?.maxWidth ?? 1280
  const maxHeight = options?.maxHeight ?? 1280
  const quality = options?.quality ?? 0.75
  const allowUpscale = options?.allowUpscale ?? false
  const maxBytesToSkip = options?.maxBytesToSkipProcessing ?? 300 * 1024 // 300KB

  const originalSizeBytes = fileOrBlob.size

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Erro ao ler arquivo de imagem'))
    reader.onload = () => {
      const originalDataUrl = reader.result as string
      const img = new Image()
      img.onerror = () => reject(new Error('Erro ao carregar elemento de imagem'))
      img.onload = () => {
        const origWidth = img.naturalWidth || img.width
        const origHeight = img.naturalHeight || img.height

        const isDimensionSmall = origWidth <= maxWidth && origHeight <= maxHeight
        const isSizeSmall = originalSizeBytes > 0 && originalSizeBytes <= maxBytesToSkip
        const isAlreadyJpeg = fileOrBlob.type === 'image/jpeg' || fileOrBlob.type === 'image/jpg'

        // Se a foto original já está dentro da resolução máxima e o tamanho é leve,
        // não reprocessa desnecessariamente (critério de aceitação #3)
        if (isDimensionSmall && isSizeSmall && isAlreadyJpeg) {
          resolve({
            dataUrl: originalDataUrl,
            blob: fileOrBlob,
            width: origWidth,
            height: origHeight,
            originalSizeBytes,
            compressedSizeBytes: originalSizeBytes,
            wasCompressed: false,
          })
          return
        }

        let width = origWidth
        let height = origHeight

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height)
          width = Math.max(1, Math.round(width * ratio))
          height = Math.max(1, Math.round(height * ratio))
        } else if (allowUpscale && width < maxWidth && height < maxHeight) {
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

        // Fundo branco caso haja transparência (PNG/WebP) antes de salvar em JPEG
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)

        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Falha ao gerar blob comprimido'))
              return
            }
            resolve({
              dataUrl,
              blob,
              width,
              height,
              originalSizeBytes,
              compressedSizeBytes: blob.size,
              wasCompressed: true,
            })
          },
          'image/jpeg',
          quality,
        )
      }
      img.src = originalDataUrl
    }
    reader.readAsDataURL(fileOrBlob)
  })
}

/**
 * Comprime a foto de entrega tirada/selecionada pelo motorista:
 * - Resolução máxima: 1280px no lado maior mantendo proporção
 * - Formato: image/jpeg com qualidade moderada ~0.75 (ótima nitidez com peso ~80KB-200KB)
 * - Se a foto já for pequena (<= 1280px e <= 300KB em JPEG), preserva sem reprocessar
 */
export async function compressFotoEntregaMotorista(
  fileOrBlob: File | Blob,
): Promise<CompressedImageResult> {
  return compressImage(fileOrBlob, {
    maxWidth: 1280,
    maxHeight: 1280,
    quality: 0.75,
    allowUpscale: false,
    maxBytesToSkipProcessing: 300 * 1024,
  })
}

/**
 * Comprime e redimensiona especificamente fotos de fornecedores
 * Limite de caixa: 300x300 pixels (mantendo proporção, sem upscale se menor)
 * Formato: image/jpeg com qualidade 0.85
 * Retorna um File pronto para envio via FormData ao PocketBase.
 */
export async function compressFornecedorFoto(
  fileOrBlob: File | Blob,
  fileName = 'fornecedor-foto.jpg',
): Promise<{
  file: File
  dataUrl: string
  blob: Blob
  width: number
  height: number
  sizeBytes: number
}> {
  const result = await compressImage(fileOrBlob, {
    maxWidth: 300,
    maxHeight: 300,
    quality: 0.85,
    allowUpscale: false,
    maxBytesToSkipProcessing: 0, // fotos de perfil sempre passam pela caixa 300x300
  })

  // Constrói objeto File nomeado em JPEG
  const safeName = fileName.replace(/\.[^/.]+$/, '') + '.jpg'
  const file = new File([result.blob], safeName, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })

  return {
    file,
    dataUrl: result.dataUrl,
    blob: result.blob,
    width: result.width,
    height: result.height,
    sizeBytes: result.blob.size,
  }
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

/**
 * Formata tamanho em bytes para leitura humana (ex: 154 KB, 1.2 MB)
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
