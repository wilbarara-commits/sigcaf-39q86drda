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

  // Configura parâmetros otimizados para tabelas/planilhas multilinha:
  // PSM 6 (SINGLE_BLOCK) trata a imagem como um bloco uniforme de texto e evita
  // a fragmentação em colunas verticais isoladas (que no PSM 3/AUTO lê apenas
  // os nomes da primeira coluna e descarta as colunas numéricas adjacentes).
  try {
    const psmMode = PSM.SINGLE_BLOCK ?? ('6' as unknown as typeof PSM.SINGLE_BLOCK)
    await worker.setParameters({
      tessedit_pageseg_mode: psmMode,
      preserve_interword_spaces: '1',
    })
  } catch (_) {
    // Se falhar em alguma versão específica, segue com o padrão do worker
  }

  const ret = await worker.recognize(file)
  let rawExtracted = (ret.data?.text || '').trim()

  // Se por ventura PSM 6 retornar quase nada (< 15 caracteres), tenta um segundo passe com PSM 4 (SINGLE_COLUMN)
  if (!rawExtracted || rawExtracted.length < 15) {
    try {
      const psmCol = PSM.SINGLE_COLUMN ?? ('4' as unknown as typeof PSM.SINGLE_COLUMN)
      await worker.setParameters({
        tessedit_pageseg_mode: psmCol,
        preserve_interword_spaces: '1',
      })
      const retryRet = await worker.recognize(file)
      if (retryRet.data?.text && retryRet.data.text.trim().length > rawExtracted.length) {
        rawExtracted = retryRet.data.text.trim()
      }
    } catch {
      /* intentionally ignored */
    }
  }

  await worker.terminate()

  return rawExtracted
}

/**
 * Limpa e formata localmente linhas de tabela caso o agente remoto esteja inacessível.
 * - Elimina cabeçalhos estruturais (ex: "Produtos", "Unidade BXSTLLS", "Agosto", "$4 21/09").
 * - Descarta linhas que tenham apenas o nome do produto mas sem número de quantidade (célula vazia/cinza).
 * - Formata estritamente no padrão "PRODUTO: quantidade unidade".
 */
export function cleanTableOcrText(rawText: string): string {
  const lines = rawText.split(/\r?\n/)
  const result: string[] = []

  // Expressão regular para cabeçalhos ou fragmentos de cabeçalho conhecidos
  const isHeaderFragment = (upper: string): boolean => {
    if (!upper) return true
    if (upper.startsWith('PRODUTO') || upper.startsWith('UNIDADE')) return true
    if (upper.includes('PRODUTOS') && upper.includes('UNIDADE')) return true
    if (upper.includes('PEDIDOS') || upper.includes('SEMANA') || upper.includes('QTDE')) return true
    if (
      /^(AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO|JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO)/.test(
        upper,
      )
    )
      return true
    if (/^[$S]\d+[\s\d/]*$/.test(upper) || /^\d{1,2}\/\d{1,2}/.test(upper)) return true
    if (/^UNIDADE\s+[A-Z0-9]+$/i.test(upper)) return true
    return false
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const upper = trimmed.toUpperCase()
    if (isHeaderFragment(upper)) {
      continue
    }

    // Se já contém "PRODUTO: quantidade" ou similar
    const colonMatch = trimmed.match(/^([^:]+):\s*(\d+(?:[.,]\d+)?)(?:\s*([a-zA-Z]+))?$/)
    if (colonMatch) {
      const prod = colonMatch[1].trim()
      const qty = colonMatch[2].trim()
      const unit = colonMatch[3]?.trim() || 'Kg'
      if (prod && !isHeaderFragment(prod.toUpperCase())) {
        result.push(`${prod.toUpperCase()}: ${qty} ${unit}`)
      }
      continue
    }

    // Tenta casar linha horizontal de tabela com produto + quantidade
    // ex: "Banana 30,0 Kg", "Cenoura 10,0", "Tomate 30,0 Kg", "Ovos 10 Dz"
    const matchRow = trimmed.match(
      /^([A-Za-zÀ-ÿ\s\-_/]+?)(?:\s+|\s*[-–—|]\s*|\t+)(\d+(?:[.,]\d+)?)(?:\s*([a-zA-Z]+))?$/,
    )
    if (matchRow) {
      const prodName = matchRow[1].trim()
      const qtyStr = matchRow[2].trim()
      const unit = matchRow[3]?.trim() || 'Kg'
      if (prodName.length >= 2 && !isHeaderFragment(prodName.toUpperCase())) {
        result.push(`${prodName.toUpperCase()}: ${qtyStr} ${unit}`)
        continue
      }
    }

    // Se a linha tem apenas texto (sem nenhum dígito), significa produto sem quantidade
    // (célula cinza/vazia na tabela) ou fragmento residual de cabeçalho — DEVE SER DESCARTADA!
    const hasDigits = /\d/.test(trimmed)
    if (!hasDigits) {
      // Ignora produto sem quantidade
      continue
    }

    // Se possui dígitos mas em outro formato (ex: "30,0 Banana"), preserva se fizer sentido
    const matchInverted = trimmed.match(
      /^(\d+(?:[.,]\d+)?)(?:\s*([a-zA-Z]+))?\s+([A-Za-zÀ-ÿ\s\-_/]+)$/,
    )
    if (matchInverted) {
      const qtyStr = matchInverted[1].trim()
      const unit = matchInverted[2]?.trim() || 'Kg'
      const prodName = matchInverted[3].trim()
      if (prodName.length >= 2 && !isHeaderFragment(prodName.toUpperCase())) {
        result.push(`${prodName.toUpperCase()}: ${qtyStr} ${unit}`)
        continue
      }
    }
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
    // Passa pelo filtro defensivo para garantir eliminação de eventuais cabeçalhos
    // residuais ou linhas sem quantidade
    const cleanedAgent = cleanTableOcrText(agentFormatted.trim())
    const finalText = cleanedAgent.trim() || agentFormatted.trim()
    onProgress?.(100, 'Tabela estruturada pelo agente com sucesso!')
    return {
      text: finalText,
      source: 'agent',
    }
  }

  // 4. Fallback final com texto limpo do OCR local garantindo "PRODUTO: quantidade unidade"
  const cleanedText = cleanTableOcrText(recognizedText)
  onProgress?.(100, 'Texto extraído com sucesso!')
  return {
    text: cleanedText || recognizedText,
    source: 'local_ocr',
  }
}
