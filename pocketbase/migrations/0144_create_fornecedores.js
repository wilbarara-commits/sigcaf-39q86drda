migrate(
  (app) => {
    let fornecedoresCol
    try {
      fornecedoresCol = app.findCollectionByNameOrId('fornecedores')
    } catch (_) {
      fornecedoresCol = new Collection({
        name: 'fornecedores',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.id != ""',
        fields: [
          { name: 'nome', type: 'text', required: true },
          {
            name: 'sexo',
            type: 'select',
            required: false,
            values: ['MASCULINO', 'FEMININO', 'OUTRO'],
            maxSelect: 1,
          },
          { name: 'data_nascimento', type: 'date', required: false },
          {
            name: 'foto',
            type: 'file',
            required: false,
            maxSelect: 1,
            maxSize: 5242880,
            mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
          },
          {
            name: 'vinculo',
            type: 'select',
            required: true,
            values: ['COOPERADO', 'EXTERNO'],
            maxSelect: 1,
          },
          { name: 'identidade', type: 'text', required: false },
          { name: 'data_validade_caf', type: 'date', required: false },
          { name: 'endereco', type: 'text', required: false },
          { name: 'bairro', type: 'text', required: false },
          { name: 'cep', type: 'text', required: false },
          { name: 'latitude', type: 'number', required: false },
          { name: 'longitude', type: 'number', required: false },
          { name: 'whatsapp', type: 'text', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_fornecedores_nome ON fornecedores (nome)',
          'CREATE INDEX idx_fornecedores_vinculo ON fornecedores (vinculo)',
          'CREATE INDEX idx_fornecedores_identidade ON fornecedores (identidade)',
          'CREATE INDEX idx_fornecedores_caf ON fornecedores (data_validade_caf)',
        ],
      })
      app.save(fornecedoresCol)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('fornecedores')
      app.delete(col)
    } catch (_) {}
  },
)
