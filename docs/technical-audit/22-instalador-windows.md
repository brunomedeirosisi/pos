# Instalador Windows da loja — implementação e validação

Registro de 22/10/2026. Escopo aprovado: dois caixas Windows, uma impressora central, instalador e documentação técnica/de uso. A árvore já continha alterações das fases anteriores; elas foram preservadas. Este registro não encerra os gates de negócio ou recuperação do roadmap.

## Entrega

Pacote local: `artifacts/POS-Loja-1.0.0-store.1.zip` (284.337.240 bytes; aproximadamente 271 MiB), com SHA256 `a5aa2030b78091b0476a039bb7f5b97befab151483399fa24dcb8cbda43833df`. Extraia o ZIP inteiro e execute `Instalar-POS.exe`. São 22 arquivos verificados pelo manifesto, além do próprio manifesto.

O Principal recebe imagens prontas e imutáveis, runtime Node Windows oficial validado, HTTPS privado, administrador inicial, credenciais exclusivas protegidas por DPAPI/ACL, atalho, supervisor após login e backup inicial/automático com réplica. O Terminal recebe apenas o pareamento público, certificado e atalhos, sem banco, Docker ou segredos.

O agente consulta a fila PostgreSQL por HTTPS. A fila serializa o destino compartilhado, deduplica o UUID da solicitação e usa leases/journal para não repetir automaticamente um envio físico incerto. A UI diferencia fila, envio ao Windows e resultado incerto. O modo antigo de agente HTTP continua disponível para desenvolvimento, mas não é iniciado pelo instalador.

Há scripts de diagnóstico, parada/retomada, atualização explicitamente compatível e desativação com preservação de dados. Atualização falha bloqueia retomada automática; não há rollback automático de banco.

Guias completos:

- [Instalação e operação](../instalacao/USO.md)
- [Arquitetura, segurança, build, contratos e manutenção](../instalacao/TECNICO.md)
- [Homologação da loja](../instalacao/HOMOLOGACAO.md)

## Correções encontradas durante a implementação

- Tratamento HTTP preserva 503 de indisponibilidade, mantendo detalhes internos sanitizados. A fila cheia antes retornava 500; o teste real da capacidade detectou a falha.
- A rede Docker separa a alocação dinâmica (`172.29.73.128/25`) do endereço estático do proxy (`172.29.73.2`). O ensaio real detectou conflito durante a partida.
- Caddy define `default_sni` para o IP da loja. Clientes que acessam IP sem SNI precisam dessa seleção através do NAT do Docker; o ensaio HTTPS detectou o handshake inválido.
- O verificador HTTPS espera a emissão inicial, usa TLS 1.2 no PowerShell 5.1 e mantém validação da CA e UUID da loja.
- A construção real da UI encontrou expressão de coordenadas sem parênteses na resolução de overloads do PowerShell; corrigida.
- Empacotamento libera o handle do launcher e usa leitura de arquivos pelo ZIP, evitando a falha do Compress-Archive com o EXE. Entradas ZIP usam separador normalizado. O builder extrai apenas node.exe/LICENSE do runtime verificado.

Não houve alteração adicional nos seeds de vendas: o instalador usa somente schema/migrações/perfis e cria o administrador informado. O ensaio da imagem final confirmou catálogo inicialmente vazio.

## Evidência executada

- Docker: **302 testes passaram**, sem falhas/skip; lint, 16 controles de lint/seleção vazia, tipos e builds passaram. São 143 unitários backend, 74 integrações PostgreSQL/Redis, 4 regressões, 7 controles de medição, 67 frontend e 7 agente. O ambiente é descartável.
- Os dois seeds sintéticos passaram antes da falha inicial de status HTTP. Após corrigir o erro, a suíte completa de workspaces/imagens/backup foi repetida sem seeds, que permaneceram iguais.
- Imagens finais: login/revogação, SPA, métricas e backup/restore/recriação reais em projeto isolado passaram, incluindo 20 FKs.
- Windows: **58 verificações passaram**; DPAPI, DACL, parser, argumentos, compilação/execução do launcher e construção oculta da interface são reais. Docker, trust, firewall, startup e impressão física são simulados nesse teste.
- Release: duas sessões HTTPS independentes, duas vendas sintéticas, dois trabalhos enviados ao transporte simulado, deduplicação, estado incerto sem reimpressão, remoção de bootstrap, réplica via bind Windows com checksum igual e persistência após recriar a API passaram. As imagens já carregadas do mesmo images.tar nas tentativas iniciais foram reutilizadas e conferidas por ID no ensaio final.
- ZIP: todos os 22 arquivos foram lidos diretamente do archive e comparados com os hashes. Os 11 scripts/configurações de origem e os três guias correspondem ao bundle. Launcher e UI do pacote final também foram validados após a última correção.

O build completo foi executado; as últimas correções de Caddy/HTTPS/documentação foram incorporadas ao bundle com nova validação do launcher/UI, manifesto e ZIP. Não foi necessário reconstruir imagens nessas correções de host. O builder de origem já contém essas mudanças para a próxima geração integral.

A execução não instalou a loja neste computador nem alterou seu firewall, startup, trust ou impressoras. `.env`, `backend/.env` e os 21 arquivos de POS-DATA foram comparados com o início desta tarefa e permaneceram iguais. Os testes Docker selecionaram somente projetos isolados, sem operar nos projetos existentes da máquina.

Evidência estruturada: [23-evidencias-instalador-windows.json](23-evidencias-instalador-windows.json). Resultados de [release](../test-evidence/installer-store-20261022.json) e [integridade do ZIP](../test-evidence/installer-package-20261022.json). Logs UTF-8 gzip: [Docker](../test-evidence/installer-docker-20261022.log.gz), [Windows](../test-evidence/installer-windows-20261022.log.gz) e [release](../test-evidence/installer-store-20261022.log.gz).

## Limites e liberação operacional

O pacote está pronto para homologação de infraestrutura, não para dispensar os gates de produto. Não foi realizada impressão física nem instalação em dois PCs reais. Ainda é preciso validar driver/papel, topologia LAN, conta após reboot/login, Docker/WSL, suspensão, destino realmente externo e ensaio de recuperação. O CI Windows foi configurado, mas não foi executado remotamente nesta sessão.

O instalador comercial permanece **sem assinatura digital** porque não foi fornecido certificado de code signing. O runtime Node incluído teve assinatura Authenticode e checksum oficial validados. Distribua ZIP/hash por canal confiável e siga a documentação de assinatura para distribuição comercial.

Crédito/cliente inativo, estoque não negativo e concorrência, autorização/contabilidade de reembolso, reconciliação histórica, KPIs sem custo e recuperação operacional continuam sujeitos ao roadmap já registrado. Restore/sobrescrita de importação seguem desabilitados. O checklist de homologação registra os responsáveis e os ensaios necessários antes de vendas reais.
