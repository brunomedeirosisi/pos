# Histórico de pagamentos / Payment history

A página **Histórico de pagamentos**, no menu principal em `/payments/history`, reúne os recebimentos de clientes registrados em **Pagamentos** e os recebimentos importados do legado. A tela anterior de registro permanece em `/payments`. Os pagamentos feitos no fechamento de uma venda (`sale.amount_paid`) continuam no histórico de vendas; não são recebimentos separados de clientes.

Os filtros ficam lado a lado, com quebra de linha em telas menores: data inicial, data final, **Recebido por** e cliente. Conforme a regra definida, o filtro correspondente ao vendedor usa o usuário que recebeu o pagamento (`received_by`), sem atribuir vendedor a pagamentos antigos. Não há filtro de condições de pagamento. As datas delimitam `payment_date`, com limites inclusivos. Recebimentos legados sem responsável aparecem sem nome e não correspondem a um usuário selecionado.

**Recebido por** e **Cliente** agora permitem digitação, sugestões e seleção por teclado ou clique. A busca de clientes alcança os cadastros além da primeira página. Veja [como usar os filtros com busca](history-filters.md).

A listagem tem 50 registros por página e ordenação decrescente por data, criação e ID, incluindo pagamentos cancelados. **Ver pagamento** abre os detalhes sem iniciar impressão. **Imprimir recibo** reutiliza a página de recibo existente e sua impressão pelo navegador. O recibo mostra data do pagamento, criação, cliente, valor, forma, responsável, referência, observações e saldos.

## Cancelamento

Somente os perfis de sistema `admin` e `manager` podem cancelar. A restrição vale na interface e na API, inclusive se outro perfil receber permissão curinga. A leitura segue a permissão existente `catalog:read`; o registro continua exigindo `catalog:write`. Não foram criadas permissões adicionais nem modificados os perfis existentes.

O operador confirma o cliente e o valor, podendo informar um motivo de até 500 caracteres. O registro original e seu valor são preservados. O sistema grava data, usuário e motivo do cancelamento e um evento `CUSTOMER_PAYMENT_CANCEL` na mesma transação. Não há integração com estorno bancário: o cancelamento desfaz o abatimento no saldo do cliente.

Pagamentos cancelados deixam de compor o total pago, o saldo, a última data de pagamento e o relatório de recebimentos ativos do cliente. Continuam consultáveis no histórico global e nos recibos, com **PAGAMENTO CANCELADO / CANCELLED PAYMENT** em destaque. No recibo cancelado, o saldo posterior é igual ao saldo anterior. Recebimentos posteriores também desconsideram os pagamentos cancelados.

O cancelamento usa o mesmo bloqueio de cliente do registro de recebimentos. Duas solicitações simultâneas não desfazem o valor duas vezes: a primeira retorna sucesso e a repetida retorna HTTP 409. Se a auditoria falhar, a transação inteira é revertida.

## API e atualização

| Endpoint | Operação |
|---|---|
| `GET /api/v1/payments` | Histórico paginado; filtros `from`, `to`, `received_by`, `customer_id`, `page`, `page_size` (máximo 200). |
| `GET /api/v1/payments/receivers` | IDs e nomes dos usuários vinculados aos recebimentos históricos. |
| `GET /api/v1/payments/{id}` | Detalhes no contrato existente de recibo. |
| `POST /api/v1/payments/{id}/cancel` | Cancela com corpo opcional `{ "reason": "..." }`; retorna pagamento e saldo atualizado. |

A migration `20261029_001_payment_cancellation.sql` adiciona `cancelled_at`, `cancelled_by`, `cancellation_reason` e índices de consulta. O servidor aplica migrations pendentes na inicialização; `npm run migrate` também pode ser usado no ambiente de implantação. O schema inicial foi atualizado para novas instalações. Registros existentes e seeds conservam seus valores e ficam ativos por padrão; não é necessário reexecutar seeds nem alterar os arquivos importados.

Foi reutilizada a grade responsiva dos históricos (`history-filters`), a tabela, o `ConfirmDialog`, o `ToastProvider`, as consultas de clientes e a página de recibo. Nenhuma dependência adicional foi introduzida para este histórico. A sequência de testes também cobre o cancelamento de uma venda após desfazer seus recebimentos; a conversão do timestamp de cancelamento retornado pelo PostgreSQL foi corrigida para aceitar o objeto `Date` real do driver.

## English operation notes

**Payment history** lists customer receipts, including legacy imports, with inclusive date, receiving-user and customer filters. It preserves the existing payment registration page and excludes checkout payments stored directly on sales. View opens details without printing; Print receipt reuses browser receipt printing. Only the `admin` and `manager` profiles can cancel, even when another profile has wildcard permissions.

Cancellation preserves the original payment and atomically records the operator, timestamp, optional reason and audit event. It removes the payment from active customer balances and reports. Cancelled receipts remain accessible with a prominent cancellation notice and no balance reduction. Simultaneous or repeated requests cannot reverse the payment twice. This records a balance correction; it does not initiate a bank refund.

## Testes

Execute as verificações em Docker conforme [o guia](testing-docker.md). Os testes de interface cobrem PT-BR/EN, filtros, paginação, perfis, confirmação, erros, navegação e impressão. Os testes com PostgreSQL verificam saldos, recibos, relatórios, auditoria, concorrência, rollback e recusa de perfis não autorizados.

Validação de 29/10/2026: **373 testes aprovados em Docker**, além de lint, tipos e builds. Os 12 novos testes de integração incluem a atualização de uma tabela antiga com preservação dos pagamentos e aplicação repetida da migration; os 19 novos testes de interface exercitam os dois idiomas. As imagens de produção também passaram pelo teste HTTP com autenticação real por cookie, perfis de banco, cancelamento por Manager, recusa de Seller/perfil curinga, recibo cancelado e rota SPA. [Evidências](test-evidence/payment-history-docker-20261029.log.gz).
