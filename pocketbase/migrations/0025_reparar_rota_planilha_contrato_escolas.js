migrate(
  (app) => {
    // Migração de reparo dos vínculos de contrato_escolas:
    // O campo 'rota' guarda o NOME texto livre da rota da planilha (ex: "ROTA A", "ROTA B").
    // Alguns registros foram corrompidos contendo o ID alfanumérico de 15 caracteres de 'rotas' ou 'rotas_logisticas'.
    //
    // Para cada registro em contrato_escolas onde 'rota' é um ID de 15 caracteres:
    // 1. Se existir registro na tabela 'rotas' com esse ID, substitui pelo nome real da rota (r.nome).
    // 2. Se rota_id apontar para uma rota válida em 'rotas', usa o nome dela.
    // 3. Se houver outro vínculo da mesma escola com nome textual válido de rota, copia esse nome.
    // 4. Caso contrário, se o valor for um ID desconhecido ou de rotas_logisticas, limpa para vazio ('').
    // 5. Se rota_id apontar para um ID que não existe na collection 'rotas', limpa rota_id para ''.
    //
    // Importante: NÃO apaga registros de contrato_escolas e NÃO altera rota_logistica_id.

    try {
      // 1. Resolver registros onde rota = r.id (id de uma rota da planilha)
      app
        .db()
        .newQuery(`
        UPDATE contrato_escolas
        SET rota = (SELECT r.nome FROM rotas r WHERE r.id = contrato_escolas.rota)
        WHERE rota GLOB '[a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9]'
          AND EXISTS (SELECT 1 FROM rotas r WHERE r.id = contrato_escolas.rota)
      `)
        .execute()
    } catch (err) {
      console.log('Erro ao resolver rota a partir de rotas.id:', err)
    }

    try {
      // 2. Resolver registros onde rota_id é válido na collection rotas, mas o campo rota ainda é um ID de 15 caracteres ou vazio
      app
        .db()
        .newQuery(`
        UPDATE contrato_escolas
        SET rota = (SELECT r.nome FROM rotas r WHERE r.id = contrato_escolas.rota_id)
        WHERE (rota GLOB '[a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9]' OR rota IS NULL OR rota = '')
          AND rota_id IS NOT NULL
          AND rota_id != ''
          AND EXISTS (SELECT 1 FROM rotas r WHERE r.id = contrato_escolas.rota_id)
      `)
        .execute()
    } catch (err) {
      console.log('Erro ao resolver rota a partir de rota_id:', err)
    }

    try {
      // 3. Se ainda houver rota com formato de ID de 15 caracteres, verificar se há outro vínculo da mesma escola com nome textual válido
      app
        .db()
        .newQuery(`
        UPDATE contrato_escolas
        SET rota = (
          SELECT ce2.rota
          FROM contrato_escolas ce2
          WHERE ce2.escola_id = contrato_escolas.escola_id
            AND ce2.id != contrato_escolas.id
            AND ce2.rota IS NOT NULL
            AND ce2.rota != ''
            AND NOT (ce2.rota GLOB '[a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9]')
          LIMIT 1
        )
        WHERE rota GLOB '[a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9]'
          AND EXISTS (
            SELECT 1 FROM contrato_escolas ce2
            WHERE ce2.escola_id = contrato_escolas.escola_id
              AND ce2.id != contrato_escolas.id
              AND ce2.rota IS NOT NULL
              AND ce2.rota != ''
              AND NOT (ce2.rota GLOB '[a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9]')
          )
      `)
        .execute()
    } catch (err) {
      console.log('Erro ao resolver rota a partir de outro vinculo da escola:', err)
    }

    try {
      // 4. Qualquer valor remanescente em 'rota' que ainda seja um ID de 15 caracteres deve ser limpo para ''
      app
        .db()
        .newQuery(`
        UPDATE contrato_escolas
        SET rota = ''
        WHERE rota GLOB '[a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9][a-z0-9]'
      `)
        .execute()
    } catch (err) {
      console.log('Erro ao limpar IDs remanescentes em contrato_escolas.rota:', err)
    }

    try {
      // 5. Se rota_id apontar para um ID que não existe na collection 'rotas', limpa rota_id para ''
      app
        .db()
        .newQuery(`
        UPDATE contrato_escolas
        SET rota_id = ''
        WHERE rota_id IS NOT NULL
          AND rota_id != ''
          AND NOT EXISTS (SELECT 1 FROM rotas r WHERE r.id = contrato_escolas.rota_id)
      `)
        .execute()
    } catch (err) {
      console.log('Erro ao limpar rota_id inválido em contrato_escolas:', err)
    }
  },
  (app) => {
    // Reversão não necessária / no-op para migração de limpeza/reparo de dados corrompidos
  },
)
