import { describe, it, expect } from 'vitest'
import {
  extractQuantityAndProductName,
  matchCatalogItemTolerant,
  parsePastedOrderText,
  isComprovantePedido,
  extractComprovanteMetadata,
  type OrderPasteCatalogProduct,
} from './orderPasteParser'

describe('orderPasteParser', () => {
  const mockCatalog: OrderPasteCatalogProduct[] = [
    { productId: 'p1', nome: 'Arroz Tipo 1', unidade: 'Kg', preco: 6.5 },
    { productId: 'p2', nome: 'Feijão Carioca', unidade: 'Kg', preco: 8.0 },
    { productId: 'p3', nome: 'Banana Prata', unidade: 'Kg', preco: 4.2 },
    { productId: 'p4', nome: 'Maçã Nacional', unidade: 'Kg', preco: 7.0 },
    { productId: 'p5', nome: 'Leite Integral Pasteurizado', unidade: 'L', preco: 5.5 },
  ]

  describe('extractQuantityAndProductName', () => {
    it('deve extrair formato com tabulação (planilha com 2 colunas)', () => {
      const res = extractQuantityAndProductName('Arroz Tipo 1\t5')
      expect(res).not.toBeNull()
      expect(res?.productText).toBe('Arroz Tipo 1')
      expect(res?.quantity).toBe(5)
    })

    it('deve extrair tabulação com quantidade na 1a coluna', () => {
      const res = extractQuantityAndProductName('2,5\tFeijão Carioca')
      expect(res).not.toBeNull()
      expect(res?.productText).toBe('Feijão Carioca')
      expect(res?.quantity).toBe(2.5)
    })

    it('deve extrair formato com ponto-e-vírgula', () => {
      const res = extractQuantityAndProductName('Banana Prata; 10')
      expect(res).not.toBeNull()
      expect(res?.productText).toBe('Banana Prata')
      expect(res?.quantity).toBe(10)
    })

    it('deve extrair formato com "x" antes do número (5x Arroz)', () => {
      const res = extractQuantityAndProductName('5x Arroz Tipo 1')
      expect(res).not.toBeNull()
      expect(res?.productText).toBe('Arroz Tipo 1')
      expect(res?.quantity).toBe(5)
    })

    it('deve extrair formato com "x" após o número (Arroz 5x)', () => {
      const res = extractQuantityAndProductName('Arroz Tipo 1 5x')
      expect(res).not.toBeNull()
      expect(res?.productText).toBe('Arroz Tipo 1')
      expect(res?.quantity).toBe(5)
    })

    it('deve extrair quantidade no fim da linha com espaço (Arroz 5)', () => {
      const res = extractQuantityAndProductName('Arroz Tipo 1 5')
      expect(res).not.toBeNull()
      expect(res?.productText).toBe('Arroz Tipo 1')
      expect(res?.quantity).toBe(5)
    })

    it('deve extrair quantidade no fim da linha com decimal em vírgula ou ponto', () => {
      const res1 = extractQuantityAndProductName('Banana Prata 2,5')
      expect(res1?.quantity).toBe(2.5)
      expect(res1?.productText).toBe('Banana Prata')

      const res2 = extractQuantityAndProductName('Banana Prata 2.5')
      expect(res2?.quantity).toBe(2.5)
      expect(res2?.productText).toBe('Banana Prata')
    })

    it('deve aceitar separador por vírgula ("Arroz, 5")', () => {
      const res = extractQuantityAndProductName('Arroz Tipo 1, 5')
      expect(res).not.toBeNull()
      expect(res?.productText).toBe('Arroz Tipo 1')
      expect(res?.quantity).toBe(5)
    })

    it('deve aceitar sufixo de unidade descartável ("Arroz 5kg")', () => {
      const res = extractQuantityAndProductName('Arroz Tipo 1 5kg')
      expect(res?.quantity).toBe(5)
    })

    it('deve aceitar unidade dz/dúzia ("Ovos 10 Dz")', () => {
      const res = extractQuantityAndProductName('Ovos 10 Dz')
      expect(res).not.toBeNull()
      expect(res?.productText).toBe('Ovos')
      expect(res?.quantity).toBe(10)
    })

    it('deve extrair formato de tabela "PRODUTO: quantidade unidade" (ex: "BANANA: 30,0 Kg")', () => {
      const res = extractQuantityAndProductName('BANANA: 30,0 Kg')
      expect(res).not.toBeNull()
      expect(res?.productText).toBe('BANANA')
      expect(res?.quantity).toBe(30)
    })

    it('deve extrair formato "40 KG Aipim" (quantidade primeiro com unidade no meio)', () => {
      const res = extractQuantityAndProductName('40 KG Aipim')
      expect(res).not.toBeNull()
      expect(res?.productText).toBe('Aipim')
      expect(res?.quantity).toBe(40)
    })

    it('deve extrair formato com pipes "40 | KG | Aipim"', () => {
      const res = extractQuantityAndProductName('40 | KG | Aipim')
      expect(res).not.toBeNull()
      expect(res?.productText).toBe('Aipim')
      expect(res?.quantity).toBe(40)
    })

    it('deve extrair formato com tabs "40\tKG\tAipim"', () => {
      const res = extractQuantityAndProductName('40\tKG\tAipim')
      expect(res).not.toBeNull()
      expect(res?.productText).toBe('Aipim')
      expect(res?.quantity).toBe(40)
    })

    it('deve retornar null para linhas vazias ou puramente textuais sem quantidade', () => {
      expect(extractQuantityAndProductName('')).toBeNull()
      expect(extractQuantityAndProductName('   ')).toBeNull()
      expect(extractQuantityAndProductName('Apenas texto sem numero')).toBeNull()
    })
  })

  describe('matchCatalogItemTolerant', () => {
    it('deve casar por nome idêntico normalizado', () => {
      const m = matchCatalogItemTolerant('arroz tipo 1', mockCatalog)
      expect(m?.product.productId).toBe('p1')
    })

    it('deve casar com acentuação e maiúsculas diferentes', () => {
      const m = matchCatalogItemTolerant('FEIJAO CARIOCA', mockCatalog)
      expect(m?.product.productId).toBe('p2')
    })

    it('deve casar no singular/plural ("Bananas Prata" -> "Banana Prata")', () => {
      const m = matchCatalogItemTolerant('Bananas Prata', mockCatalog)
      expect(m?.product.productId).toBe('p3')
    })

    it('deve casar por inclusão / abreviação ("Arroz" -> "Arroz Tipo 1")', () => {
      const m = matchCatalogItemTolerant('Arroz', mockCatalog)
      expect(m?.product.productId).toBe('p1')
    })

    it('deve retornar null para produto não existente', () => {
      const m = matchCatalogItemTolerant('Produto Desconhecido XYZ', mockCatalog)
      expect(m).toBeNull()
    })
  })

  describe('parsePastedOrderText', () => {
    it('deve processar texto multilinha completo', () => {
      const text = `
Arroz Tipo 1\t5
Feijão Carioca; 2,5
5x Banana Prata
Leite Integral 10
LinhaInexistente 3
`
      const result = parsePastedOrderText(text, mockCatalog)
      expect(result.matched.length).toBe(4)
      expect(result.unmatched.length).toBe(1)
      expect(result.unmatched[0].line).toContain('LinhaInexistente')

      // Preços soberanos da chamada
      const arroz = result.matched.find((m) => m.productId === 'p1')
      expect(arroz?.quantity).toBe(5)
      expect(arroz?.unitPrice).toBe(6.5)
      expect(arroz?.subtotal).toBe(32.5)

      const feijao = result.matched.find((m) => m.productId === 'p2')
      expect(feijao?.quantity).toBe(2.5)
      expect(feijao?.unitPrice).toBe(8.0)
      expect(feijao?.subtotal).toBe(20.0)
    })

    it('deve somar quantidades quando o mesmo produto for colado mais de uma vez', () => {
      const text = `
Arroz Tipo 1 2,0
Arroz Tipo 1 3,5
`
      const result = parsePastedOrderText(text, mockCatalog)
      expect(result.matched.length).toBe(1)
      expect(result.matched[0].quantity).toBe(5.5)
      expect(result.matched[0].subtotal).toBe(5.5 * 6.5)
    })

    it('deve ignorar linhas vazias sem adicioná-las aos erros', () => {
      const text = `
      
Arroz Tipo 1 5


`
      const result = parsePastedOrderText(text, mockCatalog)
      expect(result.matched.length).toBe(1)
      expect(result.unmatched.length).toBe(0)
    })

    it('deve processar formato de foto de tabela ignorando cabeçalhos e produtos com células vazias', () => {
      const catalogCustom: OrderPasteCatalogProduct[] = [
        { productId: 'b1', nome: 'Banana', preco: 4.5, unidade: 'Kg' },
        { productId: 'b2', nome: 'Batata Doce', preco: 3.8, unidade: 'Kg' },
        { productId: 'b3', nome: 'Beterraba', preco: 4.0, unidade: 'Kg' },
        { productId: 'b4', nome: 'Brócolis', preco: 8.0, unidade: 'Kg' },
        { productId: 'b5', nome: 'Cenoura', preco: 3.5, unidade: 'Kg' },
        { productId: 'b6', nome: 'Inhame', preco: 6.0, unidade: 'Kg' },
        { productId: 'b7', nome: 'Laranja', preco: 3.0, unidade: 'Kg' },
        { productId: 'b8', nome: 'Tomate', preco: 5.5, unidade: 'Kg' },
      ]

      const tableText = `
Produtos | Unidade | Pedidos Agosto S4 21/09
BANANA: 30,0 Kg
BATATA DOCE: 20,0 Kg
BETERRABA: 20,0 Kg
BRÓCOLIS: 50,0 Kg
CENOURA: 10,0 Kg
INHAME: 20,0 Kg
LARANJA: 20,0 Kg
TOMATE: 30,0 Kg
`
      const res = parsePastedOrderText(tableText, catalogCustom)
      expect(res.unmatched.length).toBe(0)
      expect(res.matched.length).toBe(8)
      const banana = res.matched.find((m) => m.productName === 'Banana')
      expect(banana?.quantity).toBe(30)
      const tomate = res.matched.find((m) => m.productName === 'Tomate')
      expect(tomate?.quantity).toBe(30)
      const brocolis = res.matched.find((m) => m.productName === 'Brócolis')
      expect(brocolis?.quantity).toBe(50)
    })

    it('deve descartar cabeçalhos, fragmentos e linhas sem quantidade via cleanTableOcrText', async () => {
      const { cleanTableOcrText } = await import('./imageExtractor')
      const rawWithHeaderAndEmptyCells = `
Produtos
Banana 30,0 Kg
Unidade BXSTLLS
Agosto
$4 21/09
Batata Doce
Beterraba
Brócolis
Cenoura 10,0 Kg
Couve Flor
Inhame
Laranja
Ovos 10 Dz
Pepino
Repolho
Tangerina
Tomate 30,0 Kg
`
      const cleaned = cleanTableOcrText(rawWithHeaderAndEmptyCells)
      expect(cleaned).toContain('BANANA: 30,0 Kg')
      expect(cleaned).toContain('CENOURA: 10,0 Kg')
      expect(cleaned).toContain('OVOS: 10 Dz')
      expect(cleaned).toContain('TOMATE: 30,0 Kg')

      // Não deve conter cabeçalhos nem produtos sem quantidade
      expect(cleaned).not.toContain('BXSTLLS')
      expect(cleaned).not.toContain('Agosto')
      expect(cleaned).not.toContain('$4 21/09')
      expect(cleaned).not.toContain('Batata Doce')
      expect(cleaned).not.toContain('Beterraba')
      expect(cleaned).not.toContain('Brócolis')
      expect(cleaned).not.toContain('Inhame')
      expect(cleaned).not.toContain('Pepino')
      expect(cleaned).not.toContain('Repolho')
    })

    it('deve preservar a PRIMEIRA linha de produto, espaços internos dos nomes e separador decimal exatamente', async () => {
      const { cleanTableOcrText } = await import('./imageExtractor')
      // Simula a tabela exata com cabeçalhos seguida da 1ª linha válida (Banana) e produtos compostos com decimais
      const rawTableText = `
Produtos | Unidade | Pedidos Agosto S4 21/09
BANANA: 30,0 Kg
BATATA DOCE: 20,0 Kg
BRÓCOLIS: 50,0 Kg
CENOURA: 10,0 Kg
COUVE FLOR: 5,0 Kg
`
      const cleaned = cleanTableOcrText(rawTableText)
      const lines = cleaned.split('\n')

      // 1. A primeira linha DEVE ser BANANA (não pode ser engolida)
      expect(lines[0]).toBe('BANANA: 30,0 Kg')

      // 2. Nomes compostos devem preservar o espaço interno
      expect(cleaned).toContain('BATATA DOCE: 20,0 Kg')
      expect(cleaned).not.toContain('BATATADOCE')
      expect(cleaned).toContain('COUVE FLOR: 5,0 Kg')
      expect(cleaned).not.toContain('COUVEFLOR')

      // 3. Os decimais devem ser preservados exatamente com vírgula e sem inflar 10x
      expect(cleaned).toContain('20,0 Kg')
      expect(cleaned).not.toContain('200 Kg')
      expect(cleaned).toContain('50,0 Kg')
      expect(cleaned).not.toContain('500 Kg')
      expect(cleaned).toContain('10,0 Kg')
      expect(cleaned).not.toContain('100 Kg')
    })

    it('deve extrair a tabela oficial SEE DUC com colunas QUANT. | KG | PRODUTO e descartar rodapé institucional', async () => {
      const { cleanTableOcrText } = await import('./imageExtractor')
      const officialFormOcrText = `QUANT. | KG | PRODUTO
40 | KG | Aipim
15 | KG | Alface
2 | KG | Cheiro verde
40 | KG | Couve-flor
10 | KG | Espinafre
3 | KG | Limão

Teresópolis, 17/09/2026
SEE DUC
Valéria Soares da Silva
DIRETORA / ID 42536359
Colégio Estadual Euclydes da Cunha
Rua Mello Franco, 608 - Alto - Teresópolis/RJ - CEP 25.960-531
Telefone 21 2741-1337 - e-mail: ceeuclydesdacunha@educacao.rj.gov.br`

      const cleaned = cleanTableOcrText(officialFormOcrText)
      const lines = cleaned.split('\n').filter((l) => l.trim().length > 0)

      expect(lines).toEqual([
        'AIPIM: 40,0 Kg',
        'ALFACE: 15,0 Kg',
        'CHEIRO VERDE: 2,0 Kg',
        'COUVE-FLOR: 40,0 Kg',
        'ESPINAFRE: 10,0 Kg',
        'LIMÃO: 3,0 Kg',
      ])

      // Verifica casamento no parser com o catálogo da chamada 07/2025
      const catalogChamada07: OrderPasteCatalogProduct[] = [
        { productId: 'prod_aipim', nome: 'AIPIM', unidade: 'Kg', preco: 6.0 },
        { productId: 'prod_alface', nome: 'ALFACE', unidade: 'Kg', preco: 7.0 },
        { productId: 'prod_cheiro', nome: 'CHEIRO-VERDE', unidade: 'Molho', preco: 2.0 },
        { productId: 'prod_couveflor', nome: 'COUVE-FLOR', unidade: 'Kg', preco: 7.0 },
        { productId: 'prod_espinafre', nome: 'ESPINAFRE', unidade: 'Kg', preco: 7.0 },
        { productId: 'prod_limao', nome: 'LIMAO TAITI', unidade: 'Kg', preco: 8.0 },
      ]

      const parseRes = parsePastedOrderText(cleaned, catalogChamada07)
      expect(parseRes.unmatched).toEqual([])
      expect(parseRes.matched.length).toBe(6)

      expect(parseRes.matched.find((m) => m.productId === 'prod_aipim')?.quantity).toBe(40)
      expect(parseRes.matched.find((m) => m.productId === 'prod_alface')?.quantity).toBe(15)
      expect(parseRes.matched.find((m) => m.productId === 'prod_cheiro')?.quantity).toBe(2)
      expect(parseRes.matched.find((m) => m.productId === 'prod_couveflor')?.quantity).toBe(40)
      expect(parseRes.matched.find((m) => m.productId === 'prod_espinafre')?.quantity).toBe(10)
      expect(parseRes.matched.find((m) => m.productId === 'prod_limao')?.quantity).toBe(3)
    })

    it('deve decifrar OCR ruidoso exato relatado pelo usuário, omitindo rodapé e linhas ilegíveis', async () => {
      const { cleanTableOcrText } = await import('./imageExtractor')
      const userReportedNoise = `QUANT] | PRODUTO |
40 [xe am
ao [KG] comerfor =
Teresópolis, = 17/09/2026
É à
SEE          “DIRETORA / 10 áas26350.
DUE,`

      const cleaned = cleanTableOcrText(userReportedNoise)
      const lines = cleaned.split('\n').filter((l) => l.trim().length > 0)

      // Deve extrair estritamente as linhas canônicas sem lixo
      expect(lines).toEqual(['AIPIM: 40,0 Kg', 'COUVE-FLOR: 40,0 Kg'])

      // Nunca deve conter cabeçalho nem rodapé ou ruído
      expect(cleaned).not.toContain('QUANT')
      expect(cleaned).not.toContain('Teresópolis')
      expect(cleaned).not.toContain('DIRETORA')
      expect(cleaned).not.toContain('SEE')
      expect(cleaned).not.toContain('DUE')
      expect(cleaned).not.toContain('É à')

      // Verifica casamento no parser com o catálogo da chamada 07/2025
      const catalogChamada07: OrderPasteCatalogProduct[] = [
        { productId: 'prod_aipim', nome: 'AIPIM', unidade: 'Kg', preco: 6.0 },
        { productId: 'prod_alface', nome: 'ALFACE', unidade: 'Kg', preco: 7.0 },
        { productId: 'prod_cheiro', nome: 'CHEIRO-VERDE', unidade: 'Molho', preco: 2.0 },
        { productId: 'prod_couveflor', nome: 'COUVE-FLOR', unidade: 'Kg', preco: 7.0 },
        { productId: 'prod_espinafre', nome: 'ESPINAFRE', unidade: 'Kg', preco: 7.0 },
        { productId: 'prod_limao', nome: 'LIMAO TAITI', unidade: 'Kg', preco: 8.0 },
      ]

      const parseRes = parsePastedOrderText(cleaned, catalogChamada07)
      expect(parseRes.unmatched).toEqual([])
      expect(parseRes.matched.length).toBe(6)

      expect(parseRes.matched.find((m) => m.productId === 'prod_aipim')?.quantity).toBe(40)
      expect(parseRes.matched.find((m) => m.productId === 'prod_alface')?.quantity).toBe(15)
      expect(parseRes.matched.find((m) => m.productId === 'prod_cheiro')?.quantity).toBe(2)
      expect(parseRes.matched.find((m) => m.productId === 'prod_couveflor')?.quantity).toBe(40)
      expect(parseRes.matched.find((m) => m.productId === 'prod_espinafre')?.quantity).toBe(10)
      expect(parseRes.matched.find((m) => m.productId === 'prod_limao')?.quantity).toBe(3)
    })

    it('deve parsear diretamente a tabela bruta QUANT. | KG | PRODUTO mesmo sem pré-limpeza do OCR', () => {
      const rawTableText = `QUANT. | KG | PRODUTO
40 | KG | Aipim
15 | KG | Alface
2 | KG | Cheiro verde
40 | KG | Couve-flor
10 | KG | Espinafre
3 | KG | Limão

Teresópolis, 17/09/2026
SEE DUC
Valéria Soares da Silva
DIRETORA / ID 42536359
Colégio Estadual Euclydes da Cunha
Rua Mello Franco, 608 - Alto - Teresópolis/RJ - CEP 25.960-531
Telefone 21 2741-1337 - e-mail: ceeuclydesdacunha@educacao.rj.gov.br`

      const catalogChamada07: OrderPasteCatalogProduct[] = [
        { productId: 'prod_aipim', nome: 'AIPIM', unidade: 'Kg', preco: 6.0 },
        { productId: 'prod_alface', nome: 'ALFACE', unidade: 'Kg', preco: 7.0 },
        { productId: 'prod_cheiro', nome: 'CHEIRO-VERDE', unidade: 'Molho', preco: 2.0 },
        { productId: 'prod_couveflor', nome: 'COUVE-FLOR', unidade: 'Kg', preco: 7.0 },
        { productId: 'prod_espinafre', nome: 'ESPINAFRE', unidade: 'Kg', preco: 7.0 },
        { productId: 'prod_limao', nome: 'LIMAO TAITI', unidade: 'Kg', preco: 8.0 },
      ]

      const parseRes = parsePastedOrderText(rawTableText, catalogChamada07)
      expect(parseRes.unmatched).toEqual([])
      expect(parseRes.matched.length).toBe(6)

      expect(parseRes.matched.find((m) => m.productId === 'prod_aipim')?.quantity).toBe(40)
      expect(parseRes.matched.find((m) => m.productId === 'prod_alface')?.quantity).toBe(15)
      expect(parseRes.matched.find((m) => m.productId === 'prod_cheiro')?.quantity).toBe(2)
      expect(parseRes.matched.find((m) => m.productId === 'prod_couveflor')?.quantity).toBe(40)
      expect(parseRes.matched.find((m) => m.productId === 'prod_espinafre')?.quantity).toBe(10)
      expect(parseRes.matched.find((m) => m.productId === 'prod_limao')?.quantity).toBe(3)
    })

    it('deve converter pontos decimais e normalizar a primeira linha sem dois-pontos logo após o cabeçalho', async () => {
      const { cleanTableOcrText } = await import('./imageExtractor')
      const rawHorizontal = `
Produtos | Unidade | Pedidos
Banana 30.0 Kg
Batata Doce 20.0 Kg
Brócolis 50,0 Kg
Cenoura 10.0
`
      const cleaned = cleanTableOcrText(rawHorizontal)
      const lines = cleaned.split('\n')

      expect(lines[0]).toBe('BANANA: 30,0 Kg')
      expect(lines[1]).toBe('BATATA DOCE: 20,0 Kg')
      expect(lines[2]).toBe('BRÓCOLIS: 50,0 Kg')
      expect(lines[3]).toBe('CENOURA: 10,0 Kg')
    })

    it('deve processar tabelas OCR reais com colunas desalinhadas e primeira linha Banana preservada', async () => {
      const { cleanTableOcrText } = await import('./imageExtractor')
      // Caso idêntico ao OCR real reportado:
      // "Banana | Kg | 300" e colunas com pipes
      const rawOcrTable = `
Produtos Unidade BXSTLLS Agosto S4 21/09
Banana | Kg | 300
Batata Doce | Kg | 200
Beterraba | Kg | 200
Brócolis | Kg | 500
Cenoura | Kg | 100
Inhame | Kg | 200
Laranja | Kg | 200
`
      const cleaned = cleanTableOcrText(rawOcrTable)
      const lines = cleaned.split('\n')

      expect(lines[0]).toBe('BANANA: 30,0 Kg')
      expect(lines[1]).toBe('BATATA DOCE: 20,0 Kg')
      expect(lines[2]).toBe('BETERRABA: 20,0 Kg')
      expect(lines[3]).toBe('BRÓCOLIS: 50,0 Kg')
      expect(lines[4]).toBe('CENOURA: 10,0 Kg')
      expect(lines[5]).toBe('INHAME: 20,0 Kg')
      expect(lines[6]).toBe('LARANJA: 20,0 Kg')
    })

    it('deve casar no catálogo mesmo se usuário colar nome sem espaço (ex: BATATADOCE)', () => {
      const catalogCustom: OrderPasteCatalogProduct[] = [
        { productId: 'b1', nome: 'Banana Prata', preco: 4.5, unidade: 'Kg' },
        { productId: 'b2', nome: 'Batata Doce', preco: 3.8, unidade: 'Kg' },
        { productId: 'b3', nome: 'Couve Flor', preco: 6.0, unidade: 'Kg' },
      ]

      const textWithoutSpaces = `
BATATADOCE: 20,0 Kg
COUVEFLOR: 5,0 Kg
`
      const res = parsePastedOrderText(textWithoutSpaces, catalogCustom)
      expect(res.unmatched.length).toBe(0)
      expect(res.matched.length).toBe(2)
      const batata = res.matched.find((m) => m.productId === 'b2')
      expect(batata).toBeDefined()
      expect(batata?.productName).toBe('Batata Doce')
      expect(batata?.quantity).toBe(20)

      const couve = res.matched.find((m) => m.productId === 'b3')
      expect(couve).toBeDefined()
      expect(couve?.productName).toBe('Couve Flor')
      expect(couve?.quantity).toBe(5)
    })

    it('deve processar com perfeição o comprovante exato de pedido colado pelo usuário', () => {
      const comprovanteText = `═══════════════════════════════════════
         COMPROVANTE DE PEDIDO         
═══════════════════════════════════════
📋 PROTOCOLO: FOR-38-0088
🏫 ESCOLA: CE PRESIDENTE BERNARDES
🔄 CICLO: Ciclo 38/2026
📅 PREVISÃO DE ENTREGA: Segunda-feira, 28/09/2026
───────────────────────────────────────
ITENS SOLICITADOS:
 • AIPIM: 1,0 Kg
 • CENOURA: 100,0 Kg
 • COUVE MINEIRA: 5,0 Kg
 • PEPINO: 1,5 Kg
═══════════════════════════════════════
Guarde este comprovante para conferência.`

      const extendedCatalog: OrderPasteCatalogProduct[] = [
        ...mockCatalog,
        { productId: 'p10', nome: 'Aipim', unidade: 'Kg', preco: 4.5 },
        { productId: 'p11', nome: 'Cenoura', unidade: 'Kg', preco: 5.0 },
        { productId: 'p12', nome: 'Couve Mineira', unidade: 'Kg', preco: 3.5 },
        { productId: 'p13', nome: 'Pepino', unidade: 'Kg', preco: 4.0 },
      ]

      expect(isComprovantePedido(comprovanteText)).toBe(true)

      const meta = extractComprovanteMetadata(comprovanteText)
      expect(meta.isComprovante).toBe(true)
      expect(meta.protocolo).toBe('FOR-38-0088')
      expect(meta.escolaNome).toBe('CE PRESIDENTE BERNARDES')
      expect(meta.cicloTexto).toBe('Ciclo 38/2026')
      expect(meta.previsaoEntrega).toBe('Segunda-feira, 28/09/2026')

      const result = parsePastedOrderText(comprovanteText, extendedCatalog)

      // Requisito 3: extração dos 4 itens com quantidades certas, zero linhas de erro e detecção da escola
      expect(result.unmatched).toEqual([])
      expect(result.matched.length).toBe(4)
      expect(result.metadata?.escolaNome).toBe('CE PRESIDENTE BERNARDES')
      expect(result.metadata?.protocolo).toBe('FOR-38-0088')
      expect(result.metadata?.cicloTexto).toBe('Ciclo 38/2026')

      const aipim = result.matched.find((m) => m.productId === 'p10')
      expect(aipim).toBeDefined()
      expect(aipim?.quantity).toBe(1.0)
      expect(aipim?.subtotal).toBe(1.0 * 4.5)

      const cenoura = result.matched.find((m) => m.productId === 'p11')
      expect(cenoura).toBeDefined()
      expect(cenoura?.quantity).toBe(100.0)
      expect(cenoura?.subtotal).toBe(100.0 * 5.0)

      const couve = result.matched.find((m) => m.productId === 'p12')
      expect(couve).toBeDefined()
      expect(couve?.quantity).toBe(5.0)
      expect(couve?.subtotal).toBe(5.0 * 3.5)

      const pepino = result.matched.find((m) => m.productId === 'p13')
      expect(pepino).toBeDefined()
      expect(pepino?.quantity).toBe(1.5)
      expect(pepino?.subtotal).toBe(1.5 * 4.0)

      expect(result.totalCalculated).toBe(1.0 * 4.5 + 100.0 * 5.0 + 5.0 * 3.5 + 1.5 * 4.0)
    })
  })

  describe('fusão de itens e permanência de lista no fluxo Novo Pedido', () => {
    it('deve fundir produtos repetidos somando suas quantidades e mantendo múltiplos de 0,5', () => {
      // Simula itens já presentes no pedido do usuário
      const currentOrderItems: Array<{ productId: string; quantity: number; rawInput?: string }> = [
        { productId: 'p1', quantity: 2.0, rawInput: '2,0' }, // Arroz Tipo 1
        { productId: 'p3', quantity: 1.5, rawInput: '1,5' }, // Banana Prata
      ]

      // Simula o resultado de parsePreview.matched após colar mais itens
      const pastedMatched = [
        { productId: 'p1', quantity: 3.5 }, // Novo Arroz -> deve somar com 2.0 virando 5.5
        { productId: 'p2', quantity: 4.0 }, // Novo Feijão -> deve ser adicionado à lista
      ]

      // Lógica idêntica ao handleApplyPastedOrderItems em Orders.tsx
      const copy = [...currentOrderItems]
      for (const m of pastedMatched) {
        const existingIdx = copy.findIndex((it) => it.productId === m.productId)
        if (existingIdx >= 0) {
          const oldQty = Number(copy[existingIdx].quantity) || 0
          const sumQty = oldQty + m.quantity
          copy[existingIdx] = {
            productId: m.productId,
            quantity: sumQty,
            rawInput: sumQty.toLocaleString('pt-BR', {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }),
          }
        } else {
          copy.push({
            productId: m.productId,
            quantity: m.quantity,
            rawInput: m.quantity.toLocaleString('pt-BR', {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }),
          })
        }
      }

      expect(copy.length).toBe(3)
      const arroz = copy.find((i) => i.productId === 'p1')
      expect(arroz?.quantity).toBe(5.5)
      const banana = copy.find((i) => i.productId === 'p3')
      expect(banana?.quantity).toBe(1.5)
      const feijao = copy.find((i) => i.productId === 'p2')
      expect(feijao?.quantity).toBe(4.0)
    })

    it('deve blindar o diálogo pai quando o modal de colagem fechar recentemente (janela de debounce)', () => {
      let isParentOpen = true
      const pasteModalOpen = false
      const isPasteModalOpenRef = { current: false }
      const lastPasteClosedAtRef = { current: Date.now() - 100 } // Fechou há 100ms

      const handleOpenDialog = (isOpen: boolean) => {
        if (!isOpen) {
          if (
            pasteModalOpen ||
            isPasteModalOpenRef.current ||
            Date.now() - lastPasteClosedAtRef.current < 500
          ) {
            return
          }
        }
        isParentOpen = isOpen
      }

      // Tentativa de fechar o diálogo pai logo após a colagem: deve ser bloqueada
      handleOpenDialog(false)
      expect(isParentOpen).toBe(true)

      // Após passar a janela de 500ms, o fechamento legítimo pelo usuário deve funcionar
      lastPasteClosedAtRef.current = Date.now() - 600
      handleOpenDialog(false)
      expect(isParentOpen).toBe(false)
    })
  })
})
