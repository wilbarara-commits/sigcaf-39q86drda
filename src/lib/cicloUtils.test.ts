import { describe, it, expect } from 'vitest'
import { parseNumeroEAnoCiclo, isCicloNumeroAnoDuplicado, sugerirProximoCiclo } from './cicloUtils'

describe('cicloUtils - numeração livre e validações de ciclo', () => {
  it('deve extrair corretamente número e ano a partir de diferentes formatos', () => {
    expect(parseNumeroEAnoCiclo('Ciclo 41/2026')).toEqual({ numero: 41, ano: 2026 })
    expect(parseNumeroEAnoCiclo('Ciclo 05/2026')).toEqual({ numero: 5, ano: 2026 })
    expect(parseNumeroEAnoCiclo('38/2026')).toEqual({ numero: 38, ano: 2026 })
    expect(parseNumeroEAnoCiclo('Ciclo 120/2026')).toEqual({ numero: 120, ano: 2026 })
    expect(parseNumeroEAnoCiclo('')).toBeNull()
  })

  it('deve detectar duplicidade de número + ano com exatidão', () => {
    const ciclosExistentes = [
      { id: 'c1', nome: 'Ciclo 38/2026' },
      { id: 'c2', nome: 'Ciclo 01/2026' },
      { id: 'c3', nome: 'Ciclo 38/2025' }, // mesmo número mas outro ano
    ]

    // 38 em 2026 é duplicado
    expect(isCicloNumeroAnoDuplicado('38', '2026', ciclosExistentes)).toBe(true)
    expect(isCicloNumeroAnoDuplicado(38, 2026, ciclosExistentes)).toBe(true)
    // 01 em 2026 com ou sem zero à esquerda
    expect(isCicloNumeroAnoDuplicado('1', '2026', ciclosExistentes)).toBe(true)
    expect(isCicloNumeroAnoDuplicado('01', '2026', ciclosExistentes)).toBe(true)

    // 38 em 2027 NÃO é duplicado
    expect(isCicloNumeroAnoDuplicado('38', '2027', ciclosExistentes)).toBe(false)
    // 41 em 2026 NÃO é duplicado
    expect(isCicloNumeroAnoDuplicado('41', '2026', ciclosExistentes)).toBe(false)

    // Ignorando o próprio ciclo (ex: edição/auto-referência)
    expect(isCicloNumeroAnoDuplicado('38', '2026', ciclosExistentes, 'c1')).toBe(false)
  })

  it('deve sugerir o próximo número sequencial mantendo coerência com o mais recente', () => {
    const ciclosExistentes = [
      { id: 'c1', nome: 'Ciclo 38/2026', data_inicio: '2026-09-16T00:00:00.000Z' },
    ]

    const sugestao = sugerirProximoCiclo(ciclosExistentes, new Date('2026-09-20'))
    expect(sugestao.numeroSemana).toBe(39)
    expect(sugestao.ano).toBe(2026)
    expect(sugestao.nomeCicloPadrao).toBe('Ciclo 39/2026')
  })
})
