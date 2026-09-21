migrate(
  (app) => {
    // =========================================================================
    // LIMPEZA TOTAL DO BANCO DE DADOS (POCKETBASE / SKIP CLOUD)
    // Escopo confirmado pelo usuário:
    // 1. Apagar TODOS os registros das coleções:
    //    atestos, pedido_itens, pedidos, importacoes, envios_whatsapp,
    //    contrato_itens, contrato_escolas, rotas, contratos, escolas, produtos
    // 2. Apagar todos os ciclos existentes e criar exatamente 1 ciclo ativo
    //    de teste (fase "coletando") para o sistema ter um ciclo corrente.
    // 3. Manter intactos:
    //    - Usuários (auth + perfis MASTER, SECRETARIA etc.)
    //    - Configurações da cooperativa (singleton)
    //    - Estrutura de todas as coleções
    // =========================================================================

    // Função utilitária para limpar uma coleção com segurança (truncate + fallback delete)
    function clearCollection(colName) {
      try {
        const col = app.findCollectionByNameOrId(colName)
        app.truncateCollection(col)
      } catch (err) {
        // Fallback caso truncate não seja suportado ou falhe por restrição temporária
        try {
          const records = app.findRecordsByFilter(colName, '', '', 10000, 0)
          for (const rec of records) {
            app.delete(rec)
          }
        } catch (_) {}
      }
    }

    // Ordem de deleção respeitando chaves estrangeiras e dependências:
    // 1. atestos (depende de pedidos)
    clearCollection('atestos')

    // 2. pedido_itens (depende de pedidos e produtos)
    clearCollection('pedido_itens')

    // 3. pedidos (depende de escolas, rotas, ciclos, users)
    clearCollection('pedidos')

    // 4. importacoes (depende de ciclos, contratos, users)
    clearCollection('importacoes')

    // 5. envios_whatsapp (depende de ciclos, escolas)
    clearCollection('envios_whatsapp')

    // 6. contrato_itens (depende de contratos, produtos)
    clearCollection('contrato_itens')

    // 7. contrato_escolas (depende de contratos, escolas, rotas)
    clearCollection('contrato_escolas')

    // 8. rotas (depende de contratos)
    clearCollection('rotas')

    // 9. contratos
    clearCollection('contratos')

    // 10. escolas
    clearCollection('escolas')

    // 11. produtos
    clearCollection('produtos')

    // 12. ciclos: apagar todos os ciclos existentes
    clearCollection('ciclos')

    // 13. Criar exatamente 1 único ciclo ativo de teste (fase "coletando")
    const ciclosCol = app.findCollectionByNameOrId('ciclos')
    const novoCiclo = new Record(ciclosCol)

    const hoje = new Date()
    const ano = hoje.getUTCFullYear()
    const mes = String(hoje.getUTCMonth() + 1).padStart(2, '0')
    const dia = String(hoje.getUTCDate()).padStart(2, '0')

    const dataFimObj = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000)
    const fimAno = dataFimObj.getUTCFullYear()
    const fimMes = String(dataFimObj.getUTCMonth() + 1).padStart(2, '0')
    const fimDia = String(dataFimObj.getUTCDate()).padStart(2, '0')

    novoCiclo.set('nome', `Ciclo 01/${ano} - Teste Operacional`)
    novoCiclo.set('data_inicio', `${ano}-${mes}-${dia} 00:00:00.000Z`)
    novoCiclo.set('data_fim', `${fimAno}-${fimMes}-${fimDia} 23:59:59.999Z`)
    novoCiclo.set('status', 'coletando')
    novoCiclo.set('snapshot', {})

    app.save(novoCiclo)
  },
  (app) => {
    // Reversão de limpeza de banco de dados irreversível não é aplicável
  },
)
