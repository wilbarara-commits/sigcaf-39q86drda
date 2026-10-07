import { describe, it, expect, vi } from 'vitest'
import {
  AtestoDocumentData,
  createBatchAtestosPdf,
  createOfficialAtestoPdf,
  formatExtendDateBR,
  formatQuantityBR,
  parseProductNameAka,
} from './atestoPdfGenerator'

describe('atestoPdfGenerator', () => {
  describe('parseProductNameAka', () => {
    it('separa produto com vírgula em nome principal e AKA', () => {
      const res = parseProductNameAka('Batata Doce Roxa, Batata Doce')
      expect(res.nomePrincipal).toBe('Batata Doce Roxa')
      expect(res.aka).toBe('Batata Doce')
    })

    it('mantém apenas nome principal quando não há vírgula', () => {
      const res = parseProductNameAka('Banana Prata')
      expect(res.nomePrincipal).toBe('Banana Prata')
      expect(res.aka).toBeUndefined()
    })

    it('separa apenas na primeira vírgula caso haja mais de uma', () => {
      const res = parseProductNameAka('Alface Lisa, Alface, Hidropônica')
      expect(res.nomePrincipal).toBe('Alface Lisa')
      expect(res.aka).toBe('Alface, Hidropônica')
    })

    it('ignora AKA vazio quando só há vírgula no final', () => {
      const res = parseProductNameAka('Cenoura, ')
      expect(res.nomePrincipal).toBe('Cenoura')
      expect(res.aka).toBeUndefined()
    })

    it('trata string vazia adequadamente', () => {
      const res = parseProductNameAka('')
      expect(res.nomePrincipal).toBe('')
      expect(res.aka).toBeUndefined()
    })
  })

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

  it('suporta 2 vias com rótulos default (v1/v2 quando em branco)', async () => {
    const baseSample: AtestoDocumentData = {
      numeroAtesto: 'AT-010',
      numeroChamada: '01/2026',
      nomeEscola: 'Escola Municipal B',
      nomeCooperativa: 'Coop',
      siglaCooperativa: 'COOP',
      cidadeUf: 'RJ',
      dataEmissao: new Date(),
      items: [{ nome: 'Batata', quantidade: 30 }],
      cicloNome: 'Ciclo 40/2026',
      contratoNumero: 'C-2026-02-05',
      numeroParada: 3,
      totalVias: 2,
    }

    const docV1 = await createOfficialAtestoPdf({ ...baseSample, via: 'v1' })
    const docV2 = await createOfficialAtestoPdf({ ...baseSample, via: 'v2' })

    expect(docV1).toBeDefined()
    expect(docV2).toBeDefined()
    expect(docV1.getNumberOfPages()).toBe(1)
    expect(docV2.getNumberOfPages()).toBe(1)
  })

  it('suporta 2 vias com rótulos customizados no rodapé (ex.: Escola e Cooperativa)', async () => {
    const baseSample: AtestoDocumentData = {
      numeroAtesto: 'AT-020',
      numeroChamada: '01/2026',
      nomeEscola: 'Escola Estadual C',
      nomeCooperativa: 'Coop',
      siglaCooperativa: 'COOP',
      cidadeUf: 'RJ',
      dataEmissao: new Date(),
      items: [{ nome: 'Cenoura', quantidade: 20 }],
      cicloNome: 'Ciclo 40/2026',
      contratoNumero: 'C-2026-02-05',
      numeroParada: 4,
      totalVias: 2,
    }

    const docEscola = await createOfficialAtestoPdf({
      ...baseSample,
      viaRotulo: 'Escola',
      via: 'Escola',
    })
    const docCoop = await createOfficialAtestoPdf({
      ...baseSample,
      viaRotulo: 'Cooperativa',
      via: 'Cooperativa',
    })

    expect(docEscola).toBeDefined()
    expect(docCoop).toBeDefined()

    const batch = await createBatchAtestosPdf([
      { ...baseSample, viaRotulo: 'Escola', via: 'Escola' },
      { ...baseSample, viaRotulo: 'Cooperativa', via: 'Cooperativa' },
    ])
    expect(batch).toBeDefined()
    expect(batch.getNumberOfPages()).toBe(2)
  })

  it('suporta 1 via gerando página única com ou sem rótulo', async () => {
    const baseSample: AtestoDocumentData = {
      numeroAtesto: 'AT-030',
      numeroChamada: '01/2026',
      nomeEscola: 'Escola Municipal D',
      nomeCooperativa: 'Coop',
      siglaCooperativa: 'COOP',
      cidadeUf: 'RJ',
      dataEmissao: new Date(),
      items: [{ nome: 'Alface', quantidade: 10 }],
      cicloNome: 'Ciclo 40/2026',
      contratoNumero: 'C-2026-02-05',
      numeroParada: 5,
      totalVias: 1,
    }

    // Sem rótulo
    const docSemRotulo = await createOfficialAtestoPdf(baseSample)
    expect(docSemRotulo).toBeDefined()
    expect(docSemRotulo.getNumberOfPages()).toBe(1)

    // Com rótulo
    const docComRotulo = await createOfficialAtestoPdf({
      ...baseSample,
      viaRotulo: 'Escola',
      via: 'Escola',
    })
    expect(docComRotulo).toBeDefined()
    expect(docComRotulo.getNumberOfPages()).toBe(1)

    // Lote de 1 via
    const batch1Via = await createBatchAtestosPdf([
      { ...baseSample, viaRotulo: 'Escola', via: 'Escola' },
    ])
    expect(batch1Via).toBeDefined()
    expect(batch1Via.getNumberOfPages()).toBe(1)
  })

  it('gera PDF com produtos que possuem formato "NOME, AKA" sem erros', async () => {
    const docData: AtestoDocumentData = {
      numeroAtesto: 'AT-040',
      numeroChamada: '01/2026',
      nomeEscola: 'Escola Municipal E',
      nomeCooperativa: 'Cooperativa Agrícola Familiar',
      siglaCooperativa: 'COOP',
      cidadeUf: 'Teresópolis - RJ',
      dataEmissao: new Date('2026-05-10T10:00:00Z'),
      items: [
        { nome: 'Batata Doce Roxa, Batata Doce', quantidade: 50 },
        { nome: 'Banana Prata', quantidade: 20 },
        { nome: 'Tomate Débora, Tomate Redondo', quantidade: 15.5 },
      ],
      cicloNome: 'Ciclo 40/2026',
      contratoNumero: 'C-2026-02-05',
      numeroParada: 2,
      via: 'v1',
    }

    const doc = await createOfficialAtestoPdf(docData)
    expect(doc).toBeDefined()
    expect(doc.getNumberOfPages()).toBe(1)
  })
})
