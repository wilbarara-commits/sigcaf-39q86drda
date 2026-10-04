// Hook para OCR e transcrição de texto a partir de imagem (.jpg, .jpeg, .png)
// POST /backend/v1/pedidos/extrair-imagem
// Multipart com campo 'arquivo' (ou 'imagem') ou JSON com base64
// Utiliza o agente nativo 'ocr-pedidos-extractor' (ou $ai.chat / $documents como fallback backend)

routerAdd(
  'POST',
  '/backend/v1/pedidos/extrair-imagem',
  (e) => {
    let files = e.findUploadedFiles('arquivo')
    if (!files || files.length === 0) {
      files = e.findUploadedFiles('imagem')
    }

    const userId = e.auth?.id
    if (!userId) {
      throw new UnauthorizedError('Autenticação necessária para processar imagem.')
    }

    let textContent = ''

    // 1) Se veio arquivo multipart, tentar primeiro via $documents.toMarkdown (se suportar imagem)
    if (files && files.length > 0) {
      try {
        const docRes = $documents.toMarkdown({ file: files[0] })
        if (docRes && docRes.markdown && docRes.markdown.trim().length > 0) {
          textContent = docRes.markdown.trim()
        }
      } catch (docErr) {
        // Se $documents não suporta imagem diretamente ou requer outro fluxo, logamos e seguimos
        console.log(
          '[ocr-hook] $documents.toMarkdown não processou o arquivo diretamente:',
          docErr?.message || docErr,
        )
      }
    }

    // 2) Tentar extração via Agente Nativo Skip Cloud
    // Se ainda não temos textContent ou queremos a transcrição do agente nativo
    try {
      const agent = $ai.agent('ocr-pedidos-extractor')
      if (agent) {
        // Mensagem com instrução de transcrição
        const promptMsg = textContent
          ? 'Por favor, formate e transcreva fielmente as linhas de pedidos, itens e quantidades contidas no seguinte texto extraído:\n\n' +
            textContent
          : 'Por favor, transcreva linha a linha todos os produtos, quantidades e dados visíveis do pedido escolar.'

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

    // 3) Se o $documents extraiu texto previamente, retorná-lo
    if (textContent) {
      return e.json(200, {
        texto: textContent,
        origem: 'documents',
      })
    }

    // Se o backend não conseguiu ler a imagem diretamente por ser arquivo de pixels sem text layer,
    // retorna status 422 para que o cliente acione o OCR no navegador (Tesseract.js)
    return e.json(422, {
      message: 'O servidor requer processamento óptico local da imagem.',
      needs_client_ocr: true,
    })
  },
  $apis.requireAuth(),
)
