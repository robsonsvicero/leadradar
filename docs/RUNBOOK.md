# Runbook operacional

## Site fora do ar

Verificar status do host, DNS/TLS, deployment e assets. Se recente, reverter frontend para último build válido. Checar Supabase `/health`; não imprimir variáveis durante diagnóstico.

## Supabase indisponível

Confirmar incidente do provedor, pausar retries/cadências manuais, preservar estado e aguardar recuperação. Não trocar connection string em produção sem change control.

## Google API indisponível

Consultar logs da Edge Function e quotas do projeto Google. A operação informa erro de busca; não executar repetidamente sem checar se job/efeitos já existem.

## OpenAI indisponível ou custo alto

Checar `ai_analysis_logs`, limites e dashboard do provedor. Desabilitar a feature por build flag se necessário, limitar operações no backend e preservar CRM. Hoje não existe alerta financeiro automatizado.

## Jobs travados

Consultar `prospecting_jobs` e logs da função; confirmar `status`, progresso e resultados já persistidos. Não reenviar se houver job ativo para a organização. Não há retry manual/durable recovery implementado.

## Webhook duplicado

Atualmente não há endpoint inbound de webhook no produto. Não habilitar integração até assinatura, timestamp/replay protection e armazenamento idempotente serem implementados.

## Erro de autenticação ou RLS

Validar sessão via Auth, membership e migration aplicada. Reproduzir com usuários/tenants de staging. Não contornar RLS com token service-role no frontend.

## Deploy ou migration com problema

Interromper promoção; manter frontend anterior. Restaurar banco em ambiente isolado se necessário e criar migration compensatória. Aplicar recovery conforme [BACKUP_AND_RECOVERY.md](./BACKUP_AND_RECOVERY.md).

## Secret comprometido

Revogar e rotacionar no provedor, atualizar secret server-side e reimplantar funções. Investigar uso e invalidar sessões se necessário. Nunca colocar chave em issue/chat/log.
