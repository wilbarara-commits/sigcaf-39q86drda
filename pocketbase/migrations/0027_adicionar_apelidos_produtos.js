migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('produtos')
    if (!collection.fields.getByName('apelidos')) {
      collection.fields.add(
        new TextField({
          name: 'apelidos',
          required: false,
        }),
      )
      app.save(collection)
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('produtos')
      const field = collection.fields.getByName('apelidos')
      if (field) {
        collection.fields.removeByName('apelidos')
        app.save(collection)
      }
    } catch (_) {}
  },
)
