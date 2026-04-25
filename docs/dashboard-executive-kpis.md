# Dashboard Executivo de KPIs

Este documento descreve a implementação do dashboard executivo para o POS, com foco em filtros globais, KPIs de operação e gráficos gerenciais.

## Escopo entregue

- Filtros globais com estado em query string:
  - `startDate`, `endDate`, `storeId`, `sellerId`, `categoryId`, `channel`, `paymentTermId`, `timezone`.
- Cards de KPI:
  - Faturamento Hoje
  - Ticket Médio
  - Pedidos Hoje
  - Pedidos no Período
  - Margem Bruta %
- Widgets:
  - Vendas por dia (com comparação opcional com período anterior)
  - Participação por categoria (receita/quantidade/margem)
  - Heatmap de horários de pico (pedidos/receita)
  - Ranking de vendedores (Top 10, ordenável)
  - Curva ABC de produtos
  - KPIs de clientes (novos, recorrentes, recorrência, frequência)
  - Produto destaque (por quantidade ou receita)
  - Estoque crítico

## Endpoints implementados

- `GET /api/v1/dashboard/filters`
- `GET /api/v1/dashboard/kpis/summary`
- `GET /api/v1/dashboard/kpis/customers`
- `GET /api/v1/dashboard/kpis/critical-stock`
- `GET /api/v1/dashboard/kpis/top-product`
- `GET /api/v1/dashboard/charts/sales-by-day`
- `GET /api/v1/dashboard/charts/categories`
- `GET /api/v1/dashboard/charts/peak-hours`
- `GET /api/v1/dashboard/charts/seller-ranking`
- `GET /api/v1/dashboard/charts/product-abc`

## Regras de negócio principais

- Considera somente vendas com `sale.status = 'completed'`.
- Receita líquida por venda:
  - `coalesce(total, subtotal - discount) - refund_amount`
- Margem estimada por item:
  - `item_total - (quantity * coalesce(cost_price, average_cost, price_base, 0))`
- Itens sem custo:
  - `cost_price`, `average_cost` e `price_base` ausentes.
- Agrupamento de categorias pequenas:
  - itens com participação `< 2%` são agrupados em `Outros`.
- Curva ABC:
  - Classe `A`: acumulado `<= 80%`
  - Classe `B`: acumulado `<= 95%`
  - Classe `C`: restante

## Observações de modelo de dados

Foram adicionados via migração:

- `product.cost_price`
- `product.average_cost`
- `sale.paid_at`
- `sale.refund_amount`
- `sale.store_id`
- `sale.channel`
- tabela `stock_movement`

Arquivo de migração:

- `backend/sql/migrations/20260425_001_dashboard_executive_kpis.sql`

Também foi atualizado o `backend/sql/init.sql` para ambientes novos.

## Frontend

- Página: `frontend/src/pages/DashboardPage.tsx`
- Serviço HTTP: `frontend/src/services/dashboard.ts`
- Tipos: `frontend/src/types/dashboard.ts`
- Traduções EN/PT-BR: `frontend/src/lib/i18n.ts`

Comportamento:

- filtros persistidos na URL;
- loading e atualização por widget;
- manutenção de dados anteriores durante refetch (`placeholderData`), reduzindo flicker.

