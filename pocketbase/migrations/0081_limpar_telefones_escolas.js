migrate(
  (app) => {
    // =========================================================================
    // MANUTENÇÃO DE DADOS: LIMPAR CAMPO TELEFONE DE TODAS AS ESCOLAS
    //
    // Solicitação do usuário:
    // "Apagar todos os telefones das escolas."
    //
    // Escopo:
    // - Limpar o campo telefone de TODOS os registros da collection escolas
    //   (definir telefone = '').
    // - Preservar rigorosamente todos os demais campos:
    //   nome, contato, email, endereco, bairro, tipo, alunos etc.
    // - Operação 100% idempotente (se executada novamente, garante telefone vazio).
    // =========================================================================

    // 1. Atualizar diretamente via SQL (PocketBase/SQLite)
    app.db().newQuery("UPDATE escolas SET telefone = ''").execute()

    // 2. Garantir também via SDK PocketBase para atualizar registros se necessário
    try {
      const escolas = app.findRecordsByFilter('escolas', "telefone != ''", '', 1000, 0)
      if (escolas && escolas.length > 0) {
        for (const escola of escolas) {
          escola.set('telefone', '')
          app.save(escola)
        }
      }
    } catch (err) {
      console.log('[0081] Aviso na verificação/atualização via SDK de escolas:', err)
    }

    console.log('[0081] Telefones de todas as escolas apagados com sucesso.')
  },
  (app) => {
    // Reversão de limpeza de telefone não é aplicável
  },
)
