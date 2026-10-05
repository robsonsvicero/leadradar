# Inteligência comercial com IA

## Escopo disponível

O fluxo adiciona análise comercial, três rascunhos de abordagem e três opções de follow-up à ficha de uma empresa associada a um lead real. A execução é iniciada pelo usuário. Rascunhos exigem revisão humana e a aprovação não envia mensagens nem cria tarefas.

O workspace **AI SDR** (`/ai-sdr`) reúne tarefas abertas, follow-ups cadastrados, rascunhos aprovados, leads com Action Score e recomendações das análises já existentes. Atualizar a tela não executa chamadas de IA nem cria tarefas. Leads sem análise são apenas identificados para revisão manual.

Ainda não existe caixa de entrada conectada: respostas de prospects não são importadas ou monitoradas. Na ficha do lead, o usuário pode colar uma resposta manualmente para classificar intenção, sentimento e urgência e obter uma sugestão revisável. O texto é enviado à OpenAI somente após clicar em analisar e não é salvo no histórico do Lead Radar; o resultado estruturado fica salvo. Remova dados pessoais antes de colar. Para gerar um follow-up, o usuário informa um resumo do contato anterior; esse contexto fica salvo com o rascunho. As mensagens aprovadas são apresentadas como prontas para uso manual, mas o produto não as envia.

O modo de demonstração não chama a OpenAI. Mesmo quando a IA estiver indisponível, os scores e as evidências técnicas já salvos continuam visíveis.

## Preparação do banco

Antes de publicar as funções:

1. Aplique o schema base `supabase/schema.sql` se ainda não o aplicou.
2. Aplique `supabase/migrations/20261004130000_prospecting_engine.sql`.
3. Aplique `supabase/migrations/20261004160000_ai_sales_intelligence.sql`.
4. Aplique `supabase/migrations/20261004170000_ai_organization_configuration.sql`.
5. Aplique `supabase/migrations/20261004180000_ai_follow_up_drafts.sql`.

As migrations criam tabelas de ICP, catálogo de serviços, voz da organização, histórico de IA, rascunhos de abordagem e follow-up, feedback e cotas diárias. As policies isolam a leitura por organização; somente owner/admin pode alterar ICP, catálogo e perfil comercial. Escritas de IA passam pelas Edge Functions com service role, após autenticação e validação de membership.

Owners e admins podem editar os serviços oferecidos, ICP (incluindo pesos do Action Score) e perfil de voz na tela **Configurações**. A IA usa somente serviços ativos e valida o nome recomendado contra o catálogo. O score mínimo é sinalizado na explicação, mas não exclui leads automaticamente. O porte desejado pode ser cadastrado como preferência, mas o produto não dispõe de uma fonte verificada para o porte de cada lead; por isso, esse critério não concede nem remove pontos do score.

## Secrets e modelos

Cadastre nos secrets de Edge Functions do mesmo projeto Supabase usado pelo frontend:

- `OPENAI_API_KEY` — obrigatório para análise e geração.
- `AI_LEAD_ANALYSIS_MODEL` — opcional; padrão `gpt-4.1-mini`.
- `AI_OUTREACH_MODEL` — opcional; padrão `AI_FAST_MODEL` ou `gpt-4.1-mini`.
- `AI_FOLLOW_UP_MODEL` — opcional; usa `AI_OUTREACH_MODEL`, `AI_FAST_MODEL`, `AI_STANDARD_MODEL` ou `gpt-4.1-mini`, nessa ordem.
- `AI_REPLY_ASSISTANT_MODEL` — opcional; usa `AI_OUTREACH_MODEL`, `AI_FAST_MODEL`, `AI_STANDARD_MODEL` ou `gpt-4.1-mini`, nessa ordem.
- `AI_FAST_MODEL` e `AI_STANDARD_MODEL` — opções de fallback.
- `AI_DAILY_ANALYSES_LIMIT`, `AI_DAILY_MESSAGES_LIMIT` e `AI_DAILY_REPLY_ASSISTANT_LIMIT` — limites por usuário, organização, operação e dia; padrão 20. Análises, abordagens, follow-ups e respostas usam contadores separados.
- `AI_TIMEOUT_MS` e `AI_MAX_OUTPUT_TOKENS` — limites operacionais.
- `AI_INPUT_USD_PER_MILLION` e `AI_OUTPUT_USD_PER_MILLION` — taxas atuais por milhão de tokens do modelo configurado. Sem essas taxas, custo estimado fica `null`; tokens continuam registrados.

