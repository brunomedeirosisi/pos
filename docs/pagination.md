# Paginação das listagens / List pagination

Todas as listagens navegáveis usam os mesmos controles: primeira, anterior, próxima e última página, acesso direto pelo número, tamanho de página (10, 25, 50 ou 100), intervalo de registros e página atual/total. Os textos estão disponíveis em PT-BR e EN. A primeira página é 1; uma consulta vazia apresenta 0–0 registros e página 1 de 1.

Filtros e ordenação são aplicados antes da paginação. Alterar a pesquisa, filtros, ordenação ou tamanho volta à primeira página. Exclusões e mudanças concorrentes no total ajustam a página solicitada à última página válida. Falhas oferecem nova tentativa. Os controles ficam indisponíveis durante a consulta. O número da página pode ser confirmado com Enter; todos os controles têm identificação acessível.

O estado fica no QueryClient da sessão: retornar de detalhes ou edição preserva pesquisa, filtros, página e tamanho. Login/logout limpam esse estado; não são gravados dados pessoais de listagens no localStorage. Uma recarga completa do navegador inicia uma nova navegação. Os filtros do dashboard continuam também na URL.

## Inventário e estratégia

| Tela ou componente | Estratégia e origem |
| --- | --- |
| Produtos, grupos, clientes, vendedores e condições de pagamento | Servidor: `lists/products`, `product-groups`, `customers`, `sellers`, `payment-terms`. Nomes dos grupos acompanham os produtos. |
| Recebimentos: escolha e listagem de clientes | Servidor: `lists/customers`. O cliente escolhido permanece selecionado ao navegar na lista. |
| Histórico de vendas | Servidor: `lists/sales`; preserva datas, vendedor, cliente e condição de pagamento. Os nomes relacionados vêm na própria página. |
| Histórico de recebimentos/pagamentos | Servidor: `lists/payments`; preserva datas, cliente e usuário que recebeu. Ver, imprimir e cancelar mantêm as permissões existentes. |
| Cliente: compras | Servidor: `lists/customer-sales?customer_id=...`. |
| Cliente: pagamentos, inclusive aba do histórico e tabela financeira | Servidor: `lists/customer-payments?customer_id=...`; os dois pontos reutilizam consulta e controles. Resumo financeiro e total filtrado abrangem todos os registros. |
| Cliente: linha do tempo | Servidor: `lists/customer-activity?customer_id=...`; uma UNION de vendas e pagamentos é ordenada e paginada antes de carregar os detalhes da página. Usuários sem `sales:read` veem somente pagamentos. Os filtros de pagamento continuam afetando os pagamentos, como antes. |
| Usuários e perfis | Servidor: `lists/users`, `lists/roles`; ações e formulários preservados. |
| Perfis: vendedores dos usuários | Servidor: `lists/role-users?roleId=...`; busca, vínculo individual, permissões de administração e bloqueio durante salvamento preservados. |
| Backups | Servidor: `lists/backups`; download, exclusão e restauração usam o registro selecionado. As confirmações e proteções da restauração permanecem obrigatórias. |
| Impressoras | Servidor: `lists/printers`; a identidade da loja/modo é consultada separadamente. Credenciais e hashes nunca são retornados. |
| Histórico de impressões da venda | Servidor: `lists/print-jobs?saleId=...`; substitui os cortes anteriores de 5/20 itens. Atualização periódica da página, sem conteúdo do recibo ou tokens de execução. |
| Importação: detalhes técnicos e advertências de reconciliação | Servidor: `lists/legacy-logs` e `legacy-warnings`, com `sessionId`. Consulta sob demanda ao abrir os detalhes. O polling usa status compacto com contadores, sem retransmitir todos os logs/advertências. O relatório para download permanece completo. |
| Dashboard: ranking de vendedores, curva ABC e estoque crítico | Servidor: `dashboard/lists/seller-ranking`, `product-abc`, `critical-stock`. Classificação, participação, acumulados e posições são calculados sobre todo o período filtrado, antes de recortar a página. |
| Dashboard: tabela diária | Cliente: os mesmos agregados diários já necessários ao gráfico, limitados a 366 dias pela API. O gráfico e o acumulado usam a série completa. |
| Dashboard: legenda das categorias | Cliente: agregados já necessários ao gráfico circular, com categorias pequenas agrupadas pelo servidor. Cores e percentuais mantêm a relação com o gráfico completo. |
| PDV: pesquisa de produtos | Servidor: `lists/products`. A navegação não altera o carrinho. |
| PDV: itens do carrinho | Cliente: coleção da venda em edição, já mantida integralmente no store. Quantidades, edição, remoção, subtotal, desconto e fechamento usam o carrinho completo. |
| Detalhes da venda: itens | Cliente: documento de uma venda já carregado para exibição e ações. Recibo e totais continuam completos. |
| Seletores de cliente, vendedor, condição de pagamento, grupo e perfil nos filtros/formulários | `SearchableSelect` reutilizado, com busca e páginas no servidor; resolve separadamente o rótulo de uma seleção salva quando necessário. A pesquisa não aplica um ID até uma opção ser escolhida. |
| Seletores do dashboard | Servidor: `lists/dashboard-stores`, `dashboard-sellers`, `dashboard-categories`, `dashboard-payment-terms`; respeitam `sales:read` ou `reports:view`. |
| Destino de impressão | `SearchableSelect` com `lists/printers`, filtro de impressoras habilitadas. Valida a impressora salva individualmente, inclusive se estiver fora da página. Não redireciona automaticamente para outra impressora. |

