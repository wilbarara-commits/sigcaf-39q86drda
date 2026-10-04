import pb from '@/lib/pocketbase/client'

export interface ImageExtractionOptions {
  onProgress?: (progress: number, statusText: string) => void
}

export interface ImageExtractionResult {
  text: string
  source: 'agent' | 'documents' | 'local_ocr'
}

/**
 * Extrai texto literal de um arquivo de imagem (.jpg, .jpeg, .png).
 * 1. Tenta primeiro o endpoint de backend com agente nativo Skip Cloud e $documents.
 * 2. Se o backend indicar que requer OCR óptico local ou falhar por rede/formato,
 *    utiliza Tesseract.js diretamente no navegador com suporte a português e progresso.
 */
export async function extractTextFromImage(
  file: File,
  options?: ImageExtractionOptions,
): Promise<ImageExtractionResult> {
  const { onProgress } = options || {}

  // 1. Tentar extração via backend com Agente Nativo
  try {
    onProgress?.(15, 'Consultando agente de extração do servidor...')
    const formData = new FormData()
    formData.append('arquivo', file)

    const res = await fetch(`${pb.baseUrl}/backend/v1/pedidos/extrair-imagem`, {
      method: 'POST',
      body: formData,
      headers: pb.authStore.token ? { Authorization: pb.authStore.token } : {},
    })

    if (res.ok) {
      const data = await res.json()
      if (data && typeof data.texto === 'string' && data.texto.trim()) {
        onProgress?.(100, 'Texto extraído com sucesso!')
        return {
          text: data.texto.trim(),
          source: data.origem === 'agente_nativo' ? 'agent' : 'documents',
        }
      }
    }
  } catch (err) {
    console.warn('[imageExtractor] Falha na chamada de backend, iniciando fallback OCR local:', err)
  }

  // 2. Extração via Tesseract.js (cliente)
  onProgress?.(30, 'Iniciando mecanismo de OCR local...')

  try {
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker('por', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          const pct = Math.round(30 + (m.progress || 0) * 65)
          onProgress?.(
            pct,
            `Reconhecendo texto na imagem... (${Math.round((m.progress || 0) * 100)}%)`,
          )
        } else if (m.status === 'loading tesseract core' || m.status === 'initializing tesseract') {
          onProgress?.(35, 'Carregando modelos OCR...')
        } else if (m.status === 'loading language traineddata') {
          onProgress?.(45, 'Carregando dicionário em português...')
        }
      },
    })

    const ret = await worker.recognize(file)
    await worker.terminate()

    const recognizedText = (ret.data?.text || '').trim()

    if (!recognizedText) {
      throw new Error('Nenhum texto visível foi identificado na imagem selecionada.')
    }

    onProgress?.(100, 'Texto extraído com sucesso!')
    return {
      text: recognizedText,
      source: 'local_ocr',
    }
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : 'Falha ao processar e extrair o texto da imagem.'
    throw new Error(errorMsg)
  }
}
