migrate(
  (app) => {
    // 0131: Adicionar campos foto e foto_file na collection entrega_registros
    // foto (editor): armazena dataURL/base64 compactada para resiliência offline imediata
    // foto_file (file): armazena o arquivo binário processado pelo PocketBase quando enviado
    try {
      const col = app.findCollectionByNameOrId('entrega_registros')

      if (!col.fields.getByName('foto')) {
        col.fields.add(
          new EditorField({
            name: 'foto',
            required: false,
          }),
        )
      }

      if (!col.fields.getByName('foto_file')) {
        col.fields.add(
          new FileField({
            name: 'foto_file',
            maxSelect: 1,
            maxSize: 10485760, // 10MB max upload
            mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
          }),
        )
      }

      // Garantir regras públicas completas para o portal público do motorista (token)
      col.listRule = ''
      col.viewRule = ''
      col.createRule = ''
      col.updateRule = ''

      app.save(col)
    } catch (err) {
      console.warn('Erro ao atualizar collection entrega_registros na migration 0131:', err)
      throw err
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('entrega_registros')
      if (col.fields.getByName('foto')) {
        col.fields.removeByName('foto')
      }
      if (col.fields.getByName('foto_file')) {
        col.fields.removeByName('foto_file')
      }
      app.save(col)
    } catch (_) {}
  },
)
