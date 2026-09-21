migrate(
  (app) => {
    // 1. Obter a coleção users de autenticação
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')

    // Garantir campo 'nome' (caso name já exista, podemos manter 'nome' ou 'name'. Vamos adicionar 'nome' ou garantir ambos)
    if (!usersCol.fields.getByName('nome')) {
      usersCol.fields.add(
        new TextField({
          name: 'nome',
          required: false,
        }),
      )
    }

    // Adicionar campo 'perfil' (select: 'administrador' e 'secretaria')
    if (!usersCol.fields.getByName('perfil')) {
      usersCol.fields.add(
        new SelectField({
          name: 'perfil',
          required: true,
          values: ['administrador', 'secretaria'],
          maxSelect: 1,
        }),
      )
    }

    // Regras de acesso para users
    usersCol.listRule = '@request.auth.id != ""'
    usersCol.viewRule = '@request.auth.id != ""'
    usersCol.updateRule = '@request.auth.id != "" && id = @request.auth.id'

    app.save(usersCol)

    // 2. Seed idempotente dos usuários solicitados:
    // Administrador: admin@coop.local / admin123
    let adminUser
    try {
      adminUser = app.findAuthRecordByEmail('_pb_users_auth_', 'admin@coop.local')
    } catch (_) {
      adminUser = new Record(usersCol)
      adminUser.setEmail('admin@coop.local')
      adminUser.setPassword('admin123')
      adminUser.setVerified(true)
      adminUser.set('name', 'Administrador')
      adminUser.set('nome', 'Administrador')
      adminUser.set('perfil', 'administrador')
      app.save(adminUser)
    }

    // Se já existia, garantir campos nome e perfil
    if (adminUser) {
      let needsSave = false
      if (!adminUser.get('perfil')) {
        adminUser.set('perfil', 'administrador')
        needsSave = true
      }
      if (!adminUser.get('nome')) {
        adminUser.set('nome', 'Administrador')
        needsSave = true
      }
      if (needsSave) {
        app.save(adminUser)
      }
    }

    // Secretária: secretaria@coop.local / secretaria123
    let secUser
    try {
      secUser = app.findAuthRecordByEmail('_pb_users_auth_', 'secretaria@coop.local')
    } catch (_) {
      secUser = new Record(usersCol)
      secUser.setEmail('secretaria@coop.local')
      secUser.setPassword('secretaria123')
      secUser.setVerified(true)
      secUser.set('name', 'Secretária')
      secUser.set('nome', 'Secretária')
      secUser.set('perfil', 'secretaria')
      app.save(secUser)
    }

    if (secUser) {
      let needsSaveSec = false
      if (!secUser.get('perfil')) {
        secUser.set('perfil', 'secretaria')
        needsSaveSec = true
      }
      if (!secUser.get('nome')) {
        secUser.set('nome', 'Secretária')
        needsSaveSec = true
      }
      if (needsSaveSec) {
        app.save(secUser)
      }
    }
  },
  (app) => {
    // Reverter seed
    try {
      const admin = app.findAuthRecordByEmail('_pb_users_auth_', 'admin@coop.local')
      app.delete(admin)
    } catch (_) {}

    try {
      const sec = app.findAuthRecordByEmail('_pb_users_auth_', 'secretaria@coop.local')
      app.delete(sec)
    } catch (_) {}

    try {
      const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
      usersCol.fields.removeByName('perfil')
      usersCol.fields.removeByName('nome')
      app.save(usersCol)
    } catch (_) {}
  },
)
