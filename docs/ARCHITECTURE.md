# Arquitetura

## Prospecção

```text
React (Nova Prospecção)
  -> Supabase Auth + associação organization_members
  -> Edge Function prospecting-search
  -> Google Places API (Text Search)
  -> PostgreSQL: companies, prospecting_jobs, prospecting_job_companies
  -> análise pública do website, captura de e-mail de contato publicado e PageSpeed quando configurado
  -> digital_analyses, lead_signals e leads
  -> polling TanStack Query na página do job
```

O cliente nunca envia ou recebe a chave do Google. A Edge Function valida o JWT, confirma a associação do usuário à organização e executa as gravações com a chave de serviço apenas no backend. RLS limita a leitura das tabelas de jobs, análises, sinais e consumo à organização do usuário.

O analisador salva o primeiro endereço de e-mail público encontrado no HTML do website da empresa. A lista de leads o apresenta como link de e-mail; endereços não são inferidos quando não aparecem na página analisada.

A prospecção é B2B: segmentos prioritários do ICP e segmentos atendidos por serviços ativos descrevem empresas/profissionais compradores. Cada lead mantém separados a oportunidade técnica (evidências do site) e o ajuste ao alvo B2B (categoria pública do Google Places comparada à configuração); ajuste não implica intenção de compra. O ICP Match usa esses resultados e as localizações configuradas, em vez de considerar todos os leads automaticamente aderentes.

## Cadastro administrativo de organizações

O administrador da plataforma cadastra nome, endereço, e-mail do administrador e WhatsApp em Configurações. A Edge Function `admin-organizations` revalida o JWT e o perfil de administrador, cria a organização, convida o e-mail com Supabase Auth e associa o usuário como owner. Cadastros comuns não podem criar organizações por RPC ou diretamente via RLS. O convite redireciona para `/set-password`; o destinatário define sua própria senha e entra no workspace.

  ## Inteligência comercial com IA

  ```text
  Ficha de empresa vinculada a um lead real
    -> Supabase Auth + membership da organização
    -> Edge Function analyze-lead
    -> contexto mínimo: empresa, sinais, análise digital, ICP e serviços
    -> OpenAI Responses API com Structured Outputs
    -> validação Zod + referências de evidência
    -> cálculos determinísticos de ICP, Buying Moment e Action Score
    -> ai_analysis_logs + atualização do lead
    -> React Query atualiza a ficha e mantém os dados técnicos

  Ficha do lead
    -> Edge Function generate-outreach
    -> três variantes estruturadas baseadas em evidências
    -> ai_outreach_drafts (draft)
    -> edição e aprovação humana
    -> aprovado não significa enviado

  Ficha do lead + resumo do contato fornecido pelo usuário
    -> Edge Function generate-follow-up
    -> três variantes estruturadas ancoradas no resumo e em evidências
    -> ai_follow_up_drafts (draft)
    -> edição e aprovação humana
    -> aprovado não significa enviado ou agendado

  Ficha do lead + resposta colada manualmente pelo usuário
    -> Edge Function generate-reply-assistant
    -> classificação de intenção/sentimento + resposta e próximo passo sugeridos
    -> ai_analysis_logs (reply_assistant)
    -> texto recebido não é persistido; histórico contém somente o resultado
    -> revisão humana; nenhuma mensagem ou tarefa é criada automaticamente
  ```

  `OPENAI_API_KEY` só existe nos secrets das Edge Functions. As funções derivam a organização pelo lead e verificam membership antes de ler contexto empresarial com service role. RLS limita o histórico e os rascunhos à organização. Rate limits por dia usam o RPC `claim_ai_usage`; resultados válidos podem ser reutilizados por hash do contexto, modelo e versão do prompt.

## CRM operacional

```text
Supabase organizations + organization_members
  -> pipeline_stages seeded per organization
  -> leads.pipeline_stage_id + owner_id + next_action
  -> lead_activities timeline, populated by database triggers
  -> /pipeline Kanban and /companies/:id activity timeline
  -> tasks with assignee, due date, source and completion time
  -> /tasks day/overdue/upcoming/completed filters
  -> /inbox manually recorded conversations and messages
  -> /meetings scheduled/completed/cancelled sales meetings
  -> /proposals draft proposals, manually recorded status changes and itemized totals
  -> /cadences reusable manual task plans, lead enrollments and generated CRM tasks
```

