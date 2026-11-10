// Migração idempotente: preenche latitude/longitude vazias de TODAS as escolas
// com a coordenada fixa da cooperativa, a pedido do usuário.
// Regras:
// - Só toca em escolas com latitude OU longitude vazia (vazio/ausente).
// - Escolas que já têm coordenada não são alteradas.
// - Não altera nenhum outro campo (cep, endereço, nome, etc.).
const LAT_FIXA = '-22.260121829949114'
const LNG_FIXA = '-42.73806939190867'

migrate(
  (app) => {
    const escolasVazias = app.findRecordsByFilter(
      'escolas',
      "latitude = '' || longitude = ''",
      '-created',
      0,
      0,
    )

    let atualizadas = 0
    for (const escola of escolasVazias) {
      // Só preenche o que está vazio; nunca sobrescreve valor existente.
      const latAtual = String(escola.getString('latitude') || '').trim()
      const lngAtual = String(escola.getString('longitude') || '').trim()

      const precisaLat = latAtual === ''
      const precisaLng = lngAtual === ''
      if (!precisaLat && !precisaLng) continue

      if (precisaLat) escola.set('latitude', LAT_FIXA)
      if (precisaLng) escola.set('longitude', LNG_FIXA)
      app.save(escola)
      atualizadas++
    }
    console.log(
      '[0146] Preenchidas coordenadas vazias de ' +
        atualizadas +
        ' escola(s) com ' +
        LAT_FIXA +
        ', ' +
        LNG_FIXA,
    )
  },
  (app) => {
    // down: no-op intencional — escolas já tinham essas coordenadas vazias
    // e reverter apagaria a correção pedida pelo usuário.
  },
)
