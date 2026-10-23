# Resumo executivo

> Retrato da base anterior à implementação. Decisões de contexto e controles entregues posteriormente: [registro da fase zero](06-contexto-e-fase-zero.md).

**Auditoria de 21/10/2026 — diagnóstico e planejamento, sem alterações no código da aplicação.** A base inclui alterações locais já presentes; HEAD de referência `ac85924e7a94e836805e770c60db8141c783bca6`.

## Avaliação da saúde técnica

O POS tem uma base tecnológica adequada e pode evoluir incrementalmente. Há autenticação/RBAC, validação de entradas, preços recalculados na API, transação de venda/estoque, índices e testes úteis. A recomendação é manter o monólito modular e corrigir as fronteiras de dados/operação.

O principal risco é **confiar em mecanismos de recuperação e importação que ainda podem deixar a base indisponível ou inconsistente**. As regras financeiras também têm defeitos demonstráveis que afetam saldo e total de venda. Não se recomenda ampliar o uso dos fluxos destrutivos antes de validar sua recuperação.

Foram registrados **39 achados: 4 P0, 26 P1, 7 P2 e 2 P3**. São prioridades de engenharia; não são contagem de incidentes ou de explorações confirmadas. [Inventário completo](02-inventario-problemas.md).

## Riscos que exigem ação primeiro

