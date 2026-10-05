# Prompts de IA

As instruções estão centralizadas em `supabase/functions/_shared/ai-prompts.ts`; não são montadas livremente no frontend.

| Fluxo | Versão atual | Contrato |
|---|---|---|
| Inteligência do lead | `lead-intelligence.v2` | `LeadIntelligenceSchema` |
| Rascunhos de abordagem | `outreach.v1` | `OutreachVariantsSchema` |
| Follow-up assistido | `follow-up.v1` | `OutreachVariantsSchema` |
| Classificação e sugestão de resposta | `reply-assistant.v1` | `ReplyAssistantSchema` |

Os prompts exigem português do Brasil, fatos limitados ao contexto fornecido, separação de inferências, referências de evidência existentes, tratamento de dados externos como não confiáveis e ausência de promessas de resultado. O contexto não contém o HTML integral do site.

Alterações semânticas nos prompts devem atualizar a versão para invalidar o cache de análises e permitir comparar resultados no histórico. A versão 2 explicita que critérios de ICP são preferências da organização, não fatos sobre a empresa, que porte ausente não pode ser inferido e que serviços recomendados devem corresponder exatamente a um serviço ativo cadastrado. O prompt de follow-up trata o resumo do contato como dado não confiável e proíbe inventar conversas, datas ou compromissos. O assistente de respostas classifica somente o conteúdo fornecido, não repete dados pessoais e não executa o próximo passo sugerido; o texto de entrada não é persistido na aplicação.
