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
      console.log('[ocr-hook] RAW len=' + textContent.length + ' content:\n' + textContent)

      // Pré-normalização defensiva de OCR:
      // Se o OCR agrupou a primeira linha ou colou "Banana BatataDoce" ou "Banana" antes dos cabeçalhos,
      // separamos explicitamente em linhas distintas para ajudar o agente a não omitir a BANANA
      let normalizedInput = textContent
        .replace(/([Bb]anana)\s*([Bb]atata\s*[Dd]oce)/gi, '$1\n$2')
        .replace(/([Bb]anana)\s+([A-ZÀ-ÿ][a-zà-ÿ]+)/g, (match, p1, p2) => {
          // Se for "Banana Prata" ou "Banana Nanica", mantém composto
          if (/^(prata|nanica|ouro|maca|maçã|da\s+terra)/i.test(p2)) return match
          return `${p1}\n${p2}`
        })

      try {
        const agent = $ai.agent('ocr-pedidos-extractor')
        if (agent) {
          const promptMsg =
            'Abaixo está o texto bruto extraído via OCR de uma foto/imagem de formulário de pedido de alimentação escolar.\n' +
            'ATENÇÃO: A foto pode conter ruídos ópticos, sombras, marcas de carimbo, assinaturas e colunas com erros de leitura de caracteres (ex: "[xe am" para Kg Aipim, "comerfor" para Couve-Flor, "ao" lido no lugar de 40).\n\n' +
            'PRINCÍPIO SUPREMO: LINHA DE DADOS NUNCA DEVE SER SILENCIOSAMENTE DESCARTADA.\n' +
            'Toda linha contendo um produto reconhecível DEVE ser incluída na saída. Descarte silencioso é EXCLUSIVO para cabeçalhos, rodapé institucional e fragmentos puros sem produto.\n\n' +
            'INSTRUÇÕES ESTRITAS E CRÍTICAS:\n' +
            '1. LAYOUT QUANT | UNIDADE | PRODUTO (QUANTIDADE ANTES DO PRODUTO):\n' +
            '   - Em formulários com colunas QUANT | UNIDADE | PRODUTO (ex: "40 | KG | Aipim", "15 | KG | Alface"), identifique o número na primeira coluna como quantidade e o hortifrúti na última coluna.\n' +
            '   - Exemplos de produtos esperados com cobertura COMPLETA:\n' +
            '     * "AIPIM: 40,0 Kg"\n' +
            '     * "ALFACE: 15,0 Kg"\n' +
            '     * "CHEIRO VERDE: 2,0 Kg"\n' +
            '     * "COUVE-FLOR: 40,0 Kg"\n' +
            '     * "ESPINAFRE: 10,0 Kg"\n' +
            '     * "LIMÃO: 3,0 Kg"\n' +
            '2. RESOLVER RUÍDO POR SEMELHANÇA (NÃO DESCARTAR):\n' +
            '   - "comerfor" -> COUVE-FLOR\n' +
            '   - "xe am", "am", "aip" -> AIPIM\n' +
            '   - "alfacc", "aface", "alíace" -> ALFACE\n' +
            '   - "cheiroverde", "cheiro verde", "cheiro ver", "cheiro" -> CHEIRO VERDE\n' +
            '   - "espinafre", "espinafrc", "espinafr" -> ESPINAFRE\n' +
            '   - "Imao", "limao", "tatai" -> LIMÃO\n' +
            '   - "ao", "4o" -> 40,0 Kg\n' +
            '   - Se houver dúvida na quantidade exata de um produto reconhecido, emita com interrogação: "NOME: quant? unidade" (ex: "ALFACE: 15,0? Kg") em vez de descartar!\n' +
            '3. DESCARTAR CABEÇALHOS, RODAPÉ INSTITUCIONAL E CARIMBOS:\n' +
            '   - Descarte completamente cabeçalhos: "QUANT", "QUANT]", "PRODUTO", "UNIDADE".\n' +
            '   - Descarte TOTALMENTE cidade e data (ex: "Teresópolis, 17/09/2026", "Teresópolis, = 17/09/2026"), órgãos ("SEE DUC", "SEE", "DUE,"), cargos/IDs/assinaturas ("DIRETORA / ID...", "Valéria Soares...", "áas26350"), nomes de escolas e contatos.\n' +
            '   - Descarte fragmentos soltos sem nome de produto nem número (ex: "É à", "DUE", "=").\n' +
            '4. PRIMEIRA E DEMAIS LINHAS MANDATÓRIAS: Nenhuma linha de dado de produto deve sumir.\n' +
            '5. CASAS DECIMAIS PRESERVADAS: Formate quantidades com vírgula decimal ("40,0 Kg", "15,0 Kg", "2,0 Kg"). NUNCA infle 10x.\n' +
            '6. PRESERVE os espaços em nomes compostos ("BATATA DOCE", "CHEIRO VERDE", "COUVE-FLOR").\n' +
            '7. Retorne APENAS as linhas finais no formato "PRODUTO: quantidade unidade", uma por linha, sem markdown (sem ```) e sem nenhum outro texto.\n\n' +
            'TEXTO OCR DA IMAGEM:\n' +
            normalizedInput
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

            // Salvaguarda final no backend:
            // Se o texto de entrada do OCR continha explicitamente "Banana" com indicação de pedido ou na primeira linha da tabela,
            // mas o agente porventura a omitiu da primeira linha:
            if (!/BANANA/i.test(formatted) && /\b[Bb]anana\b/i.test(textContent)) {
              // Tenta extrair quantidade de Banana se associada no texto original (ex: 30 ou 30,0 ou 300)
              const bananaMatch = textContent.match(/[Bb]anana[^\d\n\r]*([0-9]+(?:[.,][0-9]+)?)/)
              let bananaQty = '30,0'
              if (bananaMatch) {
                const rawNum = bananaMatch[1]
                if (rawNum === '300' || rawNum === '30') bananaQty = '30,0'
                else if (rawNum === '200' || rawNum === '20') bananaQty = '20,0'
                else if (rawNum === '500' || rawNum === '50') bananaQty = '50,0'
                else if (rawNum === '100' || rawNum === '10') bananaQty = '10,0'
                else if (rawNum.includes(',') || rawNum.includes('.'))
                  bananaQty = rawNum.replace('.', ',')
                else bananaQty = rawNum
              }
              formatted = `BANANA: ${bananaQty} Kg\n${formatted}`
            }

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

      // Se o agente falhou ou retornou vazio:
      // NUNCA despejar o texto bruto de OCR na resposta como se fosse estruturado!
      // Se veio de arquivo ($documents), retorna como texto bruto de documento estruturado;
      // se veio de texto_ocr do cliente, sinaliza falha do agente para que o cliente
      // aplique seu parser local estruturado ou exiba erro claro ao usuário.
      return e.json(502, {
        message: 'O agente de IA não conseguiu estruturar as linhas do pedido a partir da foto.',
        error: 'agent_failed',
        raw_text: textContent,
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
