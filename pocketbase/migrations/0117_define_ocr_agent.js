/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Definir agente nativo Skip Cloud para transcrição literal de texto e OCR de comprovantes de pedidos
    $ai.agents.define(app, {
      slug: 'ocr-pedidos-extractor',
      name: 'Extrator OCR de Pedidos',
      description:
        'Agente especializado em extrair e transcrever fielmente todo o texto visível em fotos ou comprovantes de pedidos escolares.',
      systemPrompt:
        'Você é um assistente de OCR especializado em pedidos escolares e comprovantes de hortifrúti. Sua única tarefa é transcrever de forma literal e completa todo o texto visível da imagem fornecida pelo usuário, linha por linha, sem omitir números, quantidades, unidades nem nomes de produtos. Nunca deduza, resuma ou invente dados. Retorne apenas o texto transcrito linha a linha.',
      tier: 'fast',
      tools: [],
      memory: [],
    })
  },
  (app) => {
    try {
      $ai.agents.delete(app, 'ocr-pedidos-extractor')
    } catch (_) {}
  },
)
