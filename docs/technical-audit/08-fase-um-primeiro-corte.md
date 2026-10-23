# Fase 1 — Primeiro corte: backup executável, durável e coordenado

Data: **21/10/2026**. Autorização: solicitação do usuário para iniciar a fase 1 após a fase zero. Base Git `ac85924e7a94e836805e770c60db8141c783bca6` com alterações locais preexistentes, incluindo a fase zero. Nenhum commit, push, deploy ou migração foi executado na aplicação de desenvolvimento do usuário.

## Escopo entregue

| Tarefa | Estado neste corte | Entrega |
|---|---|---|
| TSK-002 | Implementação e aceite técnico em ambiente descartável; destino externo real ainda depende de infraestrutura. | PostgreSQL client 16.15 na imagem final; UID/GID 10001; volume persistente; preflight; reserva de espaço; ZIP com nome único, publicação exclusiva e manifesto SHA-256; cópia verificável em destino configurado. |
| TSK-008 | Coordenação das operações de arquivo implementada e validada. | PoolClient reservado do início ao fim, mesmo PID na aquisição/liberação, desbloqueio conferido, conexão descartada em falha e cancelamento sinalizado na perda. Criação/upload/delete/retenção usam o mesmo lock. Pool mínimo de duas conexões. |
| TSK-009 | Próximo corte; somente base de manifestos entregue. | Journal e catálogo continuam no schema public; ainda falta reconciliá-los a partir do armazenamento e desacoplar a identidade histórica. |
| TSK-010 | Pendente. | Retenção durante o pre-restore suspensa como contenção; pinning persistente de alvo/snapshot ainda não implementado. |
| TSK-003 | Pendente e restore da aplicação bloqueado por padrão. | Manutenção, drenagem, executor confiável, privilégios e cutover serão feitos após os gates anteriores. |
| TSK-011 | Pendente. | A apresentação completa de ok/rolled_back/falha será corrigida nos dois fluxos da UI. |

Este é o início da fase 1, não sua conclusão. Formato ZIP e leitura de backups antigos foram preservados. A restauração usada para validação cria bancos temporários com massa própria sintética; não substitui o banco da aplicação.

## Verificações

- Backend: **112 testes passaram**, lint, typecheck e build aprovados.
- Frontend: **37 testes passaram** e typecheck aprovado; imagem construída pelo harness.
- Agente: **1 teste passou**, typecheck aprovado, sem impressão física.
- PostgreSQL/Redis: **14 testes de integração passaram**, incluindo disputa de lock, pool ocupado, liberação após erro e término da conexão proprietária.
- Regressões: **2 contenções passaram**; as **2 falhas financeiras esperadas** da fase 3 permanecem explícitas.
- Total das suítes: **166 testes passaram e 2 falhas esperadas conhecidas**. Os ensaios adicionais da imagem estão registrados separadamente na evidência JSON.
- Imagem final sem root: pg_dump/psql 16.15, backup HTTP, cópia verificada, upload/exclusão, restore sintético e preservação após recriar a API.
- Falhas exercitadas: diretório somente leitura, reserva insuficiente, checksum de réplica inválido, réplica sem permissão, falta real de espaço em tmpfs de 1 MiB e backup maior que o budget configurado de restauração. Nenhum ZIP incompleto reconhecido como concluído nesses casos.
- Conflitos entre processos: criação, upload, exclusão e retenção recusados enquanto a sessão de teste possui o lock.
- Compose principal/overlay e contrato OpenAPI verificados. CI passa a executar `--images --backups`; a execução remota dependerá de um futuro push.

[Evidências reproduzíveis](09-evidencias-fase-um.json) registram checks, versões, hashes, contagens e tempos observados. As medições de dump e simulação correspondem à pequena fixture e não são RPO/RTO de cutover nem SLOs. O ensaio recupera dois usuários, um cliente, um produto, uma venda, um item e um movimento, além das relações do schema; uma inclusão posterior no banco de origem é preservada.

## Operação e adoção

O [runbook atualizado](../backup-restore-runbook.md) descreve preservação de arquivos anteriores antes da montagem do volume, permissões, preflight, cópia externa, retenção e reversão.

A configuração principal usa `/var/backups/pos`. A réplica é opcional em desenvolvimento; o overlay `infra/docker-compose.backup-replica.yml` exige um mount existente e torna sua confirmação obrigatória. Um caminho distinto não prova dispositivo fora do host: infraestrutura deve validar o destino real e sua retenção. A API remove arquivos/manifestos locais; a réplica tem política independente e não é apagada pela retenção local.

Se houver falha depois da publicação de um arquivo completo, ele é conservado mesmo que o catálogo não tenha sido atualizado. A reconciliação passa a ser o próximo incremento, na TSK-009. Não habilitar restore para corrigir divergência de catálogo.

## Reprodução

```powershell
$env:NPM_CLI = Join-Path (npm root -g) 'npm/bin/npm-cli.js'
node infra/test-disposable.mjs --images --backups
```

O projeto fixo `pos-phase0-tests` é descartável: somente seus containers/rede/volumes são recriados e removidos. O banco permanece restrito a `pos_phase0_test` e as portas são alocadas em loopback. Manifestos/lockfiles, segredos locais, dados sintéticos originais, fonte do agente e fluxos comerciais anteriores foram preservados fora do escopo de backup.

## Próximo incremento

TSK-009: journal e catálogo independentes do schema restaurado, recuperação de operações interrompidas e reconciliação dos arquivos com seus manifestos. Depois, proteção de alvo/snapshot, manutenção/cutover e resultado correto na UI. As flags de restore e overwrite continuam false por padrão.
