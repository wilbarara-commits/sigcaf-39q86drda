// Migration 0057: Atualiza a regra de numeração de ciclos para semanas Quarta-Feira -> Terça-Feira
// com despacho previsto para Segunda-Feira.
//
// Regra do Sistema SIGCAF:
// - Cada ciclo semanal COMEÇA na QUARTA-FEIRA às 00:00:00 e TERMINA na TERÇA-FEIRA seguinte às 23:59:59.
// - A semana 1 do ano é a primeira semana do ano sob essa convenção (quarta-feira inicial ou que contém o início do ano).
// - O despacho (colocação em rota) de cada ciclo é previsto para a SEGUNDA-FEIRA dentro da semana do ciclo
//   (quarta + 5 dias, véspera do encerramento da terça).
//
// No ciclo ativo atual do sistema:
// - O ciclo operacional em andamento foi planejado com coleta até 28/09 (segunda-feira prevista para despacho).
// - Pela regra Quarta -> Terça com despacho na segunda-feira 28/09/2026:
//   Quarta-feira de início: 23/09/2026 00:00:00.000Z
//   Terça-feira de encerramento: 29/09/2026 23:59:59.999Z
//   Segunda-feira de despacho: 28/09/2026 12:00:00.000Z
// - Cálculo da semana do ano:
//   A primeira quarta-feira de 2026 foi em 07/01/2026 (Semana 01/2026).
//   Em 23/09/2026: passaram-se 259 dias (37 semanas completas).
//   Logo, esta semana é a SEMANA 38 (Ciclo 38/2026).
// - O nome do ciclo é atualizado para: "Ciclo 38/2026 - Teste Operacional".

migrate(
  (app) => {
    const ciclos = app.findRecordsByFilter('ciclos', '', '-created', 50, 0)

    // Função interna para calcular dados do ciclo Quarta->Terça
    function calcularCicloPorData(ano, mes, dia) {
      const dataRef = new Date(Date.UTC(ano, mes - 1, dia, 0, 0, 0, 0))
      // dia da semana UTC: 0=dom, 1=seg, 2=ter, 3=qua, 4=qui, 5=sex, 6=sab
      const diaSemana = dataRef.getUTCDay()
      const diasDesdeQuarta = (diaSemana - 3 + 7) % 7

      const quartaInicio = new Date(Date.UTC(ano, mes - 1, dia - diasDesdeQuarta, 0, 0, 0, 0))
      const anoCiclo = quartaInicio.getUTCFullYear()

      // Primeira quarta do ano do ciclo
      const jan1 = new Date(Date.UTC(anoCiclo, 0, 1, 0, 0, 0, 0))
      const diasAtePrimeiraQuarta = (3 - jan1.getUTCDay() + 7) % 7
      const primeiraQuarta = new Date(Date.UTC(anoCiclo, 0, 1 + diasAtePrimeiraQuarta, 0, 0, 0, 0))

      const diffDias = Math.round(
        (quartaInicio.getTime() - primeiraQuarta.getTime()) / (1000 * 60 * 60 * 24),
      )
      const numeroSemana = Math.floor(diffDias / 7) + 1

      const tercaFim = new Date(
        Date.UTC(
          quartaInicio.getUTCFullYear(),
          quartaInicio.getUTCMonth(),
          quartaInicio.getUTCDate() + 6,
          23,
          59,
          59,
          999,
        ),
      )

      const segundaDespacho = new Date(
        Date.UTC(
          quartaInicio.getUTCFullYear(),
          quartaInicio.getUTCMonth(),
          quartaInicio.getUTCDate() + 5,
          12,
          0,
          0,
          0,
        ),
      )

      const numFormatado = numeroSemana < 10 ? '0' + numeroSemana : '' + numeroSemana
      return {
        numeroSemana: numeroSemana,
        ano: anoCiclo,
        codigoCiclo: numFormatado + '/' + anoCiclo,
        dataInicio: quartaInicio.toISOString(),
        dataFim: tercaFim.toISOString(),
        dataDespacho: segundaDespacho.toISOString(),
      }
    }

    // Corrigir ciclos existentes
    for (let i = 0; i < ciclos.length; i++) {
      const c = ciclos[i]
      const nomeAtual = c.getString('nome') || ''

      // O ciclo atual com coleta até 28/09/2026 corresponde à semana cuja segunda-feira de despacho é 28/09/2026
      // Quarta inicial: 23/09/2026.
      const calc = calcularCicloPorData(2026, 9, 23)

      let novoNome = 'Ciclo ' + calc.codigoCiclo
      if (nomeAtual.indexOf('Teste Operacional') !== -1) {
        novoNome = novoNome + ' - Teste Operacional'
      }

      c.set('nome', novoNome)
      c.set('data_inicio', calc.dataInicio)
      c.set('data_fim', calc.dataFim)

      let snap = {}
      try {
        const existingSnap = c.get('snapshot')
        if (existingSnap && typeof existingSnap === 'object') {
          snap = existingSnap
        }
      } catch (_) {}

      snap.regra_semanal = 'quarta_a_terca'
      snap.semana_ano = calc.numeroSemana
      snap.codigo_ciclo = calc.codigoCiclo
      snap.despacho_previsto_segunda = calc.dataDespacho
      snap.coleta_ate = '2026-09-28'

      c.set('snapshot', snap)
      app.save(c)
    }

    // Se nenhum ciclo existir, cria o ciclo ativo oficial
    if (ciclos.length === 0) {
      const ciclosCol = app.findCollectionByNameOrId('ciclos')
      const calc = calcularCicloPorData(2026, 9, 23)
      const novoCiclo = new Record(ciclosCol)
      novoCiclo.set('nome', 'Ciclo ' + calc.codigoCiclo + ' - Teste Operacional')
      novoCiclo.set('data_inicio', calc.dataInicio)
      novoCiclo.set('data_fim', calc.dataFim)
      novoCiclo.set('status', 'coletando')
      novoCiclo.set('snapshot', {
        regra_semanal: 'quarta_a_terca',
        semana_ano: calc.numeroSemana,
        codigo_ciclo: calc.codigoCiclo,
        despacho_previsto_segunda: calc.dataDespacho,
        coleta_ate: '2026-09-28',
      })
      app.save(novoCiclo)
    }
  },
  (app) => {
    const ciclos = app.findRecordsByFilter('ciclos', '', '-created', 10, 0)
    for (let i = 0; i < ciclos.length; i++) {
      const c = ciclos[i]
      if (c.getString('nome').indexOf('38/2026') !== -1) {
        c.set('nome', 'Ciclo 01/2026 - Teste Operacional')
        c.set('data_inicio', '2026-09-21 00:00:00.000Z')
        c.set('data_fim', '2026-09-28 23:59:59.999Z')
        app.save(c)
      }
    }
  },
)
