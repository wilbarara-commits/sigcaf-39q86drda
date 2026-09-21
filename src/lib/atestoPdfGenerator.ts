import jsPDF from 'jspdf'
import autoTable, { applyPlugin } from 'jspdf-autotable'
import type { Order, ConfiguracoesRecord } from '@/lib/types'

// Assegura que o plugin autoTable esteja devidamente acoplado ao protótipo do jsPDF
try {
  if (typeof applyPlugin === 'function') {
    applyPlugin(jsPDF)
  }
} catch {
  // Ignora se já estiver inicializado
}

/**
 * Função segura para chamar o autoTable em qualquer ambiente (Vite dev/build ESM/CJS interop)
 */
function runAutoTable(doc: jsPDF, options: any): void {
  const docAny = doc as any
  if (typeof autoTable === 'function') {
    autoTable(doc, options)
    return
  }
  if ((autoTable as any)?.default && typeof (autoTable as any).default === 'function') {
    ;(autoTable as any).default(doc, options)
    return
  }
  if (typeof docAny.autoTable === 'function') {
    docAny.autoTable(options)
    return
  }
  throw new Error('Falha ao carregar o motor de tabela autoTable do jsPDF')
}

export interface AtestoDocumentData {
  numeroAtesto: string
  numeroChamada: string
  nomeEscola: string
  nomeCooperativa: string
  siglaCooperativa?: string
  cidadeUf: string
  dataEmissao: Date | string
  items: Array<{
    nome: string
    quantidade: number
    unidade?: string
  }>
  logoUrl?: string
  onLogoError?: (err: unknown) => void
}

/**
 * Converte número com formatação brasileira (vírgula decimal)
 */
export function formatQuantityBR(val: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: Number.isInteger(val) ? 0 : 2,
    maximumFractionDigits: 3,
  }).format(val || 0)
}

/**
 * Formata data por extenso no padrão: "Nova Friburgo - RJ, 13 de setembro de 2026."
 */
export function formatExtendDateBR(cidadeUf: string, dateInput?: Date | string): string {
  const d = dateInput ? new Date(dateInput) : new Date()
  const validDate = isNaN(d.getTime()) ? new Date() : d

  const day = validDate.getDate()
  const months = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ]
  const monthName = months[validDate.getMonth()]
  const year = validDate.getFullYear()

  const cidade = cidadeUf?.trim() || 'Município'
  return `${cidade}, ${day} de ${monthName} de ${year}.`
}

/**
 * Carrega imagem de uma URL como dataURL (base64) e determina suas dimensões e formato (PNG / JPEG)
 */
interface LoadedImageInfo {
  dataUrl: string
  format: 'PNG' | 'JPEG' | 'WEBP'
  aspectRatio: number // width / height
}

