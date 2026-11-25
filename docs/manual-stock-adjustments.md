# Ajuste manual de estoque

Em **Produtos**, Admin e Gerente podem selecionar **Ajustar estoque / Adjust stock**. O formulário faz uma nova consulta ao servidor em cada abertura, mesmo que haja saldo em cache, e mostra produto/código, saldo somente para leitura, nova quantidade, diferença e motivo obrigatório. **Revisar ajuste** abre uma confirmação; somente **Confirmar ajuste** envia a alteração. Cancelar não altera o saldo. A nova quantidade é sempre um inteiro entre 0 e 99.999.999.999. Digite os números sem separadores; a exibição dos saldos usa o idioma PT-BR ou EN.

Uma venda, cancelamento ou outro ajuste pode mudar o saldo enquanto o formulário está aberto. Nesse caso, a confirmação é recusada. Use **Recarregar estoque atual**, confira novamente a diferença e repita a confirmação. Depois de uma falha de conexão, repetir a mesma confirmação usa a mesma identificação, sem aplicar a movimentação duas vezes.

**Visualizar** abre os detalhes para quem possui `catalog:read`, inclusive quem não pode editar o cadastro. Os detalhes e o formulário de edição incluem **Histórico de Estoque / Stock history**, com data/hora, responsável, identificação do produto, saldo anterior, saldo novo, diferença e justificativa. Os filtros permitem selecionar período, produto, usuário e aumento/redução. O histórico é paginado e mantém os nomes e códigos registrados no momento da operação, mesmo após renomeações.

## Acesso e validação

- Perfis internos `admin` e `manager` precisam de `stock:adjust` ou `*`. A migração concede a permissão ao Gerente padrão; o Admin mantém seu acesso por `*`. Um perfil diferente não recebe acesso, mesmo se tiver `catalog:write`, `stock:adjust` ou `*`.
- O frontend oculta a ação e a API consulta novamente usuário ativo, perfil e permissões no banco antes de gravar. A identidade vem da sessão autenticada, nunca do corpo da requisição. Os registros do usuário/perfil ficam bloqueados até o fim da transação, impedindo revogação concorrente no meio da operação.
- Motivos vazios, apenas espaços, com NUL ou acima de 1.000 caracteres são recusados. Quantidades negativas, fracionadas, não numéricas ou fora da faixa também são recusadas. Um ajuste sem variação é recusado.
- O estoque inicial de **novos produtos** segue a regra de inteiros e de acesso: somente Admin/Gerente autorizados podem informar uma quantidade positiva. Outros usuários com permissão de cadastro podem criar metadados com saldo zero. Essa entrada inicial também recebe auditoria, na mesma transação.
- Saldos históricos importados não são arredondados nem regravados. Se um saldo antigo tiver fração, o ajuste conserva exatamente a diferença necessária para chegar ao novo inteiro informado.

## Persistência, concorrência e auditoria

O saldo continua sendo calculado pelo [mecanismo compartilhado de estoque](product-stock.md). Um ajuste cria somente uma movimentação **`ajuste_manual`**, com quantidade assinada e `origin=operational`. O estoque anterior não é substituído por um campo editável no cadastro. A reconciliação legada continua preservando essas operações novas.

A migração `20261107_001_manual_stock_adjustments.sql` adiciona `product.stock_version`. Triggers incrementam essa versão e bloqueiam o produto em toda inclusão, alteração ou exclusão de movimento e reconciliação legada. Ajustes usam a versão consultada pelo operador, bloqueiam o produto e leem o saldo novamente antes de calcular a diferença. Escritas de vendas/cancelamentos e do importador bloqueiam múltiplos produtos em ordem estável. Uma publicação legada em andamento impede ajustes manuais. Os cálculos da diferença usam unidades inteiras de milésimos para conservar os saldos históricos exatamente.

