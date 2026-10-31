# Fase 3 — Primeiro corte: cálculo e escala do checkout

> Atualização de 30/10/2026: novas vendas agora aceitam somente unidades inteiras positivas (1 a 99999999999). A escala e a aritmética decimal descritas neste relatório histórico permanecem para os dados existentes e importações. Veja [quantidades de venda](../sales-quantities.md).

Data: **22/10/2026**. Escopo: **TSK-013 / TEC-013, corte inicial**. A fase 3 está em andamento; este incremento não conclui as invariantes financeiras do roadmap.

## 1. Política adotada

A API foi alinhada à prévia existente do PDV, que já arredondava por item. As escalas vêm do schema atual: moeda `numeric(14,2)` e quantidade `numeric(14,3)`. Não houve aumento de precisão nem recálculo histórico. A política de código/documentação é `line-half-up-money-2-quantity-3/v1`:

1. Preço unitário, desconto, valor entregue e demais valores monetários aceitos no checkout têm até duas casas; quantidade positiva tem até três. Precisão excedente é recusada com HTTP 400, antes de depender do arredondamento do PostgreSQL.
2. Converter a representação decimal em inteiros: centavos para moeda, milésimos para quantidade. Multiplicar com `BigInt`, arredondar cada linha para centavos pelo critério half up (meio centavo sobe) e somar as linhas arredondadas. Subtrair o desconto em centavos. Não usar `toFixed` ou multiplicação em ponto flutuante para esses cálculos.
3. Quantidade mínima: `0.001`; máxima: `99999999999.999`. Valor monetário máximo: `999999999999.99`. A linha, o subtotal e o movimento agregado também precisam caber nas colunas. Duas linhas válidas separadamente não autorizam ultrapassar o limite agregado.
4. Linha de preço positivo que arredondaria para zero é recusada, com orientação para aumentar a quantidade. Preço de catálogo explicitamente zero e desconto integral continuam representáveis. Recebimento avulso positivo precisa ter ao menos um centavo; `0.001` não pode ser aceito e persistir como zero.
5. Troco e pendência de novas vendas são diferenças em centavos. O cliente continua enviando números JSON; a API usa o preço oficial do catálogo e recalcula os totais. Campos de prévia enviados pelo cliente continuam sem substituir os valores oficiais, mas passam pela validação de escala/faixa quando fornecidos.

Exemplos comprovados:

| Itens | Desconto | Total |
|---|---:|---:|
| Duas linhas de `0.5 × R$ 0,01` | R$ 0,00 | R$ 0,02 |
| As mesmas duas linhas | R$ 0,01 | R$ 0,01 |
| `0.3 × R$ 0,05` | R$ 0,00 | R$ 0,02 |
| `0.5 × R$ 20,15` | R$ 0,00 | R$ 10,08 |
| `0.001 × R$ 10,00` | R$ 0,00 | R$ 0,01 |

## 2. Implementação e compatibilidade

- API: cálculo exato por linha, subtotal/desconto/total, troco/pendência e agrupamento dos movimentos de estoque de novas vendas. Escala/finitude/faixa validadas no contrato de checkout e na entrada de recebimento avulso.
- PDV: carrinho e prévia usam a mesma política; edição de quantidade aceita milésimos. Valores fora da escala/faixa e subtotal acima do limite não corrompem o carrinho. A prévia inválida bloqueia a confirmação e apresenta mensagem de correção; montantes fora da faixa não chegam ao estado de pagamento.
- Contrato OpenAPI: limites e casas decimais do checkout/recebimento documentados. Não há alteração da estrutura dos DTOs nem dependência npm nova.
- Os contextos Docker de frontend/backend continuam separados. As duas implementações pequenas de aritmética seguem a mesma versão e usam dez vetores de conformidade comuns em [checkout-calculation.v1.json](../../frontend/src/test-fixtures/checkout-calculation.v1.json). A fixture está no contexto do frontend para seu build/teste; testes do backend a leem do checkout completo. `resolveJsonModule` permite tipar essa fixture sem adicionar dependência Node ao frontend.

Entradas anteriormente arredondadas pelo banco passam a receber 400; exemplo: quantidade `0.0001`, pagamento `0.001` ou valor acima de `numeric(14,*)`. O código não transforma silenciosamente essas entradas em outra quantidade/valor. Implantar API e frontend compatíveis e recarregar os PDVs: a prévia antiga com arredondamento binário pode divergir do valor oficial novo.

