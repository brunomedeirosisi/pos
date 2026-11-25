# Carteira de clientes / Customer portfolio

A página **Clientes / Customers** mantém cadastro, edição, detalhes, pesquisa e paginação e acrescenta indicadores globais e uma coluna de **Saldo Devedor / Outstanding balance**. Os cards reutilizam o `KpiCard` extraído do Dashboard principal, com os mesmos estilos. Cabeçalho e cards reorganizam-se em telas menores; a tabela mantém sua área de rolagem.

## Acesso e apresentação

Todos os leitores com `catalog:read` podem ver a quantidade total de clientes. Somente os perfis canônicos `admin` e `manager`, também com `catalog:read`, recebem os novos indicadores financeiros e podem consultar a coluna de saldo. Um perfil personalizado com permissão `*` continua sem esse acesso. A restrição é aplicada no servidor e no frontend; mudanças de perfil removem imediatamente a apresentação financeira e usam chaves de cache distintas. O ciclo de login/logout já limpa o cache privado da sessão.

Valores monetários usam BRL e formatação brasileira em PT-BR e EN. A coluna é alinhada à direita e distingue por texto e cor: dívida positiva, saldo zero e crédito negativo a favor do cliente. A primeira ativação do cabeçalho de saldo ordena do maior para o menor; a seguinte inverte a direção. A ordenação é numérica no servidor, com desempate por identidade. Trocar a pesquisa ou ordenação volta à primeira página. A indicação cadastral de inadimplência não é recalculada a partir do saldo.

## Fonte e indicadores

Lista, detalhes, histórico financeiro e relatórios compartilham a visão existente `customer_financial_totals`. Não foi criada outra regra de cálculo: vendas concluídas, entrada/pagamento inicial, pagamentos posteriores válidos, cancelamentos e o ajuste de conciliação `CLIENTES.DBF.DEBITO` continuam seguindo a implementação atual. Vendas canceladas/rascunhos e recebimentos cancelados não compõem o saldo válido. Valores negativos são preservados como crédito.

As operações monetárias e agregações usam `NUMERIC` no PostgreSQL; o frontend somente formata os resultados. Médias são arredondadas no servidor para centavos e percentuais para duas casas. A resposta JSON mantém números, conforme os demais contratos financeiros da aplicação.

| Indicador | Cálculo sobre toda a carteira |
| --- | --- |
| Total de clientes | Todos os registros cadastrados, incluindo ativos, inativos e marcados como inadimplentes; não existe exclusão lógica no modelo atual. |
| Clientes com dívida | Saldo > 0. |
| Saldo total devedor | Soma somente dos saldos positivos. Créditos de outros clientes não reduzem esse total. |
| Clientes sem dívida | Saldo exatamente igual a zero. Créditos são contados separadamente, conforme indicado no card. |
| Clientes com dívida (%) | Clientes com dívida ÷ total de clientes × 100. |
| Dívida média por cliente devedor | Saldo total devedor ÷ clientes com dívida. |
| Maior saldo devedor | Maior saldo positivo, ou zero. |
| Clientes com crédito | Saldo < 0, com o total absoluto de créditos no subtítulo. |

Denominadores vazios retornam zero. A seção mostra carregamento com espaço reservado, estado vazio e erro com nova tentativa. Uma falha não é apresentada como um saldo zero; valores anteriores são acompanhados de indicação de possível desatualização.

Os indicadores são sempre **globais** e essa condição é visível na página. A pesquisa e paginação afetam somente a tabela. Não há soma de apenas uma página no navegador nem requisições financeiras por cliente.

Não foram adicionados indicadores de vencidos/inadimplentes: faltam uma estrutura confiável de vencimentos e alocação de pagamentos. Dívida aberta não significa atraso. Clientes novos no mês dependem de uma data de cadastro inexistente no modelo atual. Recorrência não foi incluída neste conjunto para manter o foco nos indicadores principais e na distinção entre dívida e crédito.

## HTTP e atualização

`GET /api/v1/customers/overview` exige `catalog:read`, não aceita parâmetros de filtro/página e envia `Cache-Control: no-store`. Para outros perfis, a resposta contém somente `total_customers`; o objeto `financial` é omitido, sem executar agregação financeira. Para Admin/Gerente:

```json
{
  "total_customers": 6,
  "financial": {
    "customers_with_debt": 2,
    "customers_without_debt": 3,
    "customers_with_credit": 1,
    "total_debt": 225.23,
    "total_credit": 20.75,
    "debt_percentage": 33.33,
    "average_debt": 112.62,
    "largest_debt": 125.13
  }
}
```

`GET /api/v1/lists/customers?includeBalance=true` acrescenta `current_balance` a cada item e permite `sortBy=current_balance&sortOrder=asc|desc`. Acesso financeiro sem o perfil exigido retorna 403. Sem o parâmetro, o contrato antigo e os seletores de clientes permanecem sem o novo saldo. As permissões dos endpoints financeiros detalhados preexistentes permanecem conforme suas autorizações anteriores. O [OpenAPI](../backend/openapi/openapi.yaml) documenta os contratos.

Cadastro/edição, checkout com cliente, recebimento, cancelamento de recebimento/venda e conclusão de importação invalidam o prefixo de cache `customers`, abrangendo tabela e indicadores. A tela também atualiza enquanto visível a cada 60 segundos, ao retornar o foco para dados vencidos e pelo botão **Atualizar saldos / Refresh balances**. Mudanças de outro caixa ou de operações administrativas externas aparecem na atualização periódica ou manual; não há canal de notificações em tempo real. Lista e indicadores são requisições separadas e podem observar instantes diferentes durante uma movimentação concorrente; cada consulta usa seu snapshot PostgreSQL consistente.

A agregação faz uma consulta sobre a visão financeira existente; a listagem usa a paginação compartilhada. Os índices atuais de vendas e pagamentos por cliente atendem às relações da visão. Ordenar todos os clientes pelo saldo exige calcular os saldos elegíveis; não há um saldo materializado que possa ficar desatualizado. Nenhuma migração, nova dependência ou mudança de seed foi necessária. Os testes usam fixtures descartáveis, incluindo uma carteira com 2.000 clientes.

## Validação

Executar os runners de [testes Docker](testing-docker.md). A integração usa autenticação real, PostgreSQL e as rotas existentes de recebimento/cancelamento. Cobre Admin/Gerente, vendedor, perfil personalizado com `*`, falta de autenticação/permissão, contratos antigos, busca/páginas/ordenação numérica estável, dívida/entrada/quitação/crédito legado, centavos, arredondamento, atualização após operações e carteira vazia. O teste com 2.000 clientes verifica agregação integral e página limitada; não substitui um benchmark de produção.

Os testes de interface em PT-BR e EN cobrem os oito cards, BRL, identificação textual dos saldos, restrições e troca de perfil, filtros/paginação/ordenação, loading/erro/retry/vazio, criação/edição e atualização periódica/manual. Os fluxos existentes continuam na suíte de regressão.

English: the Customers page now shows global portfolio KPIs and an optional, numerically sorted signed balance column. New financial data is restricted on the server and UI to canonical Admin/Manager profiles with catalog read permission. All calculations reuse the authoritative financial view, including legacy reconciliation. Customer credits are presented separately and do not offset debt totals. Cards retain global scope during search/pagination. Existing mutations invalidate both queries; periodic/manual refresh covers other workstations. No due-date assumptions, schema migration or seed changes were introduced.
