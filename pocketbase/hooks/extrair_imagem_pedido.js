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
      console.log('[ocr-hook] RAW INPUT TEXT (len=' + textContent.length + '):\n' + textContent)
      try {
        const agent = $ai.agent('ocr-pedidos-extractor')
        if (agent) {
          const promptMsg =
            'Abaixo está o texto bruto extraído via OCR de uma imagem/foto de tabela de pedido semanal de hortifrúti de uma escola.\n' +
            'INSTRUÇÕES ESTRITAS E CRÍTICAS:\n' +
            '1. A PRIMEIRA LINHA DE PRODUTO É MANDATÓRIA (exemplo: BANANA): NUNCA descarte ou coma a primeira linha válida de dados logo abaixo de cabeçalhos de coluna. Se o primeiro produto com quantidade na tabela for BANANA, ele DEVE ser obrigatoriamente a PRIMEIRA linha emitida ("BANANA: 30,0 Kg").\n' +
            '2. PRESERVE E RESTAURE RIGOROSAMENTE A VÍRGULA DECIMAL: Em tabelas de merenda escolar, quantidades são na escala de dezenas com 1 decimal ("20,0 Kg", "50,0 Kg", "10,0 Kg", "30,0 Kg", "5,0 Kg", "2,5 Kg"). NUNCA emita 200 Kg, 500 Kg, 100 Kg se o original ou contexto da tabela representa 20,0, 50,0 ou 10,0. Se o OCR leu sem vírgula ou você tiver dúvida se é decimal, marque com interrogação na quantidade ("20,0? Kg") em vez de inflar 10x.\n' +
            '3. PRESERVE os espaços entre palavras nos nomes dos produtos ("BATATA DOCE", "COUVE FLOR", "BATATA INGLESA" - NUNCA junte para "BATATADOCE").\n' +
            '4. Formate CADA produto que possua quantidade pedida estritamente no formato:\n' +
            '   PRODUTO: quantidade unidade (exemplo: "BANANA: 30,0 Kg", "BATATA DOCE: 20,0 Kg", "BRÓCOLIS: 50,0 Kg").\n' +
            '5. Se a quantidade de uma linha da tabela estiver vazia, em branco, cinza, com hífen ou zero, IGNORE e NÃO inclua essa linha.\n' +
            '6. Remova apenas os cabeçalhos das colunas (ex: "Produtos", "Unidade", "Pedidos", datas como "21/09", "Agosto").\n' +
            '7. Retorne APENAS as linhas finais no formato "PRODUTO: quantidade unidade", uma por linha, sem markdown.\n\n' +
            'TEXTO OCR DA IMAGEM:\n' +
            textContent

          const res = agent.chat({
            user_id: userId,
            conversation_id: null,
            message: promptMsg,
          })

          if (res && res.content && res.content.trim()) {
            // Limpa eventuais cercas markdown ``` caso o modelo tenha envolvido
            let formatted = res.content.trim()
            formatted = formatted
              .replace(/^```[a-z]*\s*/i, '')
              .replace(/\s*```$/i, '')
              .trim()

            console.log('[ocr-hook] AGENT OUTPUT:\n' + formatted)

            return e.json(200, {
              texto: formatted,
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
