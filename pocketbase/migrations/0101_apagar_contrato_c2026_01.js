/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Exclusão definitiva e segura do contrato C-2026-01 (id: jtawh1rmm4jpcus),
    // conforme confirmação do usuário.
    // Escopo estrito:
    // 1. Desvincular rotas (set contrato_id = null) para que ROTA A, B e C e suas paradas_rota sejam 100% preservadas
    // 2. Apagar contrato_itens do contrato C-2026-01 (~19 itens)
    // 3. Apagar contrato_escolas do contrato C-2026-01
    // 4. Apagar ciclo_contratos do contrato C-2026-01 (se existir)
    // 5. Apagar tokens_formulario, despachos e importacoes do contrato C-2026-01 (se existirem)
    // 6. Apagar o registro do contrato C-2026-01 na collection contratos
    // 7. Não apagar chamadas, rotas, escolas, paradas_rota, produtos, usuários ou configurações.

    const CONTRATO_NUMERO = 'C-2026-01'
    const CONTRATO_ID = 'jtawh1rmm4jpcus'

    // Localizar contrato por ID ou por número
    let contrato = null
    try {
      contrato = app.findRecordById('contratos', CONTRATO_ID)
    } catch (_) {
      try {
        contrato = app.findFirstRecordByData('contratos', 'numero', CONTRATO_NUMERO)
      } catch (__) {
        // Contrato já não existe — idempotente
        console.log(`[0101] Contrato ${CONTRATO_NUMERO} não encontrado. Nada a apagar.`)
        return
      }
    }

    if (!contrato) return
    const targetContratoId = contrato.id

    // 1. Desvincular rotas antes da exclusão do contrato, preservando todas as rotas (ROTA A, B, C) e paradas_rota
    try {
      const rotas = app.findRecordsByFilter(
        'rotas',
        `contrato_id = "${targetContratoId}"`,
        'created',
        0,
      )
      for (const rota of rotas) {
        rota.set('contrato_id', null)
        app.save(rota)
      }
      console.log(`[0101] Desvinculadas ${rotas.length} rotas do contrato ${targetContratoId}`)
    } catch (err) {
      console.log('[0101] Erro ao desvincular rotas:', err)
    }

    // 2. Apagar contrato_itens vinculados
    try {
      const itens = app.findRecordsByFilter(
        'contrato_itens',
        `contrato_id = "${targetContratoId}"`,
        'created',
        0,
      )
      for (const item of itens) {
        app.delete(item)
      }
      console.log(`[0101] Apagados ${itens.length} contrato_itens`)
    } catch (err) {
      console.log('[0101] Erro ao apagar contrato_itens:', err)
      throw err
    }

    // 3. Apagar contrato_escolas vinculados
    try {
      const escolas = app.findRecordsByFilter(
        'contrato_escolas',
        `contrato_id = "${targetContratoId}"`,
        'created',
        0,
      )
      for (const ce of escolas) {
        app.delete(ce)
      }
      console.log(`[0101] Apagados ${escolas.length} vínculos contrato_escolas`)
    } catch (err) {
      console.log('[0101] Erro ao apagar contrato_escolas:', err)
      throw err
    }

    // 4. Apagar ciclo_contratos vinculados (se houver)
    try {
      const ccs = app.findRecordsByFilter(
        'ciclo_contratos',
        `contrato_id = "${targetContratoId}"`,
        'created',
        0,
      )
      for (const cc of ccs) {
        app.delete(cc)
      }
      console.log(`[0101] Apagados ${ccs.length} ciclo_contratos`)
    } catch (err) {
      console.log('[0101] Erro ao apagar ciclo_contratos:', err)
    }

    // 5. Apagar tokens_formulario vinculados (se houver)
    try {
      const tokens = app.findRecordsByFilter(
        'tokens_formulario',
        `contrato_id = "${targetContratoId}"`,
        'created',
        0,
      )
      for (const tk of tokens) {
        app.delete(tk)
      }
    } catch (_) {}

    // 6. Apagar importacoes vinculadas (se houver)
    try {
      const imps = app.findRecordsByFilter(
        'importacoes',
        `contrato_id = "${targetContratoId}"`,
        'created',
        0,
      )
      for (const imp of imps) {
        app.delete(imp)
      }
    } catch (_) {}

    // 7. Apagar despachos vinculados ao contrato (se houver e não vinculados a chamada)
    try {
      const desps = app.findRecordsByFilter(
        'despachos',
        `contrato_id = "${targetContratoId}"`,
        'created',
        0,
      )
      for (const desp of desps) {
        if (!desp.getString('chamada_id')) {
          app.delete(desp)
        } else {
          desp.set('contrato_id', null)
          app.save(desp)
        }
      }
    } catch (_) {}

    // 8. Apagar o registro do contrato por último
    try {
      app.delete(contrato)
      console.log(`[0101] Contrato ${CONTRATO_NUMERO} (${targetContratoId}) apagado com sucesso.`)
    } catch (err) {
      console.log('[0101] Erro ao apagar registro de contratos:', err)
      throw err
    }
  },
  (app) => {
    // Operação irreversível de limpeza autorizada pelo usuário
  },
)
