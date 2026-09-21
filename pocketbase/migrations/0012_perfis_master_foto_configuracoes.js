migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')

    // 1. Campo 'foto' (FileField) caso não exista ou se avatar já existir, garantir foto como FileField
    if (!usersCol.fields.getByName('foto')) {
      usersCol.fields.add(
        new FileField({
          name: 'foto',
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        }),
      )
    }

    // 2. Campo 'celular' (TextField)
    if (!usersCol.fields.getByName('celular')) {
      usersCol.fields.add(
        new TextField({
          name: 'celular',
          required: false,
        }),
      )
    }

    // 3. Campo 'ativo' (BoolField) para status de desativação (não required para bools)
    if (!usersCol.fields.getByName('ativo')) {
      usersCol.fields.add(
        new BoolField({
          name: 'ativo',
          required: false,
        }),
      )
    }

    // 4. Atualizar campo 'perfil' (select: MASTER, ADMINISTRADOR, SECRETARIA)
    // No PB, para atualizar values de select existente no collection fields:
    const perfilField = usersCol.fields.getByName('perfil')
    if (perfilField) {
      perfilField.values = ['MASTER', 'ADMINISTRADOR', 'SECRETARIA']
      perfilField.required = true
    } else {
      usersCol.fields.add(
        new SelectField({
          name: 'perfil',
          required: true,
          values: ['MASTER', 'ADMINISTRADOR', 'SECRETARIA'],
          maxSelect: 1,
        }),
      )
    }

    // Atualizar regras de acesso para permitir gerenciamento de usuários
    usersCol.listRule = '@request.auth.id != ""'
    usersCol.viewRule = '@request.auth.id != ""'
    // Usuário pode editar a si próprio ou quem tem perfil MASTER
    usersCol.createRule = '@request.auth.id != "" && @request.auth.perfil = "MASTER"'
    usersCol.updateRule =
      '@request.auth.id != "" && (id = @request.auth.id || @request.auth.perfil = "MASTER")'
    usersCol.deleteRule = '@request.auth.id != "" && @request.auth.perfil = "MASTER"'

    app.save(usersCol)

    // 5. Coleção 'configuracoes' (singleton para configurações da cooperativa e login)
    let configuracoesCol
    try {
      configuracoesCol = app.findCollectionByNameOrId('configuracoes')
    } catch (_) {
      const novaCol = new Collection({
        name: 'configuracoes',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: '@request.auth.id != "" && @request.auth.perfil = "MASTER"',
        updateRule: '@request.auth.id != "" && @request.auth.perfil = "MASTER"',
        deleteRule: '@request.auth.id != "" && @request.auth.perfil = "MASTER"',
        fields: [
          { name: 'nome_cooperativa', type: 'text', required: true },
          { name: 'sigla', type: 'text' },
          { name: 'cnpj', type: 'text' },
          { name: 'telefone', type: 'text' },
          { name: 'email', type: 'email' },
          { name: 'cidade_uf', type: 'text' },
          { name: 'exibir_atalhos_demo', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
      })
      app.save(novaCol)
      configuracoesCol = app.findCollectionByNameOrId('configuracoes')
    }

    // Registro inicial de configurações se não existir
    const existingConfigs = app.findRecordsByFilter('configuracoes', '', '-created', 1, 0)
    if (existingConfigs.length === 0 && configuracoesCol) {
      const configRec = new Record(configuracoesCol)
      configRec.set('nome_cooperativa', 'CooperGestão — Cooperativa Agrícola Familiar')
      configRec.set('sigla', 'COOPGESTÃO')
      configRec.set('cidade_uf', 'Região Serrana - RJ')
      configRec.set('exibir_atalhos_demo', true)
      app.save(configRec)
    }

    // 6. Promover admin@coop.local a MASTER e atualizar secretaria@coop.local para SECRETARIA
    try {
      const adminUser = app.findAuthRecordByEmail('_pb_users_auth_', 'admin@coop.local')
      adminUser.set('perfil', 'MASTER')
      adminUser.set('ativo', true)
      if (!adminUser.get('nome')) adminUser.set('nome', 'Administrador Master')
      app.save(adminUser)
    } catch (_) {}

    try {
      const secUser = app.findAuthRecordByEmail('_pb_users_auth_', 'secretaria@coop.local')
      secUser.set('perfil', 'SECRETARIA')
      secUser.set('ativo', true)
      if (!secUser.get('nome')) secUser.set('nome', 'Secretária Operacional')
      app.save(secUser)
    } catch (_) {}

    // Migrar qualquer outro usuário que tenha valor em minúsculo
    const allUsers = app.findRecordsByFilter('_pb_users_auth_', '', 'created', 100, 0)
    for (const u of allUsers) {
      let changed = false
      const p = u.getString('perfil')
      if (p === 'administrador') {
        u.set('perfil', 'ADMINISTRADOR')
        changed = true
      } else if (p === 'secretaria') {
        u.set('perfil', 'SECRETARIA')
        changed = true
      }
      if (u.get('ativo') === undefined || u.get('ativo') === null) {
        u.set('ativo', true)
        changed = true
      }
      if (changed) {
        app.save(u)
      }
    }
  },
  (app) => {
    // Reverter
    try {
      const configuracoesCol = app.findCollectionByNameOrId('configuracoes')
      app.delete(configuracoesCol)
    } catch (_) {}

    try {
      const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
      if (usersCol.fields.getByName('celular')) {
        usersCol.fields.removeByName('celular')
      }
      if (usersCol.fields.getByName('foto')) {
        usersCol.fields.removeByName('foto')
      }
      if (usersCol.fields.getByName('ativo')) {
        usersCol.fields.removeByName('ativo')
      }
      const perfilField = usersCol.fields.getByName('perfil')
      if (perfilField) {
        perfilField.values = ['administrador', 'secretaria']
      }
      app.save(usersCol)
    } catch (_) {}
  },
)
