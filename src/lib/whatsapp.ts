import { toast } from 'sonner'

/**
 * Detecta se o ambiente atual é de preview/demonstração com base no hostname.
 * Utiliza verificação dinâmica do hostname em tempo de execução para funcionar
 * perfeitamente no mesmo build tanto em produção quanto em preview.
 */
export function isPreviewEnvironment(): boolean {
  if (typeof window === 'undefined' || !window.location) return false
  const hostname = window.location.hostname.toLowerCase()
  return hostname.includes('preview')
}

/**
 * Normaliza número de telefone para WhatsApp:
 * - Remove caracteres não numéricos
 * - Garante DDI 55 do Brasil caso não esteja presente
 * - Evita duplicar DDI quando já houver 55 no início
 */
export function normalizeWhatsAppPhone(phone?: string): string {
  if (!phone) return ''
  const clean = phone.replace(/\D/g, '')
  if (!clean) return ''

  // Se já tiver 12 ou 13 dígitos e começar com 55 (ex: 5521987654321 ou 552127421234), mantém
  if ((clean.length === 12 || clean.length === 13) && clean.startsWith('55')) {
    return clean
  }

  // Se tiver 10 ou 11 dígitos (DDD 2 dígitos + número de 8 ou 9 dígitos), adiciona DDI 55
  if (clean.length === 10 || clean.length === 11) {
    return `55${clean}`
  }

  // Se tiver 12 ou mais dígitos e já começar com 55, mantém
  if (clean.length >= 12 && clean.startsWith('55')) {
    return clean
  }

  // Se tiver pelo menos 10 dígitos sem 55, adiciona 55
  if (clean.length >= 10) {
    return `55${clean}`
  }

  return ''
}

export interface BuildWhatsAppUrlOptions {
  phone?: string
  text: string
}

/**
 * Gera o link direto do WhatsApp (wa.me com telefone ou api.whatsapp.com/send com texto genérico).
 */
export function buildWhatsAppUrl({ phone, text }: BuildWhatsAppUrlOptions): string {
  const phoneToUse = normalizeWhatsAppPhone(phone)
  const encoded = encodeURIComponent(text)

  if (phoneToUse) {
    return `https://wa.me/${phoneToUse}?text=${encoded}`
  }
  return `https://api.whatsapp.com/send?text=${encoded}`
}

export interface ProtocoloItemMessage {
  nome: string
  quantidade: number | string
  unidade?: string
}

export interface ProtocoloWhatsAppMessageOptions {
  schoolName: string
  protocolo: string
  cicloNome?: string
  dataEntrega?: string
  itens?: ProtocoloItemMessage[]
  totalValor?: number
}

/**
 * Gera a mensagem textual cordial e completa para envio do protocolo do pedido à escola,
 * incluindo previsão de entrega e a lista detalhada de itens com quantidades.
 */