No painel Supabase, abra **Edge Functions → Secrets → Add new secret** e cadastre o nome e o valor no projeto certo. Para variáveis não secretas como modelo e limites, use o mesmo local. Nunca prefixe secrets com `VITE_`, não as adicione ao `.env` do Vite e não as inclua no bundle do navegador.

## Publicação

Na raiz do projeto e após vincular o CLI ao projeto correto:

```powershell
supabase functions deploy analyze-lead --import-map supabase/functions/deno.json
supabase functions deploy analyze-lead-deep --import-map supabase/functions/deno.json
supabase functions deploy generate-outreach --import-map supabase/functions/deno.json
supabase functions deploy generate-follow-up --import-map supabase/functions/deno.json
supabase functions deploy generate-reply-assistant --import-map supabase/functions/deno.json
supabase functions deploy ai-feedback --import-map supabase/functions/deno.json
```

O `--import-map` é necessário porque o Supabase CLI não está aplicando automaticamente o mapeamento `zod` definido em `supabase/functions/deno.json` ao empacotar as funções. Execute os comandos na raiz do projeto. O aviso `Docker is not running` não é a causa do erro de import; o deploy pode usar o empacotamento pela API do Supabase.

As funções exigem JWT e executam sob o mesmo projeto e banco. A chamada da OpenAI usa exclusivamente a Responses API e Structured Outputs.
Como as funções compartilham arquivos em `_shared`, publique novamente as funções que usam o núcleo sempre que alterá-lo, não apenas o endpoint cujo arquivo de entrada mudou.

## Fluxo

1. Abra uma empresa vinculada a um lead real.
2. Clique em **Analisar lead com IA**. O backend deriva a organização pelo lead e verifica a associação do usuário; não confia em `organizationId` do navegador.
3. O backend reúne apenas campos empresariais, sinais, análise digital, ICP e serviços disponíveis.
4. A resposta estruturada é validada por Zod e as referências de evidência são comparadas às referências disponíveis. Uma resposta inválida recebe uma única nova tentativa e não é persistida como sucesso.
5. Scores de ICP (quando há configuração), Buying Moment e Action Score são calculados no servidor; o modelo não escolhe livremente o Action Score.
6. Configure os serviços e o perfil de voz em **Configurações** para personalizar as recomendações. Se não houver serviços ativos, a IA deve informar que o serviço não foi configurado, sem inventar uma oferta.
7. Gere três versões de abordagem e aprove uma delas. O estado aprovado continua sendo apenas um rascunho aprovado; não há envio.
8. Para follow-up, descreva o contato anterior no campo da ficha, escolha o canal, gere as três opções, revise/edite e aprove uma. Use somente fatos reais no resumo e não inclua dados pessoais desnecessários; o contexto enviado é salvo com o rascunho para auditoria e consulta.
9. Para analisar uma resposta recebida, remova nomes e outros dados pessoais, cole o texto na ficha do lead e escolha **Classificar e sugerir resposta**. O histórico salva a classificação e a sugestão, mas não o texto recebido; confirme a resposta e o próximo passo antes de agir.
10. A página **Uso de IA** (`/ai-usage`) mostra chamadas, tokens e estimativas de custo das organizações do usuário. O painel não substitui os dados de faturamento do provedor nem define um teto financeiro.

Análises bem-sucedidas são reutilizadas enquanto os dados, o modelo e a versão do prompt forem os mesmos. **Reanalisar com IA** ignora o cache e mantém histórico. Um cache hit não consome cota da OpenAI. Requisições usam `requestId` para idempotência.

## Privacidade e segurança

- Dados enviados à OpenAI são limitados a contexto comercial da empresa, sinais técnicos, perfil comercial configurado e, quando solicitados, o resumo do contato ou a resposta colada pelo usuário. O texto da resposta não é persistido pelo Lead Radar; a OpenAI processa a solicitação conforme os termos e a configuração da conta da organização.
- HTML integral, credenciais e dados pessoais desnecessários não são enviados.
- Textos externos são tratados como dados não confiáveis; prompts instruem o modelo a ignorar qualquer instrução contida neles.
- Tokens de autorização, chaves de API e senhas não são registrados nos logs.
- A indisponibilidade da IA não impede o uso do lead, do CRM ou das informações técnicas.
- O score de confiança não garante a veracidade de cada frase; revise a análise e a mensagem antes de abordar a empresa.

## Limitações atuais

Ainda não estão implementados análise profunda, criação automática de tarefas, integração de envio de mensagens nem dashboard de custo. A classificação/sugestão de resposta e o follow-up exigem entrada manual e não detectam contatos ou respostas automaticamente.
