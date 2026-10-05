# Produto

<!-- impeccable:product-schema 1 -->

## Plataforma

web

## Stack

Aplicação React, Vite e TypeScript; Supabase para autenticação, banco de dados, políticas RLS e Edge Functions; hospedagem do frontend planejada na Hostinger.

## Usuários

O usuário principal é um freelancer de criação de sites que prospecta empresas, qualifica oportunidades digitais e prepara abordagens comerciais para vender seus serviços.

## Propósito do produto

O Lead Radar AI encontra empresas e organiza sinais públicos de presença digital para ajudar o freelancer a identificar oportunidades e decidir como abordar cada prospect.

## Posicionamento

O produto combina descoberta de empresas, evidências técnicas verificáveis e recomendações comerciais acionáveis em um fluxo de prospecção, mantendo a revisão humana antes de qualquer contato.

## Contexto operacional

O usuário inicia buscas por segmento e localização, acompanha jobs de prospecção, revisa leads e trabalha oportunidades no CRM. Dados reais são obtidos por integrações configuradas no backend; o modo local de demonstração é rotulado e usa dados fictícios.

## Capacidades e restrições

- A prospecção real utiliza Google Places por Supabase Edge Function.
- Análises digitais devem se basear em dados realmente disponíveis e públicos.
- Inteligência artificial pode fazer inferências comerciais, mas deve distingui-las de fatos e não inventar informações.
- Mensagens geradas são rascunhos para revisão humana; o sistema não deve enviá-las automaticamente nesta etapa.
- Chaves de provedores externos permanecem somente no ambiente server-side.
- A arquitetura atual é multi-organização e deve preservar isolamento por RLS.

## Evidências disponíveis

O repositório contém o app funcional, o motor de prospecção, integração com Supabase e modo de demonstração. Não há depoimentos, métricas comerciais ou resultados de clientes aprovados para uso como prova.

## Princípios do produto

- Evidência antes de inferência.
- Recomendações úteis, explicáveis e vinculadas ao contexto disponível.
- Revisão humana antes de qualquer contato comercial.
- Isolamento de dados entre organizações.
- Falhas de IA não devem bloquear o acesso ao CRM ou aos dados técnicos.
