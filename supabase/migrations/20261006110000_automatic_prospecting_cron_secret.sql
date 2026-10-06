do $$
declare
  existing_job_id bigint;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    raise notice 'Vault não está disponível; o agendamento automático não foi atualizado.';
    return;
  end if;

  select jobid into existing_job_id
  from cron.job
  where jobname = 'lead-radar-automatic-prospecting';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'lead-radar-automatic-prospecting',
    '* * * * *',
    $cron$
      select net.http_post(
        url := (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'lead_radar_automatic_prospecting_url'
        ),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'lead_radar_automatic_prospecting_service_role_key'
          ),
          'Authorization', 'Bearer ' || (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'lead_radar_automatic_prospecting_service_role_key'
          ),
          'x-automatic-prospecting-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'lead_radar_automatic_prospecting_cron_secret'
          )
        ),
        body := '{}'::jsonb
      )
      where exists (
        select 1 from vault.decrypted_secrets
        where name = 'lead_radar_automatic_prospecting_url'
      )
      and exists (
        select 1 from vault.decrypted_secrets
        where name = 'lead_radar_automatic_prospecting_service_role_key'
      )
      and exists (
        select 1 from vault.decrypted_secrets
        where name = 'lead_radar_automatic_prospecting_cron_secret'
      );
    $cron$
  );
end;
$$;
