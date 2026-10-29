# Backup e restauração / Backup and restore

Atualizado em 29/10/2026. O fluxo de restauração de backups nativos foi validado em Docker, incluindo rollback e recuperação de uma operação interrompida. Os padrões de instalação continuam conservadores: `ENABLE_DATABASE_RESTORE=false`.

## Disponibilidade e operação

A mensagem `database_restore_disabled_pending_recovery_validation` indicava que o servidor estava com a restauração desativada; não era falta de permissão do Admin nem corrupção do ZIP. A interface agora consulta `GET /api/v1/admin/restore/options`, protegido por `system:backup:restore`, e explica o bloqueio em PT-BR/EN antes de permitir envio ou restauração.

Depois de validar a recuperação neste ambiente, o responsável pode configurar `ENABLE_DATABASE_RESTORE=true` e recriar somente a API, preservando os volumes. Isso disponibiliza a ação; não executa uma restauração. Permissão, senha atual e confirmação explícita continuam obrigatórias. O instalador e `.env.example` mantêm o padrão desativado.

1. Pare as operações dos caixas e aguarde importações ou outras solicitações terminarem. Crie e confira uma cópia atual antes de escolher um ponto anterior.
2. Na tela de backups, selecione **Restaurar** em um backup existente ou envie uma cópia ZIP sem alterações, informe a senha do usuário conectado e confirme a substituição.
3. Aguarde a conclusão. Operações concorrentes impedem iniciar o cutover (`409`); durante a recuperação as demais solicitações recebem manutenção (`503`, `Retry-After: 5`). Não repita o envio enquanto a operação estiver em andamento.
4. Em sucesso, as sessões são revogadas. Entre novamente usando uma conta e a senha presentes no backup restaurado. A restauração substitui os dados atuais pelo ponto selecionado.
5. Em rollback, a tela informa que o banco anterior foi recuperado, mantém a sessão e mostra o identificador da operação e o arquivo de recuperação. HTTP 200 com `status=rolled_back` **não é sucesso da restauração solicitada**.

## Origem dos arquivos

A restauração pela aplicação aceita somente bytes cujo SHA-256 corresponde a um backup gerado por esta instalação. No primeiro início desta versão, o catálogo existente registra a procedência de backups nativos; registros de upload não estabelecem confiança. Uma cópia enviada novamente é aceita se o conteúdo for idêntico ao backup nativo conhecido, mesmo que o nome mude. Um ZIP estrangeiro, ou alterado, é recusado antes de executar SQL, inclusive na simulação. O checksum declarado dentro do arquivo não autentica sua origem.

Backups de outra instalação e arquivos cujo registro de procedência foi perdido exigem recuperação técnica em ambiente isolado e verificação explícita de origem. Não há botão para confiar em SQL arbitrário. O executor continua usando a identidade PostgreSQL configurada; a restrição a backups nativos verificados é obrigatória. A simulação não é uma sandbox para SQL externo.

## Sequência e preservação

A API adquire um advisory lock exclusivo de recuperação, e todas as solicitações que acessam a aplicação mantêm locks compartilhados até finalizar a resposta. O worker de importação e a reconciliação financeira usam um lock compartilhado na própria sessão de escrita. A restauração não inicia enquanto essas operações estão ativas. Geração, upload, download e exclusão continuam usando os componentes e permissões existentes; operações de arquivos e retenção também usam o lock dedicado de backup.

O fluxo verifica o checksum e a procedência, simula o restore em um banco temporário, valida tabelas/contagens/FKs e cria um snapshot íntegro do banco atual. Só então substitui `public`, em uma única chamada `psql --single-transaction` com parada em erro. Aplica as migrações pendentes e reconcilia o catálogo antes de liberar a manutenção. Em falha posterior ao cutover, restaura o snapshot automaticamente.

Enquanto há manutenção, jobs aguardam antes de entrar na sessão de escrita, sem consumir tentativas BullMQ. Importações pendentes presentes no ponto restaurado são encerradas como falhas; jobs antigos do Redis não podem reexecutá-las automaticamente. Revise os dados e submeta uma nova importação se necessário. O rollback preserva o estado anterior.

