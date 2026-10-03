/**
 * Parser tolerante para colagem em lote de itens de pedido no diálogo "Novo Pedido" (Orders.tsx).
 *
 * Formatos suportados por linha:
 * 1. Planilha / TSV (2 ou mais colunas separadas por tabulação):
 *    - "Arroz\t5" ou "Arroz\t5,5" ou "5\tArroz"
 * 2. Separadores comuns CSV (; ou ,):
 *    - "Arroz; 5" ou "Arroz, 5" ou "Arroz - 5" ou "Arroz: 5"
 * 3. Notação com "x" antes ou depois do número:
 *    - "5x Arroz" ou "5 x Arroz" ou "Arroz 5x" ou "Arroz x 5"
 * 4. Quantidade no fim da linha:
 *    - "Arroz agulhinha tipo 1 5" ou "Feijão carioca 2,5"
 * 5. Quantidade no início da linha:
 *    - "5 Arroz" ou "2.5 Feijão"
 *
 * Regras:
 * - Quantidades de itens de pedido aceitam múltiplos de 0,5 (ex: 0,5 / 1,0 / 1,5 / 2,0 / 5).
 * - Aceita tanto vírgula quanto ponto decimal (ex: "2,5" ou "2.5").
 * - Preços são SOBERANOS da chamada (nunca colados).
 * - Matching do produto é tolerante: títulos, normalização de acentos, minúsculas, singular/plural, tokens e inclusão.
 * - Linhas vazias são ignoradas sem gerar erro.
 * - Linhas não casadas ou com quantidade inválida são listadas como não reconhecidas / avisos na prévia.
 */

import { normalizeName, stripParentheses } from '@/lib/excelImporter'
import { dePluralizeName } from '@/lib/productCsvImporter'
import { validateQuantityStepHalf } from '@/lib/decimalUtils'

export interface OrderPasteCatalogProduct {
  productId: string
  nome: string
  unidade: string
  preco: number
}

export interface MatchedPastedOrderItem {
  productId: string
  productName: string
  unidade: string
  unitPrice: number
  quantity: number
  subtotal: number
  originalLine: string
  matchedVia: string
}

export interface UnmatchedPastedOrderLine {
  lineNumber: number
  line: string
  reason: string
}

export interface OrderPasteMetadata {
  isComprovante?: boolean
  protocolo?: string
  escolaNome?: string
  cicloTexto?: string
  previsaoEntrega?: string
}

export interface OrderPasteParseResult {
  matched: MatchedPastedOrderItem[]
  unmatched: UnmatchedPastedOrderLine[]
  totalItems: number
  totalCalculated: number
  metadata?: OrderPasteMetadata
}

/**
 * Tenta extrair a quantidade (múltiplo de 0,5) e o nome do produto a partir de uma linha de texto.
 */
