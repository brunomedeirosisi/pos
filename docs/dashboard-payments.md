# Dashboard — Pagamentos / Payments

A aba **Pagamentos / Payments** oferece análise de recebimentos e navegação aos registros financeiros existentes. A aba anterior continua como **Vendas / Sales**, com os mesmos filtros e widgets. A nova aba não cria contas, parcelas, lançamentos financeiros persistidos ou ações de alteração: consolida `sale`, `customer_payment`, seus cancelamentos e a visão autoritativa `customer_financial_totals`.

## Diagnóstico e decisões

O Dashboard existente usava React Query, filtros na URL, SVG, rosca em CSS, heatmap, paginação compartilhada e componentes locais de widget. `WidgetFrame`, paleta e funções de gráfico foram extraídos para reutilização, preservando os widgets de vendas. Os cards continuam usando `KpiCard`, agora com ajuda acessível por foco/hover. Datas, seletores com scroll infinito, tabelas, permissões e comprovantes existentes foram reaproveitados.

O modelo registra um único meio por venda/recebimento; não há pagamento dividido, parcelas com vencimentos, alocação de amortizações por obrigação ou histórico completo de posições financeiras. O checkout guarda `amount_paid`, `paid_at` e troco; pagamentos posteriores guardam `payment_date`, `created_at`, `received_by` e cancelamento. Nas entradas a prazo, o tipo `credit_with_entry` não informa a modalidade efetiva do dinheiro recebido. Importações trazem datas, mas seu horário de inserção não é o horário do recebimento. Vendas históricas não identificavam o operador que recebeu.

O campo `sale.refund_amount`, usado no relatório de faturamento, não tem uma data de devolução nem fluxo de confirmação de caixa correspondente. Ele não é convertido artificialmente em um estorno datado. A aba apresenta **estornos por cancelamento registrados no sistema**; não certifica devolução física de dinheiro, chargebacks ou devoluções parciais não documentadas como eventos. Por isso a análise não substitui uma conciliação bancária ou fechamento de caixa.

## Regras dos recebimentos

| Registro | Tratamento |
| --- | --- |
| Venda operacional à vista | Um recebimento em `paid_at`, com `min(amount_paid, total)` positivo; o troco não aumenta o recebido. |
| Venda a prazo sem entrada | Não gera recebimento no checkout. A obrigação continua compondo o saldo da fonte financeira existente. |
| Venda a prazo com entrada | Um recebimento da entrada em `paid_at`, origem exclusiva `credit_entry`, modalidade `unspecified`. Não é contado também como amortização. |
| `customer_payment` | Um recebimento de amortização em `payment_date`, inclusive pagamentos parciais. Não é inferida uma parcela/venda de origem que o modelo não relaciona. |
| Cancelamento posterior | Um evento separado, negativo, no dia local de `cancelled_at`, vinculado ao ID original. O recebimento original continua no bruto e no ticket de sua data; o estorno reduz o líquido na data da reversão. |
| Venda em rascunho ou recebimento zero | Não entra no fluxo de recebimentos. |
| Vendas importadas `VENDAS`/`PEDIDOS` | Não entram como recebimentos de checkout: seus totais/liquidações sobrepõem-se a pagamentos importados, e o histórico não permite reconstruir essa separação com confiança. |
| Pagamento importado | Mantém o valor e dia do registro existente. Modalidade `legacy` significa forma desconhecida; o horário de importação nunca alimenta o heatmap. |

As origens `cash_sale`, `credit_entry` e `debt_payment` são mutuamente exclusivas. As modalidades são somente as existentes (`cash`, `card`, `bank`, `other`, `legacy`) e a identificação explícita de entrada sem forma registrada (`unspecified`). Não são criadas modalidades PIX, débito/crédito separado ou liquidações múltiplas que o sistema não registra.

O ticket médio é **bruto confirmado ÷ quantidade de recebimentos**, com cada pagamento parcial contado uma vez. Estornos são movimentos separados e não aumentam a quantidade de pagamentos. Valores monetários são agregados com `NUMERIC` no PostgreSQL; a interface apenas formata os resultados em BRL, em PT-BR e EN.

## Período, posição e lacunas

O período usa o dia efetivo do recebimento, não `emission_date` da venda. `paid_at` e `cancelled_at` são convertidos para o fuso da análise. `payment_date` continua sendo um dia de calendário, sem conversão para a véspera. O fuso inicial e o dia atual vêm da configuração PostgreSQL da loja (`TimeZone`), sem depender do fuso do navegador. A URL pode selecionar outro fuso IANA válido, que aparece explicitamente na tela.