| Prioridade | Risco | Consequência concreta | Referência |
|---|---|---|---|
| P0 | Segredos permanecem rastreados no Git; arquivos legados precisam de classificação | Quem recebe o repositório pode receber credenciais e possível massa pessoal. Uso em produção e exposição pública não foram confirmados. | [TEC-001](02-inventario-problemas.md#tec-001) |
| P0 | Imagem da API não instala ferramentas de backup nem provisiona armazenamento persistente | Backup pode não funcionar; recriação da API perde arquivos guardados na sua camada local. | [TEC-002](02-inventario-problemas.md#tec-002) |
| P0 | Restore remove schema em etapas e não coordena escritas/worker | Dados confirmados depois do snapshot podem desaparecer; falha intermediária deixa alvo parcial. SQL de origem externa também exige execução isolada. | [TEC-003](02-inventario-problemas.md#tec-003) |
| P0 | Importação overwrite confirma limpeza antes de terminar parsing/migração | Erro posterior pode deixar a base vazia ou parcialmente reconstruída, inclusive com perda de dados nativos. | [TEC-004](02-inventario-problemas.md#tec-004) |
| P1 | Troco, arredondamento e concorrência alteram recebíveis incorretamente | Venda de R$ 100 paga com R$ 150/troco R$ 50 pode criar crédito de R$ 50; operações simultâneas podem aprovar saldo inválido. | [TEC-012](02-inventario-problemas.md#tec-012), [TEC-013](02-inventario-problemas.md#tec-013), [TEC-014](02-inventario-problemas.md#tec-014) |

Outros riscos relevantes: duplicação de recebimentos/estoque em nova importação merge; falta de idempotência online; comprovantes históricos mutáveis; relatórios truncados; ZIP vulnerável; cache privado conservado entre operadores; runtime sem suporte. Cada caso tem evidência, grau de certeza e critérios de validação no inventário.

## Cinco melhorias de maior impacto

1. **Conter segredos e dados desnecessários:** inventariar uso, rotacionar credenciais aplicáveis e substituir massas reais por fixtures adequadas. [TSK-001](03-backlog-tecnico.md#tsk-001).
2. **Comprovar recuperação antes de depender dela:** ferramentas/volumes, lock correto, journal independente, retenção protegida e restauração coordenada. [TSK-002](03-backlog-tecnico.md#tsk-002), [TSK-003](03-backlog-tecnico.md#tsk-003), [TSK-008–011](03-backlog-tecnico.md#tsk-008).
3. **Publicar importações somente após validar:** staging isolado, snapshot, escopo de overwrite e deduplicação entre sessões. [TSK-004](03-backlog-tecnico.md#tsk-004), [TSK-018–020](03-backlog-tecnico.md#tsk-018).
4. **Unificar invariantes financeiras:** pagamento líquido de troco, política de arredondamento, lock por cliente, idempotência e snapshots de recibo. [TSK-012–017](03-backlog-tecnico.md#tsk-012).
5. **Validar o artefato que será entregue:** lockfile, atualização de dependências por alcance e testes reais de SQL, concorrência, imagens e jornada crítica. [TSK-005](03-backlog-tecnico.md#tsk-005), [TSK-007](03-backlog-tecnico.md#tsk-007), [TSK-027](03-backlog-tecnico.md#tsk-027).

## O que foi validado e o que falta

Em cópia temporária isolada, passaram **60 testes do backend e 28 do frontend**, além de tipagem e build dos dois. O lint passou, mas suas configurações atuais não habilitam regras. O frontend gerou bundle principal de 526,53 kB; isso pede medição, não uma reescrita.

Uma verificação adicional das funções reais reproduziu dois itens que somam R$ 0,02 com total da API de R$ 0,01. Outra confirmou que o caso de uso aceita finalizar venda de R$ 100 sem forma de pagamento, valor pago ou cliente. Os testes existentes não cobrem essas falhas.

O backend foi testado com resolução nova do manifesto porque seu lockfile está ausente no estado local. O frontend usou seu lockfile. Os testes rodaram em Windows/Node 24.21.0, enquanto as imagens declaram Node 20. O daemon Docker estava indisponível; banco, fila, restauração e impressora reais não foram testados. Não houve exploração ativa nem leitura dos registros pessoais dos DBFs. Detalhes e limites: [diagnóstico](01-diagnostico-arquitetural.md#8-evidência-de-validação).

## Débitos estruturais mais relevantes

- Worker de importação com aproximadamente 1.882 linhas reunindo parsing, banco, fila e reconciliação.
- Camadas modulares em parte do backend, SQL em rotas em outra parte, além de CRUDs e conversores repetidos.
- Chaves/invalidações de cache por página e contratos duplicados entre OpenAPI, DTOs e tipos do frontend.
- Testes de infraestrutura concentrados em mocks, sem gate de imagem/SQL real ou E2E de caixa.
- Migrações registram checksums sem verificá-los; documentação ainda promete offline/service worker ausentes.

Esses débitos devem ser reduzidos com extrações pequenas e testes de caracterização, depois de proteger os fluxos críticos. [TSK-028–031](03-backlog-tecnico.md#tsk-028), [TSK-038/039](03-backlog-tecnico.md#tsk-038).

## Ganhos esperados e custo de adiar

O plano reduz risco de perda de dados, cobrança incorreta e duplicação; torna recibos e relatórios verificáveis; melhora investigação de falhas; e diminui retrabalho de deploy/refatoração. Esses ganhos são qualitativos: não foram inventados percentuais de economia, capacidade ou retorno financeiro.

Adiar mantém risco de descobrir que o backup não é utilizável durante uma emergência, perder dados após overwrite, cobrar saldo errado, repetir operações após timeout e entregar versão que passa nos mocks mas falha no container. A refatoração visual isolada não corrige essas consequências.

## Ordem de implementação recomendada

**Contenção e base reproduzível → recuperação → importação → invariantes financeiras → fluxos completos → dívida estrutural → otimizações medidas.** Correções financeiras independentes podem ser antecipadas após a base mínima de testes, sem aguardar a refatoração do importador.

O [roadmap](04-roadmap-implementacao.md) organiza sete fases, gates e rollback. O [backlog](03-backlog-tecnico.md) contém 39 tarefas, estimadas inicialmente em **153 pontos relativos**, sem converter pontos em prazo. A equipe deve calibrar a escala e decidir políticas de crédito/reembolso, origem dos dados, RPO/RTO e topologia de impressão antes de fechar cronograma.

Esta entrega cria os cinco documentos de auditoria. Nenhuma melhoria, rotação de credencial, migração, restauração, importação ou mudança de comportamento foi executada.