export function buildProtocoloWhatsAppMessage({
  schoolName,
  protocolo,
  cicloNome,
  dataEntrega,
  itens,
  totalValor,
}: ProtocoloWhatsAppMessageOptions): string {
  const cicloRef = cicloNome ? ` referente ao *${cicloNome}*` : ''
  const entregaRef = dataEntrega ? `\n📅 *Previsão de Entrega:* ${dataEntrega}` : ''

  let itensBloco = ''
  if (itens && itens.length > 0) {
    const linhasItens = itens.map((it) => {
      const qtdFmt =
        typeof it.quantidade === 'number'
          ? it.quantidade.toLocaleString('pt-BR', {
              minimumFractionDigits: Number.isInteger(it.quantidade) ? 0 : 1,
              maximumFractionDigits: 2,
            })
          : String(it.quantidade).replace('.', ',')
      const unStr = it.unidade ? ` ${it.unidade}` : ''
      return `• ${it.nome}: *${qtdFmt}${unStr}*`
    })

    itensBloco = `\n\n📦 *Itens do Pedido (${itens.length}):*\n${linhasItens.join('\n')}`
  }

  const totalBloco =
    typeof totalValor === 'number' && totalValor > 0
      ? `\n💰 *Valor Total:* R$ ${totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : ''

  return `Olá, equipe da *${schoolName}*! Tudo bem? Aqui é da Cooperativa.

Informamos que o pedido da sua instituição${cicloRef} foi registrado com sucesso em nosso sistema!

📋 *Protocolo do Pedido:* *${protocolo}*${entregaRef}${itensBloco}${totalBloco}

📌 *Lembrete:* Este protocolo é o comprovante do registro do seu pedido. Nossa equipe já está trabalhando na organização e roteirização da entrega.

Qualquer dúvida, estamos à disposição!`
}

/**
 * Constrói o texto do protocolo no formato de imagem/comprovante textual completo
 * para cópia direta para a área de transferência no formulário público.
 */
export function buildComprovanteProtocoloTexto({
  schoolName,
  protocolo,
  cicloNome,
  dataEntrega,
  itens,
}: {
  schoolName: string
  protocolo: string
  cicloNome?: string
  dataEntrega?: string
  itens?: ProtocoloItemMessage[]
}): string {
  const linhas: string[] = []
  linhas.push('═══════════════════════════════════════')
  linhas.push('         COMPROVANTE DE PEDIDO         ')
  linhas.push('═══════════════════════════════════════')
  linhas.push(`📋 PROTOCOLO: ${protocolo}`)
  linhas.push(`🏫 ESCOLA: ${schoolName}`)
  if (cicloNome) {
    linhas.push(`🔄 CICLO: ${cicloNome}`)
  }
  if (dataEntrega) {
    linhas.push(`📅 PREVISÃO DE ENTREGA: ${dataEntrega}`)
  }
  linhas.push('───────────────────────────────────────')
  linhas.push('ITENS SOLICITADOS:')
  if (itens && itens.length > 0) {
    itens.forEach((it) => {
      const qtdFmt =
        typeof it.quantidade === 'number'
          ? it.quantidade.toLocaleString('pt-BR', {
              minimumFractionDigits: Number.isInteger(it.quantidade) ? 0 : 1,
              maximumFractionDigits: 2,
            })
          : String(it.quantidade).replace('.', ',')
      const unStr = it.unidade ? ` ${it.unidade}` : ''
      linhas.push(` • ${it.nome}: ${qtdFmt}${unStr}`)
    })
  } else {
    linhas.push(' • Nenhum item listado')
  }
  linhas.push('═══════════════════════════════════════')
  linhas.push('Guarde este comprovante para conferência.')

  return linhas.join('\n')
}

export interface SafeOpenWhatsAppOptions {
  phone?: string
  text: string
  /**
   * Nome do destinatário/escola para contextualizar a notificação (opcional).
   */
  recipientName?: string
  /**
   * Callback invocado quando o disparo ou a cópia é concluído com sucesso.
   */
  onSuccess?: () => void
}

/**
 * Tenta copiar texto para a área de transferência de forma resiliente.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Falha silenciosa de permissão ou ambiente restrito
  }

  // Fallback legada usando textarea escondido
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.top = '-9999px'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const successful = document.execCommand('copy')
    document.body.removeChild(textarea)
    return successful
  } catch {
    return false
  }
}

/**
 * Dispara envio de WhatsApp com proteção para o ambiente de preview.
 *
 * Em preview:
 * - Bloqueia a navegação externa que seria recusada pelo navegador com ERR_BLOCKED_BY_RESPONSE.
 * - Copia o link do WhatsApp (ou o texto) para a área de transferência para testes.
 * - Exibe toast informativo orientando o usuário.
 *
 * Em produção:
 * - Abre a URL do WhatsApp via window.open em nova aba.
 */
export async function safeOpenWhatsApp({
  phone,
  text,
  recipientName,
  onSuccess,
}: SafeOpenWhatsAppOptions): Promise<{ opened: boolean; preview: boolean }> {
  const url = buildWhatsAppUrl({ phone, text })
  const isPreview = isPreviewEnvironment()

  if (isPreview) {
    const copied = await copyToClipboard(url)
    const destinatario = recipientName ? ` (${recipientName})` : ''

    if (copied) {
      toast.info(
        `Envio por WhatsApp indisponível no ambiente de demonstração — o link foi copiado para a área de transferência${destinatario}.`,
        { duration: 5000 },
      )
    } else {
      toast.info(`Envio por WhatsApp indisponível no ambiente de demonstração${destinatario}.`, {
        duration: 5000,
      })
    }

    onSuccess?.()
    return { opened: false, preview: true }
  }

  window.open(url, '_blank')
  onSuccess?.()
  return { opened: true, preview: false }
}
