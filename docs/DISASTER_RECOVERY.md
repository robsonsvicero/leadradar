# Disaster recovery

## Indisponibilidade do Supabase

Confirmar incidente no status page e alertas do provedor. Evitar retries agressivos. Preservar o estado de formulários no cliente quando possível; jobs `waitUntil` não têm recuperação durável garantida. Só retomar após validar banco, Auth e Edge Functions.

## Google Places, PageSpeed ou OpenAI indisponíveis

Não expor chave nem resposta crua ao usuário. PageSpeed é opcional e a busca deve registrar falhas parciais. OpenAI indisponível não deve bloquear acesso ao CRM. Reexecutar somente após confirmar que a operação é segura e respeita quotas/custos.

## Frontend/deploy com falha

Interromper promoção, manter deployment anterior quando o host suportar rollback e comparar build/variáveis sem imprimir valores. Revalidar URL pública, rotas SPA, login e `/health` após rollback.

## Edge Function ou job travado

Consultar status/logs da função e `prospecting_jobs`. Antes de retry, conferir estado atual, efeitos já persistidos e índice de job ativo; não disparar job duplicado. Hoje não há dead-letter queue, heartbeat/claim durável nem retry manual operacional no produto.

## Credencial exposta

Revogar/rotacionar a chave no provedor, atualizar secret no Supabase e ambientes de deploy, reimplantar funções dependentes e verificar uso anômalo. Invalidar sessões/tokens conforme capacidade do provedor. Nunca colar o secret em ticket ou log.

## Rollback de migration

Não remover colunas/tabelas aplicadas como primeiro recurso. Preparar migration compensatória compatível com os dados; testar em cópia/staging, fazer backup e só então aplicar. Migrations do Supabase são forward-only operacionalmente.

## Após recuperação

Registrar timeline, impacto, organizações afetadas, custo, ações, RPO/RTO medidos e follow-ups; revisar alertas/testes para evitar recorrência.