## 3. Verificação e contraprova

- **138 testes de backend**, **53 de frontend**, **38 de integração PostgreSQL/Redis** e **3 regressões normais**: **232 aprovados**. A regressão TSK-013 passou de `it.fails` para teste normal. Resta **uma falha esperada**, identificada como TSK-016 (checkout anônimo sem quitação).
- Novos testes comparam os dez vetores no domínio, prévia e fluxo HTTP real até PostgreSQL/comprovante. SQL verifica que o subtotal é a soma dos itens, que total = subtotal − desconto e que os movimentos conservam a soma arredondada. Incluem limite máximo, quantidade mínima, desconto integral, preço zero, produto repetido, erro 400, entrada parcial com pendência exata na criação/detalhe/comprovante e rollback por estouro da quantidade agrupada.
- Uma faixa determinística adicional verifica a identidade em centavos para cem pares de quantidades fracionárias. Testes do carrinho verificam preservação de estado em rejeições.
- Lint, TypeScript e build são verificados nos componentes alterados. O harness `node infra/test-disposable.mjs --images --backups` também constrói as imagens, testa autenticação/métricas/SPA e reexecuta backup, simulação em banco separado e persistência após recriação da API.
- **Contraprova:** usando o domínio anterior deste workspace e o teste de regressão agora normal, o total recebido foi `0.01` contra `0.02` esperado. A fonte corrigida foi restaurada em `finally`. O teste corrigido e os ensaios PostgreSQL passaram em seguida.

Os testes de HTTP financeiro usam um ator sintético para chegar às permissões do router; autenticação real tem sua suíte própria. Não foi executado E2E interativo de navegador ou ensaio de carga. Os tempos da fixture pequena de backup não representam RPO/RTO operacional. [Evidências e hashes](13-evidencias-fase-tres.json).

## 4. Limites deste corte

| Item | Estado |
|---|---|
| TSK-013 | Primeiro corte implementado. Reconciliar dados existentes e adicionar constraints locais após a reconciliação; ampliar a política às demais entradas monetárias e cálculos históricos. A versão é identificada no código/documentação, sem novo campo histórico por venda neste corte. |
| TSK-035 | Pendente. Parsers de cadastro/recebimento e a máscara monetária ainda exigem a revisão de sintaxe/localização; este corte não declara parsing estrito completo. |
| TSK-016 | Pendente, com uma regressão esperada explícita. Exigir quitação no contrato operacional e impedir venda anônima incompleta. |
| TSK-012/014/015 | Pendentes: troco líquido em todos os consumidores de saldo, bloqueios de crédito/cliente inativo e idempotência de operações. A diferença exata do troco neste corte não corrige sua contabilização nos agregados antigos. |
| Política de estoque | Bloqueio de estoque negativo confirmado pelo usuário e ainda pendente de implementação com locks/concorrência. A soma exata dos movimentos novos não implementa esse bloqueio. |
| Cancelamento/histórico | Fluxo contábil/autorização para crédito ou reembolso e amostra histórica reconciliada continuam necessários. O caminho anterior de agrupamento usado pelo cancelamento foi preservado. |
| TSK-017/032/027 | Pendentes: snapshots/procedência históricos, KPIs de margem sem produtos de custo ausente e integração/E2E completos. |
| Recuperação/importação | As pendências das fases 1 e 2 continuam abertas; restore e overwrite permanecem desabilitados por padrão. |

A tarefa TSK-013 admite correção online independente, conforme o roadmap; este início da fase 3 não declara as fases anteriores concluídas. Não foram executadas migrações, correções históricas, restore ou importação no banco do usuário. Nenhum commit, push ou deploy foi realizado.

## 5. Reversão

Não há DDL para reverter. Conservar os valores emitidos nesta versão e não recalcular vendas/comprovantes anteriores. Voltar à aplicação anterior reintroduz a divergência demonstrada; coordenar parada/reabertura de PDVs ao trocar as versões e manter o contrato de precisão documentado. Constraints e eventual correção de dados existentes precisam de incremento próprio após reconciliação e recuperação comprovada.
