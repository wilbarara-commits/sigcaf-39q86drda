/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('escolas')
    if (!collection) return

    const existingField = collection.fields.getByName('dependencia_administrativa')
    if (existingField) return

    collection.fields.add(
      new SelectField({
        name: 'dependencia_administrativa',
        required: false,
        maxSelect: 1,
        values: ['Federal', 'Estadual', 'Municipal', 'Privada'],
      }),
    )

    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('escolas')
    if (!collection) return

    const field = collection.fields.getByName('dependencia_administrativa')
    if (field) {
      collection.fields.removeByName('dependencia_administrativa')
      app.save(collection)
    }
  },
)
