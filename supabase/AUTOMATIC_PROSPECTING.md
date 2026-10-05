# Prospecção automática

A automação é desativada por padrão. Quando habilitada por um owner/admin, o cron verifica as organizações a cada minuto e inicia no máximo um job por organização e dia, no horário local configurado. A busca alterna os segmentos e localidades do ICP ativo. Cada job respeita o teto de 100 empresas; empresas abaixo do score mínimo não são salvas como leads. Alertas para scores a partir do corte configurado aparecem no sino de notificações do aplicativo. Nenhuma mensagem de prospecção é enviada.

## Configuração do Supabase

1. No menu mostrado na imagem, abra **Database → Extensions**, pesquise por **Vault** e habilite a extensão. Essa seção é o catálogo/controle de extensões; o Vault não aparece como uma opção separada no menu Database da imagem.
2. Aplique as migrations, incluindo `20261005150000_automatic_prospecting.sql`.
3. Publique as Edge Functions `automatic-prospecting` e `prospecting-search`.
4. Abra a área de gerenciamento do Vault no Dashboard e crie estes dois secrets:
   - `lead_radar_automatic_prospecting_url`: URL completa da função, por exemplo `https://<project-ref>.supabase.co/functions/v1/automatic-prospecting`.
   - `lead_radar_automatic_prospecting_service_role_key`: a chave `service_role` do projeto.
5. A migration agenda `lead-radar-automatic-prospecting` para executar a cada minuto. Ela não faz chamadas enquanto os dois segredos do Vault estiverem ausentes.
6. Confirme em **Database → Cron Jobs** que o job está ativo. Não coloque a chave `service_role` em variáveis do frontend, no código-fonte ou em comandos versionados.

O horário inicial é 08:00 em `America/Sao_Paulo`; a agenda considera o horário local e recupera uma execução perdida mais tarde no mesmo dia. Uma falha pode ser tentada novamente após 30 minutos. A tela de Configurações permite alterar o horário, o limite diário (1–100), o score mínimo (0–100) e o score de alerta, que deve ser igual ou superior ao score mínimo.
