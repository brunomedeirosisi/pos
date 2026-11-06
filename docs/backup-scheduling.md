# Backup automático diário / Daily automatic backup

Em **Backup e Restauração**, marque **Habilitar backup automático**, escolha o **Horário do backup automático** em **HH:mm (24 horas)** e pressione **Salvar**. O seletor permite digitação e escolha de hora/minuto, em PT-BR e EN. O fuso exibido vem da configuração de horário do banco da aplicação, independentemente do navegador ou do container da API. O próximo horário e o histórico usam esse mesmo fuso e datas DD/MM/YYYY.

O recurso inicia **desabilitado**, com sugestão de **03:00**. Só salvar habilita o agendamento. Habilitar ou mudar o horário seleciona a próxima ocorrência futura; salvar sem mudar o horário não descarta uma ocorrência pendente. Desabilitar impede novos backups automáticos, mantém o horário escolhido e deixa uma execução já iniciada terminar. Backups manuais continuam disponíveis.

Se o servidor ficar desligado, uma única execução pendente acontece quando ele voltar; vários dias perdidos não geram uma fila de backups repetidos. Falhas são registradas e o próximo horário diário continua ativo. Uma falha de armazenamento não provoca tentativas ilimitadas no mesmo horário. Se um backup manual ou uma restauração estiver ocupando o mecanismo, a ocorrência permanece pendente e é tentada novamente após a liberação.

A última execução e o **Histórico de execuções de backup** mostram horário, origem (manual, automática ou sistema), estado em execução/concluído/falhou, arquivo e erros. O histórico é paginado com os controles existentes. A lista de arquivos também identifica a origem e atualiza enquanto a página está aberta. Um arquivo antigo pode ter sido removido pela retenção e continuar no histórico de execuções.

## Permissões e persistência

- Consultar: `system:backup:read`.
- Alterar o agendamento: **`system:backup:schedule`** ou `*`. O Admin existente já possui `*`. Outros perfis podem receber a permissão em **Perfis**, junto com acesso de leitura aos backups. A permissão de criar backup manual, por si só, não permite alterar o agendamento.
- As alterações são validadas e auditadas como `BACKUP_SCHEDULE_UPDATED`, com ator e preferências anteriores/novas. A configuração é compartilhada entre usuários/instâncias e persiste em PostgreSQL, não no navegador.
- Configuração e recibos de execução automática ficam no esquema durável `pos_recovery`, inicializado de forma idempotente e serializada. São preferências **da instalação**: permanecem após logout, restart e restauração dos dados de negócio. Esse esquema já é excluído dos arquivos de restauração. Uma instalação nova começa desabilitada, mesmo ao importar um backup de outra instalação. Não é necessário alterar seeds nem permissões de perfis existentes.

## Execução e concorrência

O servidor inicia o agendador após preparar o controle de recuperação e as migrações. Um ciclo assíncrono, sem sobreposição, consulta o relógio do banco a cada **15 segundos**. A execução acontece no horário configurado ou no primeiro ciclo disponível depois dele. Não depende de sessão, navegador, serviço de cron do host ou nova dependência npm. O antigo temporizador de 24 horas do supervisor Windows foi removido para não ignorar a desativação ou produzir dois agendamentos; distribua o pacote de instalador atualizado junto com as imagens. Backups obrigatórios na instalação/atualização e o diagnóstico manual continuam disponíveis.

Cada execução adquire a leitura de recuperação e o **mesmo advisory lock de sessão dos backups manuais**, que permanece mantido durante criação, publicação, réplica, catalogação e retenção. A escolha da ocorrência e o avanço do próximo horário são transacionais; `scheduled_for` é único. Duas instâncias não criam o mesmo backup simultaneamente. A preferência é bloqueada durante a reserva, permitindo desabilitar sem esperar o arquivo ser gerado. Perder a conexão dos locks aborta a criação.

O agendador reutiliza `createManagedBackup`, com ator de sistema nulo e origem `automatic`; não simula um usuário conectado. São preservados preflight, limite de tempo, espaço livre mínimo, publicação atômica, checksum, réplica e retenção. Backups automáticos não recebem políticas de armazenamento menos restritivas que os manuais.

Após interrupção, o próximo dono do lock reconcilia execuções abertas: um arquivo já publicado/catalogado com o mesmo identificador de execução comprova conclusão; sem esse comprovante, a execução é marcada como interrompida/falhou. Não se recria cegamente o mesmo arquivo. O próximo horário diário continua preservado. O agendador respeita a manutenção e o bloqueio de recuperação da restauração existente.

Os horários são calculados como dias de calendário no fuso do banco, incluindo mudanças de horário de verão; não são intervalos fixos de 24 horas. Os detalhes seguem os mecanismos nativos de [datas e fusos do PostgreSQL](https://www.postgresql.org/docs/current/functions-datetime.html) e [advisory locks de sessão](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS).

## Contratos e validação

- `GET /api/v1/admin/backup/schedule`: `enabled`, `time`, `timezone`, `nextRunAt`, `updatedAt`, `lastRun`.
- `PATCH /api/v1/admin/backup/schedule`: `{ "enabled": true, "time": "03:00" }`. Ambos obrigatórios; boolean real e horário estrito de `00:00` a `23:59`. Segundos, AM/PM, campos extras e alteração de fuso pelo cliente são rejeitados.
- `GET /api/v1/lists/backup-executions`: contrato de paginação existente, contendo execuções manuais/sistema do journal existente e automáticas do journal durável, sem duplicá-las. Estados: `running`, `completed`, `failed`.

Testes Docker cobrem permissões, validação, persistência entre sessões, edição/desativação, retomada única, concorrência entre workers e com backup/restauração, falha e continuidade, recuperação de execução interrompida, fuso e DST, seletor e feedback em PT-BR/EN. A imagem final executa `pg_dump`, checksum e réplica reais em banco descartável e verifica que restauração preserva configuração e histórico. [Evidência dos testes](test-evidence/backup-schedule-docker-20261030.log.gz).

## English

Enable **Automatic backup** in Backup & Restore, choose a 24-hour **HH:mm** time, then save. The displayed store time zone comes from PostgreSQL. Scheduling starts disabled and requires `system:backup:schedule` (or `*`); manual backup permission alone is insufficient. Read-only operators can monitor the schedule and execution history.

Preferences persist across logout/restarts and remain installation-specific when business data is restored. The server checks every 15 seconds, coalesces missed days into one catch-up run, prevents concurrent/duplicate executions, and reuses the existing managed backup, replica and retention controls. Disabling prevents new automatic runs while an active run finishes. Failed/interrupted runs remain visible and future daily runs continue.
