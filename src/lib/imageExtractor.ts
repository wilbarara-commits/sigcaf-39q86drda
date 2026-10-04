import pb from '@/lib/pocketbase/client'

export interface ImageExtractionOptions {
  onProgress?: (progress: number, statusText: string) => void
}

export interface ImageExtractionResult {
  text: string
  source: 'agent' | 'documents' | 'local_ocr'
}

/**
 * Consulta o backend para que o agente nativo 'ocr-pedidos-extractor' estruture e limpe
 * o texto de pedidos (especialmente em tabelas/planilhas com células vazias ou cinzas).
 */
async function callAgentToFormatText(
  rawText: string,
  onProgress?: (progress: number, statusText: string) => void,
): Promise<string | null> {
  if (!rawText.trim()) return null
  try {
    onProgress?.(85, 'Estruturando dados da tabela com o agente do servidor...')
    const res = await fetch(`${pb.baseUrl}/backend/v1/pedidos/extrair-imagem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(pb.authStore.token ? { Authorization: pb.authStore.token } : {}),
      },
      body: JSON.stringify({ texto_ocr: rawText }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data && typeof data.texto === 'string' && data.texto.trim()) {
        return data.texto.trim()
      }
    }
  } catch (err) {
    console.warn('[imageExtractor] Agente nativo indisponível para pós-processamento:', err)
  }
  return null
}

/**
 * Executa OCR via Tesseract.js diretamente no navegador com suporte a português,
 * otimização para tabelas e tratamento de linhas com células vazias.
 */
async function runLocalTesseract(
  file: File,
  onProgress?: (progress: number, statusText: string) => void,
): Promise<string> {
  onProgress?.(30, 'Iniciando mecanismo de OCR local...')

  const { createWorker, PSM } = await import('tesseract.js')
  const worker = await createWorker('por', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        const pct = Math.round(30 + (m.progress || 0) * 50)
        onProgress?.(
          pct,
          `Reconhecendo texto e números na imagem... (${Math.round((m.progress || 0) * 100)}%)`,
        )
      } else if (m.status === 'loading tesseract core' || m.status === 'initializing tesseract') {
        onProgress?.(35, 'Carregando modelos OCR...')
      } else if (m.status === 'loading language traineddata') {
        onProgress?.(45, 'Carregando dicionário em português...')
      }
    },
  })

  // Configura parâmetros para tabelas/documentos multilinha
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: '1',
    })
  } catch (_) {
    // Se setParameters falhar em alguma versão, segue com o padrão
  }

  const ret = await worker.recognize(file)
  await worker.terminate()

  return (ret.data?.text || '').trim()
}

/**
 * Limpa e formata localmente linhas de tabela caso o agente remoto esteja inacessível.
 * Ignora cabeçalhos estruturais e linhas sem quantidade numérica válida.
 */
function cleanTableOcrText(rawText: string): string {
  const lines = rawText.split(/\r?\n/)
  const result: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Ignora linhas de cabeçalho típico de tabela
    const upper = trimmed.toUpperCase()
    if (
      upper.startsWith('PRODUTO') ||
      upper.startsWith('UNIDADE') ||
      (upper.includes('PRODUTOS') && upper.includes('UNIDADE'))
    ) {
      continue
    }

    result.push(trimmed)
  }

  return result.join('\n')
}

/**
 * Extrai texto literal de um arquivo de imagem (.jpg, .jpeg, .png).
 * 1. Tenta primeiro o endpoint de backend com agente nativo Skip Cloud e $documents.
 * 2. Se o backend indicar que requer OCR óptico local ou não puder ler pixels,
 *    utiliza Tesseract.js no navegador.
 * 3. Envia o texto reconhecido pelo Tesseract para o agente nativo para estruturar a tabela
 *    (identificando produtos e descartando itens vazios/cinzas).
 * 4. Se o agente não puder processar, utiliza o texto do OCR local filtrado.
 */
export async function extractTextFromImage(
  file: File,
  options?: ImageExtractionOptions,
): Promise<ImageExtractionResult> {
  const { onProgress } = options || {}

  // 1. Tentar extração via backend com Agente Nativo / $documents diretamente
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
  let recognizedText = ''
  try {
    recognizedText = await runLocalTesseract(file, onProgress)
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : 'Falha ao processar e extrair o texto da imagem.'
    throw new Error(errorMsg)
  }

  if (!recognizedText || !recognizedText.trim()) {
    throw new Error(
      'Não foi possível reconhecer texto na imagem — tente uma foto mais nítida ou digite/cole manualmente.',
    )
  }

  // 3. Chamar agente nativo para estruturar e limpar linhas de tabela
  const agentFormatted = await callAgentToFormatText(recognizedText, onProgress)
  if (agentFormatted && agentFormatted.trim().length > 0) {
    onProgress?.(100, 'Tabela estruturada pelo agente com sucesso!')
    return {
      text: agentFormatted.trim(),
      source: 'agent',
    }
  }

  // 4. Fallback final com texto limpo do OCR local
  const cleanedText = cleanTableOcrText(recognizedText)
  onProgress?.(100, 'Texto extraído com sucesso!')
  return {
    text: cleanedText || recognizedText,
    source: 'local_ocr',
  }
}
