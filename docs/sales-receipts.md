# Sales Receipt Printing

This feature adds receipt printing and reprinting for completed sales, with a layout prepared for dot-matrix printers such as the **Epson LX-300+**.

## What the system does

- At the end of checkout, the POS now asks for:
  - payment method
  - amount paid
  - change (calculated automatically)
- The API recalculates the official sale prices and totals from the product catalog before saving:
  - `cash` prefers `price_cash`
  - `card`, `bank`, `other`, `credit`, and `credit_with_entry` prefer `price_base` with fallback to `price_cash`
- Client-submitted subtotal/total/change values are treated as checkout previews and normalized on the server.
- The order number field is optional and blank/null values are ignored safely by the API.
- After the sale is saved, the user can:
  - print the receipt through the local print agent
  - open a printable text-only receipt
  - continue the flow without printing
- Reprinting is available from:
  - sale details
  - sales history

## Backend endpoints

- `GET /api/v1/sales/{id}/receipt`
  - Optional query: `locale=pt-BR|en`
  - Returns company header, sale/customer/item/payment info, and `plain_text` with a matrix-friendly receipt body.
- `POST /api/v1/sales/{id}/receipt/print`
  - Optional body: `locale`, `copies`
  - Sends the plain-text receipt to the configured local print agent.

## Stored sale data

The sale model now persists:

- `paid_at`
- `payment_method`
- `amount_paid`
- `change_amount`
- normalized catalog-backed `subtotal`, `discount`, and `total`
- aggregated stock movements per product in `stock_movement` linked by `sale_id`

This allows the original receipt content to be reprinted later without recalculating payment values.

## Stock synchronization

- When a sale is completed, the backend writes one aggregated `stock_movement` row per sold product with:
  - `sale_id` set to the persisted sale
  - `type = 'venda'`
- When a sale is cancelled, the backend writes the reverse movement with:
  - the same `sale_id`
  - `type = 'entrada'`
- This keeps product stock and the dashboard critical-stock widget aligned with the sales flow.

## Printer integration

The API talks to a host-level agent, not directly to the browser printer dialog.

Required env vars:

```env
PRINT_AGENT_URL=http://host.docker.internal:9222/print
PRINT_AGENT_TIMEOUT_MS=8000
```

The default Docker Compose configuration already points the API container to `host.docker.internal`, so on Docker Desktop the flow is:

1. Run the web stack with `docker compose up --build`
2. Run the agent on the Windows host:

```bash
cd agent
npm i
npm start
```

3. Wire the stub handler to the Epson LX-300+ port/driver that your store uses

## Error handling

- If printing fails, the sale remains completed.
- The UI shows the error returned by the API/agent.
- The user can retry from the completion modal, the sale detail page, or the sales history.

## Layout decisions for Epson LX-300+

- Text-only output
- Monospace receipt body
- Visual separators with hyphen lines
- Compact columns for quantity, unit price, and line total
- No images or color dependency in the printable receipt


## Impressão compartilhada no instalador Windows

O release de loja usa `PRINT_MODE=queue`. `POST /api/v1/sales/:id/receipt/print` exige `request_id` UUID da ação e retorna HTTP202 com `job_id`, `status` e `requested_at` para trabalhos pendentes. Não retorna `printed_at` para trabalho enfileirado. Reenvios do mesmo UUID e parâmetros consultam o mesmo trabalho; nova ação explícita usa novo UUID. UUID reutilizado com parâmetros diferentes retorna409.

A tela de detalhes acompanha a fila e diferencia espera, envio ao Windows e resultado incerto. `GET /api/v1/print-jobs/sale/:id` exige `sales:read` e não expõe conteúdo/token. O agente usa credencial própria nas rotas `/api/v1/print-agent`; nenhum listener de impressora é publicado. Recibos são instantâneos imutáveis no enfileiramento; limites de cópias, tamanho, lease e capacidade são aplicados na API.

Detalhes do contrato/estados/recuperação: [documentação técnica](instalacao/TECNICO.md). Operação em dois caixas e conferência antes de reimprimir: [guia de uso](instalacao/USO.md).


## Impressora por caixa (1.0.0-store.2)

No modo queue, printer_id seleciona um destino habilitado (principal por omissão para clientes legados). A chave idempotente inclui esse destino: mudar printer_id com o mesmo request_id retorna409. Histórico/resposta incluem printer_id e printer_name. Cada agente autentica x-print-printer-id junto com seu token exclusivo e só recebe/confirma trabalhos desse destino.

O atalho configura o padrão da loja/navegador antes do login; PDV e detalhes permitem troca explícita. Offline permanece na fila escolhida, enquanto destino revogado bloqueia novo pedido. Uma nova via em outra impressora não cancela o trabalho anterior; confira papel/fila antes de reemitir.

Pareamento autorizado, manutenção e diagnóstico: [IMPRESSORAS.md](instalacao/IMPRESSORAS.md). Contratos: backend/openapi/openapi.yaml. Evidências: [registro da evolução](technical-audit/24-impressoras-por-caixa.md).
