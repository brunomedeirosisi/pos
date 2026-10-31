# Quantidade de produtos na venda / Sale quantities

No PDV, a quantidade representa unidades inteiras: **1, 2, 3…**. O valor inicial, o mínimo e o incremento dos controles são **1**. Para retirar o produto, use **Excluir**; informar zero não remove um item por engano.

O campo rejeita frações, sinais, separadores decimais, notação exponencial e valores vazios. Um valor inválido não é arredondado: a quantidade e os totais anteriores são mantidos, com orientação em PT-BR/EN. Digitação, colagem e controles de incremento seguem a mesma regra. Adicionar novamente o produto soma uma unidade.

O store do carrinho, a validação antes do fechamento e a montagem do pedido também verificam inteiros positivos. A API valida a mesma regra no contrato HTTP e no caso de uso antes de consultas de preço ou gravações. `POST /api/v1/sales` responde 400 quando a quantidade não é um inteiro positivo ou excede **99999999999**. Continuam sendo verificados os limites monetários, os totais e o movimento agregado de estoque.

O campo de escrita `SaleItemWrite.quantity` no OpenAPI é `integer`, com mínimo 1 e máximo 99999999999. Esse requisito se aplica às **novas vendas**. Integrações que enviavam frações precisam enviar unidades inteiras. A precisão de armazenamento e os contratos de leitura permanecem capazes de representar os dados históricos e importados; não são feitos arredondamentos nem recálculos nesses registros. A aritmética decimal compartilhada permanece disponível para esse histórico. Não há migração de banco ou alteração de seed.

## Validação

Os testes Docker abrangem o mínimo e o incremento, edição/colagem de frações como `1.003`, zero, negativos, notação exponencial, vazio, limites, incremento/decremento, exclusão explícita, valores e quantidades do carrinho preservados em caso de rejeição, mensagens PT-BR/EN, montagem do pedido, validação direta do caso de uso e HTTP com PostgreSQL real. Os testes de aritmética e importação continuam cobrindo o histórico fracionário.

## English

New sales accept positive whole units only. The POS starts at 1 and increments by 1. Invalid edits leave the existing quantity and totals unchanged; use Delete to remove an item. Frontend and API reject fractional/zero/negative/out-of-range quantities without rounding them. The API accepts integers from 1 to 99999999999. Historical/imported quantities, decimal arithmetic, database precision and seed data remain unchanged.

Validação em 30/10/2026: **755 testes no Docker** aprovados (311 frontend, 200 unitários backend, 233 integrações, 4 regressões e 7 verificações de medição), com lint, tipos e builds. A conferência visual reproduziu e rejeitou `1.003`, confirmou incremento/decremento unitário e os totais de R$ 30,00 e R$ 60,00. [Evidência agregada](test-evidence/natural-quantity-docker-20261030.log.gz). A atualização preservou contagens e assinaturas dos saldos, itens e quantidades históricas.
