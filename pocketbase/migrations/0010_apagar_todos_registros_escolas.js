migrate(
  (app) => {
    // =========================================================================
    // 1. LIMPAR VÍNCULOS DEPENDENTES DE ESCOLAS
    // =========================================================================
    // Requisito: antes de apagar escolas, verificar e remover registros em
    // tabelas que referenciam escolas (contrato_escolas, envios_whatsapp,
    // pedidos dependentes de escolas, etc.) para não deixar referências órfãs.
    // Não apagamos contratos ou outros dados não-dependentes.

    // 1.1 Se existirem pedidos com escola_id vinculada, remover itens e pedidos órfãos
    try {
      const pedidosComEscola = app.findRecordsByFilter('pedidos', 'escola_id != ""', '', 5000, 0)
      for (const ped of pedidosComEscola) {
        // Remover itens do pedido
        try {
          const itens = app.findRecordsByFilter(
            'pedido_itens',
            `pedido_id = "${ped.id}"`,
            '',
            1000,
            0,
          )
          for (const item of itens) {
            app.delete(item)
          }
        } catch (_) {}

        // Remover atestos do pedido
        try {
          const atestos = app.findRecordsByFilter('atestos', `pedido_id = "${ped.id}"`, '', 100, 0)
          for (const atesto of atestos) {
            app.delete(atesto)
          }
        } catch (_) {}

        app.delete(ped)
      }
    } catch (_) {}

    // 1.2 Limpar envios_whatsapp que referenciam escolas
    try {
      const colEnviosWa = app.findCollectionByNameOrId('envios_whatsapp')
      app.truncateCollection(colEnviosWa)
    } catch (_) {
      try {
        const envios = app.findRecordsByFilter('envios_whatsapp', '', '', 5000, 0)
        for (const env of envios) {
          app.delete(env)
        }
      } catch (_) {}
    }

    // 1.3 Limpar contrato_escolas (vínculo escola <-> contrato)
    try {
      const colContratoEscolas = app.findCollectionByNameOrId('contrato_escolas')
      app.truncateCollection(colContratoEscolas)
    } catch (_) {
      try {
        const ces = app.findRecordsByFilter('contrato_escolas', '', '', 5000, 0)
        for (const ce of ces) {
          app.delete(ce)
        }
      } catch (_) {}
    }

    // 1.4 Caso exista campo legadíssimo escola_id ou instituicao_id em contratos, anular
    try {
      const contratosCol = app.findCollectionByNameOrId('contratos')
      const hasEscolaId = !!contratosCol.fields.getByName('escola_id')
      const hasInstituicaoId = !!contratosCol.fields.getByName('instituicao_id')
      if (hasEscolaId) {
        app.db().newQuery('UPDATE contratos SET escola_id = NULL').execute()
      }
      if (hasInstituicaoId) {
        app.db().newQuery('UPDATE contratos SET instituicao_id = NULL').execute()
      }
    } catch (_) {}

    // =========================================================================
    // 2. APAGAR TODOS OS REGISTROS DA COLLECTION 'escolas'
    // =========================================================================
    // Mantém a estrutura da collection intacta, assim como usuários, produtos e ciclos
    const colEscolas = app.findCollectionByNameOrId('escolas')
    try {
      app.truncateCollection(colEscolas)
    } catch (_) {
      const escolas = app.findRecordsByFilter('escolas', '', '', 5000, 0)
      for (const e of escolas) {
        app.delete(e)
      }
    }
  },
  (app) => {
    // Reversão de limpeza de registros não é aplicável
  },
)
