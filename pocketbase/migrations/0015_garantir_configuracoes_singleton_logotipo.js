migrate(
  (app) => {
    const configCol = app.findCollectionByNameOrId('configuracoes')

    // Garantir que list e view sejam públicos ou liberados para qualquer autenticado
    // Para que telas de login, atestos e usuários de qualquer perfil possam ler o logotipo e nome da cooperativa
    configCol.listRule = ''
    configCol.viewRule = ''

    // Garantir que create e update sejam permitidos para usuários autenticados com perfil MASTER
    configCol.createRule = '@request.auth.id != "" && @request.auth.perfil = "MASTER"'
    configCol.updateRule = '@request.auth.id != "" && @request.auth.perfil = "MASTER"'
    configCol.deleteRule = '@request.auth.id != "" && @request.auth.perfil = "MASTER"'

    // Garantir que o campo 'logotipo' existe com os tipos e propriedades corretos (não protected para leitura pública do arquivo se necessário)
    let logoField = configCol.fields.getByName('logotipo')
    if (!logoField) {
      configCol.fields.add(
        new FileField({
          name: 'logotipo',
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
          protected: false,
        }),
      )
    }

    app.save(configCol)

    // Garantir que haja exatamente um registro inicial singleton se não existir
    const existing = app.findRecordsByFilter('configuracoes', '', '-created', 1, 0)
    if (existing.length === 0) {
      const rec = new Record(configCol)
      rec.set('nome_cooperativa', 'COOPVIEIRA — Cooperativa Agrícola Familiar')
      rec.set('sigla', 'COOPVIEIRA')
      rec.set('cidade_uf', 'Teresópolis - RJ')
      rec.set('exibir_atalhos_demo', true)
      app.save(rec)
    }
  },
  (app) => {
    // No-op rollback para não quebrar a coleção
  },
)
