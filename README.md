# Lead Radar AI

O Lead Radar AI é uma base de SaaS para prospecção B2B e gestão de pipeline, construída com React, TypeScript, Vite, Tailwind CSS, componentes UI estilo shadcn, React Router, TanStack Query e arquitetura pronta para Supabase.

Este projeto foi pensado como uma fundação profissional para uma SaaS de crescimento multi-tenant, e não como um produto de negócios totalmente implementado. A ideia é criar a estrutura correta de app, separação de responsabilidades, autenticação, shell do aplicativo protegido e contrato de dados multi-tenant para expansão futura.

## Stack

- React 19 + Vite + TypeScript
- Tailwind CSS
- React Router
- TanStack Query
- Cliente Supabase
- React Hook Form + Zod
- Ícones Lucide
- Vitest + Testing Library

## Arquitetura

- `src/app`: inicialização da aplicação, providers e proteção de rotas
- `src/components`: componentes reutilizáveis de layout e UI
- `src/features`: páginas por funcionalidade e domínio
- `src/hooks`: hooks com estado, incluindo autenticação
- `src/lib`: utilitários compartilhados e cliente Supabase
- `src/services`: lógica centralizada de negócio e integração
- `src/types`: contratos compartilhados do domínio
- `supabase/schema.sql`: base para schema SQL e políticas RLS multi-tenant
- `supabase/migrations`: alterações incrementais do banco
- `supabase/functions`: integrações server-side e processamento dos jobs
- `docs/ARCHITECTURE.md`, `docs/PROSPECTING.md` e `docs/AI.md`: arquitetura e configuração dos motores

## Desenvolvimento local

1. Instale as dependências

```bash
npm install
```

2. Copie o arquivo de ambiente

```bash
cp .env.example .env.local
```

3. Preencha as variáveis públicas do Supabase no arquivo `.env.local`

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon
VITE_PROSPECTING_MOCK_MODE=false
```

4. Inicie a aplicação

```bash
npm run dev
```

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm test
```

## Modo de demonstração da prospecção

Durante o desenvolvimento, se `VITE_PROSPECTING_MOCK_MODE` não estiver definido, a prospecção usa dados fictícios locais para permitir testar o formulário, o acompanhamento do job e a renderização dos resultados. A interface deixa claro que esses registros são demonstração; eles ficam somente no `localStorage`.

Defina `VITE_PROSPECTING_MOCK_MODE=false` para usar o backend real. Em build de produção, a demonstração permanece desativada. O modo demo da prospecção é separado das credenciais do Supabase e não simula resultados reais do Google.

## Configuração do Supabase

O projeto espera um schema multi-tenant com organizações, perfis, associação de usuários às organizações, empresas, leads, tarefas e logs de atividade.

Importe a base em `supabase/schema.sql` no editor SQL do Supabase e ajuste conforme as necessidades finais do produto.

Para atualizar um banco que já recebeu o schema base, execute também `supabase/migrations/20261004130000_prospecting_engine.sql`. Ela cria as tabelas para jobs, resultados por job, análises digitais, sinais e consumo de APIs, além de adicionar campos usados no pipeline.

Para ativar inteligência comercial, aplique depois `supabase/migrations/20261004160000_ai_sales_intelligence.sql`, `supabase/migrations/20261004170000_ai_organization_configuration.sql` e `supabase/migrations/20261004180000_ai_follow_up_drafts.sql`, configure `OPENAI_API_KEY` e os limites de IA como secrets das Edge Functions, e publique `analyze-lead`, `analyze-lead-deep`, `generate-outreach`, `generate-follow-up`, `generate-reply-assistant` e `ai-feedback`. Consulte [docs/AI.md](./docs/AI.md), [docs/AI_PROMPTS.md](./docs/AI_PROMPTS.md) e [docs/AI_COSTS.md](./docs/AI_COSTS.md) antes de habilitar chamadas pagas.

Para o CRM operacional, aplique por último `supabase/migrations/20261004190000_crm_pipeline_operations.sql`. Ela cria etapas padrão por organização, ownership, timeline de atividades, campos para próxima ação e policies de permissão por role. As migrations são incrementais: aplique também as anteriores em ordem; não rode apenas a mais recente em um banco vazio.

Para permitir que um usuário autenticado crie seu primeiro workspace e ownership automaticamente, aplique depois `supabase/migrations/20261004240000_organization_bootstrap.sql`. Ele expõe a função `public.create_organization()` e cria as políticas iniciais necessárias para organização e associação. Em seguida, o usuário pode abrir Configurações e criar seu primeiro workspace para testar o fluxo real da prospecção.

Para habilitar o Inbox de conversas, aplique em seguida `supabase/migrations/20261004200000_inbox_conversations.sql`. O `/inbox` permite registrar manualmente conversas, respostas recebidas, mensagens enviadas fora do app e rascunhos; não conecta caixas externas nem envia mensagens. O histórico fica disponível aos membros da organização sob RLS.

Para habilitar a agenda comercial, aplique depois `supabase/migrations/20261004210000_sales_meetings.sql`. A rota `/meetings` permite agendar e reagendar reuniões vinculadas a leads e registrar conclusão ou cancelamento. A agenda não cria eventos externos, não envia convites e não gera lembretes.

Para habilitar propostas comerciais, aplique em seguida `supabase/migrations/20261004220000_sales_proposals.sql`. A rota `/proposals` permite criar rascunhos de propostas vinculados a leads, com escopo, validade, itens e total calculado pelo banco; o usuário pode registrar envio externo e decisão manualmente. O app não gera PDFs, não assina e não envia propostas.