Não são listagens navegáveis de registros: menus, idiomas, permissões conhecidas, status, métodos de pagamento, canais predefinidos, etapas de importação, cartões de indicadores e a matriz fixa de 7×24 horas. Permanecem completos. Itens resumidos dentro de uma célula são atributos do registro, acessíveis também na compra/venda detalhada. Recibos e relatório financeiro para impressão/exportação são documentos completos e **não** são recortados por paginação de tela.

## Contrato HTTP e compatibilidade

Os endpoints antigos que retornam arrays ou metadados em snake_case continuam disponíveis, com seus contratos e limites anteriores. A interface migrou de forma controlada para endpoints de leitura novos; rotas de gravação não mudaram. Consumidores externos podem migrar independentemente.

Exemplo:

```http
GET /api/v1/lists/products?search=camisa&page=2&pageSize=25&sortBy=name&sortOrder=asc
```

```json
{
  "items": [],
  "pagination": { "page": 1, "pageSize": 25, "totalItems": 0, "totalPages": 1 }
}
```

`page` aceita inteiro de 1 a 2147483647, `pageSize` de 1 a 100 (padrão 25). Valores inválidos são rejeitados com 400; uma página válida numericamente além do total é ajustada. `sortOrder` aceita `asc` ou `desc`. `sortBy` usa uma lista de campos permitidos por recurso; não é interpolado como SQL recebido do cliente. Pesquisas têm até 200 caracteres. Datas devem ser dias reais em `YYYY-MM-DD` e os intervalos precisam estar ordenados. IDs de escopo são UUIDs; `optionId` faz uma busca exata textual para resolver também impressoras como `principal`.

