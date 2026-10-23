# Operação de backup e recuperação

Atualizado em 21/10/2026, no primeiro corte da fase 1. Registro e evidências: [fase 1](technical-audit/08-fase-um-primeiro-corte.md).

## Estado suportado

Geração, upload, download, exclusão local e retenção de backups têm coordenação por lock PostgreSQL em uma conexão dedicada. A imagem contém `pg_dump` e `psql` 16.15, executados pelo usuário `pos` (UID/GID 10001). O volume `backups` conserva arquivos após recriar a API.

**Restore da aplicação continua desabilitado por padrão.** O ensaio deste corte restaura somente arquivos gerados pela própria massa sintética em bancos temporários e os remove ao final. Não habilitar `ENABLE_DATABASE_RESTORE` antes de concluir journal independente, proteção de alvo/snapshot, manutenção/drenagem e validação do resultado na UI (TSK-009/010/003/011).

## Preparar armazenamento

O Compose principal fixa `BACKUP_PATH=/var/backups/pos` e monta o volume nomeado `backups` nesse local. O diretório pertence ao UID/GID 10001 e é criado com modo 0700; novos arquivos usam 0600. Backups novos mantêm o formato ZIP com `backup.sql` e `backup.json`; o nome incorpora UUID para evitar colisões no mesmo segundo. Arquivos antigos continuam legíveis.

Antes de recriar uma API antiga, verificar se existem arquivos no `BACKUP_PATH` anterior. Copiá-los enquanto o container anterior ainda existe, conferir seus hashes e transferi-los ao volume definitivo com a propriedade correta. Preservar a cópia e o container anterior até confirmar listagem, download/checksum e ensaio de recuperação. Uma montagem nova pode ocultar arquivos existentes no filesystem do container. A implementação não executou essa migração nem recriou a aplicação de desenvolvimento do usuário.

A reserva padrão é `BACKUP_MIN_FREE_BYTES=268435456` (256 MiB); retenção local padrão `BACKUP_RETENTION_COUNT=7`. Dimensionar a capacidade para os arquivos retidos, o SQL e ZIP temporários da maior operação e a reserva. A verificação inicial não impede que outro processo consuma espaço depois; falhas de escrita impedem concluir a geração e removem seus temporários. A criação também recusa conteúdo maior que os budgets de extração configurados, para não reconhecer como válido um backup que a própria política recusaria restaurar.

A publicação de novos arquivos completos usa hardlink exclusivo no mesmo filesystem, após sincronizar o arquivo. O preflight verifica essa capacidade. O volume de teste comprovou falta real de espaço (`ENOSPC`) sem publicação de ZIP parcial. O teste não comprova tolerância a perda física do host ou do armazenamento.

## Configurar segunda cópia

Durante desenvolvimento, a réplica é opcional. Em qualquer ambiente que dependa de recuperação, provisionar e validar um destino externo antes de considerar o backup operacionalmente aceito. O overlay exige um caminho existente e não cria automaticamente o diretório no host:

```powershell
$env:BACKUP_REPLICA_HOST_PATH = 'CAMINHO_ABSOLUTO_DO_MOUNT_EXTERNO_EXISTENTE'
docker compose -f docker-compose.yml -f infra/docker-compose.backup-replica.yml config --quiet
```

Após provisionamento e preservação dos arquivos anteriores, usar esses mesmos dois arquivos Compose para atualizar a aplicação. O overlay monta o destino em `/var/backups/replica` e configura `BACKUP_REQUIRE_REPLICA=true`. O processo precisa de acesso pelo UID/GID 10001 e suporte a publicação exclusiva. O caminho deve ficar fora da árvore primária. O preflight verifica permissões, espaço e capacidade de publicação; **não identifica se o dispositivo realmente está fora do host**. Infraestrutura deve verificar o mount e o acesso a partir do ambiente de recuperação.

A segunda cópia é feita com arquivo temporário, SHA-256 conferido e manifesto. Com réplica configurada, sua falha impede confirmar a operação. Um arquivo local completo pode permanecer mesmo se a cópia ou o registro posterior falhar; o próximo corte implementará reconciliação do catálogo. Conservar esse arquivo para recuperação e diagnóstico.

