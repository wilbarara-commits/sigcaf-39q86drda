import type { MotoristaPortalData } from '@/services/rota-despachos'

export interface FilaEntregaItem {
  client_uid: string
  rota_id: string
  escola_id: string
  motorista_id?: string
  despacho_id?: string
  chegada_em?: string
  confirmado_em: string
  assinatura?: string
  observacao?: string
  foto?: string // dataURL (base64) compactada para resiliência offline
  status_sync: 'pendente' | 'sincronizado' | 'erro'
  tentativas: number
  criado_em: string
  ultimo_erro?: string
}

const STORAGE_KEY_PREFIX = 'sigcaf_motorista_fila_'
const CACHE_KEY_PREFIX = 'sigcaf_motorista_cache_'

export function getStorageQueueKey(token: string): string {
  return `${STORAGE_KEY_PREFIX}${token}`
}

export function getStorageCacheKey(token: string): string {
  return `${CACHE_KEY_PREFIX}${token}`
}

/**
 * Lê a fila local de entregas de um token
 */
export function lerFilaLocal(
  token: string,
  storage: Storage = window.localStorage,
): FilaEntregaItem[] {
  try {
    const raw = storage.getItem(getStorageQueueKey(token))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    console.error('Erro ao ler fila local:', e)
    return []
  }
}

/**
 * Salva a fila local inteira de um token
 */
export function salvarFilaLocal(
  token: string,
  fila: FilaEntregaItem[],
  storage: Storage = window.localStorage,
): void {
  try {
    storage.setItem(getStorageQueueKey(token), JSON.stringify(fila))
  } catch (e) {
    console.error('Erro ao salvar fila local:', e)
  }
}

/**
 * Enfileira um novo registro de entrega (idempotente por client_uid ou rota+escola)
 * Preserva estritamente a ordem cronológica de confirmação (FIFO).
 */
export function enfileirarEntrega(
  token: string,
  novoItem: Omit<FilaEntregaItem, 'tentativas' | 'status_sync' | 'criado_em'> & {
    tentativas?: number
    status_sync?: 'pendente' | 'sincronizado' | 'erro'
    criado_em?: string
  },
  storage: Storage = window.localStorage,
): FilaEntregaItem[] {
  const filaAtual = lerFilaLocal(token, storage)
  const itemCompleto: FilaEntregaItem = {
    ...novoItem,
    status_sync: novoItem.status_sync || 'pendente',
    tentativas: novoItem.tentativas || 0,
    criado_em: novoItem.criado_em || new Date().toISOString(),
  }

  // Se já existir item com mesmo client_uid ou mesma escola na fila pendente, substitui
  const index = filaAtual.findIndex(
    (it) =>
      it.client_uid === itemCompleto.client_uid ||
      (it.escola_id === itemCompleto.escola_id && it.rota_id === itemCompleto.rota_id),
  )

  let novaFila: FilaEntregaItem[]
  if (index >= 0) {
    novaFila = [...filaAtual]
    novaFila[index] = itemCompleto
  } else {
    novaFila = [...filaAtual, itemCompleto]
  }

  salvarFilaLocal(token, novaFila, storage)
  return novaFila
}

/**
 * Salva cache dos dados do portal da rota para uso sem sinal
 */
export function salvarCachePortal(
  token: string,
  data: MotoristaPortalData,
  storage: Storage = window.localStorage,
): void {
  try {
    storage.setItem(getStorageCacheKey(token), JSON.stringify(data))
  } catch (e) {
    console.error('Erro ao salvar cache do portal:', e)
  }
}

/**
 * Lê cache do portal se estiver offline
 */
export function lerCachePortal(
  token: string,
  storage: Storage = window.localStorage,
): MotoristaPortalData | null {
  try {
    const raw = storage.getItem(getStorageCacheKey(token))
    if (!raw) return null
    return JSON.parse(raw) as MotoristaPortalData
  } catch {
    return null
  }
}

export interface ResultadoSincronizacao {
  processados: number
  sucessos: number
  falhas: number
  filaRestante: FilaEntregaItem[]
}

/**
 * Sincroniza a fila pendente enviando item a item na ordem (FIFO)
 * Idempotente: ao ter sucesso marca como 'sincronizado' ou remove.
 */
export async function sincronizarFilaEntregas(
  token: string,
  enviador: (item: FilaEntregaItem) => Promise<any>,
  storage: Storage = window.localStorage,
): Promise<ResultadoSincronizacao> {
  const fila = lerFilaLocal(token, storage)
  const pendentes = fila.filter((item) => item.status_sync === 'pendente')

  if (pendentes.length === 0) {
    return {
      processados: 0,
      sucessos: 0,
      falhas: 0,
      filaRestante: fila,
    }
  }

  let sucessos = 0
  let falhas = 0
  const novaFila = [...fila]

  for (const item of pendentes) {
    const idx = novaFila.findIndex((it) => it.client_uid === item.client_uid)
    if (idx === -1) continue

    try {
      await enviador(item)
      sucessos++
      novaFila[idx] = {
        ...novaFila[idx],
        status_sync: 'sincronizado',
        tentativas: (novaFila[idx].tentativas || 0) + 1,
        ultimo_erro: undefined,
      }
    } catch (err: any) {
      falhas++
      novaFila[idx] = {
        ...novaFila[idx],
        status_sync: 'erro',
        tentativas: (novaFila[idx].tentativas || 0) + 1,
        ultimo_erro: err?.message || 'Falha na conexão',
      }
      // Se deu erro de rede, interrompe o loop para preservar a ordem
      break
    }
  }

  salvarFilaLocal(token, novaFila, storage)

  return {
    processados: sucessos + falhas,
    sucessos,
    falhas,
    filaRestante: novaFila,
  }
}