O período anterior contém o mesmo número de dias e termina na véspera do período atual, com os mesmos filtros. Variação = `(atual − anterior) ÷ |anterior| × 100`; base zero retorna indisponível. O KPI de hoje ignora somente o período e compara com ontem, mantendo os outros filtros. O ticket compara com o intervalo anterior equivalente. Séries diárias têm dias vazios preenchidos com zero; agrupamentos semanais/mensais somam esses dias, com primeiro/último bucket possivelmente parciais. A série anterior é alinhada pelo deslocamento do mesmo número de dias, não por meses de duração desigual.

| Posição/indicador | Disponibilidade |
| --- | --- |
| Total a receber e clientes devedores | **Posição global atual**, obtida de `customer_financial_totals` via serviço existente da carteira. Soma de saldos positivos, sem compensar créditos de outros clientes. A tela informa `asOf` e que os filtros de recebimentos não se aplicam. |
| Índice de inadimplência, vencido e a vencer | **Indisponíveis**: não há cronograma confiável de vencimentos/alocação. Dívida aberta não significa atraso. |
| Evolução histórica do contas a receber | **Indisponível**: conciliação legada e dados atuais não constituem um histórico imutável de eventos/snapshots suficiente para reconstruir posições passadas. O saldo de hoje não é repetido como saldo antigo. |
| Aging | **Indisponível** pela falta de vencimentos e saldos por obrigação. |
| Dívidas/obrigações quitadas no período | **Indisponível**: saldo global do cliente não identifica quais obrigações foram pagas/reabertas. |
| Média de amortização e participação de dívidas | Disponíveis sobre recebimentos brutos `debt_payment`, excluindo entradas de checkout. |

No heatmap, somente confirmações com horário confiável são usadas. Para pagamentos manuais, `created_at` representa a confirmação registrada apenas quando seu dia local coincide com `payment_date`; registros importados ou retroativos sem esse vínculo ficam fora do heatmap. Células sem observações têm identificação própria e a quantidade excluída aparece no widget.

A cobertura informa falta de recebedor, loja e modalidade específica. Cancelamentos sem timestamp de reversão recebem alerta de fluxo líquido incompleto; não é inventada uma data. Sem funcionário registrado, os valores ficam num grupo explícito, nunca no vendedor da venda original. Recebimentos sem cliente não são fundidos num cliente fictício: cada recebimento lógico permanece separado no ranking.

## Interface e atualização

A tela apresenta cinco cards principais, quatro visualizações de recebimentos, painéis de posições/limitações, rankings de clientes/funcionários, cinco indicadores complementares e tabela de movimentos. Rankings e tabela usam paginação/ordenação no servidor. Ranking de clientes permite abrir o histórico existente; a tabela abre venda, recebimento e seus comprovantes, conforme permissões.

Filtros acordados: período, modalidade, origem, cliente, responsável, loja quando registrada e busca por nome/ID/referência. Eles ficam em parâmetros `p_*` na URL; os filtros anteriores de vendas mantêm seus nomes. `tab=payments` abre a nova aba. Reset limpa somente os filtros de pagamentos. Agrupamento, comparação e distribuição também são preservados na URL. Alterar somente visualização local não repete consultas de tabelas/rankings; cada tabela mantém paginação independente. Somente a aba ativa monta consultas.

Busca de rascunho usa debounce; Aplicar confirma o conjunto de filtros. Os seletores remotos usam o componente compartilhado com scroll infinito. Mudança de filtro/ordenação reinicia a página correspondente. Loading, erro com nova tentativa, ausência de registros e dados indisponíveis são tratados em ambos os idiomas. Falhas não são exibidas como saldo zero e respostas antigas não substituem os filtros atuais.

Checkout, cancelamentos, recebimentos, edições de clientes e conclusão de importação invalidam o cache pertinente. A aba também atualiza a cada 60 segundos enquanto visível e ao recuperar foco com dados vencidos. A consulta do resumo usa snapshot `repeatable read` somente leitura para consolidar posição e movimentos; tabelas são consultas separadas com snapshots próprios, podendo refletir uma movimentação concorrente alguns instantes depois. Não há notificações financeiras em tempo real entre caixas.

## HTTP, segurança e exportação

Todos os endpoints abaixo exigem perfil canônico **Admin/Gerente**, `reports:view` e `catalog:read`, com `Cache-Control: no-store`. Vendedor e perfil personalizado com `*` não recebem a nova análise financeira. As permissões das telas anteriores continuam preservadas. Os novos recursos de opções não alteram o seletor antigo `dashboard-payment-terms`.