export function extractQuantityAndProductName(rawLine: string): {
  productText: string
  quantity: number
  rawQtyStr: string
} | null {
  const line = rawLine.trim()
  if (!line) return null

  // 1. Separador de tabulação (colagem direta de planilha Excel / Sheets: "Arroz\t5")
  if (line.includes('\t')) {
    const parts = line
      .split('\t')
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length >= 2) {
      // Testa se parts[1] é quantidade
      const q1 = parseQuantityToken(parts[1])
      if (q1 !== null) {
        return { productText: parts[0], quantity: q1.val, rawQtyStr: q1.raw }
      }
      // Testa se parts[0] é quantidade ("5\tArroz")
      const q0 = parseQuantityToken(parts[0])
      if (q0 !== null) {
        return { productText: parts.slice(1).join(' '), quantity: q0.val, rawQtyStr: q0.raw }
      }
    }
  }

  // 2. Separador de ponto-e-vírgula ("Arroz; 5" ou "5; Arroz")
  if (line.includes(';')) {
    const parts = line
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length >= 2) {
      const q1 = parseQuantityToken(parts[1])
      if (q1 !== null) {
        return { productText: parts[0], quantity: q1.val, rawQtyStr: q1.raw }
      }
      const q0 = parseQuantityToken(parts[0])
      if (q0 !== null) {
        return { productText: parts.slice(1).join(' '), quantity: q0.val, rawQtyStr: q0.raw }
      }
    }
  }

  // 3. Padrão "5x Arroz" ou "5 x Arroz" ou "2,5x Arroz" (no início da linha)
  const matchStartWithX = line.match(/^(\d+(?:[.,]\d+)?)\s*[xX*]\s+(.+)$/)
  if (matchStartWithX) {
    const q = parseQuantityToken(matchStartWithX[1])
    if (q !== null) {
      return { productText: matchStartWithX[2].trim(), quantity: q.val, rawQtyStr: q.raw }
    }
  }

  // 4. Padrão "Arroz 5x" ou "Arroz - 5x" (no fim da linha com x)
  const matchEndWithX = line.match(/^(.+?)(?:\s*[-:]\s*|\s+)(\d+(?:[.,]\d+)?)\s*[xX*]$/)
  if (matchEndWithX) {
    const q = parseQuantityToken(matchEndWithX[2])
    if (q !== null) {
      return { productText: matchEndWithX[1].trim(), quantity: q.val, rawQtyStr: q.raw }
    }
  }

  // 5. Separador por traço ou dois-pontos com espaços: "Arroz - 5" ou "Arroz : 5" ou "Arroz - 2,5" ou "AIPIM: 1,0 Kg"
  const matchDashOrColon = line.match(
    /^(.+?)\s*[-:]\s*(\d+(?:[.,]\d+)?)(?:\s*(?:kg|kilo|kilos|quilos|un|unid|und|unidade|unidades|pct|pacote|cx|caixa|l|litro|litros|g|gramas))?$/i,
  )
  if (matchDashOrColon) {
    const q = parseQuantityToken(matchDashOrColon[2])
    if (q !== null) {
      return { productText: matchDashOrColon[1].trim(), quantity: q.val, rawQtyStr: q.raw }
    }
  }

  // 6. Separador por vírgula ("Arroz, 5" ou "Arroz, 5 un") — mas cuidado se o número tem vírgula decimal!
  // Ex: "Arroz, 2,5" -> a última parte é ",5", penúltima "2"
  if (line.includes(',')) {
    // Tenta casar nome seguido de vírgula e número decimal: "Arroz, 2,5" ou "Arroz, 5"
    const matchCommaQty = line.match(
      /^(.+?),\s*(\d+(?:[.,]\d+)?)(?:\s*(?:kg|kilo|kilos|quilos|un|unid|und|unidade|unidades|pct|pacote|cx|caixa|l|litro|litros|g|gramas))?$/i,
    )
    if (matchCommaQty) {
      const q = parseQuantityToken(matchCommaQty[2])
      if (q !== null) {
        return { productText: matchCommaQty[1].trim(), quantity: q.val, rawQtyStr: q.raw }
      }
    }
  }

  // 7. Quantidade no fim da linha precedida de espaço: "Arroz agulhinha 5" ou "Feijão carioca 2,5"
  const matchEndQty = line.match(
    /^(.+?)\s+(\d+(?:[.,]\d+)?)(?:\s*(?:kg|kilo|kilos|quilos|un|unid|und|unidade|unidades|pct|pacote|cx|caixa|l|litro|litros|g|gramas))?$/i,
  )
  if (matchEndQty) {
    const q = parseQuantityToken(matchEndQty[2])
    if (q !== null) {
      return { productText: matchEndQty[1].trim(), quantity: q.val, rawQtyStr: q.raw }
    }
  }

  // 8. Quantidade no início da linha: "5 Arroz" ou "2,5 Feijão"
  const matchStartQty = line.match(
    /^(\d+(?:[.,]\d+)?)(?:\s*(?:kg|kilo|kilos|quilos|un|unid|und|unidade|unidades|pct|pacote|cx|caixa|l|litro|litros|g|gramas))?\s+(.+)$/i,
  )
  if (matchStartQty) {
    const q = parseQuantityToken(matchStartQty[1])
    if (q !== null) {
      return { productText: matchStartQty[2].trim(), quantity: q.val, rawQtyStr: q.raw }
    }
  }

  return null
}

