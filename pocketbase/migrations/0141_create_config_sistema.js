/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 0141: Coleção interna config_sistema e seed da ERP_API_KEY.
 *
 * 1. Coleção 'config_sistema' para parâmetros e segredos internos do servidor.
 *    - Regras de acesso bloqueadas (null): nenhum usuário comum ou anônimo
 *      consegue ler, listar, criar, editar ou excluir via REST API.
 *      Apenas superusers e hooks de backend (via $app) têm acesso.
 *    - Campos: chave (texto, obrigatório, único), valor (texto, obrigatório).
 * 2. Inserção idempotente do registro:
 *    chave = 'ERP_API_KEY'
 *    valor = 'sk-erp-9f4K2vTqL8mWxR7bJcN3hY6dPzA5sGeU4wQnM1tBvXj'
 */
migrate(
  (app) => {
    let col
    try {
      col = app.findCollectionByNameOrId('config_sistema')
    } catch (_) {
      col = new Collection({
        name: 'config_sistema',
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'chave',
            type: 'text',
            required: true,
          },
          {
            name: 'valor',
            type: 'text',
            required: true,
          },
          {
            name: 'created',
            type: 'autodate',
            onCreate: true,
            onUpdate: false,
          },
          {
            name: 'updated',
            type: 'autodate',
            onCreate: true,
            onUpdate: true,
          },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_config_sistema_chave ON config_sistema (chave)'],
      })

      app.save(col)
      console.log('[0141] Coleção config_sistema criada com sucesso.')
    }

    // Inserção ou atualização idempotente de ERP_API_KEY
    const targetKey = 'ERP_API_KEY'
    const targetValue = 'sk-erp-9f4K2vTqL8mWxR7bJcN3hY6dPzA5sGeU4wQnM1tBvXj'

    try {
      const existing = app.findFirstRecordByData('config_sistema', 'chave', targetKey)
      const currentVal = existing.getString('valor') || ''
      if (!currentVal.trim()) {
        existing.set('valor', targetValue)
        app.save(existing)
        console.log('[0141] Registro ERP_API_KEY atualizado com valor padrão.')
      } else {
        console.log('[0141] Registro ERP_API_KEY já existente e preenchido.')
      }
    } catch (_) {
      // Não encontrado, criar novo registro
      const targetCol = col || app.findCollectionByNameOrId('config_sistema')
      const rec = new Record(targetCol)
      rec.set('chave', targetKey)
      rec.set('valor', targetValue)
      app.save(rec)
      console.log('[0141] Registro ERP_API_KEY inserido com sucesso.')
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('config_sistema')
      app.delete(col)
    } catch (_) {}
  },
)