O schema `pos_recovery`, criado por `backend/sql/recovery.sql`, contém o journal, procedência dos arquivos, catálogo e fence de manutenção. Não tem FKs para usuários de `public` e é excluído de novos dumps por `--exclude-schema=pos_recovery`. Assim, restaurar um backup antigo não apaga a operação atual, sua identidade original nem o registro do snapshot. Alvo e snapshot de operações em andamento ou que exigem recuperação ficam protegidos contra retenção e exclusão. Arquivos excluídos localmente não reaparecem no catálogo ao restaurar um ponto anterior.

Na reinicialização, uma operação interrompida antes do cutover é encerrada sem substituir dados. Se o cutover pode ter começado, a API obtém os locks exclusivos e recupera o snapshot antes de iniciar atendimento e workers. Se não conseguir recuperar, permanece indisponível para diagnóstico; não remova manualmente o fence nem o snapshot para forçar a abertura.

## Armazenamento e diagnóstico

O Compose mantém `BACKUP_PATH=/var/backups/pos` em volume nomeado persistente. A imagem contém PostgreSQL client 16.15 e executa como `pos` (UID/GID 10001). Diretórios privados usam 0700 e arquivos novos, 0600. Não use `down --volumes` no projeto da aplicação.

`GET /api/v1/admin/backups/preflight` exige `system:backup:read` e verifica versões PostgreSQL, espaço, escrita/publicação exclusiva e réplica. A reserva padrão é 256 MiB e a retenção local padrão é 7 arquivos, além dos arquivos protegidos por operações de recuperação. Backups são ZIPs não criptografados com `backup.sql` e `backup.json`.

Para segunda cópia, use [o overlay de réplica](../infra/docker-compose.backup-replica.yml) com um mount externo já provisionado. `BACKUP_REQUIRE_REPLICA=true` impede confirmar gerações sem réplica verificada. A aplicação não prova que um destino está fora do host e não exclui réplicas quando remove arquivos locais. Defina proteção de acesso, capacidade e retenção externa.

O journal atual está em `pos_recovery.operation`, com `id`, `actor_id`, `status`, `stage`, nomes dos arquivos e detalhes. `pos_recovery.state` indica manutenção persistente. Os registros históricos de geração/retenção em `public.system_backup_operation` continuam disponíveis, mas não são a fonte de estado da restauração atual. Em recuperação obrigatória, preserve banco, ambos os schemas, volumes, arquivos, manifestos e configuração e consulte o responsável técnico.

O journal e o banco principal compartilham o servidor PostgreSQL: essa proteção cobre substituição de `public` e interrupção do processo, não perda física do host/volume. Uma instalação perdida exige cópias externas e recuperação técnica. Os testes não definem RPO/RTO de produção.

## Validação Docker

Procedimento e comandos: [testing-docker.md](testing-docker.md#restore-validation). O runner [restore-image-check.mjs](../infra/restore-image-check.mjs) recusa qualquer banco/usuário que não seja o fixture descartável. Exercita senha/confirmação, concorrência, origem não verificada, atomicidade SQL, restore HTTP real, revogação de sessões, catálogo/journal, rollback após falha e retomada de operação interrompida. Testes de interface cobrem PT-BR e EN.

Em 29/10/2026, uma cópia privada do backup recente desta instalação também foi restaurada em banco descartável: 104.879 vendas, 190.715 itens, 138.782 pagamentos e 3.395 saldos legados, sem divergência financeira. Nenhuma restauração foi executada no banco operacional para esse ensaio. Os arquivos reais e relatórios privados ficam fora do Git; a evidência versionada contém apenas resultados agregados.

Evidência: [509 testes, checks e ensaios Docker](test-evidence/database-restore-docker-20261029.log.gz), além de oito verificações do runner de restauração. Lint, regras, tipos e builds passaram; não houve alteração de seed.

## English operator notes

Restoration is disabled by default and requires `ENABLE_DATABASE_RESTORE=true`, restore permission, the current password and explicit confirmation. Only unchanged copies of backups generated by this installation are accepted. Wait for active requests/imports to finish; other requests receive maintenance responses during recovery.

A successful restoration replaces current data and revokes sessions: sign in again with an account from the restored backup. A rollback preserves the previous database and is shown as a failed restoration with an operation reference and recovery filename. Pending imports from the restored point are stopped and require a new explicit submission.

The durable recovery journal and maintenance fence live outside `public`. If a process is interrupted during cutover, startup recovers the snapshot before admitting work. If recovery cannot finish, preserve all volumes/files and request technical recovery; do not clear the fence manually. Foreign backups or disaster recovery after loss of provenance require an isolated, supervised procedure.