function parseQuantityToken(token: string): { val: number; raw: string } | null {
  if (!token) return null
  // Remove unidades comuns coladas ("5kg" -> "5", "2,5un" -> "2,5")
  const cleaned = token
    .replace(
      /(?:kg|kilo|kilos|quilos|un|unid|und|unidade|unidades|pct|pacote|cx|caixa|l|litro|litros|g|gramas)$/i,
      '',
    )
    .trim()
  const valid = validateQuantityStepHalf(cleaned)
  if (valid.isValid && valid.numericValue > 0) {
    return { val: valid.numericValue, raw: cleaned }
  }
  return null
}

/**
 * Detecta se o texto colado é um comprovante de pedido gerado pelo formulário ou WhatsApp.
 */
export function isComprovantePedido(rawText: string): boolean {
  if (!rawText) return false
  const upper = rawText.toUpperCase()
  return (
    upper.includes('COMPROVANTE DE PEDIDO') ||
    (upper.includes('PROTOCOLO:') && upper.includes('ITENS SOLICITADOS:'))
  )
}

/**
 * Extrai metadados do cabeçalho do comprovante (Escola, Protocolo, Ciclo, Previsão).
 */
export function extractComprovanteMetadata(rawText: string): OrderPasteMetadata {
  const metadata: OrderPasteMetadata = {
    isComprovante: isComprovantePedido(rawText),
  }
  if (!metadata.isComprovante) return metadata

  const lines = rawText.split(/\r?\n/)
  for (const rawLine of lines) {
    const trimmed = rawLine.trim()

    // 📋 PROTOCOLO: FOR-38-0088
    const protoMatch = trimmed.match(/PROTOCOLO:\s*([^\r\n]+)/i)
    if (protoMatch && !metadata.protocolo) {
      metadata.protocolo = protoMatch[1].trim()
    }

    // 🏫 ESCOLA: CE PRESIDENTE BERNARDES
    const escolaMatch = trimmed.match(/ESCOLA:\s*([^\r\n]+)/i)
    if (escolaMatch && !metadata.escolaNome) {
      metadata.escolaNome = escolaMatch[1].trim()
    }

    // 🔄 CICLO: Ciclo 38/2026
    const cicloMatch = trimmed.match(/CICLO:\s*([^\r\n]+)/i)
    if (cicloMatch && !metadata.cicloTexto) {
      metadata.cicloTexto = cicloMatch[1].trim()
    }

    // 📅 PREVISÃO DE ENTREGA: Segunda-feira, 28/09/2026
    const entregaMatch = trimmed.match(/PREVISÃO DE ENTREGA:\s*([^\r\n]+)/i)
    if (entregaMatch && !metadata.previsaoEntrega) {
      metadata.previsaoEntrega = entregaMatch[1].trim()
    }
  }

  return metadata
}

/**
 * Verifica se a linha é estrutural/metadado do comprovante que deve ser ignorada silenciosamente.
 */
function isComprovanteStructuralLine(line: string): boolean {
  const t = line.trim()
  if (!t) return true

  // Linhas divisórias (═, ─, -, =)
  if (/^[═\-_=\s]{3,}$/.test(t)) return true

  // Cabeçalho e rodapé
  const upper = t.toUpperCase()
  if (upper.includes('COMPROVANTE DE PEDIDO')) return true
  if (upper.includes('ITENS SOLICITADOS:')) return true
  if (upper.includes('GUARDE ESTE COMPROVANTE')) return true
  if (upper.includes('PROTOCOLO:')) return true
  if (upper.includes('ESCOLA:')) return true
  if (upper.includes('CICLO:')) return true
  if (upper.includes('PREVISÃO DE ENTREGA:') || upper.includes('PREVISAO DE ENTREGA:')) return true
  if (upper.includes('NENHUM ITEM LISTADO')) return true

  return false
}

/**
 * Casa uma string de produto com o catálogo de produtos disponíveis da chamada.
 * Cascata tolerante:
 * 1. Match exato normalizado (sem acentos, minúsculas, pontuação)
 * 2. Match com remoção de parênteses
 * 3. Match singular/plural (despluralização termo a termo)
 * 4. Match por inclusão direta (o catálogo contém o texto colado ou vice-versa)
 * 5. Match por tokens significativos (todas as palavras com > 2 letras presentes)
 */