async function loadImageDataUrl(url: string): Promise<LoadedImageInfo | null> {
  if (!url || typeof window === 'undefined') return null
  try {
    // 1. Tentar primeiro fetch com timeout rápido (2,5s) para pegar Blob diretamente e evitar problemas de canvas tainted por CORS
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const fetchTimer = controller ? setTimeout(() => controller.abort(), 2500) : null

    try {
      const res = await fetch(url, { signal: controller?.signal })
      if (fetchTimer) clearTimeout(fetchTimer)
      if (res.ok) {
        const blob = await res.blob()
        const mimeType = blob.type.toLowerCase()
        let format: 'PNG' | 'JPEG' | 'WEBP' = 'PNG'
        if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
          format = 'JPEG'
        } else if (mimeType.includes('webp')) {
          format = 'WEBP'
        }

        const dataUrl = await new Promise<string | null>((resolve) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result as string)
          reader.onerror = () => resolve(null)
          reader.readAsDataURL(blob)
        })

        if (dataUrl) {
          const aspectRatio = await new Promise<number>((resolve) => {
            const probeImg = new window.Image()
            const timer = setTimeout(() => resolve(1.4), 1500)
            probeImg.onload = () => {
              clearTimeout(timer)
              if (probeImg.naturalWidth && probeImg.naturalHeight) {
                resolve(probeImg.naturalWidth / probeImg.naturalHeight)
              } else {
                resolve(1.4)
              }
            }
            probeImg.onerror = () => {
              clearTimeout(timer)
              resolve(1.4)
            }
            probeImg.src = dataUrl
          })

          return { dataUrl, format, aspectRatio }
        }
      }
    } catch (fetchErr) {
      if (fetchTimer) clearTimeout(fetchTimer)
      console.warn('Fetch do logo falhou ou deu timeout, tentando via Image():', fetchErr)
    }

    // 2. Fallback: carregar imagem em HTMLImageElement com timeout
    const img = new window.Image()
    img.crossOrigin = 'anonymous'

    const loaded = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        img.onload = null
        img.onerror = null
        resolve(false)
      }, 2000)

      img.onload = () => {
        clearTimeout(timer)
        resolve(true)
      }
      img.onerror = () => {
        clearTimeout(timer)
        resolve(false)
      }
      img.src = url
    })

    if (loaded && img.naturalWidth && img.naturalHeight) {
      const naturalWidth = img.naturalWidth
      const naturalHeight = img.naturalHeight
      const aspectRatio = naturalWidth / naturalHeight

      try {
        const canvas = document.createElement('canvas')
        canvas.width = naturalWidth
        canvas.height = naturalHeight
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0)
          const pngDataUrl = canvas.toDataURL('image/png')
          if (pngDataUrl && pngDataUrl.startsWith('data:image/png')) {
            return {
              dataUrl: pngDataUrl,
              format: 'PNG',
              aspectRatio: aspectRatio > 0 ? aspectRatio : 1.4,
            }
          }
        }
      } catch (canvasErr) {
        console.warn('Canvas toDataURL falhou:', canvasErr)
      }
    }

    return null
  } catch (err) {
    console.warn('Falha ao carregar logotipo para o PDF (prosseguindo sem logo):', err)
    return null
  }
}

/**
 * Constrói o documento oficial jsPDF de Termo de Recebimento (modelo A4 de 1 página)
 */
/**
 * Renderiza uma página completa de Atesto no jsPDF fornecido
 */
