# Deploy

O frontend foi planejado para hospedagem estática na Hostinger; Supabase fornece Auth, Postgres e Edge Functions. Vercel ou outro host estático também pode servir o build.

## Pré-requisitos

- Projetos Supabase separados para staging e produção.
- Domínio, TLS/SSL e variáveis públicas configuradas no ambiente do frontend.
- Secrets das Edge Functions cadastrados no Supabase Dashboard/CLI.
- Revisão e execução das migrations conforme [DATABASE_MIGRATIONS.md](./DATABASE_MIGRATIONS.md).

## Publicação

1. Clone o repositório e rode `npm ci`.
2. Configure `.env.local` para desenvolvimento; não suba `.env`.
3. Em staging, configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PROSPECTING_MOCK_MODE=false` e `VITE_ENABLE_DEMO_AUTH=false`.
4. Aplique migrations em staging e execute testes Auth/RLS/prospecção.
5. Configure `GOOGLE_PLACES_API_KEY`, `OPENAI_API_KEY` quando aplicável e demais secrets como secrets das Supabase Edge Functions.
6. Faça deploy das funções existentes e da `health`; exemplo com Supabase CLI instalado e projeto linkado: `supabase functions deploy prospecting-search`, `supabase functions deploy health`.
7. Para cadastro de organizações, configure os secrets `APP_BASE_URL` e, se necessário, `APP_ALLOWED_ORIGINS`, configure SMTP/envio de e-mail do Supabase Auth e permita a URL `/set-password` em **Authentication → URL Configuration → Redirect URLs**. Depois aplique a migration `20261005130000_organization_admin_invites.sql` e publique `supabase functions deploy admin-organizations`.
8. Para Hostinger, execute `npm run build` e publique o conteúdo de `dist/`; `public/.htaccess` configura fallback SPA em Apache.
9. Para Vercel, importe o projeto, configure as variáveis por Development/Preview/Production e use `npm run build` com `dist` como pasta de saída.
10. Configure domínio e SSL no host, bem como redirect URLs de Auth no Supabase.
11. Verifique `/health` via endpoint `https://<project-ref>.supabase.co/functions/v1/health` e teste `/login`, `/dashboard`, `/prospecting/new` e o detalhe do job. Para a gestão administrativa, valide o envio real do convite e o fluxo completo de `/set-password` em staging.

## Promoção e rollback

Promover build imutável já validado em staging. Mudanças de schema devem ser forward-only e compatíveis; manter deployment anterior para rollback do frontend. Não fazer rollback cego do banco nem compartilhar secrets entre ambientes.

O deploy remoto não foi executado nesta sessão. Migrations e Edge Functions novas precisam ser publicadas pelo operador com acesso ao projeto.
