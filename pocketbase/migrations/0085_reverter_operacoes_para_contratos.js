migrate(
  (app) => {
    // 1. Obter a collection 'contratos'
    const contratosCol = app.findCollectionByNameOrId('contratos')

    // 2. Garantir sincronização de quaisquer dados de 'operacoes' para 'contratos'
    // Se algum registro foi criado ou atualizado em 'operacoes' durante as versões 0.0.63–0.0.84,
    // sincronizar de volta para 'contratos' mantendo os mesmos IDs.
    try {
      const operacoesExistentes = app.findRecordsByFilter('operacoes', '', 'created', 1000, 0)
      for (const op of operacoesExistentes) {
        let cRecord
        try {
          cRecord = app.findFirstRecordByData('contratos', 'id', op.id)
        } catch (_) {
          cRecord = new Record(contratosCol)
          cRecord.set('id', op.id)
        }
        cRecord.set('numero', op.getString('numero'))
        cRecord.set('tipo', op.getString('tipo'))
        cRecord.set('valor_total', op.get('valor_total'))
        cRecord.set('status', op.getString('status') || 'Ativo')
        cRecord.set('modalidade_pedido', op.getString('modalidade_pedido'))
        cRecord.set('numero_chamada', op.getString('numero_chamada'))
        cRecord.set('num_rotas_logisticas', op.get('num_rotas_logisticas'))
        cRecord.set('tipo_importacao', op.getString('tipo_importacao'))
        cRecord.set('abas_planilha', op.getString('abas_planilha'))
        cRecord.set('encerrado_em', op.getString('encerrado_em'))
        cRecord.set('motivo_cancelamento', op.getString('motivo_cancelamento'))
        app.save(cRecord)
      }
    } catch (e) {
      console.log('Aviso ao sincronizar operacoes -> contratos:', e)
    }

    // 3. Remover a collection temporária 'operacoes' para consolidar apenas 'contratos'
    try {
      const operacoesCol = app.findCollectionByNameOrId('operacoes')
      app.delete(operacoesCol)
    } catch (_) {}
  },
  (app) => {
    // Reverter: recriar 'operacoes' se necessário
    let operacoesCol
    try {
      operacoesCol = app.findCollectionByNameOrId('operacoes')
    } catch (_) {
      operacoesCol = new Collection({
        name: 'operacoes',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '',
        fields: [
          { name: 'numero', type: 'text', required: true },
          { name: 'tipo', type: 'text', required: false },
          { name: 'valor_total', type: 'number', required: false },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['Ativo', 'Encerrado', 'Cancelado', 'Pendente'],
            maxSelect: 1,
          },
          {
            name: 'modalidade_pedido',
            type: 'select',
            required: false,
            values: ['individualizado', 'centralizado'],
            maxSelect: 1,
          },
          { name: 'numero_chamada', type: 'text', required: false },
          { name: 'num_rotas_logisticas', type: 'number', required: false },
          {
            name: 'tipo_importacao',
            type: 'select',
            required: false,
            values: ['unica', 'fracionada'],
            maxSelect: 1,
          },
          { name: 'abas_planilha', type: 'text', required: false },
          { name: 'encerrado_em', type: 'date', required: false },
          { name: 'motivo_cancelamento', type: 'text', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
      })
      app.save(operacoesCol)
    }

    const contratosExistentes = app.findRecordsByFilter('contratos', '', 'created', 1000, 0)
    for (const c of contratosExistentes) {
      try {
        app.findFirstRecordByData('operacoes', 'id', c.id)
      } catch (_) {
        const opRecord = new Record(operacoesCol)
        opRecord.set('id', c.id)
        opRecord.set('numero', c.getString('numero'))
        opRecord.set('tipo', c.getString('tipo'))
        opRecord.set('valor_total', c.get('valor_total'))
        opRecord.set('status', c.getString('status') || 'Ativo')
        opRecord.set('modalidade_pedido', c.getString('modalidade_pedido'))
        opRecord.set('numero_chamada', c.getString('numero_chamada'))
        opRecord.set('num_rotas_logisticas', c.get('num_rotas_logisticas'))
        opRecord.set('tipo_importacao', c.getString('tipo_importacao'))
        opRecord.set('abas_planilha', c.getString('abas_planilha'))
        opRecord.set('encerrado_em', c.getString('encerrado_em'))
        opRecord.set('motivo_cancelamento', c.getString('motivo_cancelamento'))
        app.save(opRecord)
      }
    }
  },
)
