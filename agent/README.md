# Agente de impressão Windows

## Modo instalado na loja: fila de saída HTTPS

O instalador usa `src/pull-agent.mjs`. O worker não abre porta: consulta a API por HTTPS com token exclusivo da loja, busca um trabalho por vez, registra journal local e envia o recibo para `Out-Printer`. O supervisor fornece token pelo ambiente e CA pelo `NODE_EXTRA_CA_CERTS`. Não execute o stub HTTP neste cenário.

`POS_AGENT_CONFIG` aponta para JSON com `serverUrl`, `printerName`, `journalDirectory` absoluto, `printTimeoutMs` e `stopFile`. `PRINT_AGENT_TOKEN` deve ser fornecido pelo supervisor; o backend guarda seu SHA256. O runtime Windows vem no pacote e não exige npm.

`submitted` significa que o comando do spooler terminou com sucesso; não confirma saída física. Falha/interrupção depois da fronteira de envio produz `uncertain`. O journal permite reenviar a confirmação sem imprimir novamente. Nunca apague journal/estado de fila para forçar repetição. Arquivos reconhecidos ficam em `acknowledged` para diagnóstico; não contêm texto do recibo, mas são confidenciais. A aplicação ainda não oferece retenção automática desses registros.

Configuração e operação completas: [guia de uso](../docs/instalacao/USO.md), [guia técnico](../docs/instalacao/TECNICO.md) e [homologação](../docs/instalacao/HOMOLOGACAO.md).

Testes sem impressora física: `node --test test/pull-agent.test.mjs` ou a suíte Docker da raiz. A integração real de loja é exercitada por `infra/installer/test-store.mjs`, com saída simulada e HTTPS real.

## Modo anterior: stub HTTP local

O texto abaixo descreve somente o modo de desenvolvimento `PRINT_MODE=direct`. Abrir a porta 9222 para a LAN não faz parte da instalação suportada.

# POS Agent (Local Peripherals Stub)

- Exposes `POST http://127.0.0.1:9222/print`.
- Receives matrix-friendly sales receipts in plain text from the API.
- Intended target printer: `Epson LX-300+`.
- On Windows hosts, the stub now sends the text to the installed printer through PowerShell `Out-Printer`.

## Expected payload

```json
{
  "job_type": "sale-receipt",
  "printer_model": "Epson LX-300+",
  "mode": "text",
  "copies": 1,
  "locale": "pt-BR",
  "receipt_code": "REC-1234ABCD",
  "sale_id": "uuid",
  "content": "plain text receipt..."
}
```

`content` is already formatted for dot-matrix printing. The default handler prints through the Windows spooler; if you need raw ESC/P, serial, or network socket output, replace the handler with your preferred transport.

## Environment

```env
PRINT_AGENT_TARGET_PRINTER=Epson LX-300+
PRINT_AGENT_JOB_TIMEOUT_MS=15000
```

If your Windows printer queue uses a different display name, set `PRINT_AGENT_TARGET_PRINTER` accordingly before starting the agent.

## Run
```bash
npm i
npm start
```
