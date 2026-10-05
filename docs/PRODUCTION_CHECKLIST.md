# Checklist de produção

## Bloqueadores para produção aberta

- [ ] Aplicar `20261004250000_production_security_foundations.sql` em staging.
- [ ] Aplicar `20261004260000_resumable_prospecting_workers.sql` em staging e validar o encadeamento/retomada dos workers.
- [ ] Validar em staging `20261004270000_prospecting_rate_limit_production_hotfix.sql` e as cotas.
- [ ] Validar em staging a nova classificação score ≥40 como warm antes de futuras alterações no critério.
- [ ] Testar tenant A contra tenant B (SELECT/INSERT/UPDATE/DELETE/RPC/exports).
- [ ] Confirmar migrations e policies no projeto Supabase de produção.
- [ ] Configurar secrets server-side e rotacionar credenciais expostas.
- [ ] Desabilitar demo auth/mock em production e staging.
- [ ] Confirmar política de backup/PITR, retenção e testar restore.
- [ ] Aprovar retenção LGPD, canal de titular, exportação e exclusão.
- [ ] Configurar monitoramento real, alarmes e responsável de plantão.
- [ ] Validar quotas e limites monetários de Google/OpenAI.
- [ ] Revisar contrato/termos/região de processamento de fornecedores.

## Verificações remotas e correção aplicada (04/10/2026)

- Foi encontrado o projeto Supabase `Lead-Radar`, vinculado ao frontend; o usuário confirmou que é produção. Também foi criado `Lead-Radar-Staging`, mas não foi configurado nem recebeu migrations.
- Com autorização do usuário, foi criado `Lead-Radar-Staging` em `us-east-1` na mesma organização. Está `ACTIVE_HEALTHY`, mas ainda não foi linkado nem recebeu migrations.
- A criação inicial não preservou a senha de banco gerada. Antes de usar a CLI no staging, redefinir a senha no painel e guardá-la em um meio local seguro; não enviá-la por chat. O projeto novo não tem conexões de aplicação configuradas.
- Antes da aplicação do worker retomável, `supabase migration list --linked` não mostrava versões remotas. Agora `20261004260000` está registrada como aplicada; as versões locais `20261004130000`–`20261004250000` continuam sem registro. Isso não comprova que o schema remoto esteja vazio; ele pode ter sido provisionado fora do histórico do CLI. **Não executar `supabase db push` antes de reconciliar o schema/histórico**, pois o comando poderia tentar reaplicar migrations antigas.
- `prospecting-search` está ativa. A função `health` não aparece no inventário remoto e `/functions/v1/health` respondeu HTTP 404.
- O CLI lista os nomes dos secrets server-side esperados, mas não permite validar os valores. Nenhum valor foi lido ou alterado.
- Com autorização explícita, `20261004260000_resumable_prospecting_workers.sql` foi aplicada no projeto de produção e a Edge Function `prospecting-search` foi publicada como versão 14 com JWT verification habilitada.
- Após uma chamada de prospecção ser recusada, confirmou-se que a função RPC/tabela de rate limit exigidas pela Edge Function não existiam. O hotfix isolado `20261004270000_prospecting_rate_limit_production_hotfix.sql` foi aplicado e registrado em produção. Teste transacional respondeu `allowed=true`; permissões confirmadas: service_role executa a RPC, authenticated não, tabela com RLS ativo. Ainda falta teste ponta a ponta de uma busca autenticada.
- Após autorização, `20261004280000_lead_classification_recalibration.sql` foi aplicada em produção e `prospecting-search` publicada como versão 15. A distribuição resultante é 25 warm (scores 40–67), sem cold com score ≥40; scores originais foram preservados.
- O endpoint rejeitou uma chamada de teste sem autenticação com HTTP 401; nenhum novo job foi criado. Os dois jobs anteriores permanecem cancelados e não havia jobs ativos no preflight.
- O bundle estático do frontend não foi publicado nesta operação. O autoencadeamento dos workers está ativo no backend; a retomada pelo navegador após expiração do lease depende da publicação do frontend atualizado.

## Plataforma

- [ ] Environment separado: development / staging / production.
- [x] `.env.example` sem valores secretos e `.env` ignorado.
- [x] Validação Zod para ambiente público.
- [ ] RLS verificado por testes de integração no banco.
- [x] Rate limiting de prospecção implementado na Edge Function (verificar no staging/prod que a migration base e a RPC correspondente estão presentes).
- [ ] Idempotência abrangente para retries e operações de IA/mensagens.
- [ ] Webhooks (não existentes) protegidos antes de integração externa.
- [ ] Backups restaurados em ensaio.
- [x] Logger/Error Boundary instalados; [ ] fornecedor de error tracking configurado.
- [ ] Custos de IA/API com orçamento, alertas e limites mensais.
- [x] Build e suíte de testes locais.
- [x] Workflow CI adicionado; [ ] execução em GitHub Actions confirmada.
- [x] Build de rotas com code-splitting.
- [ ] Resolver/aceitar formalmente os advisories HIGH em dependências de desenvolvimento ou planejar migração compatível do Tailwind CSS 3 para 4.
- [ ] Deploy, domínio, SSL e redirects de Auth validados.
- [ ] Runbook e responsável operacional aprovados.
- [ ] Exportação/exclusão LGPD disponível e testada.
- [ ] Testes E2E em staging; isolamento multi-tenant validado.
- [ ] Acessibilidade e responsividade auditadas com testes.

## Gates automatizados

`npm run lint`, `npm test -- --run` (55 testes em 12 arquivos) e `npm run build` passaram nesta verificação. `npm ci` não foi repetido porque não houve alteração de dependências. CI remoto no GitHub Actions continua sem confirmação. O estado detalhado consta em [PRODUCTION_AUDIT.md](./PRODUCTION_AUDIT.md).
