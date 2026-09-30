/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 0102_auditoria_pos_exclusao_contrato.js
    const configRecords = app.findRecordsByFilter('configuracoes', '', '', 1, 0)
    if (!configRecords || configRecords.length === 0) return
    const config = configRecords[0]

    const totalContratos = app.countRecords('contratos')
    const totalContratoItens = app.countRecords('contrato_itens')
    const totalContratoEscolas = app.countRecords('contrato_escolas')
    const totalRotas = app.countRecords('rotas')
    const totalParadasRota = app.countRecords('paradas_rota')
    const totalEscolas = app.countRecords('escolas')
    const totalChamadas = app.countRecords('chamadas')
    const totalChamadaItens = app.countRecords('chamada_itens')
    const totalProdutos = app.countRecords('produtos')

    const rotas = app.findRecordsByFilter('rotas', '', 'ordem', 10, 0)
    const rotasStatus = rotas.map((r) => ({
      id: r.id,
      nome: r.getString('nome'),
      contrato_id: r.getString('contrato_id'),
      chamada_id: r.getString('chamada_id'),
    }))

    const audit = {
      totalContratos,
      totalContratoItens,
      totalContratoEscolas,
      totalRotas,
      totalParadasRota,
      totalEscolas,
      totalChamadas,
      totalChamadaItens,
      totalProdutos,
      rotas: rotasStatus,
    }

    config.set('subtitulo_sistema', 'AUDIT_0102:' + JSON.stringify(audit))
    app.save(config)
  },
  (app) => {},
)
