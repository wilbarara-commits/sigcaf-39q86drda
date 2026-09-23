migrate(
  (app) => {
    // 1. Atualizar collection contrato_escolas:
    //    Adicionar campo coleta_por (texto: 'padrao', 'formulario', 'planilha'), default 'padrao'
    //    Adicionar campo encerrado_em (date) para quando a escola for desvinculada ou o contrato encerrado
    const ceCol = app.findCollectionByNameOrId('contrato_escolas')
    if (!ceCol.fields.getByName('coleta_por')) {
      ceCol.fields.add(
        new TextField({
          name: 'coleta_por',
          required: false,
        }),
      )
    }
    if (!ceCol.fields.getByName('encerrado_em')) {
      ceCol.fields.add(
        new DateField({
          name: 'encerrado_em',
          required: false,
        }),
      )
    }
    app.save(ceCol)

    // Preencher coleta_por = 'padrao' para todos os vínculos existentes em contrato_escolas
    app
      .db()
      .newQuery(
        "UPDATE contrato_escolas SET coleta_por = 'padrao' WHERE coleta_por IS NULL OR coleta_por = ''",
      )
      .execute()

    // 2. Atualizar collection contratos:
    //    Adicionar campos encerrado_em (date) e motivo_cancelamento (text)
    //    Estender status para Ativo, Encerrado, Cancelado, Pendente
    const contratosCol = app.findCollectionByNameOrId('contratos')
    if (!contratosCol.fields.getByName('encerrado_em')) {
      contratosCol.fields.add(
        new DateField({
          name: 'encerrado_em',
          required: false,
        }),
      )
    }
    if (!contratosCol.fields.getByName('motivo_cancelamento')) {
      contratosCol.fields.add(
        new TextField({
          name: 'motivo_cancelamento',
          required: false,
        }),
      )
    }

    const statusField = contratosCol.fields.getByName('status')
    if (statusField) {
      statusField.values = ['Ativo', 'Encerrado', 'Cancelado', 'Pendente']
      statusField.maxSelect = 1
    }
    app.save(contratosCol)

    // 3. REMOVER vínculo da EM HERMÍNIA JOSETTI com o contrato centralizado C-2026-01:
    //    A escola jl987ffjs626ndv fica vinculada única e exclusivamente ao contrato individualizado C-2026-02.
    //    Suporta tanto id 9b3y86bqu7o7car quanto gbbv6w7b7c845b5 ou consulta por par (escola, contrato).
    try {
      const contratoCentral = app.findFirstRecordByData('contratos', 'numero', 'C-2026-01')
      const escolaJosetti = app.findFirstRecordByData('escolas', 'nome', 'EM HERMÍNIA JOSETTI')

      app
        .db()
        .newQuery(`
          DELETE FROM contrato_escolas
          WHERE escola_id = {:escolaId} AND contrato_id = {:contratoId}
        `)
        .bind({
          escolaId: escolaJosetti.id,
          contratoId: contratoCentral.id,
        })
        .execute()
    } catch (err) {
      console.log('Aviso ao remover vínculo da Hermínia Josetti com C-2026-01:', err)
    }
  },
  (app) => {
    // Down migration
    try {
      const ceCol = app.findCollectionByNameOrId('contrato_escolas')
      const cpField = ceCol.fields.getByName('coleta_por')
      if (cpField) ceCol.fields.removeByName('coleta_por')
      const eeField = ceCol.fields.getByName('encerrado_em')
      if (eeField) ceCol.fields.removeByName('encerrado_em')
      app.save(ceCol)
    } catch (_) {}

    try {
      const contratosCol = app.findCollectionByNameOrId('contratos')
      const encField = contratosCol.fields.getByName('encerrado_em')
      if (encField) contratosCol.fields.removeByName('encerrado_em')
      const motField = contratosCol.fields.getByName('motivo_cancelamento')
      if (motField) contratosCol.fields.removeByName('motivo_cancelamento')
      const stField = contratosCol.fields.getByName('status')
      if (stField) {
        stField.values = ['Ativo', 'Encerrado', 'Pendente']
      }
      app.save(contratosCol)
    } catch (_) {}
  },
)
