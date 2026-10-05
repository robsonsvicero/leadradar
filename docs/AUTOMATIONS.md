# Tarefas e automações

## Tarefas disponíveis

A página `/tasks` oferece visões de hoje, atrasadas, próximas, concluídas e todas; filtros de responsável, prioridade, tipo e lead; associação opcional a um lead; e criação/conclusão manual. A lista limita a consulta às 500 tarefas mais próximas do prazo.

Status legados (`open` e `done`) continuam aceitos junto aos estados `pending`, `in_progress`, `completed` e `cancelled`. Tarefas concluídas recebem `completed_at`. Tarefas associadas a leads registram criação e conclusão na timeline.

## Cadências manuais

`/cadences` permite criar modelos com etapas, instruções, tipo/prioridade de tarefa e intervalo em dias. Inscrever um lead é uma ação explícita: cria, em uma transação, uma tarefa CRM para cada etapa, com vínculo à inscrição/etapa e prazo calculado a partir da inscrição. As tarefas existentes podem ser acompanhadas e concluídas em `/tasks`; a inscrição termina quando todas forem concluídas. Cancelar uma tarefa de cadência cancela também as tarefas abertas restantes e encerra a inscrição.

As cadências não enviam mensagens, não sincronizam provedores, não detectam respostas nem movem leads no pipeline. Concluir tarefas não executa a etapa seguinte nem inicia uma nova inscrição. Modelos não podem ser alterados após a criação; arquivar impede novas inscrições, sem afetar as existentes. A migration `20261004230000_sales_cadences.sql` cria os modelos, inscrições, tarefas vinculadas, políticas RLS e eventos da timeline.

## Automações não habilitadas

Não há cron, envio automático, briefing diário ou geração periódica de tarefas. A geração de tarefas ocorre somente em resposta à inscrição explícita do usuário. A arquitetura não deve ser tratada como worker ativo: nenhuma ação comercial é executada apenas por visitar uma página.

Antes de ativar jobs agendados, implemente chave de idempotência por organização/lead/etapa, limites de tentativas, timeout, rate limit, logs sem segredos e estados de pausa para resposta, reunião, desinteresse, ganho ou perda. Mensagens continuam sujeitas à revisão humana e integração oficial.
