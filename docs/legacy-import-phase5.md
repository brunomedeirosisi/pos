# Fase 5 - Importação Legada Robusta

A importação usa **`CLIENTES.DBF.DEBITO` como saldo oficial de clientes**, com validação antes da limpeza, ajuste auditável e a etapa `reconcile-customer-balances`. Consulte [a regra financeira e o reparo de importações concluídas](legacy-customer-balances.md). Produto histórico ausente continua sendo uma divergência de itens, separada da conferência dos saldos.

## O que mudou
- Fila de importação migrada para **Redis + BullMQ** (persistente).
- Retry automático configurável por ambiente e DLQ persistente.
- Checkpoints por etapa em `system_legacy_import_checkpoint`.
- Status operacional ampliado (`retry_count`, `current_stage`, `last_error_stage`, `last_heartbeat`).
- Relatório de reconciliação padronizado e versionado:
  - `reconciliation.v1.csv`
  - `reconciliation.v1.json`
  - `version: legacy-reconciliation/v1`
- Schema do fluxo legado movido para migration versionada:
  - `backend/sql/migrations/20260414_001_phase5_legacy_import_hardening.sql`

## Garantias operacionais
- Reinício de serviço não perde jobs:
  - jobs em Redis continuam disponíveis;
  - registros `running` são reclassificados para `retrying` no bootstrap e reenfileirados.
- Sem inconsistência parcial silenciosa:
  - cada etapa grava checkpoint (`running/completed/failed`);
  - etapas de escrita executam em transação por etapa;
  - em falha final, evento vai para DLQ e para `system_legacy_import_dead_letter`.

