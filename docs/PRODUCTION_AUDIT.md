# Auditoria de prontidão para produção

**Escopo:** leitura do código React/Vite, serviços Supabase, schema base, migrations e Edge Functions. A auditoria é estática; a migration de endurecimento ainda precisa ser aplicada e verificada em staging antes de produção.

## Arquitetura atual

- SPA React 19 + TypeScript strict, Vite e React Router.
- TanStack Query coordena dados no cliente; serviços por domínio chamam Supabase.
- Supabase Auth, Postgres com RLS e Edge Functions executam operações privilegiadas.
- `prospecting-search` consulta Google Places e PageSpeed; funções de IA usam OpenAI server-side.
- Migrations incrementais complementam `supabase/schema.sql`.

## Pontos fortes verificados

- `strict: true` habilitado no TypeScript.
- Chaves privadas não são referenciadas no bundle; integrações externas sensíveis usam secrets das Edge Functions.
- Edge Functions de negócio exigem JWT e verificam membership antes de usar service role.
- Há deduplicação por empresa/organização e índice parcial que impede mais de um job de prospecção ativo por organização.
- O uso de IA tem contador atômico diário por organização/usuário/operação.
- A jornada real login → workspace existente → prospecção Google Places → análise → lead persistido foi executada em 04/10/2026.
- Build e suíte de testes foram aprovados antes deste prompt; a validação completa das alterações atuais consta no checklist final.

## Riscos encontrados e correções implementadas neste prompt

| Severidade | Evidência | Correção |
|---|---|---|
| Crítica | `create_organization` atualizava o nome quando o slug já existia e criava membership owner para quem chamasse a RPC. | Nova migration troca o upsert por insert sem conflito; slug ocupado falha sem alterar organização. |
| Crítica | Policy permitia a qualquer usuário autenticado inserir seu próprio `organization_members` em organização arbitrária. | Nova migration remove a policy e permite inserções diretas somente a owner/admin, sem conceder role owner. |
| Alta | Perfil permitia UPDATE da própria linha sem restringir colunas, incluindo `profiles.role`. | Nova migration restringe update autenticado a `full_name` e `avatar_url`. |
| Média | Fallback de login local aceitava qualquer credencial sem Supabase e a demo era exposta fora do contexto local. | Fallback genérico removido; demo limitada a development/test, opt-in em staging/production proibido, UI condicionada ao modo mock/local. |
| Média | Variáveis públicas eram lidas sem validação centralizada; `.env` não estava explicitamente ignorado. | Adicionados schema Zod, `env.ts`, `.env.example` seguro e regras de ignore. |
| Média | Busca de prospecção tinha limite de concorrência, mas não cota temporal por usuário/organização. | Nova RPC atômica `consume_rate_limit`, ligada à Edge Function, com limites de 10 por usuário/hora e 30 por organização/hora. Depende da nova migration. |
| Baixa | Todas as páginas eram carregadas no chunk inicial. | Rotas carregadas sob demanda com `React.lazy`/`Suspense`. |
| Baixa | Não havia Error Boundary global nem pipeline CI do projeto. | Adicionados Error Boundary com mensagem genérica, abstração de logging/error reporting e workflow de CI. |

## Estado de produção e pendências

