migrate(
  (app) => {
    // 1. Atualizar a definição do campo 'tipo' na collection escolas
    const col = app.findCollectionByNameOrId('escolas')
    const tipoField = col.fields.getByName('tipo')

    if (tipoField) {
      tipoField.values = ['CMEI', 'CRECHE', 'INTEGRAL', 'FUNDAMENTAL']
      tipoField.required = false
      tipoField.maxSelect = 1
    } else {
      col.fields.add(
        new SelectField({
          name: 'tipo',
          required: false,
          maxSelect: 1,
          values: ['CMEI', 'CRECHE', 'INTEGRAL', 'FUNDAMENTAL'],
        }),
      )
    }

    app.save(col)

    // 2. Reclassificar os registros existentes
    // Regras de dedução:
    // - Se nome contiver 'CMEI' -> CMEI
    // - Se nome contiver 'CRECHE' ou começar com 'CC ' ou 'CM ' -> CRECHE
    // - Para 'Municipal' e outros: não há como deduzir com precisão entre FUNDAMENTAL e INTEGRAL -> deixar vazio ('') para recarga pelo usuário
    app
      .db()
      .newQuery(`
      UPDATE escolas
      SET tipo = CASE
        WHEN UPPER(nome) LIKE '%CMEI%' THEN 'CMEI'
        WHEN UPPER(nome) LIKE '%CRECHE%' OR UPPER(nome) LIKE 'CC %' OR UPPER(nome) LIKE 'CM %' THEN 'CRECHE'
        ELSE ''
      END
    `)
      .execute()
  },
  (app) => {
    const col = app.findCollectionByNameOrId('escolas')
    const tipoField = col.fields.getByName('tipo')

    if (tipoField) {
      tipoField.values = [
        'Municipal',
        'Estadual',
        'Creche / CMEI',
        'Filantrópica / Conveniada',
        'Outro',
      ]
      col.save()
    }
  },
)
