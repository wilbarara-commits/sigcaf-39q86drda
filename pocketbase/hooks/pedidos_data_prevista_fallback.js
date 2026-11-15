// 0.0.303 — Endurecimento da criação de pedidos: data_prevista nunca fica vazia.
// Diagnóstico do bug dos "4 × 15/11/2026 • 1 pedido(s)" em /rotas: pedidos da
// chamada extra gravaram data_prevista vazia; o frontend derivava a data do
// campo created (split('T')[0], que falha porque o PocketBase devolve o
// timestamp com ESPAÇO: "2026-11-15 02:04:05.573Z") e cada pedido virou um
// grupo próprio no seletor de Data de Entrega.
// A migration 0150 já recartimbou os registros existentes (retroativo); este
// hook garante que TODO pedido novo, em qualquer origem (manual, whatsapp,
// excel, formulário, API), grave data_prevista = data_despacho do ciclo quando
// ela vier vazia — mesma regra da migration.
// Nota: em PocketBase Goja JSVM, declarações top-level causam "Hook scoping
// error" — todo o código vive dentro do callback do onRecordCreate.

onRecordCreate((e) => {
  const record = e.record
  if (!record || record.collection().name !== 'pedidos') {
    return e.next()
  }

  const dataPrevista = (record.getString('data_prevista') || '').trim()
  if (dataPrevista !== '') {
    return e.next()
  }

  const cicloId = (record.getString('ciclo_id') || '').trim()
  if (!cicloId) {
    return e.next()
  }

  try {
    const ciclo = $app.findRecordById('ciclos', cicloId)
    const dataDespacho = (ciclo.getString('data_despacho') || '').trim()
    if (dataDespacho !== '') {
      record.set('data_prevista', dataDespacho)
    }
  } catch (_) {
    // Ciclo inexistente: deixa gravar sem data_prevista (frontend normaliza)
  }

  return e.next()
}, 'pedidos')
