# Homologação da instalação Windows

Use este roteiro com o responsável da loja antes de liberar vendas reais. Registre data, versão do pacote, SHA256 do ZIP, versão do Windows/Docker, conta Windows, IP reservado, modelo/driver da impressora, destino do backup e responsáveis. Os dados do ensaio devem ser sintéticos.

## Evidências automatizadas e seus limites

O repositório oferece quatro camadas de validação reproduzíveis:

1. `Test-Installer.ps1`: parser PowerShell, DPAPI real, ACL real em pasta temporária, argumentos de processo, manifesto/hashes/traversal, compilação e execução do launcher e construção oculta da interface. Instalação, reparo e Terminal usam simulações para Docker, certificados, firewall, atalhos e impressão.
2. `infra/test-disposable.mjs --docker --images --backups --seeds`: lint, controles de lint, tipos, testes, builds, PostgreSQL/Redis descartáveis, imagens finais, autenticação, seed e backup/restore/recriação reais em ambiente isolado.
3. `infra/installer/test-store.mjs`: imagens empacotadas e Compose de loja em projeto Docker isolado; HTTPS com CA fornecida apenas ao processo de teste, duas sessões, fila persistente e agente com saída física simulada. Não instala CA no Windows nem imprime papel.

4. `Test-CloudHttps.ps1`: transporte HTTPS real em loopback, rejeição de certificado não confiável/nome divergente, recusa de redirects, limites de resposta e erros sanitizados. Não importa CA no Windows; o certificado aceito existe somente no handler do teste.

Os resultados de uma execução são registrados em `docs/test-evidence` e no registro técnico da implementação. Nenhum teste automatizado substitui a aceitação física abaixo. Atualizações futuras precisam de um ensaio de migração específico antes de declarar `CompatibleFrom`.

## Caixa 1 Principal

- [ ] Windows x64 atende aos requisitos atuais do Docker Desktop; virtualização e WSL funcionam. Licenciamento Docker validado pela organização.
- [ ] Conta operacional definida; instalação, Docker, driver e inicialização usam essa mesma conta.
- [ ] IP privado reservado no roteador e atribuído ao adaptador correto; perfil da LAN é Privado.
- [ ] Não há conflito com `172.29.73.0/24` nem outra aplicação usando a porta 443 nesse IP.
- [ ] Driver e nome da fila corretos; página de teste do Windows legível, acentos, corte/formulário e largura conferidos.
- [ ] Backup em destino externo existente, com acesso do Docker, espaço e publicação exclusiva/hardlinks testados. Se UNC/NAS, conexão e credenciais validadas no contexto operacional.
- [ ] Hash do pacote conferido por canal confiável; ZIP inteiro extraído; manifesto validado pelo EXE.
- [ ] Instalação inicial termina com backup/réplica verificados e identidade HTTPS correta.
- [ ] Primeiro administrador entra; dados da empresa corretos; usuários individuais e permissões dos dois operadores configurados.
- [ ] Não há produtos/clientes/vendas demonstrativos no banco inicial.
- [ ] Inicialização não mostra senhas/tokens; `secrets.bin` não é JSON e fica na pasta privada da conta.
- [ ] Regra criada pelo instalador permite apenas TCP443 no IP selecionado, perfil Privado, origem LocalSubnet. Nenhuma publicação de banco/Redis/9222.

## Caixa 2 Terminal e rede

- [ ] Transferir somente `Terminal-POS` gerado após o Principal estar saudável.
- [ ] Comparar o SHA256 da CA exibido nos dois caixas por canal independente; não aceitar CA de outra origem.
- [ ] Instalar na conta Windows que usará o navegador; abrir pelo atalho POS sem alerta HTTPS.
- [ ] Verificar que os dois caixas chegam à mesma loja/UUID e veem a mesma venda.
- [ ] Confirmar que não há redirecionamento externo de portas no roteador. Testar regras com a rede e operadores reais.
- [ ] Bloquear/confirmar isolamento de redes de visitantes conforme a infraestrutura, sem abrir outras portas do POS.

## Impressão compartilhada

- [ ] Criar uma venda sintética em cada caixa e solicitar uma impressão em cada uma; conferir ordem, conteúdo, cópias e estado apresentado.
- [ ] Confirmar que todas saem somente na impressora escolhida no Principal.
- [ ] Duplo clique/reenvio do mesmo identificador não cria outro trabalho; nova ação explícita de reimpressão cria uma nova solicitação.
- [ ] Desconectar a impressora/colocar sem papel: conferir spooler e tela. “Enviado ao Windows” não confirma impressão física.
- [ ] Parar o agente antes do envio: fila aguarda e retoma após inicialização.
- [ ] Simular interrupção durante o envio: conferir estado incerto; não permitir repetição automática; operador verifica papel/spooler antes de nova ação.
- [ ] Reiniciar o Windows durante ensaio controlado; confirmar journal e ausência de reimpressão automática de envio incerto.
- [ ] Confirmar que não existe listener do agente na porta 9222 no modo instalado.

## Continuidade e backup

- [ ] Parar com `Parar-POS.ps1`: encerra agente e containers preservando dados.
- [ ] Fazer logoff/login: parada manual persiste. Retomar com `Start-POS.ps1 -Resume`.
- [ ] Reiniciar e entrar na conta: Docker, containers e agente iniciam; sem login o supervisor não opera.
- [ ] Testar desligamento/rede indisponível/suspensão. Definir política operacional para que o Principal permaneça ligado e conectado durante o expediente.
- [ ] Criar backup manual; conferir arquivo, metadados e SHA256 local/externo. Simular destino indisponível e confirmar falha visível sem declarar sucesso.
- [ ] Observar backup automático vencido e nova tentativa após falha; conferir `backup-status.json` e capacidade do destino.
- [ ] Restaurar uma cópia externa em projeto isolado e reconciliar vendas, itens, recebimentos, estoque, usuários e fila/journal. Nunca ensaiar sobre o banco operacional.
- [ ] Registrar RPO/RTO medidos e procedimento assistido para perda do PC/perfil/DPAPI. Backup do banco não inclui CA, configurações nem segredos Windows.
- [ ] Definir retenção, proteção e acesso às cópias externas; a aplicação não criptografa os ZIPs.

