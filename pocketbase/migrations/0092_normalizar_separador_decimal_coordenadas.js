/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Normalizar separador decimal de coordenadas da collection 'escolas', trocando vírgula por ponto.
    // Registros específicos solicitados:
    // 1. Registro '8s2rpghkjvq5fjq' (CE EUCLYDES DA CUNHA): latitude de "-22,4437857" para "-22.4437857"
    // 2. Registro 'labsqssknlavo1o' (CE PROFESSORA ALVINA VALERIO DA SILVA): longitude de "-42,985147" para "-42.985147"
    // Abordagem defensiva: busca todos os registros com vírgula em latitude ou longitude e normaliza apenas esses campos.

    try {
      const records = app.findRecordsByFilter(
        'escolas',
        "latitude ~ ',' || longitude ~ ','",
        '',
        0,
        0,
      )

      for (const record of records) {
        let changed = false
        const lat = record.getString('latitude')
        const lng = record.getString('longitude')

        if (lat && lat.includes(',')) {
          record.set('latitude', lat.replace(/,/g, '.'))
          changed = true
        }

        if (lng && lng.includes(',')) {
          record.set('longitude', lng.replace(/,/g, '.'))
          changed = true
        }

        if (changed) {
          app.save(record)
        }
      }
    } catch (err) {
      console.log('Erro ao normalizar coordenadas com vírgula na collection escolas:', err)
    }

    // Garantia explícita por ID caso o filtro por substring não tenha apanhado:
    try {
      const r1 = app.findRecordById('escolas', '8s2rpghkjvq5fjq')
      if (r1.getString('latitude') === '-22,4437857') {
        r1.set('latitude', '-22.4437857')
        app.save(r1)
      }
    } catch (err) {
      console.log('Aviso ao normalizar latitude da escola 8s2rpghkjvq5fjq:', err)
    }

    try {
      const r2 = app.findRecordById('escolas', 'labsqssknlavo1o')
      if (r2.getString('longitude') === '-42,985147') {
        r2.set('longitude', '-42.985147')
        app.save(r2)
      }
    } catch (err) {
      console.log('Aviso ao normalizar longitude da escola labsqssknlavo1o:', err)
    }
  },
  (app) => {
    // Reversão pontual dos dois registros para a representação anterior com vírgula
    try {
      const r1 = app.findRecordById('escolas', '8s2rpghkjvq5fjq')
      if (r1.getString('latitude') === '-22.4437857') {
        r1.set('latitude', '-22,4437857')
        app.save(r1)
      }
    } catch (_) {}

    try {
      const r2 = app.findRecordById('escolas', 'labsqssknlavo1o')
      if (r2.getString('longitude') === '-42.985147') {
        r2.set('longitude', '-42,985147')
        app.save(r2)
      }
    } catch (_) {}
  },
)
