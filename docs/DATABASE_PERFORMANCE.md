# Performance do banco

## Práticas existentes

- Consultas do app usam Supabase services por domínio e políticas RLS com membership.
- Migrations indexam chaves compostas por organização e colunas de ordenação/estado para jobs, empresas, atividades, inbox, reuniões, propostas e cadências.
- Consultas de algumas listas usam limites fixos e não são paginação cursor-based completa.

## Avaliação antes de ampliar carga

1. Capturar queries reais lentas em staging e revisar com `EXPLAIN (ANALYZE, BUFFERS)`.
2. Conferir filtros por `organization_id`, ordenação, seletividade e filtros usados em dashboards.
3. Criar índices somente após confirmar o plano e custo de escrita; migrations devem usar `create index concurrently` quando apropriado ao procedimento de deploy transacional.
4. Não buscar listas completas para montar agregações no browser; preferir views/RPCs agregadas protegidas por tenant.
5. Testar paginação e busca com fixtures isoladas de 10k companies/leads e 100k activities/messages.

## Backlog medido

- Substituir limites de 200/500 em listas principais por cursor/limites explícitos e controles de UI.
- Medir dashboards/CRM/inbox com volumes grandes.
- Revisar N+1 de detalhes relacionados e preferir consultas em lote.
- Observar tamanho/retention de logs, `api_usage` e `rate_limit_buckets`.

Nenhum benchmark de 10k/100k registros foi executado durante este prompt. Ver [PRODUCTION_AUDIT.md](./PRODUCTION_AUDIT.md) para limites de escala.
