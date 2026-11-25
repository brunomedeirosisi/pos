# Seletores com rolagem infinita / Infinite scrolling selects

`SearchableSelect` mantém o combobox e os estilos existentes. O hook `useSelectOptions` reutiliza React Query e `useDebouncedValue` e centraliza carregamento incremental, busca, deduplicação e estados de erro. Os controles de página foram removidos **somente de dentro dos seletores**. Tabelas, históricos e listagens continuam usando `Pagination`/`ListPagination`.

## Inventário

| Módulo | Opções carregadas sob demanda |
| --- | --- |
| PDV | Clientes, vendedores e condições de pagamento |
| Histórico de vendas | Filtros de cliente, vendedor e condição de pagamento |
| Recebimentos e histórico de pagamentos | Clientes e usuários recebedores |
| Produtos | Grupo do formulário; produto e responsável no histórico de estoque |
| Administração de usuários | Perfis |
| Perfis: vínculos individuais | Vendedores; removida a carga antecipada do catálogo ao abrir o diálogo |
| Dashboard | Lojas, vendedores, categorias e condições de pagamento |
| Impressão | Impressoras habilitadas; mantida a validação individual do destino salvo |

Todos esses pontos já utilizam o mesmo componente; a alteração aplica-se a eles sem duplicar implementações. A varredura também identificou seletores nativos de listas fixas: status, tipo de movimento, método de pagamento, canal, ordenação, métricas, mês/ano, horas/minutos e tamanho de página de tabelas. Esses controles não têm paginação interna nem consultam catálogos crescentes e continuam completos. Não há outra biblioteca de Select, Autocomplete ou Combobox, nem um seletor múltiplo de registros separado.

## Comportamento e contrato

- `resource` seleciona `lists/<resource>`. A lista começa a carregar ao abrir o dropdown. Uma seleção salva pode exigir antes uma consulta exata por `optionId` para recuperar seu nome.
- `pageSize` configura o lote: padrão **40**, intervalo de 1 a 100, compatível com a API existente.
- `IntersectionObserver` observa um sentinela com o próprio popup como raiz e margem inferior de 80 px. O evento de scroll também cobre navegadores sem Observer e rolagem por toque. Setas no final das opções carregadas solicitam mais dados.
- As páginas são concatenadas e deduplicadas por `value`. Respostas vazias, últimas páginas e páginas ajustadas para trás encerram a carga. Um lote com erro exige nova tentativa explícita, evitando ciclos de requisições.
- Uma trava e `fetchNextPage({ cancelRefetch: false })` evitam requisições repetidas do mesmo lote. Busca com debounce de 300 ms, chave por recurso/filtros/termo/lote e `AbortSignal` até o `fetch` isola respostas obsoletas. Cancelamento não aparece como falha para o usuário.
- Busca remota consulta o conjunto completo no servidor. Busca local filtra todo `options` antes de recortar os lotes; trocar o termo reinicia a janela local.
- `options` também fornece nomes conhecidos. Nomes escolhidos permanecem disponíveis fora da página/pesquisa atual. `labelField` mantém suporte a `name`, `full_name`, `display_name` etc.
- Seleção única mantém `value: string` e `onChange(option)`. O modo opcional `multiple` aceita `value: string[]` e `onChange(options)`, alterna itens sem fechar e mantém nomes e IDs anteriores. Limpar retorna `[]`.
- O adaptador legado `loadOptions(search)` mantém busca remota e exibição incremental do array retornado. Ele não fornece metadados de paginação; novos catálogos devem usar `resource`. Nenhum seletor da aplicação depende desse adaptador.

O popup mantém `max-height: min(280px, 50vh)`. Novos lotes preservam o popup, os itens anteriores, o scroll, o foco e a opção ativa. Trocar origem/pesquisa ou reabrir reinicia a posição visual. O cache conserva páginas recentes por chave.

Carregamento inicial/adicional, lista vazia, pesquisa sem resultados e falha com nova tentativa têm textos em **PT-BR e EN**. O fim é silencioso. Combobox/listbox, `aria-activedescendant`, `aria-selected`, `aria-multiselectable`, `aria-busy` e região de status mantêm a semântica acessível. Enter seleciona; Escape descarta a pesquisa e mantém a seleção; Tab/blur fecha; composição IME não confirma acidentalmente.

## APIs, dados e limites

Nenhum endpoint, permissão ou formato HTTP foi alterado. As APIs existentes já buscam antes da paginação, limitam respostas e ordenam com desempate por identidade. `pagination.page` e `pagination.totalPages` determinam o próximo lote. O cliente HTTP e `listPage` agora aceitam cancelamento opcional sem alterar as chamadas anteriores.

Não há migração, dependência ou alteração de seed: os testes criam coleções sintéticas com mais de 100 registros. A paginação continua por offset. Mudanças concorrentes no catálogo entre requisições não têm snapshot global: deduplicação e tratamento de páginas ajustadas evitam duplicatas e ciclos, mas não oferecem a consistência de um cursor/snapshot entre todos os lotes.

A lista cresce no DOM conforme o usuário navega; não há virtualização. Ela foi considerada e deixada para uma necessidade medida, preservando os elementos usados pela navegação e ARIA. A carga inicial é limitada a um lote, sem buscar o catálogo inteiro. Bases grandes e offsets profundos continuam sujeitos aos custos descritos no [contrato de paginação](pagination.md).

## Validação

Executar pelos [runners Docker](testing-docker.md). Os testes do combobox em ambos os idiomas cobrem mais de 100 opções, busca local completa/remota, debounce, resposta antiga e cancelamento, seleção salva/múltipla, Observer e fallback por scroll, teclado/IME, falhas iniciais/adicionais e retry, preservação de scroll/foco/itens, deduplicação e fim/página ajustada. Os testes de páginas continuam verificando formulários e paginação convencional. O teste de serviço confirma cancelamento até o `fetch`; a integração PostgreSQL verifica ordenação estável com nomes repetidos e busca/seleção além da primeira página.

English: all growing record selectors reuse `SearchableSelect` with 40-item infinite loading, server-wide debounced search, cancellation, retained selections and localized status/retry messages. Local sources and optional multiple selection share the same component. Table pagination and fixed native choice controls retain their behavior. Existing list APIs are reused; no migration or seed update is required. Offset pagination and the progressively growing DOM retain the limitations above.