export function matchCatalogItemTolerant(
  rawName: string,
  catalog: OrderPasteCatalogProduct[],
): { product: OrderPasteCatalogProduct; matchedVia: string } | null {
  if (!rawName || catalog.length === 0) return null

  // Limpa ruídos comuns de secretaria
  const cleaned = rawName
    .replace(
      /\b(kg|kilo|quilos|un|unidade|unidades|unid|und|pct|pacote|cx|caixa|g|gramas)\b/gi,
      ' ',
    )
    .replace(
      /\b(de primeira qualidade|primeira qualidade|1a qualidade|tipo 1|tipo 01|especial|fresco|in natura)\b/gi,
      ' ',
    )
    .trim()

  const normCleaned = normalizeName(cleaned)
  const normRaw = normalizeName(rawName)
  const normNoParen = normalizeName(stripParentheses(cleaned))

  if (!normCleaned && !normRaw) return null

  // Prepara candidatos com seus nomes normalizados
  const candidates = catalog.map((p) => {
    const normNome = normalizeName(p.nome)
    const normNomeNoParen = normalizeName(stripParentheses(p.nome))
    const deplural = dePluralizeName(normNome)
    return {
      product: p,
      normNome,
      normNomeNoParen,
      deplural,
    }
  })

  // 1. Match exato
  for (const c of candidates) {
    if (c.normNome === normCleaned || c.normNome === normRaw || c.normNomeNoParen === normNoParen) {
      return { product: c.product, matchedVia: 'Nome idêntico' }
    }
  }

  // 2. Match singular/plural
  const depluralCleaned = dePluralizeName(normCleaned)
  const depluralRaw = dePluralizeName(normRaw)
  for (const c of candidates) {
    if (c.deplural && (c.deplural === depluralCleaned || c.deplural === depluralRaw)) {
      return { product: c.product, matchedVia: 'Singular/Plural' }
    }
  }

  // 3. Match por inclusão (ordenar por maior comprimento para evitar falsos positivos curtos)
  const sortedByLen = [...candidates].sort((a, b) => b.normNome.length - a.normNome.length)
  for (const c of sortedByLen) {
    if (c.normNome.length >= 3 && normCleaned.length >= 3) {
      if (c.normNome.includes(normCleaned) || normCleaned.includes(c.normNome)) {
        return { product: c.product, matchedVia: 'Inclusão parcial' }
      }
    }
  }

  // 4. Match por tokens significativos (palavras > 2 caracteres)
  const tokens = (normCleaned || normRaw).split(/\s+/).filter((t) => t.length > 2)
  if (tokens.length > 0) {
    // 4a. Todos os tokens colados estão presentes no produto do catálogo
    const fullSubset = sortedByLen.find((c) => tokens.every((t) => c.normNome.includes(t)))
    if (fullSubset) {
      return { product: fullSubset.product, matchedVia: 'Palavras-chave' }
    }

    // 4b. Todos os tokens do produto do catálogo estão presentes no texto colado
    const reverseSubset = sortedByLen.find((c) => {
      const cTokens = c.normNome.split(/\s+/).filter((t) => t.length > 2)
      return cTokens.length > 0 && cTokens.every((ct) => tokens.includes(ct))
    })
    if (reverseSubset) {
      return { product: reverseSubset.product, matchedVia: 'Palavras-chave' }
    }

    // 4c. Primeiro token significativo relevante (>= 4 caracteres, ex: "Arroz", "Banana")
    const firstWord = tokens[0]
    if (firstWord && firstWord.length >= 4) {
      const wordMatches = sortedByLen.filter((c) => {
        const cWords = c.normNome.split(/\s+/).filter((t) => t.length > 2)
        return cWords.includes(firstWord)
      })
      if (wordMatches.length === 1) {
        return { product: wordMatches[0].product, matchedVia: 'Palavra principal' }
      }
    }
  }

  return null
}

/**
 * Faz o parse completo de um texto colado com múltiplos itens de pedido.
 * Agrupa itens do mesmo produto somando a quantidade.
 */
