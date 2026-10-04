/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // =========================================================================
    // CORRIGIR CICLO 40/2026 DA CHAMADA 07/2025
    //
    // Contexto:
    // A Chamada 07/2025 (Estadual) define as seguintes regras de dias da semana:
    //   - Início: quarta-feira (3)
    //   - Despacho / Entrega: terça-feira (2)
    //   - Fim: terça-feira (2)
    //
    // Para o ano de 2026, a semana ISO 40 inicia em:
    //   - Quarta-feira: 30/09/2026
    //   - Despacho / Entrega (terça-feira seguinte da semana): 06/10/2026
    //   - Fim (terça-feira seguinte da semana): 06/10/2026 23:59:59.999Z
    //
    // O ciclo 40/2026 (id: ms1tl05hgzpx463) havia sido salvo anteriormente
    // com despacho_previsto na segunda-feira 05/10/2026 (padrão legado).
    // Esta migração ajusta data_despacho, data_fim e o snapshot JSON do ciclo.
    // =========================================================================

    const inicioIso = '2026-09-30T00:00:00.000Z'
    const despachoIso = '2026-10-06T12:00:00.000Z'
    const fimIso = '2026-10-06T23:59:59.999Z'

    try {
      const ciclo = app.findRecordById('ciclos', 'ms1tl05hgzpx463')
      if (ciclo) {
        ciclo.set('data_inicio', inicioIso)
        ciclo.set('data_despacho', despachoIso)
        ciclo.set('data_fim', fimIso)

        let snapshot = {}
        try {
          const raw = ciclo.get('snapshot')
          snapshot = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {}
        } catch (_) {
          snapshot = {}
        }

        snapshot.despacho_previsto_segunda = despachoIso
        snapshot.regra_semanal = 'quarta_a_terca'
        snapshot.numero_ciclo = 40
        snapshot.ano_ciclo = 2026
        snapshot.regra_dias = {
          diaInicio: 'quarta',
          diaDespacho: 'terca',
          diaFim: 'terca',
        }

        ciclo.set('snapshot', snapshot)
        app.save(ciclo)
        console.log('[0115] Ciclo ms1tl05hgzpx463 atualizado com sucesso via ORM')
      }
    } catch (e) {
      console.log('[0115] Aviso ao buscar/salvar ciclo por ID, tentando via SQL:', e)
    }

    try {
      app
        .db()
        .newQuery(`
          UPDATE ciclos
          SET data_inicio = '${inicioIso}',
              data_despacho = '${despachoIso}',
              data_fim = '${fimIso}'
          WHERE nome LIKE '%40/2026%' OR id = 'ms1tl05hgzpx463'
        `)
        .execute()
    } catch (e2) {
      console.log('[0115] UPDATE ciclos erro:', e2)
    }
  },
  (app) => {},
)
