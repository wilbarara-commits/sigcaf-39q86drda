// Hook para OCR e transcrição de texto a partir de imagem (.jpg, .jpeg, .png)
// POST /backend/v1/pedidos/extrair-imagem
// Suporta:
// 1. Multipart com campo 'arquivo' (ou 'imagem') e opcional campo de texto 'texto_ocr' (vindo do OCR cliente para estruturação pelo agente)
// 2. JSON com { texto_ocr: string } ou { imagem_base64: string }
//
// Utiliza o agente nativo 'ocr-pedidos-extractor' para estruturar tabelas, planilhas e fotos de pedidos
// Retorna { texto: string, origem: 'agente_nativo' | 'documents' | 'local_ocr' }

routerAdd(
  'POST',
  '/backend/v1/pedidos/extrair-imagem',
  (e) => {
    const userId = e.auth?.id
    if (!userId) {
      throw new UnauthorizedError('Autenticação necessária para processar imagem.')
    }

    let rawTextFromClient = ''
    let files = []

    try {
      files = e.findUploadedFiles('arquivo')
      if (!files || files.length === 0) {
        files = e.findUploadedFiles('imagem')
      }
    } catch (_) {}

    // Verifica campos de texto no multipart ou body json
    try {
      const body = e.requestInfo().body || {}
      if (typeof body.texto_ocr === 'string' && body.texto_ocr.trim()) {
        rawTextFromClient = body.texto_ocr.trim()
      }
    } catch (_) {}

    let textContent = rawTextFromClient

    // 1) Se veio arquivo multipart e ainda não temos texto, tentar via $documents.toMarkdown (se for PDF ou doc estruturado)
    if (!textContent && files && files.length > 0) {
      try {
        const docRes = $documents.toMarkdown({ file: files[0] })
        if (docRes && docRes.markdown && docRes.markdown.trim().length > 0) {
          textContent = docRes.markdown.trim()
        }
      } catch (docErr) {
        // Se $documents não suporta imagem diretamente (ex: jpg/png sem OCR server), logamos e seguimos
        console.log(
          '[ocr-hook] $documents.toMarkdown não processou o arquivo diretamente:',
          docErr?.message || docErr,
        )
      }
    }

    // 2) Se temos texto (seja vindo de $documents ou do pré-OCR do cliente), consultar o Agente Nativo Skip Cloud
    // para limpar, estruturar tabela, ignorar células vazias/cinzas e formatar "PRODUTO: quantidade unidade"
    if (textContent) {
      try {
        const agent = $ai.agent('ocr-pedidos-extractor')
        if (agent) {
          const promptMsg =
            'Abaixo está o texto bruto extraído de uma imagem/foto de tabela de pedido escolar.\n' +
            'Por favor, formate e transcreva estritamente os produtos que possuem quantidade pedida no formato "PRODUTO: quantidade unidade" (ex.: "BANANA: 30,0 Kg").\n' +
            'IMPORTANTE: Se a quantidade de uma linha estiver vazia, cinza, zero ou sem valor, IGNORE essa linha (não invente quantidade).\n\n' +
            textContent

          const res = agent.chat({
            user_id: userId,
            conversation_id: null,
            message: promptMsg,
          })

          if (res && res.content && res.content.trim()) {
            return e.json(200, {
              texto: res.content.trim(),
              origem: 'agente_nativo',
            })
          }
        }
      } catch (agentErr) {
        console.log('[ocr-hook] Falha ao consultar agente nativo:', agentErr?.message || agentErr)
      }

      // Se o agente falhou ou retornou vazio, retorna o próprio texto extraído
      return e.json(200, {
        texto: textContent,
        origem: 'documents',
      })
    }

    // 3) Se o backend não recebeu texto e não pôde ler os pixels da imagem diretamente,
    // retorna status 422 para que o cliente acione o OCR no navegador (Tesseract.js)
    return e.json(422, {
      message: 'O servidor requer processamento óptico local da imagem.',
      needs_client_ocr: true,
    })
  },
  $apis.requireAuth(),
)
