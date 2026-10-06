import { describe, it, expect } from 'vitest'
import { formatarCPF, limparCPF, validarDigitosCPF } from './cpfUtils'

describe('cpfUtils', () => {
  it('limpa caracteres não numéricos', () => {
    expect(limparCPF('123.456.789-01')).toBe('12345678901')
    expect(limparCPF('abc-12')).toBe('12')
    expect(limparCPF('')).toBe('')
  })

  it('aplica máscara progressiva de CPF', () => {
    expect(formatarCPF('1')).toBe('1')
    expect(formatarCPF('123')).toBe('123')
    expect(formatarCPF('1234')).toBe('123.4')
    expect(formatarCPF('123456')).toBe('123.456')
    expect(formatarCPF('1234567')).toBe('123.456.7')
    expect(formatarCPF('123456789')).toBe('123.456.789')
    expect(formatarCPF('12345678901')).toBe('123.456.789-01')
    // Não passa de 11 dígitos
    expect(formatarCPF('12345678901999')).toBe('123.456.789-01')
  })

  it('valida CPF correto e rejeita incorreto ou sequências repetidas', () => {
    // CPFs com dígitos repetidos inválidos
    expect(validarDigitosCPF('00000000000')).toBe(false)
    expect(validarDigitosCPF('111.111.111-11')).toBe(false)
    expect(validarDigitosCPF('12345678900')).toBe(false)

    // CPF válido conhecido gerado segundo algoritmo (exemplo: 52998224725)
    // 5*10+2*9+9*8+9*7+8*6+2*5+2*4+4*3+7*2 = 50+18+72+63+48+10+8+12+14 = 295 -> (295*10)%11 = 2950%11 = 2 -> OK
    expect(validarDigitosCPF('52998224725')).toBe(true)
    expect(validarDigitosCPF('529.982.247-25')).toBe(true)

    // CPF incompleto
    expect(validarDigitosCPF('123')).toBe(false)
  })
})
