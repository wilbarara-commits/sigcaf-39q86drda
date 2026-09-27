migrate(
  (app) => {
    // 1. Criar collection 'operacoes' com a mesma estrutura de 'contratos'
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

    // 2. Copiar 1:1 todos os registros de 'contratos' para 'operacoes' preservando os mesmos IDs e dados
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
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('operacoes')
      app.delete(col)
    } catch (_) {}
  },
)
