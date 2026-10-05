# Prospecção

## Modo de demonstração local

Em desenvolvimento, se `VITE_PROSPECTING_MOCK_MODE` não estiver definido, a interface usa o modo de demonstração. O modo cria resultados claramente marcados como fictícios no `localStorage`; não chama Google, não grava no Supabase e não deve ser usado como informação de empresas reais. Defina `VITE_PROSPECTING_MOCK_MODE=false` para testar o backend real. Em builds de produção, o modo de demonstração fica sempre desativado.

## Preparar o backend real

1. Execute `supabase/migrations/20261004130000_prospecting_engine.sql` no SQL Editor. Esta migration é aditiva e pressupõe que o schema base de `supabase/schema.sql` já foi aplicado.
2. Cadastre o usuário no Supabase Auth e confirme que ele pertence à organização em `public.organization_members`.
3. Ative a Google Places API (New) e cobrança no projeto Google Cloud, gere uma chave restrita à API Places e cadastre-a como secret `GOOGLE_PLACES_API_KEY` das Edge Functions do Supabase.
4. Opcionalmente, gere uma chave do PageSpeed Insights e cadastre como `PAGESPEED_API_KEY`. Sem essa chave, o job continua sem métricas PageSpeed.
5. Faça deploy da função:

```bash
supabase functions deploy prospecting-search
```

6. Configure a aplicação com `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_PROSPECTING_MOCK_MODE=false`, reinicie o servidor Vite e execute uma busca pequena (por exemplo, 5 empresas).

As chaves Google e PageSpeed pertencem aos secrets de Edge Functions e nunca a `.env` do frontend nem a variáveis `VITE_*`. Não habilite scraping do Google Maps. A pesquisa usa a API oficial Text Search do Places.

## Limites e tratamento de falhas

- Quantidade por job: 1–100.
- Até 3 páginas de resultados da API por termo de pesquisa.
- Máximo de 10 palavras-chave e 1 job ativo por organização.
- Requisições transitórias recebem até duas novas tentativas com espera exponencial.
- Website/PageSpeed podem falhar sem interromper o processamento dos demais estabelecimentos; os erros parciais ficam no job.
- A análise do website verifica somente conteúdo público, sem login, scanning de vulnerabilidades ou pentest.

PageSpeed pode gerar chamadas adicionais e está sujeito a limites e custos definidos pelo Google. A aplicação registra chamadas sem estimar preços.
