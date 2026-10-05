import { describe, it, expect, vi } from 'vitest'
import {
  AtestoDocumentData,
  createBatchAtestosPdf,
  createOfficialAtestoPdf,
  formatExtendDateBR,
  formatQuantityBR,
} from './atestoPdfGenerator'

describe('atestoPdfGenerator', () => {
  it('formata quantidades no padrão brasileiro', () => {
    expect(formatQuantityBR(10)).toBe('10')
    expect(formatQuantityBR(10.5)).toBe('10,5')
    expect(formatQuantityBR(10.25)).toBe('10,25')
  })

  it('formata data estendida com cidade', () => {
    const formatted = formatExtendDateBR('Teresópolis - RJ', new Date(2026, 3, 15))
    expect(formatted).toContain('Teresópolis - RJ')
    expect(formatted).toContain('15 de abril de 2026')
  })

  it('cria PDF oficial com metadados de ciclo, contrato, parada e via v1', async () => {
    const sampleData: AtestoDocumentData = {
      numeroAtesto: 'AT-001',
      numeroChamada: '01/2026',
      nomeEscola: 'C.E. Exemplo',
      nomeCooperativa: 'Cooperativa Exemplo',
      siglaCooperativa: 'COOP',
      cidadeUf: 'Teresópolis - RJ',
      dataEmissao: new Date('2026-04-15T10:00:00Z'),
      items: [
        { nome: 'Banana Prata', quantidade: 25 },
        { nome: 'Alface Crespa', quantidade: 10 },
      ],
      cicloNome: 'Ciclo 40/2026',
      contratoNumero: 'C-2026-02-05',
      numeroParada: 3,
      via: 'v1',
    }

    const doc = await createOfficialAtestoPdf(sampleData)
    expect(doc).toBeDefined()
    expect(doc.internal.pages.length).toBeGreaterThan(0)
  })

  it('cria lote de atestos por rota com 2 páginas por escola (v1 e v2)', async () => {
    const escolaA_v1: AtestoDocumentData = {
      numeroAtesto: 'AT-001',
      numeroChamada: '01/2026',
      nomeEscola: 'Escola A',
      nomeCooperativa: 'Coop',
      siglaCooperativa: 'COOP',
      cidadeUf: 'RJ',
      dataEmissao: new Date(),
      items: [{ nome: 'Tomate', quantidade: 15 }],
      cicloNome: '40/2026',
      contratoNumero: 'C-2026-02-05',
      numeroParada: 1,
      via: 'v1',
    }

    const escolaA_v2: AtestoDocumentData = {
      ...escolaA_v1,
      via: 'v2',
    }

    const batchDoc = await createBatchAtestosPdf([escolaA_v1, escolaA_v2])
    expect(batchDoc).toBeDefined()
    // 2 páginas no documento
    expect(batchDoc.getNumberOfPages()).toBe(2)
  })
})
