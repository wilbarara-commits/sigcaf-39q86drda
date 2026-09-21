migrate(
  (app) => {
    // 1. Adicionar campo 'numero_chamada' (TextField) na collection 'contratos'
    const contratosCol = app.findCollectionByNameOrId('contratos')
    if (!contratosCol.fields.getByName('numero_chamada')) {
      contratosCol.fields.add(
        new TextField({
          name: 'numero_chamada',
          required: false,
        }),
      )
      app.save(contratosCol)
    }

    // Preencher um valor padrão se houver contrato existente sem numero_chamada
    try {
      const contratos = app.findRecordsByFilter(
        'contratos',
        'numero_chamada = "" || numero_chamada = null',
        '',
        100,
        0,
      )
      for (const c of contratos) {
        c.set('numero_chamada', '001/2026')
        app.save(c)
      }
    } catch (_) {}

    // 2. Adicionar campo 'arquivo' (FileField) na collection 'atestos' se não existir
    const atestosCol = app.findCollectionByNameOrId('atestos')
    if (!atestosCol.fields.getByName('arquivo')) {
      atestosCol.fields.add(
        new FileField({
          name: 'arquivo',
          maxSelect: 1,
          maxSize: 10485760, // 10MB
          mimeTypes: ['application/pdf'],
        }),
      )
      app.save(atestosCol)
    }

    // 3. Adicionar campo 'logotipo' (FileField) na collection 'configuracoes' se não existir
    const configCol = app.findCollectionByNameOrId('configuracoes')
    if (!configCol.fields.getByName('logotipo')) {
      configCol.fields.add(
        new FileField({
          name: 'logotipo',
          maxSelect: 1,
          maxSize: 5242880, // 5MB
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
        }),
      )
      app.save(configCol)
    }
  },
  (app) => {
    try {
      const contratosCol = app.findCollectionByNameOrId('contratos')
      if (contratosCol.fields.getByName('numero_chamada')) {
        contratosCol.fields.removeByName('numero_chamada')
        app.save(contratosCol)
      }
    } catch (_) {}

    try {
      const atestosCol = app.findCollectionByNameOrId('atestos')
      if (atestosCol.fields.getByName('arquivo')) {
        atestosCol.fields.removeByName('arquivo')
        app.save(atestosCol)
      }
    } catch (_) {}

    try {
      const configCol = app.findCollectionByNameOrId('configuracoes')
      if (configCol.fields.getByName('logotipo')) {
        configCol.fields.removeByName('logotipo')
        app.save(configCol)
      }
    } catch (_) {}
  },
)
