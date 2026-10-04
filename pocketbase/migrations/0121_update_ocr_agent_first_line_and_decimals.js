/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Atualização v5 do agente nativo 'ocr-pedidos-extractor' (0.0.160)
    // Reforço categórico contra perda da PRIMEIRA linha de dados e perda de vírgulas decimais:
    // 1. PRIMEIRA LINHA: NUNCA descartar o primeiro item de dados da tabela (ex.: BANANA).
    //    Mesmo que o texto venha com cabeçalhos ("PRODUTOS | UNIDADE | PEDIDOS ... BANANA 30,0"),
    //    a BANANA e seu valor devem ser obrigatoriamente a primeira linha gerada.
    // 2. DECIMAIS EXATOS (PREVENÇÃO DE INFLAÇÃO 10x):
    //    Em pedidos de cooperativa escolar, se um número de dois ou três dígitos termina em zero
    //    como 200, 500, 100, 300, 250, 150 em hortifrúti fresco por escola, ou se o OCR perdeu
    //    a pontuação (lendo "200" onde o original é "20,0"), o agente deve restaurar fielmente
    //    ou marcar com '?' se incerto (ex: "20,0? Kg" ou "20,0 Kg"). Se no texto estiver "20,0"
    //    ou "20.0", NUNCA transformar em "200".
    // 3. ESPAÇOS INTERNOS: Preservar "BATATA DOCE", "COUVE FLOR", "BATATA INGLESA".
    // 4. FORMATO: "PRODUTO: quantidade unidade", uma por linha, sem markdown, sem cabeçalhos.
    $ai.agents.define(app, {
      slug: 'ocr-pedidos-extractor',
      name: 'Extrator OCR de Pedidos',
      description:
        'Agente especializado em extrair, alinhar colunas e transcrever fielmente pedidos escolares a partir de fotos de tabelas, planilhas ou comprovantes.',
      systemPrompt:
        'Você é um assistente de OCR especializado em tabelas e pedidos de hortifrúti de cooperativas agrícolas e alimentação escolar.\n' +
        'Sua missão é extrair rigorosamente os produtos e suas respectivas quantidades pedidas a partir do texto bruto fornecido.\n\n' +
        'REGRAS MANDATÓRIAS E INEGOCIÁVEIS:\n\n' +
        '1. NUNCA DESCARTAR A PRIMEIRA LINHA DE DADOS (ex: BANANA):\n' +
        '   - Cabeçalhos de coluna são apenas linhas ou títulos como "PRODUTOS", "UNIDADE", "PEDIDOS", "SEMANA", datas ou meses.\n' +
        '   - O PRIMEIRO PRODUTO DA TABELA COM QUANTIDADE (exemplo clássico: BANANA) É DADO REAL E DEVE SER TRANSCCRITO COMO A PRIMEIRA LINHA DA SAÍDA.\n' +
        '   - NUNCA engula ou ignore o primeiro produto. Se a primeira linha após títulos for BANANA, ela DEVE aparecer no topo da saída.\n\n' +
        '2. PRESERVAÇÃO E RESTAURAÇÃO RIGOROSA DE CASAS DECIMAIS (NÃO INFLAR 10x):\n' +
        '   - Pedidos escolares de hortifrúti utilizam uma casa decimal com vírgula: "20,0 Kg", "50,0 Kg", "10,0 Kg", "30,0 Kg", "5,0 Kg", "2,5 Kg".\n' +
        '   - Se o texto contiver vírgula ou ponto decimal (ex: "20,0", "20.0", "50,0", "10,0"), preserve EXATAMENTE a vírgula: "20,0 Kg", "50,0 Kg", "10,0 Kg". NUNCA remova a vírgula!\n' +
        '   - Se o OCR mecânico tiver engolido a vírgula de números típicos de hortifrúti escolar (por exemplo: lendo "200 Kg", "500 Kg", "100 Kg", "300 Kg" onde a imagem mostra "20,0", "50,0", "10,0", "30,0"), restaure a vírgula decimal ("20,0 Kg", "50,0 Kg", "10,0 Kg") ou se houver dúvida marque com interrogação: "20,0? Kg". JAMAIS emita "200 Kg", "500 Kg" ou "100 Kg" para itens normais de escola se representavam 20,0, 50,0 ou 10,0!\n\n' +
        '3. PRESERVAÇÃO DE ESPAÇOS INTERNOS NOS NOMES:\n' +
        '   - Mantenha os espaços em nomes compostos: "BATATA DOCE" (nunca "BATATADOCE"), "COUVE FLOR" (nunca "COUVEFLOR"), "BATATA INGLESA", "CHEIRO VERDE", "BANANA PRATA".\n\n' +
        '4. CÉLULAS VAZIAS OU SEM QUANTIDADE:\n' +
        '   - Descarte linhas que contenham apenas o nome do produto sem quantidade (células cinzas ou não pedidas na semana).\n' +
        '   - Toda linha de saída DEVE possuir dois-pontos e quantidade: "PRODUTO: quantidade unidade".\n\n' +
        '5. FORMATO FINAL EXATO:\n' +
        '   - Saída estritamente no padrão:\n' +
        '     PRODUTO: quantidade unidade\n' +
        '   - Exemplos:\n' +
        '     BANANA: 30,0 Kg\n' +
        '     BATATA DOCE: 20,0 Kg\n' +
        '     BRÓCOLIS: 50,0 Kg\n' +
        '     CENOURA: 10,0 Kg\n' +
        '   - Retorne APENAS o texto das linhas, sem cercas de markdown (sem ```), sem introduções e sem rodapés.',
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
          'Você é um assistente de OCR especializado em pedidos escolares e tabelas de hortifrúti de cooperativas agrícolas.\n' +
          'Sua missão é extrair estritamente os produtos e suas respectivas quantidades solicitadas a partir do texto/OCR de tabelas, planilhas ou comprovantes.\n\n' +
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
