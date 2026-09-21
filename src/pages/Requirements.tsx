import { useRef } from 'react'
import { Download, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

/* ----------------------------------------------------------------------------
 * DRS content
 * Centralized so the on-screen document and the generated PDF stay in sync.
 * The PDF is generated from the same data via a function that builds a plain
 * text / HTML representation, written to a Blob and opened for download.
 * ------------------------------------------------------------------------- */

interface ModuleSpec {
  id: string
  title: string
  route: string
  goal: string
  details: string[]
}

const MODULES: ModuleSpec[] = [
  {
    id: '3.1',
    title: 'Dashboard',
    route: '/ (Página Inicial)',
    goal: 'Fornecer uma visão executiva das operações.',
    details: [
      'Métricas em cards: Pedidos Pendentes, Contratos Ativos, Entregas Hoje, Receita Total do Mês.',
      'Lista de Entregas Recentes com badges de status.',
      'Ações rápidas: "Novo Pedido", "Emitir Atesto" e "Consolidação".',
    ],
  },
  {
    id: '3.2',
    title: 'Produtos & Preços',
    route: '/produtos',
    goal: 'Cadastro e manutenção do catálogo de produtos agrícolas e tabela de preços com diretrizes de safra.',
    details: [
      'Campos: id, nome, categoria, estoque, unidade, preco_unitario, disponibilidade (normal / escassez / abundancia).',
      'Disponibilidade de Safra: produtos em abundância (incentivo de colheita) e escassez (restrição e compensação na fase de correção).',
      'Edição Individual de Preços e Estoques: manutenção pontual direta por produto.',
    ],
  },
  {
    id: '3.3',
    title: 'Cadastro Mestre Global de Escolas',
    route: '/escolas',
    goal: 'Cadastro mestre único, global e independente de contratos para todas as instituições parceiras atendidas, com listagem compacta em linhas, visão detalhada e filtros operacionais por contrato e rota.',
    details: [
      'Campos Cadastrais do Mestre: O cadastro mestre mantém apenas nome, tipo (CMEI, CRECHE, INTEGRAL, FUNDAMENTAL), nº de alunos, telefone/WhatsApp, e-mail e endereço.',
      'Regra de Negócio de Rotas: A rota logística NÃO é atributo da escola no cadastro mestre. Rota (planilha) é atribuída no vínculo escola↔contrato ou importação; e a rota logística é atribuída exclusivamente na tela de Roteamento & Despacho Logístico (campo contrato_escolas.rota_logistica_id, permanecendo vazio até o roteamento).',
      'Listagem Compacta em Linhas (Tabela): Apresentação em linhas via componente Table do shadcn/ui para visualização de mais escolas por página (com paginação configurável: 10, 25, 50, 100 linhas), contendo colunas separadas: Escola/Instituição, Tipo, Aba, Rota Logística (com status de parada ou pendente de roteamento), Nº de Alunos, Telefone, Contratos Vinculados (badges) e Ações.',
      'Visão Detalhada da Escola Selecionada: Ao clicar em uma linha da tabela ou no botão "Ver detalhes", é aberto um painel/diálogo modal exibindo os dados mestres (nome, endereço completo, telefone, e-mail institucional, tipo, alunos), bloco dedicado de Rota Logística de Distribuição (com status ou posição de parada derivado do vínculo) e bloco de Contratos Vinculados & Aba da Planilha (collection contrato_escolas).',
      'Filtros Independentes por Aba da Planilha e Rota Logística: Selects dedicados para filtrar por Contrato, por Aba da Planilha e por Rota Logística (com opção explícita "Sem rota logística atribuída"), combináveis simultaneamente com a busca textual e com o filtro por Tipo de instituição, derivados dos vínculos das escolas.',
      'Importador Inteligente com Upsert (CSV/XLSX): Importação e reimportação de planilhas de escolas com atualização automática de dados existentes. Escolas já cadastradas não são ignoradas, mas marcadas no preview com status de "Atualização", exibindo comparativo de alterações campo a campo (ex.: tipo, nº de alunos, contato, endereço). O usuário conta com seletor de regra de conflito: "Atualizar campos preenchidos no arquivo (manter valores existentes quando o arquivo estiver vazio)" [padrão seguro] vs "Sobrescrever todos os campos com os valores do arquivo". Resumo final detalha separadamente criadas, atualizadas, duplicadas no arquivo e erros.',
      'Princípio de Unicidade & Integridade: Uma escola é criada uma única vez no cadastro mestre global e depois vinculada a múltiplos contratos PNAE/PAA. Prevenção de duplicidade por normalização estrita de nomes e exclusão protegida com verificação prévia de dependências contratuais e pedidos.',
    ],
  },
  {
    id: '3.4',
    title: 'Contratos, Vínculo N:N de Escolas, Quantidades Contratadas & Rotas',
    route: '/contratos',
    goal: 'Gestão institucional dos contratos PNAE/PAA, vínculo de N escolas participantes, rotas logísticas, quantidades contratadas por produto e tabela de preços acordados com valor total automático ou informado diretamente.',
    details: [
      'Modelo de Dois Níveis de Nome de Produto (Nome no Contrato vs Nome Mestre): Na collection contrato_itens, cada item possui os campos nome_contrato e apelidos (AKAs no contrato). O nome no contrato nasce pré-preenchido com o nome do produto mestre e pode ser customizado livremente para refletir a redação exata do edital/contrato assinado. A interface exibe o Nome no Contrato em destaque com campo editável e o nome mestre do catálogo atenuado quando diferente.',
      'Quantidades Contratadas por Produto & Valor Total Calculado: Cada item do contrato permite informar preço unitário e quantidade contratada (campo quantidade_contratada em contrato_itens). Quando os itens têm quantidades informadas, o Valor Total Contratado é a soma exata dos produtos (preço × quantidade contratada) e o campo total é recalculado automaticamente em tempo real.',
      'Opção sem Quantidades (Total Informado Diretamente): É permitido não preencher quantidades contratadas e informar o valor_total do contrato diretamente na aba Dados Gerais. O sistema identifica e sinaliza claramente na interface o modo em uso: "Total calculado pelos itens" ou "Total informado diretamente".',
      'Importação em Massa via Planilha / CSV: Suporte a upload de arquivo (.xlsx ou .csv) contendo Produto, Preço Unitário e Quantidade Contratada, com preview estruturado, validação estrita contra o catálogo de produtos, cálculo do total da planilha e confirmação em lote. O nome original na planilha é gravado no campo nome_contrato do item.',
      'Colar em Massa com Quantidades: Aceita colar linhas copiadas do Excel ou texto com separadores (tabulação, ponto-e-vírgula ou vírgula) nas colunas "Produto; Preço; Quantidade", com preview comparativo e resolução inteligente de nomes contra o catálogo.',
      'Execução e Cotas de Referência: O realizado do contrato continua derivado dos pedidos entregues. A quantidade contratada cadastrada no item passa a atuar como cota do produto no contrato, permitindo acompanhar o saldo e a porcentagem de execução por produto e por escola participante.',
      'Nº de Rotas Logísticas Opcional no Contrato: No modal de criação/edição de contrato, o campo "Número de Rotas Logísticas" é opcional (sem valor pré-fixado obrigatório). Caso não seja preenchido, o contrato aceita rotas logísticas ilimitadas.',
      'Aba "Escolas" do Contrato rotulada "Aba da Planilha": No vínculo da escola ao contrato, o campo de rota/aba é estritamente rotulado "Aba da Planilha", servindo de referência cadastral da secretaria. A Rota Logística NÃO é definida nesta tela.',
      'Detalhamento do Contrato com Seções Separadas: A visualização de detalhes do contrato divide explicitamente "Escolas por Aba da Planilha" (contagem e relação por aba da secretaria) e "Escolas por Rota Logística" (paradas da cooperativa e relação destacada de escolas "Sem rota logística atribuída").',
      'Vínculo de Escolas via Cadastro Mestre: Na aba de escolas do contrato, o usuário realiza busca e autocomplete sobre a collection escolas do cadastro mestre.',
      'Roteamento Estrutural por Escolas: As rotas logísticas e o sequenciamento são estruturados sobre as escolas vinculadas ao contrato (contrato_escolas), de forma duradoura entre ciclos. Pedidos não exigem atribuição manual, herdando a rota logística automaticamente da respectiva escola.',
      'Cadastro Rápido sem Duplicação: Permite cadastrar uma nova escola diretamente dentro do contrato; o sistema normaliza o nome e reutiliza o registro existente no cadastro mestre caso já haja escola correspondente.',
      'Modalidade de Pedido: individualizado (cada escola faz seu pedido via WhatsApp/manual) ou centralizado (pedidos consolidados via importação de planilha Excel da secretaria).',
      'Relatório de Execução do Contrato: cards globais de Total Contratado, Total Realizado e % Execução, com detalhamento de entregas por escola participante (quantidades realizadas, preços unitários e valores realizados).',
    ],
  },
  {
    id: '3.5',
    title: 'Gestão de Pedidos & WhatsApp',
    route: '/pedidos',
    goal: 'Registro, validação, acompanhamento de status e rastreamento de pedidos das escolas.',
    details: [
      'Campos: id, numero, escola_id, ciclo_id (FK ciclos), origem (excel / whatsapp / manual), rota_id (FK rotas - referência da planilha), rota_logistica_id (FK rotas_logisticas), validacao (json: status, motivo, detalhes), data_prevista, status (Pendente / Em Rota / Entregue / Cancelado), entregue_em, entregue_por (FK users), motivo_cancelamento, cancelado_em.',
      'Fluxo de Status do Pedido: transições controladas na listagem de pedidos (Pendente → Em Rota → Entregue, e Cancelado).',
      'Regras Estritas de Cancelamento: pedidos Pendentes (não despachados) podem ser cancelados com motivo livre; pedidos despachados (Em Rota) só podem ser cancelados por motivos logísticos da cooperativa (veículo indisponível, produto indisponível, endereço inacessível, escola fechada, outro motivo logístico com detalhe livre). O cancelamento é definitivo e irreversível (sem retorno para Pendente).',
      'Coluna e Detalhes de Cancelamento: exibição destacada do motivo do cancelamento e timestamp cancelado_em tanto na tabela de pedidos quanto no diálogo de visualização detalhada.',
      'Validação Automática do Pedido: inválido se vazio, ou se na fase de correção não compensar item em escassez com itens em abundância.',
      'Lançamento de Pedidos via WhatsApp: suporte para contratos individualizados com pré-preenchimento e atribuição ao ciclo ativo.',
      'Filtros avançados por origem, status de entrega e validação.',
    ],
  },
  {
    id: '3.6',
    title: 'Importação de Pedidos (Excel Centralizado)',
    route: '/importacao',
    goal: 'Carga de pedidos em contratos centralizados via planilha .xlsx da Secretaria de Educação.',
    details: [
      'Matching de Produtos em Cascata (Dois Níveis): A identificação do produto na planilha da secretaria prioriza em 1º lugar os itens vinculados ao contrato (nome_contrato e apelidos/AKAs do contrato, tolerante a ruídos, pontuação e sufixos); em 2º lugar recorre ao catálogo mestre global (nome e apelidos globais do produto). Se não houver correspondência em nenhum dos níveis, o item é tratado como pendência bloqueante no preview da importação.',
      'Matching contra o Cadastro Mestre Global de Escolas: A identificação das colunas é feita contra o diretório global de escolas (e não somente contra os vínculos prévios do contrato).',
      'Fluxo de Pendências Inteligente: Se a escola existe no cadastro mestre mas não está vinculada ao contrato atual, exibe a pendência "Vincular ao contrato" com rota e vínculo pré-preenchidos para confirmação com 1 clique. Se não existe no cadastro mestre, exibe a pendência "Cadastrar escola" (o importador continua sem criar registros automaticamente na surdina).',
      'Regras Estritas de Matching: Mantém regras de tolerância a acentos, maiúsculas, pontuação e apelidos entre parênteses (CEDAL, CEROM, CMEI Várzea), com tratamento comprovado dos casos "EM PAULINO CUSTÓDUIO REZENDE" ≡ "EM PAULINO CUSTÓDIO DE REZENDE" e distinção mandatória "CM LAR DE ISABEL" ≠ "EM LAR DE ISABEL".',
      'Suporte a 5 abas: ROTA A, ROTA B, ROTA C (a importar), TOTAL e TODAS UNIDADES (a ignorar).',
      'Mapeamento Escola-por-Coluna (transposto): linha 7 (nome das escolas), linhas 10-34 (25 produtos na coluna C e quantidades nas colunas das escolas), linha 35 (totais). Ignora seção FIXOS.',
      'Detecção de anomalias de duplicidade (escola presente em mais de uma rota) e auditoria na collection importacoes.',
    ],
  },
  {
    id: '3.7',
    title: 'Consolidação de Demanda Agrícola',
    route: '/consolidacao',
    goal: 'Matriz cruzada Produto × Escola para planejamento de colheita dos produtores cooperados.',
    details: [
      'Matriz dinâmica de quantidades por produto para cada escola no ciclo.',
      'Abas "Por Produto (Matriz Geral)" e "Por Escola (Resumo)".',
      'Filtro de Ocultar Vazios (sem demanda) e busca rápida.',
      'Exportação para Planilha Excel (.xlsx) via SheetJS com totalizadores.',
    ],
  },
  {
    id: '3.8',
    title: 'Roteamento & Despacho Logístico por Contrato',
    route: '/rotas',
    goal: 'Roteamento por contrato baseado em escolas, sequenciamento drag-and-drop de paradas com volume de alunos, pedidos herdando a rota da escola, despacho e entrega por rota inteira.',
    details: [
      'Conceito Central de ROTA LOGÍSTICA: Atributo operacional exclusivo de distribuição da cooperativa, definindo a sequência de paradas (ordem 1..N). Não se confunde com a ABA DA PLANILHA (origem do pedido).',
      'Roteamento Baseado em Escolas: Atribuição e sequenciamento operam diretamente sobre as escolas vinculadas ao contrato (contrato_escolas.rota_logistica_id e paradas_rota), mantendo a aba da planilha intacta.',
      'Herança Automática da Rota pelos Pedidos: Os pedidos não recebem rota manualmente — herdam a rota logística da respectiva escola (via paradas_rota/contrato_escolas). Novos pedidos importados ou criados entram automaticamente na rota da escola já roteada.',
      'Painel de Escolas Sem Rota Logística: Escolas vinculadas ao contrato sem rota logística aparecem em destaque na listagem de pendências. Pedidos dessas escolas permanecem com status Pendente sem rota e não bloqueiam o despacho das demais rotas.',
      'Separação Total de Campos: contrato_escolas armazena separadamente `rota` (texto da planilha) e `rota_logistica_id` (relação com rotas_logisticas). O despacho e sequenciamento usam exclusivamente a rota logística.',
      'Primeira Configuração Direto na Tela de Roteamento: Ao selecionar um contrato sem rotas logísticas, a interface permite criar rotas de nome livre, vincular as escolas e reordenar paradas.',
      'Sequenciamento Drag-and-Drop de Paradas: Reordenação manual das escolas atendidas gravada em batch transacional único na collection paradas_rota (rota_logistica_id, escola_id, ordem), com atualização otimista imediata na UI.',
      'Despacho da Rota Inteira Otimizado (Batch Único): Botão "Colocar em Rota" processa a transação em batch único no servidor (/backend/v1/rotas-logisticas/despachar), gerando registro de despacho e passando todos os pedidos para "Em Rota" sem recarregar o banco globalmente, aplicando atualização otimista local.',
      'Entrega por Rota Inteira (Batch Único & Baixa de Estoque): Botão "Rota Entregue" marca todos os pedidos "Em Rota" dela como Entregue em transação atômica única (/backend/v1/rotas-logisticas/entregar), realizando baixa consolidada de estoque, atualizando despachos e refletindo os dados no estado local com rollback em caso de falha.',
      'Atualizações Locais e SSE Granular: Removidos reloads globais após operações (loadAllData eliminado pós-escrita); o estado sincroniza de forma atômica e granular via SSE por collection, garantindo resposta instantânea da interface.',
      'Tratamento de "Não Entregue": Pedidos despachados que o motorista não entregou podem ser cancelados definitivamente pela central por motivos logísticos da cooperativa.',
    ],
  },
  {
    id: '3.9',
    title: 'Monitoramento & Simulador de Ciclo',
    route: '/monitoramento',
    goal: 'Controle das fases do ciclo operacional e painel de alertas para contato direto.',
    details: [
      'Ciclos operacionais: coletando → correcao → fechado.',
      'Simulador de transição de fase com regras de validação aplicadas.',
      'Painel de alertas de pendências: escolas sem pedidos ou pedidos com inconsistências.',
      'Botão de contato direto via WhatsApp (wa.me) com mensagem contextualizada.',
    ],
  },
  {
    id: '3.10',
    title: 'Comunicação Semanal (WhatsApp)',
    route: '/comunicacao',
    goal: 'Disparo de comunicados semanais de safra, links e controle de envio por escola.',
    details: [
      'Template de mensagem semanal com produtos em abundância, escassez e link do formulário.',
      'Ações "Enviar Manual" (abre o WhatsApp Web/App com texto pronto) e "Enviar para Todos".',
      'Histórico e auditoria de disparos na collection envios_whatsapp (ciclo_id, escola_id, status, enviado_em).',
    ],
  },
  {
    id: '3.11',
    title: 'Histórico de Ciclos & Comparação de Consumo',
    route: '/historico-ciclos',
    goal: 'Auditoria de fechamentos semanais e análise comparativa de volume entre períodos.',
    details: [
      'Relação cronológica dos ciclos com total de escolas atendidas, volume consolidado e valor faturado.',
      'Modal de comparação direta entre dois ciclos (base vs comparado) com cálculo de variação absoluta e percentual por produto.',
    ],
  },
  {
    id: '3.12',
    title: 'Emissão de Atestos (Documento Oficial)',
    route: '/atestos',
    goal: 'Produzir o documento oficial da cooperativa ("TERMO DE RECEBIMENTO DE AQUISIÇÃO DE GÊNEROS ALIMENTÍCIOS") em formato A4, com pré-visualização, geração de PDF gravado no banco e download posterior.',
    details: [
      'Nome do Produto no Atesto é o Nome no Contrato: Em estrita conformidade com a exigência dos órgãos fiscalizadores e da secretaria, o documento oficial e seu PDF timbrado imprimem o Nome no Contrato (contratoItem.nome_contrato com fallback para produto.nome), garantindo correspondência jurídica perfeita com a nota de empenho e o contrato firmado.',
      'Estrutura Oficial do Documento (A4 - 1 página): Cabeçalho com logotipo da cooperativa e título central "TERMO DE RECEBIMENTO DE AQUISIÇÃO DE GÊNEROS ALIMENTÍCIOS REFERENTE À CHAMADA PÚBLICA-N° {numero_chamada}".',
      'Parágrafo de Atesto: "Atesto que a {nome_da_escola} recebeu os produtos listados abaixo da {nome_da_cooperativa}".',
      'Tabela de Produtos: Colunas PRODUTOS e QUANTIDADE (KG), uma linha por produto entregue em formato brasileiro (vírgula decimal), e linha final "Total de itens" com a soma das quantidades.',
      'Declaração Institucional: "Nestes termos, os produtos entregues estão de acordo com o contrato assinado." seguido do compromisso de destinação final da Agricultura Familiar para Alimentação Escolar.',
      'Local e Data: "{cidade}, {dia} de {mês} de {ano}." derivado do cadastro de Configurações da cooperativa e data de emissão.',
      'Rodapé de Assinatura: Linha "Matrícula ou CPF: ___________________________" (em branco para preenchimento manual após a impressão) e identificação "Representante da Unidade Escolar (conferente) {nome_da_escola}".',
      'Fluxo de Emissão & Armazenamento: Emitido apenas para pedidos Entregues sem atesto vinculado. Apresenta preview do documento oficial, botão "Emitir Atesto" que gera e armazena o binário PDF no registro do atesto (campo arquivo), e botão "Baixar PDF" nos atestos já emitidos.',
      'Download e Síntese Retroativa Resiliente: O botão "Baixar PDF" realiza o download imediato do arquivo salvo via Blob/createObjectURL e, para registros legados sem arquivo ou na indisponibilidade do arquivo binário, realiza a síntese retroativa instantânea em memória, armazena o PDF no registro e conclui o download com feedback e tratamento completo de erros.',
    ],
  },
  {
    id: '3.13',
    title: 'Relatórios Contábeis & Fechamento Mensal',
    route: '/relatorios',
    goal: 'Geração e exportação avançada de demonstrativos para fechamento mensal e prestação de contas.',
    details: [
      'Demonstrativos por contrato, entregas por período e produtos faturados.',
      'Exportação Excel (.xlsx) e PDF timbrado com jsPDF.',
    ],
  },
  {
    id: '3.14',
    title: 'Meu Perfil',
    route: '/perfil',
    goal: 'Autogestão de dados cadastrais e credenciais do usuário autenticado.',
    details: [
      'Edição de foto de identificação (upload de imagem salvo na collection users).',
      'Manutenção de nome completo, e-mail corporativo e celular / WhatsApp.',
      'Alteração segura de senha com validação da senha atual e confirmação mínima de 8 caracteres.',
      'Disponível para todos os perfis autenticados no menu lateral e dropdown superior.',
    ],
  },
  {
    id: '3.15',
    title: 'Gestão de Usuários (Exclusivo MASTER)',
    route: '/usuarios',
    goal: 'Controle centralizado de operadores, atribuição de perfis e status de contas da cooperativa.',
    details: [
      'Listagem de usuários com foto, nome, e-mail, celular, perfil e status.',
      'Criação de novos usuários com definição de perfil (MASTER, ADMINISTRADOR, SECRETÁRIA) e senha inicial.',
      'Edição de dados e redefinição de perfil e permissões.',
      'Ativação/desativação imediata de contas (usuários inativos são impedidos de fazer login).',
      'Exclusão protegida (não permite que o usuário master logado exclua a si próprio).',
    ],
  },
  {
    id: '3.16',
    title: 'Configurações da Cooperativa (Exclusivo MASTER)',
    route: '/configuracoes',
    goal: 'Parametrização institucional da cooperativa, identidade visual completa e controle de ambiente de autenticação.',
    details: [
      'Controle de atalhos demo na tela de login: toggle para ocultar ou exibir botões de teste rápido (para produção segura).',
      'Dados institucionais da cooperativa: Razão Social, Sigla, CNPJ, Município/UF, Telefone e E-mail.',
      'Logotipo Institucional da Cooperativa: upload de imagem (PNG, JPG, WEBP) aplicado dinamicamente em todo o aplicativo — menu lateral desktop, cabeçalho mobile, tela pública de login e favicon/apple-touch-icon da aba do navegador, com fallback resiliente para ícone/sigla.',
      'Integração dos dados da cooperativa em atestos, relatórios e telas do sistema.',
    ],
  },
  {
    id: '3.17',
    title: 'Recuperação de Senha (Esqueci minha senha)',
    route: '/login (Modal)',
    goal: 'Recuperação autônoma de acesso por e-mail com fluxo nativo do backend.',
    details: [
      'Link "Esqueci minha senha" na tela pública de login.',
      'Envio de e-mail de redefinição via funcionalidade nativa do Skip Cloud / PocketBase (requestPasswordReset).',
      'Feedback seguro com confirmação visual para o usuário sem exposição indevida de dados.',
    ],
  },
]

const PROFILES = [
  [
    'MASTER',
    'Poderes totais e irrestritos. Gerencia usuários (criação, edição, desativação, definição de perfil), acessa "Configurações da Cooperativa", produtos, contratos, escolas, rotas, relatórios e todos os módulos operacionais.',
  ],
  [
    'ADMINISTRADOR',
    'Acesso operacional e administrativo completo. Gerencia produtos, preços, contratos, escolas, rotas, relatórios contábeis e documento de requisitos. Não tem acesso à gestão de usuários nem a configurações institucionais master.',
  ],
  [
    'SECRETÁRIA',
    'Acesso restrito à operação diária. Lançamento e validação de pedidos, importação Excel de secretarias, consolidação de demanda, histórico de ciclos, rotas de entrega, comunicação WhatsApp e atestos de entrega (sem acesso a Produtos, Contratos, Escolas, Usuários e Configurações).',
  ],
]

const VISUAL = [
  ['Nome do sistema', 'CoopGestão'],
  [
    'Logotipo da cooperativa',
    'Personalizado via Configurações da Cooperativa (upload singleton); exibido no menu lateral, header mobile, login, favicon da aba do navegador e Termo de Atesto oficial',
  ],
  ['Ícone primário (fallback)', 'Sprout (broto/folha) — Lucide Icons'],
  ['Paleta', 'Verde (primária), laranja/âmbar (secundária), tons neutros slate/gray'],
  ['Tipografia', 'Inter (padrão shadcn/ui), tracking-tight para títulos'],
  ['Componentes UI', 'shadcn/ui com Tailwind CSS'],
  ['Layout', 'Sidebar fixa (desktop) + drawer mobile, header com busca e menu de usuário'],
]

const STACK = [
  'React 18 + Vite',
  'TypeScript',
  'React Router DOM v6',
  'Tailwind CSS + shadcn/ui',
  'Lucide React',
  'Sonner (toasts)',
  'Backend conectado: Skip Cloud (PocketBase v0.36) com coleções persistidas em tempo real',
]

const DATA_MODEL = [
  'users (id, email, nome/name, celular, foto [file], perfil [MASTER/ADMINISTRADOR/SECRETARIA], ativo [bool])',
  'configuracoes (id, nome_cooperativa, sigla, cnpj, telefone, email, cidade_uf, exibir_atalhos_demo [bool], logotipo [file])',
  'ciclos (id, nome, data_inicio, data_fim, status [coletando/correcao/fechado], snapshot [json])',
  'produtos (id, nome, categoria, unidade, estoque, preco_unitario, disponibilidade [normal/escassez/abundancia])',
  'escolas (id, nome, endereco, telefone, email, tipo [CMEI/CRECHE/INTEGRAL/FUNDAMENTAL], alunos) [Cadastro Mestre Global - rota atribuída via vínculos]',
  'contratos (id, numero, numero_chamada, tipo, modalidade_pedido [individualizado/centralizado], num_rotas_logisticas [opcional], valor_total, status)',
  'contrato_escolas (id, contrato_id → contratos, escola_id → escolas, rota [text - origem planilha], rota_logistica_id → rotas_logisticas, rota_id → rotas) [Vínculos N:N independentes]',
  'rotas (id, contrato_id → contratos, nome, ordem) [Abas da Planilha da Secretaria - Referência]',
  'rotas_logisticas (id, contrato_id → contratos, nome, ordem, ativa [bool]) [Rotas Logísticas da Cooperativa - Distribuição]',
  'paradas_rota (id, rota_logistica_id → rotas_logisticas, escola_id → escolas, ordem) [Sequenciamento Drag-and-Drop]',
  'despachos (id, contrato_id → contratos, ciclo_id → ciclos, rota_logistica_id → rotas_logisticas, data_despacho, usuario_id → users, status [Em Rota/Entregue/Cancelado])',
  'contrato_itens (id, contrato_id → contratos, produto_id → produtos, preco, quantidade_contratada [numérico opcional], nome_contrato [texto opcional], apelidos [texto opcional])',
  'pedidos (id, numero, escola_id → escolas, ciclo_id → ciclos, origem [excel/whatsapp/manual], rota_id → rotas, rota_logistica_id → rotas_logisticas, validacao [json], data_prevista, status [Pendente/Em Rota/Entregue/Cancelado], entregue_em, entregue_por → users, cancelamento_motivo, motivo_cancelamento, cancelado_em)',
  'pedido_itens (id, pedido_id → pedidos, produto_id → produtos, quantidade, preco_unitario)',
  'envios_whatsapp (id, ciclo_id → ciclos, escola_id → escolas, status [pendente/enviado/falha], enviado_em)',
  'importacoes (id, ciclo_id → ciclos, contrato_id → contratos, arquivo, data, usuario_id, linhas_total, linhas_ok, linhas_erro, erros [json])',
  'atestos (id, numero, pedido_id → pedidos, data_emissao, status, arquivo [file])',
]

/* ----------------------------------------------------------------------------
 * PDF generation
 * A self-contained printable HTML document. We open it in a new window and
 * trigger the browser's print-to-PDF, which gives the cleanest typography
 * without shipping a heavy runtime dependency.
 * ------------------------------------------------------------------------- */

function buildPrintHtml(): string {
  const rows = (cells: string[], tag: 'th' | 'td' = 'td') =>
    `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join('')}</tr>`

  const profileTable = `
    <table>
      <thead>${rows(['Perfil', 'Descrição', 'Módulos Permitidos'], 'th')}</thead>
      <tbody>
        ${rows([
          'MASTER',
          'Poderes totais e irrestritos. Gerenciamento de usuários, parametrizações institucionais da cooperativa e controle de produção.',
          'Todos os módulos do sistema (Dashboard, Produtos, Escolas, Contratos, Pedidos, Rotas, Consolidação, Importação, Monitoramento, WhatsApp, Histórico, Atestos, Relatórios, Requisitos, Meu Perfil, Usuários e Configurações).',
        ])}
        ${rows([
          'ADMINISTRADOR',
          'Acesso operacional e administrativo completo ao ecossistema escolar e produtos.',
          'Dashboard, Produtos, Escolas, Contratos, Pedidos, Rotas, Consolidação, Importação, Monitoramento, WhatsApp, Histórico, Atestos, Relatórios, Requisitos e Meu Perfil.',
        ])}
        ${rows([
          'SECRETÁRIA',
          'Acesso focado na rotina operacional diária e lançamentos.',
          'Dashboard, Pedidos, Rotas, Consolidação, Importação, Monitoramento, WhatsApp, Histórico de Ciclos, Atestos, Relatórios e Meu Perfil.',
        ])}
      </tbody>
    </table>`

  const modulesHtml = MODULES.map(
    (m) => `
      <h3>${m.id} ${m.title} <span class="route">(${m.route})</span></h3>
      <p class="goal"><strong>Objetivo:</strong> ${m.goal}</p>
      <ul>${m.details.map((d) => `<li>${d}</li>`).join('')}</ul>`,
  ).join('')

  const visualTable = `
    <table>
      <tbody>
        ${VISUAL.map((v) => rows(v)).join('')}
      </tbody>
    </table>`

  const stackList = `<ul>${STACK.map((s) => `<li>${s}</li>`).join('')}</ul>`
  const dataModelList = `<ul>${DATA_MODEL.map((d) => `<li>${d}</li>`).join('')}</ul>`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Documento de Requisitos do Sistema (DRS) — CoopGestão</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    color: #1a1a1a;
    line-height: 1.6;
    margin: 0 auto;
    max-width: 820px;
    padding: 56px 48px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 4px; }
  .subtitle { font-size: 16px; color: #4a6b3a; font-weight: 500; margin: 0 0 32px; }
  h2 {
    font-size: 20px; font-weight: 600; letter-spacing: -0.01em;
    margin: 40px 0 12px; padding-bottom: 8px; border-bottom: 2px solid #e6ece3;
    color: #1f4d1c;
  }
  h3 { font-size: 16px; font-weight: 600; margin: 24px 0 6px; }
  p { margin: 0 0 12px; }
  .goal { color: #555; font-size: 14px; margin-bottom: 8px; }
  .route { color: #6b7280; font-weight: 400; font-size: 13px; }
  ul, ol { margin: 0 0 12px; padding-left: 22px; }
  li { margin-bottom: 4px; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 16px; font-size: 14px; }
  th, td { text-align: left; padding: 10px 14px; border: 1px solid #e2e8f0; vertical-align: top; }
  th { background: #f1f5f0; font-weight: 600; color: #1f4d1c; }
  tr:nth-child(even) td { background: #fafbfa; }
  .footer { margin-top: 56px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #9ca3af; text-align: center; }
  @media print {
    body { padding: 24px; }
    @page { margin: 1.5cm; }
  }
</style>
</head>
<body>
  <h1>Documento de Requisitos do Sistema (DRS)</h1>
  <p class="subtitle">CooperGestão — Gestão para Cooperativa Agrícola Familiar</p>

  <h2>1. Visão Geral do Produto</h2>
  <p>O CooperGestão é um sistema web voltado para cooperativas agrícolas de pequeno porte que participam de programas institucionais como o PNAE (Programa Nacional de Alimentação Escolar) e o PAA (Programa de Aquisição de Alimentos). A plataforma centraliza a gestão operacional com dois focos principais: Coleta de pedidos das escolas parceiras e Emissão de atestos de entrega para comprovação de recebimento e posterior faturamento. O público-alvo inclui administradores da cooperativa (coordenação, finanças) e secretárias (operacional, lançamento de pedidos e emissão de documentos).</p>

  <h2>2. Perfis de Acesso e Segurança</h2>
  ${profileTable}
  <p class="goal"><strong>Status:</strong> Implementado e ativo. O sistema conta com autenticação real via PocketBase, persistência de sessão, controle de permissões por perfil (Administrador com acesso integral e Secretária com acesso operacional) e recurso de alteração de senha segura diretamente no menu do usuário.</p>
  <h2>3. Módulos do Sistema</h2>
  ${modulesHtml}

  <h2>4. Modelo de Dados (Resumo)</h2>
  ${dataModelList}

  <h2>5. Identidade Visual</h2>
  ${visualTable}

  <h2>6. Stack Técnica</h2>
  ${stackList}

  <div class="footer">Documento de Requisitos do Sistema — CoopGestão • Gerado em ${new Date().toLocaleDateString('pt-BR')}</div>
</body>
</html>`
}

/* Download the standalone HTML document as a last-resort fallback. */
function downloadHtmlFallback(html: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'DRS-CoopGestao.html'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Robust print-to-PDF that does NOT depend on popups.
 *
 * The previous implementation opened a new window with a blob URL, which is
 * fragile: popup blockers silently kill `window.open`, and `window.onload`
 * inside the popup does not always fire for blob URLs. Instead we render the
 * document into a hidden iframe (via `srcdoc`, which is not subject to popup
 * blocking and needs no URL to revoke) and call `.print()` on its
 * `contentWindow` once it has loaded. If anything throws, we fall back to a
 * plain HTML download.
 */
function handleDownloadPdf() {
  const html = buildPrintHtml()

  try {
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.setAttribute('aria-hidden', 'true')
    iframe.title = 'Impressão do DRS'

    let printed = false

    const cleanup = () => {
      // Give the print dialog a moment to hold the document before removal.
      setTimeout(() => iframe.remove(), 1000)
    }

    iframe.onload = () => {
      try {
        const win = iframe.contentWindow
        if (win) {
          win.focus()
          win.print()
          printed = true
        }
      } catch {
        // contentWindow.print() can throw in sandboxed contexts.
      }
      cleanup()
    }

    // If the iframe never reports load (rare), fall back to HTML download so
    // the user is never left with a dead button.
    const fallbackTimer = window.setTimeout(() => {
      if (!printed) downloadHtmlFallback(html)
    }, 3000)

    iframe.addEventListener('load', () => window.clearTimeout(fallbackTimer), { once: true })

    iframe.srcdoc = html
    document.body.appendChild(iframe)
  } catch {
    // iframe unsupported or blocked entirely — offer the HTML download.
    downloadHtmlFallback(html)
  }
}

/* ----------------------------------------------------------------------------
 * Presentational helpers
 * ------------------------------------------------------------------------- */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-2xl font-semibold tracking-tight text-primary mt-12 mb-4 pb-2 border-b-2 border-primary/10 scroll-mt-20">
      {children}
    </h2>
  )
}

function Table({ headers, rows }: { headers?: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border my-4">
      <table className="w-full text-sm">
        {headers && (
          <thead className="bg-primary/5">
            <tr>
              {headers.map((h) => (
                <th
                  key={h}
                  className="text-left font-semibold text-primary px-4 py-3 border-b border-border"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="even:bg-muted/30">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="px-4 py-3 border-b border-border/60 align-top text-foreground/90"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ----------------------------------------------------------------------------
 * Page
 * ------------------------------------------------------------------------- */

export default function Requirements() {
  const topRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={topRef} className="mx-auto max-w-4xl">
      {/* Document header */}
      <Card className="mb-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <div className="flex items-center gap-2 text-primary mb-2">
              <FileText className="h-5 w-5" />
              <span className="text-sm font-medium uppercase tracking-wider">
                Documento de Requisitos
              </span>
            </div>
            <CardTitle className="text-3xl font-bold tracking-tight text-foreground">
              Documento de Requisitos do Sistema (DRS)
            </CardTitle>
            <p className="text-muted-foreground mt-2 font-medium">
              CooperGestão — Gestão para Cooperativa Agrícola Familiar
            </p>
          </div>
          <Button onClick={handleDownloadPdf} className="shrink-0">
            <Download className="h-4 w-4" />
            Baixar PDF
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-primary border-primary/30">
              Banco de Dados Ativo
            </Badge>
            <span>•</span>
            <span>Gerado em {new Date().toLocaleDateString('pt-BR')}</span>
          </div>
        </CardContent>
      </Card>

      {/* 1. Visão Geral */}
      <SectionTitle>1. Visão Geral do Produto</SectionTitle>
      <p className="text-foreground/90 leading-relaxed">
        O CooperGestão é um sistema web voltado para cooperativas agrícolas de pequeno porte que
        participam de programas institucionais como o PNAE (Programa Nacional de Alimentação
        Escolar) e o PAA (Programa de Aquisição de Alimentos). A plataforma centraliza a gestão
        operacional com dois focos principais: Coleta de pedidos das escolas parceiras e Emissão de
        atestos de entrega para comprovação de recebimento e posterior faturamento. O público-alvo
        inclui administradores da cooperativa (coordenação, finanças) e secretárias (operacional,
        lançamento de pedidos e emissão de documentos).
      </p>

      {/* 2. Perfis de Acesso */}
      <SectionTitle>2. Perfis de Acesso e Matriz de Permissões</SectionTitle>
      <Table
        headers={['Perfil', 'Descrição', 'Permissões e Módulos']}
        rows={[
          [
            'MASTER',
            'Poderes totais e irrestritos no sistema. Gerenciamento de usuários, configurações institucionais da cooperativa e controle de produção.',
            'Acesso irrestrito a todos os módulos: Usuários, Configurações, Meu Perfil, Produtos, Escolas, Contratos, Pedidos, Rotas, Importação Excel, Consolidação, Monitoramento, Comunicação WhatsApp, Histórico de Ciclos, Atestos, Relatórios e Requisitos.',
          ],
          [
            'ADMINISTRADOR',
            'Gestão administrativa e operacional do catálogo e parcerias.',
            'Dashboard, Produtos, Escolas, Contratos, Pedidos, Rotas, Importação Excel, Consolidação, Monitoramento, Comunicação WhatsApp, Histórico de Ciclos, Atestos, Relatórios, Requisitos e Meu Perfil (sem acesso a Usuários e Configurações).',
          ],
          [
            'SECRETÁRIA',
            'Acesso restrito à operação diária escolar e logística.',
            'Dashboard, Pedidos, Rotas, Importação Excel, Consolidação, Monitoramento, Comunicação WhatsApp, Histórico de Ciclos, Atestos, Relatórios e Meu Perfil.',
          ],
        ]}
      />
      <p className="text-sm text-muted-foreground italic">
        <strong className="not-italic text-primary font-medium">Status:</strong> Autenticação nativa
        Skip Cloud (PocketBase v0.36) ativa com três perfis (MASTER, ADMINISTRADOR, SECRETÁRIA),
        recuperação de senha por e-mail, tela Meu Perfil com upload de foto e controle de
        visibilidade de atalhos demo pelo Master.
      </p>

      {/* 3. Módulos */}
      <SectionTitle>3. Módulos do Sistema</SectionTitle>
      <div className="space-y-6">
        {MODULES.map((m) => (
          <div key={m.id} className="rounded-lg border border-border bg-card p-5 scroll-mt-20">
            <h3 className="text-lg font-semibold tracking-tight text-foreground flex flex-wrap items-baseline gap-2">
              <span className="text-primary">{m.id}</span>
              {m.title}
              <Badge variant="secondary" className="font-normal">
                {m.route}
              </Badge>
            </h3>
            <p className="text-sm text-muted-foreground mt-1 mb-3">
              <strong className="text-foreground/80">Objetivo:</strong> {m.goal}
            </p>
            <ul className="space-y-2">
              {m.details.map((d, i) => (
                <li key={i} className="text-sm text-foreground/90 flex gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* 4. Modelo de Dados */}
      <SectionTitle>4. Modelo de Dados (Resumo)</SectionTitle>
      <ul className="space-y-2">
        {DATA_MODEL.map((d, i) => (
          <li key={i} className="text-foreground/90 flex gap-2">
            <span className="text-primary mt-0.5">→</span>
            <code className="font-mono text-sm bg-muted px-2 py-0.5 rounded">{d}</code>
          </li>
        ))}
      </ul>

      {/* 5. Identidade Visual */}
      <SectionTitle>5. Identidade Visual</SectionTitle>
      <Table rows={VISUAL} />

      {/* 6. Stack Técnica */}
      <SectionTitle>6. Stack Técnica</SectionTitle>
      <ul className="grid sm:grid-cols-2 gap-2">
        {STACK.map((s, i) => (
          <li
            key={i}
            className="text-sm text-foreground/90 flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {s}
          </li>
        ))}
      </ul>

      <div className="mt-12 pt-6 border-t border-border text-center text-xs text-muted-foreground">
        Documento de Requisitos do Sistema — CoopGestão • Conectado ao Skip Cloud (PocketBase)
      </div>
    </div>
  )
}
