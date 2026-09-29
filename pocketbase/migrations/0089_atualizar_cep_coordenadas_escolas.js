/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Lista de escolas para atualização pontual de CEP, latitude e longitude
    // Conforme especificado: não alterar nenhum outro campo e ignorar as escolas com dados pendentes
    const dadosEscolas = [
      {
        id: 'xn3usa8e0wbpso0', // CE ALCINDO GUANABARA
        cep: '25946-235',
        latitude: '-22.5204',
        longitude: '-42.9813',
      },
      {
        id: 'f5cpolduz18x0zv', // CIA JOSE FRANCISCO LIPPI
        cep: '25976-444',
        latitude: '-22.3442',
        longitude: '-42.8575',
      },
      {
        id: 'oy6g7rov9llvhe1', // CE FANY NISKIER
        cep: '25976-810',
        latitude: '-22.3974',
        longitude: '-42.8977',
      },
      {
        id: 'h7kmu7okiytpg65', // CE PRESIDENTE BERNARDES
        cep: '25955-100',
        latitude: '-22.4242',
        longitude: '-42.9668',
      },
      {
        id: 'y6lnpr45lwgxmk2', // CE LIONS CLUB
        cep: '25954-325',
        latitude: '-22.4333',
        longitude: '-42.9452',
      },
      {
        id: 'o2y5vn1qlw5a0ls', // CE EDMUNDO BITTENCOURT
        cep: '25953-001',
        latitude: '-22.4055',
        longitude: '-42.9642',
      },
      {
        id: '8hic1xo22mzxti6', // CE CORTUME CARIOCA
        cep: '25940-000',
        latitude: '-22.5132',
        longitude: '-42.9682',
      },
      {
        id: '23y1shu2odci7kf', // CE CAMPOS SALLES
        cep: '25966-000',
        latitude: '-22.4004',
        longitude: '-42.9742',
      },
      {
        id: '8k8n58jqaj9el2x', // CE HIGINO DA SILVEIRA
        cep: '25953-230',
        latitude: '-22.4113',
        longitude: '-42.9655',
      },
    ]

    for (const item of dadosEscolas) {
      try {
        const record = app.findRecordById('escolas', item.id)
        record.set('cep', item.cep)
        record.set('latitude', item.latitude)
        record.set('longitude', item.longitude)
        app.save(record)
      } catch (err) {
        console.log(`Aviso ao atualizar escola ${item.id}:`, err)
      }
    }
  },
  (app) => {
    const ids = [
      'xn3usa8e0wbpso0',
      'f5cpolduz18x0zv',
      'oy6g7rov9llvhe1',
      'h7kmu7okiytpg65',
      'y6lnpr45lwgxmk2',
      'o2y5vn1qlw5a0ls',
      '8hic1xo22mzxti6',
      '23y1shu2odci7kf',
      '8k8n58jqaj9el2x',
    ]

    for (const id of ids) {
      try {
        const record = app.findRecordById('escolas', id)
        record.set('cep', '')
        record.set('latitude', '')
        record.set('longitude', '')
        app.save(record)
      } catch (_) {}
    }
  },
)
