# Matriz de Row Level Security

Resumo estático das policies encontradas em `schema.sql` e migrations. “Member” significa membership válida no tenant. A migration `20261004250000_production_security_foundations.sql` precisa ser aplicada para as permissões marcadas “após migration”. Confirmar a matriz com testes SQL em staging antes de produção.

| Tabela/dados | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `organizations` | Membros da organização | Apenas RPC `create_organization` após migration | Negado diretamente | Negado diretamente |
| `organization_members` | Próprias associações; lista de colegas via RPC validada por tenant | RPC owner; owner/admin pode adicionar admin/member após migration | Sem policy geral | Sem policy geral |
| `profiles` | Próprio perfil; roster expõe nome a colegas autorizados | Trigger de Auth | Próprio perfil, somente `full_name`, `avatar_url` após migration | Negado |
| `companies` | Membros do tenant | Membros | Membros | Membros pela policy base |
| `leads` | Membros do tenant | Membros | Membros | Owner/admin |
| `tasks` | Membros do tenant | Membros | Membros | Owner/admin |
| `activity_logs`, `lead_activities` | Membros do tenant | Membros; atividade vinculada ao lead/tenant | Sem policy geral | Sem policy geral |
| `prospecting_jobs`, `digital_analyses`, `lead_signals`, `api_usage` | Membros do tenant | Backend privilegiado | Backend privilegiado | Sem policy do cliente |
| `organization_icp_settings`, `organization_services`, `organization_ai_profile` | Membros | Owner/admin | Owner/admin | Owner/admin por policy de manage |
| `ai_analysis_logs`, `ai_outreach_drafts`, `ai_follow_up_drafts`, `ai_feedback`, `ai_usage_counters` | Membros | Backend privilegiado ou fluxo específico | Backend privilegiado/fluxo específico | Sem policy geral do cliente |
| `pipeline_stages` | Membros | Owner/admin | Owner/admin | Sem policy geral |
| `conversations` | Membros | Membro que cria | Membros, com invariantes por trigger | Owner/admin |
| `conversation_messages` | Membros, conversa no mesmo tenant | Membro autor, conversa aberta no mesmo tenant | Sem policy geral | Sem policy geral |
| `sales_meetings` | Membros | Membro autor | Membros, invariantes por trigger | Owner/admin |
| `sales_proposals` | Membros | Membro autor, somente rascunho | Membros, transições limitadas por trigger | Owner/admin |
| `sales_proposal_items` | Membros | Membros, proposta draft do mesmo tenant | Membros, proposta draft | Membros, proposta draft |
| `sales_cadences`, `sales_cadence_steps`, `sales_cadence_enrollments` | Membros | Fluxos/RPC conforme migration | Policies de domínio e triggers | Sem policy geral |
| `rate_limit_buckets` | Sem acesso do cliente | RPC service-role | RPC service-role | RPC service-role/limpeza interna |

## Verificações obrigatórias de staging

Com usuários independentes A e B em organizações distintas, validar para cada tabela tenant-scoped:

1. A não consegue SELECT, UPDATE, DELETE nem exportar linhas de B.
2. Criar organização com slug ocupado não altera nome/membership da organização existente.
3. A não consegue inserir a própria membership no tenant B, nem elevar `profiles.role`.
4. RPCs/Edge Functions verificam tenant no backend antes de qualquer consulta com service role.
5. FKs entre tabelas-filhas e pais não permitem combinar IDs de tenants diferentes.

Nenhum teste de penetração ou consulta RLS live foi executado nesta edição; a migration indicada deve ser aplicada em staging e estes casos automatizados antes do deploy.
