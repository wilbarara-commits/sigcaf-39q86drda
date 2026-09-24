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

export interface BuildWhatsAppUrlOptions {
  phone?: string
  text: string
}

/**
 * Gera o link direto do WhatsApp (wa.me com telefone ou api.whatsapp.com/send com texto genérico).
 */
export function buildWhatsAppUrl({ phone, text }: BuildWhatsAppUrlOptions): string {
  const cleanPhone = (phone || '').replace(/\D/g, '')
  const phoneToUse = cleanPhone.length >= 10 ? `55${cleanPhone}` : ''
  const encoded = encodeURIComponent(text)

  if (phoneToUse) {
    return `https://wa.me/${phoneToUse}?text=${encoded}`
  }
  return `https://api.whatsapp.com/send?text=${encoded}`
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
