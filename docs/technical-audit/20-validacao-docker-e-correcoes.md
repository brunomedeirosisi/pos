# Validação Docker e correções encontradas

Data: **22/10/2026**. Continuação autorizada após o início da fase 6. Pedido: executar testes com Docker, corrigir os bugs encontrados e atualizar documentação/seed conforme necessário.

## Resultado

**290 testes passaram, sem falhas esperadas ou testes ignorados**, mais **16 controles de lint/seleção vazia**. O processo completo encerrou com código 0:

```powershell
node infra/test-disposable.mjs --docker --images --backups --seeds
```

| Suíte executada dentro de container | Testes aprovados |
|---|---:|
| Backend, unitários | 142 |
| Backend, integração com PostgreSQL/Redis | 69 |
| Backend, regressões financeiras/contenção | 4 |
| Frontend | 67 |
| Agente, HTTP em loopback | 1 |
| Medidor HTTP, controles estatísticos/isolamento | 7 |
| **Total** | **290** |

Também passaram lint, typechecks, builds, validação dos dois seeds, smoke das imagens e backup/restauração simulada com PostgreSQL real. Os 16 controles invocam falhas controladas da CLI; não são bugs do produto nem falhas da execução final. [Guia completo](../testing-docker.md), [evidência verificável](21-evidencias-validacao-docker.json) e [log completo comprimido](../test-evidence/docker-validation-20261022.log.gz).

## Bugs e correções

1. **Os testes do harness antigo rodavam no host.** O Docker era usado somente para PostgreSQL/Redis e imagens. O modo `--docker` agora constrói runners isolados para backend/frontend/agente com lockfiles, executa as suítes neles e não exige npm/dependências no host. O CI usa esse modo. As proteções existentes de banco/loopback foram preservadas pelo compartilhamento do namespace de rede descartável entre banco, Redis e runner do backend.
2. **Checkout aceitava pagamento ausente e finalizava venda sem quitação/cliente.** A primeira execução em Docker confirmou a regressão TSK-016 como falha esperada. Método e valor pago agora são obrigatórios, não nulos, sem quitação inferida. Há guard também no caso de uso antes de consultar o repositório. A regressão é normal obrigatória; quatro testes diretos e dezoito testes HTTP/PostgreSQL adicionais cobrem os caminhos, incluindo ausência/null, quitação dos quatro métodos à vista, troco, crédito identificado, entrada inválida, desconto integral e ausência de gravações em erros. O frontend e OpenAPI foram alinhados. Clientes antigos devem enviar os dois campos explicitamente; o PDV atual já enviava.
3. **Seed histórico tinha cabeçalho e itens incompatíveis e recebimentos superiores à dívida.** O cabeçalho foi corrigido de subtotal R$100/total R$90 para R$30/R$30, compatível com três itens de R$10. As vendas sintéticas agora registram crédito de cliente e pagamento inicial zero; 180.000 recebimentos de R$10 deixam saldo devedor total de R$1.800.000. O custo sintético foi explicitado em R$6. O seed rejeita banco/usuário diferentes do ambiente descartável. O seed da fase 6 já era consistente e foi preservado.

As fixtures dos testes anteriores foram atualizadas para incluir pagamento explícito. Os testes de precisão continuam enviando os demais campos válidos, para que a recusa seja causada pelo valor/quantidade sob teste, não pela ausência de pagamento.

## Seeds, imagens e recuperação

Ambos os seeds foram executados em PostgreSQL 16 descartável, com 120.000 vendas e 360.000 itens por fixture. A validação verificou zero cabeçalhos inconsistentes, saldo e contagens, recusa no banco errado e repetição. O seed atual recusa core preenchido sem alterar linhas; o histórico mantém as mesmas contagens/invariantes ao repetir. São fixtures para leitura, sem ledger completo de estoque; não são seed de estoque operacional. Os números históricos de performance continuam identificados como provenientes da fixture anterior.

A imagem atual da API e a imagem do frontend passaram health, autenticação de métricas, login por cookie, revogação de sessão e fallback SPA. O teste de recuperação usou pg_dump/psql 16.15, processo UID 10001, checksums/replicação, conflitos de lock e falhas de armazenamento. Restaurou a fixture sintética com suas 19 FKs e conferiu persistência e nova restauração após recriar a API. Os tempos da fixture minúscula não são RPO/RTO de operação.

## Preservação e limites

Foram usados apenas `pos-phase0-tests` e `pos-seed-tests`, com dados sintéticos e PostgreSQL em tmpfs. O Compose/dados da aplicação não foram selecionados. A inspeção final confirmou ausência de containers, volumes e redes desses projetos. Os arquivos locais de ambiente, DBFs/DBTs sintéticos, lockfiles e fontes do agente foram preservados; nenhuma dependência foi adicionada. Não houve commit, push ou deploy operacional.

Permanecem as limitações registradas no roadmap: crédito/inatividade de cliente, estoque não negativo, idempotência, reconciliação/cancelamento/reembolso, KPIs/histórico, recuperação coordenada, publicação/importação e demais controles ainda pendentes. Este ensaio não valida impressora física, topologia real, navegador/dispositivo de caixa, carga sustentada ou todas as regras financeiras. O build continua emitindo o aviso conhecido de bundle acima de 500 kB, tratado pela TSK-037; não é falha de teste. Não foram ampliadas portas de impressão.

A linha de base HTTP da fase 6 permanece como snapshot da fonte anterior. A correção de checkout e do seed altera seu fingerprint; este follow-up não executou nova carga de vazão e não atribui ao código novo os números antigos. Os documentos de fases anteriores e seus contadores permanecem como registros históricos; este registro atualiza o estado da TSK-016.
