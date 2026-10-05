# Privacidade e LGPD — fundação operacional

Este documento descreve controles técnicos do produto, não constitui parecer jurídico. O operador/controlador deve definir finalidade, base legal, prazos de retenção, avisos e responsáveis com assessoria adequada.

## Dados e finalidade

- Conta: e-mail, nome e avatar para autenticação/identificação.
- Organização: configurações comerciais, membros e dados de CRM.
- Empresas: dados empresariais obtidos de Google Places e websites públicos para prospecção B2B.
- Leads/atividades/conversas/reuniões/propostas: registros fornecidos pela organização para organizar relacionamento comercial.
- IA: contexto do lead, sinais empresariais e instruções comerciais enviados a provedor externo quando a operação é acionada.
- Operação: logs de uso, jobs e métricas técnicas para segurança e controle de custos.

Evitar dados pessoais que não sejam necessários. Não coletar identidade ou histórico de pessoas que pesquisam empresas no Google, não fazer scraping de perfis/rede social e não burlar controles de provedores.

## Direitos, acesso e retenção

O app ainda não possui Central de Privacidade, exportação completa por titular ou fluxo automatizado de exclusão. Até sua implementação, o operador deve receber e cumprir solicitações por canal de suporte documentado, verificar a identidade e registrar atendimento. A exclusão de conta pode exigir tratamento de referências em organizações e registros financeiros/operacionais; não executar SQL manual sem avaliar cascatas e retenções legais.

RLS limita acesso aos dados por membership de organização. Logs operacionais devem excluir senhas, tokens, chaves e conteúdo privado desnecessário. Definir prazo de retenção por classe de dado e automatizar limpeza antes de produção; atualmente essa retenção automatizada ainda não existe.

## Terceiros

- Supabase: auth, banco e processamento server-side.
- Google Places/PageSpeed: descoberta e métricas públicas.
- OpenAI: somente operações de IA acionadas pelo usuário, quando configuradas.

Revisar contratos, regiões de processamento, transferências internacionais, configurações de retenção e termos de cada fornecedor antes de produção.

## Procedimentos mínimos

1. Documentar o canal de solicitação do titular e prazos de resposta.
2. Validar identidade e escopo da solicitação sem enviar credenciais por e-mail.
3. Aplicar correção/exportação/exclusão com registro de auditoria sem incluir payload sensível no log.
4. Avaliar cópias de backup e prazos de retenção após exclusão.
5. Registrar consentimento apenas quando aplicável; o sistema ainda não possui gestão de consentimentos.

Estado das funcionalidades é detalhado em [PRODUCTION_AUDIT.md](./PRODUCTION_AUDIT.md).
