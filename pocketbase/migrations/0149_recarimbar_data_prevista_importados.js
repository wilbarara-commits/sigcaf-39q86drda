// Migration idempotente de reparo de dados: pedidos importados (criar_pedidos_batch)
// ficaram com data_prevista = momento da importação (fallback new Date() do hook),
// em vez da data de entrega do ciclo. Isso fez /rotas e /consolidacao-simples
// agruparem os pedidos na data errada nos seletores de data.
//
// Critério de recarimba (apenas falsos data_prevista):
//   - data_prevista difere de `created` em menos de 1 hora (a gravação do hook é
//     ~1s antes do created; pedidos legítimos nunca têm data_prevista ≈ created);
//   - o pedido tem ciclo com data_despacho preenchida.
// Correção: data_prevista passa a ser a data_despacho do ciclo (meio-dia UTC,
// mesmo formato dos pedidos manuais/formulário).
// Pedidos com data de entrega explícita e legítima (diferença >= 1h) NÃO são tocados.
//
// Idempotente: rodar de novo não altera nada (data_prevista = meio-dia UTC dista
// da "data de criação" do ciclo, e a diferença para o created original segue >= 1h).

migrate(
  (app) => {
    const pedidos = app.findRecordsByFilter('pedidos', 'data_prevista != ""', '-created', 0, 0)
    const ciclosCache = {}
    let corrigidos = 0
    let intocados = 0

    for (let i = 0; i < pedidos.length; i++) {
      const p = pedidos[i]
      const dataPrevista = p.getString('data_prevista')
      const created = p.getString('created')
      if (!dataPrevista || !created) continue

      const tPrevista = new Date(dataPrevista.replace(' ', 'T')).getTime()
      const tCreated = new Date(created.replace(' ', 'T')).getTime()
      if (isNaN(tPrevista) || isNaN(tCreated)) continue

      // Falso data_prevista: coincide com o instante de criação (poucos segundos)
      if (Math.abs(tPrevista - tCreated) >= 3600 * 1000) {
        intocados++
        continue
      }

      const cicloId = p.getString('ciclo_id')
      if (!cicloId) {
        intocados++
        continue
      }

      let dataDespacho = ciclosCache[cicloId]
      if (dataDespacho === undefined) {
        try {
          dataDespacho = app.findRecordById('ciclos', cicloId).getString('data_despacho')
        } catch (_) {
          dataDespacho = ''
        }
        ciclosCache[cicloId] = dataDespacho
      }
      if (!dataDespacho) {
        intocados++
        continue
      }

      p.set('data_prevista', dataDespacho)
      app.save(p)
      corrigidos++
    }

    console.log(
      '[0149] data_prevista recarimbada com data_despacho: ' +
        corrigidos +
        ' pedido(s); legítimos/sem ciclo: ' +
        intocados,
    )
  },
  (app) => {
    // Down: não há reverso — reparo de dados idempotente
  },
)