export async function renderAtestoPageToDoc(
  doc: jsPDF,
  data: AtestoDocumentData,
  preloadedLogo?: LoadedImageInfo | null,
): Promise<void> {
  const pageWidth = doc.internal.pageSize.getWidth() // 210mm
  const marginX = 20
  const contentWidth = pageWidth - marginX * 2 // 170mm

  const itemCount = data.items.length
  const isDense = itemCount > 12 // Condensação progressiva para caber até 20 produtos em 1 página

  // 1. CABEÇALHO COM LOGOTIPO OU SÍMBOLO
  let startY = isDense ? 10 : 13

  let imgInfo = preloadedLogo !== undefined ? preloadedLogo : null
  if (imgInfo === null && data.logoUrl && preloadedLogo === undefined) {
    try {
      imgInfo = await loadImageDataUrl(data.logoUrl)
    } catch {
      imgInfo = null
    }
  }

  if (imgInfo) {
    try {
      const maxW = isDense ? 38 : 44
      const maxH = isDense ? 16 : 20
      let imgWidth = maxW
      let imgHeight = imgWidth / imgInfo.aspectRatio

      if (imgHeight > maxH) {
        imgHeight = maxH
        imgWidth = imgHeight * imgInfo.aspectRatio
      }

      doc.addImage(
        imgInfo.dataUrl,
        imgInfo.format,
        (pageWidth - imgWidth) / 2,
        startY,
        imgWidth,
        imgHeight,
        undefined,
        'FAST',
      )
      startY += imgHeight + (isDense ? 2 : 3)
    } catch (e) {
      console.warn('Não foi possível embutir o logotipo na página do PDF:', e)
      data.onLogoError?.(e)
    }
  } else if (data.logoUrl && preloadedLogo === null) {
    data.onLogoError?.(new Error('Logotipo inacessível ou formato inválido'))
  }

  // Nome da Cooperativa em destaque no topo
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(isDense ? 10 : 11)
  doc.setTextColor(30, 41, 59)
  const coopLabel = (data.nomeCooperativa || 'CooperGestão').toUpperCase()
  doc.text(coopLabel, pageWidth / 2, startY, { align: 'center' })
  startY += isDense ? 4.5 : 5.5

  // Título do documento oficial
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(isDense ? 9.5 : 10.5)
  doc.setTextColor(15, 23, 42)
  const chamadaNum = data.numeroChamada?.trim() || 'Nº'
  const docTitle = `TERMO DE RECEBIMENTO DE AQUISIÇÃO DE GÊNEROS ALIMENTÍCIOS REFERENTE À CHAMADA PÚBLICA - N° ${chamadaNum}`

  const splitTitle = doc.splitTextToSize(docTitle, contentWidth)
  doc.text(splitTitle, pageWidth / 2, startY, { align: 'center' })
  startY += splitTitle.length * (isDense ? 4.2 : 5) + (isDense ? 1.5 : 2.5)

  // Linha sutil separadora do cabeçalho (número do atesto não é exibido no documento impresso)
  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.3)
  doc.line(marginX, startY, pageWidth - marginX, startY)
  startY += isDense ? 4.5 : 6

  // 2. PARÁGRAFO DE ATESTO
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(isDense ? 9 : 10)
  doc.setTextColor(30, 41, 59)

  const nomeEscola = data.nomeEscola || 'Unidade Escolar'
  const nomeCoop = data.nomeCooperativa || 'Cooperativa'
  const atestoParagraph = `Atesto que a ${nomeEscola} recebeu os produtos listados abaixo da ${nomeCoop}.`

  const splitAtesto = doc.splitTextToSize(atestoParagraph, contentWidth)
  doc.text(splitAtesto, marginX, startY)
  startY += splitAtesto.length * (isDense ? 4 : 4.8) + (isDense ? 2.5 : 4)

  // 3. TABELA DE PRODUTOS
  // Centralizada na página com proporções fiéis ao modelo oficial
  const totalQuantidade = data.items.reduce((sum, item) => sum + (Number(item.quantidade) || 0), 0)

  // Definir dimensões da tabela para centralização perfeita
  const tableWidth = 140 // mm
  const tableMarginLeft = (pageWidth - tableWidth) / 2 // 35mm cada lado para 210mm total
  const col1Width = 92 // PRODUTOS
  const col2Width = 48 // QUANTIDADE (KG)

  // Calcular preenchimento dinâmico para comportar confortavelmente 20 produtos em 1 página
  let cellPaddingY = 2.4
  let tableFontSize = 8.5
  if (itemCount > 15) {
    cellPaddingY = 1.3
    tableFontSize = 7.5
  } else if (itemCount > 10) {
    cellPaddingY = 1.8
    tableFontSize = 8
  }

  const head = [['PRODUTOS', 'QUANTIDADE (KG)']]
  const body = data.items.map((item) => [
    item.nome.toUpperCase(),
    formatQuantityBR(item.quantidade),
  ])

  // Se houver poucos itens (menos de 6), adiciona linhas tracejadas conforme o modelo oficial
  if (itemCount < 6) {
    const emptyRowsNeeded = Math.min(2, 6 - itemCount)
    for (let i = 0; i < emptyRowsNeeded; i++) {
      body.push(['-----', '-----'])
    }
  }

  const foot = [['Total de itens', formatQuantityBR(totalQuantidade)]]

  runAutoTable(doc, {
    startY: startY,
    tableWidth: tableWidth,
    head: head,
    body: body,
    foot: foot,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: tableFontSize,
      cellPadding: { top: cellPaddingY, bottom: cellPaddingY, left: 2.5, right: 2.5 },
      textColor: [30, 41, 59],
      lineColor: [15, 23, 42],
      lineWidth: 0.25,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [245, 247, 250],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      halign: 'center',
      lineWidth: 0.25,
      lineColor: [15, 23, 42],
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: col1Width },
      1: { halign: 'center', cellWidth: col2Width, fontStyle: 'bold' },
    },
    footStyles: {
      fillColor: [255, 255, 255],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      halign: 'center',
      lineWidth: 0.3,
      lineColor: [15, 23, 42],
    },
    didParseCell: (hookData: any) => {
      // Garantir que a coluna 0 do rodapé fique alinhada à esquerda e a coluna 1 rigorosamente centralizada
      if (hookData.section === 'foot') {
        if (hookData.column.index === 0) {
          hookData.cell.styles.halign = 'left'
        } else if (hookData.column.index === 1) {
          hookData.cell.styles.halign = 'center'
        }
      }
    },
    willDrawCell: (hookData: any) => {
      // Reforço explícito antes da renderização da célula no PDF
      if (hookData.section === 'foot') {
        if (hookData.column.index === 0) {
          hookData.cell.styles.halign = 'left'
        } else if (hookData.column.index === 1) {
          hookData.cell.styles.halign = 'center'
        }
      }
    },
    margin: { left: tableMarginLeft, right: tableMarginLeft },
  })

  // Coordenada Y após a tabela
  const finalY = (doc as any).lastAutoTable?.finalY || startY + 40
  let textY = finalY + (isDense ? 4 : 7)

  // 4. TEXTO DE DECLARAÇÃO
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(isDense ? 8 : 9)
  doc.setTextColor(30, 41, 59)

  const declaracao1 =
    'Nestes termos, os produtos entregues estão de acordo com o contrato assinado.'
  doc.text(declaracao1, marginX, textY)
  textY += isDense ? 4 : 5.5

  const declaracao2 =
    'Declaro ainda que os produtos estão de acordo com os padrões de qualidade aceitos por esta instituição, pelos quais concedemos a aceitabilidade, comprometendo-nos a dar a destinação final aos produtos recebidos, conforme estabelecido na aquisição da Agricultura Familiar para Alimentação Escolar.'

  const splitDecl2 = doc.splitTextToSize(declaracao2, contentWidth)
  doc.text(splitDecl2, marginX, textY, { align: 'justify', maxWidth: contentWidth })
  textY += splitDecl2.length * (isDense ? 3.6 : 4.4) + (isDense ? 5 : 8)

  // 5. ORDEM DO BLOCO DE ASSINATURA CONFORME O MODELO OFICIAL ESPECIFICADO:
  // a) Data centralizada ("Teresópolis, 1 de janeiro de 2026.")
  const localDataStr = formatExtendDateBR(data.cidadeUf, data.dataEmissao)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(isDense ? 8.5 : 9.5)
  doc.text(localDataStr, pageWidth / 2, textY, { align: 'center' })
  textY += isDense ? 9 : 14

  // b) Logo ABAIXO da data centralizada: uma linha (traço) para assinatura SEM nenhuma identificação abaixo dela
  const sigX = pageWidth / 2
  const sigLineWidth = 120
  doc.setDrawColor(30, 41, 59)
  doc.setLineWidth(0.35)
  doc.line(sigX - sigLineWidth / 2, textY, sigX + sigLineWidth / 2, textY)
  textY += isDense ? 4 : 5.5

  // c) Logo a seguir: a linha "Matrícula ou CPF: ___________________________" com espaço em branco para preencher
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(isDense ? 8.5 : 9)
  doc.text('Matrícula ou CPF: ___________________________', sigX, textY, { align: 'center' })
  textY += isDense ? 4 : 5.5

  // d) Em seguida: identificação do conferente
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(isDense ? 8.5 : 9.5)
  doc.text('Representante da Unidade Escolar (conferente)', sigX, textY, { align: 'center' })
  textY += isDense ? 4 : 5

  // e) A ÚLTIMA linha do bloco inferior deve ser o NOME DA ESCOLA
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(isDense ? 9 : 10)
  doc.text(nomeEscola.toUpperCase(), sigX, textY, { align: 'center' })
}

