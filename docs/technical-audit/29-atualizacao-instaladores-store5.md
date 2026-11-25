# Atualização dos instaladores — 08/11/2026

Os pacotes `1.0.0-store.4` antecediam as alterações de estoque da aplicação. A distribuição `1.0.0-store.5` recompila a API e o frontend da árvore de trabalho atual e declara atualização do Principal a partir de `1.0.0-store.4`. Os pacotes anteriores foram preservados.

## Conteúdo entregue

- **Loja:** novas imagens com estoque atual no catálogo, estoque inicial no cadastro, reconciliação de saldos importados, ajustes manuais autorizados e histórico auditado em PT-BR/EN. Inclui `init.sql` atual e as migrações `20261106_001_legacy_product_stock.sql` e `20261107_001_manual_stock_adjustments.sql` na imagem da API. A API aplica as migrações ao iniciar.
- **Nuvem:** cliente Windows e documentação atualizados na mesma versão. A aplicação continua sendo fornecida pelo servidor HTTPS; esse ZIP não atualiza o servidor.
- **Documentação:** builders, exemplos de geração e guias de operação apontam para store.5, com origem compatível store.4. Os dois pacotes incluem também `manual-stock-adjustments.md` e `product-stock.md` na raiz, atendendo aos links de estoque do guia de uso.
- **Ensaio de atualização:** inicializa o banco com o SQL e as imagens da store.4, cria uma venda e trabalhos de impressão e faz backup antes de trocar a API. Confere os movimentos e o saldo anteriores após as migrações, além de sessão, credencial, venda, solicitações e conteúdo dos recibos.

## Validação

| Ensaio | Evidência |
|---|---|
| Pacotes Loja e Nuvem | [Integridade dos ZIPs](../test-evidence/installer-packages-20261108.json): todos os arquivos dos manifestos conferidos também dentro dos ZIPs, SHA256 externo, scripts e documentação comparados com as fontes. 137 verificações Windows, quatro contratos de backup do supervisor e 15 verificações HTTPS passaram. |
| Aplicação empacotada | [Conferência das imagens](../test-evidence/installer-source-20261108.json): hashes dos 17 arquivos SQL/contrato idênticos às fontes atuais; interface de ajustes e histórico presente em PT-BR/EN. |
| Instalação nova | [Ensaio da loja](../test-evidence/installer-store-20261108.json): imagens carregadas do arquivo distribuído, catálogo vazio, duas sessões HTTPS, estoque inicial, vendas, ajuste idempotente, recusa de versão desatualizada, histórico persistente, destinos de impressão separados e backups com réplica. |
| Atualização store.4 → store.5 | [Ensaio de atualização](../test-evidence/installer-upgrade-20261108.json): schema anterior real, backup prévio, preservação das operações anteriores e aprovação das verificações da loja nova. |
| Recuperação na imagem final | [11 verificações](../test-evidence/installer-recovery-20261108.json): backup e restauração reais, bloqueios, rejeição de SQL sem procedência, revogação de sessões, vínculos de vendedor, saldos/preços, agenda, rollback e recuperação interrompida. |

Os ensaios usam dados sintéticos, projetos Docker isolados e portas de teste em loopback. Os projetos `pos-installer-smoke` e `pos-installer-recovery` e seus volumes foram removidos ao terminar. Os containers da aplicação em uso conservaram suas identidades.

Os manifestos registram as alterações locais como `sourceWasDirty=true`. Os pacotes estão sem assinatura comercial (`codeSigned=false`), com runtime oficial verificado pelo builder. A saída física da impressora foi simulada, e a réplica temporária não comprova separação física de armazenamento. Os ensaios físicos permanecem no [checklist de homologação](../instalacao/HOMOLOGACAO.md).

Os ZIPs e seus arquivos `.sha256` estão em `artifacts/POS-Loja-1.0.0-store.5.zip` e `artifacts/POS-Nuvem-1.0.0-store.5.zip`. Extraia o pacote inteiro antes de executar `Instalar-POS.exe`; para atualizar o Principal existente, siga [USO.md](../instalacao/USO.md#8-atualizar-ou-desativar).
