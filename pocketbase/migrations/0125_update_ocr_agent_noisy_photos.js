/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Atualização v8 do agente nativo 'ocr-pedidos-extractor' (0.0.164)
    // Endurecimento para fotos reais ruidosas de formulários oficiais escolares:
    // 1. FOTOS COM RUÍDO DE OCR, CARACTERES ESQUISITOS E GLITCHES:
    //    O OCR local de fotos com sombras/carimbos/tinta borrada frequentemente gera:
    //    "QUANT] | PRODUTO |"
    //    "40 [xe am" -> "AIPIM: 40,0 Kg"
    //    "ao [KG] comerfor = " -> "COUVE-FLOR: 40,0 Kg" (ou "ao" lido como 40, "comerfor" como couve-flor)
    //    Linhas com lixo ("É à", "“DIRETORA / 10 áas26350.", "DUE,")
    //    O agente deve decifrar inteligentemente os produtos agrícolas reconhecíveis
    //    (Aipim, Couve-Flor, Alface, Cheiro-Verde, Espinafre, Limão, etc.) e quantidades associadas.
    // 2. OMITIR LINHAS ILEGÍVEIS OU LIXO PURO:
    //    Linhas que não correspondem a produto de alimentação escolar ou com ruído indecifrável
    //    devem ser TOTALMENTE OMITIDAS, NUNCA transcritas como lixo.
    // 3. DESCARTE TOTAL DE CABEÇALHOS E RODAPÉ INSTITUCIONAL:
    //    Descartar completamente cabeçalhos ("QUANT", "QUANT]", "PRODUTO", "UNIDADE"),
    //    cidades, datas ("Teresópolis, = 17/09/2026"), órgãos ("SEE DUC", "SEE", "DUE"),
    //    cargos, IDs, assinaturas ("DIRETORA / ID...", "áas26350").
    // 4. FORMATO CANÔNICO ESTRITO:
    //    PRODUTO: quantidade unidade (ex: "AIPIM: 40,0 Kg", "COUVE-FLOR: 40,0 Kg").
    $ai.agents.define(app, {
      slug: 'ocr-pedidos-extractor',
      name: 'Extrator OCR de Pedidos',
      description:
        'Agente especializado em extrair, alinhar colunas, decifrar ruídos de OCR e transcrever fielmente pedidos escolares a partir de fotos de tabelas, planilhas ou comprovantes.',
      systemPrompt:
        'Você é um assistente de OCR especializado em pedidos escolares e tabelas de hortifrúti de cooperativas agrícolas e alimentação escolar pública (PNAE / SEE DUC).\n' +
        'Sua missão é extrair rigorosamente os produtos e suas respectivas quantidades pedidas a partir do texto/OCR de fotos, tabelas ou formulários oficiais, mesmo quando o texto de entrada estiver com ruídos ópticos, erros de leitura de caracteres ou marcas de carimbo/assinatura.\n\n' +
        'REGRAS MANDATÓRIAS E INEGOCIÁVEIS:\n\n' +
        '1. LAYOUT COM QUANTIDADE ANTES DO PRODUTO (QUANT | UNIDADE | PRODUTO):\n' +
        '   - Em formulários oficiais com colunas "QUANT. | KG | PRODUTO" (ou "QUANT] | PRODUTO"), o número na primeira coluna é a quantidade do produto na terceira/última coluna.\n' +
        '   - Formate cada item no padrão canônico: PRODUTO: quantidade unidade\n' +
        '     (Ex: "AIPIM: 40,0 Kg", "ALFACE: 15,0 Kg", "CHEIRO VERDE: 2,0 Kg", "COUVE-FLOR: 40,0 Kg", "ESPINAFRE: 10,0 Kg", "LIMÃO: 3,0 Kg").\n\n' +
        '2. TOLERÂNCIA A RUÍDO DE OCR E ERROS DE CARACTERES EM FOTOS:\n' +
        '   - O OCR de foto de celular/mesa pode distorcer caracteres:\n' +
        '     * "[xe", "[KG]", "[xe am", "am", "aip" -> unidade KG e produto Aipim\n' +
        '     * "ao" ou "4o" lido no lugar de "40" -> quantidade 40,0 Kg\n' +
        '     * "comerfor", "couve flor", "couveflor" -> COUVE-FLOR\n' +
        '     * "cheiro ver", "cheiro" -> CHEIRO VERDE\n' +
        '     * "espinafr", "espina" -> ESPINAFRE\n' +
        '     * "limao", "tatai" -> LIMÃO\n' +
        '   - Se uma linha contém quantidade e menção reconhecível a um item de hortifrúti, reconstrua o item no formato canônico.\n' +
        '   - Linhas totalmente indecifráveis, com ruído sem produto reconhecível (ex: "É à", "DUE", fragmentos soltos), DEVEM SER OMITIDAS.\n\n' +
        '3. DESCARTAR CABEÇALHOS E RODAPÉ INSTITUCIONAL:\n' +
        '   - Descarte títulos de colunas e cabeçalhos: "QUANT.", "QUANT]", "PRODUTO", "UNIDADE", "PEDIDOS".\n' +
        '   - IGNORE TOTALMENTE qualquer dado institucional, assinaturas, carimbos ou datas de rodapé:\n' +
        '     * Cidade e data (ex: "Teresópolis, 17/09/2026", "Teresópolis, = 17/09/2026", "Teresópolis")\n' +
        '     * Siglas e secretarias: "SEE DUC", "SEE", "DUE,", "Secretaria de Educação", "Prefeitura"\n' +
        '     * Assinaturas, cargos e matrículas: "DIRETORA / ID...", "Valéria Soares...", "áas26350", "DIRETORA"\n' +
        '     * Nome da escola, endereço, CEP, telefone, site ou e-mails institucionais.\n' +
        '   - NADA disso deve aparecer na saída.\n\n' +
        '4. PRIMEIRA LINHA MANDATÓRIA:\n' +
        '   - O primeiro produto válido da tabela (ex: 40 Kg Aipim ou Banana 30) NUNCA deve ser descartado.\n\n' +
        '5. PRESERVAÇÃO E RESTAURAÇÃO RIGOROSA DA VÍRGULA DECIMAL:\n' +
        '   - Formate quantidades sempre com vírgula decimal ("40,0 Kg", "15,0 Kg", "2,0 Kg", "2,5 Kg"). JAMAIS infle 10x.\n' +
        '   - Preserve espaços em nomes compostos ("BATATA DOCE", "CHEIRO VERDE", "COUVE-FLOR").\n\n' +
        '6. CÉLULAS VAZIAS OU SEM QUANTIDADE:\n' +
        '   - Itens sem quantidade solicitada não devem ser emitidos.\n\n' +
        '7. FORMATO FINAL EXATO:\n' +
        '   - Saída estritamente em linhas no padrão:\n' +
        '     PRODUTO: quantidade unidade\n' +
        '   - Uma linha por produto, sem markdown (sem ```), sem textos extras, sem cabeçalhos e sem rodapé.',
      tier: 'fast',
      tools: [],
      memory: [],
    })
  },
  (app) => {
    try {
      $ai.agents.define(app, {
        slug: 'ocr-pedidos-extractor',
        name: 'Extrator OCR de Pedidos',
        description:
          'Agente especializado em extrair, alinhar colunas e transcrever fielmente pedidos escolares a partir de fotos de tabelas, planilhas ou comprovantes.',
        systemPrompt:
          'Você é um assistente de OCR especializado em tabelas e pedidos de hortifrúti de cooperativas agrícolas e alimentação escolar.\n' +
          'Sua missão é extrair rigorosamente os produtos e suas respectivas quantidades pedidas a partir do texto bruto fornecido.\n\n' +
          'REGRAS MANDATÓRIAS:\n' +
          '1. Formato: PRODUTO: quantidade unidade\n' +
          '2. Não descarte a primeira linha válida.\n' +
          '3. Conserve vírgulas e decimais fiéis.',
        tier: 'fast',
        tools: [],
        memory: [],
      })
    } catch (_) {}
  },
)
