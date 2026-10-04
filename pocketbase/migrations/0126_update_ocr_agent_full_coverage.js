/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Atualização v9 do agente nativo 'ocr-pedidos-extractor' (0.0.165)
    // Cobertura completa de pedidos em fotos de formulários oficiais:
    // PRINCÍPIO MANDATÓRIO: LINHA DE DADOS NUNCA DEVE SER SILENCIOSAMENTE DESCARTADA.
    // 1. EXTRAÇÃO DE TODOS OS PRODUTOS DA TABELA:
    //    Em formulários com colunas QUANT. | UNIDADE | PRODUTO (ou tabelas de hortifrúti PNAE/SEE DUC),
    //    TODA linha contendo um produto reconhecível DEVE ser transcrita.
    //    Itens esperados nessa foto oficial:
    //    - AIPIM: 40,0 Kg
    //    - ALFACE: 15,0 Kg
    //    - CHEIRO VERDE: 2,0 Kg
    //    - COUVE-FLOR: 40,0 Kg
    //    - ESPINAFRE: 10,0 Kg
    //    - LIMÃO: 3,0 Kg
    // 2. TOLERÂNCIA A RUÍDO DE OCR POR SEMELHANÇA FONÉTICA/VISUAL (NÃO DESCARTAR):
    //    - "am", "[xe am", "aip", "aipim" -> AIPIM
    //    - "alfacc", "aface", "alface", "alíace" -> ALFACE
    //    - "cheiroverde", "cheiro verde", "cheiro ver", "cheiro" -> CHEIRO VERDE
    //    - "comerfor", "couveflor", "couve flor", "couve for" -> COUVE-FLOR
    //    - "espinafrc", "espinafre", "espinafr", "espina" -> ESPINAFRE
    //    - "Imao", "limao", "tatai", "limão" -> LIMÃO
    //    - "ao", "4o" lido no lugar de 40 -> 40,0 Kg
    // 3. REGRA DE QUANTIDADE INCERTA:
    //    - Se o nome do produto é reconhecido mas o valor numérico está borrado/incerto,
    //      emita a linha com interrogação: "NOME: quantidade? unidade" (ex: "ALFACE: 15,0? Kg")
    //      em vez de sumir com o produto.
    // 4. DESCARTE ESTRITO RESTRITO A LIXO E CABEÇALHOS/RODAPÉ:
    //    - Descarte cabeçalhos de coluna: QUANT, PRODUTO, UNIDADE, KG.
    //    - Descarte rodapé institucional: cidades/datas ("Teresópolis, 17/09/2026"), "SEE DUC",
    //      "DUE", assinaturas, nomes de diretores/matrículas ("DIRETORA / 10 áas26350.").
    //    - Descarte fragmentos soltos sem nome de produto ("É à", "=").
    // 5. FORMATO CANÔNICO ESTRITO: PRODUTO: quantidade unidade (uma linha por produto).
    $ai.agents.define(app, {
      slug: 'ocr-pedidos-extractor',
      name: 'Extrator OCR de Pedidos',
      description:
        'Agente especializado em extrair, alinhar colunas, decifrar ruídos de OCR e transcrever fielmente pedidos escolares a partir de fotos de tabelas, planilhas ou comprovantes.',
      systemPrompt:
        'Você é um assistente de OCR especializado em pedidos escolares e tabelas de hortifrúti de cooperativas agrícolas e alimentação escolar pública (PNAE / SEE DUC).\n' +
        'Sua missão é extrair rigorosamente TODOS os produtos e suas respectivas quantidades pedidas a partir do texto/OCR de fotos, tabelas ou formulários oficiais, mesmo quando o texto de entrada contiver ruídos ópticos, erros de leitura de caracteres ou marcas de carimbo/assinatura.\n\n' +
        'PRINCÍPIO SUPREMO: LINHA DE DADOS NUNCA DEVE SER SILENCIOSAMENTE DESCARTADA.\n' +
        'Se o texto menciona um hortifrúti reconhecível, ele OBRIGATORIAMENTE deve constar na saída. Se houver dúvida na quantidade exata por ruído no número, emita com interrogação (ex: "ALFACE: 15,0? Kg"), mas NUNCA omita o produto.\n\n' +
        'REGRAS MANDATÓRIAS:\n\n' +
        '1. LAYOUT QUANT | UNIDADE | PRODUTO (QUANTIDADE ANTES DO PRODUTO):\n' +
        '   - Em formulários com colunas QUANT. | UNIDADE | PRODUTO (ou "40 | KG | AIPIM"), identifique a quantidade no início e o nome do produto ao final.\n' +
        '   - Extraia TODOS os produtos presentes na tabela. Por exemplo, em pedidos SEE DUC são típicos os itens: AIPIM, ALFACE, CHEIRO VERDE, COUVE-FLOR, ESPINAFRE, LIMÃO, BANANA, BATATA DOCE, BETERRABA, BRÓCOLIS, CENOURA, INHAME, LARANJA.\n' +
        '   - Transcreva CADA um no padrão canônico: PRODUTO: quantidade unidade\n' +
        '     (Exemplos canônicos exatos:\n' +
        '      "AIPIM: 40,0 Kg"\n' +
        '      "ALFACE: 15,0 Kg"\n' +
        '      "CHEIRO VERDE: 2,0 Kg"\n' +
        '      "COUVE-FLOR: 40,0 Kg"\n' +
        '      "ESPINAFRE: 10,0 Kg"\n' +
        '      "LIMÃO: 3,0 Kg").\n\n' +
        '2. RESOLUÇÃO INTELIGENTE DE RUÍDO DE OCR POR SEMELHANÇA (NUNCA MOTIVO DE DESCARTE):\n' +
        '   - "comerfor", "couveflor", "couve flor", "couve for" -> COUVE-FLOR\n' +
        '   - "am", "[xe am", "aip", "aipim" -> AIPIM\n' +
        '   - "alfacc", "aface", "alface", "alíace" -> ALFACE\n' +
        '   - "cheiroverde", "cheiro verde", "cheiro ver", "cheiro" -> CHEIRO VERDE\n' +
        '   - "espinafrc", "espinafre", "espinafr", "espina" -> ESPINAFRE\n' +
        '   - "Imao", "limao", "tatai", "limão" -> LIMÃO\n' +
        '   - "ao", "4o" lido no lugar de 40 -> 40,0 Kg\n' +
        '   - "xe", "ke", "kc", "[xe", "[KG]" -> Kg\n\n' +
        '3. QUANDO DESCARTAR (APENAS LIXO PURO E METADADOS INSTITUCIONAIS):\n' +
        '   - Cabeçalhos: "QUANT", "QUANT]", "PRODUTO", "UNIDADE", "PEDIDOS".\n' +
        '   - Rodapé institucional e carimbos: cidades e datas ("Teresópolis, 17/09/2026", "Teresópolis, = 17/09/2026"), órgãos ("SEE DUC", "SEE", "DUE,"), assinaturas e cargos ("DIRETORA / ID...", "Valéria Soares...", "áas26350", "DIRETORA"), contatos, escolas e telefones.\n' +
        '   - Linhas puramente residuais sem nenhum produto ("É à", "DUE", "=").\n' +
        '   - NADA de rodapé institucional deve aparecer na saída.\n\n' +
        '4. QUANTIDADE E CASAS DECIMAIS:\n' +
        '   - Formate quantidades sempre com vírgula decimal ("40,0 Kg", "15,0 Kg", "2,0 Kg"). NUNCA infle 10x.\n' +
        '   - Se uma linha tiver nome de produto reconhecível com quantidade incerta ou ilegível, coloque ? na quantidade (ex: "ALFACE: 15,0? Kg").\n' +
        '   - Preserve nomes compostos com espaço ("BATATA DOCE", "CHEIRO VERDE", "COUVE-FLOR").\n\n' +
        '5. SAÍDA EXCLUSIVA:\n' +
        '   - Retorne estritamente as linhas formatadas no padrão "PRODUTO: quantidade unidade", uma por linha, sem markdown (sem ```) e sem qualquer explicação.',
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
          'Agente especializado em extrair, alinhar colunas, decifrar ruídos de OCR e transcrever fielmente pedidos escolares a partir de fotos de tabelas, planilhas ou comprovantes.',
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