## Variáveis novas
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`, `REDIS_PASSWORD`
- `LEGACY_IMPORT_QUEUE_NAME`, `LEGACY_IMPORT_DLQ_NAME`
- `LEGACY_IMPORT_JOB_ATTEMPTS`, `LEGACY_IMPORT_JOB_BACKOFF_MS`

## Acompanhamento na aplicação (PT-BR e EN)

Na administração, abra **Importação de Dados Legados / Legacy Data Import**, selecione os arquivos, informe a frase de confirmação e a senha atual e execute a importação.

- Durante o envio e a validação, a tela mostra uma indicação de atividade. O envio não apresenta porcentagem, pois a API atual não informa bytes transmitidos.
- Após a aceitação, a sessão aparece como **Na fila / Queued**. O recebimento da solicitação não significa que a importação terminou.
- A tela consulta o status a cada cinco segundos, inclusive em uma aba em segundo plano quando o navegador permite. Mantenha a página aberta para acompanhar o resultado; fechar a página não cancela o trabalho no servidor.
- A barra conta etapas concluídas, não linhas processadas nem tempo restante. A lista mostra etapas aguardando, em andamento, concluídas ou com falha. A etapa atual vem do servidor; etapas futuras não são apresentadas como já executadas.
- **Aguardando nova tentativa / Waiting for retry** informa uma falha recuperável e a espera pelo retry automático. Os controles de envio e limpeza ficam bloqueados enquanto a sessão estiver na fila, processando ou aguardando retry.
- Uma falha na consulta do status exibe um aviso próprio, preserva o último progresso conhecido e mantém as consultas automáticas. **Consultar andamento agora / Check status now** permite tentar novamente. Isso não significa que a importação falhou; não reenvie os arquivos para tentar consultar o resultado.
- Ao terminar, a tela mantém o resultado e mostra uma notificação. O resumo apresenta quantidades por tipo de registro e o botão de download aparece quando o servidor informa que o relatório está disponível. Quantidades de cadastros representam registros processados e podem incluir atualizações de registros existentes.
- Divergências na reconciliação recebem um aviso visível, mesmo quando o processamento termina. Os detalhes e o CSV permitem investigá-las.
- Em falha definitiva, a tela informa que algumas etapas podem ter gravado dados e oferece detalhes do erro. O polling encerra ao receber `completed` ou `failed`. Antes de repetir a importação, revise o resultado e os checkpoints.
- Erros de envio permanecem visíveis até nova tentativa ou limpeza do formulário. Se não for possível confirmar o envio por um problema de conexão, consulte um administrador antes de reenviar: o servidor pode já ter recebido a solicitação.

O feedback usa o `ToastProvider`, as tabelas, os botões e os estilos existentes; a barra usa o elemento HTML acessível `progress`. Não foram criados componentes visuais compartilhados nem adicionadas dependências de produção ao frontend. Avisos, etapas, resumo e erros de interação têm traduções próprias nos dois idiomas. Logs e detalhes técnicos preservam as mensagens originais do servidor.

### English operation notes

The page shows upload activity, queue acceptance, the current server stage, completed stage counts and automatic retries. It checks status every five seconds until completion or final failure. Keep the page open to follow the result; closing it does not cancel the server job. The progress bar measures stages rather than rows, elapsed time or upload bytes.

Submission and reset stay disabled while the session is active. Status connection failures preserve the last known progress and allow both automatic and manual checks. They do not mean the import failed. Completion remains visible with a readable record summary, discrepancy warnings and a reconciliation download when available. Final failure warns that earlier stages may have committed data. Review details before resubmitting. Technical diagnostics retain the original server messages.

## Contrato e validação

`GET /api/v1/admin/import/legacy/{sessionId}/status` passa a incluir `stages`, a sequência ordenada de etapas do worker. A interface reutiliza `currentStage`, `retryCount`, `checkpoints`, `summary`, `error` e `reportAvailable` já existentes. A inclusão é aditiva, sem alteração dos dados importados, do schema ou dos seeds.

Testes de interface com React e jsdom cobrem ambos os idiomas, envio, fila, etapas reais, retry, bloqueio de reenvio, sucesso, divergências, falha definitiva, recuperação da consulta, download, limpeza e permissão. Os testes de integração usam PostgreSQL e DBFs sintéticos para verificar o contrato durante processamento, conclusão, retry e falha definitiva.

Execute as verificações em Docker conforme [o guia de testes](testing-docker.md). O jsdom é uma dependência apenas de desenvolvimento para exercitar o comportamento da página no ambiente de testes.

## Diagnóstico de recusa na importação (29/10/2026)

O container da aplicação registrou duas recusas HTTP 403 às 11:47:12 e 11:47:26 (America/Sao_Paulo). O usuário estava ativo, com perfil `admin` e permissão efetiva de importação. `ENABLE_LEGACY_OVERWRITE=false` mantinha a sobrescrita bloqueada; esse gate retorna `legacy_overwrite_disabled_pending_recovery_validation`, mesmo para Admin. A tela tratava qualquer 403 como falta de permissão. A mensagem agora diferencia essa configuração de uma recusa de autorização real, em PT-BR e EN. O gate permanece protegido.

O arquivo informado, `BACEST 4.zip`, foi identificado por leitura como **ARJ**, com assinatura `60 EA` e nome original `BACEST.ARJ`; ele não contém um diretório ZIP legível. A versão anterior aceitava apenas ZIP, e renomear um ARJ para `.zip` não convertia o formato. O suporte nativo a ARJ descrito abaixo resolve essa limitação e identifica o conteúdo desse pacote sem exigir conversão. Arquivos que não são ZIP/ARJ legíveis continuam sendo recusados antes da fila.

As requisições recusadas não criaram sessões de importação. O diagnóstico inicial usou leitura; a validação posterior extraiu somente DBF/DBT em um container descartável, sem importar dados no banco da aplicação. Nenhuma flag de sobrescrita foi habilitada e o arquivo original foi preservado. Os testes cobrem ZIP válido, ARJ renomeado, ZIP truncado, rejeição HTTP com limpeza dos temporários e a diferença entre configuração bloqueada e permissão negada nos dois idiomas.

### English troubleshooting

An Admin can receive HTTP 403 when overwriting is disabled by `ENABLE_LEGACY_OVERWRITE=false`. The page now distinguishes that server gate from missing import permission. Archive format is identified from content: both ZIP and ARJ are supported, including ARJ content carrying a `.zip` filename. Invalid archives are rejected before queueing; extraction security checks remain in place.

## Suporte a ARJ

- O seletor de arquivos, o upload e o worker aceitam `.arj`/`.ARJ`, além de ZIP e DBF/DBT. Pacotes com extensão ZIP ou ARJ são identificados pelo conteúdo. O arquivo informado pode manter o nome `BACEST 4.zip`.
- A API inspeciona os metadados ARJ antes de criar o job. O worker repete a inspeção e verifica os bytes e o CRC durante a decodificação. São aceitos pacotes completos, de um único volume, sem senha, com métodos ARJ 0 a 4 e metadados reconhecidos. Volumes `.A01`, arquivos parciais, criptografados ou com metadados ambíguos são recusados.
- Os limites existentes de quantidade de entradas, profundidade, tamanho individual, bytes totais e tempo valem também para ARJ. O orçamento é compartilhado entre pacotes e arquivos soltos da mesma sessão, incluindo o tamanho declarado de arquivos ignorados.
- A extração ARJ materializa apenas DBF/DBT. Executáveis e outros tipos permanecem no pacote. O decodificador envia os dados de um membro por vez para stdout; o Node cria os arquivos com caminhos validados e abertura exclusiva. Não é usada extração nativa para um diretório nem executado conteúdo do pacote.
- A implementação reutiliza a política de arquivos compactados, a validação de caminhos, a criação segura de diretórios e o fluxo de staging existentes. O processo nativo tem saída e tempo limitados, sem shell, com curingas desativados e sem receber credenciais do banco ou JWT no ambiente.
- As imagens da API e de testes backend incluem o binário estático **7-Zip 26.05**, obtido da [distribuição oficial](https://www.7-zip.org/download.html), com SHA256 fixado por arquitetura em `backend/scripts/install-sevenzip.mjs`. A licença acompanha a imagem em `/usr/local/share/licenses/7zip/License.txt`. Não há download de ferramentas durante uma importação. O [histórico oficial](https://www.7-zip.org/history.txt) registra a versão utilizada.
- Fora do Docker, instale uma versão atual do 7-Zip e configure `LEGACY_ARJ_EXTRACTOR` com o caminho para `7zz` ou `7z.exe`, se necessário. A indisponibilidade da ferramenta produz uma mensagem específica em PT-BR e EN.

O teste do arquivo informado confirmou 20 entradas, 104.826.827 bytes declarados, 18 arquivos DBF/DBT extraídos e a presença dos sete DBFs obrigatórios. Os dados foram descartados ao terminar o teste; nenhum registro desse arquivo foi publicado no banco da aplicação. Schema e seeds não mudam com o suporte a ARJ. A sobrescrita continua dependendo do gate explícito do servidor.

## Checkbox e liberação de sobrescrita

Marcar **Sobrescrever dados existentes neste sistema** seleciona `overwrite=true` para aquela solicitação. A seleção não modifica `ENABLE_LEGACY_OVERWRITE`, que controla a disponibilidade da operação no servidor. Se a configuração for `false`, a API recusa a sobrescrita mesmo com o checkbox marcado e usuário Admin.

A tela consulta `GET /api/v1/admin/import/legacy/options`, protegido pela permissão de importação, e recebe `{ "overwriteEnabled": false }` ou `true`. Enquanto consulta, se houver erro ou quando o gate estiver desativado, o checkbox fica indisponível. Há explicação em PT-BR/EN e botão para consultar novamente em caso de erro. A disponibilidade também é atualizada ao voltar para a aba e após uma recusa de sobrescrita por configuração.

Se uma seleção de sobrescrita já estiver feita e o servidor deixar de permiti-la, o envio fica bloqueado. A tela mantém a escolha e exige uma ação explícita de limpeza ou nova liberação; nunca a converte silenciosamente em importação sem sobrescrita. O servidor continua conferindo o gate na requisição, no enfileiramento e no worker.

A liberação é uma alteração administrativa da instalação: `ENABLE_LEGACY_OVERWRITE=true` no ambiente da API, seguida da recriação do container. Apenas reiniciar um container existente não faz o Compose reler o arquivo `.env`. A liberação permite excluir e substituir tabelas operacionais de produtos, clientes, vendedores, condições, vendas, pagamentos e estoque; o operador deve preservar um backup antes da operação. Os padrões do exemplo de ambiente e do instalador permanecem desativados. A liberação, por si só, não inicia uma importação; checkbox, senha atual e frase de confirmação continuam obrigatórios para cada solicitação destrutiva.

### English overwrite availability

The checkbox selects overwrite mode for one request. It does not change the server's `ENABLE_LEGACY_OVERWRITE` setting. The page reads protected import options and disables unavailable overwrite controls before upload. If availability changes after selection, submission is blocked without silently changing the requested mode. Enabling overwrite is an installation configuration change requiring API container recreation; it permits operational data replacement and does not start an import on its own.

Validação da disponibilidade: **434 testes aprovados em Docker**, além de lint, tipos e builds. API e frontend atualizados no ambiente em execução, com o gate ainda desativado durante esse ensaio e nenhuma importação iniciada. [Evidências](test-evidence/overwrite-options-docker-20261029.log.gz).

### Liberação local autorizada em 29/10/2026

Após autorização explícita do responsável, o ambiente Docker local passou a usar `ENABLE_LEGACY_OVERWRITE=true` no `.env` privado, com recriação da API. Antes da liberação, foi criado um backup gerenciado com prefixo `pre-legacy-overwrite`, preservado no volume de backups e conferido por SHA-256 e leitura do ZIP. A validação após recriar a API confirmou a persistência desse backup, o gate habilitado, a exigência de senha e confirmação e o healthcheck. Nenhuma importação foi iniciada nessa alteração. `ENABLE_DATABASE_RESTORE` e os padrões do exemplo de ambiente e do instalador permanecem desativados. Recarregue a página de importação para consultar a disponibilidade atual e selecionar o modo desejado.

### English ARJ notes

The upload picker and importer accept ZIP/ARJ archives, detecting content rather than trusting the extension. Complete unencrypted single-volume ARJ archives with methods 0–4 are supported. The API validates ARJ metadata before queueing; the worker decodes one DBF/DBT member at a time, checking actual bytes and CRC, within the existing shared archive budgets. Other members are ignored and never executed. API images bundle a checksum-pinned static 7-Zip decoder and its license. No application data or overwrite settings are changed by the extraction checks.

Validação final: **418 testes aprovados em Docker**, além de lint, tipos e builds. As imagens da API e do frontend foram atualizadas no ambiente em execução depois da verificação de ausência de importações ativas. O smoke de leitura ARJ, o seletor atualizado, a mensagem de sobrescrita e o healthcheck passaram; o gate de sobrescrita permaneceu desativado. [Evidências](test-evidence/arj-import-docker-20261029.log.gz).

## Campos DBF com bytes nulos (`UTF8: 0x00`)

O erro `invalid byte sequence for encoding "UTF8": 0x00` também pode ocorrer depois de uma extração válida. Campos de caracteres de DBFs antigos podem conter bytes nulos (`U+0000`), inclusive campos inteiros preenchidos com zero. A decodificação Latin-1 e o `trim()` não os eliminam; o PostgreSQL não aceita esse caractere em colunas de texto. Trocar a codificação do banco ou renomear o arquivo compactado não resolve esse caso.

O carregamento compartilhado de todos os DBFs remove somente `U+0000` antes de enviar cada lote ao staging. O tratamento de datas e valores ausentes é preservado; campos preenchidos apenas com NUL ficam vazios, como campos vazios normais. Acentos, espaços internos, tabulações e quebras de linha permanecem no texto. A limpeza não descarta registros nem altera os arquivos enviados. Pedidos sem número continuam sendo ignorados pela migração existente.

Quando há limpeza, o log técnico da sessão recebe um aviso por DBF com quantidades de bytes, valores de campos e registros afetados. O aviso reutiliza os detalhes técnicos da tela de acompanhamento; não inclui conteúdo dos campos. Assim como os demais logs técnicos, a mensagem original é mantida em inglês nas interfaces PT-BR e EN.

A sobrescrita usa transações por etapa: `reset-target` pode ter sido confirmado antes de uma falha no staging. Uma sessão `failed` não restaura automaticamente os dados anteriores e não é reenfileirada apenas ao reiniciar a API. Consulte os checkpoints e o backup antes de iniciar uma nova operação. A atualização do código, por si só, não repete nem restaura uma importação real.

### English NUL-byte troubleshooting

Legacy DBF character fields can contain NUL bytes that survive Latin-1 decoding and trimming. PostgreSQL text rejects `U+0000`. All DBF staging loads now remove this character before inserting batches, retaining accented text and internal whitespace. NUL-only fields become empty; source files and record counts are preserved. An aggregate technical warning identifies each affected DBF without exposing field values. Existing missing-order-number rules still apply.

Overwrite commits stages separately. If `reset-target` completed before a staging failure, earlier operational data may already have been cleared. A failed session is neither restored nor automatically restarted by an API update. Review checkpoints and the preserved backup before another operation. No schema or seed changes are required for this correction.

Validação em 29/10/2026: **290 testes do backend aprovados em Docker** (147 unitários, 132 de integração, 4 de regressão e 7 controles de medição), além de lint, tipos e build. Os dois novos testes reproduziram `UTF8: 0x00` antes da correção e passaram depois, cobrindo lotes DBF, campos NUL, acentos, espaços e vínculos por código legado. O arquivo informado também concluiu as 15 etapas em PostgreSQL descartável, com 57 bytes nulos removidos de 11 campos em um registro de `PEDIDOS.DBF`. A reconciliação identificou 1.170 referências a produtos ausentes, que continuam sendo divergências a revisar; conclusão técnica não significa ausência de divergências no arquivo. A API foi atualizada sem reiniciar a sessão real que falhou. [Evidências sem valores de campos](test-evidence/nul-dbf-docker-20261029.log.gz).

## Datas do legado e fusos horários

Campos DBF de data guardam um dia de calendário, sem hora nem fuso. O leitor `dbffile` representa esses campos como objetos `Date` em UTC. O staging agora usa os componentes UTC desses objetos e a migração grava strings `AAAA-MM-DD` nas colunas `date` de vendas, pedidos, pagamentos e estoque. Isso evita que o fuso do processo converta a data para o dia anterior. Os formatos textuais `AAAAMMDD`, `AAAA-MM-DD` e `DD/MM/AAAA` mantêm seus componentes de calendário, com validação de dias e anos bissextos.

A conexão PostgreSQL preserva valores do tipo `date` como strings `AAAA-MM-DD`, em vez de criar objetos JavaScript à meia-noite. Assim, a API não acrescenta `T00:00:00.000Z` a uma data sem horário. Esse sufixo era convertido pelo navegador para 21h do dia anterior no horário de Brasília. Os filtros de vendas também enviam ao PostgreSQL os dias de calendário, independentemente do fuso da API. Campos `timestamp with time zone`, como cancelamento e geração de relatórios, continuam representando instantes reais.

O histórico de vendas reutiliza o formatador de data existente e mostra somente a data de emissão. Nos detalhes e recibos, vendas legadas com origem `VENDAS` ou `PEDIDOS` expõem `paid_at: null`: o valor padrão gravado no banco é o instante da importação, não a hora da compra original. O recibo usa a data de emissão e mostra `--:--` quando não há hora conhecida. Operações com horário real preservam esse horário. As mesmas regras valem em PT-BR e EN, sem novo componente visual.

No ambiente investigado, as datas de vendas armazenadas coincidiam com o staging e a API rodava em UTC. Para esses registros, a atualização corrige a apresentação ao recarregar a aplicação, sem nova importação ou ajuste em massa de datas. Instalações que tenham importado com outra configuração de fuso devem comparar as datas armazenadas com o arquivo original antes de qualquer reparo; somar um dia indiscriminadamente também alteraria registros corretos. Esta atualização não reexecuta importações nem altera datas persistidas. Schema e seeds não precisam mudar.

### English calendar-date handling

DBF dates have no time or timezone. UTC components from the DBF reader are preserved as `YYYY-MM-DD` throughout staging and migration. PostgreSQL `date` values remain calendar strings in API responses; actual timestamps retain their instant semantics. Sales date filters also bind calendar strings. Sales history shows the emission date without an invented hour. Imported sales expose no known payment timestamp, so details and receipts use the emission date and receipts show `--:--` for unknown time. Both PT-BR and EN reuse existing date formatting and UI components.

Existing rows in the investigated installation already held the correct calendar dates, so refreshing the updated application fixes their display without reimporting or shifting stored dates. Other installations should compare their source DBFs before any historical data repair. Tests cover UTC, São Paulo, Auckland, a Brazilian daylight-saving transition, leap days, date filters, receipt locales and true timestamps. See [Docker validation](testing-docker.md#calendar-date-and-timezone-validation-2026-10-29).
