export type DisponibilidadeProduto = 'normal' | 'abundante' | 'escassez' | 'indisponivel'

export interface ProdutoRecord {
  id: string
  nome: string
  unidade: string
  disponibilidade?: DisponibilidadeProduto | 'abundancia'
  categoria?: string
  estoque?: number
  preco_unitario?: number
  created?: string
  updated?: string
}

export type EscolaTipo = 'CMEI' | 'CRECHE' | 'INTEGRAL' | 'FUNDAMENTAL' | 'Médio' | 'Técnico'

export interface EscolaRecord {
  id: string
  nome: string
  endereco: string
  telefone: string
  rota?: string
  email?: string
  tipo?: EscolaTipo | string
  alunos?: number
  bairro?: string
  contato?: string
  created?: string
  updated?: string
}

export type CicloStatus =
  | 'coletando'
  | 'correcao'
  | 'coleta_encerrada'
  | 'coletado'
  | 'fechado'
  | 'cancelado'
  | string

export interface CicloContratoRecord {
  id: string
  ciclo_id: string
  contrato_id: string
  fase: CicloStatus
  motivo_cancelamento?: string
  data_cancelamento?: string
  expand?: {
    ciclo_id?: CicloRecord
    contrato_id?: ContratoRecord
  }
  created?: string
  updated?: string
}

export interface CicloRecord {
  id: string
  nome: string
  data_inicio: string
  data_fim: string
  status?: CicloStatus
  snapshot?: any
  motivo_cancelamento?: string
  data_cancelamento?: string
  created?: string
  updated?: string
}

export interface RotaRecord {
  id: string
  contrato_id: string
  nome: string
  ordem?: number
  ativa?: boolean
  created?: string
  updated?: string
}

// Alias de retrocompatibilidade durante a transição
export type RotaLogisticaRecord = RotaRecord

export interface ParadaRotaRecord {
  id: string
  rota_id: string
  escola_id: string
  ordem: number
  expand?: {
    escola_id?: EscolaRecord
    rota_id?: RotaRecord
  }
  created?: string
  updated?: string
}

export interface DespachoRecord {
  id: string
  contrato_id: string
  ciclo_id?: string
  rota_id: string
  data_despacho: string
  usuario_id?: string
  status: 'Em Rota' | 'Entregue' | 'Cancelado'
  expand?: {
    contrato_id?: ContratoRecord
    ciclo_id?: CicloRecord
    rota_id?: RotaRecord
    usuario_id?: UserRecord
  }
  created?: string
  updated?: string
}

export const MOTIVOS_LOGISTICOS_CANCELAMENTO = [
  'Veículo indisponível',
  'Produto indisponível',
  'Endereço inacessível',
  'Escola fechada',
  'Outro motivo logístico',
] as const

export type MotivoLogisticoCancelamento = (typeof MOTIVOS_LOGISTICOS_CANCELAMENTO)[number]

export type ContratoTipoImportacao = 'unica' | 'fracionada'

export interface ContratoRecord {
  id: string
  numero: string
  numero_chamada?: string
  tipo?: string
  modalidade_pedido?: 'individualizado' | 'centralizado'
  tipo_importacao?: ContratoTipoImportacao
  abas_planilha?: string
  num_rotas_logisticas?: number
  valor_total: number
  status: 'Ativo' | 'Encerrado' | 'Cancelado' | 'Pendente'
  encerrado_em?: string
  motivo_cancelamento?: string
  created?: string
  updated?: string
}

export interface ContratoEscolaRecord {
  id: string
  contrato_id: string
  escola_id: string
  rota_id?: string
  coleta_por?: 'padrao' | 'formulario' | 'planilha' | string
  encerrado_em?: string
  expand?: {
    escola_id?: EscolaRecord
    rota_id?: RotaRecord
    contrato_id?: ContratoRecord
  }
  created?: string
  updated?: string
}

export interface ContratoItemRecord {
  id: string
  contrato_id: string
  produto_id: string
  preco: number
  quantidade_contratada?: number
  nome_contrato?: string
  apelidos?: string
  expand?: {
    produto_id?: ProdutoRecord
  }
  created?: string
  updated?: string
}

export interface PedidoValidacao {
  status: 'validado' | 'em_progresso' | 'invalido'
  motivo?: string
  detalhes?: string[]
}

export interface PedidoRecord {
  id: string
  numero: string
  escola_id: string
  ciclo_id?: string
  origem?: 'excel' | 'whatsapp' | 'manual' | 'formulario'
  rota_id?: string
  validacao?: PedidoValidacao
  data_prevista: string
  status: 'Pendente' | 'Em Rota' | 'Entregue' | 'Cancelado'
  entregue_em?: string
  entregue_por?: string
  motivo_cancelamento?: string
  cancelado_em?: string
  expand?: {
    escola_id?: EscolaRecord
    ciclo_id?: CicloRecord
    rota_id?: RotaRecord
    entregue_por?: UserRecord
  }
  created?: string
  updated?: string
}

