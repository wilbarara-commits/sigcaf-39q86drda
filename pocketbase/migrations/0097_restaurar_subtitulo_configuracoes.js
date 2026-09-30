migrate(
  (app) => {
    // 0097_restaurar_subtitulo_configuracoes.js
    const configRecords = app.findRecordsByFilter('configuracoes', '', '', 1, 0)
    if (!configRecords || configRecords.length === 0) return
    const config = configRecords[0]

    // Restaurar subtítulo limpo
    config.set('subtitulo_sistema', 'Sistema de Gestão da Cooperativa Agrícola Familiar')
    app.save(config)
  },
  (app) => {},
)
