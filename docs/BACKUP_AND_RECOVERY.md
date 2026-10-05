# Backup e recuperação

Não assumir que hospedagem gerenciada significa backup testado. Confirmar o plano contratado do projeto Supabase antes de produção.

## Política a aprovar

Definir formalmente RPO, RTO, frequência e retenção de acordo com plano Supabase, volume e criticidade. Como objetivo inicial sujeito à aprovação do operador, considerar RPO de até 24 h e RTO de até 8 h; estes valores não são garantias atuais.

## Procedimento

1. Habilitar backups/PITR disponíveis no plano e registrar janela de retenção no inventário operacional.
2. Manter exportação adicional criptografada em storage controlado, com acesso restrito e teste de integridade.
3. Versionar migrations no repositório; nunca depender de um dump como substituto de schema/migrations.
4. Registrar responsável, data, projeto/região e retenção de cada cópia sem incluir secrets nos logs.
5. Testar restore em projeto isolado pelo menos trimestralmente e após mudança relevante de plano/arquitetura.
6. Medir RPO/RTO reais no restore, validar contagem/consistência e testar login, RLS e fluxo de prospecção antes de liberar tráfego.

## Recuperação

- Interromper gravações/Edge Functions se houver corrupção ou perda de integridade.
- Restaurar em projeto isolado primeiro; comparar migrations, dados e horário da cópia.
- Validar memberships, tenant isolation e políticas RLS antes de redirecionar o frontend.
- Comunicar impacto e janela de dados perdida ao responsável.
- Retomar integrações gradualmente e verificar logs/custos.

Não há evidência nesta auditoria de restore ensaiado; backup/PITR e retenção precisam ser confirmados no dashboard do provedor.