A movimentação e o evento **`STOCK_MANUAL_ADJUSTMENT`** são confirmados na mesma transação, usando `logAudit` e a tabela central `audit_log`. Uma falha de auditoria reverte movimento e versão. Tentativas recusadas ou falhas são registradas separadamente após rollback, com resultado `failure`; elas não aparecem como alterações concluídas no histórico. A indisponibilidade da auditoria nunca autoriza um sucesso sem log. O logger central também registra identidade do evento, usuário, produto e resultado.

Cada evento de sucesso contém ID único, timestamp persistido, ID/nome/perfil do responsável, ID/código/nome do produto, saldo anterior, saldo novo, diferença, justificativa, resultado e ID da movimentação. Os valores decimais exatos e as identidades são preservados no JSON da auditoria. Eventos de falha registram o alvo quando conhecido, identidade autenticada quando disponível, quantidade solicitada e código do erro; o saldo não sofre alteração.

Triggers recusam UPDATE/DELETE de eventos manuais e TRUNCATE da auditoria. A aplicação não oferece rotas para editar ou apagar eventos. Renomear produtos ou usuários não reescreve os snapshots. Backups incluem os registros e sua proteção; restauração administrativa continua seguindo o fluxo autorizado de recuperação.

## API

`GET /api/v1/products/{id}` e as listas retornam `stock_version` como string opaca, além de `current_stock`. A confirmação usa:

```http
POST /api/v1/products/{id}/stock-adjustments
Content-Type: application/json

{
  "request_id": "f12a2d21-9d7e-4aa1-a9cf-54e4136d310b",
  "expected_version": "7",
  "new_quantity": 25,
  "reason": "Conferência física do estoque"
}
```

Sucesso retorna 201 com ID do evento, produto, saldos anterior/novo, diferença e versão resultante. Uma repetição idêntica retorna o mesmo recibo. Reutilizar o ID com outro usuário, produto ou conteúdo é recusado. Conflitos de versão/publicação retornam 409; validação retorna 400, ausência de sessão 401 e falta de autorização 403. O cadastro comum via PATCH continua ignorando alterações diretas de saldo.

O histórico usa `GET /api/v1/lists/stock-adjustments` com `product_id`, `user_id`, `from`, `to`, `movement_type=increase|decrease`, `page`, `pageSize` e ordenação por `created_at`. `GET /api/v1/lists/stock-adjustment-users` fornece os responsáveis para o seletor existente. Ambas as consultas exigem `catalog:read` e usam a paginação compartilhada.

## Implantação e testes

A atualização exige a migração versionada e backup antes da implantação. Ela adiciona controles e permissões sem alterar quantidades existentes nem inventar ajustes passados. O seed de perfis inclui `stock:adjust` para o Gerente; os benchmarks de dados não precisam mudar.

Os testes Docker exercitam sessões reais de Admin, Gerente, vendedor e perfil customizado, recusa por API direta, revogação após login, validação, logs de sucesso/falha, proteção dos eventos, filtros/paginação, rollback, idempotência e concorrência real com checkout. Os testes de interface cobrem PT-BR/EN, confirmação/cancelamento, diferença, valores inteiros, justificativa, conflito e recarga, repetição de falha de rede, leitores e histórico. Vendas, cancelamentos, importação e recuperação continuam nas suítes de regressão existentes. Evidência e contagens: [testes em Docker](testing-docker.md).

## English operation notes

Admin and Manager users with `stock:adjust` (or `*`) can use **Adjust stock**, enter a nonnegative whole quantity and mandatory reason, review the delta and explicitly confirm. Other profiles retain read access only. Stock history is available through **View**, with date/product/user/direction filters and pagination. A stale stock version requires an explicit reload and review. Identical confirmation retries are idempotent.

Each adjustment appends a signed operational movement and an immutable central audit event in one transaction. Audit snapshots retain the actor/profile/product identities, original/new quantities, delta, reason, timestamp and outcome. Failed attempts are logged without committing stock changes. Existing imported balances and automatic movements are preserved; shared locking/version triggers coordinate sales, cancellations and adjustments. New opening stock also requires authorized profiles and whole quantities. Existing historical fractions remain exact.