/**
 * Constrói o documento oficial jsPDF de Termo de Recebimento (modelo A4 de 1 página)
 */
export async function createOfficialAtestoPdf(data: AtestoDocumentData): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  let preloadedLogo: LoadedImageInfo | null = null
  if (data.logoUrl) {
    preloadedLogo = await loadImageDataUrl(data.logoUrl)
  }

  await renderAtestoPageToDoc(doc, data, preloadedLogo)
  return doc
}

/**
 * Constrói um único PDF contendo múltiplos Termos de Recebimento, um por página,
 * preservando exatamente o layout oficial.
 */
export async function createBatchAtestosPdf(documents: AtestoDocumentData[]): Promise<jsPDF> {
  if (documents.length === 0) {
    throw new Error('Nenhum atesto fornecido para geração do lote.')
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  // Pré-carregar logotipo apenas uma vez para o lote inteiro
  const firstLogoUrl = documents.find((d) => d.logoUrl)?.logoUrl
  let preloadedLogo: LoadedImageInfo | null = null
  if (firstLogoUrl) {
    try {
      preloadedLogo = await loadImageDataUrl(firstLogoUrl)
    } catch {
      preloadedLogo = null
    }
  }

  for (let i = 0; i < documents.length; i++) {
    if (i > 0) {
      doc.addPage('a4', 'portrait')
    }
    await renderAtestoPageToDoc(doc, documents[i], preloadedLogo)
  }

  return doc
}

/**
 * Abre um documento jsPDF diretamente na janela de impressão do navegador ou abre uma aba com o Blob
 */
export function openPdfForPrint(doc: jsPDF): void {
  const blob = doc.output('blob')
  const blobUrl = window.URL.createObjectURL(blob)

  // Tenta abrir em iframe oculto para window.print() direto
  try {
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.src = blobUrl

    iframe.onload = () => {
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus()
          iframe.contentWindow?.print()
        } catch (e) {
          console.warn('Impressão direta via iframe falhou, abrindo em nova aba:', e)
          window.open(blobUrl, '_blank')
        }
      }, 500)
    }

    document.body.appendChild(iframe)

    // Limpeza após 3 minutos
    setTimeout(() => {
      try {
        document.body.removeChild(iframe)
        window.URL.revokeObjectURL(blobUrl)
      } catch {
        // ignore
      }
    }, 180000)
  } catch (err) {
    console.warn('Erro ao configurar iframe de impressão:', err)
    window.open(blobUrl, '_blank')
  }
}

