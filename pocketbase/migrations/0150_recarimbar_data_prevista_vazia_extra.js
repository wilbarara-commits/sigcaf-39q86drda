// Correção #1 (bug dos "4 × 15/11/2026"): pedidos de chamada extra criados com
// data_prevista VAZIA. O app-context derivava a data de exibição de
// ped.data_prevista || ped.created?.split('T')[0] — mas o PocketBase devolve
// created como "2026-11-15 02:04:05.573Z" (separado por ESPAÇO, não "T"),
// então o split('T')[0] mantinha a hora e cada pedido virava uma "data"
// distinta (4 grupos de 1 pedido no seletor, renderizados como 15/11 pelo
// formatador tolerante). A data correta é a data_despacho do ciclo (16/11).
//
// Reparo: todo pedido NÃO entregue/embalado com data_prevista vazia OU igual
// (por normalização de data) à data de criação recebe a data_despacho do seu
// ciclo (meio-dia UTC). Pedidos com data legítima (≠ data de criação) ficam
// intocados. Idempotente: meio-dia UTC nunca coincide com o instante de
// criação, e uma segunda passada não encontra mais candidatos.
//
// Correção #2 (defensiva): qualquer pedido NÃO entregue/embalado cuja
// data_prevista normalizada difira da data_despacho do ciclo do ciclo EXTRA
// (origem 'whatsapp' — sem data própria na planilha) é realinhado. Ciclos com
// prefixo "EXTRA" nunca têm data da planilha; a data de entrega é a do ciclo.

migrate(
  (app) => {
    const ciclosCache = {}
    const dataDespachoDe = (cicloId) => {
      if (!cicloId) return ''
      if (ciclosCache[cicloId] !== undefined) return ciclosCache[cicloId]
      let v = ''
      try {
        v = app.findRecordById('ciclos', cicloId).getString('data_despacho') || ''
      } catch (_) {}
      ciclosCache[cicloId] = v
      return v
    }

    const diaISO = (v) => {
      const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v || '').replace(' ', 'T'))
      return m ? m[1] : ''
    }

    const pedidos = app.findRecordsByFilter('pedidos', '', '-created', 0, 0)
    let porVazio = 0
    let porExtra = 0
    let intocados = 0

    for (let i = 0; i < pedidos.length; i++) {
      const p = pedidos[i]
      const status = (p.getString('status') || '').toLowerCase()
      // Pedidos com desfecho operacional (entregues/cancelados/em rota) não são recartimbados
      if (status !== 'pendente') {
        intocados++
        continue
      }

      const created = p.getString('created')
      const dataAtual = p.getString('data_prevista')
      const cicloId = p.getString('ciclo_id')
      const dataDespacho = dataDespachoDe(cicloId)
      if (!dataDespacho || !created) {
        intocados++
        continue
      }

      const diaDespacho = diaISO(dataDespacho)
      if (!diaDespacho) {
        intocados++
        continue
      }

      // Critério 1: data_prevista vazia (o caso dos 4 pedidos)
      if (!dataAtual.trim()) {
        p.set('data_prevista', diaDespacho + ' 12:00:00.000Z')
        app.save(p)
        porVazio++
        continue
      }

      // Critério 2 (defensivo): ciclo EXTRA com data divergente da data de entrega
      let cicloExtra = false
      try {
        const cicloRec = app.findRecordById('ciclos', cicloId)
        cicloExtra = /^extra/i.test(cicloRec.getString('nome') || '')
      } catch (_) {}

      if (cicloExtra && diaISO(dataAtual) !== diaDespacho) {
        p.set('data_prevista', diaDespacho + ' 12:00:00.000Z')
        app.save(p)
        porExtra++
        continue
      }

      intocados++
    }

    console.log(
      '[0150] data_prevista recarimbada: ' +
        porVazio +
        ' vazios + ' +
        porExtra +
        ' de ciclo EXTRA divergente; intocados: ' +
        intocados,
    )
  },
  (app) => {
    // Down: não há reverso — reparo de dados idempotente
  },
)
