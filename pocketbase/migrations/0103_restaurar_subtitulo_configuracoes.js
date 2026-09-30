/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Restaurar subtítulo limpo do sistema após a verificação
    const configRecords = app.findRecordsByFilter('configuracoes', '', '', 1, 0)
    if (!configRecords || configRecords.length === 0) return
    const config = configRecords[0]

    config.set('subtitulo_sistema', 'Sistema de Gestão da Cooperativa Agrícola Familiar')
    app.save(config)
  },
  (app) => {},
)
