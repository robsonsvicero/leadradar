# Configuração de ambiente

O frontend usa `src/config/env.ts` para validar com Zod as variáveis públicas lidas pelo Vite. Modos suportados: `development`, `test`, `staging` e `production`. URL e chave pública Supabase devem estar ambas presentes ou ambas ausentes; valores inválidos interrompem a inicialização com nomes de variáveis, nunca seus valores.

## Frontend

| Variável | Obrigatória | Uso |
|---|---:|---|
| `VITE_SUPABASE_URL` | Para Supabase | URL do projeto Supabase. |
| `VITE_SUPABASE_ANON_KEY` | Para Supabase | Chave pública anon/publishable; RLS continua sendo obrigatória. |
| `VITE_PROSPECTING_MOCK_MODE` | Não | `true`/`false`; modo mock só é usado em desenvolvimento/teste. |
| `VITE_ENABLE_DEMO_AUTH` | Não | Login local apenas em development/test; proibido em staging/production. |
| `VITE_ENABLE_AI_SDR` | Não | Habilita rota e navegação do AI SDR. |
| `VITE_ENABLE_INBOX` | Não | Habilita inbox. |
| `VITE_ENABLE_PROPOSALS` | Não | Habilita propostas. |
| `VITE_ENABLE_ADVANCED_ANALYTICS` | Não | Habilita a rota de uso/analytics de IA. |
| `VITE_ENABLE_AUTOMATED_CADENCES` | Não | Habilita cadências. |

Flags `VITE_*` são incorporadas ao bundle durante o build. Alterar uma flag exige novo build/deploy; elas não substituem autorização backend nem feature entitlements.

## Secrets das Edge Functions

Configure pelo Supabase Dashboard/CLI como secrets, nunca em `.env` lido pelo Vite:

- `GOOGLE_PLACES_API_KEY` (busca obrigatória).
- `PAGESPEED_API_KEY` (opcional).
- `OPENAI_API_KEY` (necessária para funções de IA).
- `AI_LEAD_ANALYSIS_MODEL`, `AI_OUTREACH_MODEL`, limites e variáveis de custo documentadas em [AI.md](./AI.md) e [AI_COSTS.md](./AI_COSTS.md).
- `SUPABASE_SERVICE_ROLE_KEY` é disponibilizada/configurada somente no ambiente Edge Function; jamais use prefixo `VITE_`.
- `APP_BASE_URL` para a Edge Function `admin-organizations`, com a origem pública do frontend (por exemplo, `https://app.exemplo.com`); a função acrescenta `/set-password` como destino do convite.
- `APP_ALLOWED_ORIGINS` é opcional para a Edge Function `admin-organizations`; informe origens adicionais separadas por vírgula, sem caminhos, se staging ou outro domínio também precisar chamar a função.

`SUPABASE_URL`/`SUPABASE_ANON_KEY` usados por Edge Functions são secrets/variáveis gerenciadas pelo Supabase, separados dos valores `VITE_*`.

Para que os convites cheguem aos administradores, configure o envio de e-mail/SMTP do Supabase Auth e permita a URL `/set-password` na lista **Authentication → URL Configuration → Redirect URLs**. Configure também a Site URL apropriada ao ambiente. Não exponha a service role no frontend.

## Arquivos e setup

- Copie `.env.example` para `.env.local` no desenvolvimento.
- Para habilitar o botão demo local, defina `VITE_ENABLE_DEMO_AUTH=true` em `.env.local`; use somente com o mock local, nunca em staging/produção.
- `.env`, `.env.*` e arquivos `.local` estão ignorados; mantenha apenas placeholders em `.env.example`.
- Staging e produção exigem URL/chave Supabase juntas, mock=false e demo auth=false. Use variáveis próprias por ambiente no provedor e banco/projeto Supabase separados.
- Não compartilhe credenciais entre staging e produção. Rotacione imediatamente uma credencial que tenha sido exposta.

## Verificação

`npm run build` valida o schema porque a configuração é carregada no bundle. Uma URL/key ausente em conjunto é aceita para demo local; isso não representa autenticação real.
