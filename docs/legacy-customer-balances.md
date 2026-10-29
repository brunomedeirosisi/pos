# Saldo oficial de clientes na importação legada

O saldo de referência é **`CLIENTES.DBF.DEBITO`**. O histórico de vendas, pedidos e pagamentos continua disponível, mas sua soma não substitui esse saldo oficial quando as informações divergem. O importador anterior ignorava `DEBITO` e somava todos os documentos vinculados ao cliente, menos os recebimentos. Esse histórico pode conter origens sobrepostas e informações insuficientes para reproduzir o saldo do sistema original.

## Regra financeira

```text
saldo do histórico legado = vendas/pedidos legados concluídos - entradas dessas vendas - recebimentos legados ativos
ajuste de reconciliação = CLIENTES.DBF.DEBITO - saldo do histórico legado
saldo atual = compras concluídas - valores pagos + ajuste de reconciliação
```

O ajuste é separado dos documentos: **não é um pagamento recebido**. Nenhuma venda ou cobrança é alterada para forçar coincidência. A comparação usa somente operações com `sale.source` em `VENDAS`/`PEDIDOS` e `customer_payment.source=legacy`; assim, operações novas conservam seu efeito. Por exemplo, um saldo oficial de R$ 500 cai para R$ 400 com um novo recebimento de R$ 100 e volta para R$ 500 se esse recebimento for cancelado.

Zeros e valores negativos são válidos; saldos credores são preservados. Antes de limpar ou publicar dados, o importador exige `DEBITO`, valores finitos representáveis em centavos e códigos de clientes preenchidos e únicos. Valores ausentes ou inválidos interrompem a operação em vez de assumir um saldo.

Depois de publicar documentos e estoque, a nova etapa `reconcile-customer-balances` concilia os clientes. O progresso passa a ter 16 etapas. O resumo e os relatórios CSV/JSON existentes passam a incluir clientes conferidos, SHA-256 do DBF, valores originais, histórico reconstruído e ajustes. A conferência exige coincidência com o saldo oficial; não exige que o ajuste seja zero.

## Persistência e interface

A migration `20261029_002_legacy_customer_balances.sql` cria `customer_legacy_balance`. Cada registro guarda cliente, importação, saldo oficial, valor reconstruído, ajuste, SHA-256 e data. A restrição SQL exige `source_balance = reconstructed_balance + adjustment`. Inclusões e alterações geram `LEGACY_CUSTOMER_BALANCE_RECONCILED` na mesma transação. Repetir a reconciliação com a mesma fonte não duplica ajustes ou auditorias.

A view `customer_financial_totals` aplica o ajuste uma única vez. Cadastro, relatórios, limite de recebimento e cancelamentos usam essa base. O bloqueio de cliente serializa reconciliação e recebimento; uma falha de auditoria reverte a transação inteira. Datas de recebimento permanecem dias de calendário, incluindo comparações de recibos do mesmo dia em outro fuso.

Os cartões existentes mostram **Saldo no sistema legado** e **Ajuste de reconciliação do legado**, em PT-BR e EN. Totais de compras e pagamentos continuam sendo os valores dos documentos originais. Clientes nativos sem uma reconciliação mantêm o cálculo normal. Os seeds não precisam mudar; fixtures DBF dos testes agora incluem `DEBITO`.

## Limites do histórico antigo

Avisos como `Sale …: product … not found` identificam linhas sem produto correspondente no pacote. O total do documento é preservado, embora aquela linha não possa ser publicada com vínculo a um produto. Os avisos continuam no relatório e não autorizam criar produtos ou pagamentos fictícios. A conferência de saldos não certifica recuperação integral dos itens históricos.

O saldo oficial também não informa quais documentos antigos continuam em aberto nem o saldo em cada pagamento passado. Por isso, `pending_amount` é `null` para documentos legados. Recibos antigos de clientes reconciliados retornam `previous_balance` e `new_balance` como `null`, com `historical_balance_unavailable=true`, e explicam essa limitação. Valores, datas e demais dados históricos permanecem consultáveis. Recebimentos novos usam o saldo reconciliado.

## Reparo de uma importação concluída

Não é necessário repetir a sobrescrita. A ferramenta administrativa `dist/scripts/reconcile-legacy-balances.js` aceita o DBF com seus auxiliares ou um pacote ZIP/ARJ e reutiliza a extração segura existente. O padrão é simulação, sem alteração de saldos. Exige a sessão da última importação concluída e os mesmos códigos de clientes do staging. O original deve ser montado como somente leitura e a pasta de relatórios deve ser privada:

```powershell
docker compose run --rm --no-deps -T `
  -v 'C:/Backups/legacy.arj:/input/legacy.arj:ro' `
  -v 'C:/Temp/pos-balance-review:/evidence' `
  api node dist/scripts/reconcile-legacy-balances.js `
  --source /input/legacy.arj --session '<sessionId>' --report /evidence/preview.json
```

Revise `records`: saldo oficial, histórico reconstruído, ajustes anterior/proposto e saldo projetado. O relatório contém dados financeiros e não deve ser versionado ou publicado. Relatórios existentes não são sobrescritos.

Para aplicar, use novo nome de relatório, `--apply` e o `sourceSha256` conferido na simulação:

```powershell
docker compose run --rm --no-deps -T `
  -v 'C:/Backups/legacy.arj:/input/legacy.arj:ro' `
  -v 'C:/Temp/pos-balance-review:/evidence' `
  api node dist/scripts/reconcile-legacy-balances.js `
  --source /input/legacy.arj --session '<sessionId>' --report /evidence/applied.json `
  --source-sha256 '<sourceSha256>' --apply
```

A ferramenta impede simultaneidade com importações, cria um backup gerenciado `pre-legacy-balance-reconciliation`, valida seu ZIP e checksum e grava ajustes e auditoria em transação. Depois confere os saldos projetados. Vendas, itens, pagamentos, estoque e valores originais não são substituídos. O fluxo normal de importação continua exigindo senha e confirmação; a ferramenta é administrativa, sem novo endpoint público.

## English operation notes

`CLIENTES.DBF.DEBITO` is authoritative. Imports validate that field and customer identity before resetting data, then reconcile every customer after publishing history. An auditable adjustment bridges the legacy ledger to the official source balance; it is not a payment. Subsequent purchases, receipts and cancellations retain their normal effect. Zero and credit balances are preserved. A shared financial view supplies all balance validation and read paths.

Missing-product warnings remain historical item-coverage discrepancies. The snapshot does not establish outstanding amounts per old document or before/after balances for old receipts, so those unknown values are nullable. PT-BR and EN show the source and adjustment separately using existing UI components.

The repair CLI defaults to preview. Applying requires the reviewed fingerprint and latest completed session, creates and validates a managed backup, locks import/customer operations and commits adjustments with audit entries. It preserves original transactions and avoids overwriting or reimporting them. See [Docker validation](testing-docker.md#authoritative-legacy-customer-balances-validation-2026-10-29).
