/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // =========================================================================
    // LIMPEZA COMPLETA DE ATESTOS E HISTÓRICOS DE ATESTOS (FASE DE TESTES)
    //
    // Solicitação do usuário:
    // "Primeiro apague todos os atestos e históricos de atestos."
    //
    // ESCOPO:
    // 1. Collection 'atestos':
    //    - Apagar TODOS os registros iterando com app.delete(rec) para que o
    //      PocketBase remova os arquivos PDF anexados (campo 'arquivo' e 'assinatura_file')
    //      do storage e evite deixar arquivos órfãos.
    //    - Garantir limpeza total chamando app.truncateCollection e DELETE SQL.
    // 2. Não existe collection separada de histórico de atestos no banco
    //    (o histórico visualizado na UI é derivado diretamente dos registros de atestos).
    // 3. Nenhuma outra collection (pedidos, rotas, ciclos, escolas, produtos, contratos)
    //    é apagada ou modificada.
    // =========================================================================

    let countAtestosApagados = 0

    try {
      while (true) {
        const atestos = app.findRecordsByFilter('atestos', '', '', 500, 0)
        if (!atestos || atestos.length === 0) break
        for (const atesto of atestos) {
          try {
            app.delete(atesto)
            countAtestosApagados++
          } catch (delErr) {
            console.log('[0113] Erro ao deletar atesto individual:', atesto.id, delErr)
          }
        }
      }
    } catch (err) {
      console.log('[0113] Aviso ao iterar atestos para exclusão:', err)
    }

    try {
      const colAtestos = app.findCollectionByNameOrId('atestos')
      if (colAtestos) {
        app.truncateCollection(colAtestos)
      }
    } catch (_) {}

    try {
      app.db().newQuery('DELETE FROM atestos').execute()
    } catch (e) {
      console.log('[0113] DELETE FROM atestos erro:', e)
    }

    console.log(
      `[0113] Limpeza concluída: ${countAtestosApagados} atesto(s) apagado(s) com remoção de arquivos físicos do storage.`,
    )
  },
  (app) => {
    // Reversão de limpeza de registros em ambiente de testes não aplicável
  },
)
