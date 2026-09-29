/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Atualização pontual das coordenadas pendentes das 2 escolas que vieram faltantes:
    // 1. CE EUCLYDES DA CUNHA (id: 8s2rpghkjvq5fjq) -> longitude = -42.9799514
    // 2. CE PROFESSORA ALVINA VALERIO DA SILVA (id: labsqssknlavo1o) -> latitude = -22.5459873
    // NÃO alterar cep, nome, endereço, contato nem qualquer outro campo.
    // NÃO tocar em nenhum outro registro.

    try {
      const e1 = app.findRecordById('escolas', '8s2rpghkjvq5fjq')
      e1.set('longitude', '-42.9799514')
      app.save(e1)
    } catch (err) {
      console.log(
        'Aviso ao atualizar longitude da escola CE EUCLYDES DA CUNHA (8s2rpghkjvq5fjq):',
        err,
      )
    }

    try {
      const e2 = app.findRecordById('escolas', 'labsqssknlavo1o')
      e2.set('latitude', '-22.5459873')
      app.save(e2)
    } catch (err) {
      console.log(
        'Aviso ao atualizar latitude da escola CE PROFESSORA ALVINA VALERIO DA SILVA (labsqssknlavo1o):',
        err,
      )
    }
  },
  (app) => {
    try {
      const e1 = app.findRecordById('escolas', '8s2rpghkjvq5fjq')
      e1.set('longitude', '')
      app.save(e1)
    } catch (_) {}

    try {
      const e2 = app.findRecordById('escolas', 'labsqssknlavo1o')
      e2.set('latitude', '')
      app.save(e2)
    } catch (_) {}
  },
)