`20261004190000_crm_pipeline_operations.sql` adds the pipeline and activity tables, validates that stages, owners, task leads and assignees belong to the same organization, limits reassignment and destructive deletes by membership role, and enables RLS. The frontend reads at most 500 leads and tasks per page load; full server-side cursor pagination is still pending. Timeline events currently cover lead creation, stage/owner/score changes, task creation/completion, notes and manually recorded messages.

`20261004200000_inbox_conversations.sql` adds manually maintained conversation threads and messages with organization-scoped RLS, tenant-safe lead/thread foreign keys, activity timeline events, and last-contact/response timestamps. The Inbox does not connect to e-mail or messaging providers and never sends a message.

`20261004210000_sales_meetings.sql` adds organization-scoped meetings linked to leads, validates meeting data, and records scheduled/rescheduled/completed/cancelled events in the lead timeline. The internal agenda does not connect to external calendars or send invitations/reminders.

`20261004220000_sales_proposals.sql` adds organization-scoped proposals and items linked to leads. An authenticated RPC creates proposal headers and items atomically; generated line totals and the proposal aggregate are calculated in PostgreSQL. RLS and database triggers restrict editing to drafts, validate status transitions, and record proposal events in the lead timeline. Sending, PDF generation and e-signatures are not implemented.

`20261004230000_sales_cadences.sql` adds organization-scoped cadence templates, immutable ordered steps, lead enrollments and CRM task linkage. An authenticated RPC creates enrollment and all dated tasks atomically. Task completion/cancellation updates enrollment state through database triggers; no worker, provider, response monitor or outbound messaging is involved.

Leads can be deleted individually or in bulk from the leads list after confirmation. Database access remains restricted to organization owners and admins. Related CRM records with cascade rules are removed; tasks are retained without their lead and cadence links.

## Componentes

- `src/features/prospecting`: formulário e acompanhamento do job
- `src/services/prospecting/prospectingService.ts`: acesso a funções, jobs e resultados; inclui armazenamento local de demonstração
- `src/services/prospecting/scoring.ts`: normalização, deduplicação e cálculos determinísticos reutilizados pelos testes e Edge Function
- `supabase/functions/prospecting-search`: valida a solicitação, cria/cancela jobs e orquestra pesquisa e pontuação
- `supabase/migrations/20261004130000_prospecting_engine.sql`: migration aditiva com tabelas e políticas RLS
- `supabase/functions/_shared/ai-core.ts`: autenticação, contexto, quotas, chamada Responses API, validação, persistência e auditoria
- `supabase/functions/_shared/ai-prompts.ts`: instruções de sistema versionadas
- `src/services/ai`: schemas estruturados e cálculos determinísticos de score
- `supabase/migrations/20261004160000_ai_sales_intelligence.sql`: ICP/serviços/perfil, histórico, rascunhos, feedback, quota e policies RLS
- `supabase/migrations/20261004170000_ai_organization_configuration.sql`: porte desejado no ICP e escrita de configurações restrita a owner/admin
- `supabase/migrations/20261004180000_ai_follow_up_drafts.sql`: rascunhos de follow-up, leitura RLS por organização e status de aprovação
- `supabase/migrations/20261004190000_crm_pipeline_operations.sql`: etapas do pipeline, ownership, atividades, validação de tenant e policies por role
- `supabase/migrations/20261004200000_inbox_conversations.sql`: conversas e mensagens manuais, vínculo tenant-safe com leads, policies RLS e eventos da timeline
- `supabase/migrations/20261004210000_sales_meetings.sql`: agenda interna, reuniões com lead vinculado, RLS e eventos na timeline
- `supabase/migrations/20261004220000_sales_proposals.sql`: propostas itemizadas, totais calculados no banco, RLS, transições controladas e eventos na timeline
- `supabase/migrations/20261004230000_sales_cadences.sql`: modelos manuais de cadência, inscrições tenant-safe, criação transacional de tarefas e atualização de estado
- `src/services/ai/organizationAISettingsService.ts` e `src/features/settings/settings-page.tsx`: configuração de ICP, pesos, serviços e voz comercial
- `src/services/ai/aiSdrWorkspaceService.ts` e `src/features/ai-sdr/ai-sdr-page.tsx`: filas multi-organização de tarefas, recomendações, leads priorizados e rascunhos aprovados; a leitura não dispara ações de IA
- `supabase/functions/generate-follow-up` e `ai_follow_up_drafts`: follow-up contextual iniciado pelo usuário; exige resumo do contato, não depende de caixa de entrada e não envia ou agenda mensagens
- `supabase/functions/generate-reply-assistant` e `ReplyAssistantSchema`: classificação iniciada pelo usuário; processa texto colado, persiste somente o resultado estruturado e não envia mensagens
- `src/services/crm/pipelineService.ts` e `src/features/crm/crm-page.tsx`: leitura do pipeline, atualização de etapas/responsáveis e acesso à timeline
- `src/features/companies/lead-activity-timeline.tsx`: histórico do lead e notas internas; registros reais usam `lead_activities` sob RLS
- `src/services/tasks/taskService.ts` e `src/features/tasks/tasks-page.tsx`: tarefas com organização, lead, responsável, prioridade e prazo explícitos
- `src/services/inbox/inboxService.ts` e `src/features/inbox/inbox-page.tsx`: histórico manual de conversas, rascunhos sem envio e registro de mensagens externas já enviadas
- `src/services/meetings/meetingService.ts` e `src/features/meetings/meetings-page.tsx`: agenda de reuniões vinculadas a leads com status e pauta
- `src/services/proposals/proposalService.ts` e `src/features/proposals/proposals-page.tsx`: criação de propostas em rascunho com itens, totais em BRL e registro manual de status
- `src/services/cadences/cadenceService.ts` e `src/features/cadences/cadences-page.tsx`: modelos tabulados, inscrição explícita de leads e acompanhamento das tarefas geradas

