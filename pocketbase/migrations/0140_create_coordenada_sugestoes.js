/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 0140: Criação da coleção `coordenada_sugestoes` para sugestões de coordenadas GPS
 * capturadas pelo motorista durante a entrega no Portal do Motorista.
 *
 * A coordenada NÃO é aplicada automaticamente na escola:
 * ela entra numa fila com status "pendente" para que a cooperativa
 * revise, compare a distância com a coordenada atual e aprove ou recuse.
 */
migrate(
  (app) => {
    let escolasColId = ''
    try {
      escolasColId = app.findCollectionByNameOrId('escolas').id
    } catch (_) {}

    let rotasColId = ''
    try {
      rotasColId = app.findCollectionByNameOrId('rotas').id
    } catch (_) {}

    let ciclosColId = ''
    try {
      ciclosColId = app.findCollectionByNameOrId('ciclos').id
    } catch (_) {}

    let chamadasColId = ''
    try {
      chamadasColId = app.findCollectionByNameOrId('chamadas').id
    } catch (_) {}

    let motoristasColId = ''
    try {
      motoristasColId = app.findCollectionByNameOrId('motoristas').id
    } catch (_) {}

    let rotaDespachosColId = ''
    try {
      rotaDespachosColId = app.findCollectionByNameOrId('rota_despachos').id
    } catch (_) {}

    let entregaRegColId = ''
    try {
      entregaRegColId = app.findCollectionByNameOrId('entrega_registros').id
    } catch (_) {}

    let usersColId = '_pb_users_auth_'

    let col
    try {
      col = app.findCollectionByNameOrId('coordenada_sugestoes')
    } catch (_) {
      const fields = [
        {
          name: 'escola_id',
          type: 'relation',
          required: true,
          collectionId: escolasColId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'lat',
          type: 'number',
          required: true,
        },
        {
          name: 'lng',
          type: 'number',
          required: true,
        },
        {
          name: 'precisao',
          type: 'number',
          required: false,
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['pendente', 'aprovada', 'recusada'],
          maxSelect: 1,
        },
      ]

      if (rotasColId) {
        fields.push({
          name: 'rota_id',
          type: 'relation',
          required: false,
          collectionId: rotasColId,
          cascadeDelete: false,
          maxSelect: 1,
        })
      }

      if (ciclosColId) {
        fields.push({
          name: 'ciclo_id',
          type: 'relation',
          required: false,
          collectionId: ciclosColId,
          cascadeDelete: false,
          maxSelect: 1,
        })
      }

      if (chamadasColId) {
        fields.push({
          name: 'chamada_id',
          type: 'relation',
          required: false,
          collectionId: chamadasColId,
          cascadeDelete: false,
          maxSelect: 1,
        })
      }

      if (motoristasColId) {
        fields.push({
          name: 'motorista_id',
          type: 'relation',
          required: false,
          collectionId: motoristasColId,
          cascadeDelete: false,
          maxSelect: 1,
        })
      }

      if (rotaDespachosColId) {
        fields.push({
          name: 'despacho_id',
          type: 'relation',
          required: false,
          collectionId: rotaDespachosColId,
          cascadeDelete: false,
          maxSelect: 1,
        })
      }

      if (entregaRegColId) {
        fields.push({
          name: 'registro_id',
          type: 'relation',
          required: false,
          collectionId: entregaRegColId,
          cascadeDelete: false,
          maxSelect: 1,
        })
      }

      fields.push(
        {
          name: 'revisado_por',
          type: 'relation',
          required: false,
          collectionId: usersColId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'revisado_em', type: 'date', required: false },
        { name: 'motivo_recusa', type: 'text', required: false },
        { name: 'observacao', type: 'text', required: false },
        { name: 'origem', type: 'text', required: false }, // ex: 'portal_motorista'
        { name: 'entregue_em', type: 'date', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      )

      col = new Collection({
        name: 'coordenada_sugestoes',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '@request.auth.id != ""',
        fields: fields,
        indexes: [],
      })

      app.save(col)
      console.log('[0140] Coleção coordenada_sugestoes criada com sucesso.')
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('coordenada_sugestoes')
      app.delete(col)
    } catch (_) {}
  },
)