| Endpoint | Resultado |
| --- | --- |
| `GET /api/v1/dashboard/payments/options` | Fuso configurado e dia atual da loja. |
| `GET .../summary` | KPIs, contexto/período anterior, séries, distribuições, heatmap, cobertura e posição atual. Indicadores sem fonte confiável são `null`. |
| `GET .../transactions` | Recebimentos/estornos paginados, identidade lógica e original, data, cliente, recebedor, loja, origem, modalidade e valores bruto/estorno/líquido. |
| `GET .../customers` | Ranking paginado, valores/quantidades/ticket, último recebimento e saldo atual global. |
| `GET .../employees` | Ranking paginado pelo recebedor registrado e participação no bruto confirmado. |
| `GET .../export` | XLSX de todos os movimentos filtrados, com a ordenação ativa. `page/pageSize` não recortam o arquivo. |

`startDate/endDate` aceitam dias reais, intervalo ordenado de até 366 dias e ano a partir de 0002 para permitir a comparação anterior. `timezone` é IANA; IDs de cliente/recebedor são UUIDs; `receivedBy=unassigned` seleciona registros sem responsável. `search` tem até 200 caracteres. Parâmetros não suportados, inclusive pedidos de posição histórica, são rejeitados. Sem período, usa-se o mês corrente até hoje.

Ordenações de movimentos: `date`, `amount` (líquido assinado), `customer`, `employee`, `method`, `origin`, `id`, `kind`. Rankings: `net`, `gross`, `count`, `average`, `name`, `last_date`. São whitelists de SQL fixo, com desempate por identidade e contratos de página existentes. Os [contratos OpenAPI](../backend/openapi/openapi.yaml) detalham os parâmetros.

Como não havia exportador Excel transacional, o novo utilitário gera OOXML `.xlsx` usando a dependência `archiver` já existente. Cabeçalhos e nome da planilha são localizados; valores BRL são células numéricas; linhas usam IDs/links relativos de origem, primeira linha congelada e autofiltro. Texto é escapado e escrito como `inlineStr`, impedindo interpretação de nomes/referências como fórmulas. A exportação gera auditoria `DASHBOARD_PAYMENTS_EXPORT`. Acima de **100.000 movimentos**, retorna 409 e pede filtros mais restritos, sem entregar arquivo parcial.

## Migração, desempenho e seed

A migração idempotente `20261117_001_payment_analytics_metadata.sql` acrescenta `sale.received_by`, `customer_payment.store_id` e índices de datas de recebimento/cancelamento. O bootstrap normal da API executa as migrações pendentes. Novas instalações recebem o mesmo suporte em `init.sql`.

Novos checkouts persistem o usuário autenticado que recebeu, independentemente do vendedor selecionado, e a loja configurada por `STORE_ID` (ou `main` quando não configurada). Novos recebimentos posteriores também persistem essa loja. Registros antigos permanecem com atribuição desconhecida quando inexistente: nenhum funcionário/loja é inferido nem nenhum valor financeiro é reescrito.

O relatório é uma projeção de leitura, não um sistema financeiro paralelo. As consultas usam agregações no servidor, paginação limitada, chaves de cache por filtro e cancelamento de buscas obsoletas; não há chamada financeira por cliente. A posição global precisa calcular a visão financeira atual, e períodos volumosos continuam sujeitos ao custo da contagem/agregação exata. O teste sintético com mais de 2.000 pagamentos verifica totais completos e página limitada; não é um benchmark de produção.

Nenhuma dependência nova ou alteração de seed foi necessária. Seeds históricos podem continuar sem recebedor/loja de recebimento; preencher esses campos por inferência quebraria a rastreabilidade. Os testes criam fixtures descartáveis específicas, inclusive datas/estornos, importados, anônimos e atribuição do checkout real.

## Validação

Executar pelos [runners Docker](testing-docker.md). A integração usa cookies e permissões reais, PostgreSQL, fontes financeiras existentes, arquivo XLSX descompactado e migração repetida. Cobre centavos/troco/entrada/prazo, cancelamento em outra data, períodos equivalentes, dias sem movimento, fuso na virada de dia, bruto/líquido/ticket, lacunas, ranking/atribuição, filtros/páginas/ordenação, limites e injeção, exportação integral e proteção contra fórmulas. A interface em PT-BR/EN cobre consultas apenas da aba ativa, filtros/URL, teclado das abas, páginas independentes, gráficos/controles, estados de erro/retry/loading, respostas antigas e exportação com filtros.

English: Dashboard now has Sales and Payments tabs. Payments aggregates existing checkout receipts, customer debt payments and dated cancellation reversals, while the authoritative customer financial view supplies the explicitly current/global receivable position. Entry tenders, legacy timestamps and historical receivers are never inferred. Due-date delinquency/aging, historical positions and settled obligations remain explicitly unavailable because their source data is missing. Admin/Manager management permissions protect the endpoints. Filters and views persist in the URL; tables are server-paged and XLSX exports include every filtered movement within the documented limit. The migration adds attribution metadata for new records only; existing financial values and seeds are preserved.
