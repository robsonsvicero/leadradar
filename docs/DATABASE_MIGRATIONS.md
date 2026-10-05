# Migrations do banco

`supabase/schema.sql` é a base inicial. Para banco novo, aplicar schema e migrations incrementais em ordem cronológica; para banco existente, aplicar apenas migrations ainda não registradas/aplicadas pelo Supabase, sem reexecutar o schema de bootstrap cegamente.

## Ordem incremental

1. `20261004130000_prospecting_engine.sql`
2. `20261004160000_ai_sales_intelligence.sql`
3. `20261004170000_ai_organization_configuration.sql`
4. `20261004180000_ai_follow_up_drafts.sql`
5. `20261004190000_crm_pipeline_operations.sql`
6. `20261004200000_inbox_conversations.sql`
7. `20261004210000_sales_meetings.sql`
8. `20261004220000_sales_proposals.sql`
9. `20261004230000_sales_cadences.sql`
10. `20261004240000_organization_bootstrap.sql`
11. `20261004250000_production_security_foundations.sql`
12. `20261004260000_resumable_prospecting_workers.sql`
13. `20261004270000_prospecting_rate_limit_production_hotfix.sql`
14. `20261004280000_lead_classification_recalibration.sql`
15. `20261005100000_user_registration_approval.sql`
16. `20261005110000_company_public_email.sql`
17. `20261005120000_lead_deletion_support.sql`
18. `20261005130000_organization_admin_invites.sql`

Nunca editar migration já aplicada. Crie uma migration posterior para corrigir schema/dados.

## Aplicação

Com Supabase CLI autenticado e projeto correto linkado, revisar `supabase migration list --linked`, conferir SQL e backup, então aplicar `supabase db push`. Usar primeiro projeto de staging; comparar `migration list` antes/depois e rodar testes RLS.

A migration de production foundations revoga criação direta de organizações, membership self-insert e atualização de `profiles.role`; também cria a RPC do rate limiter. Não declarar esses controles ativos no projeto remoto até confirmar sua aplicação.

A migration de workers retomáveis persiste os dados de descoberta por empresa, adiciona leases e a RPC `claim_prospecting_job`. A função `prospecting-search` deve ser deployada somente depois dessa migration. Cada invocação processa uma consulta ou uma empresa e agenda a próxima etapa; a página retoma jobs ativos quando o lease expira. Validar o encadeamento em staging antes de atualizar produção.

A migration de convites administrativos acrescenta endereço e contatos às organizações e restringe a criação via banco ao administrador da plataforma. Ela deve ser aplicada antes do deploy da Edge Function `admin-organizations`. A função usa a service role para convidar o contato e associá-lo como `owner`; não remova as restrições de membership da migration de production foundations.

**Exceção operacional em 04/10/2026:** por autorização explícita, a migration `20261004260000` foi executada diretamente no projeto de produção via Management API e registrada como aplicada. O CLI continua sem versões remotas `20261004130000`–`20261004250000`; o histórico legado precisa ser reconciliado antes de qualquer `supabase db push`. Não use `db push` para promover alterações até reconciliar cada versão com o schema real.

**Hotfix operacional em 04/10/2026:** a `20261004270000` foi aplicada diretamente em produção e registrada como aplicada. Ela contém somente a tabela e RPC do rate limiter que a função publicada chama, separada da migration de segurança base para corrigir o endpoint sem aplicar policies alheias ao incidente.

**Recalibração operacional em 05/10/2026:** a `20261004280000` atualiza a classificação persistida conforme os limites score ≥80 (hot), ≥40 (warm), abaixo disso (cold), alinhada ao classificador da Edge Function. Foi aplicada diretamente em produção após autorização explícita; não altera os scores.
