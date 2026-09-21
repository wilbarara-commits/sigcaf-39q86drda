/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Migration 0035:
    // Atualizar os vínculos existentes em contrato_escolas:
    // Para cada vínculo, se a escola tiver campo rota preenchido no cadastro mestre
    // (ex.: "ROTA C") e existir rota cadastrada no contrato com esse nome,
    // atualizar a rota do vínculo (rota e rota_id) para a rota da escola.

    // 1. Carregar todos os vínculos de contrato_escolas
    const links = app.findRecordsByFilter('contrato_escolas', 'id != ""', '', 0, 0)
    if (!links || links.length === 0) {
      return
    }

    // 2. Carregar todas as rotas
    const allRotas = app.findRecordsByFilter('rotas', 'id != ""', '', 0, 0)
    // Mapear por contrato_id + nome normalizado -> Record
    const norm = (s) => (s || '').toString().toLowerCase().trim()

    let updatedCount = 0

    for (const link of links) {
      const escolaId = link.getString('escola_id')
      const contratoId = link.getString('contrato_id')
      if (!escolaId || !contratoId) continue

      let escola = null
      try {
        escola = app.findRecordById('escolas', escolaId)
      } catch (e) {
        // Escola não encontrada
        continue
      }

      if (!escola) continue
      const escolaRota = (escola.getString('rota') || '').trim()
      if (!escolaRota || escolaRota === 'Sem Rota') continue

      // Procurar rota no contrato com o mesmo nome (comparação tolerante)
      const matchedRota = allRotas.find((r) => {
        return (
          r.getString('contrato_id') === contratoId &&
          norm(r.getString('nome')) === norm(escolaRota)
        )
      })

      if (matchedRota) {
        link.set('rota', matchedRota.getString('nome') || escolaRota)
        link.set('rota_id', matchedRota.id)
        app.save(link)
        updatedCount++
      }
    }

    console.log(
      `[migration 0035] Atualizados ${updatedCount} vínculos de contrato_escolas com a rota da escola.`,
    )
  },
  (app) => {
    // Reversão não é necessária / no-op
  },
)
