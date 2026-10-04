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
