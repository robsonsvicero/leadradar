# Propostas comerciais

## Disponibilidade

A rota `/proposals` permite criar propostas internas em rascunho, ligadas a um lead e à sua organização. Cada proposta contém título, escopo, validade opcional e de 1 a 30 itens com quantidade e preço unitário em reais. O total exibido no quadro é calculado no banco a partir dos itens, não é aceito como dado confiável vindo do navegador.

O quadro agrupa rascunhos, envios registrados, propostas aceitas e propostas encerradas. Status não avançam sozinhos: o usuário registra manualmente um envio realizado fora do Lead Radar e marca a decisão quando ela ocorrer. Mudanças permitidas e eventos de criação/status aparecem na timeline do lead.

## Limites atuais

- Não há catálogo, descontos, impostos, parcelamento, geração ou exportação de PDF, link público, assinatura eletrônica, rastreamento de abertura, envio de e-mail/WhatsApp ou lembretes.
- Marcar uma proposta como enviada somente registra uma ação externa já realizada; o app não envia a proposta.
- As etapas aceitam transições draft → sent/cancelled e sent → accepted/rejected/cancelled. Propostas decididas não podem ser alteradas por esse fluxo.
- Valores usam BRL, sem configuração de moeda, imposto ou desconto.
- RLS limita propostas e itens aos membros da organização; a relação composta impede vincular um lead de outro tenant.
- O modo demonstração salva dados fictícios no `localStorage`; não os confunda com propostas persistidas no Supabase.

A IA não deve inventar valores, descontos, prazos nem compromissos. Não registre propostas em campos livres do lead como se fossem documentos comerciais aprovados.

## Banco

Aplique `supabase/migrations/20261004220000_sales_proposals.sql` depois das migrations de CRM, Inbox e reuniões. A RPC `create_sales_proposal` cria cabeçalho e itens numa única transação; o banco deriva os totais e registra eventos de timeline.
