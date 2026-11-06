# Revisão dos instaladores — 05/11/2026

A última distribuição disponível era `1.0.0-store.3`, gerada em 27/10/2026, para Loja e Nuvem. Os manifestos indicam HEAD `7c5e2e0` com alterações locais; a comparação incluiu os arquivos efetivamente distribuídos, além do histórico Git e da árvore de trabalho atual. Os novos pacotes são `1.0.0-store.4`, com atualização do Principal declarada a partir de `1.0.0-store.3`.

## Impactos encontrados e ajustes

- **Backup agendado:** o supervisor da store.3 executava backups a cada 24 horas, independentemente da nova preferência da aplicação. A store.4 incorpora a remoção desse temporizador já presente na árvore de trabalho. O backend passa a ser o único responsável pelo agendamento diário. Permanecem os backups obrigatórios de instalação/atualização e o diagnóstico manual. Após atualizar, é necessário habilitar e salvar a agenda na aplicação; ela começa desabilitada.
- **Aplicação e SQL:** as mudanças em importação, recuperação, paginação, vendedores, pagamentos, preços e recibos exigem novas imagens da API/frontend. O build já copia todo `src` e `sql`, incluindo o controle durável `pos_recovery`, inicializado pela API, e as cinco migrações posteriores à store.3. Não foi necessário acrescentar uma etapa manual de SQL ao instalador.
- **Importação ARJ:** o Dockerfile atual já inclui o decodificador 7-Zip fixado e sua licença. O novo pacote Loja contém essa imagem; o Windows da loja não precisa instalar um extrator adicional. A presença do executável foi conferida na imagem final.
- **Impressão:** a instalação local mantém `PRINT_MODE=queue` e seus agentes individuais. O novo modo `browser` funciona no cliente Nuvem sem agente, quando configurado no servidor. O guia Nuvem foi atualizado para explicar os dois fluxos. O ZIP Nuvem continua contendo somente o cliente Windows: as atualizações da aplicação precisam ser publicadas no servidor.
- **Build e documentação:** os builders usam store.4 por padrão e os comandos de geração declaram compatibilidade com store.3 explicitamente. Os guias de instalação, backup, impressão e atualização foram atualizados, retirando instruções contraditórias sobre o temporizador antigo. Os pacotes anteriores foram preservados.
- **Validação de atualização:** o ensaio agora inicializa o banco com `init.sql` do pacote anterior. Antes ele usava o SQL novo também na preparação da API antiga, o que enfraquecia a verificação das migrações. O teste cria um backup com a API antiga e verifica os novos endpoints, migrações, agendamento, réplica e persistência.
- **Verificação contínua:** `Test-Installer.ps1 -NodePath` passou a executar os quatro contratos existentes de backup do supervisor, incluindo-os nos builds e no CI Windows. O teste de restauração foi alinhado ao preço-base de 125 da venda a prazo da sua fixture, conforme a regra atual de preços.

## Evidências

| Ensaio | Resultado e registro |
|---|---|
| Pacotes Loja e Nuvem | [Manifestos, hashes e conferência integral dos ZIPs](../test-evidence/installer-packages-20261105.json). Builds com runtime oficial validado, launcher e interface conferidos; 137 verificações Windows, quatro contratos do supervisor e 15 verificações de transporte HTTPS. |
| Instalação nova | [Ensaio da loja](../test-evidence/installer-store-20261105.json): catálogo vazio, duas sessões HTTPS, impressão por destinos separados, paginação, migrações, 7-Zip, backup automático real, réplica e persistência após recriar a API. |
| Atualização store.3 → store.4 | [Ensaio de atualização](../test-evidence/installer-upgrade-20261105.json): schema anterior real e backup prévio, preservação de sessão, venda, credencial, IDs, trabalhos pendentes e conteúdo dos recibos, além das verificações da loja nova. |
| Recuperação na imagem final | [11 verificações de recuperação](../test-evidence/installer-recovery-20261105.json): backup/restore reais, locks, rejeição de origem não verificada, revogação de sessão, rollback, recuperação interrompida, vínculos de vendedores, saldo/preço da venda e persistência da agenda/histórico automático. |

Reprodução dos ensaios de Loja e atualização está em [TECNICO.md](../instalacao/TECNICO.md). O teste da recuperação usa `infra/restore-image-check.mjs` contra a imagem API identificada no manifesto, no projeto descartável `pos-phase0-tests`. Os ensaios de Loja usam `pos-installer-smoke`, com porta efêmera em loopback. Os projetos e volumes de teste foram removidos ao terminar.

Os pacotes foram gerados com as alterações locais atuais, registradas como `sourceWasDirty=true`, sem assinatura comercial (`codeSigned=false`). Os IDs das imagens nos pacotes finais são conferidos contra as evidências dos ensaios. A impressão no spooler é simulada, e o destino temporário de réplica não comprova separação física de discos. A homologação de impressora, reboot e armazenamento externo continua descrita em [HOMOLOGACAO.md](../instalacao/HOMOLOGACAO.md).