| Recurso | Ordenações permitidas (padrão) | Escopo/filtros |
| --- | --- | --- |
| Cadastros | `name` (asc), `legacy_code` | `search`, `id`, `optionId` |
| Usuários | `name` (asc), `email` | `search` |
| Perfis | `name` (asc) | `search` |
| Usuários do perfil | `name` (asc), `email` | `roleId` obrigatório, `search` |
| Recebedores | `name` (asc) | `search` |
| Vendas/compras do cliente | `emission_date` (desc), `total`, `order_number` | `from`, `to`, `seller_id`, `customer_id`, `payment_term_id`; `customer_id` obrigatório nas compras |
| Histórico de pagamentos | `payment_date` (desc), `amount`, `created_at` | `from`, `to`, `customer_id`, `received_by` |
| Pagamentos do cliente | `payment_date` (desc), `amount`, `created_at` | `customer_id` obrigatório, `start_date`, `end_date`, `method`, `sort` (alias da direção existente) |
| Linha do tempo | `date` (desc) | `customer_id` obrigatório; filtros de pagamento acima |
| Backups | `created_at` (desc), `filename` | `search` |
| Impressoras | `created_at` (asc), `name` | `search`, `enabled` |
| Impressões | `requested_at` (desc) | `saleId` obrigatório |
| Logs/advertências | `created_at` (asc) / `id` (asc) | `sessionId` obrigatório; advertências aceitam `search` |
| Dashboard: ranking | `revenue` (desc), `orders`, `averageTicket`, `margin` | Filtros de período/loja/vendedor/categoria/canal/condição já existentes |
| Dashboard: ABC | `revenue`, `quantity`, `margin` (desc, conforme `metric`) | Mesmos filtros; `metric` escolhe o cálculo ABC |
| Dashboard: estoque crítico | `shortage` (desc), `name` | Categoria; os demais filtros não alteram estoque físico, como antes |

As permissões são as mesmas dos módulos originais. Campos de senha, conteúdo de impressão, credenciais e tokens não fazem parte das páginas. A consulta compartilhada conta e recorta dentro de uma única instrução SQL/snapshot, com desempate por identidade. Agregados do dashboard são materializados uma vez; detalhes de vendas e linha do tempo são hidratados apenas para a página. A consulta financeira do cliente usa transação somente leitura em repeatable read para manter resumo e página consistentes.

O status de importação aceita `compact=true`; sem esse parâmetro, o contrato completo anterior é preservado. O modo compacto inclui `logCount` e `mismatchCount`, remove os arrays volumosos e mantém o estado, progresso e resultado final. `GET /api/v1/print-printers/info` fornece apenas `mode` e `store_id`.

## Implementação e operação

- Backend: `utils/query-page.ts` centraliza validação, whitelist, contagem, limite, ordenação e ajuste. `routes/lists.ts` declara os recursos e escopos, reutilizando mapeadores e regras financeiras existentes.
- Frontend: `Pagination` cuida da interação; `useListQuery` da consulta/estado persistido; `useClientPage` das coleções pequenas já carregadas; `SearchableSelect` reaproveita os controles para opções remotas.
- A migração `20261030_001_pagination.sql` cria índices para nomes/identidades, usuários por perfil, pagamentos ativos, impressões, logs e backups. Não altera registros financeiros nem exige mudança de seed. Novas instalações recebem os mesmos índices em `init.sql` e nas migrações.
- Paginação por offset mantém acesso direto a qualquer página. Em bases muito maiores, contagens exatas e offsets profundos têm custo crescente; a interface limita cada resposta a 100 itens. Esse contrato permite futuramente adicionar cursores sem remover as rotas anteriores.

Validação automatizada deve ser executada com os runners Docker de `infra/docker-compose.test-runners.yml`. Os testes cobrem registros com nomes/datas iguais, mais de 100 opções, filtros/ordenação, limites e entradas inválidas, páginas vazias/ajustadas, permissões e escopos, totais financeiros completos, timeline unificada, advertências de importação, dashboard, estados de carregamento/erro/retry, retorno dos detalhes e teclado em PT-BR/EN.

English: all navigable data lists share the same accessible paginator. Potentially growing lists are paginated on the server; only bounded data already required in full (cart, sale details and chart aggregates) are paginated locally. Existing endpoints and complete receipts/reports remain compatible. The API uses the camelCase envelope above, validates page/sort/filter input, enforces existing permissions and clamps pages after concurrent changes.

Evidência de 30/10/2026: [execução Docker](test-evidence/pagination-docker-20261030.log.gz), com 686 testes e 8 verificações de recuperação da imagem final aprovados. A conferência no navegador validou os controles em tela de 375 px e no computador; a configuração temporária de viewport foi restaurada. A atualização preservou as contagens e assinaturas de saldos e vínculos registradas antes da implantação.