Para habilitar cadências comerciais, aplique em seguida `supabase/migrations/20261004230000_sales_cadences.sql`. A rota `/cadences` permite criar modelos com etapas e inscrever leads; a inscrição explícita gera tarefas datadas no CRM em uma transação. As tarefas são executadas manualmente e nenhuma mensagem é enviada ou agendada.

O workspace AI SDR fica em `/ai-sdr` e reúne tarefas, follow-ups cadastrados, leads analisados e rascunhos já aprovados. A página `/ai-usage` exibe chamadas, tokens, custos estimados e o histórico recente da organização. Ela não gera análises automaticamente, não monitora respostas e não envia mensagens. Na ficha do lead, é possível colar manualmente uma resposta para classificá-la e revisar uma sugestão; o texto recebido não é salvo no histórico da aplicação.

O pipeline está disponível em `/pipeline` (com `/crm` mantido como alias); `/tasks` oferece as visões de tarefas do dia, atrasadas, próximas e concluídas; `/inbox` registra conversas manualmente; `/meetings` mantém a agenda de reuniões vinculadas aos leads; `/proposals` gerencia propostas comerciais em rascunho e acompanha status atualizados manualmente; `/cadences` organiza etapas de follow-up e cria tarefas apenas após inscrição explícita. A timeline registra mudanças de etapa, responsável, Action Score, tarefas, notas, mensagens, reuniões, propostas e cadências. Sincronização/envio de mensagens, sincronização de calendários, PDF/assinatura/envio automático de propostas e forecast comercial ainda não estão implementados. Consulte [docs/CRM.md](./docs/CRM.md), [docs/AUTOMATIONS.md](./docs/AUTOMATIONS.md), [docs/OUTREACH.md](./docs/OUTREACH.md), [docs/AI-SDR.md](./docs/AI-SDR.md), [docs/PROPOSALS.md](./docs/PROPOSALS.md) e [docs/SALES.md](./docs/SALES.md) para capacidades e pendências atuais.

Princípios-chave do schema:

- Isolamento por organização via `organization_members`
- Criação automática de perfil de usuário via trigger
- Políticas de Row Level Security para acesso por organização
- Timestamps de atualização em todas as tabelas de negócio

## Prospecção de empresas

1. Acesse **Radar** ou clique em **Encontrar primeiros leads** no dashboard.
2. Informe segmento, localização, quantidade (1–100) e, opcionalmente, palavras-chave.
3. Acompanhe o job em `/prospecting/jobs/:jobId`; os resultados reais são salvos no Supabase e consultados conforme as políticas RLS.

Para prospecção real, faça deploy da Edge Function e configure os secrets necessários no Supabase. `GOOGLE_PLACES_API_KEY` é obrigatório para busca; `PAGESPEED_API_KEY` é opcional e, sem ela, o job continua sem as métricas do PageSpeed. Consulte [docs/PROSPECTING.md](./docs/PROSPECTING.md) para passos, limites e configuração.

O score atual é determinístico e não usa IA. A busca usa Google Places oficial; o sistema não faz scraping do Maps nem tenta identificar indivíduos. Uma organização e a associação do usuário em `organization_members` precisam existir antes da execução real.

Na ficha de uma empresa associada a um lead, a inteligência comercial e a geração de mensagens, follow-ups e assistência de resposta são acionadas manualmente. Para o follow-up, o usuário fornece um resumo do contato anterior; as mensagens permanecem como rascunhos até revisão e aprovação. A aprovação não envia nem agenda nada. O assistente só analisa respostas coladas pelo usuário, sem caixa de entrada conectada. O núcleo de IA exige OpenAI configurada e migrations aplicadas.

## Observações de segurança

- Nunca armazene segredos no frontend
- Mantenha autenticação e lógica sensível do Supabase em backend seguro ou Edge Functions
- Cadastre `GOOGLE_PLACES_API_KEY` e `PAGESPEED_API_KEY` somente nos secrets das Supabase Edge Functions; não use prefixo `VITE_`
- Cadastre `OPENAI_API_KEY` somente como secret server-side das Supabase Edge Functions; nunca exponha a chave em `VITE_*`
- Use RLS e associação de usuários por organização para isolar dados de clientes

## Observações finais

O fluxo real de prospecção foi validado com uma conta Supabase em 04/10/2026. Antes de produção, aplique e valide a migration `20261004250000_production_security_foundations.sql` em staging; o checklist de prontidão registra todos os gates ainda pendentes.

Consulte:

- [docs/PRODUCTION_AUDIT.md](./docs/PRODUCTION_AUDIT.md) para riscos, correções e backlog verificado
- [docs/ENVIRONMENT.md](./docs/ENVIRONMENT.md) para variáveis públicas e secrets server-side
- [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) e [docs/DATABASE_MIGRATIONS.md](./docs/DATABASE_MIGRATIONS.md) para publicação e ordem do banco
- [docs/RLS_MATRIX.md](./docs/RLS_MATRIX.md) para a política tenant-scoped
- [docs/LGPD.md](./docs/LGPD.md), [docs/BACKUP_AND_RECOVERY.md](./docs/BACKUP_AND_RECOVERY.md) e [docs/DISASTER_RECOVERY.md](./docs/DISASTER_RECOVERY.md) para operações e privacidade
- [docs/RUNBOOK.md](./docs/RUNBOOK.md) e [docs/PRODUCTION_CHECKLIST.md](./docs/PRODUCTION_CHECKLIST.md) para resposta a incidentes e aceite de produção