Retenção e exclusão pela API atuam na cópia local e em seu manifesto. Não apagam a réplica. Definir capacidade, retenção e proteção do destino externo independentemente da aplicação. O ensaio usa dois volumes locais descartáveis; não foi configurado um NAS/serviço externo real.

## Verificação prévia

`GET /api/v1/admin/backups/preflight` exige `system:backup:read` e sessão válida. Retorna 200 com versões, compatibilidade PostgreSQL 16, bytes livres, capacidade de escrita/publicação, retenção e estado da réplica. Retorna 503 com `ready=false` se alguma verificação falhar. Não retorna senhas ou caminhos de arquivos.

A geração e o upload executam essa verificação antes de gravar o backup definitivo. PostgreSQL precisa de pool com ao menos duas conexões: uma para o lock e outra para consultas; o padrão permanece 10. Os limites de duração continuam em `BACKUP_OPERATION_TIMEOUT_MS` e `BACKUP_SIMULATION_TIMEOUT_MS`.

## Coordenação e evidência

Aquisição e liberação do advisory lock usam a mesma sessão. Conflito retorna 409 (`backup_operation_in_progress`). Sucesso/erro liberam o lock; falha de desbloqueio ou perda da conexão descartam a sessão do pool. A perda também sinaliza cancelamento da geração e dos subprocessos. Isso não substitui manutenção e drenagem de escritas para restore.

O ZIP gerado e seu manifesto contêm checksum/metadados. O catálogo `public.system_backup` e o journal `public.system_backup_operation` ainda pertencem ao alvo restaurável. Os manifestos são base para a TSK-009; não representam um journal independente concluído. Falha posterior à publicação pode exigir reconciliação manual neste corte. A retenção anterior ao restore foi suspensa para não excluir seu alvo enquanto a TSK-010 não entrega pinning persistente.

## Reproduzir o ensaio

Pré-requisitos: Node 24.21.0, npm 12.2.0 e Docker Compose. Com dependências backend instaladas pelo lockfile:

```powershell
$env:NPM_CLI = Join-Path (npm root -g) 'npm/bin/npm-cli.js'
node infra/test-disposable.mjs --images --backups
```

O harness recria somente o projeto `pos-phase0-tests`, com banco sintético, portas locais dinâmicas, volumes exclusivos e tmpfs de 1 MiB para provocar ENOSPC. Ele cria backups, verifica réplica/checksum, restaura linhas e relações em banco temporário, testa conflitos entre processos, recria a API e verifica catálogo/download/restore novamente. Ao final remove containers, rede e **volumes desse projeto de teste**. Não executar com dados de aplicação sob esse nome de projeto.

Para guardar as medições do ensaio, definir `BACKUP_TEST_EVIDENCE_PATH` com o caminho de um JSON de saída. Os dados são contagens, hashes, tamanhos e tempos; não incluem cookies ou senhas.

Recriar a API principal preserva seu volume nomeado. A opção `down --volumes` remove volumes e não deve integrar o procedimento de atualização da aplicação. Durante adoção ou reversão, conservar arquivos, metadados e as cópias verificadas; não substituir o volume por um diretório vazio.

## Próximos gates de recuperação

1. TSK-009: journal fora do schema substituído, identidade independente e catálogo reconciliável.
2. TSK-010: proteção persistente de alvo/snapshot contra retenção e exclusão, inclusive após interrupção.
3. TSK-003: executor confiável, privilégios separados, manutenção/drenagem e cutover recuperável com reconciliação.
4. TSK-011: UI distingue restaurado, revertido, falhou e timeout nos dois fluxos.

Somente o ensaio completo permitirá medir RPO/RTO de recuperação da aplicação e submetê-los ao responsável operacional. Tempos de dump/simulação em uma fixture pequena não são metas ou garantia de recuperação.

Referências primárias: [pg_dump 16](https://www.postgresql.org/docs/16/app-pgdump.html), [psql 16](https://www.postgresql.org/docs/16/app-psql.html) e [advisory locks por sessão](https://www.postgresql.org/docs/16/explicit-locking.html#ADVISORY-LOCKS).
