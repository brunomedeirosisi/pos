# Instalador em Modo Nuvem — implementação e validação

Registro de **27/10/2026**, sobre o commit **7c5e2e090390a2110e54cdcb5d1e4f33ef0bb413**, com árvore inicialmente limpa. Solicitação: implementar Modo Nuvem no instalador Windows. Não foi instalada uma loja real nem contratada/publicada infraestrutura nesta sessão.

## Entrega

A versão **1.0.0-store.3** oferece **Nuvem** e **Nuvem com impressora**. O cliente recebe URL HTTPS pública e UUID esperado; com impressora, recebe também fila Windows e código de pareamento do administrador. O pacote leve **POS-Nuvem** dispensa Docker, banco, imagens de servidor, CA local e pairing.json. O pacote completo **POS-Loja** mantém Principal/Terminal e inclui as mesmas opções Nuvem.

O servidor precisa estar previamente publicado na origem final HTTPS/443, com certificado público, frontend desta versão e migrações existentes. PRINT_MODE=queue habilita impressão. Hospedagem, backups de servidor, migração de dados e isolamento de várias lojas não são provisionados pelo instalador. Guia completo de uso, operação, diagnóstico e migração: [NUVEM.md](../instalacao/NUVEM.md).

Distribuição local, em artifacts (ignorado pelo Git):

| Pacote | Bytes do ZIP | SHA256 |
|---|---:|---|
| POS-Nuvem-1.0.0-store.3.zip | 35.041.083 | 285e31f1726aaecda765c19f7b0d8c1227a2d84726043326295d062d95a420c8 |
| POS-Loja-1.0.0-store.3.zip | 284.376.110 | 7dccba11e16dee78547ce96d1c61114df7cf1b4b1cf88922a77b052ef88383f9 |

O runtime oficial Node 24.21.0 teve SHA256 e Authenticode verificados. EXE/scripts deste build não possuem assinatura comercial. O manifesto registra HEAD, árvore com alterações, versão/runtime e hashes. Os dois ZIPs tiveram todos os arquivos conferidos por streaming contra os manifestos; o pacote leve possui 18 arquivos e o completo 29, além do manifesto. Foram feitas 37 comparações com scripts, configurações, worker e cinco guias de origem. [Evidência dos pacotes](../test-evidence/installer-cloud-packages-20261027.json).

## Comportamento e segurança

- A GUI oferece URL/UUID e campos de impressora somente quando necessários. O launcher aceita --cloud/--cloud-printer e continua validando caminhos/hashes antes de iniciar PowerShell.
- Pos.Cloud.ps1 restringe origem a HTTPS/443 com domínio completo, sem IP/local/credenciais/caminho/parâmetros. Verifica identidade em store-info antes de enviar código/token e exige fila para parear impressão.
- O transporte usa confiança normal do Windows, TLS 1.2, revogação, timeout e limite de resposta. Cookies e credenciais Windows são desabilitados; redirecionamentos são recusados e erros não ecoam resposta/token.
- O worker já usa redirect:error. O supervisor Nuvem força validação TLS e remove a CA LAN herdada do ambiente. Estado antigo sem connectionMode conserva a confiança LAN existente.
- Credencial exclusiva DPAPI CurrentUser e journal por impressora são preservados no reparo sem código. Não há porta de entrada, importação de CA, regra de firewall, compartilhamento de impressora ou chamada Docker no fluxo Nuvem.
- Sem agente, o atalho usa a preferência pública choose; o frontend exige selecionar um destino habilitado e não presume que exista Principal na nuvem. O atalho POS Nuvem preserva POS Loja.
- Um POSTerminal já vinculado a outra origem/UUID não é sobrescrito. Para impressão no antigo Principal, exige sinal de parada e ausência de supervisor ativo. Dados e filas não são migrados ou apagados pelo cliente; o corte precisa de reconciliação e desativação planejada.

