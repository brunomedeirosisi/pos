export const paymentDashboardEn = {
  tab: "Payments",
  salesTab: "Sales",
  mainKpis: "Payment indicators",
  secondaryKpis: "Debt collection indicators",
  method: "Payment method",
  origin: "Receipt origin",
  employee: "Receiver",
  identifier: "Source ID",
  event: "Event",
  search: "Search customer, reference or ID",
  timezone: "Store analysis timezone: {{timezone}}",
  onlyUnassigned: "Only receipts without an assigned receiver",
  invalidRange: "Choose valid dates in order, covering at most 366 days.",
  loadError: "Unable to load payment analytics.",
  unavailable: "Unavailable",
  noDueDates: "Reliable due dates and payment allocation are not recorded.",
  noAllocation:
    "Payments reduce the customer balance; they are not allocated to individual obligations.",
  positionGlobal: "Current global portfolio position",
  positionScope:
    "Global current position, recorded at {{date}}; receipt filters do not apply.",
  positionDetailsUnavailable:
    "Overdue and not-yet-due amounts cannot be separated without reliable due dates.",
  todayScope:
    "Today in the analysis timezone; other receipt filters apply, regardless of the selected period.",
  noBaseline: "No non-zero previous-period baseline",
  evolution: "Receipt evolution",
  grouping: "Time grouping",
  groups: { day: "Daily", week: "Weekly", month: "Monthly" },
  gross: "Gross confirmed receipts",
  refunds: "Cancellation reversals",
  net: "Net receipts",
  previousNet: "Previous-period net receipts",
  quantity: "Confirmed payments",
  ticket: "Average payment amount",
  distribution: "Payment method distribution",
  distributionMetric: "Distribution metric",
  distributionScope:
    "Shares use gross confirmed amounts or receipt counts, before later reversals.",
  smallMethods: "Small methods — expand",
  origins: "Receipts by origin",
  originsList: {
    cash_sale: "Upfront sale receipt",
    credit_entry: "Credit sale entry",
    debt_payment: "Debt amortization",
  },
  methods: {
    cash: "Cash",
    card: "Card",
    bank: "Bank transfer",
    other: "Other",
    legacy: "Legacy — method unknown",
    unspecified: "Entry — method not recorded",
  },
  events: { receipt: "Receipt", reversal: "Cancellation reversal" },
  reversedLater: "Reversed later; see the separate reversal event",
  heatmap: "Receipt times",
  unknownTimes:
    "{{count}} receipts have no reliable confirmation time and are excluded from this chart.",
  noObservations: "No recorded receipts in this cell",
  receivablesEvolution: "Accounts receivable evolution",
  receivablesEvolutionUnavailable:
    "Historical positions cannot be reconstructed reliably from current balances and incomplete legacy events. The current position is shown separately.",
  aging: "Debt aging",
  agingUnavailable:
    "No reliable due-date schedule or allocation of payments to obligations is available. An open balance does not imply delinquency.",
  customersRanking: "Customers by payments",
  employeesRanking: "Employees by receipts",
  unidentifiedCustomer: "Unidentified customer — individual receipt",
  unassignedEmployee: "Receiver not recorded",
  customerRankingScope:
    "Ranked by the selected metric. Net flows include period reversals; average uses gross confirmed receipts. Customer balances are current, global positions. Anonymous receipts remain separate.",
  employeeRankingScope:
    "Receipts are attributed to the recorded receiver, never inferred from the seller. Participation uses gross confirmed receipts. Unassigned receipts remain a separate bucket.",
  transactions: "Financial movements",
  transactionsScope:
    "Receipts and cancellation reversals are separate dated events. No financial changes are performed here. Export includes every filtered movement, not only this page.",
  export: "Export Excel",
  exportError: "Unable to export payments.",
  exportLimit:
    "This export exceeds 100,000 movements. Narrow the filters; no partial file was generated.",
  coverage: "Data coverage",
  coverageCounts:
    "Receipts without recorded receiver: {{employee}} · without store: {{store}} · without specific payment method: {{method}}.",
  legacyScope:
    "Legacy sale totals are excluded from cash receipts because their settlement overlaps imported payments. Imported payment dates are retained; import time is never used as the receipt time. Credit entries do not record their actual tender method. Cancellation reversals reflect system cancellation dates, not independently confirmed cash refunds.",
  undatedReversals:
    "{{count}} cancelled receipts lack a reversal timestamp; net cash-flow coverage is incomplete.",
  kpis: {
    today: "Total received today",
    period: "Total received in period",
    ticket: "Average payment amount",
    receivable: "Total receivable",
    delinquency: "Delinquency rate (%)",
    quantity: "Confirmed payments",
    amortization: "Average debt amortization",
    debtors: "Customers with active debt",
    settled: "Obligations settled in period",
    debtShare: "Receipts from debts (%)",
  },
  tips: {
    today:
      "Gross confirmed receipts today minus cancellation reversals recorded today, in the store analysis timezone. Variation compares with yesterday under the same filters.",
    period:
      "Gross receipts minus cancellation reversals by their effective dates. Comparison uses the immediately preceding period of equal day length and identical filters.",
    ticket:
      "Gross confirmed receipts divided by confirmed payment transactions. Partial debt payments each count once. Variation uses the previous equivalent period. This is not the average sale value.",
    receivable:
      "Sum of positive balances in the authoritative current customer financial view, including entries, valid subsequent payments and legacy reconciliation. Global position, not period movement.",
    delinquency:
      "Overdue balance divided by receivable balance. No estimate is made because reliable obligation due dates are unavailable.",
    quantity:
      "Logical confirmed receipt transactions during the period. Reversals do not create new receipt transactions.",
    amortization:
      "Gross confirmed customer debt payments divided by their transaction count. Checkout entries are excluded.",
    debtors:
      "Distinct customers with a positive current balance across the global portfolio.",
    settled:
      "Individual obligations settled during the period cannot be identified because payments are not allocated to debts or instalments.",
    debtShare:
      "Gross customer debt receipts divided by all gross confirmed receipts. Origins are mutually exclusive; checkout entries are separate.",
  },
};
export const paymentDashboardPt = {
  tab: "Pagamentos",
  salesTab: "Vendas",
  mainKpis: "Indicadores de pagamentos",
  secondaryKpis: "Indicadores de cobrança",
  method: "Forma de pagamento",
  origin: "Origem do recebimento",
  employee: "Responsável pelo recebimento",
  identifier: "ID de origem",
  event: "Evento",
  search: "Buscar cliente, referência ou identificador",
  timezone: "Fuso da análise da loja: {{timezone}}",
  onlyUnassigned: "Somente recebimentos sem responsável registrado",
  invalidRange:
    "Escolha datas válidas e ordenadas, em um intervalo de até 366 dias.",
  loadError: "Não foi possível carregar a análise de pagamentos.",
  unavailable: "Indisponível",
  noDueDates:
    "Não há vencimentos e alocação de pagamentos confiáveis registrados.",
  noAllocation:
    "Os pagamentos reduzem o saldo do cliente, sem alocação por obrigação individual.",
  positionGlobal: "Posição global atual da carteira",
  positionScope:
    "Posição global atual, apurada em {{date}}; os filtros de recebimentos não se aplicam.",
  positionDetailsUnavailable:
    "Não é possível separar valores vencidos e a vencer sem vencimentos confiáveis.",
  todayScope:
    "Hoje no fuso da análise; os demais filtros se aplicam, independentemente do período escolhido.",
  noBaseline: "Sem base positiva ou negativa no período anterior",
  evolution: "Evolução dos recebimentos",
  grouping: "Agrupamento temporal",
  groups: { day: "Diário", week: "Semanal", month: "Mensal" },
  gross: "Recebimentos brutos confirmados",
  refunds: "Estornos por cancelamento",
  net: "Recebimentos líquidos",
  previousNet: "Recebimento líquido no período anterior",
  quantity: "Pagamentos confirmados",
  ticket: "Ticket médio de pagamento",
  distribution: "Distribuição por forma de pagamento",
  distributionMetric: "Métrica da distribuição",
  distributionScope:
    "A participação usa valores brutos confirmados ou quantidade de recebimentos, antes de estornos posteriores.",
  smallMethods: "Modalidades pequenas — expandir",
  origins: "Recebimentos por tipo de origem",
  originsList: {
    cash_sale: "Recebimento de venda à vista",
    credit_entry: "Entrada de venda a prazo",
    debt_payment: "Amortização de dívida",
  },
  methods: {
    cash: "Dinheiro",
    card: "Cartão",
    bank: "Transferência bancária",
    other: "Outros",
    legacy: "Legado — forma desconhecida",
    unspecified: "Entrada — forma não registrada",
  },
  events: { receipt: "Recebimento", reversal: "Estorno por cancelamento" },
  reversedLater: "Estornado posteriormente; consulte o evento separado",
  heatmap: "Horários de recebimento",
  unknownTimes:
    "{{count}} recebimentos não possuem horário de confirmação confiável e ficam fora deste gráfico.",
  noObservations: "Sem recebimentos registrados nesta célula",
  receivablesEvolution: "Evolução do contas a receber",
  receivablesEvolutionUnavailable:
    "Não é possível reconstruir posições históricas confiáveis a partir do saldo atual e de eventos incompletos do legado. A posição atual é exibida separadamente.",
  aging: "Aging de dívidas",
  agingUnavailable:
    "Não há cronograma confiável de vencimentos nem alocação de pagamentos por obrigação. Saldo em aberto não significa inadimplência.",
  customersRanking: "Ranking de clientes por pagamentos",
  employeesRanking: "Ranking de funcionários por recebimentos",
  unidentifiedCustomer: "Cliente não identificado — recebimento individual",
  unassignedEmployee: "Responsável não registrado",
  customerRankingScope:
    "Ordenação pela métrica selecionada. O fluxo líquido inclui estornos do período; o ticket usa o bruto confirmado. Os saldos dos clientes são posições globais atuais. Recebimentos anônimos permanecem separados.",
  employeeRankingScope:
    "Atribuição ao recebedor registrado, sem inferir o vendedor. A participação considera o bruto confirmado. Recebimentos sem responsável ficam em grupo separado.",
  transactions: "Movimentações financeiras",
  transactionsScope:
    "Recebimentos e estornos por cancelamento são eventos separados, cada um em sua data. Não há alterações financeiras nesta tela. A exportação inclui todos os movimentos filtrados, não apenas esta página.",
  export: "Exportar Excel",
  exportError: "Não foi possível exportar os pagamentos.",
  exportLimit:
    "A exportação ultrapassa 100.000 movimentos. Restrinja os filtros; nenhum arquivo parcial foi gerado.",
  coverage: "Cobertura dos dados",
  coverageCounts:
    "Recebimentos sem responsável registrado: {{employee}} · sem loja: {{store}} · sem forma específica: {{method}}.",
  legacyScope:
    "Totais de vendas do legado não entram no fluxo de recebimentos, pois a liquidação se sobrepõe aos pagamentos importados. As datas dos pagamentos são preservadas; o horário de importação não é usado como horário de recebimento. Entradas não registram a forma efetiva de pagamento. Os estornos representam cancelamentos registrados no sistema, sem confirmação independente de devolução física de dinheiro.",
  undatedReversals:
    "{{count}} recebimentos cancelados não possuem data de estorno; a cobertura do fluxo líquido está incompleta.",
  kpis: {
    today: "Total recebido hoje",
    period: "Total recebido no período",
    ticket: "Ticket médio de pagamento",
    receivable: "Total a receber",
    delinquency: "Índice de inadimplência (%)",
    quantity: "Quantidade de pagamentos",
    amortization: "Valor médio de amortização",
    debtors: "Clientes com dívidas ativas",
    settled: "Dívidas quitadas no período",
    debtShare: "Recebimentos de dívidas (%)",
  },
  tips: {
    today:
      "Recebimentos brutos confirmados hoje menos estornos por cancelamento registrados hoje, no fuso da análise da loja. A variação compara com ontem e os mesmos filtros.",
    period:
      "Recebimentos menos estornos por cancelamento, cada um na sua data efetiva. A comparação usa o período imediatamente anterior de igual duração em dias e os mesmos filtros.",
    ticket:
      "Recebimentos brutos confirmados divididos pela quantidade de transações de pagamento. Cada pagamento parcial conta uma vez. A variação usa o período anterior equivalente. Não é o ticket médio de vendas.",
    receivable:
      "Soma dos saldos positivos na fonte financeira atual dos clientes, com entradas, pagamentos posteriores válidos e conciliação do legado. É uma posição global, não movimentação do período.",
    delinquency:
      "Saldo vencido dividido pelo total a receber. O indicador não é estimado porque não há vencimentos confiáveis por obrigação.",
    quantity:
      "Transações lógicas de recebimento confirmadas no período. Estornos não são novos recebimentos.",
    amortization:
      "Pagamentos brutos confirmados de dívidas de clientes divididos pela quantidade dessas transações. Entradas do checkout não entram neste cálculo.",
    debtors: "Clientes distintos com saldo atual positivo em toda a carteira.",
    settled:
      "Não é possível identificar obrigações individuais quitadas no período, pois os pagamentos não são alocados a dívidas ou parcelas.",
    debtShare:
      "Recebimentos brutos de dívidas divididos pelo bruto total confirmado. As origens são exclusivas; entradas são tratadas separadamente.",
  },
};