export interface PedidoItemRecord {
  id: string
  pedido_id: string
  produto_id: string
  quantidade: number
  preco_unitario: number
  expand?: {
    produto_id?: ProdutoRecord
  }
  created?: string
  updated?: string
}

export interface AtestoRecord {
  id: string
  numero: string
  pedido_id: string
  data_emissao: string
  status: 'Pendente Assinatura' | 'Confirmado' | 'Arquivado'
  assinatura_file?: string
  arquivo?: string
  expand?: {
    pedido_id?: PedidoRecord & {
      expand?: {
        escola_id?: EscolaRecord
        rota_id?: RotaRecord
      }
    }
  }
  created?: string
  updated?: string
}

export interface EnvioWhatsappRecord {
  id: string
  ciclo_id: string
  escola_id: string
  status: 'pendente' | 'enviado' | 'falha'
  enviado_em?: string
  expand?: {
    escola_id?: EscolaRecord
    ciclo_id?: CicloRecord
  }
  created?: string
  updated?: string
}

export interface ImportacaoRecord {
  id: string
  ciclo_id: string
  contrato_id: string
  arquivo: string
  data: string
  usuario_id?: string
  linhas_total?: number
  linhas_ok?: number
  linhas_erro?: number
  erros?: any
  expand?: {
    ciclo_id?: CicloRecord
    contrato_id?: ContratoRecord
    usuario_id?: UserRecord
  }
  created?: string
  updated?: string
}

// UI Models
export interface Product {
  id: string
  name: string
  unit: string
  disponibilidade?: DisponibilidadeProduto | 'abundancia'
  category?: string
  stock?: number
  price?: number
}

export interface School {
  id: string
  name: string
  address: string
  contact: string
  route: string
  email?: string
  tipo?: EscolaTipo | string
  alunos?: number
  bairro?: string
  contatoResponsavel?: string
}

export interface ContractSchoolLink {
  id: string
  contratoId: string
  escolaId: string
  rotaId?: string
  rotaNome?: string
  coleta_por?: 'padrao' | 'formulario' | 'planilha' | string
  encerrado_em?: string
  // Campos de compatibilidade para transição suave
  rotaPlanilha?: string
  rotaLogisticaId?: string
  rotaLogisticaNome?: string
  escolaNome?: string
  escolaEndereco?: string
  escolaTelefone?: string
  escolaEmail?: string
  escolaBairro?: string
  escolaContato?: string
  escolaTipo?: string
  escolaAlunos?: number
}

export interface Contract {
  id: string
  numero: string
  numero_chamada?: string
  tipo?: string
  modalidade_pedido: 'individualizado' | 'centralizado'
  tipo_importacao?: ContratoTipoImportacao
  abas_planilha?: string
  num_rotas_logisticas?: number
  totalValue: number
  balance: number
  status: 'Ativo' | 'Encerrado' | 'Cancelado' | 'Pendente'
  encerrado_em?: string
  motivo_cancelamento?: string
  escolas: ContractSchoolLink[]
}

export interface OrderItem {
  id?: string
  productId: string
  name: string
  quantity: number
  price: number
}

export interface Order {
  id: string
  numero: string
  schoolId: string
  schoolName: string
  schoolAlunos?: number
  cicloId?: string
  origem: 'excel' | 'whatsapp' | 'manual' | 'formulario'
  rotaId?: string
  rotaNome?: string
  rotaLogisticaId?: string
  rotaLogisticaNome?: string
  validacao: PedidoValidacao
  date: string
  status: 'Pendente' | 'Em Rota' | 'Entregue' | 'Cancelado'
  entregue_em?: string
  entregue_por?: string
  entreguePorNome?: string
  motivo_cancelamento?: string
  cancelado_em?: string
  total: number
  items: OrderItem[]
}

export interface Atesto {
  id: string
  numero: string
  orderId: string
  orderNumber: string
  schoolName: string
  date: string
  status: 'Pendente Assinatura' | 'Confirmado' | 'Arquivado'
  signatureFile?: string
  arquivo?: string
}

export type UserPerfil = 'MASTER' | 'ADMINISTRADOR' | 'SECRETARIA' | 'administrador' | 'secretaria'

export interface UserRecord {
  id: string
  email: string
  nome?: string
  name?: string
  celular?: string
  foto?: string
  avatar?: string
  perfil: UserPerfil
  ativo?: boolean
  created?: string
  updated?: string
}

export interface TokenFormularioRecord {
  id: string
  escola_id: string
  contrato_id: string
  ciclo_id: string
  token: string
  ativo: boolean
  criado_em?: string
  expira_em?: string
  expand?: {
    escola_id?: EscolaRecord
    contrato_id?: ContratoRecord
    ciclo_id?: CicloRecord
  }
  created?: string
  updated?: string
}

export interface ConfiguracoesRecord {
  id: string
  nome_cooperativa: string
  sigla?: string
  subtitulo_sistema?: string
  cnpj?: string
  telefone?: string
  email?: string
  cidade_uf?: string
  exibir_atalhos_demo?: boolean
  logotipo?: string
  created?: string
  updated?: string
}