O builder leve compartilha a obtenção/verificação do runtime com o builder completo e não descobre/invoca Docker. O modo Nuvem escolhido no pacote completo copia apenas os arquivos do cliente para o release instalado. Não houve alteração de dependências npm, migrações SQL ou seeds: o recurso usa cadastro/autorização e fila já existentes, sem dados demonstrativos.

## Verificação

- **321 testes no Docker passaram**: backend unitário 144, integração PostgreSQL/Redis 81, regressão 4, controles de medição 7, frontend 76 e agente 9. Lint, controles de lint, tipos, builds, imagens finais e backup/restore/recriação passaram.
- **136 verificações Windows passaram**: parser PowerShell 5.1, DPAPI/ACL reais, launcher nativo, UI oculta, validação de pacote, fluxo Nuvem com/sem impressora, UUID/queue, reparo e migração. Efeitos globais de instalação são simulados.
- **15 verificações HTTPS passaram**, com servidor/proxy em loopback e certificado efêmero: rejeição da confiança padrão e de nome divergente antes de enviar credenciais, POST, identidade/queue, recusa de redirect, limite de 64 KiB, conteúdo inválido/HTML e erro sanitizado. Não houve importação de CA ou callback TLS global; a aceitação do certificado temporário é por handler exclusivo do teste.
- Compilação dos dois pacotes, validação nativa dos launchers e formulário Nuvem do pacote leve passaram. Integridade dos diretórios/ZIPs e correspondência com fontes passaram.
- Instalação nova do pacote completo passou em stack Docker isolada: duas sessões HTTPS, dois destinos, credencial restrita, deduplicação, revogação, journal sem reimpressão, backup/réplica e persistência após recriação da API. [Evidência](../test-evidence/installer-cloud-store-20261027.json).

O ensaio de atualização .2 → .3 e os controles finais estão registrados na [evidência consolidada](27-evidencias-instalador-nuvem.json). Logs reproduzíveis compactados ficam em docs/test-evidence/cloud-*-20261027.log.gz.

## Limites operacionais

Os testes usam dados sintéticos e projetos Docker descartáveis; não selecionam o projeto de desenvolvimento/loja. Os efeitos globais Windows de instalação são simulados. .env e backend/.env foram conferidos por hash sem alteração. A instalação física de drivers, confiança pública do domínio real, conexão externa dos dois caixas, reboot/login, papel e migração da loja ainda precisam de [homologação](../instalacao/HOMOLOGACAO.md).

Não há venda offline, publicação automática do servidor ou sincronização de banco local/nuvem. O computador que imprime deve estar ligado com a conta Windows conectada. Sem serviço SYSTEM, login automático, abertura de porta ou compra de hospedagem. O roadmap anterior e os controles de produto pendentes não são encerrados por esta entrega.

## Reprodução

```powershell
./infra/installer/Test-Installer.ps1 -NodePath (Get-Command node.exe).Source
./infra/installer/Test-CloudHttps.ps1 -NodePath (Get-Command node.exe).Source
node infra/test-disposable.mjs --docker --images --backups
./infra/installer/Build-CloudInstaller.ps1 -Version '<nova-versao>'
./infra/installer/Build-Installer.ps1 -Version '<nova-versao>' -CompatibleFrom '1.0.0-store.2'
node infra/installer/test-store.mjs --bundle artifacts/POS-Loja-1.0.0-store.3 --evidence docs/test-evidence/installer-cloud-store-20261027.json
node infra/installer/test-store.mjs --bundle artifacts/POS-Loja-1.0.0-store.3 --upgrade-from artifacts/POS-Loja-1.0.0-store.2 --reuse-images --evidence docs/test-evidence/installer-cloud-upgrade-20261027.json
```

Os ensaios de release usam o projeto fixo pos-installer-smoke; execute instalação e upgrade sequencialmente. O primeiro ensaio carrega images.tar; --reuse-images continua conferindo os IDs do manifesto. Builds recusam sobrescrever versões existentes. A CI Windows executa contratos e HTTPS; o job Linux mantém a suíte Docker completa.
