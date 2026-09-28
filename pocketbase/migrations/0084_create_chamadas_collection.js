migrate(
  (app) => {
    let chamadasCol
    try {
      chamadasCol = app.findCollectionByNameOrId('chamadas')
    } catch (_) {
      chamadasCol = new Collection({
        name: 'chamadas',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '',
        fields: [
          { name: 'chamada', type: 'text', required: true },
          { name: 'programa', type: 'text', required: false },
          {
            name: 'modalidade',
            type: 'select',
            required: false,
            values: ['individualizado', 'centralizado'],
            maxSelect: 1,
          },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['Ativo', 'Encerrado', 'Cancelado', 'Pendente'],
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_chamadas_chamada ON chamadas (chamada)',
          'CREATE INDEX idx_chamadas_status ON chamadas (status)',
        ],
      })
      app.save(chamadasCol)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('chamadas')
      app.delete(col)
    } catch (_) {}
  },
)
