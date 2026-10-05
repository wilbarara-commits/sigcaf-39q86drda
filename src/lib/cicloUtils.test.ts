import { describe, it, expect } from 'vitest'
import {
  parseNumeroEAnoCiclo,
  isCicloNumeroAnoDuplicado,
  sugerirProximoCiclo,
  calcularDatasCicloPorSemana,
  validarAjusteManualDatasCiclo,
  getCicloAtivo,
  getCiclosAtivosPorChamada,
  formatDespachoAmigavel,
  calcularDiasAtrasoFechamento,
  isCicloNaoTerminal,
} from './cicloUtils'

describe('cicloUtils - numeração livre e validações de ciclo', () => {
  it('deve extrair corretamente número e ano a partir de diferentes formatos', () => {
    expect(parseNumeroEAnoCiclo('Ciclo 41/2026')).toEqual({ numero: 41, ano: 2026 })
    expect(parseNumeroEAnoCiclo('Ciclo 05/2026')).toEqual({ numero: 5, ano: 2026 })
    expect(parseNumeroEAnoCiclo('38/2026')).toEqual({ numero: 38, ano: 2026 })
    expect(parseNumeroEAnoCiclo('Ciclo 120/2026')).toEqual({ numero: 120, ano: 2026 })
    expect(parseNumeroEAnoCiclo('')).toBeNull()
  })

  it('deve detectar duplicidade de número + ano com escopo por chamada', () => {
    const ciclosExistentes = [
      { id: 'c1', nome: 'Ciclo 38/2026', chamada_id: 'ch1' },
      { id: 'c2', nome: 'Ciclo 01/2026', chamada_id: 'ch1' },
      { id: 'c3', nome: 'Ciclo 38/2025', chamada_id: 'ch1' }, // mesmo número mas outro ano
      { id: 'c4', nome: 'Ciclo 38/2026', chamada_id: 'ch2' }, // mesma semana, mas chamada diferente!
    ]

    // 38 em 2026 para ch1 é duplicado
    expect(isCicloNumeroAnoDuplicado('38', '2026', ciclosExistentes, undefined, 'ch1')).toBe(true)
    expect(isCicloNumeroAnoDuplicado(38, 2026, ciclosExistentes, undefined, 'ch1')).toBe(true)

    // 38 em 2026 para ch3 (chamada nova/diferente) NÃO é duplicado!
    expect(isCicloNumeroAnoDuplicado('38', '2026', ciclosExistentes, undefined, 'ch3')).toBe(false)

    // 01 em 2026 com ou sem zero à esquerda
    expect(isCicloNumeroAnoDuplicado('1', '2026', ciclosExistentes, undefined, 'ch1')).toBe(true)
    expect(isCicloNumeroAnoDuplicado('01', '2026', ciclosExistentes, undefined, 'ch1')).toBe(true)

    // 38 em 2027 NÃO é duplicado
    expect(isCicloNumeroAnoDuplicado('38', '2027', ciclosExistentes, undefined, 'ch1')).toBe(false)
    // 41 em 2026 NÃO é duplicado
    expect(isCicloNumeroAnoDuplicado('41', '2026', ciclosExistentes, undefined, 'ch1')).toBe(false)

    // Ignorando o próprio ciclo (ex: edição/auto-referência)
    expect(isCicloNumeroAnoDuplicado('38', '2026', ciclosExistentes, 'c1', 'ch1')).toBe(false)
  })

  it('deve calcular corretamente as datas do ciclo a partir da semana ISO e regra de dias da chamada', () => {
    // Semana 41 de 2026 (outubro de 2026).
    // Semana ISO 41 de 2026: segunda-feira é 05/10/2026.
    // Primeiro dia da chamada: quarta (07/10/2026).
    // Último dia: terça seguinte (13/10/2026) -> +6 dias.
    // Despacho: segunda (12/10/2026) -> +5 dias.
    const res = calcularDatasCicloPorSemana(41, 2026, {
      diaInicio: 'quarta',
      diaDespacho: 'segunda',
      diaFim: 'terca',
    })

    expect(res.codigoCiclo).toBe('41/2026')
    expect(res.nomeCicloPadrao).toBe('Ciclo 41/2026')
    expect(res.dataInicioIso.startsWith('2026-10-07')).toBe(true)
    expect(res.dataDespachoIso.startsWith('2026-10-12')).toBe(true)
    expect(res.dataFimIso.startsWith('2026-10-13')).toBe(true)
  })

  it('deve calcular corretamente chamada 07/2025 com despacho e entrega na terça-feira', () => {
    const res = calcularDatasCicloPorSemana(40, 2026, {
      diaInicio: 'quarta',
      diaDespacho: 'terca',
      diaFim: 'terca',
    })

    expect(res.codigoCiclo).toBe('40/2026')
    expect(res.nomeCicloPadrao).toBe('Ciclo 40/2026')
    // Início: quarta 30/09/2026
    expect(res.dataInicioIso.startsWith('2026-09-30')).toBe(true)
    // Despacho: terça 06/10/2026 (6 dias após quarta)
    expect(res.dataDespachoIso.startsWith('2026-10-06')).toBe(true)
    // Fim: terça 06/10/2026
    expect(res.dataFimIso.startsWith('2026-10-06')).toBe(true)

    // Formatação amigável respeita a terça-feira
    expect(formatDespachoAmigavel(res.dataDespachoIso, true)).toBe('Terça-feira, 06/10/2026')
    expect(formatDespachoAmigavel(res.dataDespachoIso, false)).toBe('Ter, 06/10')
  })

  it('deve validar o ajuste manual das datas respeitando a ordem e limites da semana', () => {
    // Válido: início 07/10 <= despacho 12/10 <= fim 13/10
    const v1 = validarAjusteManualDatasCiclo('2026-10-07', '2026-10-12', '2026-10-13')
    expect(v1.valido).toBe(true)

    // Válido: despacho pode ser no mesmo dia da entrega/fim
    const v2 = validarAjusteManualDatasCiclo('2026-10-07', '2026-10-13', '2026-10-13')
    expect(v2.valido).toBe(true)

    // Inválido: início após despacho
    const inv1 = validarAjusteManualDatasCiclo('2026-10-14', '2026-10-12', '2026-10-15')
    expect(inv1.valido).toBe(false)
    expect(inv1.erro).toContain('início')

    // Inválido: despacho após o fim
    const inv2 = validarAjusteManualDatasCiclo('2026-10-07', '2026-10-14', '2026-10-13')
    expect(inv2.valido).toBe(false)
    expect(inv2.erro).toContain('despacho')
  })

  it('deve identificar ciclo ativo por chamada de forma independente', () => {
    const ciclos = [
      {
        id: 'c1',
        nome: 'Ciclo 40/2026',
        status: 'coletando',
        chamada_id: 'ch-mun',
        created: '2026-10-01',
      },
      {
        id: 'c2',
        nome: 'Ciclo 41/2026',
        status: 'coletando',
        chamada_id: 'ch-est',
        created: '2026-10-02',
      },
      {
        id: 'c3',
        nome: 'Ciclo 39/2026',
        status: 'fechado',
        chamada_id: 'ch-mun',
        created: '2026-09-20',
      },
    ]

    const ativoMun = getCicloAtivo(ciclos, 'ch-mun')
    expect(ativoMun?.id).toBe('c1')

    const ativoEst = getCicloAtivo(ciclos, 'ch-est')
    expect(ativoEst?.id).toBe('c2')

    const ativosPorChamada = getCiclosAtivosPorChamada(ciclos)
    expect(ativosPorChamada['ch-mun']?.id).toBe('c1')
    expect(ativosPorChamada['ch-est']?.id).toBe('c2')
  })

  it('deve sugerir o próximo número sequencial mantendo coerência com o mais recente da chamada', () => {
    const ciclosExistentes = [
      {
        id: 'c1',
        nome: 'Ciclo 38/2026',
        data_inicio: '2026-09-16T00:00:00.000Z',
        chamada_id: 'ch1',
      },
    ]

    const sugestao = sugerirProximoCiclo(ciclosExistentes, new Date('2026-09-20'), 'ch1')
    expect(sugestao.numeroSemana).toBe(39)
    expect(sugestao.ano).toBe(2026)
    expect(sugestao.nomeCicloPadrao).toBe('Ciclo 39/2026')
  })

  it('calcularDiasAtrasoFechamento só retorna atraso > 0 para datas de fim estritamente no passado', () => {
    // Data futura em relação a agora
    const dataFutura = new Date()
    dataFutura.setDate(dataFutura.getDate() + 10)
    const atrasoFuturo = calcularDiasAtrasoFechamento(dataFutura.toISOString())
    expect(atrasoFuturo).toBe(0)

    // Data passada em relação a agora (ex: 5 dias atrás)
    const dataPassada = new Date()
    dataPassada.setDate(dataPassada.getDate() - 5)
    const atrasoPassado = calcularDiasAtrasoFechamento(dataPassada.toISOString())
    expect(atrasoPassado).toBeGreaterThanOrEqual(5)

    // Ciclo 40/2026 com fim em outubro de 2026 não deve estar atrasado no ano corrente
    const fimCiclo40 = '2026-10-06 23:59:59.000Z'
    // Se a data de hoje for anterior a 06/10/2026, atraso deve ser 0
    if (new Date() < new Date(fimCiclo40)) {
      expect(calcularDiasAtrasoFechamento(fimCiclo40)).toBe(0)
    }
  })

  it('isCicloNaoTerminal reconhece coletando, correcao e coleta_encerrada como não-terminais e fechado/cancelado como terminais', () => {
    expect(isCicloNaoTerminal('coletando')).toBe(true)
    expect(isCicloNaoTerminal('correcao')).toBe(true)
    expect(isCicloNaoTerminal('coleta_encerrada')).toBe(true)
    expect(isCicloNaoTerminal('coletado')).toBe(true)

    expect(isCicloNaoTerminal('fechado')).toBe(false)
    expect(isCicloNaoTerminal('cancelado')).toBe(false)
  })

  it('ciclo não-terminal com data de término futura não deve ser marcado como fechamento pendente', () => {
    const dataFimFutura = '2026-10-06 23:59:59.000Z'
    const diasAtraso = calcularDiasAtrasoFechamento(dataFimFutura)
    const fase = 'coleta_encerrada'
    const isNaoTerminal = isCicloNaoTerminal(fase)

    // Regra corrigida: fechamento pendente exige fase não terminal E diasAtraso > 0
    const isFechamentoPendente = isNaoTerminal && diasAtraso > 0
    if (new Date() < new Date(dataFimFutura)) {
      expect(isFechamentoPendente).toBe(false)
    }
  })
})