## Atualização e retirada

- [ ] Pacote de atualização declara explicitamente compatibilidade; ensaio usa cópia sintética/homologada da origem.
- [ ] Backup prévio e réplica conferidos; parar operações dos dois caixas na janela de manutenção.
- [ ] Atualizar, conferir identidade, dados, login, fila e impressão; semear dados demonstrativos não faz parte de atualizar.
- [ ] Exercitar falha de atualização em ambiente isolado: `update_failed` impede reinício/“reparo” que contorne a investigação. Não restaurar automaticamente esquema/banco antigo.
- [ ] Exercitar desativação: remove inicialização/regra própria, preserva dados/volumes e backups; remover CA somente após conferir sua identidade e dependências.

## Gates de negócio que permanecem pendentes

A infraestrutura não encerra o roadmap de produto. Antes de uso comercial, evidenciar os bloqueios de cliente inativo e limite de crédito, política de estoque não negativo e concorrência, fluxo autorizado/contábil de crédito ou reembolso, reconciliação de cancelamentos anteriores aos movimentos e política de KPIs sem custo. A topologia de impressão deve ser aceita pelos operadores. Restore e sobrescrita de importação permanecem desabilitados no pacote.

Aprovação de infraestrutura: __________________ Data: __________

Aprovação de impressão e operação: _____________ Data: __________

Aprovação de recuperação e regras de negócio: ________________ Data: __________

Guias: [uso](USO.md) e [técnico](TECNICO.md).


## Ampliação 1.0.0-store.2 — impressora por caixa

- [ ] Atualizar um Principal 1.0.0-store.1 em manutenção; preservar dados, credencial e trabalhos antigos. Receber novo pacote Terminal-POS.
- [ ] Administrador gera código de 15 minutos; vendedor sem printers:manage não cadastra/revoga agentes.
- [ ] Instalar Terminal com impressora sem Docker, sem compartilhar token do Principal e sem portas adicionais.
- [ ] Abrir cada atalho antes do login; conferir o destino padrão após autenticar, inclusive com operadores diferentes no mesmo navegador.
- [ ] Imprimir simultaneamente nos dois caixas e conferir que os papéis saem nos locais escolhidos. Verificar acentos, largura e driver de cada modelo.
- [ ] Parar só o agente Terminal, enfileirar para ele e continuar imprimindo no Principal; nenhum pedido é transferido automaticamente.
- [ ] Conferir resultado incerto antes de emitir outra via; a troca de destino não cancela a fila original.
- [ ] Reparar e atualizar o Terminal com código vazio: identidade/token e journal permanecem. Simular resposta de pareamento perdida.
- [ ] Reiniciar/logar cada máquina na conta operacional e conferir supervisor, impressora local e padrão de navegador.
- [ ] Revogar Terminal: credencial perde acesso, novo enqueue é bloqueado, histórico/pedidos antigos permanecem; envio físico em curso pode terminar.
- [ ] Novo pareamento usa outro destino/journal. Revogar anterior e reconciliar filas antes de reemitir em outra impressora.
- [ ] Rever permissões/revogações/journals em ensaio de restauração isolado. Backup SQL não transporta segredos DPAPI entre máquinas.

Roteiro detalhado: [IMPRESSORAS.md](IMPRESSORAS.md).

## Caixas em Modo Nuvem

- [ ] Registrar URL HTTPS final e UUID recebidos por canal confiável; testar certificado público/cadeia nos dois Windows e no worker Node.
- [ ] Conferir frontend .3, migrações e PRINT_MODE=queue no servidor publicado. Banco/Redis privados e backups/restauração homologados pelo responsável técnico.
- [ ] Instalar POS-Nuvem inteiro em ambos os caixas, na conta operacional. Confirmar que não instala Docker, CA local, firewall ou listener.
- [ ] Parear cada impressora com código próprio; testar destino correto, saída física e isolamento entre as filas.
- [ ] No caixa sem impressora, confirmar escolha obrigatória de destino antes de imprimir; depois selecionar a impressora do outro caixa.
- [ ] Reiniciar Windows, entrar na conta e testar retomada; Parar-Terminal deve manter parado até -Resume.
- [ ] Testar queda de internet e energia durante impressão; reconciliar papel/journal/histórico antes de nova cópia. Não há venda offline.
- [ ] Em migração, validar dados e filas antes de desativar o Principal; preservar POSStore/POSTerminal e impedir dois agentes na mesma impressora física.
- [ ] Registrar limites de conectividade, responsáveis pela hospedagem, restauração e suporte. Seguir [NUVEM.md](NUVEM.md).

## Publicação temporária do localhost para teste

- [ ] Seguir [TESTE-INTERNET.md](TESTE-INTERNET.md) usando o Compose da raiz, dados sintéticos e as duas janelas PowerShell.
- [ ] Validar healthcheck local com a CA e healthcheck público com HTTPS normal; testar login em uma rede externa.
- [ ] Conferir a origem efetiva na API após recriação; manter banco, Redis, frontend, proxy e conector em execução.
- [ ] Encerrar o túnel e restaurar/conferir CORS sem remover volumes; confirmar que o acesso local continua funcionando.
- [ ] Registrar separadamente qualquer ensaio de instalador/impressora: navegador acessível não comprova UUID, fila, pareamento ou saída física.