export function parsePastedOrderText(
  rawText: string,
  catalog: OrderPasteCatalogProduct[],
): OrderPasteParseResult {
  const isComprovante = isComprovantePedido(rawText)
  const metadata = extractComprovanteMetadata(rawText)

  const lines = (rawText || '').split(/\r?\n/)
  const matchedMap = new Map<string, MatchedPastedOrderItem>()
  const unmatched: UnmatchedPastedOrderLine[] = []

  lines.forEach((rawLine, idx) => {
    const lineNum = idx + 1
    const trimmed = rawLine.trim()

    // Linhas vazias são ignoradas sem aviso
    if (!trimmed) return

    // Se detectou modo comprovante:
    if (isComprovante) {
      // Ignora silenciosamente linhas estruturais/cabeçalho/rodapé
      if (isComprovanteStructuralLine(trimmed)) {
        return
      }

      // Se for comprovante, itens têm bullet "•", "-", "*" ou são linhas de item
      // Remove marcador inicial se presente
      const itemLine = trimmed.replace(/^[\s•\-*·]+\s*/, '').trim()
      if (!itemLine) return

      const extracted = extractQuantityAndProductName(itemLine)
      if (!extracted) {
        unmatched.push({
          lineNumber: lineNum,
          line: trimmed,
          reason: 'Não foi possível identificar a quantidade (ex: 5, 2,5, 1x).',
        })
        return
      }

      const matchedProd = matchCatalogItemTolerant(extracted.productText, catalog)
      if (!matchedProd) {
        unmatched.push({
          lineNumber: lineNum,
          line: trimmed,
          reason: `Produto "${extracted.productText}" não localizado no catálogo desta chamada.`,
        })
        return
      }

      const { product, matchedVia } = matchedProd
      const unitPrice = product.preco || 0
      const addQty = extracted.quantity

      if (matchedMap.has(product.productId)) {
        const existing = matchedMap.get(product.productId)!
        const newQty = existing.quantity + addQty
        existing.quantity = newQty
        existing.subtotal = newQty * unitPrice
        existing.originalLine += ` + [L${lineNum}: ${trimmed}]`
      } else {
        matchedMap.set(product.productId, {
          productId: product.productId,
          productName: product.nome,
          unidade: product.unidade || 'un',
          unitPrice,
          quantity: addQty,
          subtotal: addQty * unitPrice,
          originalLine: trimmed,
          matchedVia,
        })
      }
      return
    }

    // Modo padrão / formatos anteriores:
    // Remove eventual bullet inicial caso o usuário cole lista com bullet fora de comprovante
    const itemLine = trimmed.replace(/^[\s•\-*·]+\s*/, '').trim()
    const extracted = extractQuantityAndProductName(itemLine || trimmed)
    if (!extracted) {
      unmatched.push({
        lineNumber: lineNum,
        line: trimmed,
        reason: 'Não foi possível identificar a quantidade (ex: 5, 2,5, 1x).',
      })
      return
    }

    const matchedProd = matchCatalogItemTolerant(extracted.productText, catalog)
    if (!matchedProd) {
      unmatched.push({
        lineNumber: lineNum,
        line: trimmed,
        reason: `Produto "${extracted.productText}" não localizado no catálogo desta chamada.`,
      })
      return
    }

    const { product, matchedVia } = matchedProd
    const unitPrice = product.preco || 0
    const addQty = extracted.quantity

    if (matchedMap.has(product.productId)) {
      const existing = matchedMap.get(product.productId)!
      const newQty = existing.quantity + addQty
      existing.quantity = newQty
      existing.subtotal = newQty * unitPrice
      existing.originalLine += ` + [L${lineNum}: ${trimmed}]`
    } else {
      matchedMap.set(product.productId, {
        productId: product.productId,
        productName: product.nome,
        unidade: product.unidade || 'un',
        unitPrice,
        quantity: addQty,
        subtotal: addQty * unitPrice,
        originalLine: trimmed,
        matchedVia,
      })
    }
  })

  const matched = Array.from(matchedMap.values())
  const totalCalculated = matched.reduce((acc, m) => acc + m.subtotal, 0)

  return {
    matched,
    unmatched,
    totalItems: matched.length,
    totalCalculated,
    metadata,
  }
}
