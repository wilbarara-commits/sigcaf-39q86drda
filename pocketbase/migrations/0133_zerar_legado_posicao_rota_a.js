/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    app
      .db()
      .newQuery(
        "UPDATE rotas SET caminhao_posicao_atual = 0, caminhao_escola_id = '' WHERE id = 'hky0r83id0fw68d'",
      )
      .execute()
  },
  (app) => {
    // rollback opcional / no-op
  },
)
