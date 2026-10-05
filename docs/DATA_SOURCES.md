# Fontes de dados

| Fonte | Dados usados | Finalidade | Controles |
|---|---|---|---|
| Google Places API oficial | Identificador de local, nome, endereço, site, telefone e dados públicos retornados pelo endpoint consultado | Descobrir empresas por segmento/localização e deduplicar | Chave somente em Edge Function; usar API/fields oficiais e respeitar termos, quotas e retenção permitida. |
| Websites públicos | Metadados e sinais técnicos públicos necessários para qualificação digital | Analisar presença digital | Validar destinos públicos; não coletar conteúdo privado ou contornar proteções. |
| PageSpeed Insights | Métricas técnicas do website | Priorizar melhoria de performance/acessibilidade/SEO | Chave server-side opcional; indisponibilidade deve ser falha parcial. |
| OpenAI | Contexto comercial mínimo e sinais da empresa em funções acionadas manualmente | Produzir análise e rascunhos revisados por humano | Chave server-side; controlar quota/custo e revisar retenção/termos do provedor. |
| Usuário/organização | CRM, mensagens registradas, reuniões, propostas e configurações | Operação comercial e personalização | Isolamento por tenant via RLS; limitar coleta e retenção. |

Registros devem manter timestamp e origem quando o schema permite. O app não consulta histórico individual de busca, não identifica quem pesquisou uma empresa e não faz scraping de LinkedIn ou automação para burlar serviços.
