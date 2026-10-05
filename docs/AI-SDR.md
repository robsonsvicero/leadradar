# Workspace AI SDR

O workspace `/ai-sdr` organiza tarefas, leads prioritários com dados já registrados, recomendações de análises salvas e rascunhos aprovados. A página `/ai-usage` apresenta o histórico de chamadas, tokens e custos estimados.

Carregar o workspace não inicia análises, cria tarefas nem envia mensagens. As recomendações são revisadas por uma pessoa; não há inbox ou monitoramento de conversas. Respostas podem ser coladas manualmente na ficha de um lead, e o texto recebido não é persistido pela aplicação.

O painel de IA depende das migrations, Edge Functions, associação à organização e configuração server-side da OpenAI. Saldo esgotado ou integração ausente deve ser corrigido no provider; o CRM e as tarefas continuam disponíveis sem a IA.

Ainda não existe briefing diário persistido, geração automática de tarefas a partir de recomendações ou insights estatísticos de performance.
