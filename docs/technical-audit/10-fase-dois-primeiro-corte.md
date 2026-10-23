# Fase 2 — Primeiro corte: isolamento da importação

Data: **22/10/2026**. Tarefa: **TSK-019 / TEC-019**. A fase 2 foi iniciada por solicitação do usuário. Este registro descreve o corte implementado; a fase completa continua em andamento.

## 1. Escopo e dependências

O primeiro corte da [fase 1](08-fase-um-primeiro-corte.md) está implementado; journal independente, proteção de alvo/snapshot, manutenção/cutover e resultados da UI continuam pendentes. A TSK-019 admite validação isolada sem dependência técnica obrigatória. Por isso foi iniciada agora, conservando `ENABLE_LEGACY_OVERWRITE=false` e `ENABLE_DATABASE_RESTORE=false`. Isso não autoriza substituir dados ou executar restore na aplicação.

## 2. Comportamento implementado

- Cada tentativa adquire um advisory lock global PostgreSQL (`20261022`) em conexão dedicada. A preparação dos arquivos, staging, publicações, checkpoints e status ficam sob esse lock. Contenção espera sem gastar uma tentativa do BullMQ; `concurrency: 1` continua como limite local adicional.
- Todas as consultas e transações de processamento usam a própria conexão que mantém o lock. A perda dessa sessão interrompe suas escritas e o PostgreSQL desfaz a transação aberta; a próxima etapa não passa para outra conexão do pool. Conexão perdida ou com unlock malsucedido é descartada.
- A cada tentativa, o staging inteiro é limpo e seus checkpoints de carga são descartados na mesma transação. Os DBFs da sessão são relidos, inclusive quando a tentativa anterior concluiu a carga. Arquivo opcional ausente deixa sua tabela vazia. Assim, A não reutiliza staging de B depois de backoff/restart.
- Checkpoints de publicação concluída permanecem: retomar a mesma sessão não reaplica pagamentos/movimentos já confirmados. Checkpoint e escrita de domínio continuam na mesma transação. Falha no log posterior ao commit não reclassifica o checkpoint como falho.
- Redelivery de uma importação já concluída é ignorada sob lock. A reconciliação de status no startup também adquire o lock antes de reclassificar registros `running`, evitando fazê-lo durante uma execução de outra instância.

Não há migração de schema, nova variável de ambiente ou alteração do contrato HTTP neste corte. As tabelas `stg_*` continuam compartilhadas; a estratégia escolhida é serialização global com reconstrução por tentativa, conforme a contenção prevista no roadmap.

## 3. Validação reproduzível

```powershell
node infra/test-disposable.mjs --images --backups
```

Requer Node/npm definidos no repositório, Docker e, quando necessário, `NPM_CLI` apontando para o CLI do npm. O harness usa apenas o projeto fixo `pos-phase0-tests`, PostgreSQL/Redis descartáveis e portas dinâmicas em loopback. Os testes geram DBFs sintéticos mínimos em diretórios temporários; não alteram `POS-DATA`.

Cinco testes novos usam PostgreSQL real; quatro invocam o processador em processos Node independentes, pelo mesmo ponto de entrada usado pelo worker BullMQ:

1. A é bloqueada em publicação por uma barreira SQL; B deve esperar antes de criar checkpoints ou substituir o staging. Após liberação, ambas publicam somente sua massa.
2. Um processo A é encerrado após confirmar pagamentos e durante a transação de estoque. B executa; outro processo retoma A. Cada cliente mantém um pagamento de R$ 7,50 e cada produto um movimento, sem repetir o pagamento confirmado. Redelivery de A concluída também preserva os totais.
3. Uma sessão sem `MOV_EST.DBF` deixa o staging de estoque vazio, sem reaplicar movimentos da sessão anterior.
4. Uma falha SQL injetada no log posterior ao commit de pagamentos conserva o checkpoint `completed`; a retomada não duplica o pagamento.
5. Encerrar a conexão do lock durante uma transação desfaz sua escrita e libera o lock para a próxima operação.

**Contraprova:** o cenário 2 foi executado contra o worker anterior a este corte, expondo somente seu processador ao teste. Falhou na asserção de estoque de A: esperado 1, recebido 0. A fonte corrigida foi restaurada em `finally`; o projeto descartável separado `pos-phase2-regression-proof` foi removido. Isso confirma que a regressão cobre o defeito original, além dos testes positivos.

As fixtures exercitam cadastro, pagamentos e estoque; vendas/pedidos estão presentes como DBFs vazios. Não representam o ensaio completo de importação financeira, duplicatas legítimas ou overwrite. A fila Redis conserva seu smoke existente; estes testes não simulam durabilidade/reconciliação de despacho do BullMQ.

Resultados e hashes desta entrega: [evidências](11-evidencias-fase-dois.json).

## 4. Operação e reversão

Uma instância com importação ativa mantém uma conexão dedicada; instâncias que aguardam também ocupam uma conexão enquanto tentam o lock a cada 250 ms. Dimensionar pool/instâncias antes de habilitar concorrência operacional. A reconstrução do staging aumenta o trabalho de leitura em retries; nenhuma meta de throughput foi inferida destes testes.

Qualquer futura implantação deste corte deve parar/drenar todos os workers antigos antes de admitir novas importações: versões anteriores não respeitam o novo lock. Manter arquivos das sessões e checkpoints; não apagar checkpoints de publicação para forçar retry. Em reversão de aplicação, parar workers e limitar o processamento a uma instância; a versão anterior volta a apresentar o defeito de retomada com staging de outra sessão. Não há DDL para reverter.

Os testes encerram processos para simular falha. Shutdown coordenado, timeout de inicialização, readiness e durabilidade dos insumos ainda pertencem à TSK-020. O startup agora pode aguardar uma importação de outra instância antes de reconciliar os status; esse comportamento não é uma solução completa de readiness.

Nenhum banco de desenvolvimento do usuário foi migrado ou restaurado. Não houve commit, push ou deploy. Segredos locais, DBFs existentes e trabalho prévio do workspace foram preservados.

## 5. Próximos cortes

| Tarefa | Estado |
|---|---|
| TSK-019 — isolamento | Contenção implementada e validada; staging por sessão permanece uma evolução opcional se houver necessidade de paralelismo. |
| TSK-004 — publicação segura | Pendente. Concluir gates de recuperação da fase 1, delimitar escopo de overwrite, validar massa e preservar snapshot independente antes da publicação. |
| TSK-018 — identidade de origem | Pendente. Mesma fixture importada em outra sessão ainda pode duplicar pagamentos/movimentos; definir duplicatas legítimas e merge antes de impor unicidade ou corrigir histórico. |
| TSK-020 — durabilidade e ciclo de jobs | Pendente. Persistir arquivos/Redis, reconciliar despacho e coordenar startup/readiness/shutdown. |

O bloqueio de overwrite permanece. As decisões do usuário sobre crédito, cliente inativo, estoque negativo, margem, cancelamento e topologia de impressão estão preservadas para os cortes correspondentes.
