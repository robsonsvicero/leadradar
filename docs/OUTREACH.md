# Outreach e mensagens

As funções atuais geram variantes de abordagem e follow-up na ficha do lead. O conteúdo começa como rascunho; edição e aprovação são manuais. Aprovar um rascunho não envia nem agenda a mensagem.

O Inbox (`/inbox`) registra manualmente conversas vinculadas a leads, mensagens recebidas, saídas que já foram enviadas fora do Lead Radar e rascunhos. Esses registros aparecem na timeline e atualizam as datas de último contato/resposta. Rascunhos não são enviados; nenhuma caixa externa é sincronizada e o conteúdo não é enviado à IA automaticamente.

O assistente de resposta continua analisando texto colado manualmente. O texto fornecido diretamente ao assistente não é salvo; registros criados no Inbox são persistidos no Supabase da organização e ficam visíveis a seus membros.

`/cadences` permite montar sequências manuais de tarefas e inscrever leads para organizar prazos de follow-up. A inscrição gera tarefas no CRM, mas não executa as ações nem envia mensagens. As tarefas devem ser realizadas manualmente; respostas continuam sem monitoramento automático.

Não há disparo automático, confirmação de entrega, tracking de abertura ou provider conectado. Para implementar sincronização ou envio, é necessário selecionar e configurar um provider oficial, guardar credenciais nos secrets do backend e incluir autorização, aprovação, idempotência, limites e auditoria antes de ativá-lo.

Consulte [AI.md](./AI.md) e [AI_COSTS.md](./AI_COSTS.md) para configuração dos fluxos que fazem chamadas pagas.
