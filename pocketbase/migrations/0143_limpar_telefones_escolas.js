/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // =========================================================================
    // MANUTENÇÃO DE DADOS: LIMPAR CAMPO TELEFONE DE TODAS AS ESCOLAS
    //
    // Solicitação do usuário:
    // "apagar os telefones das escolas" -> "limpar os valores".
    //
    // Requisitos:
    // 1. Atualizar cada registro da coleção `escolas` cujo campo `telefone`
    //    não esteja vazio, gravando `telefone = ""` (string vazia).
    // 2. Não tocar em nenhum outro campo (contato, email, endereco, bairro,
    //    cep, codigo_inep, alunos, etc. permanecem intactos).
    // 3. Operação defensiva e idempotente (se já executada ou repetida,
    //    não falha e garante todos os telefones vazios).
    // =========================================================================

    // 1. Atualização via banco SQL direto no PocketBase/SQLite
    app
      .db()
      .newQuery("UPDATE escolas SET telefone = '' WHERE telefone != '' AND telefone IS NOT NULL")
      .execute()

    // 2. Garantia via API do PocketBase para varrer quaisquer registros residuais
    try {
      const escolas = app.findRecordsByFilter('escolas', "telefone != ''", '', 1000, 0)
      if (escolas && escolas.length > 0) {
        for (const escola of escolas) {
          escola.set('telefone', '')
          app.save(escola)
        }
      }
      console.log(
        `[0143] Limpeza de telefones concluída. Registros adicionais processados via SDK: ${escolas ? escolas.length : 0}.`,
      )
    } catch (err) {
      console.log('[0143] Aviso na verificação/atualização via SDK de escolas:', err)
    }

    console.log('[0143] Campo telefone de todas as escolas limpo com sucesso.')
  },
  (app) => {
    // Reversão de limpeza de telefone não é aplicável (dados limpos intencionalmente)
  },
)