O worker atual realiza a pesquisa e o processamento em uma Edge Function. O job é persistido primeiro e acompanhado por polling a cada 3 segundos enquanto estiver ativo. É permitido um job ativo por organização.

## Pontuação

- Technical Score: estimativa determinística de oportunidade de melhoria digital; ausência de website, baixa performance, problemas de SEO/mobile, HTTPS ou ausência de CTA elevam o score.
- ICP Match: usa segmento/localização da consulta e dados observados de avaliação e volume de avaliações. Não infere faturamento ou número de funcionários.
- Lead Score: 50% Technical Score, 30% ICP Match e 20% força dos sinais.
- Classificação: 80–100 Hot, 60–79 Warm, 0–59 Cold.

Os scores são regras iniciais, não uma avaliação produzida por IA. Evidências indisponíveis permanecem nulas e não geram sinal.

No passo de IA, o AI Score representa a confiança da oportunidade produzida e o Action Score é uma composição determinística de ICP, oportunidade técnica, sinais, Buying Moment, confiança e reachability. O modelo não escolhe livremente o Action Score. Consulte [AI.md](./AI.md) para configuração e limites e [AI_COSTS.md](./AI_COSTS.md) para a contabilização.

## Configuração e controles operacionais

- `src/config/env.ts` valida variáveis públicas com Zod; `src/config/featureFlags.ts` fornece flags de build para rotas.
- `src/lib/observability/logger.ts` padroniza eventos com contexto allowlisted e oferece ponto de integração para error tracking externo; nenhum fornecedor está conectado por padrão.
- `src/components/error-boundary.tsx` impede que falhas de renderização mostrem detalhes internos ao usuário.
- Rotas de domínio são carregadas sob demanda; o código de bibliotecas é dividido em chunks por `vite.config.ts`.
- `supabase/migrations/20261004250000_production_security_foundations.sql` endurece criação de organização/memberships e instala rate limiting atômico de busca. Aplicar em staging e produção antes de depender desses controles.
- `supabase/functions/health` oferece readiness genérica sem retornar detalhes de infraestrutura; configure `verify_jwt=false` somente para esse endpoint.
- `.github/workflows/ci.yml` executa lint, testes e build em PR/push; o status Actions só existe após publicação do workflow no remoto.

Prontidão operacional, itens que ainda requerem infraestrutura e riscos verificados estão em [PRODUCTION_AUDIT.md](./PRODUCTION_AUDIT.md).
