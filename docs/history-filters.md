# Filtros com busca nos históricos / Searchable history filters

Nos históricos de vendas (`/sales`) e de pagamentos/recebimentos (`/payments/history`), os seletores permitem digitar para encontrar opções. As datas continuam com os campos de calendário existentes, e a disposição lado a lado é preservada, com quebra de linha em telas menores.

| Histórico | Seletores com busca |
|---|---|
| Vendas | Vendedor, cliente e condição de pagamento. |
| Pagamentos/recebimentos | Recebido por e cliente. O responsável continua sendo o usuário que recebeu o pagamento. |

Clique no campo ou na seta para abrir as opções. Digite um trecho do nome para refinar a lista. Para confirmar, clique em uma opção ou use as setas para destacar e **Enter** para selecionar. **Escape** fecha a lista; sair do campo também abandona o texto não confirmado. A seleção anterior permanece aplicada até escolher outra opção ou limpar. O botão de limpar seleção e a opção **Nenhum / None** retiram somente aquele filtro. **Limpar / Reset** remove todos os filtros e textos de busca, inclusive rascunhos ainda não selecionados. No histórico de pagamentos, mudar uma seleção retorna à primeira página.

Somente IDs de opções selecionadas são enviados aos históricos; digitar texto não cria um filtro arbitrário nem altera a seleção em vigor. A interface mostra os nomes selecionados mesmo quando vieram de uma busca fora da primeira página dos cadastros.

A busca de clientes, vendedores e condições reutiliza as consultas `search` dos cadastros, com espera de 300 ms após a digitação. Não fica limitada às opções carregadas inicialmente. A pesquisa mantém as regras desses endpoints: nome e código legado; clientes também podem ser encontrados pelo CPF. As consultas são paginadas pelo servidor, portanto refine o texto para reduzir listas extensas. O seletor **Recebido por** filtra localmente a lista completa de responsáveis retornada pelo endpoint existente. A comparação de nomes não diferencia maiúsculas de minúsculas.

Durante uma consulta, o seletor mostra carregamento e não permite escolher resultados antigos. Há mensagens para ausência de correspondências e falha de consulta, com nova tentativa. As mensagens, instruções de teclado e nomes acessíveis dos controles estão em PT-BR e EN.

## Reuso e validação

A aplicação não possuía combobox/autocomplete compartilhado. Foi criado um único `SearchableSelect`, usado pelos cinco filtros, reaproveitando estilos de formulário, `useDebouncedValue`, React Query, serviços dos cadastros e os contratos de filtro existentes. Não foram adicionadas dependências, endpoints, permissões, migrations nem alterações de seed. Consultas e mapas de nomes das tabelas são preservados durante a edição das buscas.

Os testes em Docker exercitam os dois idiomas, busca por trecho, clique, teclado, limpar, abandono de texto, respostas fora de ordem, debounce, carregamento, erros e retry. Os testes das páginas verificam IDs enviados, opções fora da primeira página, preservação de nomes e a limpeza dos rascunhos. Veja [o guia de testes](testing-docker.md#searchable-history-filters-validation-2026-10-29).

## English operation notes

Sales history offers searchable seller, customer and payment-term selectors. Payment history offers receiving-user and customer selectors. Type to narrow the options, then click an option or use arrow keys and Enter to commit its ID. Escape or leaving the field discards unconfirmed text while retaining the previous selection. Clear selection/None removes one filter; Reset clears every filter and draft search. Payment filters also reset pagination to page one.

Catalog searches use the existing paginated server endpoints after a 300 ms debounce, so matches can be found beyond the initial options. Name/legacy-code search and customer CPF search retain the catalog's existing rules; refine broad searches as needed. Receiving users are filtered locally. Pending or stale results cannot be selected. Loading, no-match and retry feedback, keyboard help and accessible labels are translated in both locales. Existing API contracts and seed data remain unchanged.
