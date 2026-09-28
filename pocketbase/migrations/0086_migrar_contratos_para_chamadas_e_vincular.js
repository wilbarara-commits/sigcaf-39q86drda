migrate(
  (app) => {
    // 1. Obter coleções 'chamadas' e 'contratos'
    const chamadasCol = app.findCollectionByNameOrId('chamadas')
    const contratosCol = app.findCollectionByNameOrId('contratos')

    // 2. Adicionar o campo relation 'chamada_id' em 'contratos' apontando para 'chamadas'
    if (!contratosCol.fields.getByName('chamada_id')) {
      contratosCol.fields.add(
        new RelationField({
          name: 'chamada_id',
          type: 'relation',
          collectionId: chamadasCol.id,
          required: false, // temporariamente false para permitir popular os dados e associar os existentes
          maxSelect: 1,
        }),
      )
      app.save(contratosCol)
    }

    // 3. Migrar dados do contrato para chamadas inicialmente:
    // "migre os dados do contrato para chamada inicialmente. Depois vamos eliminar a duplicação dos dados repetidos."
    // "O número da chamada pública relaciona o contrato à chamada. Uma chamada pode ter um ou mais contratos. Um contrato é de uma chamada pública. o contrato é obrigatório."
    const contratosExistentes = app.findRecordsByFilter('contratos', '', 'created', 1000, 0)

    for (const contrato of contratosExistentes) {
      const numChamada = (contrato.getString('numero_chamada') || '').trim()
      const contratoNumero = contrato.getString('numero') || ''
      const chamadaNome = numChamada || `Chamada ${contratoNumero}`

      let chamadaRecord = new Record(chamadasCol)
      chamadaRecord.set('chamada', chamadaNome)
      chamadaRecord.set('programa', contrato.getString('tipo') || 'PNAE')
      chamadaRecord.set('modalidade', contrato.getString('modalidade_pedido') || 'individualizado')
      chamadaRecord.set('status', contrato.getString('status') || 'Ativo')
      app.save(chamadaRecord)

      // Vincular contrato à chamada recém-criada
      contrato.set('chamada_id', chamadaRecord.id)
      app.save(contrato)
    }

    // 4. Agora que todos os contratos existentes possuem chamada_id, atualizar chamada_id para required: true e adicionar índice
    const contratosColAtualizado = app.findCollectionByNameOrId('contratos')
    const fieldChamada = contratosColAtualizado.fields.getByName('chamada_id')
    if (fieldChamada) {
      fieldChamada.required = true
      contratosColAtualizado.addIndex('idx_contratos_chamada_id', false, 'chamada_id', '')
      app.save(contratosColAtualizado)
    }
  },
  (app) => {
    try {
      const contratosCol = app.findCollectionByNameOrId('contratos')
      contratosCol.removeIndex('idx_contratos_chamada_id')
      contratosCol.fields.removeByName('chamada_id')
      app.save(contratosCol)
    } catch (_) {}
  },
)
