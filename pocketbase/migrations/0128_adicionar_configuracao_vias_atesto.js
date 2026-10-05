migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('configuracoes')

    if (!col.fields.getByName('atesto_vias')) {
      col.fields.add(
        new NumberField({
          name: 'atesto_vias',
          required: false,
          min: 1,
          max: 2,
          onlyInt: true,
        }),
      )
    }

    if (!col.fields.getByName('atesto_via1_rotulo')) {
      col.fields.add(
        new TextField({
          name: 'atesto_via1_rotulo',
          required: false,
        }),
      )
    }

    if (!col.fields.getByName('atesto_via2_rotulo')) {
      col.fields.add(
        new TextField({
          name: 'atesto_via2_rotulo',
          required: false,
        }),
      )
    }

    app.save(col)

    // Atualizar registros existentes com os defaults caso estejam nulos/vazios
    const records = app.findRecordsByFilter('configuracoes', '', '-created', 10, 0)
    for (const r of records) {
      if (!r.get('atesto_vias')) {
        r.set('atesto_vias', 2)
      }
      if (r.get('atesto_via1_rotulo') === undefined || r.get('atesto_via1_rotulo') === null) {
        r.set('atesto_via1_rotulo', 'Escola')
      }
      if (r.get('atesto_via2_rotulo') === undefined || r.get('atesto_via2_rotulo') === null) {
        r.set('atesto_via2_rotulo', 'Cooperativa')
      }
      app.save(r)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('configuracoes')

    if (col.fields.getByName('atesto_vias')) {
      col.fields.removeByName('atesto_vias')
    }
    if (col.fields.getByName('atesto_via1_rotulo')) {
      col.fields.removeByName('atesto_via1_rotulo')
    }
    if (col.fields.getByName('atesto_via2_rotulo')) {
      col.fields.removeByName('atesto_via2_rotulo')
    }

    app.save(col)
  },
)
