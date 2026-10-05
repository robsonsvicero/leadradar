# CRM e pipeline

## Disponibilidade

O CRM mantém os estados históricos de lead e adiciona etapas configuráveis por organização. A migration `20261004190000_crm_pipeline_operations.sql` cria as etapas padrão, associa os leads existentes sem apagar seus status e cria a timeline de atividades.

Execute as migrations na ordem indicada no [README](../README.md). A página `/pipeline` (também disponível em `/crm`) carrega no máximo 500 leads por consulta, permite mover um lead entre etapas e filtrar por responsável. A página do lead exibe as 100 atividades mais recentes e permite registrar notas internas. Erros e ausência de dados são apresentados explicitamente.

As etapas padrão são Novo, Qualificado, Contato pendente, Contatado, Respondeu, Reunião, Proposta, Negociação, Ganho e Perdido. A probabilidade armazenada de 0 a 100 é uma estimativa da etapa; não deve ser interpretada como previsão financeira ou promessa de conversão. A tabela já permite etapas personalizadas, mas ainda não há editor visual de pipeline.

## Ownership e permissões

- Todos os membros podem consultar e editar leads da própria organização.
- Somente `owner` e `admin` podem atribuir/reassinar leads e excluir leads ou tarefas.
- As etapas são visíveis aos membros; somente `owner` e `admin` podem configurá-las no banco.
- O banco valida que etapa, responsável, lead associado a uma tarefa e organização pertencem ao mesmo tenant.
- Ao marcar como ganho, o usuário precisa registrar serviço e motivo; ao marcar como perdido, seleciona um motivo padronizado e pode incluir observação.
- A RLS filtra leituras e escritas por `organization_members`; restrições críticas também são aplicadas por triggers.

## Timeline

`lead_activities` registra criação do lead, mudanças de etapa, alterações de Action Score, atribuição de responsável, criação/conclusão de tarefas, notas e eventos manuais do Inbox, reuniões, propostas e cadências. O Inbox (`/inbox`) persiste threads e mensagens sob RLS e atualiza os timestamps de último contato/resposta. A agenda `/meetings` permite agendar e reagendar reuniões, além de registrar realização ou cancelamento; ela não sincroniza calendários nem envia convites ou lembretes. A área `/proposals` cria propostas em rascunho ligadas a leads, calcula totais no banco e registra manualmente envio e decisão; não gera PDF nem envia propostas. Em `/cadences`, modelos com etapas podem ser vinculados a leads; a inscrição gera tarefas datadas, sem execução ou envio automáticos. Consulte [Propostas comerciais](./PROPOSALS.md) e [Tarefas e automações](./AUTOMATIONS.md) para escopo e limites.

## Próximas etapas

A experiência inclui quadro e atualização de etapa por controle de seleção. Arrastar cards, editar as etapas pela interface, paginação incremental, exclusão com confirmação e regras de transição mais estritas ainda não estão implementados.
