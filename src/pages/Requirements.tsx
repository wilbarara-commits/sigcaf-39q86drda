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
    id: '3.0',
    title: 'Fornecedores (Produtores Cooperados & Fornecedores Externos)',
    route: '/fornecedores',
    goal: 'Cadastro e gestão unificada de produtores rurais cooperados e fornecedores externos com controle de validade do CAF (Cadastro Nacional da Agricultura Familiar), foto, documentos e canais de contato.',
    details: [
      'Posicionamento de Destaque no Menu: Primeiro item do menu lateral principal (rota /fornecedores com ícone 🚜), acessível a todos os operadores do sistema com permissões de gestão (criação, edição e exclusão) atribuídas aos perfis Administrador e Master.',
      'Coleção PocketBase `fornecedores` (v0.0.250): Persistência em nuvem nativa sem uso de armazenamento local temporário/ilha de dados, contendo os campos: nome (obrigatório), sexo (Masculino, Feminino, Outro), data_nascimento, foto (upload de imagem até 5MB armazenada em storage e servida com preview/avatar), vinculo (COOPERADO ou EXTERNO), identidade (CPF com 11 dígitos ou CNPJ com 14 dígitos, aceitando ambos no mesmo campo), data_validade_caf (opcional), endereco, bairro, cep, latitude e longitude (campos numéricos simples), whatsapp e timestamps created/updated.',
      'Validação Matemática Estrita de Documentos (CPF ou CNPJ): Algoritmo validador em tempo real no cliente com rejeição de sequências inválidas e cálculo rigoroso dos dígitos verificadores (módulo 11 para CPF de 11 dígitos e duplo ponderador para CNPJ de 14 dígitos), impedindo cadastros com números corrompidos ou fictícios.',
      'Máscaras e Formatações Automáticas: Máscara progressiva inteligente de CPF/CNPJ conforme digitação, máscara de WhatsApp no padrão brasileiro (XX) XXXXX-XXXX e formatação de CEP (XXXXX-XXX).',
      'Controle Visual & Alertas de Situação do CAF: Indicador trilateral de situação do CAF: "Válido" (quando data_validade_caf >= hoje em verde), "Vencido" (quando data_validade_caf < hoje em VERMELHO com ícone de alerta) e "—" (quando não informado). O destaque em vermelho do CAF vencido manifesta-se tanto na listagem geral quanto em caixa de aviso destacada no formulário de edição/criação.',
      'Listagem, Busca e Filtros Operacionais: Busca textual rápida por nome, CPF/CNPJ e WhatsApp; filtro por Vínculo (Todos, Cooperado, Externo); cards de resumo com totalizadores de fornecedores, cooperados, externos e quantidade de CAF vencidos; paginação/tabela responsiva com avatar.',
      'Exclusão Segura com Diálogo de Confirmação: Exclusão condicionada obrigatoriamente a diálogo de confirmação (AlertDialog) com aviso claro de irreversibilidade e limpeza física da foto associada no PocketBase.',
      'Reatividade em Tempo Real: Inscrição realtime na coleção `fornecedores` sincronizando instantaneamente inclusões, alterações e exclusões com o estado global do AppContext.',
      'Preservação Estrita das Quatro Telas de Entregas (v0.0.243): Isolamento arquitetural total sem interferência nas rotas logísticas (/rotas), no Dashboard (/), no Portal do Motorista (/motorista) e no Monitoramento (/monitoramento).',
    ],
  },
  {
    id: '3.1',
    title: 'Dashboard & Acompanhamento Executivo',
    route: '/ (Página Inicial)',
    goal: 'Fornecer uma visão executiva dos contratos, do ciclo operacional e do acompanhamento das entregas em tempo real.',
    details: [
      'Métricas em cards (v0.0.244 / v0.0.246): Grid principal em 5 colunas com os indicadores: Pedidos Pendentes (ciclos ativos), Pedidos em Rota (despachados/em trânsito no ciclo ativo, ícone Truck âmbar e atalho para /rotas), Contratos Ativos, Chamadas Ativas e Receita Entregue do Mês com % de realização calculada sobre o previsto do mês.',
      'Cálculo de Receita Entregue e Previsto do Mês (v0.0.246 — Opção A): Eliminação definitiva da oscilação semanal do percentual (100% → 50% → 100%). Numerador: soma do valor canônico (campo total do pedido; fallback para soma dos itens) dos pedidos com status "Entregue" cuja data de entrega (entregue_em) cai no mês corrente (desduplicados por ID, cancelados excluídos). Denominador ("Total previsto do mês"): numerador + pedidos NÃO entregues (status "Pendente" ou "Em Rota") cujo CICLO tem data de entrega/despacho prevista (dia de despacho/entrega da chamada) dentro do mês corrente. Pedidos feitos no mês anterior cujo ciclo entrega no mês corrente entram no denominador (e no numerador quando entregues), mantendo o percentual coerente, estável e com teto em 100%. Rótulo explicativo no subtexto: "X% do previsto do mês (R$ Y)".',
      'Widget "Entregas em Andamento": Acompanhamento em tempo real (alimentado por realtime/eventos no banco) das rotas em execução. Exibe identificação completa da rota (nome da rota, chamada associada, ciclo operacional, motorista responsável e crachá "Em Rota"), barra de progresso visual "X de N entregas" com percentual concluído, indicador da última sincronização em tempo relativo amigável ("há 2 min"), indicação da próxima parada a atender (primeira escola sem entrega confirmada) ou "Rota concluída" quando todas as paradas forem finalizadas. Possui estado vazio informativo quando não há rotas em trânsito e atalho de clique direto para a tela de Rotas (/rotas).',
      'Isolamento Estrito por Ciclo no Widget de Entregas (v0.0.240): O widget resolve estritamente o ciclo ativo da rota (ou ciclo corrente) ao consultar despachos ativos (getAtivoByRota com cicloId e intervalo temporal) e registros de entrega (getEntregaRegistrosDaRota com cicloId obrigatório). Blindagem anti-vazamento de ciclos: registros históricos de ciclos anteriores não contaminam o progresso do ciclo corrente; se o ciclo possuir pedidos em rota e zero entregas confirmadas naquele ciclo, o widget fixa entregasConfirmadasCount = 0 e crachá "Em Rota", nunca declarando "Rota concluída" indevidamente.',
      'Cards de Ciclos Operacionais Ativos no Dashboard (v0.0.240): Apresentação transparente dos indicadores do ciclo com distinção entre "Escolas com Pedidos" (número de unidades escolares demandantes cadastradas no ciclo) e "Entregas Concluídas: X de Y" (X = escolas com entrega efetivamente concluída no ciclo e Y = total de escolas com pedidos), eliminando a ambiguidade da métrica anterior "Escolas Atendidas", além de Pedidos, Volume Total e Valor Previsto.',
      'Cartão informativo de ciclo: "Ciclo ativo: XX/AAAA — Fase: ..." e aviso destacado de "N ciclo(s) pendente(s) de fechamento" quando houver ciclos não-terminais anteriores em aberto.',
      'Lista de Entregas Recentes com badges de status e feed de atividade recente.',
      'Ações rápidas: "Novo Pedido", "Emitir Atesto" e fechamento mensal com geração de relatório.',
    ],
  },
  {
    id: '3.1B',
    title: 'Chamadas Públicas (Nível Estrutural Superior)',
    route: '/chamadas',
    goal: 'Gestão do nível institucional superior do SIGCAF que agrupa e relaciona os contratos da cooperativa, centralizando produtos, AKAs e preços oficiais.',
    details: [
      'Hierarquia Estrutural: Chamadas Públicas → Contratos → Escolas. Vínculos são chamada↔contrato e escola↔contrato. Não há nenhum vínculo escola↔chamada.',
      'Regra de Vínculo Chamada↔Contrato: 1 chamada pública pode ter um ou mais contratos; cada contrato pertence a exatamente uma chamada pública (vínculo obrigatório).',
      'Propriedade Dependência Administrativa na Chamada (v0.0.123): Inclusão do campo select opcional `dependencia_administrativa` na coleção `chamadas` (opções: Federal, Estadual, Municipal e Privada), seguindo o mesmo padrão já consolidado no cadastro de escolas. Disponível com seletor completo nos modais de criação e edição da chamada (com opção vazia "—" para não classificado), filtro dedicado por dependência na listagem de chamadas, coluna "Dependência" na tabela principal, reflexão contextual nos contratos vinculados e inclusão nas exportações em CSV e Excel (.xlsx). Chamadas pré-existentes mantêm o campo vazio.',
      'Aba "Itens & Preços" na Chamada: Modal de cadastro/edição da chamada pública possui a aba dedicada "Itens & Preços", renderizando o gerenciador ChamadaItemsManager com colunas Produto, AKA/Apelido na Planilha, Unidade, Preço Unitário (R$), Quantidade da Chamada e Valor Total.',
      'Produtos, Preço e AKA Vivem na Chamada (v0.0.78): Os produtos licitados, seus apelidos de planilha (AKA) e os preços unitários oficiais são definidos e gerenciados na chamada (collection chamada_itens). Os contratos vinculados espelham automaticamente esses valores.',
      'Regra de Quantidade por Contrato e Soma da Chamada: A quantidade contratada por produto é definida individualmente em cada contrato (contrato_itens) e pode ficar em branco (quando o item não for contratado naquele contrato específico). A quantidade exibida na chamada ("Qtd. Chamada") é derivada e somente leitura, calculada reativamente pela soma das quantidades dos contratos vinculados (quantidades em branco contam como nada; se nenhum contrato informar quantidade para o item, a quantidade da chamada permanece em branco).',
      'Duplicação Temporária e Transição Arquitetural: Durante o período de migração progressiva, as collections chamada_itens e contrato_itens coexistem com espelhamento transparente para preservar compatibilidade histórica de contratos já em andamento, antes da eliminação definitiva da redundância nas próximas versões.',
      'Visualização e Gestão: Módulo com CRUD completo, filtros por status, dependência administrativa e modalidade, busca textual, abas de Dados Gerais, Itens & Preços, Rotas Logísticas e Contratos Vinculados, e exportação da listagem em CSV e Excel.',
    ],
  },
  {
    id: '3.2',
    title: 'Produtos & Preços',
    route: '/produtos',
    goal: 'Cadastro e manutenção do catálogo de produtos agrícolas e diretrizes de safra.',
    details: [
      'Campos do Produto Cadastral: id, nome, unidade (+ disponibilidade com 4 valores: normal, abundante, escassez e indisponivel utilizada nas diretrizes de safra, avisos semanais e formulário). Apelidos e nomes específicos residem exclusivamente nos itens do contrato.',
      'Semântica de Disponibilidade: Normal = liberado para pedido regular; Abundante = em safra/destaque; Escassez = tem pouco (não pode ser pedido no ciclo); Indisponível = não tem de jeito nenhum (também não pode ser pedido). Ambos escassez e indisponível são bloqueados para solicitação no formulário de pedidos.',
      'Desacoplamento Financeiro e Quantitativo: No SIGCAF, o produto cadastral mantém apenas seus dados essenciais de catálogo. Preço unitário e quantidade contratada vivem exclusivamente na collection contrato_itens.',
    ],
  },
  {
    id: '3.3',
    title: 'Cadastro Mestre Global de Escolas',
    route: '/escolas',
    goal: 'Cadastro mestre único, global e independente de contratos para todas as instituições parceiras atendidas, com listagem compacta em linhas, visão detalhada e filtros operacionais por contrato e rota.',
    details: [
      'Campos Cadastrais do Mestre (v0.0.103/v0.0.112): O cadastro mestre mantém nome, código INEP (opcional), dependência administrativa (Federal, Estadual, Municipal, Privada — opcional), tipo (CMEI, CRECHE, INTEGRAL, FUNDAMENTAL, Médio, Técnico), nº de alunos, telefone/WhatsApp, e-mail, bairro, contato, endereço, cep, latitude e longitude.',
      'Campo Dependência Administrativa nas Escolas (v0.0.112): Campo select opcional `dependencia_administrativa` (Federal, Estadual, Municipal, Privada) na coleção `escolas`. Integrado no formulário de criação/edição de escolas com seletor completo e opção vazia (—), exibido na coluna própria "Dependência" na listagem compacta, destacado na ficha de visualização detalhada da escola, integrado às exportações em CSV e Excel (.xlsx), e suportado na pré-visualização e persistência do Importador de Coordenadas e Dados.',
      'Código INEP nas Escolas (v0.0.103): Campo textual opcional `codigo_inep` adicionado à coleção `escolas` via migration idempotente 0099. Disponível no formulário de criação/edição de escola, exibido na coluna própria da tabela/listagem de escolas, incluído na busca global, na visão detalhada e nas exportações CSV e Excel (.xlsx).',
      'Importador de Coordenadas Geográficas, CEP & Código INEP (v0.0.102/v0.0.103): Botão "Importar Coordenadas (XLSX/CSV)" na barra de ações de /escolas para Administradores e Master. Permite upload de arquivo (.xlsx ou .csv) ou colar dados diretamente de planilha. Detecção flexível de colunas por cabeçalho (Escola/Nome, Código INEP, CEP, Latitude, Longitude) e normalização estrita de coordenadas para ponto decimal. Algoritmo inteligente de matching tolerante a variações e títulos honoríficos ("Profª", "Prof.", "Mons.", "CMEIA/CMEI/CM/EM", etc.) e suporte a casamento manual linha a linha por seletor antes da confirmação. Quando a coluna de Código INEP estiver presente na planilha, o valor é casado e atualizado para a escola (preservando o valor existente no banco caso a célula venha vazia).',
      'Regra de Negócio de Rotas: A rota NÃO é atributo fixo da escola no cadastro mestre global. A rota (unificada, correspondente à aba da planilha e ao percurso de entrega) é atribuída no vínculo escola↔contrato (contrato_escolas.rota_id) ou na importação, e sequenciada nas paradas de entrega.',
      'Alargamento & Reordenação de Campos do Modal Editar Escola (v0.0.122): Alargamento do diálogo modal de criação e edição de escolas (/escolas) para formato generoso e responsivo (max-w-[96vw] sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[92vh] com rolagem vertical), eliminando truncamento de dados em campos estreitos (como Telefone/WhatsApp). Reordenação ergonômica em 6 linhas alinhadas à operação: (1) Nome da Instituição Escolar + Código INEP com nota de normalização; (2) Nº de Alunos + Tipo + Dependência Administrativa; (3) Telefone / WhatsApp + Contato / Responsável; (4) E-mail Institucional; (5) Endereço Completo + Bairro; (6) CEP + Latitude + Longitude; rodapé com Cancelar e Salvar Alterações.',
      'Cartão de Visualização Detalhada da Escola & Ordem Operacional (v0.0.120): Reorganização das seções/cards da ficha detalhada de visualização da escola (modal em /escolas) na ordem estrita: (1) Identificação — nome da instituição, tipo de instituição, Código INEP e Dependência Administrativa; (2) Endereço — mantendo o padrão atual de duas linhas (logradouro/número; Bairro — CEP abaixo, na mesma coluna); (3) Contato — Telefone na primeira linha, contato/responsável logo abaixo, sem rótulo; (4) Informações Operacionais — coordenadas (lat/long), alunos matriculados e vínculos operacionais com contratos e rotas.',
      'Listagem Compacta em Linhas & Filtro por Dependência Administrativa (v0.0.118/v0.0.119): Apresentação em linhas via componente Table do shadcn/ui para visualização otimizada de escolas por página (com paginação configurável: 10, 25, 50, 100 linhas). Coluna unificada "Telefone / Contato" (linha 1 com telefone, linha 2 com nome do contato sem prefixo/rótulo), coluna "Endereço & Bairro" em duas linhas empilhadas (linha 1: logradouro e número em font-medium; linha 2: Bairro e CEP no formato "Bairro: X — CEP: Y"), além de Escola/Instituição, Código INEP, Dependência, Tipo, Alunos, E-mail e Ações. Na barra superior de filtros, seletor de "Dependência Administrativa" com opções "Todas as dependências" (padrão), Federal, Estadual, Municipal, Privada e "Não classificadas" (para instituições sem preenchimento do campo), operando em conjunto com a busca textual e com o filtro por tipo.',
      'Visão Detalhada da Escola Selecionada: Ao clicar em uma linha da tabela ou no botão "Ver detalhes", é aberto um painel modal exibindo os dados mestres (nome, código INEP, endereço completo, telefone, e-mail institucional, tipo, alunos, cep e coordenadas lat/long) e informações do cadastro.',
      'Importador Inteligente com Upsert (CSV/XLSX): Importação e reimportação de planilhas de escolas com atualização automática de dados existentes. Escolas já cadastradas exibem comparativo de alterações campo a campo. O usuário conta com seletor de regra de conflito: "Atualizar campos preenchidos no arquivo (manter valores existentes quando o arquivo estiver vazio)" [padrão seguro] vs "Sobrescrever todos os campos com os valores do arquivo". Resumo final detalha separadamente criadas, atualizadas, duplicadas no arquivo e erros.',
      'Princípio de Unicidade & Integridade (R25): A escola é criada UMA VEZ no cadastro mestre e pertence a UM contrato ativo por vez. Prevenção de duplicidade por normalização estrita de nomes e exclusão protegida com verificação prévia de dependências de contratos e pedidos.',
      'Revisão de Coordenadas Sugeridas pelo Motorista (v0.0.231): Diálogo "Revisar Coordenadas" acessível em /escolas e /rotas com badge contador de pendências. Exibe comparativo da coordenada cadastrada atual vs. coordenada sugerida capturada pelo motorista em campo, cálculo de distância em metros/km (Haversine), link direto para abrir no Google Maps, motorista autor e data. Ações: "Aprovar" (atualiza definitivamente latitude e longitude da escola no cadastro mestre) e "Recusar" (mantém histórico com motivo opcional de recusa sem alterar a escola).',
    ],
  },
  {
    id: '3.4',
    title: 'Contratos, Vínculo Unívoco de Escolas, Quantidades Contratadas & Rotas (R25)',
    route: '/contratos',
    goal: 'Gestão institucional dos contratos PNAE/PAA, vínculo de escolas participantes com unicidade de contrato ativo, ciclo de vida operacional, rotas unificadas, quantidades contratadas por produto e tabela de preços acordados.',
    details: [
      'Vínculo Obrigatório com Chamada Pública: Todo contrato pertence a exatamente uma chamada pública (campo chamada_id obrigatório). Uma chamada pública relaciona um ou mais contratos.',
      'Ausência de Vínculo Escola↔Chamada: Não existe vínculo direto escola↔chamada; todos os vínculos operacionais das escolas ocorrem exclusivamente em nível de contrato (contrato_escolas).',
      'Princípio de Vínculo Único por Escola (R25): Uma escola pertence a NO MÁXIMO UM contrato ativo por vez. Tentativas de vincular uma escola já ativa em outro contrato são estritamente bloqueadas com a mensagem "Escola já vinculada ao contrato {nome} — desvincule-a lá antes de vincular aqui", oferecendo atalho visual direto para abrir o contrato conflitante.',
      'Ciclo de Vida do Contrato: Ativo → Encerrado | Cancelado (com suporte a Pendente para rascunhos). O ciclo de vida formaliza o encerramento das atividades de atendimento e fornecimento.',
      'Ação "ENCERRAR CONTRATO": Botão disponível diretamente na listagem de /contratos (fora do modal). Ao ser acionada, o contrato deixa de receber novos pedidos, importações de planilha ou despachos logísticos. TODOS os vínculos ativos de escolas participantes são imediatamente liberados (contrato_escolas marcado com timestamp em encerrado_em, tornando as escolas livres para vinculação em outros contratos). Proteções estritas: ciclo em fase não-terminal exige confirmação explícita adicional ("encerrar cancela a participação dele no ciclo"); se houver atestos já emitidos no ciclo atual, a ação é expressamente BLOQUEADA.',
      'Ação "CANCELAR CONTRATO": Botão dedicado e separado de Encerrar na listagem de /contratos. Aplica o mesmo efeito de encerramento e liberação de escolas, com a exigência obrigatória de justificativa/motivo do cancelamento gravado no banco (motivo_cancelamento) e auditoria completa.',
      'Ação "DESVINCULAR ESCOLA": Acessível no modal de contrato, na aba Escolas, com diálogo próprio de confirmação ("A escola {nome} deixa de pertencer a este contrato. Pedidos já existentes permanecem no histórico."). Ação bloqueada preventivamente se a escola possuir pedidos em aberto (Pendente, Em Rota ou Entregue sem atesto) em ciclo não-terminal do contrato. O vínculo não é apagado fisicamente: é marcado com a data de término (campo encerrado_em), preservando a integridade histórica.',
      'HISTÓRICO PRESERVADO: Pedidos, atestos, importações e despachos de contratos encerrados ou cancelados NUNCA são apagados — mantêm suas chaves estrangeiras (FKs) intactas e permanecem totalmente acessíveis em Relatórios, Histórico de Ciclos e auditorias da cooperativa. Apenas nenhuma nova movimentação é admitida no contrato.',
      'Modelo de Dois Níveis de Nome de Produto (Nome no Contrato vs Nome Mestre): Na collection contrato_itens, cada item possui os campos nome_contrato e apelidos (AKAs no contrato). O nome no contrato nasce pré-preenchido com o nome do produto mestre e pode ser customizado livremente para refletir a redação exata do edital/contrato assinado. A interface exibe o Nome no Contrato em destaque com campo editável e o nome mestre do catálogo atenuado quando diferente.',
      'Quantidades Contratadas por Produto & Valor Total Calculado: Cada item do contrato permite informar preço unitário e quantidade contratada (campo quantidade_contratada em contrato_itens). Quando os itens têm quantidades informadas, o Valor Total Contratado é a soma exata dos produtos (preço × quantidade contratada) e o campo total é recalculado automaticamente em tempo real.',
      'Quantidades Contratadas Inteiras & Valor Total Calculado (v0.0.108): Cada item do contrato aceita quantidade contratada exclusivamente em números inteiros (sem frações decimais — regra de meio quilo é específica de itens em pedidos). Digitação descarta decimais/vírgulas; campo pode ficar em branco. Colunas de Preço Unitário, Quantidade e Subtotal com largura expandida, sem truncamento, no modal ampliado (até 96vw / 6xl).',
      'Importador em Massa de Contratos e Vínculos de Escolas por Chamada (v0.0.124): Botão "Importar Contratos em Massa" na barra de ações de /contratos para perfis Master e Administrador. Permite carga via arquivo (.xlsx, .csv) ou colar dados diretamente da área de transferência. O usuário seleciona a Chamada Pública obrigatória que acolherá os contratos (herdando Programa, Modalidade e Dependência Administrativa). A carga opera no formato "uma linha por vínculo contrato×escola", suportando tanto 1 escola por contrato quanto múltiplas escolas vinculadas ao mesmo contrato mediante repetição do código (idempotente: contrato existente com mesmo código na chamada não é duplicado, apenas recebe as novas escolas participantes). Cabeçalhos flexíveis para Contrato, Nome da Escola, Código INEP (chave preferencial opcional), Valor Total e Datas de Início/Fim (com descarte estrito de colunas de rotas). Algoritmo inteligente de casamento de escolas com normalização de prefixos/títulos e seletor manual na pré-visualização para pendências e ambiguidades antes da gravação.',
      'Preço Soberano da Chamada na Importação em Massa de Contratos (v0.0.109): Na importação em massa de itens do contrato (seja via planilha/CSV ou colar em massa), qualquer preço contido no arquivo ou texto colado é estritamente ignorado — o sistema mantém sempre o preço soberano da chamada (chamada_itens.preco). Apenas a quantidade é capturada do arquivo/colagem como inteiro >= 0 (vazio = não contratado). Na pré-visualização dos dois modais, a coluna de preço é somente leitura "Preço da Chamada (Soberano)" formatada à direita em R$ 0,00, com nota explicativa ("Preços herdados da chamada; valores do arquivo são ignorados.") e subtotais/total recalculados com o preço soberano.',
      'Soberania dos Preços da Chamada Pública (v0.0.254): A fonte soberana e canônica de preço de produtos é a coleção chamada_itens da Chamada Pública vinculada ao ciclo/contrato. A coleção contrato_itens atua estritamente como espelho de compatibilidade e fallback. Todos os fluxos operacionais de entrada de pedidos (Lançar Pedido manual, Colar Pedido, Importação Excel de Pedidos e Formulário Público do WhatsApp) resolvem o preço prioritariamente em chamada_itens da respectiva chamada, evitando pedidos com preços defasados quando a chamada é atualizada sem re-salvamento do contrato.',
      'Sincronização Automática do Espelho de Preços (v0.0.255): A fonte soberana e canônica de preços de produtos é a coleção chamada_itens. Ao salvar ou importar preços da Chamada Pública (edição de chamada, colagem de itens ou importação de planilha em ChamadaItemsManager), o espelho em contrato_itens de TODOS os contratos vinculados a essa chamada é sincronizado no ato (sincronizarEspelhoChamadaContratos). A atualização altera SOMENTE o campo preco em contrato_itens (resolvendo 1º por produto_id e 2º por nome normalizado), sem tocar em quantidade_contratada, nome_contrato, apelidos ou pedido_itens (cujos snapshots históricos são 100% preservados). Itens existentes apenas no contrato ou na chamada são respeitados sem exclusões ou criações indevidas. Se algum preço mudar e o contrato possuir itens com quantidade > 0, o campo contratos.valor_total é recalculado e persistido automaticamente.',
      'Desacoplamento de Rotas na Importação de Escolas em Contratos (v0.0.110): Na importação de escolas vinculadas a um contrato (/contratos), a exigência de atribuição de rota foi completamente removida. Contrato não detém rotas (rotas pertencem à Chamada pública, rotas.chamada_id). A importação de escolas por planilha/CSV ou colagem em massa cria e atualiza diretamente os vínculos escola↔contrato (contrato_escolas) e atualiza os dados no cadastro mestre, sem validação, campo obrigatório, seletor de fallback ou bloqueio referente a rotas.',
      'Herança Estrita de Produtos da Chamada & Remoção do Seletor de Catálogo (v0.0.111): No modal de Editar Contrato (/contratos, aba "Itens & Preços"), o botão "Selecionar Produtos" e seu modal de seleção de catálogo em lote foram removidos. No modelo de herança do SIGCAF, os itens, nomes/AKAs, unidades e preços unitários do contrato são herdados exclusivamente da Chamada Pública vinculada (chamada_itens). O contrato informa apenas as quantidades contratadas (números inteiros, podendo ficar em branco). Os botões "Importar Planilha / CSV" e "Colar em Massa" foram preservados para inserção ágil de quantidades, operando sempre sobre os preços soberanos da chamada.',
      'Valor Total Opcional na Criação e Recálculo Sobreposto (v0.0.106): No formulário de criação/edição de contrato, o campo Valor Total é opcional — permite salvar com valor zero ou vazio (gravando 0) sem bloquear a validação. Quando o contrato não tem itens, o valor total 0 é um estado perfeitamente válido. Quando quantidades forem informadas posteriormente nos itens do contrato (tela de itens, planilha importada ou colada), o valor total do contrato é recalculado (soma de quantidade × preço de cada item) e sobreposto ao valor anterior, inclusive o zero da criação.',
      'Opção sem Quantidades (Total Informado Diretamente): É permitido não preencher quantidades contratadas e informar o valor_total do contrato diretamente na aba Dados Gerais (inclusive 0 na criação/edição). O sistema identifica e sinaliza claramente na interface o modo em uso: "Total calculado pelos itens" ou "Total informado diretamente".',
      'Importação em Massa via Planilha / CSV: Suporte a upload de arquivo (.xlsx ou .csv) contendo Produto, Preço Unitário e Quantidade Contratada, com preview estruturado, validação estrita contra o catálogo de produtos, cálculo do total da planilha e confirmação em lote. O nome original na planilha é gravado no campo nome_contrato do item. Linhas sem correspondência na tabela mestre podem ser resolvidas na própria importação definindo o AKA — associando a um produto mestre existente (nome da planilha vira apelido do item do contrato) ou criando o produto mestre na hora.',
      'Colar em Massa com Quantidades: Aceita colar linhas copiadas do Excel ou texto com separadores (tabulação, ponto-e-vírgula ou vírgula) nas colunas "Produto; Preço; Quantidade", com preview comparativo e resolução inteligente de nomes contra o catálogo.',
      'Execução e Cotas de Referência: O realizado do contrato continua derivado dos pedidos entregues. A quantidade contratada cadastrada no item passa a atuar como cota do produto no contrato, permitindo acompanhar o saldo e a porcentagem de execução por produto e por escola participante.',
      'Nº de Rotas Opcional no Contrato: No modal de criação/edição de contrato, o campo "Número de Rotas" (num_rotas_logisticas) é opcional (sem valor pré-fixado obrigatório). Caso não seja preenchido, o contrato aceita rotas ilimitadas.',
      'Modelo Unificado de Rotas: As rotas cadastradas no contrato (collection rotas) representam tanto a referência da aba da planilha da secretaria quanto a rota de distribuição da cooperativa, vinculadas via contrato_escolas.rota_id.',
      'Vínculo de Escolas via Cadastro Mestre: Na aba de escolas do contrato, o usuário realiza busca e autocomplete sobre a collection escolas do cadastro mestre, respeitando a unicidade de contrato ativo.',
      'Roteamento Estrutural por Escolas: As rotas e o sequenciamento são estruturados sobre as escolas vinculadas ao contrato (contrato_escolas), de forma duradoura entre ciclos. Pedidos herdam a rota automaticamente da respectiva escola.',
      'Cadastro Rápido sem Duplicação: Permite cadastrar uma nova escola diretamente dentro do contrato; o sistema normaliza o nome e reutiliza o registro existente no cadastro mestre caso já haja escola correspondente.',
      'Modalidade de Pedido: individualizado (cada escola faz seu pedido via WhatsApp/formulário online) ou centralizado (pedidos consolidados via importação de planilha Excel da secretaria).',
      'Tipo de Importação da Planilha de Pedidos (campo tipo_importacao na coleção contratos): Declara como a Secretaria de Educação entrega as planilhas de pedido do contrato. Aplicável exclusivamente à modalidade Centralizada: (1) Única (padrão) — a Secretaria envia um arquivo consolidado com o pedido. Exibe a configuração complementar "Estrutura da planilha" (simples ou com abas) e o cadastro de abas em abas_planilha (ex.: ROTA A, ROTA B, ZONA RURAL), onde cada aba do arquivo é casada com as escolas do contrato na importação Excel (/importacao e /pedidos); (2) Fracionada — a Secretaria envia vários arquivos ao longo do tempo (remessas/semanas), mantendo o cadastro de abas oculto na interface pois cada remessa chega como planilha própria. Onde aparece no sistema: seletor no formulário de criar/editar contrato (visível apenas quando a modalidade é Centralizada, alternando a exibição dos campos de estrutura e abas); badge "Única" / "Fracionada" no cartão e na listagem de contratos; seção "Regra de Importação" na visualização detalhada do contrato; e card informativo na Importação Excel (/pedidos e /importacao) exibindo o tipo configurado e, quando Única com abas, todas as abas mapeadas. Efeito prático: nenhum cálculo financeiro, preço unitário ou dado cadastral é alterado — trata-se estritamente de parametrização de formato de importação e ergonomia de interface.',
      'Relatório de Execução do Contrato: cards globais de Total Contratado, Total Realizado e % Execução, com detalhamento de entregas por escola participante (quantidades realizadas, preços unitários e valores realizados).',
    ],
  },
  {
    id: '3.5',
    title: 'Gestão de Pedidos & WhatsApp',
    route: '/pedidos',
    goal: 'Registro, validação, acompanhamento de status e rastreamento de pedidos das escolas.',
    details: [
      'Novo Fluxo de Criação Orientado a Ciclo (v0.0.143): O modal "Lançar Pedido" (/pedidos) é conduzido pelo Ciclo Operacional (selectedCicloId). Lista exclusivamente ciclos com status "coletando" ou "correcao" com rótulo "Ciclo {numero}/{ano} [{chamada}] — {fase}". Na ausência de ciclo aberto em coleta ou correção, exibe Alert âmbar explicativo orientando a abertura em Monitoramento e desabilita escola, itens e submissão.',
      'Chamada Pública Soberana & Badge Contextual (v0.0.143): A Chamada Pública é derivada diretamente do ciclo selecionado (ciclo.chamada_id), exibida em badge destacado no cabeçalho ("Chamada {numero} • {dependencia}"). O seletor manual de contrato foi completamente removido do diálogo.',
      'Seleção Manual de Escola por ID Cadastral (sem casamento por nome): O seletor de escola apresenta a união desduplicada por ID das escolas vinculadas aos contratos ativos (status="Ativo") da chamada do ciclo selecionado, exibindo Nome, Código INEP (se houver) e Rota Logística associada. Regra fundamental do sistema: a escola é SEMPRE selecionada manualmente pelo operador na lista oficial por seu ID único no banco — nunca é feito casamento/pré-seleção automática por nome, pois existem instituições homônimas na rede (ex.: Centros de Educação e Colégios Municipais distintos com mesmo patrono). Em textos e comprovantes colados, o nome da escola porventura detectado tem caráter puramente informativo.',
      'Funcionalidade "Colar Produtos" em Lote (v0.0.143 / v0.0.153): Botão dedicado "Colar Produtos" no diálogo "Novo Pedido" que abre modal de colagem direta de texto contendo produto e quantidade ou comprovante de pedido gerado. A ação tem propósito estrito de adicionar/popular produtos na lista de itens do pedido em criação (com fusão somada de itens repetidos, preservando o diálogo aberto e sem submissão precoce). A gravação é exclusiva do botão "Salvar Pedido". O botão Salvar Pedido conta com validação ativa e mensagens orientadoras (ciclo, escola, itens > 0).',
      'Itens da Chamada & Múltiplos de 0,5 (v0.0.143): Os itens e preços unitários são herdados com soberania da Chamada Pública (chamada_itens). As quantidades aceitam múltiplos de 0,5 (step 0.5, ex.: 0,5 / 1,0 / 1,5), com subtotais e valor total recalculados em tempo real na interface.',
      'Gravação Automática com Derivação de Contrato e Rota (v0.0.143): No salvamento, o sistema vincula o pedido diretamente ao ciclo selecionado (ciclo_id) e deriva automaticamente a rota da escola escolhida nos contratos ativos da chamada em segundo plano.',
      'Campos: id, numero, escola_id (FK escolas), ciclo_id (FK ciclos), origem (excel / whatsapp / manual / formulario), rota_id (FK rotas — rota unificada que mapeia a aba de origem e o percurso), validacao (json: status, motivo, detalhes), data_prevista, status (Pendente / Em Rota / Entregue / Cancelado), entregue_em, entregue_por (FK users), motivo_cancelamento, cancelado_em.',
      'Origens de Pedido: excel (importação de planilha centralizada), whatsapp (lançamento individual), manual (lançamento interno) e formulario (submissão direta online da escola via R24).',
      'Fluxo de Status do Pedido: transições controladas na listagem de pedidos (Pendente → Em Rota → Entregue, e Cancelado).',
      'Regras Estritas de Cancelamento: pedidos Pendentes (não despachados) podem ser cancelados com motivo livre; pedidos despachados (Em Rota) só podem ser cancelados por motivos logísticos da cooperativa (veículo indisponível, produto indisponível, endereço inacessível, escola fechada, outro motivo logístico com detalhe livre). O cancelamento é definitivo e irreversível (sem retorno para Pendente).',
      'Coluna e Detalhes de Cancelamento: exibição destacada do motivo do cancelamento e timestamp cancelado_em tanto na tabela de pedidos quanto no diálogo de visualização detalhada.',
      'Validação Automática do Pedido: inválido apenas se vazio ou com todas as quantidades zeradas. Não existe regra de compensação de escassez (regra removida — a correção de escassez é negociada diretamente com a cooperativa fora do formulário).',
      'Filtros Avançados com Chamada e Ciclo em Cascata (v0.0.248): Barra de filtros em /pedidos equipada com seletores dedicados de Chamada Pública e Ciclo Operacional. O seletor de Chamada lista "Todas as Chamadas" e as chamadas cadastradas (número e programa, ex.: "01/2025 (Municipal)"); o seletor de Ciclo lista "Todos os Ciclos" e opera em cascata estrita, desabilitado quando nenhuma chamada estiver selecionada ou quando não houver ciclos para a chamada, com reset automático para "Todos os Ciclos" ao alternar a chamada. A filtragem na listagem é cumulativa e estrita: por chamada (filtra pedidos cujo ciclo_id pertença à chamada selecionada via mapa cicloId→chamada_id, excluindo pedidos sem cicloId) e por ciclo (comparação estrita o.cicloId === filterCiclo, nunca por data de entrega). O botão "Limpar filtros" reseta simultaneamente todos os seletores. Preserva 100% intactos o modal de criação "Lançar Pedido", o Ciclo Corrente e as 4 telas de entrega.',
      'Filtros avançados por origem (incluindo filtro por Formulário), status de entrega e validação.',
    ],
  },
  {
    id: '3.6',
    title: 'Importação de Pedidos (Excel Centralizado)',
    route: '/importacao',
    goal: 'Carga de pedidos em contratos centralizados via planilha .xlsx da Secretaria de Educação.',
    details: [
      'Regra de Provisionamento e Integridade dos Vínculos: O importador de pedidos NUNCA cria vínculo em contrato_escolas. Escola da planilha não vinculada ao contrato (por ter saído intencionalmente ou nunca ter entrado) vira PENDÊNCIA resolvida por decisão humana: "Vincular ao contrato" pré-preenchido e confirmado no modal de contrato, ou "Cadastrar escola" — nunca re-vínculo automático.',
      'Cadeia Estrita de Provisionamento: importador de escolas → cadastro mestre → modal de contrato (vínculo nasce exclusivamente aqui) → importador de pedidos.',
      'Restrição a Contratos Ativos: O importador centralizado considera apenas contratos Ativos (contratos encerrados ou cancelados não recebem importação de pedidos).',
      'Matching de Produtos em Cascata (Dois Níveis): A identificação do produto na planilha da secretaria prioriza em 1º lugar os itens vinculados ao contrato (nome_contrato e apelidos/AKAs do contrato, tolerante a ruídos, pontuação e sufixos); em 2º lugar recorre ao catálogo mestre global (apenas pelo nome oficial do produto). Se não houver correspondência em nenhum dos níveis, o item é tratado como pendência bloqueante no preview da importação.',
      'Matching contra o Cadastro Mestre Global de Escolas: A identificação das colunas é feita contra o diretório global de escolas (e não somente contra os vínculos prévios do contrato).',
      'Fluxo de Pendências Inteligente: Se a escola existe no cadastro mestre mas não está vinculada ao contrato atual, exibe a pendência "Vincular ao contrato" com rota e vínculo pré-preenchidos para confirmação com 1 clique. Se não existe no cadastro mestre, exibe a pendência "Cadastrar escola" (o importador continua sem criar registros automaticamente na surdina).',
      'Regras Estritas de Matching: Mantém regras de tolerância a acentos, maiúsculas, pontuação e apelidos entre parênteses (CEDAL, CEROM, CMEI Várzea), com tratamento comprovado dos casos "EM PAULINO CUSTÓDUIO REZENDE" ≡ "EM PAULINO CUSTÓDIO DE REZENDE" e distinção mandatória "CM LAR DE ISABEL" ≠ "EM LAR DE ISABEL".',
      'Suporte ao Tipo de Importação do Contrato (tipo_importacao) & Abas Dinâmicas: Respeita a parametrização do contrato selecionado — quando "Única" com abas cadastradas em abas_planilha, o importador processa as abas indicadas (ex.: ROTA A, ROTA B, ROTA C ou nomes customizados) casando-as com as escolas; quando "Única" simples ou "Fracionada", opera em remessa sem filtro de abas pré-definidas. O card informativo de seleção do contrato em /importacao e /pedidos destaca o tipo de importação ativo e a relação de abas mapeadas.',
      'Suporte a 5 abas: ROTA A, ROTA B, ROTA C (a importar), TOTAL e TODAS UNIDADES (a ignorar).',
      'Mapeamento Escola-por-Coluna (transposto): linha 7 (nome das escolas), linhas 10-34 (25 produtos na coluna C e quantidades nas colunas das escolas), linha 35 (totais). Ignora seção FIXOS.',
      'Resolução de Preço Soberano da Chamada (v0.0.254): Ao processar o Excel da secretaria, o importador resolve o preço unitário de cada item buscando primeiramente em chamada_itens da chamada vinculada ao contrato/ciclo selecionado (casando por produto_id ou nome normalizado); o preço de contrato_itens é utilizado apenas como fallback caso o item não esteja na chamada.',
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
      'Modo de Filtro "Por rota" na aba Por Produto: seletor com opção "Todas as escolas" e "Por rota". Ao ativar "Por rota", abre-se um box (select) dinâmico listando exclusivamente as rotas da chamada selecionada no relatório.',
      'Apresentação e ordenação estrita na sequência oficial das paradas da rota: quando uma rota é selecionada, a matriz exibe somente as escolas pertencentes à rota na ordem exata de suas paradas (paradas_rota.ordem), com badge numerado #N da parada, e não por ordem alfabética.',
      'Coluna de Total posicionada à esquerda ao lado de Produto (e de Escola na aba recíproca), otimizando a leitura imediata da demanda consolidada antes das colunas parciais.',
      'Filtro de Ocultar Vazios (sem demanda), alternador "Somente coluna de Total" e busca rápida.',
      'Exportação para Planilha Excel (.xlsx), Documento PDF (.pdf) e CSV (.csv) com totalizadores alinhados à esquerda e respeito integral ao filtro por rota e sequência das paradas.',
    ],
  },
  {
    id: '3.8',
    title: 'Roteamento, Despacho Logístico & Gestão de Motoristas',
    route: '/rotas',
    goal: 'Rotas criadas no nível da Chamada integrando escolas de múltiplos contratos, sequenciamento de paradas, otimização geográfica partindo do Depósito Central, cadastro de motoristas, despacho operacional e acompanhamento de entregas em tempo real.',
    details: [
      'Cadastro Centralizado de Motoristas da Cooperativa: Botão "Motoristas" na barra superior de /rotas e atalho "Gerenciar Motoristas" dentro do diálogo modal de despacho. Cadastro único para toda a cooperativa mantendo nome completo, telefone para contato e status ativo/inativo. O motorista é vinculado dinamicamente à rota no momento da confirmação do despacho (coleção rota_despachos), permitindo reutilização flexível entre ciclos e rotas.',
      'Fluxo de Despacho em Dois Estágios no Cartão da Rota: Gestão visual e transacional clara no cartão de cada rota em /rotas:',
      '• Estágio 1 (Antes do Despacho): Exibe badge visual "Aguardando Despacho" e botão principal "Despachar Rota". O acionamento abre o modal de despacho com seleção do motorista responsável, conferência de paradas e cálculo de métricas. Travas estritas de integridade: o despacho só é liberado após o encerramento da coleta da chamada (status coleta_encerrada), exigindo obrigatoriamente que a rota possua pedidos ativos e que tenha paradas sequenciadas e gravadas pelo roteamento.',
      '• Estágio 2 (Após Despacho Confirmado): O botão "Despachar Rota" desaparece e é substituído pelo badge laranja destacado "Em Rota". Fica disponível o botão "Reenviar Link Motorista" (que gera/renova o token seguro de acesso e monta mensagem pronta com link para cópia e envio manual no WhatsApp pelo operador — o sistema não faz disparo automático de WhatsApp) e o botão "Rota Entregue" torna-se habilitado para conclusão formal da rota.',
      'Acompanhamento das Entregas em Tempo Real na Central: Sem necessidade de recarregamento manual da página nem polling ineficiente. A interface é alimentada reativamente pelas assinaturas em tempo real do banco de dados (coleção `entrega_registros`):',
      '• Caminhão Avançando Entrega a Entrega no Mapa: Conforme o motorista registra as entregas no Portal, o marcador de caminhão 🚚 avança automaticamente para a última parada confirmada (posicionado no Depósito Central antes da primeira entrega e consolidado na última parada ao concluir).',
      '• Destaque Visual do Trecho e Etiqueta de Confirmação: O trecho já percorrido entre as paradas confirmadas é destacado com traçado em vermelho proeminente pelas rodovias, e cada parada finalizada exibe etiqueta destacada "✓ Entregue HH:mm" com a hora real em que a entrega foi confirmada no local.',
      '• Modal Somente Leitura "Dados da Entrega": Ao clicar sobre a etiqueta da entrega no mapa ou sobre a parada na lista de paradas da rota, abre-se o modal detalhado de auditoria contendo: horários reais de chegada e confirmação, assinatura digital em canvas perfeitamente legível, foto do material entregue com visualizador em tela cheia (zoom/preview expandido), observações registradas pelo motorista, identificação do "Motorista" (rótulo conciso), dados de quem recebeu na unidade ("Recebido por: Nome — CPF", quando preenchidos) e número do contrato do vínculo.',
      'Consistência de Métricas e Remoção de Contrato Ref no Card (0.0.97): Unificação do cálculo de Volume Total e Valor Total para computar exclusivamente pedidos ativos/em trânsito (Pendente e Em Rota), eliminando contradição entre "Pedidos Ativos: 0" e contagem legada de itens cancelados.',
      'Rotas no Nível da Chamada: A coleção `rotas` opera primariamente associada a `chamada_id` (com `contrato_id` preservado para legado). Em uma rota, a cooperativa pode agrupar escolas de diferentes contratos vinculados à mesma chamada pública.',
      'Catálogo Unificado de Escolas da Chamada: Na montagem do roteamento, o sistema carrega os vínculos `contrato_escolas` de todos os contratos com aquele `chamada_id`, disponibilizando uma visão unificada para seleção e distribuição nas rotas.',
      'Identificação Visual do Contrato de Origem: Na listagem de paradas e pedidos, cada escola exibe um badge sutil com o número do contrato de origem (ex.: "C-2026-01"), preservando a clareza institucional.',
      'Sequência de Paradas com Expansão Sob Demanda dos Pedidos: Na lista de paradas da rota, os itens das escolas iniciam por padrão recolhidos (apenas cabeçalho com nome, endereço, alunos, badge de contrato e contador de pedidos). A lista detalhada de pedidos de cada escola expande sob demanda com chevron animado.',
      'Otimização Geográfica de Rotas Partindo do Depósito Central Configurável: Heurística do vizinho mais próximo + melhoria local 2-opt com cálculo Haversine utilizando o Depósito Central da cooperativa (/configuracoes) como ponto de partida fixo da rota.',
      'Visualização Interativa em Mapa da Rota (Leaflet + OpenStreetMap + OSRM): Painel cartográfico integrado exibindo o traçado pelas vias rodoviárias reais via serviço OSRM (Open Source Routing Machine), pinos numerados, marcador do Depósito Central, trecho tracejado de saída, estimativa de quilometragem e tempo, e fallback resiliente em linha reta.',
      'Resolução do Ciclo Ativo da Chamada da Rota no Despacho (v0.0.137): O despacho de rotas e as validações de fase/pedidos pendentes resolvem estritamente o ciclo ativo da CHAMADA À QUAL A ROTA PERTENCE. Pedidos pendentes e fases de contrato são validados contra o ciclo ativo da respectiva chamada.',
      'Entrega por Rota Inteira (Fechamento pela Central): Fechamento "Rota Entregue" pela secretária: acionamento único, sem registro entrega a entrega, toda a rota entregue de uma vez, em nome do usuário logado, no horário do ato, com campo de observação opcional; o encerramento desativa o despacho na hora e todas as telas (Rotas de Entrega, Monitoramento, Dashboard) reagem em tempo real, sem recarregar a página.',
      'Bloqueio de Edição em Rotas de Ciclo Fechado/Cancelado ou Rota Entregue (v0.0.230): Rotas pertencentes a ciclos em status terminal (fechado ou cancelado) ou rotas com entregas concluídas (todos os pedidos com status Entregue, sem despacho ativo) ficam estritamente travadas contra edições operacionais. O arrastar-e-soltar (drag-and-drop) das paradas é desabilitado (cursor padrão), os containers não aceitam drop e os botões "Importar Arquivo", "Roteamento", "Sugerir rota otimizada", renomear (ícone lápis), excluir rota e transferir escola são desabilitados ou ocultados. A consulta aos dados, mapa e histórico da rota permanece 100% liberada.',
      'Isolamento da Ordem de Paradas por Ciclo via Retenção Histórica (v0.0.230): A reordenação manual das paradas de uma rota grava um snapshot de composição com versão de evento "edicao" especificamente vinculado ao ciclo selecionado (`salvarComposicaoCiclo`), isolando a ordem entre ciclos diferentes. Alterações efetuadas na sequência de um ciclo ativo não alteram a visualização de ciclos anteriores despachados ou fechados, que continuam exibindo com fidelidade a ordem congelada registrada no momento da respectiva operação.',
      'Isolamento Estrito do Estado da Rota por Ciclo Selecionado & Anti-Vazamento (v0.0.239): O estado da rota (badges "Aguardando Despacho", "Em Rota" e "Rota Entregue", travas de edição e controles operacionais) é calculado e indexado de forma estritamente isolada pelo ciclo selecionado em /rotas e /monitoramento. Todos os novos despachos gravam obrigatoriamente `ciclo_id` na coleção `rota_despachos` e em `despachos`. Registros legados sem `ciclo_id` são correlacionados estritamente pela janela temporal do ciclo (datas de início e fim). Despachos de ciclos anteriores jamais vazam para ciclos subsequentes: caso o ciclo selecionado possua pedidos "Em Rota" e zero entregas confirmadas naquele ciclo, o badge da rota é obrigatoriamente "Em Rota" (âmbar), preservando a trava de edição e a integridade de ciclos concorrentes.',
    ],
  },
  {
    id: '3.8B',
    title: 'Portal do Motorista & Navegação Google Maps',
    route: '/motorista?token=...',
    goal: 'Interface web pública, responsiva e otimizada para uso em smartphones pelos motoristas durante as entregas, com funcionamento 100% offline, integração com Google Maps, coleta de assinaturas e fotos.',
    details: [
      'Acesso Público e Seguro sem Login: Acesso instantâneo via link exclusivo contendo token criptográfico assinado (/motorista?token=...). Não exige instalação de aplicativo nem credenciais de login. Exibe selo de versão "SIGCAF vX.X.X" fixo no topo, garantindo rastreabilidade do ambiente em execução.',
      'Visão do Roteiro e Progresso: Apresenta a relação ordenada das paradas na sequência oficial de entrega, com nome da escola, identificação do contrato de origem do vínculo, endereço completo e contador de progresso visual "X de N entregas".',
      'Atalho e Navegação no Google Maps por Parada: Cada parada da listagem conta com botão de atalho direto para abrir o aplicativo do Google Maps no smartphone com as coordenadas exatas da escola.',
      'Mapa Dinâmico do Trecho a Percorrer: Mapa integrado que traça com precisão o trecho ativo do deslocamento:',
      '• Antes da primeira entrega: traçado partindo do Depósito Central da cooperativa (/configuracoes) até a Parada #1;',
      '• Entre entregas: traçado da última parada confirmada até a próxima parada pendente da sequência;',
      '• Conclusão da rota: indicação de "Rota concluída" com mensagem de parabéns quando todas as paradas forem finalizadas.',
      '• Métricas do Trecho & Botão "Navegar no Google Maps": Exibe a distância estimada (em km) e a previsão de tempo de chegada do trecho ativo. Inclui o botão proeminente "Navegar no Google Maps" que envia tanto a ORIGEM quanto o DESTINO (duas coordenadas geográficas) para o Google Maps, permitindo navegação curva a curva em tempo real no app nativo.',
      'Registro Completo de Entrega por Parada: Formulário intuitivo acionado na parada correspondente contendo:',
      '• Rótulo do Motorista: Identificação no cabeçalho e nos dados com o rótulo "Motorista" (simplificado, deixando a palavra "responsável" exclusivamente para a pessoa que recebe e confere na unidade escolar).',
      '• Horários Automáticos: Registro automático do horário de chegada ao abrir o formulário na escola e do horário de confirmação ao clicar em salvar, prevenindo adulteração manual.',
      '• Identificação do Responsável pelo Recebimento: Campos específicos para "Nome do Responsável" e "CPF do Responsável" (opcional). O campo de CPF conta com máscara automática (000.000.000-00) e validação matemática estrita dos dígitos verificadores; caso informado e incorreto, o sistema bloqueia a submissão exibindo mensagem de erro clara ("CPF inválido"). Quando em branco, o registro é aceito normalmente por ser opcional.',
      '• Assinatura Digital em Canvas: Área de assinatura tátil responsiva para o conferente/responsável da escola assinar com o dedo na tela do celular ou com o mouse.',
      '• Registro Fotográfico com Compressão no Dispositivo: Captura opcional de foto do material/produtos entregues (via câmera do smartphone ou galeria de fotos). O sistema realiza a compressão inteligente da imagem no próprio dispositivo do motorista antes do armazenamento, economizando franquia de dados móveis e tempo de transmissão.',
      '• Observações do Motorista: Campo de texto livre para anotações de campo (avarias, responsáveis ausentes, ressalvas de recebimento).',
      'Operação e Resiliência 100% OFFLINE: Projetado especificamente para zonas rurais e áreas sem cobertura de internet móvel:',
      '• Fila Local Segura: Na ausência de sinal de internet, os registros de entrega concluídos são salvos em fila local criptografada no armazenamento interno do navegador (localStorage/IndexedDB).',
      '• Sincronização Automática em Ordem: O portal monitora a reconexão à internet (evento "online" do dispositivo e rotina periódica de retry). Assim que a conexão é restabelecida, a sincronização é disparada automaticamente, transmitindo os registros na ordem cronológica em que foram efetuados.',
      '• Preservação dos Horários Reais da Entrega: A persistência no banco grava os horários reais em que o motorista realizou a entrega no campo (chegada e confirmação originais), e NÃO o momento posterior em que os dados foram sincronizados.',
      'Sugestão de Coordenadas Geográficas da Escola pelo Motorista (v0.0.231): Ao confirmar a entrega no celular, a coordenada GPS capturada naquele instante é registrada como SUGESTÃO na coleção `coordenada_sugestoes` (com precisão métrica, data/hora, motorista e ciclo). A coordenada NÃO é aplicada diretamente na escola: entra em fila pendente para revisão da cooperativa em /escolas e /rotas. Conta com deduplicação inteligente (tolerância < 50m) para não poluir a fila em entregas subsequentes.',
      'Isolamento Estrito por Ciclo e Anti-Vazamento no Portal do Motorista (v0.0.241): O carregamento da rota no portal do motorista (`carregarPortalMotorista`) resolve estritamente o `ciclo_id` e a janela de datas do despacho ativo (com fallback legado pelo ciclo ativo da chamada), consultando registros de entrega estritamente casados com `ciclo_id` ou `despacho_id`. Aplica regra anti-vazamento absoluta: quando o ciclo possui pedidos "Em Rota" e zero entregas confirmadas naquele ciclo, nenhum registro de ciclo anterior contamina a tela; todas as paradas permanecem com o botão "Registrar Entrega", o contador de entregas feitas inicia em 0/N e o banner verde de conclusão não é exibido indevidamente.',
    ],
  },
  {
    id: '3.9',
    title: 'Monitoramento do Ciclo Operacional',
    route: '/monitoramento',
    goal: 'Controle das fases do ciclo operacional, regras de transição, gestão de fechamento e painel de alertas para contato direto.',
    details: [
      'Ciclo por Chamada Pública (v0.0.127): Cada ciclo operacional pertence obrigatoriamente a uma Chamada Pública (campo `chamada_id` em `ciclos`). O sistema garante no máximo 1 ciclo ativo por chamada pública em paralelo, permitindo que chamadas distintas (ex.: Municipal e Estadual) operem seus ciclos de forma totalmente independente.',
      'Número do Ciclo = Semana ISO do Ano (v0.0.127): O número sugerido do ciclo corresponde ao número da semana do ano (ISO-8601, semana 1 a 53), editável pelo usuário com bloqueio estrito contra duplicidade de número+ano dentro do sistema.',
      '3 Dias Configuráveis por Chamada (v0.0.127 / v0.0.147): A regra semanal de cada chamada define 3 marcos operacionais: dia de início (abertura), dia de despacho/entrega e dia de fim (encerramento da semana operacional), parametrizáveis por chamada (ex.: Quarta/Segunda/Terça na Chamada Municipal 01/2025; Quarta/Terça/Terça na Chamada Estadual 07/2025). O cálculo automático e a exibição de despacho/entrega em todas as telas respeitam soberanamente os dias cadastrados na chamada correspondente.',
      'Ajuste Manual de Datas com Validação da Mesma Semana (v0.0.127): O usuário pode ajustar manualmente as datas do ciclo ao criá-lo ou editá-lo, com validação estrita de pertencimento à mesma semana operacional e respeito à cronologia início ≤ despacho ≤ fim. O ajuste manual é válido exclusivamente para aquele ciclo específico, sem alterar a regra padrão da chamada.',
      'Cadeia Real de Fases Operacionais: Coletando → Correção → Coleta Encerrada → Fechado (+ estado terminal Cancelado). O ciclo só FECHA após o armazenamento de TODOS os atestos das entregas realizadas; "Fechado" é estado do CICLO, não da coleta.',
      'Ciclo por Chamada com Fase Única & Aposentadoria de ciclo_contratos (v0.0.140): Cada ciclo pertence diretamente a uma Chamada Pública (campo chamada_id). Sua fase e status (`status` em `ciclos`) governam uniformemente toda a chamada e todos os seus contratos participantes (coletando → correcao → coleta_encerrada → fechado / cancelado). A antiga coleção intermediária `ciclo_contratos` foi definitivamente aposentada e removida (migration 0112), eliminando redundância e complexidade obsoletas: os contratos participantes derivam dinamicamente da chamada do ciclo.',
      'Ciclo Ativo: Corresponde ao ciclo mais recente em fase não-terminal por chamada (máximo 1 ativo por chamada). Pedidos de qualquer origem (importação Excel, WhatsApp, lançamento manual ou formulário online) caem automaticamente no ciclo ativo da respectiva chamada.',
      'Badge Derivado de Fechamento Pendente: Qualquer ciclo não-terminal que não seja o ciclo mais recente ativo recebe o badge visual "Fechamento Pendente (atrasado X dias)", alertando sobre pendências operacionais.',
      'Botão "Abrir Ciclo" com Numeração Livre e Seleção de Chamada: O modal de criação de ciclo permite ao usuário selecionar a Chamada Pública correspondente, digitar e escolher livremente o número do ciclo (pré-preenchido com a semana ISO correspondente), calculando as 3 datas oficiais a partir da regra configurada para a chamada, com opção de ajuste manual validado.',
      'Ação "Cancelar Ciclo": Exige justificativa/motivo obrigatório. Quando existirem pedidos vinculados, questiona e cancela os pedidos em conjunto (impedindo registros órfãos). Caso existam atestos emitidos, o cancelamento é expressamente BLOQUEADO (o caminho regulamentar é fechar o ciclo). Ciclos já Fechados ou Cancelados não podem ser cancelados.',
      'Fechamento Manual: Habilitado na fase "Coleta Encerrada" com todos os atestos de entrega devidamente emitidos e armazenados no sistema. O botão exibe o progresso de fechamento "Atestos: X/N armazenados".',
      'Travas por Fase da Cadeia Operacional (Regra de Janelas de Envio): Coletando = PRIMEIRO envio de formulário pela escola aceito ✓, reenvios permitidos ✓, importação de planilhas ✓, despacho de rotas ✗; Correção = reenvio/correção de pedidos por escolas que já enviaram permitido ✓, primeiro envio bloqueado para quem não enviou a tempo ✗, importação de planilhas ✓; Coleta Encerrada = reenvios/correções permitidos até o fechamento da coleta (último envio prevalece) ✓, primeiro envio bloqueado ✗, novas importações ✗, despacho de rotas liberado ✓; Fechado ou Cancelado = bloqueio total de envios com aviso "Coleta encerrada para este ciclo — aguarde o próximo aviso da cooperativa". A página pública do formulário distingue operacionalmente escola sem pedido × escola que já enviou.',
      'Ciclo de Vida do Botão "Colocar em Rota" na Fase 3 (v0.0.195 / v0.0.212): No cartão da Fase 3 (Coleta Encerrada), o botão segue o ciclo de vida: (1) Disponível e habilitado ("Colocar em Rota") quando a coleta estiver encerrada e não houver despacho ativo nem entregas concluídas; (2) "Em Rota" (desabilitado) quando houver despacho ou pedidos com status "Em Rota"; (3) Oculto quando as entregas forem concluídas (isEntregasConcluidas: despachos encerrados, todos os pedidos ativos entregues e nenhum em rota), cedendo lugar ao badge visual definitivo "Entregas Concluídas" no cabeçalho do cartão.',
      'Navegação Contextual Dashboard → Monitoramento (v0.0.195): Os links do Dashboard (card de ciclo ativo e atalho "Ver Ciclo" das chamadas públicas ativas) navegam com parâmetros de URL contextuais `?cicloId=&chamadaId=`. A tela /monitoramento consome searchParams e pré-seleciona imediatamente o ciclo e chamada correspondentes em todas as seções (cabeçalho, painel informativo, fases, funil e alertas de escolas).',
      'Ciclo Operacional Corrente (v0.0.198): O ciclo em foco na operação diária é gerenciado globalmente via `AppContext` e sincronizado no `localStorage` (chave "sigcaf_ciclo_corrente"). Ao clicar na seta "Monitorar" nos cards de ciclo ativo do Dashboard ou na ação de monitoramento, o ciclo corrente é registrado. As telas de Monitoramento, Novo Pedido e Rotas de Entrega seguem a ordem de precedência: (1) query params de URL (?cicloId=&chamadaId=), (2) ciclo corrente gravado se existir no banco de dados, (3) fallback padrão atual. A troca pontual de ciclo no seletor de consulta dentro da tela NÃO altera o ciclo corrente (consulta local isolada). A página Histórico de Ciclos não é afetada por essa regra.',
      'Alertas da Fase de Entrega em Monitoramento — Bloco B (v0.0.204 / v0.0.208 / v0.0.242): Seção dinâmica no painel de monitoramento visível quando o ciclo monitorado possui rotas despachadas com status "Em Rota" (ou equivalente em andamento). Incorpora três alertas operacionais em tempo real e isolamento estrito por ciclo (v0.0.242): (1) "Rota parada": motorista sem sincronizar há mais de 30 minutos (limite exato definido pela cooperativa, baseado na hora da última entrega confirmada da rota deduplicada ou no horário do despacho caso nenhuma entrega tenha ocorrido ainda; atualização reativa via realtime + timer a cada 30 segundos); (2) "Paradas pendentes": escolas da rota ainda não entregues com contagem "faltam X de N" e identificação estrita pelo ID do banco (nunca casando por nome); (3) "Entrega sem assinatura": lista de escolas cuja entrega foi confirmada sem assinatura do responsável, com clique direto para o modal "Dados da Entrega" compartilhado; (4) Aviso sonoro melódico curto via Web Audio API disparado na central a cada nova entrega confirmada pertencente ao ciclo monitorado recebida via realtime (sem dependências externas, bloqueado na carga inicial, validado por ciclo_id e janela de datas, protegido contra repetições por client_uid/ID e com toggle de MUTE persistido no localStorage); (5) Isolamento Estrito & Regra Anti-Vazamento (v0.0.242): getEntregaRegistrosDaRota invocado com ciclo.id; filtro defensivo aceitando apenas registros do ciclo selecionado (ou legados dentro da janela data_inicio a data_fim + 24h); regra anti-vazamento garantindo que caso existam pedidos da rota "Em Rota" no ciclo e nenhuma entrega confirmada no ciclo, a contagem de entregas feitas inicia em 0 de N e todas as paradas ficam pendentes, sem exibir "X de X entregas realizadas" nem "Todas as escolas desta rota já foram entregues!"; (6) Reatividade total ao fechamento: ao ser confirmada a "Rota Entregue" pela secretária, o despacho é desativado na hora e a rota, seus alertas e paradas pendentes somem imediatamente em tempo real, sem F5.',
      'Painel de Alertas das Escolas: Identificação imediata e distinção operacional entre escolas que "Já receberam o link do formulário" (disparo registrado no envios_whatsapp) e escolas que "Já preencheram" (pedido com origem=formulario no ciclo) versus escolas sem nenhum pedido, facilitando cobrar diretamente quem falta via WhatsApp.',
    ],
  },
  {
    id: '3.10',
    title: 'Comunicação Semanal (WhatsApp)',
    route: '/comunicacao',
    goal: 'Disparo de comunicados semanais de safra, links e controle de envio por escola.',
    details: [
      'Template de mensagem semanal com produtos em abundância, escassez e link do formulário.',
      'Substituição Automática do Placeholder: O placeholder "[Link do Formulário]" do template é automaticamente substituído pela URL real e única de cada escola (/formulario/{token}) ao disparar individualmente ou em massa.',
      'Ações "Enviar WhatsApp" (abre a conversa com a escola munida da mensagem personalizada e link direto) e "Enviar para Todos".',
      'Histórico e auditoria de disparos na collection envios_whatsapp (ciclo_id, escola_id, status, enviado_em).',
    ],
  },
  {
    id: '3.11',
    title: 'Formulário de Pedido da Escola (R24 / R25 — Coleta por Vínculo e Tokens)',
    route: '/formulario/:token',
    goal: 'Canal público e seguro para escolas enviarem suas quantidades diretamente à cooperativa sem login.',
    details: [
      'Canal de Pedidos Exclusivo de Contratos Individualizados: O formulário é o canal de coleta de pedidos para contratos de modalidade individualizada. NUNCA há formulário para contrato centralizado (cujos pedidos chegam exclusivamente pela importação da planilha da secretaria).',
      'Unicidade de Vínculo Ativo (R25) → No Máximo 1 Token por Ciclo: A escola tem no máximo 1 contrato ativo, logo recebe no máximo 1 token de formulário por ciclo semanal regular.',
      'Coleta por ESCOLA (campo coleta_por em contrato_escolas): Cada vínculo possui o campo coleta_por com valores ["padrao", "formulario", "planilha"], com default "padrao". O valor EFETIVO é determinado da seguinte forma: quando "padrao", é resolvido pela modalidade do contrato (individualizado → "formulario"; centralizado → "planilha"); quando diferente de "padrao", prevalece o valor explícito registrado no vínculo.',
      'Geração Seletiva de Tokens: O token/link de formulário é gerado APENAS quando o coleta_por EFETIVO é "formulario"; NUNCA é gerado token para coleta_por efetivo "planilha". Vínculos desvinculados (encerrado_em preenchido) ou contratos não-ativos (Encerrado, Cancelado, Pendente) jamais geram tokens.',
      'Escola em Múltiplos Contratos Individualizados no Mesmo Ciclo (Caso Futuro): Caso no futuro uma escola venha a participar de mais de um contrato individualizado no mesmo ciclo, ela recebe UM link POR CONTRATO, identificado explicitamente na mensagem do WhatsApp. Ao acessar a URL /formulario/{token}, a página pública exibe sempre o contrato associado ao token e SOMENTE os produtos (contrato_itens) DELE.',
      'Coleta MISTA Pronta para Extensibilidade: A arquitetura do sistema deixa a coleta mista totalmente funcional no backend e nos serviços: bastará disponibilizar futuramente um seletor visual "Coleta por" no modal de contrato (aba Escolas), sem necessidade de migração de dados nem alteração na lógica do gerador de tokens.',
      'Link único por escola × contrato × ciclo via token (sem login): Gerado no Hub de Comunicação e embutido no template do WhatsApp (com substituição automática do placeholder "[Link do Formulário]"). O token único reside na collection tokens_formulario, atuando como credencial segura que renova a cada ciclo semanal e expira após o ciclo (token inativo ou expirado bloqueia o acesso com aviso claro).',
      'Acesso seguro por token público: Validação automática do token ao carregar a página; tokens inválidos exibem mensagem explicativa e impedem submissão.',
      'Formulário com produtos do contrato: Lista os produtos cadastrados no contrato da escola (contrato_itens), com destaque para nome_contrato/apelidos reconhecidos pela instituição e nome mestre do catálogo atenuado quando diferente.',
      'Resolução Soberana de Preços na Chamada (v0.0.254): Os preços unitários exibidos à escola e gravados no pedido derivam soberanamente de chamada_itens da chamada vinculada ao contrato do token; caso o item não possua preço na chamada, recorre-se a contrato_itens como fallback e, em último caso, ao cadastro mestre de produtos. O nome_contrato e os apelidos (AKA) do contrato são rigorosamente preservados.',
      'Indicação de disponibilidade por produto (4 níveis): Badges visuais de Normal, Abundante, Escassez e Indisponível em cada item do formulário.',
      'Bloqueio de pedido de produto em escassez ou indisponível: Campos de quantidade estritamente desabilitados/bloqueados para produtos com disponibilidade em escassez ou indisponível; esses itens não podem ser pedidos e não contam na validação.',
      'Caso extremo protegido: Se todos os produtos do contrato estiverem bloqueados por escassez ou indisponibilidade, a página exibe aviso de indisponibilidade geral ("Nenhum produto disponível para pedido neste ciclo — entre em contato com a cooperativa") e o envio fica completamente bloqueado.',
      'Validação ao vivo: O formulário é inválido apenas se vazio (ou com todas as quantidades zeradas). Sem regra de compensação de escassez (a correção é negociada diretamente com a cooperativa fora do formulário). Campos aceitam decimais com vírgula para produtos pesados.',
      'Novas Travas de Envio por Fase do Ciclo (Decisão do Bill): (1) PRIMEIRO envio do pedido da escola no ciclo (escola sem pedido com origem=formulario): aceito SOMENTE com a fase do contrato = "coletando"; em "correcao" e "coleta_encerrada", a página exibe aviso claro de que o prazo de primeiro envio foi encerrado e bloqueia a submissão. (2) REENVIOS (quando a escola já possui pedido com origem=formulario no ciclo): habilitados em "coletando", "correcao" e "coleta_encerrada" (até o fechamento da coleta), com pré-preenchimento automático dos itens e quantidades do último pedido válido. (3) FORA dessas janelas (fases "fechado" ou "cancelado"): exibição obrigatória do aviso "Coleta encerrada para este ciclo — aguarde o próximo aviso da cooperativa" e bloqueio total.',
      'Substituição de Pedidos e Auditoria: Cada envio gera um novo pedido e o último envio da escola no ciclo é o válido; os pedidos anteriores da escola no ciclo são cancelados e marcados com motivo de substituição para histórico e auditoria contábil.',
      'Confirmação visual com número de protocolo: Tela de sucesso exibindo o número de protocolo oficial citável (ex.: FOR-38-0014), lista de produtos e quantidades solicitadas, data de entrega prevista (segunda-feira do despacho) e instrução para guarda do protocolo.',
      'Integração Completa: Pedidos gerados nascem com origem "formulario", integrando-se em tempo real a Pedidos, Consolidação de Demanda, Monitoramento, Rotas e Emissão de Atestos.',
    ],
  },
  {
    id: '3.12',
    title: 'Histórico de Ciclos & Comparação de Consumo',
    route: '/historico',
    goal: 'Auditoria cronológica, acompanhamento de fechamentos e análise gráfica comparativa de volume e faturamento entre períodos.',
    details: [
      'Abas organizadas em "Lista de Ciclos" e "Comparação de Consumo", permitindo transitar instantaneamente entre a auditoria da esteira semanal e a inteligência visual de tendências.',
      'Relação cronológica de todos os ciclos cadastrados exibindo a FASE PRÓPRIA de cada ciclo (Coletando, Correção, Coleta Encerrada, Fechado ou Cancelado), com indicação de período, previsão de despacho, total de escolas atendidas, pedidos, volume e valor.',
      'Badges Derivados e Motivo de Cancelamento: Exibe o badge "Fechamento Pendente (atrasado X dias)" para ciclos não-terminais que não sejam o ativo mais recente, e exibe o motivo de cancelamento de forma destacada em ciclos/contratos cancelados.',
      'Comparação de Consumo Multidimensional (v0.0.234 / v0.0.245): Gráficos semelhantes em linha com seletor de dimensão (Escolas, Chamadas e Contratos), seletor de janela de análise (Últimos 4, 8 ou 12 Ciclos) e filtro dedicado por Chamada Pública.',
      'Domínio Único de Ciclos no Eixo X (v0.0.245): O eixo horizontal estabelece um domínio único de coordenadas semanais cronológicas no padrão canônico N/AAAA (ex.: 40/2026, 41/2026). Cada ciclo aparece exatamente UMA vez no eixo X, sem duplicação ou fragmentação de pontos entre séries ou chamadas paralelas.',
      'Consolidação Canônica em Coordenada Vertical Única: Em cada ciclo, os valores de cada série selecionada (escola, chamada ou contrato) são consolidados na mesma coordenada temporal. O gráfico de Volume em KG soma os itens do insumo selecionado (respeitando o nome principal antes da vírgula) e o gráfico de Valor em R$ consolida canonicamente os pedidos ativos via order.total.',
      'Isolamento Estrito e Anti-Vazamento: Apenas pedidos com status diferente de Cancelado pertencentes aos ciclos físicos correspondentes da janela são computados, sem vazamento temporal.',
      'Ações Disponíveis: Botão "Abrir Ciclo" para iniciar novo período operacional, ação de visualização de "Detalhes", ação "Cancelar Ciclo" para ciclos não-terminais e modal de "Comparar Ciclos (Tabela)" (base vs comparado) com variação absoluta e percentual por produto.',
    ],
  },
  {
    id: '3.13',
    title: 'Emissão de Atestos (Documento Oficial)',
    route: '/atestos',
    goal: 'Produzir o documento oficial da cooperativa ("TERMO DE RECEBIMENTO DE AQUISIÇÃO DE GÊNEROS ALIMENTÍCIOS") em formato A4, com suporte a 1 ou 2 vias, impressão por rota em andamento ou entregue, geração de PDF e auditoria.',
    details: [
      'Disponibilidade Imediata em "Em Rota" (Operação de Campo): O atesto fica disponível para geração e impressão já com os pedidos no status "Em Rota" (durante o transporte). Isso permite que o motorista saia da cooperativa com o termo impresso em mãos para que o conferente da unidade escolar assine fisicamente no ato da entrega (Via 1 assinada retorna com o motorista para comprovação contábil na cooperativa). A emissão também é plenamente suportada para pedidos com status "Entregue".',
      'Configuração de Vias em /configuracoes: Parametrização institucional do número de vias (1 ou 2 vias por termo) e dos rótulos personalizados de cada via (opcionais, podendo ficar em branco; padrões amigáveis "Via 1: Escola" e "Via 2: Cooperativa"). Quando configurado para 2 vias, o sistema gera as duas vias estruturadas no mesmo documento/fluxo de impressão.',
      'Impressão de Atestos em Lote por Rota ("Imprimir Atestos por Rota"): Diálogo especializado com abas organizadas em:',
      '• Aba "Rotas em Andamento / Em Rota": Permite imprimir previamente todos os termos das escolas participantes da rota despachada antes ou durante a saída do caminhão;',
      '• Aba "Por Rota Entregue": Permite a impressão de atestos consolidados após a conclusão formal das entregas da rota.',
      'Contexto Institucional e Vínculo de Contrato no Modal de Atesto: O cabeçalho do cartão da rota no diálogo de impressão exibe explicitamente "Chamada: XX/YYYY", e cada parada/escola traz o número do contrato do seu respectivo vínculo institucional.',
      'Rodapé Operacional por Página: O rodapé de cada página impressa identifica os elementos-chave da entrega no formato padronizado "Ciclo · Contrato · Parada · Via" (ex.: "Ciclo 38/2026 · Contrato C-2026-02-01 · Parada #3 · 1ª Via: Escola"), garantindo rastreabilidade documental impecável.',
      'Nome do Produto no Atesto (Regra Definitiva): No atesto o produto sai apenas com o nome antes da vírgula do Nome no Contrato; o trecho após a vírgula (AKA/apelido) é uso interno do sistema para casar nomes digitados errado no pedido e jamais aparece no documento.',
      'Estrutura Oficial do Documento (A4): Cabeçalho com logotipo da cooperativa e título central "TERMO DE RECEBIMENTO DE AQUISIÇÃO DE GÊNEROS ALIMENTÍCIOS REFERENTE À CHAMADA PÚBLICA-N° {numero_chamada}". Tabela de produtos com quantidades em formato brasileiro (vírgula decimal), declaração institucional de destinação da Agricultura Familiar, local e data dinâmicos das configurações, e campo de assinatura com identificação do representante escolar.',
      'Download e Síntese Retroativa Resiliente: O botão "Baixar PDF" realiza o download do arquivo salvo via Blob/createObjectURL e, para registros legados sem arquivo ou na indisponibilidade do binário, realiza a síntese retroativa instantânea em memória, armazena o PDF no registro e conclui o download.',
    ],
  },
  {
    id: '3.14',
    title: 'Relatórios Contábeis & Fechamento Mensal',
    route: '/relatorios',
    goal: 'Geração e exportação avançada de demonstrativos para fechamento mensal e prestação de contas.',
    details: [
      'Demonstrativos por contrato e chamada (com coluna "Chamada" vinculada, coluna "Total de Escolas" vinculadas, valores pactuados, faturados, saldo e % de execução), entregas por período e produtos faturados.',
      'Linhas de totalização por Chamada: após os contratos da respectiva chamada, exibição do valor TOTAL na coluna de Contrato, somatório de total de escolas, valores pactuados, faturados e saldos remanescentes com destaque visual.',
      'Alternador de modo de exibição de linhas: opção entre "Todas as linhas" (contratos individuais + totais de chamada) e "Somente totais de Chamada" (visão executiva consolidada por chamada pública).',
      'Filtro dedicado por Chamada: seleção de chamadas existentes ou "Todas as chamadas" combinada aos filtros de período, programa e status, com atualização reativa do relatório.',
      'Exportação Excel (.xlsx) e PDF timbrado com jsPDF refletindo a coluna Chamada, contagem de escolas e linhas de total por chamada conforme o modo de exibição selecionado.',
    ],
  },
  {
    id: '3.15',
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
    id: '3.16',
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
    id: '3.17',
    title: 'Configurações da Cooperativa (Exclusivo MASTER)',
    route: '/configuracoes',
    goal: 'Parametrização institucional da cooperativa, identidade visual completa, parâmetros de atesto, origem logística e controle de ambiente.',
    details: [
      'Controle de atalhos demo na tela de login: toggle para ocultar ou exibir botões de teste rápido (para produção segura).',
      'Dados institucionais da cooperativa: Razão Social, Sigla, CNPJ, Município/UF, Telefone e E-mail.',
      'Logotipo Institucional da Cooperativa: upload de imagem (PNG, JPG, WEBP) aplicado dinamicamente em todo o aplicativo — menu lateral desktop, cabeçalho mobile, tela pública de login e favicon/apple-touch-icon da aba do navegador, com fallback resiliente para ícone/sigla.',
      'Depósito Central & Origem das Rotas de Entrega: Configuração geográfica do ponto de partida da cooperativa para a otimização de rotas e navegação no Google Maps pelo Portal do Motorista, incluindo Nome/Identificação, Latitude e Longitude (aceitando formatação com vírgula ou ponto decimal), botão para restaurar valores de fábrica e fallback automático para as coordenadas de referência (-22.260264, -42.738042).',
      'Parâmetros Oficiais de Emissão de Atestos: Configuração do número de vias emitidas (1 ou 2 vias) e dos rótulos personalizáveis das vias (ex.: "Escola" e "Cooperativa", com permissão para ficarem em branco caso a cooperativa prefira vias sem rótulo fixo).',
      'Integração dos dados da cooperativa em atestos, relatórios e telas do sistema.',
    ],
  },
  {
    id: '3.18',
    title: 'Formulário de Pedido para as Escolas (R24 / R25 — Travas, Coleta_por e Reenvio)',
    route: '/formulario/:token',
    goal: 'Regras de negócio aprofundadas do formulário de pedidos da escola (R24/R25), resolução de coleta_por por vínculo e janelas de submissão.',
    details: [
      'Canal de Pedidos de Contratos Individualizados: O formulário é canal de pedidos exclusivo de contratos individualizados — NUNCA há formulário para contrato centralizado (pedidos centralizados chegam pela importação da planilha da secretaria).',
      'Regra do Coleta_por EFETIVO (R25): Geração de links condicionada estritamente ao coleta_por efetivo do vínculo igual a "formulario". Se coleta_por for "padrao", o sistema resolve pela modalidade do contrato (individualizado → "formulario"; centralizado → "planilha"); valores explícitos "formulario" ou "planilha" têm precedência total. Tokens nunca são gerados para efetivo "planilha".',
      'Unicidade de Vínculo e Token: Pela trava de unicidade de vínculo do R25, a escola tem no máximo 1 contrato ativo por vez, resultando em no máximo 1 token de formulário por ciclo semanal (garantido pelo índice único composto escola_id + contrato_id + ciclo_id).',
      'Escola em Múltiplos Contratos Individualizados (Caso Futuro): Recebe um link POR CONTRATO, claramente identificado na mensagem do WhatsApp. A rota /formulario/{token} renderiza o contrato do token e SOMENTE os produtos (contrato_itens) vinculados a ele.',
      'Suporte a Coleta MISTA Nativo e Extensibilidade Pronta: Sem necessidade de alteração no modelo de dados ou na lógica do gerador, a arquitetura suporta contratos com coleta mista, bastando no futuro um seletor "Coleta por" no modal de contrato (aba Escolas).',
      'Travas de Integridade Operacional: Vínculos com encerrado_em preenchido ou contratos com status fora de Ativo (Encerrado, Cancelado, Pendente) ou com encerrado_em são bloqueados de gerar tokens.',
      'Janela do Primeiro Envio: Para escolas que ainda não registraram pedido com origem "formulario" no ciclo selecionado, o envio é aceito estritamente na fase "Coletando". Em "Correção" ou "Coleta Encerrada", o formulário apresenta alerta de prazo encerrado e não permite primeiro envio forçado.',
      'Janela de Reenvios: Escolas com submissão prévia no ciclo têm autorização para reenviar pedidos em "Coletando", "Correção" e "Coleta Encerrada" (até o fechamento da coleta). O formulário realiza o pré-carregamento dos itens do último pedido válido para facilitar ajustes.',
      'Bloqueio Fora da Janela: Em fases terminais ("Fechado" ou "Cancelado"), o formulário exibe o aviso "Coleta encerrada para este ciclo — aguarde o próximo aviso da cooperativa" e bloqueia o botão de envio.',
      'Substituição e Protocolo: Cada reenvio cancela o pedido anterior com justificativa de substituição e emite protocolo oficial FOR-XX-NNNN para comprovação imediata da escola.',
    ],
  },
  {
    id: '3.19',
    title: 'Recuperação de Senha (Esqueci minha senha)',
    route: '/login (Modal)',
    goal: 'Recuperação autônoma de acesso por e-mail com fluxo nativo do backend.',
    details: [
      'Link "Esqueci minha senha" na tela pública de login.',
      'Envio de e-mail de redefinição via funcionalidade nativa do Skip Cloud / PocketBase (requestPasswordReset).',
      'Feedback seguro com confirmação visual para o usuário sem exposição indevida de dados.',
    ],
  },
  {
    id: '3.20',
    title: 'API REST de Integração com ERP de Faturamento (Somente Leitura)',
    route: 'GET /backend/v1/erp/pedidos',
    goal: 'Disponibilizar endpoint REST seguro e exclusivo de leitura para que o sistema de ERP da cooperativa importe os pedidos realizados e alimente automaticamente o faturamento, sem qualquer permissão de escrita.',
    details: [
      'Arquitetura Estritamente Somente Leitura: O ERP não grava nem altera pedidos no SIGCAF. O endpoint opera exclusivamente via método HTTP GET.',
      'Autenticação e Proteção por Chave de API: Protegido por chave secreta validada no header HTTP (X-API-Key: <chave> ou Authorization: Bearer <chave>). A chave pode vir da variável de ambiente do servidor (process.env.ERP_API_KEY) OU do registro interno ERP_API_KEY na coleção config_sistema, com prioridade máxima para a variável de ambiente. Requisição sem chave ou com chave incorreta retorna HTTP 401 Unauthorized com JSON limpo, sem vazar detalhes internos.',
      'Gestão Segura da Chave & Coleção config_sistema: A chave é gerenciada de forma estritamente interna no servidor ou via coleção config_sistema (totalmente bloqueada contra leitura/gravação na REST API do app para clientes e anônimos, acessível exclusivamente pelo servidor/superuser). A chave JAMAIS é hardcodada no front-end nem exibida publicamente em qualquer tela ou componente da interface do sistema.',
      'Identificação Cadastral da Escola (sem casamento por nome): Cada pedido expõe os dados cadastrais da escola vinculada: ID único no banco de dados (escola.id), Nome oficial, Código INEP, Tipo, Dependência Administrativa, Bairro e Endereço. Respeita a regra fundamental do sistema: nunca casar escola por nome.',
      'Resolução Canônica do Contrato pelo Vínculo Escola×Contrato da Chamada (contrato_escolas): O contrato do pedido é resolvido prioritariamente a partir da tabela de vínculos `contrato_escolas`, casando `contrato_escolas.escola_id = pedidos.escola_id` com o contrato ativo (`contratos.chamada_id = ciclos.chamada_id`), refletindo a modelagem operacional onde rotas atendem escolas de múltiplos contratos e o vínculo real reside na escola. Se houver mais de um vínculo ativo, adota agregação determinística (`MIN(id)`). O campo `rotas.contrato_id` permanece estritamente como fallback quando não houver registro em `contrato_escolas`. Toda a blindagem de `COALESCE` é mantida contra retornos nulos.',
      'Metadados de Chamada, Ciclo, Contrato e Rota (com Tratamento Robusto de Nullables): Expõe o ID e número da Chamada Pública, Programa e Dependência; ID, nome, número da semana e ano do Ciclo Operacional; ID e número do Contrato de vínculo (resolvido por contrato_escolas com fallback para rotas.contrato_id); e ID e nome da Rota Logística. Quando um pedido não possui contrato, rota, chamada ou ciclo vinculado, o scanner SQL utiliza COALESCE para evitar erros de conversão de NULL no driver do banco e o JSON mapeia o objeto correspondente como null legítimo (ex.: "contrato": null, "rota": null), viabilizando matrizes analíticas completas (Chamada → Ciclo → Contrato → Escola) no Power BI / Power Query.',
      'Itens do Pedido com Regra de Nome no Contrato e AKA Separado: Cada item do pedido expõe o Nome do Produto (apenas a parte antes da vírgula do Nome no Contrato), campo separado "aka" (apelido/referência interna para que o ERP reconcilie eventuais divergências de nomenclatura), quantidade, unidade de medida, preço unitário acordado e total do item.',
      'Total Consolidado Canônico do Pedido: O campo total_consolidado utiliza prioritariamente o valor canônico gravado no pedido (campo total ou validação canônica que alimenta o Relatório Mensal e Relatórios), recorrendo ao cálculo por soma dos itens estritamente como fallback quando o total gravado não existir. Itens duplicados por camadas de preço são deduplicados estritamente por ID para blindar contra qualquer receita dobrada.',
      'Filtro de Ciclo sem Curinga: O filtro ?ciclo=... aplica casamento exato por ID e por nome ("40/2026" casa com "Ciclo 40/2026", número isolado "40" casa com prefixo delimitado), sanitizando e bloqueando curingas SQL arbitrários (% e _) para prevenir bypass e vazamento amplo de dados.',
      'Filtro por Escola no Banco de Dados: Novo parâmetro ?escola=<id> permite consultar pedidos escola a escola pelo ID alfanumérico no banco. IDs com formato inválido retornam HTTP 400 com JSON descritivo limpo, enquanto IDs válidos sem pedidos retornam HTTP 200 com array vazio e paginação normal.',
      'Filtros via Query String Combináveis: Suporte a filtros combinados por escola (?escola=...), chamada (?chamada=...), ciclo (?ciclo=...), status (?status=Entregue, etc.) e período de datas (?data_inicio=YYYY-MM-DD&data_fim=YYYY-MM-DD&tipo_data=entrega|criacao). Validação estrita de formato (HTTP 400 em caso de formato inválido).',
      'Paginação com Contagem Total: Paginação via parâmetros ?page=1&per_page=50 (máximo 200 por página). O payload de resposta inclui total_items, total_pages, page, per_page e items_count para que o ERP saiba com exatidão quando parar de paginar.',
      'Respostas de Erro Padronizadas: Retornos 401 (não autorizado), 400 (filtros/datas inválidos) e 500 (erro interno) padronizados em JSON ({ success: false, error: "..." }).',
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
  ['Nome do sistema', 'SIGCAF (Sistema de Gestão da Cooperativa Agrícola Familiar)'],
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
  'React 19 (19.2.7) + Vite',
  'TypeScript',
  'React Router 7.18.0',
  'Tailwind CSS + shadcn/ui',
  'Lucide React',
  'Sonner (toasts)',
  'Backend conectado: Skip Cloud (PocketBase v0.36) com coleções persistidas em tempo real (realtime events)',
  'Leaflet + OpenStreetMap + OSRM (roteamento geográfico nas rodovias)',
  'Google Maps (integração móvel para navegação de trechos e paradas com origem e destino)',
  'PWA / Offline Queue (localStorage/IndexedDB) para o Portal do Motorista com resincronização automática',
]

const DATA_MODEL = [
  'fornecedores (id, nome, sexo [MASCULINO/FEMININO/OUTRO], data_nascimento, foto [file], vinculo [COOPERADO/EXTERNO], identidade [CPF/CNPJ com validação de DV], data_validade_caf [data], endereco, bairro, cep, latitude [numérico], longitude [numérico], whatsapp) [Cadastro mestre de produtores e fornecedores com controle de CAF]',
  'users (id, email, nome/name, celular, foto [file], perfil [MASTER/ADMINISTRADOR/SECRETARIA], ativo [bool])',
  'configuracoes (id, nome_cooperativa, sigla, cnpj, telefone, email, cidade_uf, exibir_atalhos_demo [bool], logotipo [file], subtitulo_sistema, deposito_nome, deposito_latitude, deposito_longitude, atesto_vias [1 ou 2], atesto_rotulo_via1 [texto], atesto_rotulo_via2 [texto])',
  'ciclos (id, nome, chamada_id → chamadas, data_inicio, data_fim, data_despacho, status [texto extensível: coletando / correcao / coleta_encerrada / fechado / cancelado], motivo_cancelamento [texto], data_cancelamento [data], snapshot [json com regra semanal e despacho]) [1 ciclo ativo por chamada; número = semana ISO; fase única do ciclo governando todos os contratos da chamada]',
  'chamadas (id, chamada, programa, modalidade [individualizado/centralizado], dependencia_administrativa [Federal/Estadual/Municipal/Privada — opcional], status [Ativo/Pendente/Encerrado/Cancelado]) [Nível estrutural superior: 1 chamada pública : N contratos; populado inicialmente por migração dos contratos com deduplicação futura]',
  'chamada_itens (id, chamada_id → chamadas [obrigatório], produto_id → produtos [opcional], produto, aka [apelido na planilha], unidade, preco) [Produtos, AKAs e preços unitários oficiais vivem na Chamada; quantidade da chamada = soma reativa das quantidades dos contratos vinculados]',
  'produtos (id, nome, unidade, categoria) [Catálogo cadastral mestre — sem preço/estoque, valores financeiros e quantidades residem em chamada_itens e contrato_itens]',
  'escolas (id, nome, codigo_inep, dependencia_administrativa [Federal/Estadual/Municipal/Privada], endereco, telefone, email, tipo [CMEI/CRECHE/INTEGRAL/FUNDAMENTAL/Médio/Técnico], alunos, bairro, contato, cep, latitude, longitude) [Cadastro Mestre Global — rota atribuída via vínculos]',
  'contratos (id, numero, chamada_id → chamadas [obrigatório, 1 chamada : N contratos], numero_chamada, tipo, modalidade_pedido [individualizado/centralizado], tipo_importacao [unica/fracionada], abas_planilha, num_rotas_logisticas [opcional], valor_total, status [Ativo/Encerrado/Cancelado/Pendente], encerrado_em [data], motivo_cancelamento [texto])',
  'contrato_escolas (id, contrato_id → contratos, escola_id → escolas, rota_id → rotas, coleta_por [padrao/formulario/planilha, default padrao], encerrado_em [data]) [Vínculo ÚNICO ATIVO por escola; vínculos encerrados/desvinculados mantêm histórico via campo encerrado_em; coleta_por para extensibilidade de coleta mista]',
  'rotas (id, chamada_id → chamadas, contrato_id → contratos [opcional legado], nome, ordem, ativa [bool], caminhao_escola_id → escolas, caminhao_posicao_atual [int]) [Rotas no nível da Chamada com suporte a rastreamento de caminhão em tempo real]',
  'paradas_rota (id, rota_id → rotas, escola_id → escolas, ordem) [Sequenciamento Drag-and-Drop das paradas de entrega da rota]',
  'motoristas (id, nome [texto], telefone [texto], ativo [bool]) [Cadastro único da cooperativa gerenciado em /rotas]',
  'rota_despachos (id, rota_id → rotas, ciclo_id → ciclos, motorista_id → motoristas [opcional], token [string único para Portal do Motorista], status [em_rota / entregue / cancelado], despachado_em, entregue_em, observacoes) [Despacho da rota com token criptográfico de acesso móvel]',
  'entrega_registros (id, despacho_id → rota_despachos, parada_id → paradas_rota, escola_id → escolas, responsavel_nome [texto], responsavel_cpf [texto], horario_chegada, horario_confirmacao, assinatura [imagem/canvas], foto [arquivo compactado], observacao, sincronizado_em) [Eventos de entrega com suporte offline e sincronização em tempo real para a central]',
  'coordenada_sugestoes (id, escola_id → escolas, lat [numérico], lng [numérico], precisao [metros], status [pendente/aprovada/recusada], rota_id → rotas, ciclo_id → ciclos, chamada_id → chamadas, motorista_id → motoristas, despacho_id → rota_despachos, registro_id → entrega_registros, revisado_por → users, revisado_em [data], motivo_recusa [texto], observacao, origem, entregue_em) [Fila de sugestões de coordenadas GPS para revisão humana]',
  'despachos (id, chamada_id → chamadas, contrato_id → contratos [opcional], ciclo_id → ciclos, rota_id → rotas, data_despacho, usuario_id → users, status [Em Rota/Entregue/Cancelado])',
  'contrato_itens (id, contrato_id → contratos, produto_id → produtos, preco, quantidade_contratada [numérico opcional — pode ficar em branco], nome_contrato [texto opcional], apelidos [texto opcional]) [Nota arquitetural: duplicação temporária com chamada_itens mantida em transição suave para compatibilidade, a ser eliminada futuramente]',
  'pedidos (id, numero, escola_id → escolas, ciclo_id → ciclos, origem [excel/whatsapp/manual/formulario], rota_id → rotas, validacao [json], data_prevista, status [Pendente/Em Rota/Entregue/Cancelado], entregue_em, entregue_por → users, motivo_cancelamento, cancelado_em)',
  'pedido_itens (id, pedido_id → pedidos, produto_id → produtos, quantidade, preco_unitario)',
  'envios_whatsapp (id, ciclo_id → ciclos, escola_id → escolas, status [pendente/enviado/falha], enviado_em)',
  'tokens_formulario (id, escola_id → escolas, contrato_id → contratos, ciclo_id → ciclos, token [string único], ativo [bool], criado_em, expira_em) [Link único por escola/contrato/ciclo para envio público]',
  'importacoes (id, ciclo_id → ciclos, contrato_id → contratos, arquivo, data, usuario_id, linhas_total, linhas_ok, linhas_erro, erros [json])',
  'atestos (id, numero, pedido_id → pedidos, data_emissao, status [Pendente Assinatura/Confirmado/Arquivado], assinatura_file [file], arquivo [file])',
  'config_sistema (id, chave [texto único], valor [texto]) [Coleção interna de parâmetros/segredos de servidor — 100% bloqueada contra leitura/gravação na REST API do app]',
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
<title>Documento de Requisitos do Sistema (DRS) — SIGCAF</title>
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
  <p class="subtitle">SIGCAF — Sistema de Gestão da Cooperativa Agrícola Familiar</p>

  <h2>1. Visão Geral do Produto</h2>
  <p>O SIGCAF (Sistema de Gestão da Cooperativa Agrícola Familiar) é um sistema web voltado para cooperativas agrícolas de pequeno porte que participam de programas institucionais como o PNAE (Programa Nacional de Alimentação Escolar) e o PAA (Programa de Aquisição de Alimentos). A plataforma centraliza a gestão operacional com dois focos principais: Coleta de pedidos das escolas parceiras e Emissão de atestos de entrega para comprovação de recebimento e posterior faturamento. O público-alvo inclui administradores da cooperativa (coordenação, finanças) e secretárias (operacional, lançamento de pedidos e emissão de documentos).</p>

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

  <div class="footer">Documento de Requisitos do Sistema — SIGCAF • Gerado em ${new Date().toLocaleDateString('pt-BR')}</div>
</body>
</html>`
}

/* Download the standalone HTML document as a last-resort fallback. */
function downloadHtmlFallback(html: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'DRS-SIGCAF.html'
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

export function Requirements() {
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
              SIGCAF — Sistema de Gestão da Cooperativa Agrícola Familiar
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
        O SIGCAF (Sistema de Gestão da Cooperativa Agrícola Familiar) é um sistema web voltado para
        cooperativas agrícolas de pequeno porte que participam de programas institucionais como o
        PNAE (Programa Nacional de Alimentação Escolar) e o PAA (Programa de Aquisição de
        Alimentos). A plataforma centraliza a gestão operacional com dois focos principais: Coleta
        de pedidos das escolas parceiras e Emissão de atestos de entrega para comprovação de
        recebimento e posterior faturamento. O público-alvo inclui administradores da cooperativa
        (coordenação, finanças) e secretárias (operacional, lançamento de pedidos e emissão de
        documentos).
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

      {/* 7. Registro de Manutenção e Limpeza de Dados */}
      <SectionTitle>7. Registro de Manutenção & Higienização do Banco de Dados</SectionTitle>
      <div className="space-y-4">
        {/* Release v0.0.262: Modo de Filtro Por Rota no Relatório de Consolidação Final */}
        <div className="rounded-lg border-2 border-primary/40 bg-card p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/40 font-semibold">
                Release v0.0.262
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.262: Modo de Filtro &quot;Por rota&quot; na Aba Por Produto do Relatório de
                Consolidação Final (/consolidacao)
              </span>
            </div>
            <span className="text-xs font-medium text-primary">Versão Vigente (v0.0.262)</span>
          </div>

          <p className="text-sm text-foreground/90 leading-relaxed">
            Atendimento integral ao requisito operacional do usuário (&quot;O relatório de
            consolidação final por produto tem a opção por rota — nesse caso seleciona a rota entre
            as rotas disponíveis da chamada selecionada e um box de seleção de rotas é ativado;
            somente as escolas da rota são apresentadas na sequência das paradas da rota&quot;). Na
            tela de Consolidação Final (<code>/consolidacao</code> —{' '}
            <code>src/pages/Consolidation.tsx</code>), a aba &quot;Por Produto&quot; agora conta com
            o seletor <strong>Filtro de Escolas</strong> (<em>Todas as escolas</em> ou{' '}
            <em>Por rota</em>). Ao ativar <em>Por rota</em>, um box (select) dinâmico é ativado
            listando exclusivamente as rotas pertencentes à chamada selecionada no relatório. A
            tabela e as exportações (Excel .xlsx, PDF e CSV) passam a apresentar somente as escolas
            da rota selecionada dispostas rigorosamente na{' '}
            <strong>sequência oficial das paradas da rota</strong> (com badge indicativo do número
            da parada).
          </p>

          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                1. Comportamento do Filtro por Rota & Sequência de Paradas:
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • <strong>Seletor de Modo & Box de Rotas:</strong> O usuário escolhe entre
                  &quot;Todas as escolas&quot; ou &quot;Por rota&quot;. Ao escolher rota, o box de
                  seleção é ativado com as rotas ativas da chamada selecionada.
                </li>
                <li>
                  • <strong>Ordenação por Paradas:</strong> As colunas de escolas são ordenadas pela
                  ordem oficial de paradas (<code>paradas_rota.ordem</code>) lidas via{' '}
                  <code>rotasService.getParadas</code>, e não por ordem alfabética.
                </li>
                <li>
                  • <strong>Badges Indicativos de Parada:</strong> Cada coluna da escola recebe o
                  badge <code>#N</code> com o número da sua parada na rota.
                </li>
                <li>
                  • <strong>Coluna Total Preservada à Esquerda:</strong> A coluna Total permanece
                  fixa à esquerda junto de Produto (implementação 0.0.261), recalculando as somas e
                  valores restritos às escolas da rota ativa.
                </li>
                <li>
                  • <strong>Exportações Sincronizadas (PDF, Excel, CSV):</strong> Todas as
                  exportações respeitam o escopo da rota selecionada e mantêm as paradas na
                  sequência correta.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                2. Invariância de Regras & Ponto de Atenção v0.0.243:
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • <strong>Preservação Rigorosa das 4 Telas de Entregas:</strong> Zero alterações
                  em <code>/rotas</code>, Dashboard, Portal do Motorista e{' '}
                  <code>/monitoramento</code> — isolamento estrito por <code>ciclo_id</code> e
                  blindagem anti-vazamento 100% preservados.
                </li>
                <li>
                  • <strong>Snapshots e Preços Congelados:</strong> Snapshots de preço em{' '}
                  <code>pedido_itens</code> e sincronização de preços (0.0.254/0.0.255) permaneceram
                  100% intocados.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.261: Reposicionamento da Coluna de Total à Esquerda na Consolidação Final */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/40 font-semibold">
                Release v0.0.261
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.261: Reposicionamento da Coluna de Total à Esquerda Junto de Produto em
                Consolidação Final (/consolidacao)
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.261)</span>
          </div>

          <p className="text-sm text-foreground/90 leading-relaxed">
            Atendimento integral à solicitação operacional do usuário (&quot;a coluna de total vir a
            esquerda junto de produto&quot;) na tela de Consolidação Final (
            <code>/consolidacao</code> — <code>src/pages/Consolidation.tsx</code>). A coluna de{' '}
            <strong>TOTAL</strong> foi movida para as primeiras posições da tabela (esquerda),
            posicionada imediatamente ao lado da coluna de Produto (e de Escola na aba recíproca),
            deixando todas as colunas de destinos/escolas, quantidades parciais e valores para a
            direita. A reorganização foi aplicada com total paridade em toda a apresentação tabular:
            tabela principal interativa em tela, documento PDF para impressão/logística
            (jsPDF/autoTable), planilha Excel (.xlsx) e exportação de dados (.csv).
          </p>

          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                1. Reorganização Tabular por Abas e Formatos:
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • <strong>Aba Por Produto (Tela & Exportações):</strong> Ordem de colunas ajustada
                  para <code>Produto</code> → <code>Total</code> → <code>Unidade</code> →{' '}
                  <code>Preço Unit.</code> → <em>[Escolas exibidas...]</em>.
                </li>
                <li>
                  • <strong>Aba Por Escola (Tela & Exportações):</strong> Ordem de colunas ajustada
                  para <code>Escola</code> → <code>Total</code> → <code>Aba</code> →{' '}
                  <em>[Produtos exibidos...]</em>.
                </li>
                <li>
                  • <strong>Linha de Total Geral (Rodapé):</strong> Valor consolidado posicionado na
                  mesma coluna de Total à esquerda, perfeitamente alinhado verticalmente nas duas
                  abas.
                </li>
                <li>
                  • <strong>Suporte Completo a Filtros & Toggles:</strong> Funcionamento 100%
                  preservado com &quot;Somente coluna de Total&quot;, &quot;Ocultar vazios&quot;,
                  busca textual e modos de exibição (Quantidade, Valor R$ ou Ambos).
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                2. Invariância de Regras & Ponto de Atenção v0.0.243:
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • <strong>Zero Alteração de Lógica de Negócio:</strong> Nenhum cálculo, fórmula de
                  agregação, preço ou snapshot histórico de pedidos foi modificado; trata-se
                  puramente de reposicionamento de coluna de apresentação visual e exportação.
                </li>
                <li>
                  • <strong>Preservação Rigorosa das 4 Telas de Entregas:</strong> Zero alterações
                  em <code>/rotas</code>, Dashboard, Portal do Motorista e{' '}
                  <code>/monitoramento</code> — isolamento estrito por <code>ciclo_id</code> e
                  blindagem anti-vazamento 100% preservados.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.258: Restauração de Ícones com Imagens nos Cabeçalhos e Rodapé do Menu Lateral */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/40 font-semibold">
                Release v0.0.258
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.258: Restabelecimento dos Ícones Emoji nos Cabeçalhos dos Grupos e Rodapé do
                Menu Lateral
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.258)</span>
          </div>

          <p className="text-sm text-foreground/90 leading-relaxed">
            Restabelecimento dos <strong>ícones visuais com imagens (emojis)</strong> nos cabeçalhos
            dos 5 grupos recolhíveis e nos itens do rodapé da barra de navegação lateral (menu
            desktop e gaveta móvel em <code>src/components/Layout.tsx</code>), atendendo à
            solicitação direta do usuário (&quot;Restabeleça os ícones com imagens para os itens de
            menu em CADASTROS, COLETA, ACOMPANHAMENTO, ENTREGAS, RELATORIOS, Meu Perfil, Usuários e
            Configurações&quot;). Os ícones mantêm perfeita harmonia e proporção visual com os itens
            internos e o Dashboard.
          </p>

          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                1. Mapeamento Visual dos Ícones do Menu:
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • <strong>Cabeçalhos de Grupos:</strong> Cadastros (🗂️), Coleta (📋),
                  Acompanhamento (📡), Entregas (🛣️) e Relatórios (📈).
                </li>
                <li>
                  • <strong>Itens de Rodapé:</strong> Meu Perfil (👤), Usuários (👥), Configurações
                  (⚙️) e Documento de Requisitos (📚).
                </li>
                <li>
                  • <strong>Topo e Subitens Preservados:</strong> Dashboard (📊) e os itens de
                  navegação (Fornecedores 🚜, Produtos 🌱, Escolas 🏫, Chamadas 🌾, Contratos 📄,
                  Pedidos 📋, Importação Excel 📥, Comunicação WhatsApp 💬, Monitoramento 📡,
                  Histórico de Ciclos 🔄, Consolidação 🧺, Rotas de Entrega 🛣️, Atestos 📜 e
                  Relatórios 📈) 100% inalterados.
                </li>
                <li>
                  • <strong>Alinhamento & Acessibilidade:</strong> Todos os emojis são renderizados
                  com <code>role=&quot;img&quot;</code> e <code>aria-label</code> correspondente,
                  com dimensões consistentes.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                2. Integridade do Sistema & Ponto de Atenção v0.0.243:
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • <strong>Preservação Estrutural:</strong> Nenhuma rota, permissão de perfil
                  (Master, Admin, Secretária), ordem de menus ou lógica de abertura automática foi
                  alterada.
                </li>
                <li>
                  • <strong>Preservação Rigorosa das 4 Telas de Entregas:</strong> Zero alterações
                  em <code>/rotas</code>, Dashboard, Portal do Motorista e{' '}
                  <code>/monitoramento</code> — isolamento por <code>ciclo_id</code> e regras
                  anti-vazamento 100% mantidos.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.257: Reorganização do Menu Lateral em Dois Níveis com Grupos Recolhíveis */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/40 font-semibold">
                Release v0.0.257
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.257: Reorganização do Menu Lateral em Dois Níveis com Grupos Recolhíveis
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.257)</span>
          </div>

          <p className="text-sm text-foreground/90 leading-relaxed">
            Reorganização estrutural e ergonômica da barra de navegação lateral (menu desktop e
            drawer mobile em <code>src/components/Layout.tsx</code>) em{' '}
            <strong>dois níveis com grupos recolhíveis</strong>, conforme aprovado pelo usuário
            (&quot;Passa fornecedores para cadastros e aprovo&quot;). A navegação agora organiza os
            módulos em 5 grupos funcionais expansíveis com setas indicativas, mantendo o Dashboard
            solto no topo e os itens de perfil/administração/documentação soltos no rodapé.
          </p>

          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                1. Estrutura Exata Aprovada & Comportamento dos Grupos:
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • <strong>Itens soltos no topo:</strong> <code>Dashboard</code> (<code>/</code>).
                </li>
                <li>
                  • <strong>Grupo Cadastros:</strong> Fornecedores, Produtos, Escolas, Chamadas,
                  Contratos.
                </li>
                <li>
                  • <strong>Grupo Coleta:</strong> Pedidos, Importação Excel, Comunicação WhatsApp
                  (ordem mantida).
                </li>
                <li>
                  • <strong>Grupo Acompanhamento:</strong> Monitoramento, Histórico de Ciclos,
                  Consolidação (ordem mantida).
                </li>
                <li>
                  • <strong>Grupo Entregas:</strong> Rotas de Entrega, Atestos.
                </li>
                <li>
                  • <strong>Grupo Relatórios:</strong> Relatórios.
                </li>
                <li>
                  • <strong>Itens soltos no rodapé:</strong> Meu Perfil, Usuários, Configurações,
                  Documento de Requisitos.
                </li>
                <li>
                  • <strong>Abertura Automática & Estado Ativo:</strong> O grupo que contém a tela
                  ativa abre automaticamente ao carregar ou navegar; o item ativo recebe destaque
                  visual (<code>bg-primary/10 text-primary</code>).
                </li>
                <li>
                  • <strong>Ocultação Elegante:</strong> Grupos que ficarem sem itens visíveis para
                  o perfil logado não são renderizados; ícones e rótulos de cada item foram 100%
                  preservados.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                2. Integridade do Sistema & Ponto de Atenção v0.0.243:
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • <strong>Navegação Pura:</strong> Nenhuma tela, rota, serviço, regra de negócio
                  ou banco de dados foi alterado; a mudança ocorreu estritamente no componente de
                  navegação lateral.
                </li>
                <li>
                  • <strong>Preservação Rigorosa das 4 Telas de Entregas:</strong> Zero alterações
                  funcionais em <code>/rotas</code>, Dashboard, Portal do Motorista e{' '}
                  <code>/monitoramento</code> — isolamento estrito por <code>ciclo_id</code> e
                  blindagem anti-vazamento 100% preservados.
                </li>
                <li>
                  • <strong>Responsividade Mobile:</strong> No drawer mobile do Sheet, os grupos
                  operam com a mesma lógica de recolhimento e o fechamento automático da gaveta ao
                  clicar em qualquer item segue ativo.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.256: Documentação do Campo tipo_importacao da Coleção contratos */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/40 font-semibold">
                Release v0.0.256
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.256: Documentação de Requisitos do Campo tipo_importacao da Coleção contratos
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.256)</span>
          </div>

          <p className="text-sm text-foreground/90 leading-relaxed">
            Atualização documental integral do Documento de Requisitos do Sistema (DRS) na página{' '}
            <code>/requisitos</code> detalhando o campo <code>tipo_importacao</code> da coleção{' '}
            <code>contratos</code>, sua aplicação estrita à modalidade Centralizada, estrutura de
            planilha (simples vs. abas), reflexos nos pontos de interface do sistema e garantia de
            invariância de dados.
          </p>

          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                1. Especificação do Campo tipo_importacao:
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • <strong>Definição e Escopo:</strong> Declara como a Secretaria de Educação
                  entrega as planilhas de pedido do contrato. Aplicável exclusivamente à modalidade
                  Centralizada.
                </li>
                <li>
                  • <strong>Única (Padrão):</strong> A Secretaria envia um arquivo consolidado com o
                  pedido. Exibe na interface a configuração complementar &quot;Estrutura da
                  planilha&quot; (simples ou com abas) e o cadastro de abas em{' '}
                  <code>abas_planilha</code> (ex.: <em>ROTA A, ROTA B, ZONA RURAL</em>), onde cada
                  aba do arquivo é casada com as escolas do contrato na importação Excel.
                </li>
                <li>
                  • <strong>Fracionada:</strong> A Secretaria envia vários arquivos ao longo do
                  tempo (remessas/semanas). O cadastro de abas fica oculto na interface, pois cada
                  remessa chega como planilha própria.
                </li>
                <li>
                  • <strong>Onde Aparece no Sistema:</strong> Seletor no formulário de criar/editar
                  contrato (visível só quando a modalidade é Centralizada, mudando dinamicamente os
                  campos complementares de abas exibidos abaixo); badge &quot;Única&quot; /
                  &quot;Fracionada&quot; no cartão e linha da listagem de contratos; seção
                  &quot;Regra de Importação&quot; no diálogo de detalhes do contrato; e card
                  informativo na Importação Excel (<code>/pedidos</code> e <code>/importacao</code>)
                  exibindo o tipo configurado e, quando Única com abas, as abas mapeadas.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                2. Efeito Prático & Preservações Mandatórias:
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • <strong>Efeito Prático Neutro:</strong> Nenhum cálculo financeiro, preço
                  unitário, saldo ou dado cadastral é alterado — trata-se puramente de
                  parametrização de formato de importação e ergonomia visual da interface.
                </li>
                <li>
                  • <strong>Tarefa Estritamente Documental:</strong> Nenhuma alteração em código
                  funcional ou schema de dados; atualização restrita à documentação em{' '}
                  <code>/requisitos</code> e incremento de patch da versão.
                </li>
                <li>
                  • <strong>Preservação Rigorosa das 4 Telas de Entregas (Ponto v0.0.243):</strong>{' '}
                  Zero alterações em <code>/rotas</code>, Dashboard, Portal do Motorista e{' '}
                  <code>/monitoramento</code> — isolamento por <code>ciclo_id</code> e regras
                  anti-vazamento 100% preservados.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.255: Sincronização Automática do Espelho de Preço em contrato_itens */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30 font-semibold">
                Release v0.0.255
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.255: Sincronização Automática do Espelho de Preço em contrato_itens a partir de
                chamada_itens
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.255)</span>
          </div>

          <p className="text-sm text-foreground/90 leading-relaxed">
            Implementação da sincronização automática em tempo real do espelho de preços em{' '}
            <code>contrato_itens</code> para todos os contratos vinculados à Chamada Pública,
            garantindo que <strong>chamada_itens</strong> atue como fonte soberana sem que nenhum
            contrato fique defasado. Ao salvar preços da chamada, os registros em{' '}
            <code>contrato_itens</code> são atualizados instantaneamente, recalculando e persistindo
            o <code>valor_total</code> dos contratos quando houver quantidades contratadas
            informadas.
          </p>

          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                1. Regras de Sincronização & Gatilhos Operacionais:
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • <strong>Fonte Soberana & Casamento em Cascata:</strong> O espelho resolve o novo
                  preço primeiramente por <code>produto_id</code> e, como fallback, por nome
                  normalizado (trim + lowercase via <code>nome_contrato</code> ou produto mestre).
                </li>
                <li>
                  • <strong>Isolamento de Campos no Contrato:</strong> Altera estritamente o campo{' '}
                  <code>preco</code> em <code>contrato_itens</code>; nunca toca em{' '}
                  <code>quantidade_contratada</code>, <code>nome_contrato</code> ou{' '}
                  <code>apelidos</code>. Itens não existentes no contrato não são inseridos; itens
                  do contrato sem correspondência na chamada não são excluídos.
                </li>
                <li>
                  • <strong>Recálculo de valor_total:</strong> Se algum preço mudar e o contrato
                  possuir itens com quantidade contratada &gt; 0, o{' '}
                  <code>contratos.valor_total</code> é recalculado (soma de preço final ×
                  quantidade) e salvo no ato.
                </li>
                <li>
                  • <strong>Três Gatilhos com Tolerância a Falha:</strong> Disparado imediatamente
                  após <code>syncItems</code> na edição da chamada (<code>Producao.tsx</code>),
                  colagem em lote e importação de planilha em <code>ChamadaItemsManager.tsx</code>;
                  falhas de sincronização não travam o salvamento da chamada.
                </li>
                <li>
                  • <strong>Inicialização em Novos Contratos:</strong> Novos contratos criados
                  manual ou em massa (<code>Contracts.tsx</code> e{' '}
                  <code>ContractBatchImportDialog.tsx</code>) já nascem com seus itens espelhados e
                  com os preços oficiais da chamada selecionada.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                2. Preservações Mandatórias & Ponto de Atenção v0.0.243:
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • <strong>Snapshots em pedido_itens Intocados:</strong> Nenhum pedido existente ou
                  histórico é alterado; os preços congelados no momento do pedido permanecem 100%
                  íntegros.
                </li>
                <li>
                  • <strong>Preservação Rigorosa das 4 Telas de Entregas:</strong> Zero alterações
                  em <code>/rotas</code>, Dashboard, Portal do Motorista e{' '}
                  <code>/monitoramento</code> — isolamento por <code>ciclo_id</code> e blindagem
                  anti-vazamento rigorosamente mantidos.
                </li>
                <li>
                  • <strong>Passo 1 (0.0.254) Preservado:</strong> Resolução soberana na importação
                  Excel e no formulário WhatsApp continua operando com precedência de{' '}
                  <code>chamada_itens</code>.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.254: Resolução Soberana de Preço via Itens da Chamada */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30 font-semibold">
                Release v0.0.254
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.254: Resolução Soberana de Preço na Chamada Pública (Eliminação de Dependência
                de contrato_itens)
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.254)</span>
          </div>

          <p className="text-sm text-foreground/90 leading-relaxed">
            Alinhamento arquitetural da resolução de preços nos fluxos de entrada de pedidos à fonte
            soberana (<strong>chamada_itens</strong> da Chamada Pública vinculada ao
            ciclo/contrato), eliminando a dependência crítica do espelho secundário em{' '}
            <code>contrato_itens</code>. Esse alinhamento impede a criação de pedidos com preços
            defasados caso a chamada seja atualizada sem que o contrato seja expressamente re-salvo.
          </p>

          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                1. Fluxos Atualizados com Preço Soberano:
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • <strong>Importação Excel (/importacao e /pedidos):</strong> O importador (
                  <code>excelImporter.ts</code> e <code>ExcelImport.tsx</code>) recebe os itens da
                  chamada do ciclo/contrato selecionado (<code>selectedChamadaItems</code>) e busca
                  primeiro em <code>chamada_itens</code> por <code>produto_id</code> (com fallback
                  por nome); <code>contrato_itens.preco</code> é utilizado apenas como fallback caso
                  o item não esteja na chamada.
                </li>
                <li>
                  • <strong>Formulário Público do WhatsApp (/formulario/:token):</strong> Em{' '}
                  <code>SchoolOrderForm.tsx</code>, o carregamento do formulário busca{' '}
                  <code>chamada_itens</code> da chamada vinculada ao contrato do token (
                  <code>contrato.chamada_id</code>); os preços exibidos à escola e gravados no
                  pedido derivam de <code>chamada_itens</code> primeiro, com fallback para{' '}
                  <code>contrato_itens</code> e produto mestre.
                </li>
                <li>
                  • <strong>Identificadores do Contrato Preservados:</strong>{' '}
                  <code>nome_contrato</code> e apelidos (AKA) permanecem intactos e exclusivos de
                  cada contrato.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                2. Preservações Mandatórias & Ponto de Atenção v0.0.243:
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • <strong>Snapshot em pedido_itens Intocado:</strong> Preços gravados em pedidos
                  existentes nunca são alterados retroativamente.
                </li>
                <li>
                  • <strong>Preservação Rigorosa das 4 Telas de Entregas:</strong> Nenhuma alteração
                  em <code>/rotas</code>, Dashboard, Portal do Motorista e{' '}
                  <code>/monitoramento</code> — isolamento estrito por <code>ciclo_id</code> e
                  regras anti-vazamento 100% mantidos.
                </li>
                <li>
                  • <strong>Validações e Nomes Canônicos:</strong> Nome com AKA separado, total
                  consolidado canônico e validação de múltiplos de 0,5 rigorosamente preservados.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.253: Layout Compacto do Modal de Fornecedores sem Scroll Vertical */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30 font-semibold">
                Release v0.0.253
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.253: Layout Compacto do Modal de Cadastro/Edição de Fornecedores sem Rolagem
                Vertical em Desktop
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.253)</span>
          </div>

          <p className="text-sm text-foreground/90 leading-relaxed">
            Reorganização do formulário modal de cadastro e edição de fornecedores no módulo{' '}
            <strong>Fornecedores</strong> (<code>/fornecedores</code>,{' '}
            <code>src/pages/Fornecedores.tsx</code>), atendendo ao pedido do usuário (&quot;colocar
            todas as informações da edição inclusive o botão de salvar no cartão sem precisar rolar
            vertical&quot;). O layout foi reestruturado em grade compacta e proporcional, integrando
            foto/avatar de perfil compacta ao lado do nome e vínculo, campos de documento e contato
            lado a lado, endereço e bairro, e coordenadas com o bloco de validade do CAF, além de
            footer com botões &quot;Cancelar&quot; e &quot;Salvar&quot; fixados e imediatamente
            visíveis na viewport em desktops típicos (ex.: 1366×768).
          </p>

          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                1. Reorganização Ergonômica & Compactação do Formulário:
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • <strong>Avatar & Upload Otimizado:</strong> Posicionamento lateral compacto do
                  avatar e botão de upload ao lado dos campos Nome e Vínculo, eliminando o bloco
                  vertical extenso anterior.
                </li>
                <li>
                  • <strong>Grade de Identificação & Contato:</strong> CPF/CNPJ, WhatsApp, Sexo e
                  Data de Nascimento alinhados em 4 colunas compactas com tipografia equilibrada.
                </li>
                <li>
                  • <strong>Localização & CAF Integrado:</strong> Endereço (2 cols) e Bairro (1
                  col); linha seguinte com CEP, Latitude, Longitude e Validade do CAF com destaque
                  colorido (verde para válido e vermelho para vencido) totalmente integrados.
                </li>
                <li>
                  • <strong>Footer Fixo & Zero Scroll em Desktop:</strong> O rodapé com os botões
                  Salvar/Cancelar é fixo e visível sem rolagem na tela desktop; rolagem interna
                  mantida apenas defensivamente para telas verticais extremamente baixas ou mobile.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                2. Integridade Funcional & Ponto de Atenção v0.0.243:
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • <strong>100% das Validações Preservadas:</strong> Validação de dígitos
                  verificadores de CPF e CNPJ (módulo 11), máscaras de WhatsApp e CEP, compressão
                  client-side (300×300 JPEG), e verificação de CAF ativo/vencido rigorosamente
                  mantidas.
                </li>
                <li>
                  • <strong>Preservação Rigorosa das 4 Telas Críticas:</strong> Nenhuma alteração
                  nas quatro telas de entregas protegidas (<code>/rotas</code>, Dashboard, Portal do
                  Motorista e <code>/monitoramento</code>), preservando integralmente o isolamento
                  por
                  <code>ciclo_id</code> e regras anti-vazamento.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.252: Reordenamento do Item Fornecedores no Menu Lateral */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30 font-semibold">
                Release v0.0.252
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.252: Reordenamento do Item &quot;Fornecedores&quot; no Menu Lateral
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.252)</span>
          </div>

          <p className="text-sm text-foreground/90 leading-relaxed">
            Ajuste na hierarquia de navegação do menu lateral do sistema (
            <code>src/components/Layout.tsx</code>), movendo o item{' '}
            <strong>&quot;Fornecedores&quot;</strong> de sua posição inicial anterior no topo do
            menu (onde havia sido incluído na release 0.0.250) para a posição imediatamente{' '}
            <strong>depois do item &quot;Dashboard&quot;</strong>. A sequência de navegação passa a
            ser: 1º <em>Dashboard</em> (<code>/</code>), 2º <em>Fornecedores</em> (
            <code>/fornecedores</code>), seguido pelos demais itens na ordem operacional vigente.
          </p>

          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                1. Especificações da Mudança no Menu:
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • <strong>Nova Posição:</strong> Segundo item do menu (logo após o Dashboard).
                </li>
                <li>
                  • <strong>Preservação Integral de Propriedades:</strong> Mesmo ícone/emoji (🚜),
                  mesmo rótulo (&quot;Fornecedores&quot;) e mesma rota de acesso (
                  <code>/fornecedores</code>).
                </li>
                <li>
                  • <strong>Visibilidade e Responsividade:</strong> Disponível no menu lateral
                  desktop e no menu móvel gaveta (drawer), respeitando todas as regras de controle
                  de acesso.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                2. Integridade do Sistema & Ponto de Atenção v0.0.243:
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • <strong>Módulo Fornecedores 100% Inalterado:</strong> CRUD nativo PocketBase,
                  compressão client-side de fotos 300x300 JPEG, validação estrita de CPF/CNPJ e
                  checagem de CAF mantidos sem alterações.
                </li>
                <li>
                  • <strong>Preservação das 4 Telas Críticas:</strong> Nenhuma alteração em rotas,
                  entregas ou lógica de ciclos em <code>/rotas</code>, Dashboard, Portal do
                  Motorista e <code>/monitoramento</code>.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.251: Compressão e Redimensionamento de Fotos no Módulo Fornecedores */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30 font-semibold">
                Release v0.0.251
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.251: Otimização de Fotos de Fornecedores — Compressão e Redimensionamento
                Client-Side (300x300 JPEG)
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.251)</span>
          </div>

          <p className="text-sm text-foreground/90 leading-relaxed">
            Implementação da rotina de compressão e redimensionamento automático de imagens no
            módulo <strong>Fornecedores</strong> (<code>/fornecedores</code>,{' '}
            <code>src/pages/Fornecedores.tsx</code> e <code>src/services/fornecedores.ts</code>),
            atendendo à solicitação direta do usuário para evitar estouro de cota ou de limite de
            armazenamento por upload de fotos em tamanho original. As imagens são agora processadas
            no navegador via Canvas antes de qualquer gravação ou envio ao PocketBase.
          </p>

          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                1. Compressão Client-Side & Proteção de Cota:
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • <strong>Caixa máxima 300x300 pixels:</strong> Redimensionamento preservando a
                  proporção original sem upscale para fotos menores que 300px.
                </li>
                <li>
                  • <strong>Exportação em JPEG (qualidade 0.85):</strong> Redução drástica do
                  payload (ex.: fotos de 3MB–5MB são reduzidas para ~15KB–35KB), enviando
                  exclusivamente a versão otimizada ao backend PocketBase.
                </li>
                <li>
                  • <strong>Processamento no Input & Camada de Serviço:</strong> A compressão ocorre
                  imediatamente na seleção do arquivo com indicador de progresso e badge visual,
                  além de dupla verificação defensiva no <code>fornecedoresService</code> antes de
                  montar o FormData.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                2. Avisos Explícitos & Preservação das Quatro Telas:
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • <strong>Tratamento Explícito de Falhas:</strong> Caso a imagem ou requisição
                  falhe por cota, tamanho ou limite de storage (códigos 400 ou 413 do PocketBase),
                  um toast de alerta claro é exibido ao usuário sem qualquer falha silenciosa.
                </li>
                <li>
                  • <strong>Módulo Fornecedores 100% Intacto:</strong> Validações de CPF/CNPJ,
                  máscaras, destaque de CAF vencido em vermelho e confirmações de exclusão
                  permanecem plenamente funcionais.
                </li>
                <li>
                  • <strong>Ponto de Atenção v0.0.243 intacto:</strong> Nenhuma alteração nas 4
                  telas críticas de entregas (<code>/rotas</code>, Dashboard, Portal do Motorista e{' '}
                  <code>/monitoramento</code>).
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.250: Novo Módulo Fornecedores Completo */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30 font-semibold">
                Release v0.0.250
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.250: Módulo "Fornecedores" Completo com Gestão de Produtores, CAF e Vínculo
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.250)</span>
          </div>

          <p className="text-sm text-foreground/90 leading-relaxed">
            Entrega do módulo mestre <strong>&quot;Fornecedores&quot;</strong> (
            <code>/fornecedores</code>, <code>src/pages/Fornecedores.tsx</code>), posicionado no
            topo do menu lateral principal (primeiro item com ícone 🚜), persistido nativamente na
            nova coleção PocketBase <code>fornecedores</code> (Migration 0144) com suporte a foto de
            perfil, documentos com validação matemática estrita de CPF/CNPJ, máscaras automáticas,
            coordenadas simples, indicadores visuais de validade do CAF (com destaque vermelho em
            caso de vencimento) e isolamento arquitetural rigoroso das 4 telas de entrega.
          </p>

          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                1. Estrutura de Dados & Persistência PocketBase:
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  •{' '}
                  <strong>
                    Coleção <code>fornecedores</code> (Migration 0144):
                  </strong>{' '}
                  Campos <code>nome</code> (obrigatório), <code>sexo</code> (MASCULINO, FEMININO,
                  OUTRO), <code>data_nascimento</code>, <code>foto</code> (arquivo até 5MB),{' '}
                  <code>vinculo</code> (COOPERADO ou EXTERNO), <code>identidade</code> (CPF ou
                  CNPJ), <code>data_validade_caf</code>, <code>endereco</code>, <code>bairro</code>,{' '}
                  <code>cep</code>, <code>latitude</code> e <code>longitude</code> (numéricos
                  simples) e <code>whatsapp</code>.
                </li>
                <li>
                  • <strong>Persistência Nativa:</strong> CRUD via <code>fornecedoresService</code>{' '}
                  e <code>AppContext</code> sincronizado com PocketBase e realtime nativo, sem ilhas
                  de <code>localStorage</code>.
                </li>
                <li>
                  • <strong>Exclusão Segura:</strong> Exclusão física com diálogo modal de
                  confirmação <code>AlertDialog</code> com avisos preventivos.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                2. Regras de Validação, CAF & Preservação das Quatro Telas:
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • <strong>Validação de CPF/CNPJ:</strong> Verificação rigorosa de dígitos
                  verificadores com algoritmo módulo 11 para CPF (11 dígitos) e duplo ponderador
                  para CNPJ (14 dígitos), aceitando ambos no mesmo campo.
                </li>
                <li>
                  • <strong>Destaque em Vermelho do CAF:</strong> Comparação da data do CAF com o
                  dia atual (&ge; hoje Válido verde; &lt; hoje Vencido vermelho com ícone de alerta;
                  — quando não informado), sinalizado tanto na listagem quanto no formulário.
                </li>
                <li>
                  • <strong>Máscara de WhatsApp:</strong> Formatação automática no padrão celular
                  brasileiro <code>(XX) XXXXX-XXXX</code>.
                </li>
                <li>
                  • <strong>Ponto de Atenção v0.0.243 intacto:</strong> Zero impacto ou
                  interferência nas 4 telas de entregas (<code>/rotas</code>, Dashboard, Portal do
                  Motorista e <code>/monitoramento</code>).
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.249: Limpeza Geral do Campo Telefone de Todas as Escolas */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/40 font-semibold">
                Release v0.0.249
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.249: Higienização & Limpeza do Campo Telefone de Todas as Escolas
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.249)</span>
          </div>

          <p className="text-sm text-foreground/90 leading-relaxed">
            Execução de rotina de manutenção e higienização cadastral via migração PocketBase
            (Migration <code>0143_limpar_telefones_escolas.js</code>) para limpeza do campo{' '}
            <code>telefone</code> de{' '}
            <strong>
              todos os registros da coleção <code>escolas</code>
            </strong>
            , atendendo à solicitação direta do usuário (&quot;apagar os telefones das escolas&quot;
            → &quot;limpar os valores&quot;).
          </p>

          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                1. Escopo & Execução da Migração 0143:
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • <strong>Campo higienizado:</strong> <code>telefone = &quot;&quot;</code> (string
                  vazia) em todos os registros da coleção <code>escolas</code> cujo telefone se
                  encontrava preenchido.
                </li>
                <li>
                  • <strong>Padrão defensivo e idempotente:</strong> Atualização via SQL direto e
                  varredura via SDK PocketBase, segura contra execuções repetidas.
                </li>
                <li>
                  • <strong>Auditoria pós-aplicação:</strong> Consulta direta ao banco confirmou
                  zero escolas com campo telefone preenchido após a migração.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                2. Preservação Rigorosa dos Demais Dados Cadastrais:
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • <strong>Campos intactos:</strong> Nome, contato, e-mail, endereço, bairro, CEP,
                  código INEP, tipo escolar, dependência administrativa, número de alunos e
                  coordenadas geográficas permaneceram rigorosamente inalterados.
                </li>
                <li>
                  • <strong>Sem efeitos colaterais:</strong> Nenhuma alteração em rotas, contratos,
                  chamadas, pedidos ou regras de negócio do sistema.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.248: Filtros de Chamada e Ciclo em Gestão de Pedidos */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30 font-semibold">
                Release v0.0.248
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.248: Filtros de Chamada Pública e Ciclo Operacional em Gestão de Pedidos
                (/pedidos)
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.248)</span>
          </div>

          <p className="text-sm text-foreground/90 leading-relaxed">
            Inclusão de filtros dedicados por <strong>Chamada Pública</strong> e{' '}
            <strong>Ciclo Operacional</strong> na barra superior de filtros da Gestão de Pedidos (
            <code>/pedidos</code>, <code>src/pages/Orders.tsx</code>). Os novos seletores operam de
            forma integrada e cumulativa com os filtros já existentes (Origem, Status, Validação,
            Aba da Planilha e Rota), garantindo navegação rápida e filtragem estrita na esteira de
            pedidos lançados.
          </p>

          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                1. Controles Visuais & Cascata Inteligente:
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • <strong>Seletor de Chamada:</strong> Exibe{' '}
                  <em>&quot;Todas as Chamadas&quot;</em> + chamadas cadastradas com número e
                  programa (ex.: <code>01/2025 (Municipal)</code> e <code>07/2025 (Estadual)</code>
                  ).
                </li>
                <li>
                  • <strong>Seletor de Ciclo em Cascata:</strong> Exibe{' '}
                  <em>&quot;Todos os Ciclos&quot;</em> + ciclos vinculados à chamada selecionada
                  (código semanal e fase amigável). Fica automaticamente desabilitado quando a
                  chamada for <em>&quot;Todas as Chamadas&quot;</em> ou quando a chamada não possuir
                  ciclos.
                </li>
                <li>
                  • <strong>Reset em Cascata:</strong> Ao alterar a chamada selecionada, o seletor
                  de ciclo é imediatamente redefinido para <em>&quot;Todos os Ciclos&quot;</em>.
                </li>
                <li>
                  • <strong>Limpar Filtros:</strong> A ação &quot;Limpar filtros&quot; existente
                  reseta simultaneamente ambos os novos seletores e os cinco filtros anteriores.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                2. Filtragem Estrita & Regras Anti-Vazamento Preservadas:
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • <strong>Filtragem Estrita por Chamada:</strong> Quando selecionada uma chamada,
                  computa apenas pedidos cujo <code>cicloId</code> pertença àquela chamada (mapa{' '}
                  <code>cicloId → chamada_id</code> derivado dos ciclos; pedidos sem cicloId são
                  excluídos).
                </li>
                <li>
                  • <strong>Filtragem Estrita por Ciclo:</strong> Comparação exata por chave de
                  banco (<code>o.cicloId === filterCiclo</code>), nunca por heurística ou datas.
                </li>
                <li>
                  • <strong>Modal & Ciclo Corrente Intactos:</strong> O fluxo e modal &quot;Lançar
                  Pedido&quot; e a chave global do <code>cicloCorrente</code> não sofrem qualquer
                  interferência (filtros são exclusivamente de consulta da tabela).
                </li>
                <li>
                  • <strong>Ponto de Atenção v0.0.243 intacto:</strong> Nenhuma alteração nas 4
                  telas críticas de entregas (<code>/rotas</code>, Dashboard, Portal do Motorista e{' '}
                  <code>/monitoramento</code>).
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.247: Exclusão Pontual do Ciclo 42/2026 Cancelado */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30 font-semibold">
                Release v0.0.247
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.247: Exclusão Pontual do Ciclo 42/2026 Cancelado e Sem Registros Dependentes
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.247)</span>
          </div>

          <p className="text-sm text-foreground/90 leading-relaxed">
            Exclusão definitiva e segura no banco de dados (Migration 0142) do registro pontual do{' '}
            <strong>Ciclo 42/2026</strong> (id <code>sllf3p8i8wpm34i</code>, Chamada Pública 01/2025
            Municipal) com status cancelado e motivo <em>&quot;Aberto antes da hora&quot;</em>, após
            confirmação explícita do usuário e auditoria prévia comprovando a ausência total de
            quaisquer registros dependentes em coleções correlatas (pedidos, despachos, rotas,
            envios ou comprovantes).
          </p>

          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-destructive">
                Higienização Realizada (Migration 0142):
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • <strong>Registro removido:</strong> Ciclo 42/2026 (id{' '}
                  <code>sllf3p8i8wpm34i</code>) da coleção <code>ciclos</code>.
                </li>
                <li>
                  • <strong>Validação prévia na migração:</strong> execução condicionada à
                  existência do ID com nome exato &quot;Ciclo 42/2026&quot; e status
                  &quot;cancelado&quot;, garantindo idempotência e segurança.
                </li>
                <li>
                  • <strong>Zero dependências:</strong> checagem em <code>pedidos</code>,{' '}
                  <code>despachos</code>, <code>rota_despachos</code>, <code>rota_snapshots</code>,{' '}
                  <code>tokens_formulario</code>, <code>envios_whatsapp</code> e{' '}
                  <code>importacoes</code>.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">Integridade Operacional Preservada:</span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • <strong>Ciclos Ativos e Históricos:</strong> Ciclos 40/2026 e 41/2026 (Chamada
                  01/2025 e Chamada 07/2025) 100% preservados.
                </li>
                <li>
                  • <strong>Histórico de Ciclos:</strong> tela <code>/historico-ciclos</code> limpa
                  de registro cancelado espúrio.
                </li>
                <li>
                  • <strong>Regras intactas:</strong> nenhum código de telas, regras de negócio ou
                  endpoints alterados.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.246: Cálculo Estável do Card Receita Entregue do Mês no Dashboard */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30 font-semibold">
                Release v0.0.246
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.246: Cálculo Estável do Card &quot;Receita Entregue do Mês&quot; no Dashboard —
                Base pela Entrega Prevista do Ciclo
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.246)</span>
          </div>

          <p className="text-sm text-foreground/90 leading-relaxed">
            Ajuste na lógica de consolidação do card{' '}
            <strong>&quot;Receita Entregue do Mês&quot;</strong> no Dashboard executivo (
            <code>/</code>, <code>src/pages/Index.tsx</code>) para eliminar a oscilação semanal do
            percentual (onde a cada ciclo semanal novos pedidos entravam no denominador pela data de
            criação e faziam a porcentagem saltar de 100% para 50% e voltar a 100%). A nova regra
            (Opção A — base pela entrega prevista) alinha a temporalidade de ambos os termos: o{' '}
            <strong>numerador</strong> computa os pedidos entregues cuja data efetiva de entrega (
            <code>entregue_em</code>) cai no mês corrente, enquanto o <strong>denominador</strong>{' '}
            (&quot;Total previsto do mês&quot;) computa a receita já entregue somada aos pedidos não
            entregues (<em>Pendente</em> ou <em>Em Rota</em>) cujo{' '}
            <strong>CICLO operacional possui data de entrega/despacho</strong> (
            <code>getDespachoEfetivoCiclo</code>) programada para o mês corrente, em vez da data de
            criação do pedido.
          </p>

          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                1. Regras de Numerador, Denominador & Coerência Temporal:
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • <strong>Numerador:</strong> soma do valor canônico (<code>order.total</code>;
                  fallback para soma dos itens) dos pedidos com status &quot;Entregue&quot; cuja
                  data de entrega (<code>entregue_em</code>) cai no mês corrente.
                </li>
                <li>
                  • <strong>Denominador (Previsto do Mês):</strong> numerador + pedidos com status{' '}
                  &quot;Pendente&quot; ou &quot;Em Rota&quot; cujo ciclo entrega no mês corrente (
                  <code>getDespachoEfetivoCiclo(ciclo)</code>).
                </li>
                <li>
                  • <strong>Pedidos entre meses:</strong> pedidos feitos no final do mês passado
                  cujo ciclo entrega neste mês entram no denominador (e no numerador quando
                  entregues), sem distorção de base.
                </li>
                <li>
                  • Deduplicação estrita por <code>order.id</code> (regra da v0.0.214), pedidos
                  Cancelados desconsiderados e percentual protegido com limite em 100%.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                2. Apresentação & Preservação das Quatro Telas de Entregas:
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • <strong>Apresentação Clara:</strong> Card mantém o valor entregue em destaque e
                  subtexto explicativo: <em>&quot;X% do previsto do mês (R$ Y)&quot;</em>.
                </li>
                <li>
                  • <strong>Outros cards preservados:</strong> Pedidos Pendentes, Pedidos em Rota,
                  Contratos Ativos, Chamadas Ativas e ciclos operacionais permanecem intactos.
                </li>
                <li>
                  • <strong>Ponto de Atenção v0.0.243 intacto:</strong> O widget &quot;Entregas em
                  Andamento&quot; mantém estritamente o isolamento por <code>ciclo_id</code> e a
                  regra anti-vazamento (pedidos &quot;Em Rota&quot; + zero entregas = progresso 0).
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.245: Domínio Único de Ciclos no Eixo X da Comparação de Consumo */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.245
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.245: Domínio Único de Ciclos no Eixo X da Comparação de Consumo & Consolidação
                Sem Pontos Repetidos
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.245)</span>
          </div>

          <p className="text-sm text-foreground/90 leading-relaxed">
            Correção definitiva dos gráficos de tendência de consumo e valor consolidado na aba{' '}
            <strong>&quot;Comparação de Consumo&quot;</strong> em <code>/historico-ciclos</code> (
            <code>src/components/ConsumptionComparison.tsx</code>). Anteriormente, a coexistência de
            ciclos semanais com o mesmo número/ano em chamadas públicas distintas (ex.:{' '}
            <em>Ciclo 40/2026 Municipal</em> e <em>Ciclo 40/2026 Estadual</em>) provocava a
            repetição de rótulos no eixo horizontal (duas posições separadas para 40/2026 no eixo
            X). A arquitetura foi refatorada para estabelecer um{' '}
            <strong>domínio unificado de ciclos</strong> ordenado cronologicamente, com rótulo no
            padrão canônico <code>N/AAAA</code> (ex.: <code>40/2026</code>), onde cada ciclo aparece
            exatamente <strong>uma única vez no eixo horizontal</strong>, com todas as séries
            (Escolas, Chamadas e Contratos) compartilhando rigorosamente a mesma coordenada
            temporal.
          </p>

          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                1. Domínio Único de Ciclos & Coordenada Compartilhada:
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • Unificação de ciclos com mesmo código semanal (<code>extractCicloCodigo</code>)
                  em uma só categoria cronológica.
                </li>
                <li>
                  • Cada ponto do eixo X agrega todos os IDs de ciclos correspondentes (ex.: 40/2026
                  da Municipal e 40/2026 da Estadual).
                </li>
                <li>
                  • Eliminação total de duplicidade no eixo X nos três modos: Escolas, Chamadas e
                  Contratos.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                2. Filtro por Chamada & Regras Canônicas de Produtos e Valores:
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • Inclusão de filtro dedicado por <strong>Chamada Pública</strong> na barra
                  superior, permitindo focar a análise em uma chamada específica ou comparar todas.
                </li>
                <li>
                  • Aplicação estrita da regra do nome do produto (<code>parseProductNameAka</code>:
                  nome antes da vírgula no seletor e títulos).
                </li>
                <li>
                  • Preservação do cálculo canônico do valor em R$ (<code>order.total</code>) e
                  volume em KG/unidade sem vazamento entre ciclos.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.244: Card "Pedidos em Rota" no Dashboard & Isolamento por Ciclos Ativos */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30 font-semibold">
                Release v0.0.244
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.244: Card &quot;Pedidos em Rota&quot; no Dashboard Executivo & Isolamento
                Estrito por Ciclos Ativos
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.244)</span>
          </div>

          <p className="text-sm text-foreground/90 leading-relaxed">
            Publicação do indicador <strong>&quot;Pedidos em Rota&quot;</strong> no Dashboard
            principal (<code>/</code>, <code>src/pages/Index.tsx</code>) imediatamente ao lado do
            card &quot;Pedidos Pendentes&quot;, ampliando o grid executivo para 5 colunas
            responsivas (<code>md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5</code>). O novo card
            utiliza ícone <code>Truck</code>, paleta âmbar (
            <code>text-amber-600 dark:text-amber-400</code>, <code>bg-amber-500/10</code>), link
            direto para <code>/rotas</code> e subtexto dinâmico (
            <em>&quot;Despachados / em trânsito&quot;</em> com badge quando &gt; 0, e{' '}
            <em>&quot;Nenhum pedido em trânsito&quot;</em> quando zerado). Tanto o card de Pedidos
            Pendentes quanto o de Pedidos em Rota aplicam isolamento estrito pelos ciclos ativos (
            <code>activeCiclosList</code>), impedindo vazamento de histórico encerrado e reafirmando
            o Dashboard como uma das 4 telas de atenção obrigatória contra contaminação de estado.
          </p>

          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                1. Card &quot;Pedidos em Rota&quot; e Grade Executiva:
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • Posicionado estrategicamente logo após &quot;Pedidos Pendentes&quot; na grade
                  superior de métricas.
                </li>
                <li>
                  • Grade ajustada para 5 colunas responsivas sem deslocar nem remover as métricas
                  existentes (Contratos Ativos, Chamadas Ativas, Receita Entregue).
                </li>
                <li>
                  • Ícone Truck em moldura âmbar com badge dinâmico (&quot;X em rota&quot;) e link
                  de navegação rápida para <code>/rotas</code>.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                2. Isolamento por Ciclos Ativos & Regra Anti-Vazamento:
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • Filtragem estrita:{' '}
                  <code>
                    orders.filter(o =&gt; o.status === &apos;Em Rota&apos; &amp;&amp; (!o.cicloId ||
                    activeCicloIds.has(o.cicloId)))
                  </code>
                  .
                </li>
                <li>
                  • NUNCA soma pedidos de ciclos fechados ou cancelados; espelha os dados em tempo
                  real da esteira de <code>/rotas</code> e <code>/monitoramento</code>.
                </li>
                <li>
                  • Reafirmação da regra anti-vazamento nas 4 telas: pedidos &quot;Em Rota&quot; com
                  zero entregas no ciclo ativo mantêm progresso 0, nunca &quot;X de X&quot;.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.243: Documentação das Quatro Telas de Apresentação de Entregas & Ponto de Atenção Anti-Vazamento */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30 font-semibold">
                Release v0.0.243
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.243: Documentação das Quatro Telas de Apresentação de Entregas — Pontos de
                Atenção Obrigatórios & Regra Anti-Vazamento
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.243)</span>
          </div>

          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-sm">
              <span className="text-base">⚠️</span>
              <span>PONTO DE ATENÇÃO OBRIGATÓRIO PARA QUALQUER MODIFICAÇÃO FUTURA EM ENTREGAS</span>
            </div>
            <p className="text-xs text-foreground/90 leading-relaxed">
              Qualquer modificação futura no sistema que afete o estado de entregas — incluindo
              gravação ou atualização em <code>entrega_registros</code>, ciclo de vida de{' '}
              <code>rota_despachos</code>/<code>despachos</code>, status de <code>pedidos</code>{' '}
              (Pendente, Em Rota, Entregue), cálculo de progresso de rotas ou totalizadores de
              entregas —{' '}
              <strong>DEVE SER OBRIGATORIAMENTE VERIFICADA NAS QUATRO TELAS ABAIXO</strong>. A
              contagem e o estado de entregas devem{' '}
              <strong>ficar estritamente isolados pelo ciclo selecionado</strong> (filtro
              obrigatório por <code>ciclo_id</code>, com fallback por janela temporal{' '}
              <code>data_inicio</code> até <code>data_fim + 24h</code> apenas para registros legados
              sem <code>ciclo_id</code>), aplicando sem exceção a{' '}
              <strong>Regra Anti-Vazamento Fundamental</strong>: quando houver pedidos &quot;Em
              Rota&quot; no ciclo e zero entregas confirmadas naquele ciclo, o progresso deve ser{' '}
              <strong>0 de N</strong> (nunca &quot;X de X&quot; herdado de ciclo anterior) e o
              crachá/banner deve permanecer ativo.
            </p>
          </div>

          {/* As Quatro Telas Isoladas por Ciclo */}
          <div className="space-y-3">
            <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <span>📋</span> As Quatro Telas de Apresentação de Entregas e seus Comportamentos
              Exigidos:
            </span>

            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              {/* Tela 1: /rotas */}
              <div className="rounded-md border border-border/80 bg-muted/20 p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold text-primary flex items-center gap-1.5 text-xs sm:text-sm">
                    <span>1.</span> Rotas de Entrega (<code>/rotas</code>)
                  </span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    v0.0.239
                  </Badge>
                </div>
                <ul className="space-y-1.5 text-xs text-muted-foreground leading-relaxed">
                  <li>
                    • <strong>Estado da Rota:</strong> Badges &quot;Aguardando Despacho&quot;,
                    &quot;Em Rota&quot; (laranja) e &quot;Rota Entregue&quot; (verde) calculados
                    estritamente pelo <code>selectedCiclo.id</code>.
                  </li>
                  <li>
                    • <strong>Sequência de Paradas:</strong> Ordem isolada por ciclo via snapshot em{' '}
                    <code>rota_snapshots</code> (versão <code>edicao</code>).
                  </li>
                  <li>
                    • <strong>Anti-Vazamento:</strong> Se há pedidos &quot;Em Rota&quot; no ciclo e
                    zero entregas confirmadas no ciclo, a rota permanece &quot;Em Rota&quot;, com
                    travas ativas e sem bloqueio espúrio por despachos de ciclos anteriores.
                  </li>
                </ul>
              </div>

              {/* Tela 2: Dashboard */}
              <div className="rounded-md border border-border/80 bg-muted/20 p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold text-primary flex items-center gap-1.5 text-xs sm:text-sm">
                    <span>2.</span> Dashboard Executivo (<code>/</code>)
                  </span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    v0.0.240
                  </Badge>
                </div>
                <ul className="space-y-1.5 text-xs text-muted-foreground leading-relaxed">
                  <li>
                    • <strong>Widget &quot;Entregas em Andamento&quot;:</strong> Consulta{' '}
                    <code>getAtivoByRota</code> e <code>getEntregaRegistrosDaRota</code> com{' '}
                    <code>cicloId</code> resolvido da rota.
                  </li>
                  <li>
                    • <strong>Cards de Ciclos Ativos:</strong> Distinção explícita entre{' '}
                    <em>&quot;Escolas com Pedidos&quot;</em> (escolas demandantes) e{' '}
                    <em>&quot;Entregas Concluídas: X de Y&quot;</em> (X = escolas entregues no
                    ciclo).
                  </li>
                  <li>
                    • <strong>Anti-Vazamento:</strong> Pedidos Em Rota com zero entregas no ciclo
                    mantém <code>entregasConfirmadasCount = 0</code> e crachá &quot;Em Rota&quot;,
                    nunca &quot;Rota concluída&quot;.
                  </li>
                </ul>
              </div>

              {/* Tela 3: Portal do Motorista */}
              <div className="rounded-md border border-border/80 bg-muted/20 p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold text-primary flex items-center gap-1.5 text-xs sm:text-sm">
                    <span>3.</span> Portal do Motorista (<code>/motorista?token=...</code>)
                  </span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    v0.0.241
                  </Badge>
                </div>
                <ul className="space-y-1.5 text-xs text-muted-foreground leading-relaxed">
                  <li>
                    • <strong>Resolução no Serviço:</strong> <code>carregarPortalMotorista</code>{' '}
                    filtra registros de entrega estritamente pelo <code>ciclo_id</code> do despacho
                    ativo.
                  </li>
                  <li>
                    • <strong>Contador e Paradas:</strong> Contador de progresso &quot;X de N
                    entregas&quot;, mapa de trecho e botões &quot;Registrar Entrega&quot; isolados
                    no ciclo ativo.
                  </li>
                  <li>
                    • <strong>Anti-Vazamento:</strong> Ciclo com pedidos &quot;Em Rota&quot; e zero
                    entregas inicia em 0/N, todas as paradas ficam abertas e o banner verde de
                    conclusão é estritamente bloqueado.
                  </li>
                </ul>
              </div>

              {/* Tela 4: /monitoramento */}
              <div className="rounded-md border border-border/80 bg-muted/20 p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold text-primary flex items-center gap-1.5 text-xs sm:text-sm">
                    <span>4.</span> Monitoramento Operacional (<code>/monitoramento</code>)
                  </span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    v0.0.242
                  </Badge>
                </div>
                <ul className="space-y-1.5 text-xs text-muted-foreground leading-relaxed">
                  <li>
                    • <strong>Painel de Alertas (Bloco B):</strong>{' '}
                    <code>MonitoringDeliveryAlerts</code> invoca{' '}
                    <code>getEntregaRegistrosDaRota(rota.id, ciclo.id)</code> com ciclo obrigatório.
                  </li>
                  <li>
                    • <strong>Aviso Sonoro e Paradas Pendentes:</strong> Efeito sonoro Melódico Web
                    Audio API validado por ciclo; contagem de paradas pendentes &quot;faltam X de
                    N&quot; sem misturar ciclos.
                  </li>
                  <li>
                    • <strong>Anti-Vazamento:</strong> Zero entregas no ciclo selecionado exibe
                    &quot;0 de N entregas realizadas&quot; e bloqueia &quot;Todas as escolas desta
                    rota já foram entregues!&quot;.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Resumo da Regra de Homologação */}
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-foreground/90 space-y-1">
            <span className="font-semibold text-primary">
              Protocolo de Verificação Obrigatória (Checklist de Homologação):
            </span>
            <p className="leading-relaxed">
              Toda PR, refatoração de serviços (<code>rota-despachos.ts</code>,{' '}
              <code>AppContext</code>, etc.) ou alteração em banco/realtime que envolva entregas
              deve passar pelo checklist:
              <strong> (1)</strong> Rota em <code>/rotas</code> exibe estado do ciclo selecionado e
              não do histórico;
              <strong> (2)</strong> Dashboard (<code>/</code>) reflete entregas do ciclo corrente
              sem vazamento no widget e nos cards;
              <strong> (3)</strong> Portal do Motorista abre com 0/N entregas em rotas
              recém-despachadas sem banner de conclusão;
              <strong> (4)</strong> Painel de alertas em <code>/monitoramento</code> lista paradas
              pendentes corretas e só toca áudio de novas entregas do ciclo monitorado.
            </p>
          </div>
        </div>

        {/* Release v0.0.242: Correção de Vazamento de Ciclo na Página /monitoramento (MonitoringDeliveryAlerts) */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.242
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.242: Isolamento Estrito por Ciclo em /monitoramento (MonitoringDeliveryAlerts) &
                Regra Anti-Vazamento
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.242)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Eliminação definitiva do vazamento de registros de entrega entre ciclos na tela de
            Monitoramento (<code>/monitoramento</code> / <code>MonitoringDeliveryAlerts.tsx</code>):
            correção da chamada <code>getEntregaRegistrosDaRota(rota.id, ciclo.id)</code> para
            passar obrigatoriamente o ciclo selecionado, aplicando filtro defensivo restrito ao
            ciclo (registros legados sem <code>ciclo_id</code> validados estritamente pela janela
            temporal <code>data_inicio</code> até <code>data_fim + 24h</code>). Implementação da
            regra anti-vazamento: se a rota possui pedidos &quot;Em Rota&quot; no ciclo selecionado
            e zero entregas confirmadas naquele ciclo, a rota exibe{' '}
            <code>0 de N entregas realizadas</code> e todas as paradas como pendentes, impedindo a
            exibição espúria de &quot;11 de 11 entregas realizadas&quot; e &quot;Todas as escolas
            desta rota já foram entregues!&quot;. Adicionalmente, o efeito sonoro via Web Audio API
            foi blindado para disparar exclusivamente quando a nova entrega confirmada pertencer ao
            ciclo monitorado.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                1. Consulta Estrita e Filtro Defensivo (MonitoringDeliveryAlerts.tsx):
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • Inclusão mandatória de <code>ciclo.id</code> em{' '}
                  <code>getEntregaRegistrosDaRota(rota.id, ciclo.id)</code>.
                </li>
                <li>
                  • Filtro defensivo: preserva apenas <code>reg.ciclo_id === ciclo.id</code>;
                  legados sem ciclo_id aceitos somente dentro da janela temporal do ciclo (início
                  até fim + 24h).
                </li>
                <li>
                  • Efeito sonoro restrito: validação de <code>ciclo_id</code> e janela temporal
                  antes de disparar o alerta sonoro de nova entrega.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                2. Regra Anti-Vazamento e Alertas da Rota:
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • Detecção de pedidos da rota com <code>cicloId === ciclo.id</code> e status
                  &quot;Em Rota&quot;.
                </li>
                <li>
                  • Se há pedidos &quot;Em Rota&quot; e nenhuma entrega confirmada no ciclo,{' '}
                  <code>entregasFeitas = 0</code> e todas as paradas cadastradas permanecem
                  pendentes.
                </li>
                <li>
                  • Bloqueio absoluto do texto &quot;Todas as escolas desta rota já foram
                  entregues!&quot; em ciclos recém-iniciados.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.241: Correção de Vazamento de Ciclo no Portal do Motorista */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.241
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.241: Isolamento Estrito por Ciclo no Portal do Motorista & Regra Anti-Vazamento
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.241)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Eliminação definitiva do vazamento de ciclo no Portal do Motorista (
            <code>/motorista?token=...</code>): correção em <code>carregarPortalMotorista</code> (
            <code>src/services/rota-despachos.ts</code>) para resolver ativamente o ciclo do
            despacho (<code>despacho.ciclo_id</code>, ou ciclo ativo da chamada em legados) e
            filtrar <code>entrega_registros</code> estritamente por{' '}
            <code>rota_id = X && (ciclo_id = cicloResolvido || despacho_id = despachoAtivo)</code>,
            com fallback por janela temporal restrito a registros legados com{' '}
            <code>ciclo_id = &quot;&quot;</code>. Aplicação da regra anti-vazamento: se a rota
            possui pedidos &quot;Em Rota&quot; no ciclo e zero entregas confirmadas, nenhuma parada
            é marcada como entregue. No front-end (<code>MotoristaPortal.tsx</code>), as contagens
            de entregas feitas, a identificação da próxima parada pendente e a exibição do banner de
            conclusão validam estritamente o ciclo do despacho ativo, iniciando em 0/N com botões
            &quot;Registrar Entrega&quot; ativos.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                1. carregarPortalMotorista (src/services/rota-despachos.ts):
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • Resolução mandatória de <code>resolvedCicloId</code> pelo despacho ou ciclo
                  ativo da chamada.
                </li>
                <li>
                  • Filtro estrito em <code>entrega_registros</code> por <code>ciclo_id</code> do
                  ciclo do despacho ou <code>despacho_id</code> ativo.
                </li>
                <li>
                  • Regra anti-vazamento: se há pedidos &quot;Em Rota&quot; e 0 entregas no ciclo
                  ativo, registros retorna array vazio.
                </li>
                <li>
                  • Despacho retornado contém <code>ciclo_id</code> e <code>chamada_id</code>{' '}
                  devidamente propagados.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                2. MotoristaPortal.tsx (src/pages/MotoristaPortal.tsx):
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • Função <code>isRegistroDoCicloAtivo</code> validando se cada entrega pertence ao
                  ciclo/despacho ativo.
                </li>
                <li>
                  • Contagem <code>contagemEntregas</code> (feitas/total) e mapa de trecho filtrados
                  estritamente pelo ciclo ativo.
                </li>
                <li>
                  • Paradas do ciclo sem entregas confirmadas exibem botão &quot;Registrar
                  Entrega&quot;, horários limpos e sem banner indevido.
                </li>
                <li>• Fila local offline validada contra o despacho atual do token.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.240: Correção de Vazamento de Ciclo no Dashboard e Clareza de Escolas */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.240
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.240: Isolamento por Ciclo no Dashboard (Widget de Entregas) e Distinção de
                Escolas com Pedidos vs. Entregas Concluídas
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.240)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Eliminação do vazamento de ciclo no Dashboard (<code>/</code>): correção da chamada a{' '}
            <code>getEntregaRegistrosDaRota</code> e{' '}
            <code>rotaDespachosService.getAtivoByRota</code> no{' '}
            <code>EntregasEmAndamentoWidget</code> para passar obrigatoriamente o{' '}
            <code>cicloId</code> resolvido da rota, aplicando a regra anti-vazamento da 0.0.239
            (pedidos Em Rota com zero entregas no ciclo mantêm progresso em 0 e badge &quot;Em
            Rota&quot;, nunca &quot;Rota concluída&quot;). No card de Ciclos Ativos do Dashboard,
            substituição do rótulo ambíguo &quot;Escolas Atendidas&quot; por{' '}
            <strong>&quot;Escolas com Pedidos&quot;</strong> e adição do indicador{' '}
            <strong>&quot;Entregas Concluídas: X de Y&quot;</strong> (onde X são escolas
            efetivamente entregues no ciclo), espelhando a clareza operacional de /monitoramento.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                1. EntregasEmAndamentoWidget.tsx (Dashboard):
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • Resolução estrita do ciclo da rota a partir do despacho ativo, ciclo ativo da
                  chamada da rota ou ciclo corrente.
                </li>
                <li>
                  • Chamada a{' '}
                  <code>
                    rotaDespachosService.getAtivoByRota(rota.id, cicloAlvo?.id, cicloDatas)
                  </code>{' '}
                  evitando captura de despachos legados de outros ciclos.
                </li>
                <li>
                  • Inclusão mandatória de <code>cicloIdRota</code> em{' '}
                  <code>getEntregaRegistrosDaRota(rota.id, cicloIdRota)</code>, eliminando o
                  vazamento dos registros de ciclos anteriores.
                </li>
                <li>
                  • Regra anti-vazamento: se há pedidos Em Rota e 0 entregas confirmadas no ciclo,{' '}
                  <code>entregasConfirmadasCount = 0</code> e <code>todasConcluidas = false</code>.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                2. Cards de Ciclos Ativos (src/pages/Index.tsx):
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • Nova métrica <code>entregasConcluidasCount</code> computando escolas com status
                  Entregue no ciclo.
                </li>
                <li>
                  • Exibição clara e separada de <strong>Escolas com Pedidos</strong> e{' '}
                  <strong>Entregas Concluídas: X de Y</strong>.
                </li>
                <li>
                  • Grade responsiva ampliada para 5 colunas (Pedidos, Escolas com Pedidos, Entregas
                  Concluídas, Volume Total, Valor Previsto).
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.239: Correção de Vazamento de Ciclo no Estado das Rotas */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.239
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.239: Isolamento Estrito do Estado das Rotas por Ciclo Selecionado &
                Anti-Vazamento
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.239)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Eliminação definitiva do vazamento de estado de despachos entre ciclos em{' '}
            <code>/rotas</code> e <code>/monitoramento</code>: garantia de gravação obrigatória de{' '}
            <code>ciclo_id</code> em <code>rota_despachos</code> e <code>despachos</code>, resolução
            temporal não destrutiva para registros legados sem ciclo_id (casamento por janela de
            datas início/fim), indexação de despachos ativos estritamente pelo ciclo selecionado e
            regra estrita de que ciclos com pedidos em rota e zero entregas confirmadas exibem badge
            &quot;Em Rota&quot; e nunca &quot;Rota Entregue&quot;.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                1. Serviços e Persistência de Despacho (rota-despachos.ts & AppContext):
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • <code>despacharOuRenovar</code> resolve ativamente o ciclo ativo da chamada caso{' '}
                  <code>cicloId</code> não seja informado, impedindo gravação com string vazia.
                </li>
                <li>
                  • <code>getAtivoByRota</code> busca primeiro por <code>ciclo_id</code> exato e, em
                  legados vazios, correlaciona estritamente pela janela temporal do ciclo (
                  <code>data_inicio</code> a <code>data_fim</code>).
                </li>
                <li>
                  • <code>despacharRotaInteira</code> e <code>confirmarEntregaRotaInteira</code>{' '}
                  gravam e desativam despachos estritamente no escopo do respectivo ciclo.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                2. Visualização e Travas (/rotas e /monitoramento):
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • <code>despachosAtivosMap</code> e <code>ultimoDespacho</code> em{' '}
                  <code>/rotas</code> indexados estritamente por <code>selectedCiclo.id</code> e
                  janela de datas do ciclo em tela.
                </li>
                <li>
                  • Badge e trava operacional corrigidos: se há pedidos Em Rota e zero entregas
                  confirmadas no ciclo, a rota permanece Em Rota (âmbar), sem bloqueio indevido por
                  conclusões de ciclos anteriores.
                </li>
                <li>
                  • Em <code>/monitoramento</code>, critérios de <code>isCicloEmRota</code> e{' '}
                  <code>isEntregasConcluidas</code> e alertas de entrega isolados por ciclo.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.238: Resolução do Contrato do Pedido por contrato_escolas no Hook ERP de Faturamento */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.238
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.238: Resolução do Contrato do Pedido por contrato_escolas no Hook ERP de
                Faturamento
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.238)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Ajuste na consulta SQL do endpoint REST de integração ERP / Power BI (
            <code>GET /backend/v1/erp/pedidos</code> em{' '}
            <code>pocketbase/hooks/erp_pedidos_api.js</code>
            ): substituição da dependência direta de <code>rotas.contrato_id</code> pela resolução
            canônica através da tabela <code>contrato_escolas</code>, casando a escola do pedido com
            o contrato correspondente da chamada do ciclo, viabilizando o preenchimento da coluna
            Contrato na matriz analítica (Chamada → Ciclo → Contrato → Escola) do Power BI.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                1. Junção Canônica via contrato_escolas:
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • Vínculo resolvido por subconsulta agregada agrupada por <code>escola_id</code> e{' '}
                  <code>chamada_id</code> com <code>MIN(contrato_id)</code> em vínculos não
                  encerrados.
                </li>
                <li>
                  • Casamento exato com <code>pedidos.escola_id</code> e{' '}
                  <code>ciclos.chamada_id</code>, refletindo que rotas atendem múltiplos contratos.
                </li>
                <li>
                  • <code>rotas.contrato_id</code> preservado estritamente como fallback secundário.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                2. Blindagem e Compatibilidade Power BI:
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • Blindagem integral com <code>COALESCE</code> preservada tanto para o ID quanto
                  para o número do contrato.
                </li>
                <li>
                  • Resposta JSON intacta: objeto <code>contrato</code> com <code>id</code> e{' '}
                  <code>numero</code>, ou <code>null</code> legítimo quando ausente.
                </li>
                <li>
                  • Contagem total da paginação, autenticação timing-safe, total canônico e filtros
                  mantidos 100% inalterados.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.237: Correção de Scan Error em Colunas Nullable no Hook ERP de Faturamento */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.237
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.237: Correção de Scan Error (NULL em contrato_id/rota_id) no Hook ERP de
                Faturamento e Mapeamento Null
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.237)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Eliminação do erro HTTP 500 em produção (
            <code>
              sql: Scan error on column index 25, name &quot;contrato_id&quot;: converting NULL to
              string is unsupported
            </code>
            ) no endpoint REST de faturamento/Power BI (<code>GET /backend/v1/erp/pedidos</code> em{' '}
            <code>pocketbase/hooks/erp_pedidos_api.js</code>): blindagem das queries SQL de pedidos,
            itens e chamada_itens com <code>COALESCE</code> em colunas nullable e devolução dos nós
            relacionais ausentes como <code>null</code> legítimo para compatibilidade com o Power BI
            / Power Query.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                1. COALESCE nas Consultas SQL & DynamicModel:
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • Envolvimento de todas as colunas de joins externos (<code>c.id</code> /{' '}
                  <code>contrato_id</code>, <code>r.id</code> / <code>rota_id</code>,{' '}
                  <code>ch.id</code> / <code>chamada_id</code>, <code>ci.id</code> /{' '}
                  <code>ciclo_id</code>, <code>e.id</code> / <code>escola_id</code> e atributos
                  cadastrais) com <code>COALESCE(coluna, &apos;&apos;)</code> para garantir que o
                  scanner Goja/PocketBase receba strings vazias em vez de NULL.
                </li>
                <li>
                  • Proteção idêntica com <code>COALESCE</code> aplicada na busca de{' '}
                  <code>pedido_itens</code> e <code>chamada_itens</code>, assegurando integridade
                  mesmo em registros parciais.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                2. Mapeamento Null Canônico & Contrato Power BI:
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • Mapeamento de <code>contrato</code>, <code>rota</code>, <code>chamada</code> e{' '}
                  <code>ciclo</code> como <code>null</code> no JSON final quando o ID respectivo
                  estiver ausente/vazio (ex.: <code>&quot;contrato&quot;: null</code>).
                </li>
                <li>
                  • Total compatibilidade com o conector Power BI / Power Query (M), evitando quebra
                  de schema em pedidos sem contrato vinculado.
                </li>
                <li>
                  • Preservação integral da autenticação por X-API-Key, total canônico consolidado,
                  paginação, filtros e regra de nome/aka.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.236: Correção de Execução DynamicModel no Hook ERP de Faturamento */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.236
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.236: Correção do Erro 500 no Hook ERP de Faturamento (Execução com DynamicModel)
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.236)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Correção de execução no hook do endpoint REST de integração com o ERP de faturamento (
            <code>GET /backend/v1/erp/pedidos</code> em{' '}
            <code>pocketbase/hooks/erp_pedidos_api.js</code>
            ): substituição de objetos JavaScript puros passados a <code>.one()</code> e{' '}
            <code>.all()</code>
            pelo padrão canônico do runtime PocketBase JSVM (<code>DynamicModel</code> e{' '}
            <code>arrayOf</code>), além de inclusão de logging detalhado no catch interno para
            rastreabilidade de diagnósticos no servidor.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                1. DynamicModel e arrayOf nas Consultas SQL:
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • A contagem total agora utiliza{' '}
                  <code>new DynamicModel(&#123; total: 0 &#125;)</code> em{' '}
                  <code>countQuery.one()</code>.
                </li>
                <li>
                  • A busca paginada de pedidos utiliza{' '}
                  <code>arrayOf(new DynamicModel(&#123; ... &#125;))</code> com todos os aliases de
                  colunas mapeados.
                </li>
                <li>
                  • As buscas de itens do pedido e de chamada_itens utilizam instâncias de{' '}
                  <code>arrayOf(new DynamicModel(&#123; ... &#125;))</code>.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                2. Rastreabilidade de Logs e Contrato Preservado:
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • No bloco <code>catch</code> interno, registro de erro com{' '}
                  <code>console.error</code> para visualização imediata nos logs de hooks do
                  backend.
                </li>
                <li>
                  • Resposta HTTP 500 mantida limpa e genérica para o cliente externo, sem vazar
                  stack traces ou detalhes internos.
                </li>
                <li>
                  • Contrato JSON de resposta, paginação, filtros e lógica de autenticação 100%
                  preservados.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.235: Melhorias no Endpoint ERP de Faturamento */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.235
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.235: Melhorias na API ERP de Faturamento (Total Canônico, Ciclo Exato e Filtro
                por Escola)
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.235)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Aplicação de 3 melhorias de integridade e segurança no endpoint REST de integração com o
            ERP de faturamento externo (<code>GET /backend/v1/erp/pedidos</code> em{' '}
            <code>pocketbase/hooks/erp_pedidos_api.js</code>):
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                1. Total Canônico & Blindagem contra Receita Dobrada:
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • O endpoint agora adota como valor principal de <code>total_consolidado</code> o
                  total canônico gravado no pedido (<code>p.total</code> /{' '}
                  <code>validacao.total</code> / subquery SQL consolidada), exatamente alinhado com
                  o Relatório Mensal e Dashboard.
                </li>
                <li>
                  • A soma por <code>quantidade × preco_unitario</code> é mantida estritamente como
                  fallback caso o total gravado não exista.
                </li>
                <li>
                  • Deduplicação estrita de itens por <code>item_id</code> para eliminar risco de
                  contagem duplicada por camadas de preço.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                2. Ciclo sem Curinga & 3. Filtro por Escola:
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • <strong>Filtro de ciclo seguro:</strong> casamento exato primeiro com remoção de
                  curingas SQL arbitrários (<code>%</code> e <code>_</code>), mantendo
                  compatibilidade canônica com <code>40/2026</code> (mapeado para{' '}
                  <em>Ciclo 40/2026</em>), <code>40</code> (prefixo vinculado seguro) e IDs diretos.
                </li>
                <li>
                  • <strong>Filtro por escola:</strong> suporte ao parâmetro{' '}
                  <code>?escola=&lt;id&gt;</code> para conciliação escola a escola pelo ERP.
                </li>
                <li>
                  • Validação sintática do ID da escola (retorna HTTP 400 se malformado); escola
                  inexistente retorna lista vazia legítima (HTTP 200) com paginação consistente.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.234: Gráficos de Comparação por Escolas, Chamadas e Contratos em KG e R$ */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.234
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.234: Gráficos Semelhantes no Histórico de Ciclos por Chamadas e Contratos (KG e
                R$)
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.234)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Evolução da aba <strong>Comparação de Consumo</strong> em <code>/historico</code>{' '}
            (Histórico de Ciclos), expandindo a visualização para além das escolas com suporte a
            dimensões estratégicas de Chamadas e Contratos, apresentando gráficos de linha de volume
            físico (KG/unidade) e valor financeiro canônico (R$):
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                Três Dimensões de Análise & Janela Temporal:
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • Seletor de dimensão com 3 modos de comparação: <strong>Escolas</strong> (modo
                  clássico preservado), <strong>Chamadas</strong> (ex.: 01/2025, 07/2025) e{' '}
                  <strong>Contratos</strong> (ex.: C-2026-02-xx).
                </li>
                <li>
                  • Janela de análise configurável em Últimos 4, 8 ou 12 ciclos com ordenação
                  cronológica no eixo horizontal.
                </li>
                <li>
                  • Seleção individualizada por checkbox e botões de conveniência &quot;Todos&quot;
                  e &quot;Limpar&quot; com busca reativa.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                Dois Gráficos Sincronizados (Volume & Faturamento):
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • <strong>Gráfico 1 (KG/Unidade):</strong> soma as quantidades dos itens do
                  produto selecionado nos pedidos dos ciclos para cada série da dimensão.
                </li>
                <li>
                  • <strong>Gráfico 2 (R$):</strong> extrai estritamente o valor canônico{' '}
                  <code>order.total</code> dos pedidos correspondentes, sem recálculos por camadas
                  de preço.
                </li>
                <li>
                  • Identificação das escolas estritamente por ID no banco (sem matching por nome),
                  preservando a integridade das entidades homônimas.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.233: Chave ERP via config_sistema e Fallback Seguro */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.233
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.233: Chave de API ERP via config_sistema e Resolução Híbrida Segura
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.233)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Habilitação do endpoint REST de leitura de pedidos para ERP (
            <code>/backend/v1/erp/pedidos</code>) através de coleção interna de configurações (
            <code>config_sistema</code>), sem expor a chave em nenhuma tela do app e mantendo a
            precedência das variáveis de ambiente:
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                Coleção Interna config_sistema (Migration 0141):
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • Coleção criada com campos <code>chave</code> (único) e <code>valor</code>{' '}
                  (texto), com todas as regras de acesso nulas (lock down total na REST API para
                  usuários do app).
                </li>
                <li>
                  • Registro <code>ERP_API_KEY</code> populado de forma idempotente, sem qualquer
                  exposição em telas, diálogos ou tabelas do SIGCAF.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                Resolução Híbrida & Mitigação Timing:
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • Precedência estrita: 1º <code>process.env.ERP_API_KEY</code> (variável de
                  ambiente); 2º busca em <code>config_sistema</code> com cache em memória (60s) para
                  alta performance.
                </li>
                <li>
                  • Validação com comparação em tempo constante (timing-safe) para proteção contra
                  timing attacks e manutenção estrita dos retornos HTTP 401/400/500 e do payload
                  intacto.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.231: Sugestão de Coordenadas Geográficas pelo Motorista */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.231
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.231: Sugestão de Coordenadas GPS pelo Motorista & Fila de Revisão em /escolas e
                /rotas
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.231)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Captura automática e transparente da coordenada GPS pelo celular do motorista no momento
            da confirmação da entrega no Portal do Motorista, direcionada para a fila de revisão
            humana da cooperativa na coleção <code>coordenada_sugestoes</code>.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">Captura & Deduplicação em Campo:</span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • No Portal do Motorista (<code>/motorista</code>), ao confirmar a entrega, a
                  geolocalização é capturada com alta precisão e gravada como sugestão pendente (sem
                  alterar a escola diretamente).
                </li>
                <li>
                  • Tolerância inteligente de 50 metros: se a escola já possui coordenada a menos de
                  50m ou se já existe sugestão pendente recente próxima (&lt; 50m), o sistema
                  deduplica silenciosamente para não poluir a fila.
                </li>
                <li>
                  • Metadados completos preservados: precisão métrica, motorista autor, ciclo,
                  chamada, rota e despacho.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                Fila de Revisão Humana (/escolas e /rotas):
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • Botão e diálogo modal &quot;Revisar Coordenadas&quot; com badge contador de
                  pendências em tempo real.
                </li>
                <li>
                  • Comparativo lado a lado: coordenada atual da escola vs. coordenada sugerida
                  capturada, com distância Haversine em metros/km.
                </li>
                <li>• Link direto para inspeção no Google Maps em nova aba.</li>
                <li>
                  • Ações de &quot;Aprovar&quot; (aplica no cadastro mestre da escola) e
                  &quot;Recusar&quot; (com justificativa opcional).
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.230: Bloqueio de Edição em Rotas Fechadas e Retenção por Ciclo */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.230
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.230: Bloqueio de Edição em Rotas de Ciclo Fechado/Entregue & Isolamento da
                Sequência por Ciclo
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.230)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Travamento estrito de modificações operacionais em rotas concluídas ou de ciclos em
            estado terminal (fechado/cancelado) e congelamento da ordem de paradas por ciclo via
            snapshots em <code>rota_snapshots</code>.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">Travas Operacionais de Segurança:</span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • Drag-and-drop de paradas estritamente desabilitado quando a rota estiver
                  entregue ou ciclo fechado/cancelado.
                </li>
                <li>
                  • Ações de importação, otimização automática, exclusão e renomeação de rota
                  desabilitadas.
                </li>
                <li>• Consulta, histórico e visualização em mapa permanecem 100% liberados.</li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">Isolamento de Sequência de Paradas:</span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • Reordenação manual grava snapshot de edição associado exclusivamente ao{' '}
                  <code>ciclo_id</code> selecionado.
                </li>
                <li>• Histórico imutável de ciclos passados preservado com precisão.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.228: Exibição Condicional do Botão Despachar Rota por Fase do Ciclo */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.228
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.228: Exibição do Botão &quot;Despachar Rota&quot; Apenas em Fases Elegíveis em
                /rotas
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.228)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Em <code>/rotas</code>, o botão <strong>Despachar Rota</strong> só aparece quando a fase
            do ciclo selecionado permite despacho; durante a coleta de pedidos o botão não é
            exibido.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">Regra de Exibição por Fase do Ciclo:</span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • Durante a coleta de pedidos (<code>coletando</code>), o botão &quot;Despachar
                  Rota&quot; é totalmente omitido do card da rota — nem habilitado, nem
                  desabilitado, sem ocupar espaço com controles indevidos.
                </li>
                <li>
                  • O botão só passa a ser renderizado quando a fase do ciclo selecionado for
                  elegível para despacho (<code>coleta_encerrada</code> ou <code>coletado</code>) e
                  a rota ainda não tiver sido despachada.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">Preservação dos Comportamentos:</span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • Mantido o botão &quot;Em Rota&quot; / &quot;Reenviar Link Motorista&quot; e
                  &quot;Rota Entregue&quot; quando há despacho ativo.
                </li>
                <li>
                  • Preservado o badge verde &quot;Rota Entregue · Concluída&quot; para rotas
                  finalizadas.
                </li>
                <li>
                  • Mantidos o carimbo &quot;Entregue às HH:MM · Conferido por&quot;, o isolamento
                  estrito por <code>ciclo_id</code> (0.0.226), a leitura de recibos permanente
                  (0.0.227) e o duplo seletor chamada+ciclo (0.0.225).
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.227: Leitura de Comprovantes Permanentes em /rotas */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.227
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.227: Leitura Unificada de Recibos em /rotas (entrega_registros e
                entrega_comprovantes da secretária)
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.227)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Correção no módulo de Rotas de Entrega (<code>/rotas</code>): quando as entregas de um
            ciclo são fechadas pela secretária através do botão em lote &quot;Rota Entregue&quot;, a
            retenção histórica permanente é gravada na coleção <code>entrega_comprovantes</code>{' '}
            (com <code>origem = &apos;fechamento_secretaria&apos;</code>). O componente agora
            consulta de forma unificada tanto <code>entrega_registros</code> quanto{' '}
            <code>entrega_comprovantes</code> estritamente isolados pelo ciclo selecionado,
            garantindo a visualização dos recibos e horários de confirmação das paradas.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                Leitura & Exibição Unificada nas Paradas:
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • O selo verde <code>Entregue HH:MM</code> e o status de parada entregue aparecem
                  se houver confirmação em qualquer das duas fontes do ciclo selecionado.
                </li>
                <li>
                  • O mapa interativo (<code>RouteMapView</code>) recebe os horários e paradas
                  entregues consolidados de ambas as coleções.
                </li>
                <li>
                  • Mantido 100% o isolamento por ciclo: nenhum registro de outro ciclo é misturado.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                Modal &quot;Dados da Entrega&quot; e Origem:
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • Suporte a dados originados pelo fechamento da secretária com badge informativo
                  &quot;Fechamento pela secretária&quot;.
                </li>
                <li>
                  • Exibição fiel dos horários, observação, responsável e dados disponíveis sem
                  inventar motoristas não cadastrados.
                </li>
                <li>
                  • O carimbo &quot;Conferido por&quot; preserva estritamente a fonte do pedido /
                  usuário logado (0.0.210).
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.226: Isolamento de Entregas por Ciclo */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.226
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.226: Isolamento Estrito de Entregas e Despachos por Ciclo em /rotas
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.226)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Isolamento hermético das entregas e despachos na tela <code>/rotas</code> para que o
            estado das rotas reflita unicamente o ciclo ativo ou selecionado no cabeçalho:
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">Regras de Filtragem por Ciclo:</span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • Consultas a despachos e registros de entrega utilizam o <code>ciclo_id</code> em
                  foco como filtro obrigatório na API.
                </li>
                <li>
                  • Histórico imutável: ciclos concluídos mantêm seus selos de entrega e caminhão
                  congelados no estado do seu ciclo sem sofrer interferência de novos ciclos
                  abertos.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">Preservação Operacional:</span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • Respeita a regra do Ciclo Corrente (definido pela seta &quot;Monitorar&quot; ou
                  ciclo ativo).
                </li>
                <li>
                  • Integração com o seletor Chamada + Ciclo sem recarregar desnecessariamente dados
                  globais.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Release v0.0.225: Filtro Chamada + Ciclo em /rotas */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.225
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.225: Filtro Unificado Chamada + Ciclo em /rotas (Alinhamento com /monitoramento)
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.225)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Padronização da barra de seleção superior de <code>/rotas</code> para oferecer a mesma
            experiência de navegação de <code>/monitoramento</code>:
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">Seletores Integrados:</span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • Seletor primário de Chamada (Municipal vs Estadual) seguido pelo seletor de
                  Ciclos da chamada.
                </li>
                <li>
                  • Suporte a sincronização bidirecional com parâmetros de URL (
                  <code>?chamadaId=</code> e <code>?cicloId=</code>).
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">Precedência do Ciclo Corrente:</span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • Abertura pré-selecionada no Ciclo Corrente persistido no banco quando pertencer
                  à chamada.
                </li>
                <li>
                  • Fallback inteligente para o ciclo ativo da chamada ou o ciclo mais recente.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Retenção Histórica de Dados de Entrega por Ciclo (v0.0.221) */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.221
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.221: Ganchos de Retenção Histórica por Ciclo (Despacho, Portal do Motorista e
                Fechamento)
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.221)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Implementação dos ganchos automatizados, idempotentes e não-bloqueantes de retenção
            histórica permanente nas coleções <code>rota_snapshots</code> e{' '}
            <code>entrega_comprovantes</code> (criadas pela migration 0139):
          </p>
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                1. Gancho no Despacho (Central & Link):
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • Ao despachar a rota (em <code>/rotas</code> ou geração de link do motorista),
                  grava snapshot em <code>rota_snapshots</code> com{' '}
                  <code>versao_evento = &apos;despacho&apos;</code>.
                </li>
                <li>
                  • Registra a composição completa e sequência exata das paradas naquele instante,
                  com <code>ciclo_id</code> e <code>chamada_id</code> do ciclo em foco.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                2. Gancho na Entrega (Portal do Motorista):
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • Quando o motorista confirma a entrega no portal público (com assinatura, foto,
                  chegada e confirmação), grava em <code>entrega_registros</code> e sincroniza
                  imediatamente o comprovante permanente em <code>entrega_comprovantes</code>.
                </li>
                <li>
                  • Armazena ciclo_id, chamada_id, motorista_id, client_uid (sincronização offline),
                  foto e assinatura em resolução permanente.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                3. Gancho no Fechamento &quot;Rota Entregue&quot;:
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • Ao acionar &quot;Rota Entregue&quot; pela secretária/central, grava snapshot com{' '}
                  <code>versao_evento = &apos;fechamento&apos;</code> e cria/atualiza os{' '}
                  <code>entrega_comprovantes</code> em lote.
                </li>
                <li>
                  • Carimbo com identificação do usuário logado e horário do ato; operação 100%
                  tolerante a falhas (best-effort silencioso) sem travar nem fazer rollback do fluxo
                  principal.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* API REST Somente Leitura para ERP de Faturamento (v0.0.219) */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.219
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.219: API REST Somente Leitura para Leitura de Pedidos pelo ERP de Faturamento
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.219)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Disponibilização do endpoint REST HTTP seguro e exclusivamente para leitura{' '}
            <code>GET /backend/v1/erp/pedidos</code> para que o sistema de ERP da cooperativa
            importe os pedidos realizados no SIGCAF e alimente o faturamento institucional:
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">Segurança & Autenticação da API:</span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • <strong>Método HTTP GET Somente Leitura:</strong> Nenhuma operação de escrita,
                  atualização ou exclusão é admitida pelo endpoint.
                </li>
                <li>
                  • <strong>Header de Autenticação:</strong> Validação da chave enviada no cabeçalho{' '}
                  <code>X-API-Key</code> (ou <code>Authorization: Bearer &lt;chave&gt;</code>).
                </li>
                <li>
                  • <strong>Chave de Autenticação Segura:</strong> A chave é validada com
                  precedência contra <code>ERP_API_KEY</code> no ambiente do servidor ou,
                  alternativamente, contra o registro interno <code>ERP_API_KEY</code> na coleção
                  segura <code>config_sistema</code> (inacessível via API REST do app e nunca
                  exibida em telas). Chave inválida ou ausente retorna HTTP 401.
                </li>
                <li>
                  • <strong>Tratamento de Erros:</strong> Mensagens limpas em formato JSON (401, 400
                  e 500) sem vazamento de detalhes internos da infraestrutura.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">Dados Fornecidos ao Faturamento:</span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • <strong>Escola:</strong> ID do banco + nome cadastral oficial, código INEP,
                  tipo, dependência administrativa e endereço (sem matching por nome).
                </li>
                <li>
                  • <strong>Chamada, Ciclo & Contrato:</strong> Números/ano da chamada, ciclo e
                  contrato do vínculo correspondente.
                </li>
                <li>
                  • <strong>Itens com Nome no Contrato & AKA:</strong> Nome antes da vírgula do Nome
                  no Contrato, campo separado <code>aka</code> para reconciliação do ERP,
                  quantidade, unidade, preço unitário e total do item.
                </li>
                <li>
                  • <strong>Total Canônico & Filtros:</strong> Total consolidado canônico por
                  pedido, filtros via query string (<code>chamada</code>, <code>ciclo</code>,{' '}
                  <code>status</code>, <code>data_inicio</code>, <code>data_fim</code>) e paginação
                  estruturada com <code>total_items</code>.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Padronização de Identidade Visual com Emojis Temáticos Coloridos (v0.0.215) */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.215
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.215: Emojis temáticos coloridos no menu de navegação, ações rápidas e
                monitoramento
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.215)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Adoção da identidade visual com emojis temáticos coloridos Unicode no menu de navegação
            lateral, menu suspenso do perfil, ações rápidas do Dashboard e painéis de monitoramento:
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">Navegação e Menus (Layout.tsx):</span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • Dashboard 📊, Produtos 🌱, Escolas 🏫, Chamadas 🌾, Contratos 📄, Pedidos 📋
                </li>
                <li>
                  • Monitoramento 📡, Histórico de Ciclos 🔄, Importação Excel 📥, Comunicação
                  WhatsApp 💬
                </li>
                <li>
                  • Consolidação 🧺, Rotas de Entrega 🛣️, Atestos 📜, Relatórios 📈, Meu Perfil 👤,
                  Usuários 👥, Configurações ⚙️, Documento de Requisitos 📚
                </li>
                <li>
                  • Menu do usuário: 👤 Meu Perfil, 🔑 Alterar Senha, 👥 Gestão de Usuários, ⚙️
                  Configurações, 🚪 Sair
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">Dashboard e Monitoramento:</span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • Dashboard (Index.tsx): Ações Rápidas (📋 Novo Pedido, 📜 Emitir Atesto, 📅
                  Relatório Mensal) e feed de atividades temático
                </li>
                <li>
                  • Monitoramento: Fases (Fase 1 Coletando 📝, Fase 2 Correção 🔍, Fase 3 Em
                  Rota/Coleta Encerrada 🚚, Fase 4 Fechado 🔒)
                </li>
                <li>
                  • Alertas e Atestos: card de Atestos Confirmados 📜, alerta rota parada ⚠️ e
                  paradas pendentes 📍
                </li>
                <li>
                  • Preservadas integralmente todas as regras de Ciclo Corrente, Bloco B (alerta de
                  30 min e áudio) e fechamento de rota
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Alinhamento da Receita Entregue do Mês ao Valor Canônico e Deduplicação (v0.0.214) */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.214
              </Badge>
              <span className="font-semibold text-foreground">
                0.0.214: Receita Entregue no Mês do Dashboard alinhada ao valor canônico
                (order.total) com deduplicação de pedidos
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.214)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Alinhamento do indicador <em>Receita Entregue no Mês</em> do Dashboard (<code>/</code>)
            ao modelo canônico consolidado de faturamento utilizado em Relatórios (
            <code>Reports.tsx</code>) e no Fechamento Mensal (<code>MonthlyReportButton.tsx</code>):
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">Correções no Dashboard (Index.tsx):</span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • Leitura direta de <code>order.total</code> (já consolidado a partir de{' '}
                  <code>pedido_itens</code> no carregamento do contexto), eliminando re-cálculo
                  divergente que re-consultava mapas de contratos/fallback e duplicava valores.
                </li>
                <li>
                  • Fallback resiliente: caso <code>order.total</code> não esteja disponível ou seja
                  0, utiliza a soma dos próprios itens do pedido (<code>quantity * price</code>) sem
                  re-consultar contratos.
                </li>
                <li>
                  • Deduplicação de pedidos por ID (<code>seenOrderIds</code>) no loop mensal,
                  prevenindo acúmulo duplo de instâncias do mesmo pedido.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">Prevenção no Contexto Realtime:</span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • Subscrições realtime de <code>pedidos</code> e <code>entrega_registros</code>{' '}
                  higienizadas para substituir registros por ID e descartar IDs temporários
                  otimistas (<code>temp-</code>) quando o registro persistido equivalente é
                  recebido.
                </li>
                <li>
                  • Preservados integralmente: Ciclo Corrente, Bloco B (alerta de rota parada 30 min
                  e aviso sonoro com mudo), badge &quot;Entregas Concluídas&quot;, card de Atestos
                  Confirmados e correções conclusivas da Rota C (v0.0.213).
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Regularização de Despachos Residuais e Encerramento Conclusivo (v0.0.213) */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.213
              </Badge>
              <span className="font-semibold text-foreground">
                Regularização de Despachos Ativos Residuais & Encerramento Conclusivo de Rota
                (/rotas e Dashboard)
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.213)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Correção e resiliência ponta a ponta para casos em que todos os pedidos de uma rota já
            foram entregues, mas um registro em <code>rota_despachos</code> permaneceu com{' '}
            <code>ativo: true</code>:
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">Correções Aplicadas:</span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • <strong>Migration 0137:</strong> encerrou registros de{' '}
                  <code>rota_despachos</code> com <code>ativo: true</code> cujas rotas já tinham
                  100% dos pedidos entregues (ex.: Rota C no ciclo 40/2026).
                </li>
                <li>
                  • <strong>Resiliência em /rotas:</strong> quando todos os pedidos estão entregues,
                  a rota assume com precedência o estado conclusivo &quot;Rota Entregue&quot; (badge
                  verde e card conclusivo, sem botão travado).
                </li>
                <li>
                  • <strong>Encerramento residual no Contexto:</strong> o acionamento de &quot;Rota
                  Entregue&quot; não aborta se não houver pedidos &quot;Em Rota&quot;, prosseguindo
                  para encerrar qualquer despacho ativo remanescente no banco.
                </li>
                <li>
                  • <strong>Widget no Dashboard:</strong> rotas com todos os pedidos entregues não
                  são listadas como entregas em andamento.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">Preservação Integral:</span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • Preservados integralmente: ciclo de vida de fases do monitoramento (v0.0.212),
                  badge &quot;Entregas Concluídas&quot;, card de Atestos Confirmados, regras do
                  Ciclo Corrente e alertas sonoros do Bloco B.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Botão Colocar em Rota Oculto com Entregas Concluídas (v0.0.212) */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.212
              </Badge>
              <span className="font-semibold text-foreground">
                Ocultação do Botão &quot;Colocar em Rota&quot; da Fase 3 com Entregas Concluídas
                (/monitoramento)
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.212)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Correção no ciclo de vida do botão da Fase 3 (Coleta Encerrada) em{' '}
            <code>/monitoramento</code>: quando as entregas do ciclo selecionado já foram concluídas
            (todos os pedidos entregues, nenhum em rota e nenhum despacho em trânsito), o botão
            &quot;Colocar em Rota&quot; deixa de existir no cartão, eliminando o reaparecimento
            indevido após a confirmação de rota entregue e mantendo em destaque o badge verde{' '}
            <code>Entregas Concluídas</code>.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">Ciclo de Vida do Botão:</span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • <strong>Disponível:</strong> Coleta encerrada, sem despacho em andamento e
                  entregas ainda não concluídas → botão habilitado &quot;Colocar em Rota&quot;.
                </li>
                <li>
                  • <strong>Em Rota:</strong> Despacho ou pedidos em trânsito → botão desabilitado
                  como &quot;Em Rota&quot;.
                </li>
                <li>
                  • <strong>Oculto:</strong> Entregas concluídas (<code>isEntregasConcluidas</code>)
                  → botão não é renderizado; permanece o badge verde &quot;Entregas
                  Concluídas&quot;.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">Preservação Integral:</span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • Mantidos intactos: badge &quot;Entregas Concluídas&quot;, card de Atestos
                  Confirmados (X de N), alertas em tempo real do Bloco B, regra do Ciclo Corrente e
                  ouvintes realtime.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Badge Entregas Concluídas e Atestos Confirmados em Monitoramento (v0.0.211) */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.211
              </Badge>
              <span className="font-semibold text-foreground">
                Badge &quot;Entregas Concluídas&quot; na Fase 3 & Acompanhamento de Atestos
                Confirmados (/monitoramento)
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.211)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Aprimoramento do painel de <code>/monitoramento</code> com foco em clareza operacional
            pré-fechamento do ciclo:
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                Badge &quot;Entregas Concluídas&quot; no Cartão de Fase:
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • No cartão da Fase 3 (Coleta Encerrada), quando o ciclo monitorado estiver com
                  entregas concluídas (despacho encerrado, pedidos com status &quot;Entregue&quot; e
                  nenhum pedido &quot;Em Rota&quot;), é exibido o badge verde:{' '}
                  <code>Entregas Concluídas</code>.
                </li>
                <li>
                  • Decisão do usuário: terminologia objetiva &quot;Entregas Concluídas&quot; — sem
                  o termo &quot;pronto para fechar&quot; (rejeitado por subjetividade) e sem
                  contadores redundantes no cartão.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                Card de Atestos Confirmados (Tempo Real):
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • Seção discreta no painel de monitoramento apresentando o progresso{' '}
                  <code>Atestos Confirmados: X de N</code> calculado sobre os pedidos entregues do
                  ciclo selecionado e os atestos com status &quot;Confirmado&quot;.
                </li>
                <li>
                  • Quando X &lt; N, exibe aviso <em>&quot;faltam N−X atesto(s)&quot;</em>; quando X
                  = N e N &gt; 0, exibe o destaque verde{' '}
                  <em>&quot;Todos os atestos confirmados&quot;</em> com link direto para{' '}
                  <code>/atestos</code>.
                </li>
                <li>
                  • Atualização reativa em tempo real através do contexto global (coleção{' '}
                  <code>atestos</code>), visível enquanto o ciclo não é fechado (atesto com status
                  &quot;Confirmado&quot; é evento monitorado antes de fechar o ciclo).
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Registro do Conferente do Fechamento em Rotas e Detalhes (v0.0.210) */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.210
              </Badge>
              <span className="font-semibold text-foreground">
                Identificação do Conferente no Fechamento de Entregas (/rotas & Modal Dados da
                Entrega)
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.210)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Pedidos &quot;Entregue&quot; em <code>/rotas</code> (tanto na listagem de pedidos da
            parada quanto no modal compartilhado Dados da Entrega) exibem explicitamente
            &quot;Entregue às HH:MM · Conferido por: [usuário logado que realizou o
            fechamento]&quot;. Quando não houver conferente registrado, é exibido apenas o horário
            sem separador órfão. O motorista nunca é exibido como responsável pelo fechamento
            operacional.
          </p>
        </div>

        {/* Estado "Rota Entregue" para Rotas Concluídas (v0.0.209) */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.209
              </Badge>
              <span className="font-semibold text-foreground">
                Estado &quot;Rota Entregue&quot; para Rotas Concluídas (/rotas)
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.209)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Em <code>/rotas</code>, a rota com 100% das entregas realizadas exibe estado conclusivo
            &quot;Rota Entregue&quot; (badge verde, bloco informativo de conclusão e sem botão de
            despacho).
          </p>
        </div>

        {/* Modo Automático do Caminhão & Deduplicação de Entregas (v0.0.199) */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.199
              </Badge>
              <span className="font-semibold text-foreground">
                Acompanhamento Automático do Caminhão & Deduplicação por Rota+Escola (/rotas)
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.199)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Evolução do acompanhamento logístico em <code>/rotas</code>:
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">Modo Automático vs Manual:</span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • Quando a rota está <strong>Em Rota</strong> com pelo menos uma entrega
                  confirmada vinda do portal, o painel âmbar de pino manual e os botões manuais de
                  &quot;Marcar&quot; são ocultados, exibindo aviso discreto de acompanhamento
                  automático em tempo real.
                </li>
                <li>
                  • O caminhão posiciona-se automaticamente na última escola entregue na sequência
                  de paradas.
                </li>
                <li>
                  • Se a rota for despachada sem nenhuma confirmação (exceção por WhatsApp), o modo
                  manual permanece 100% visível e funcional.
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">
                Deduplicação e Transição em Tempo Real:
              </span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • Deduplicação de <code>entrega_registros</code> por rota+escola mantendo o
                  registro com maior <code>confirmado_em</code> (desempate por <code>created</code>
                  ).
                </li>
                <li>
                  • Protege contra duplicidades causadas por múltiplos acessos ou reconexões de rede
                  no Portal do Motorista.
                </li>
                <li>
                  • Transição imediata e transparente via eventos realtime sem recarregar a tela.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Ciclo Operacional Corrente (v0.0.198) */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.198
              </Badge>
              <span className="font-semibold text-foreground">
                Regra do Ciclo Operacional Corrente (Contexto Global, Monitoramento, Pedidos e
                Rotas)
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.198)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Implementação da regra do <strong>Ciclo Operacional Corrente</strong> para manter o
            ciclo de trabalho sincronizado entre as principais telas do sistema sem navegação
            redundante:
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">Conceito e Persistência:</span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • Estado persistido em localStorage (<code>sigcaf_ciclo_corrente</code>) com{' '}
                  <code>cicloId</code> e <code>chamadaId</code>
                </li>
                <li>
                  • Exposto via <code>useApp()</code> com <code>setCicloCorrente</code> e{' '}
                  <code>limparCicloCorrente</code>
                </li>
                <li>
                  • Seta &quot;Monitorar&quot; no Dashboard define o ciclo corrente ao navegar
                </li>
                <li>
                  • Link do cabeçalho &quot;Painel de Monitoramento&quot; direciona para o ciclo
                  corrente
                </li>
                <li>• Troca no seletor de página é consulta local e NÃO altera o corrente</li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">Precedência e Telas Afetadas:</span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • <strong>Ordem de precedência:</strong> (1) Query params URL &gt; (2)
                  cicloCorrente &gt; (3) Fallback padrão
                </li>
                <li>
                  • <code>/monitoramento</code>: abre no corrente ou query params
                </li>
                <li>
                  • <code>/pedidos</code>: pré-seleciona o corrente no diálogo Novo Pedido (se
                  aberto em coletando/correcao)
                </li>
                <li>
                  • <code>/rotas</code>: pré-seleciona a chamada do corrente ou query params
                </li>
                <li>
                  • <code>/historico-ciclos</code>: preservado integralmente sem alteração
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bloco B — Alertas da Fase de Entrega em Monitoramento (v0.0.204) */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.204
              </Badge>
              <span className="font-semibold text-foreground">
                Bloco B — Alertas da Fase de Entrega em Monitoramento & Aviso Sonoro Realtime
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Executado (v0.0.204)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Implementação completa do Bloco B do plano de melhorias em <code>/monitoramento</code>:
            seção de alertas em tempo real ativada quando o ciclo monitorado possui rotas
            despachadas com status &quot;Em Rota&quot;. Fornece detecção imediata de atrasos
            operacionais no campo, visibilidade ordenada das paradas restantes e conformidade de
            assinaturas escolares, além de retorno sonoro para a central.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-amber-600 dark:text-amber-400">
                Alertas Operacionais de Entrega:
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • <strong>Rota parada (30 min):</strong> alerta crítico acionado quando o
                  motorista está sem sincronizar há mais de 30 minutos (base: última entrega
                  confirmada deduplicada ou horário de despacho)
                </li>
                <li>
                  • <strong>Paradas pendentes:</strong> relação ordenada de escolas a entregar com
                  contador &quot;faltam X de N&quot; (casamento estrito por ID do banco)
                </li>
                <li>
                  • <strong>Entrega sem assinatura:</strong> detecção de entregas confirmadas sem
                  assinatura, com clique abrindo o modal compartilhado &quot;Dados da Entrega&quot;
                </li>
                <li>
                  • Atualização automática reativa via eventos SSE da coleção{' '}
                  <code>entrega_registros</code> e recálculo de tempos a cada 30 segundos
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">Aviso Sonoro & Integração Central:</span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • <strong>Aviso sonoro realtime:</strong> Web Audio API sintetiza bip duplo suave
                  a cada nova entrega confirmada recebida na central
                </li>
                <li>
                  • <strong>Botão de MUTE integrado:</strong> alternador sonoro visível na seção com
                  estado persistido no <code>localStorage</code>
                </li>
                <li>
                  • <strong>Proteção contra falso alarme:</strong> não toca na carga inicial e
                  ignora duplicatas pelo identificador do registro / client_uid
                </li>
                <li>
                  • Coexistência perfeita com os alertas de coleta existentes (sem polling
                  redundante no banco)
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Portal do Motorista, Tempo Real e Google Maps (v0.0.194) */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.194
              </Badge>
              <span className="font-semibold text-foreground">
                Portal do Motorista, Acompanhamento em Tempo Real, Google Maps & Gestão Logística
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Consolidado (v0.0.194)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Consolidação completa da logística de ponta a ponta no SIGCAF: módulo centralizado de{' '}
            <strong>Cadastro de Motoristas</strong> em <code>/rotas</code>, fluxo de despacho em
            dois estágios com trava de fase da coleta, <strong>Portal do Motorista</strong> móvel em{' '}
            <code>/motorista?token=...</code> com funcionamento 100% offline, rota no Google Maps
            com origem e destino, coleta de assinatura e foto compactada, acompanhamento em tempo
            real na central com caminhão dinâmico e modal somente leitura de dados de entrega, e
            widget executivo no Dashboard.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-primary">Portal do Motorista & Campo:</span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>• Acesso por link único seguro sem login com selo de versão SIGCAF</li>
                <li>• Roteiro ordenado com progresso X de N e atalhos por parada</li>
                <li>• Mapa do trecho ativo com botão de rota no Google Maps (origem e destino)</li>
                <li>• Coleta de horários automáticos, assinatura digital e foto compactada</li>
                <li>
                  • Operação offline com fila local e sincronização automática mantendo horários
                  reais
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">Central & Acompanhamento:</span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>• Cadastro de motoristas reutilizável para toda a cooperativa</li>
                <li>• Trava de despacho pós-encerramento de coleta e vínculo na rota</li>
                <li>• Realtime central: caminhão avançando e etiqueta ✓ Entregue HH:mm</li>
                <li>• Modal de dados da entrega com assinatura e foto em tela cheia</li>
                <li>• Widget &quot;Entregas em Andamento&quot; no Dashboard com próxima parada</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Correção do Colar Produtos e Validação Salvar Pedido (v0.0.153) */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.153
              </Badge>
              <span className="font-semibold text-foreground">
                Colar Produtos na Lista & Validação Ativa do &quot;Salvar Pedido&quot; (/pedidos)
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Executado (v0.0.153)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Correção pontual na tela de Pedidos (<code>Orders.tsx</code>): a colagem passa a ter
            identidade e rótulo &quot;Colar Produtos&quot;, servindo exclusivamente para popular a
            lista de itens do pedido em criação (com fusão somada de duplicados), sem fechar o
            diálogo de Novo Pedido nem gravar nada. O botão &quot;Salvar Pedido&quot; permanece
            sempre habilitado e realiza validação ativa no clique, exibindo mensagens claras caso
            falte ciclo operacional, escola ou itens válidos, prevenindo bloqueio silencioso da
            gravação.
          </p>
        </div>

        {/* Correção do Cálculo e Exibição de Datas de Despacho por Regra da Chamada (v0.0.147) */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.147
              </Badge>
              <span className="font-semibold text-foreground">
                Correção de Cálculo e Exibição de Datas de Ciclo por Chamada (Migration 0115)
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Executado (v0.0.147)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Correção abrangente no cálculo de datas de ciclos a partir da regra de dias da Chamada
            Pública (<code>chamadas.dia_despacho_ciclo</code>), na exibição de despacho nas telas
            operacionais (Monitoramento, Histórico de Ciclos, Consolidação e Importação) e nos dados
            gravados. Anteriormente, funções de exibição (<code>formatDespachoAmigavel</code>) e
            sugestão de ciclo forçavam o texto literal &quot;Segunda-feira&quot;, desconsiderando
            chamadas cujo despacho/entrega está configurado para outro dia da semana (ex.: Chamada
            07/2025 Estadual, cujo despacho ocorre na terça-feira).
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-destructive">Causas Raízes Eliminadas:</span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  • Rótulo fixo &quot;Segunda-feira&quot; / &quot;Seg&quot; em
                  formatDespachoAmigavel sem inspecionar a data real
                </li>
                <li>
                  • Fallback de getDespachoEfetivoCiclo ignorando regraDiasChamada no cálculo de
                  dataInicio
                </li>
                <li>
                  • Troca de chamada no diálogo de criação sem recalcular a sugestão de semana/datas
                </li>
                <li>
                  • Ciclo 40/2026 gravado com despacho na segunda 05/10/2026 em vez de terça
                  06/10/2026
                </li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">Correções Implementadas:</span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • Formatação sensível ao dia da semana real (Terça-feira 06/10/2026 para a Chamada
                  07/2025)
                </li>
                <li>• Sincronia perfeita entre prévia e gravação do AbrirCicloDialog</li>
                <li>
                  • Migração 0115 atualizando o Ciclo 40/2026 para despacho e fim em 06/10/2026
                  (terça)
                </li>
                <li>
                  • Cobertura de testes unitários em Vitest validando regras de dias e formatação
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Reestruturação do Diálogo Novo Pedido Orientado a Ciclo (v0.0.143) */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Release v0.0.143
              </Badge>
              <span className="font-semibold text-foreground">
                Reestruturação do Diálogo &quot;Novo Pedido&quot; Orientado a Ciclo
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Executado (v0.0.143)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Reengenharia completa do fluxo de criação de pedidos manuais/WhatsApp em{' '}
            <code>src/pages/Orders.tsx</code>. A abertura de pedidos passa a ser conduzida pelo{' '}
            <strong>Ciclo Operacional</strong> (status coletando ou correcao), com herança soberana
            da chamada, escolas desduplicadas por contrato ativo da chamada, quantidades aceitando
            múltiplos de 0,5 e resolução transparente de rota em segundo plano.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-destructive">Comportamentos Substituídos:</span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>• Remoção do seletor manual de contrato como condutor do diálogo</li>
                <li>• Fim do vínculo de escolas restrito a um único contrato pré-selecionado</li>
                <li>• Fim das quantidades inteiras rígidas (step 1) para pedidos</li>
                <li>• Fim da inferência implícita de ciclo desconectada da seleção do operador</li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">Novo Fluxo Consolidado (5 Passos):</span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • <strong>Passo 1:</strong> Ciclo operacional como driver (apenas fases
                  coletando/correcao) com alerta âmbar caso vazio
                </li>
                <li>
                  • <strong>Passo 2:</strong> Chamada derivada do ciclo com badge contextual no
                  cabeçalho
                </li>
                <li>
                  • <strong>Passo 3:</strong> União desduplicada de escolas dos contratos ativos da
                  chamada com INEP e rota
                </li>
                <li>
                  • <strong>Passo 4:</strong> Itens e preços soberanos da chamada com múltiplos de
                  0,5 e total em tempo real
                </li>
                <li>
                  • <strong>Passo 5:</strong> Gravação com ciclo_id explícito e rota derivada em
                  segundo plano
                </li>
                <li>
                  • <strong>Colar Pedido:</strong> Modal integrado para colar produto e quantidade
                  em lote (tabulação, vírgula, ponto-e-vírgula, &quot;5x Produto&quot; ou final da
                  linha), com tolerância a múltiplos de 0,5, preços soberanos da chamada, prévia
                  detalhada e soma automática para produtos repetidos
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Aposentadoria Definitiva da Coleção ciclo_contratos (v0.0.140) */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Migration 0112
              </Badge>
              <span className="font-semibold text-foreground">
                Aposentadoria Definitiva da Collection ciclo_contratos
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Executado (v0.0.140)</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Eliminação estrutural e de código da coleção obsoleta <code>ciclo_contratos</code>. O
            ciclo operacional é por Chamada Pública (<code>ciclos.chamada_id</code>), sua fase e
            status são gerenciados diretamente em <code>ciclos.status</code>, e os contratos
            participantes são derivados dos contratos ativos da própria chamada.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-destructive">Artefatos Aposentados:</span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>• Coleção ciclo_contratos excluída do banco PocketBase</li>
                <li>• Registros legados de ciclo_contratos removidos</li>
                <li>• Interface CicloContratoRecord e ciclo-contratos.ts deletados</li>
                <li>• Estado cicloContratos e métodos redundantes removidos do AppContext</li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">Arquitetura Consolidada:</span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • Fase única do ciclo em <code>ciclos.status</code> para toda a chamada
                </li>
                <li>
                  • Contratos participantes derivados em tempo de execução via{' '}
                  <code>chamada_id</code>
                </li>
                <li>
                  • Despacho, importação, monitoramento e pedidos alinhados ao ciclo da chamada
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Exclusão do Contrato C-2026-01 (v0.0.105) */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                Migration 0101
              </Badge>
              <span className="font-semibold text-foreground">
                Exclusão Definitiva do Contrato C-2026-01
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              Executado em 30/09/2026 (v0.0.105)
            </span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Exclusão segura e idempotente do contrato <strong>C-2026-01</strong> (id{' '}
            <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">jtawh1rmm4jpcus</code>
            ), seus 19 itens em <code>contrato_itens</code> e vínculos em{' '}
            <code>contrato_escolas</code>, após confirmação explícita do usuário. A coleção{' '}
            <code>contratos</code> passa a ficar vazia, aguardando novos cadastros.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-destructive">Registros Removidos:</span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>• Contrato C-2026-01 na coleção contratos</li>
                <li>• 19 registros de contrato_itens vinculados ao contrato</li>
                <li>• 84 vínculos de escolas em contrato_escolas</li>
                <li>• Desvinculação de rotas mantendo estrutura intacta (contrato_id nulo)</li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">Ativos 100% Preservados:</span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • Chamada 01/2025 (centralizado) e Chamada 07/2025 (individualizado) com 19 itens
                  cada
                </li>
                <li>
                  • Rotas operacionais: ROTA A (37 paradas), ROTA B (24 paradas), ROTA C (23
                  paradas)
                </li>
                <li>• 84 escolas municipais cadastradas com CEP, contatos e coordenadas GPS</li>
                <li>• Catálogo completo de 38 produtos com preços e unidades</li>
                <li>• Todos os usuários, permissões e parâmetros do sistema</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Limpeza Anterior (v0.0.102) */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-muted-foreground border-border">
                Migration 0094
              </Badge>
              <span className="font-semibold text-foreground">
                Limpeza Autorizada de Dados de Teste (Preparação Operacional)
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              Executado em 30/09/2026 (v0.0.102)
            </span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Execução de rotina idempotente de higienização de registros artificiais de teste criados
            durante as fases de desenvolvimento e homologação das rotinas de importação,
            roteirização e emissão de atestos.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <span className="font-medium text-destructive">Registros Removidos:</span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>• Ciclo de teste 38/2026 e seus vínculos operacionais</li>
                <li>
                  • 37 pedidos centralizados de teste (IMP-8407-*, IMP-8408-*, FOR-*, ORD-*) e 297
                  itens
                </li>
                <li>• 20 atestos de homologação gerados em teste</li>
                <li>• 3 despachos de teste do ciclo 38/2026</li>
                <li>• 3 tokens públicos de teste para formulário individualizado</li>
                <li>• 11 contratos de teste C-07/2025-01 a C-07/2025-11 (R$ 1,00) e 2 itens</li>
                <li>• Contrato cancelado C-2026-02 (redefinido) e 12 vínculos contrato_escolas</li>
                <li>
                  • Rota legada individualizada &quot;A&quot; (11 paradas) do contrato C-2026-02
                </li>
                <li>• Contatos provisórios contendo &quot;(TESTE)&quot; em 46 escolas zerados</li>
              </ul>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <span className="font-medium text-primary">Ativos Reais Preservados:</span>
              <ul className="space-y-1 text-xs text-foreground/80">
                <li>
                  • Chamada 01/2025 (centralizado) e Chamada 07/2025 (individualizado): 19 itens
                  cada
                </li>
                <li>
                  • Rotas operacionais ativas: ROTA A (37 paradas), ROTA B (24 paradas), ROTA C (23
                  paradas)
                </li>
                <li>• 84 escolas municipais com CEP e coordenadas geográficas preservadas</li>
                <li>• Catálogo completo de 38 produtos cadastrados</li>
                <li>• Parâmetros institucionais e Depósito Central em Configurações</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-12 pt-6 border-t border-border text-center text-xs text-muted-foreground">
        Documento de Requisitos do Sistema — SIGCAF • Conectado ao Skip Cloud (PocketBase)
      </div>
    </div>
  )
}

export default Requirements
