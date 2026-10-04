import { describe, it, expect } from 'vitest'
import {
  formatQuantityOneDecimal,
  validateQuantityStepHalf,
  normalizeDecimalTyping,
  formatQuantityOnBlur,
} from './decimalUtils'

describe('decimalUtils e regras de quantidade (múltiplos de 0,5 e mínimo 0,5)', () => {
  it('formata valores decimais corretamente com uma casa decimal e vírgula', () => {
    expect(formatQuantityOneDecimal(0.5)).toBe('0,5')
    expect(formatQuantityOneDecimal(1)).toBe('1,0')
    expect(formatQuantityOneDecimal(10)).toBe('10,0')
    expect(formatQuantityOneDecimal(1.5)).toBe('1,5')
    expect(formatQuantityOneDecimal('2,5')).toBe('2,5')
  })

  it('valida múltiplos de 0,5 e rejeita valores abaixo ou inválidos', () => {
    const validHalf = validateQuantityStepHalf('0,5')
    expect(validHalf.isValid).toBe(true)
    expect(validHalf.numericValue).toBe(0.5)

    const validTen = validateQuantityStepHalf('10,0')
    expect(validTen.isValid).toBe(true)
    expect(validTen.numericValue).toBe(10)

    const invalidThird = validateQuantityStepHalf('1,3')
    expect(invalidThird.isValid).toBe(false)

    const zero = validateQuantityStepHalf('0,0')
    expect(zero.isValid).toBe(true)
    expect(zero.numericValue).toBe(0)
  })

  it('normaliza a digitação de decimais', () => {
    expect(normalizeDecimalTyping('1.5')).toBe('1,5')
    expect(normalizeDecimalTyping('10,5')).toBe('10,5')
    expect(normalizeDecimalTyping('abc')).toBe('')
  })

  it('formata valor no blur', () => {
    expect(formatQuantityOnBlur('1')).toBe('1,0')
    expect(formatQuantityOnBlur('1,')).toBe('1,0')
    expect(formatQuantityOnBlur(',5')).toBe('0,5')
  })
})