- **Bloqueador:** aplicar `20261004250000_production_security_foundations.sql` primeiro em staging; executar testes RLS negativos com dois tenants; depois aplicar em produção.
- **Recuperação de prospecção:** migration `20261004260000_resumable_prospecting_workers.sql` aplicada em produção e Edge Function `prospecting-search` publicada como versão 14, com autorização explícita do usuário. Os resultados de busca agora são persistidos; cada invocação processa uma consulta ou empresa e agenda a próxima etapa; leases evitam workers concorrentes e permitem retomada. A chamada remota sem autenticação foi rejeitada com HTTP 401. O bundle estático do frontend não foi publicado; a retomada automática do navegador após lease expirado depende dessa publicação.
- **Falha do rate limiter corrigida:** depois que a função retornou “Não foi possível validar o limite de uso”, a consulta confirmou que faltavam a tabela `rate_limit_buckets` e a RPC `consume_rate_limit`. A migration isolada `20261004270000_prospecting_rate_limit_production_hotfix.sql` foi aplicada e registrada em produção. A RPC passou no teste transacional; permissões confirmadas (somente `service_role`, RLS habilitado). Falta um teste ponta a ponta autenticado para confirmar a busca.
- **Classificação recalibrada:** após autorização explícita, o limiar `warm` foi reduzido de 60 para 40 (hot permanece em 80), preservando score numérico. A migration `20261004280000_lead_classification_recalibration.sql` foi aplicada em produção e a Edge Function `prospecting-search` está na versão 15. Verificação remota: 25 leads warm, score entre 40 e 67, e nenhum cold com score ≥40.
- Em 04/10/2026, o Supabase CLI autenticado encontrou o projeto de produção `Lead-Radar`. O projeto `Lead-Radar-Staging` foi criado separadamente, mas não foi configurado nem usado para validar esta alteração.
- Com autorização, foi criado o projeto separado `Lead-Radar-Staging` em `us-east-1`, status `ACTIVE_HEALTHY`. A senha de banco inicial gerada durante a criação não foi preservada devido à interrupção do wrapper PowerShell; redefini-la no painel e guardá-la localmente antes de continuar. O staging ainda não foi linkado nem recebeu migrations.
- `supabase migration list --linked` registra `20261004260000`, `20261004270000` e `20261004280000`; as versões locais `20261004130000`–`20261004250000` continuam sem registro remoto. Isso não prova ausência de schema: a base pode ter sido provisionada fora do histórico do CLI. Não executar `supabase db push` até reconciliar o histórico/schema, pois ele pode tentar executar migrations antigas.
- A Edge Function `prospecting-search` está ativa na versão 15. `health` não consta no inventário remoto e `GET /functions/v1/health` respondeu HTTP 404; readiness remota não está aprovada.
- Os nomes esperados de secrets aparecem configurados no inventário do Supabase, mas os valores não são verificáveis via CLI. Não foram lidos, impressos nem alterados.
- Ainda não há central de privacidade export/delete, log de auditoria de segurança completo, endpoint de webhook, retry/durable queue, dead-letter queue, dashboard administrativo de saúde/custos, billing/entitlements, Sentry configurado ou automações de retenção.
- O job usa chamadas `waitUntil` curtas e sequenciais, checkpoint persistente e lease. Não existe scheduler independente; se o autoencadeamento falhar, a retomada exige o frontend atualizado e uma sessão de usuário ativa.
- Limites de IA são diários por operação; não há orçamento monetário mensal agregado. Custos de API são estimados/registrados, não controlados por orçamento no banco.
- Várias listas de domínio aplicam tetos fixos (ex.: até 500 itens); cursor/paginação de interface ainda precisa ser completada para crescimento.
- RLS foi revisado nos objetos do schema/migrations listados em [RLS_MATRIX.md](./RLS_MATRIX.md), mas não houve teste contra banco de staging nesta execução.
- CI passa a executar lint, testes e build após o workflow ser adicionado ao repositório remoto; não há execução GitHub Actions confirmada aqui.
- Exports, upload e inbound webhooks não estão implementados atualmente.
- Payloads externos como Google Places/PageSpeed ainda incluem parsing por tipos/assertions em alguns caminhos e não possuem cobertura Zod uniforme.

## Performance e dependências

- As consultas principais possuem filtros por organização e há índices por tenant/estado/data nas migrations de CRM, prospecção, inbox, reuniões e propostas.
- Devem ser monitorados planos reais com `EXPLAIN (ANALYZE, BUFFERS)` em staging; não foi medido benchmark com datasets grandes.
- A divisão de rotas e o code splitting de dependências reduziram os chunks do build; o maior chunk atual fica abaixo de 500 kB.
- `npm audit --omit=dev`: 0 vulnerabilidades. `npm audit` completo encontrou 5 advisories HIGH em dependências indiretas da ferramenta de build do Tailwind CSS 3 (`braces`, `chokidar`, `fast-glob`, `micromatch` e `tailwindcss`); o fix automático proposto é Tailwind CSS 4 (breaking change). `npm ls` mostrou `braces@3.0.3`, mas os advisories permanecem no grafo reportado. Nenhuma atualização major foi aplicada sem avaliar migração do design system.
- `npm outdated` apontou versões mais novas de Tailwind 3, TypeScript 7, Node types e Lucide; não foram atualizadas sem avaliação de compatibilidade.

## Decisão

O sistema **não está certificado como pronto para produção**. Há um projeto de produção identificado, mas staging não foi localizado; a migration de segurança e os testes RLS continuam pendentes. A falta de histórico remoto do CLI e o endpoint health 404 também precisam ser resolvidos. Privacidade, recovery durável, monitoramento real e demais itens operacionais devem ser aprovados antes de abrir cadastro público.

## QA local após as alterações

- `npm run lint`: aprovado, sem warnings.
- `npm test -- --run`: 55 testes em 12 arquivos aprovados.
- `npm run build`: aprovado; code splitting removeu o chunk acima de 500 kB e não emitiu warning de tamanho.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- `npm audit`: reporta 5 advisories HIGH em dependências de build/dev; sem correção compatível identificada pelo audit.
- Supabase local/RLS: não validado; `supabase status` falhou porque Docker/Podman não está disponível. A migration de segurança base ainda precisa de reconciliação/validação separada.
- GitHub Actions remoto: execução não confirmada.
