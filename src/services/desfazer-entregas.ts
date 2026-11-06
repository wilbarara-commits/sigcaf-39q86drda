import pb from '@/lib/pocketbase/client'

export interface DesfazerEntregasResumo {
  pedidos_revertidos: number
  entregas_apagadas: number
  comprovantes_apagados: number
  arquivos_apagados: number
  despachos_removidos: number
  revisoes_coordenadas_apagadas: number
}

export interface DesfazerEntregasResponse {
  success: boolean
  rota: string
  ciclo: string
  resumo: DesfazerEntregasResumo
  executado_por?: string
}

/**
 * Desfaz as entregas de uma rota em um ciclo específico (operação pontual):
 * apaga entregas/recibos (com arquivos), remove o despacho e o token do portal,
 * reverte os pedidos "Em Rota" para "Pendente" (mantendo a atribuição à rota) e
 * opcionalmente apaga as revisões de coordenadas pendentes da rota no ciclo.
 *
 * Preserva: snapshots de composição (rota_snapshots) e histórico de outros ciclos.
 * Requer autenticação (token do usuário logado é enviado automaticamente pelo pb).
 */
export async function desfazerEntregasRota(input: {
  rota_id: string
  ciclo_id: string
  apagar_revisoes_coordenadas?: boolean
}): Promise<DesfazerEntregasResponse> {
  const token = pb.authStore.token
  const res = await fetch(`${pb.baseUrl}/backend/v1/rotas-logisticas/desfazer-entregas`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
    },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    let msg = `Erro ${res.status} ao desfazer entregas`
    try {
      const data = await res.json()
      msg = data?.message || msg
    } catch {
      /* tolerante */
    }
    throw new Error(msg)
  }
  return res.json() as Promise<DesfazerEntregasResponse>
}
