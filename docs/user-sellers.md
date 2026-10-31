# Vendedor do usuário / User seller

O campo **Vendedor** continua opcional no PDV. A regra aplicada pelo backend é:

1. Um vendedor selecionado na venda tem prioridade.
2. Sem seleção, usa-se o vendedor vinculado ao usuário autenticado.
3. Se não existir vínculo, a primeira venda cria um vendedor com o nome cadastrado do usuário e o vincula automaticamente.

Não há associação por coincidência de nomes: contas distintas com o mesmo nome recebem identidades distintas. O usuário efetivo vem da sessão validada; o corpo do pedido não define quem está conectado. A criação automática, o vínculo, a venda e suas movimentações são confirmados na mesma transação. Uma falha reverte a operação inteira. Vendas simultâneas do mesmo usuário não criam duplicados.

## Configurar em Perfis

Abra **Perfis e permissões → Vendedores dos usuários** no perfil desejado. A tela lista os usuários daquele perfil e seus vínculos individuais, com busca por nome/e-mail e paginação. O perfil é apenas a forma de organizar essa tela: usuários do mesmo perfil podem ter vendedores diferentes.

Selecione um vendedor no campo pesquisável da pessoa e clique em **Salvar**. A pesquisa reutiliza o cadastro de vendedores e alcança registros além da primeira página. Para usar um vendedor legado já existente e conservar seu histórico, configure esse vínculo antes de começar a vender com a conta. O sistema não presume que nomes iguais representam a mesma pessoa.

Limpar a seleção e salvar volta ao modo automático na próxima venda. A identidade automática do usuário é reutilizada se já tiver sido criada. Trocar o perfil do usuário conserva seu vínculo. Trocar ou remover um vínculo não altera o vendedor de vendas anteriores.

Cada vendedor pode estar vinculado a uma conta. Uma identidade automática é reservada ao usuário que a originou. Vendedores já associados a outra conta são recusados; para transferir um vendedor cadastrado manualmente, primeiro remova o vínculo anterior. A seleção manual na própria venda continua disponível e não modifica o vínculo padrão do usuário.

## Permissões, validações e auditoria

Consultar os vínculos exige `users:read` ou `users:write`; alterar exige `users:write`. Gerenciar permissões de perfis (`roles:write`) não concede, sozinho, acesso aos vínculos. A listagem de opções de vendedores aceita `catalog:read` ou `users:write`, sem conceder escrita no catálogo. A venda mantém a exigência de `pos:checkout`.

O servidor valida UUIDs, existência do vendedor, vínculo exclusivo e pertencimento atual do usuário ao perfil aberto. Se a pessoa mudou de perfil desde a abertura da tela, a alteração é recusada para a lista ser atualizada. Mudanças de vínculo e criações automáticas são auditadas na mesma transação; falha ao registrar auditoria impede a gravação. Uma sessão existente passa a usar o novo vínculo na venda seguinte, sem novo login.

Todos os textos do fluxo estão disponíveis em PT-BR e EN. A tela reutiliza `Modal`, `SearchableSelect`, React Query, debounce e os estilos de formulários já existentes.

## Instalação e importação

A migração `20261029_003_user_sellers.sql` adiciona a identidade de conta opcional em `seller.user_id` e a associação `user_seller`. A inicialização de bancos novos inclui a mesma estrutura. A migração não atribui vendedores a vendas antigas e não tenta vincular cadastros existentes por nome. Não é necessário alterar seeds ou permissões dos perfis existentes.

Uma importação com sobrescrita conserva vendedores vinculados a usuários e identidades automáticas, inclusive quando não aparecem no DBF. Os demais vendedores são substituídos como antes. O upsert por código legado atualiza o nome de vendedores importados já vinculados, preservando seus IDs e associações. As contas e perfis não são apagados por esse processo. Os totais da importação continuam contando os vendedores do arquivo, sem incluir identidades administrativas preservadas.

Backups da aplicação incluem os vínculos. Restaurar um backup antigo anterior a essa migração cria a estrutura pelas migrações pendentes; esses backups não contêm configurações de vínculo posteriores.

## Validação em Docker

Em 30/10/2026, passaram 620 testes: 179 unitários do backend, 194 integrações com PostgreSQL/Redis descartáveis, 4 regressões, 7 verificações de medição e 236 testes do frontend. Lint, regras, tipos e builds passaram. O fluxo de Perfis foi validado em PT-BR/EN, incluindo leitura sem permissão de escrita, busca, paginação, seleção fora da primeira página, remoção, erro/retry e envio pendente.

As integrações verificam login real, prioridade manual, aplicação imediata do vínculo, nomes iguais, vendas concorrentes, mudanças de perfil, validação e rollback de auditoria/venda. Uma sobrescrita real de fixture DBF comprovou a preservação de contas e vínculos. O runner da imagem final executou oito verificações de backup/restauração, incluindo a recuperação da identidade de vendedor e sua associação. [Evidência agregada](test-evidence/user-sellers-docker-20261030.log.gz).

Antes da migração operacional foi criado e validado um backup persistente, sem executar retenção. A verificação após a atualização confirmou as mesmas 104.879 vendas, 138.782 pagamentos, contas, perfis e atribuições históricas; os saldos legados permaneceram sem divergências. Os testes não criaram vendas nem vínculos de demonstração na aplicação operacional.

## English

Seller remains optional at checkout. A selected seller wins; otherwise the backend uses the authenticated user's individual link. If no link exists, the first successful sale creates and links a personal seller using the account's name. Identity is based on user IDs, never name matching. Concurrent sales reuse the same identity; any transaction failure rolls back automatic creation.

Open **Roles & Permissions → User sellers**, find the person, select a seller and save. Each user has an individual link; permission roles only group the view. Clearing the link restores automatic assignment on the next sale. Changing roles retains the link, and reassignment preserves existing sales. Reads require `users:read` or `users:write`; updates require `users:write` and are audited.

Legacy overwrite imports preserve linked sellers and account identities. No seed update or historical backfill is required.
