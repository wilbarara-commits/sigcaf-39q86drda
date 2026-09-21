// Migration 0060: Renomear o ciclo ativo para apenas "Ciclo 37/2026",
// removendo o sufixo " – Teste Operacional" ou "- Teste Operacional".
// Preserva intactos: datas (data_inicio, data_fim), status e demais campos.
// Também verifica o snapshot JSON e remove qualquer sufixo de teste caso exista.

migrate(
  (app) => {
    // 1. Buscar registros na collection ciclos
    const ciclos = app.findRecordsByFilter('ciclos', '', '-created', 100, 0)

    for (const ciclo of ciclos) {
      const nomeAtual = ciclo.getString('nome')

      // Identificar o ciclo 37/2026 (ou qualquer ciclo que contenha "37/2026")
      if (
        nomeAtual.indexOf('37/2026') !== -1 ||
        ciclo.getString('data_inicio').indexOf('2026-09-16') !== -1
      ) {
        // Renomear campo 'nome' para exatamente "Ciclo 37/2026"
        ciclo.set('nome', 'Ciclo 37/2026')

        // Verificar se snapshot tem algum campo textual com o sufixo e sanitizar
        try {
          const snapshot = ciclo.get('snapshot')
          if (snapshot && typeof snapshot === 'object') {
            let modificado = false
            for (const key of Object.keys(snapshot)) {
              if (typeof snapshot[key] === 'string') {
                const val = snapshot[key]
                if (
                  val.indexOf('Teste Operacional') !== -1 ||
                  val.indexOf('– Teste Operacional') !== -1 ||
                  val.indexOf('- Teste Operacional') !== -1
                ) {
                  snapshot[key] = val.replace(/\s*[–-]\s*Teste Operacional/gi, '').trim()
                  modificado = true
                }
              }
            }
            if (modificado) {
              ciclo.set('snapshot', snapshot)
            }
          }
        } catch (_) {}

        app.save(ciclo)
      }
    }
  },
  (app) => {
    // Reverter renomeação para "Ciclo 37/2026 – Teste Operacional" caso necessário
    const ciclos = app.findRecordsByFilter('ciclos', 'nome = "Ciclo 37/2026"', '', 10, 0)
    for (const ciclo of ciclos) {
      ciclo.set('nome', 'Ciclo 37/2026 – Teste Operacional')
      app.save(ciclo)
    }
  },
)
