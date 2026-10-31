# Data da venda / Sale date

O formulário de vendas (PDV) possui **Data da venda**, usando o componente compartilhado `DateInput` empregado nos filtros e recebimentos, com exibição fixa **DD/MM/YYYY**. A sugestão inicial é hoje no calendário local do terminal. O usuário pode selecionar uma data anterior; datas futuras não são aceitas.

A data aparece no resumo antes da confirmação. O campo é obrigatório, informa erros em PT-BR/EN e fica bloqueado durante o envio. Uma falha mantém a data e o carrinho para nova tentativa; após sucesso, a próxima venda recebe a sugestão de hoje. Se a tela ficar aberta na virada do dia ou voltar a receber foco, a sugestão é atualizada sem substituir uma escolha manual.

## Validação e armazenamento

- A tela valida preenchimento, calendário real, ano entre 0001 e 9999 e limite até hoje. O seletor permite usar o calendário ou digitar sempre em DD/MM/YYYY, com inclusão automática das barras ao digitar apenas números.
- `POST /api/v1/sales` recebe `emission_date` como `YYYY-MM-DD`, sem hora ou offset. Rejeita nulo, vazio, datas inexistentes (incluindo 29/02 em ano não bissexto), formatos locais, timestamps e datas futuras com HTTP 400, sem gravar venda, itens ou movimentação de estoque.
- Clientes antigos da API que omitem `emission_date` continuam funcionando: o backend usa `CURRENT_DATE` no fuso do banco/loja. A validação de futuro usa esse mesmo dia oficial. Configure o calendário do terminal de acordo com o fuso da loja.
- A data escolhida continua sendo string até o PostgreSQL `DATE`. Não é convertida para meia-noite UTC. Estoque, detalhes e histórico conservam esse mesmo dia.
- O recibo imprime a data da venda. Quando `paid_at` pertence a outro dia, o horário da venda aparece como `--:--`; não se inventa um horário para uma compra retroativa. `paid_at` permanece como timestamp da transação, sem ser alterado pela escolha da data.

O campo e a coluna `emission_date` já existiam no contrato/banco. Não são necessárias migrações ou alterações de seed. A permissão `pos:checkout` continua obrigatória.

## Testes Docker

Os testes de frontend cobrem PT-BR/EN, sugestão local (incluindo horários em que UTC já está no dia seguinte), seleção e confirmação de dia anterior, campos inválidos, virada do dia, envio pendente, falha/retry e reinicialização após sucesso. Os testes de API com PostgreSQL real verificam datas bissextas/DST, validação antes das escritas e consistência de venda, estoque, histórico e recibo.

Procedimento: [testing-docker.md](testing-docker.md). Os testes só gravam fixtures sintéticas no projeto descartável; não criam vendas no banco operacional para validar o recurso.

Validação de 29/10/2026: 586 testes passaram em Docker (178 unitários do backend, 181 integrações, 4 regressões, 7 verificações de medição e 216 testes do frontend), com lint, tipos e builds aprovados. Os 47 testes de data/PDV do frontend e os 35 de checkout/API também passaram em UTC e Pacific/Auckland, além da execução principal em America/Sao_Paulo. [Evidência agregada](test-evidence/sale-date-docker-20261029.log.gz).

## English

The POS **Sale date** field reuses the shared date picker with a fixed **DD/MM/YYYY** text field and suggests today's local date. It is required and accepts today or an earlier real calendar day. The checkout summary shows the selected date. Submission failure preserves the date/cart; successful checkout resets the suggestion. Midnight/focus refreshes the suggestion without changing an explicit selection.

The API accepts a date-only `YYYY-MM-DD`, rejects invalid/future values before writes, and preserves the chosen day in sales, stock, history and receipts without UTC conversion. Older clients may omit the field to use the store database's current day. The actual transaction timestamp remains independent. No schema migration or seed change is required.

## Formato de datas na interface

O campo compartilhado `DateInput` apresenta **DD/MM/YYYY** em PT-BR e EN, independentemente do idioma do navegador. Permite digitação, valida dias reais e limites e oferece calendário com seleção de mês/ano e navegação por teclado. Reutiliza o `Modal` existente. No PDV, continuam obrigatórias a data atual sugerida e a validação de datas futuras. O valor válido transmitido à API permanece `YYYY-MM-DD`, sem conversão para UTC.

A mesma entrada é usada nos filtros de vendas, pagamentos, cliente e dashboard, e no registro de pagamento. Datas incompletas ou impossíveis recebem feedback e não disparam consultas de listagem. A validade do código de pareamento de impressora também utiliza `DD/MM/YYYY HH:mm`. Listagens, detalhes, históricos, recibos e relatórios já utilizavam os formatadores compartilhados. Não há alteração de banco, contratos de API ou seed.

Validação do formato em 30/10/2026: **294 testes de frontend** passaram no Docker com lint, tipos e build. Os **79 testes de datas/vendas** também passaram em UTC e Pacific/Auckland. A conferência visual confirmou a seleção/digitação em DD/MM/YYYY, o bloqueio de futuro no PDV e o calendário em viewport de 375 px. [Evidência](test-evidence/date-format-docker-20261030.log.gz).

Na validação de quantidades em 30/10/2026, a execução da suíte no fuso America/Sao_Paulo também identificou e corrigiu a serialização dos filtros do dashboard: os parâmetros são enviados ao PostgreSQL como dias ISO, sem horário. Isso evita que a data escolhida retroceda um dia conforme o fuso do processo da API.
