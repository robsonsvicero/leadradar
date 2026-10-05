# Custos e cotas de IA

As chamadas à OpenAI acontecem somente após ação explícita do usuário. O padrão atual limita cada usuário a 20 análises, 20 gerações de abordagem, 20 gerações de follow-up e 20 assistências de resposta por organização e dia. Os limites podem ser alterados nos secrets `AI_DAILY_ANALYSES_LIMIT`, `AI_DAILY_MESSAGES_LIMIT` e `AI_DAILY_REPLY_ASSISTANT_LIMIT`; o banco aplica contadores atômicos separados por data, usuário, organização e operação.

Cada chamada registra provedor, modelo, tipo de operação, latência, tokens de entrada/saída, estado e versão do prompt. O custo estimado só é calculado quando `AI_INPUT_USD_PER_MILLION` e `AI_OUTPUT_USD_PER_MILLION` estiverem definidos com valores atuais para o modelo usado. Caso contrário, o campo permanece `null`, sem simular ou inventar custo.

Consulte a página oficial de preços da OpenAI para definir as taxas atuais do modelo: https://openai.com/api/pricing/. As tabelas de preço mudam; revise os secrets ao trocar de modelo. A cota implementada é por número de requisições, não é um teto monetário. Configure também limites de gasto no painel da OpenAI.

A página **Uso de IA** (`/ai-usage`) apresenta o histórico e agrega chamadas, tokens e custos estimados dos últimos 7, 30 ou 90 dias para as organizações do usuário. O painel carrega até 5.000 registros por período e informa quando os totais são parciais; a lista mostra até 100 chamadas recentes. Custos ausentes aparecem como não estimados e não devem ser interpretados como chamadas gratuitas. Consulte o faturamento da OpenAI para os valores finais.

O custo do processamento estruturado pode aumentar se a saída inválida acionar a única tentativa de correção. Cache de análise bem-sucedido evita chamadas repetidas quando os dados, prompt e modelo não mudaram.
