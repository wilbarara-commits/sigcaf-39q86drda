migrate(
  (app) => {
    // 1. Atualizar ou recriar tokens existentes gerados para contratos centralizados:
    // Em particular, o token da escola EM HERMÍNIA JOSETTI (jl987ffjs626ndv)
    // que estava apontando para o contrato centralizado C-2026-01 (x68esa2svgerhk4)
    // deve apontar para o contrato individualizado C-2026-02 (k1od63z34lg0ej9).
    // NÃO remover os vínculos legítimos em contrato_escolas.

    try {
      const contratoIndiv = app.findFirstRecordByData('contratos', 'numero', 'C-2026-02')
      const escolaHerminia = app.findFirstRecordByData('escolas', 'nome', 'EM HERMÍNIA JOSETTI')

      // Corrigir tokens existentes da EM HERMÍNIA JOSETTI para apontar para o contrato individualizado C-2026-02
      app
        .db()
        .newQuery(`
      UPDATE tokens_formulario
      SET contrato_id = {:novoContratoId}
      WHERE escola_id = {:escolaId}
    `)
        .bind({
          novoContratoId: contratoIndiv.id,
          escolaId: escolaHerminia.id,
        })
        .execute()
    } catch (err) {
      console.log('Aviso ao atualizar token da EM HERMÍNIA JOSETTI:', err)
    }

    // 2. Apagar tokens que apontam para contratos com modalidade_pedido = 'centralizado'
    // Garantir a regra: formulário é canal EXCLUSIVO para contratos individualizados.
    try {
      app
        .db()
        .newQuery(`
      DELETE FROM tokens_formulario
      WHERE contrato_id IN (
        SELECT id FROM contratos WHERE modalidade_pedido = 'centralizado'
      )
    `)
        .execute()
    } catch (err) {
      console.log('Aviso ao limpar tokens de contratos centralizados:', err)
    }

    // 3. Remover possíveis duplicatas antes de criar índice único (escola_id, contrato_id, ciclo_id)
    try {
      app
        .db()
        .newQuery(`
      DELETE FROM tokens_formulario
      WHERE id NOT IN (
        SELECT MIN(id) FROM tokens_formulario GROUP BY escola_id, contrato_id, ciclo_id
      )
    `)
        .execute()
    } catch (err) {
      console.log('Aviso ao deduplicar tokens_formulario:', err)
    }

    // 4. Adicionar índice único idx_tokens_form_escola_contrato_ciclo na collection tokens_formulario
    try {
      const tokensCol = app.findCollectionByNameOrId('tokens_formulario')
      // Substituir ou adicionar índice com escola_id, contrato_id, ciclo_id
      tokensCol.addIndex(
        'idx_tokens_form_escola_contrato_ciclo',
        true,
        'escola_id,contrato_id,ciclo_id',
        '',
      )
      app.save(tokensCol)
    } catch (err) {
      console.log('Aviso ao adicionar índice idx_tokens_form_escola_contrato_ciclo:', err)
    }
  },
  (app) => {
    try {
      const tokensCol = app.findCollectionByNameOrId('tokens_formulario')
      tokensCol.removeIndex('idx_tokens_form_escola_contrato_ciclo')
      app.save(tokensCol)
    } catch (_) {}
  },
)