/**
 * Gera o arquivo PDF e o retorna como Blob para salvar no backend
 */
export async function generateAtestoBlob(data: AtestoDocumentData): Promise<Blob> {
  const doc = await createOfficialAtestoPdf(data)
  return doc.output('blob')
}

/**
 * Gera e dispara o download imediato no navegador
 */
export async function downloadAtestoPdf(
  data: AtestoDocumentData,
  filename?: string,
): Promise<void> {
  let doc: jsPDF
  try {
    doc = await createOfficialAtestoPdf(data)
  } catch (err) {
    console.warn('Falha na criação do PDF com logotipo, gerando versão sem logotipo:', err)
    // Fallback garantido sem logo caso ocorra algum problema de renderização
    doc = await createOfficialAtestoPdf({ ...data, logoUrl: undefined })
  }

  const rawName = filename || `Termo_Recebimento_${data.numeroAtesto || 'Atesto'}.pdf`
  const sanitizedName = rawName.replace(/[/\\?%*:|"<>]/g, '_')
  const finalFilename = sanitizedName.endsWith('.pdf') ? sanitizedName : `${sanitizedName}.pdf`

  try {
    doc.save(finalFilename)
  } catch (saveErr) {
    console.warn('doc.save() falhou, tentando fallback via Blob URL:', saveErr)
    const blob = doc.output('blob')
    const blobUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = finalFilename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000)
  }
}
