create table if not exists transactions (
  id bigserial primary key,
  tx_date date not null,
  description text not null,
  amount_cents integer not null,
  category text not null default 'Uncategorized',
  partner_split_pct numeric(5,2) not null default 50,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  unique (tx_date, description, amount_cents)
);

create index if not exists idx_transactions_tx_date on transactions (tx_date desc);
create index if not exists idx_transactions_category on transactions (category);

create table if not exists ops_client_records (
  workspace_key text not null,
  app_key text not null default 'onboarding',
  client_id text not null,
  payload jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (workspace_key, app_key, client_id)
);

alter table if exists ops_client_records add column if not exists app_key text;
update ops_client_records set app_key = 'onboarding' where app_key is null;
alter table if exists ops_client_records alter column app_key set default 'onboarding';
alter table if exists ops_client_records alter column app_key set not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'ops_client_records_pkey'
      and conrelid = 'ops_client_records'::regclass
  ) then
    alter table ops_client_records drop constraint ops_client_records_pkey;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ops_client_records_pkey'
      and conrelid = 'ops_client_records'::regclass
  ) then
    alter table ops_client_records add constraint ops_client_records_pkey primary key (workspace_key, app_key, client_id);
  end if;
end
$$;

create index if not exists idx_ops_client_records_workspace on ops_client_records (workspace_key);
create index if not exists idx_ops_client_records_workspace_app on ops_client_records (workspace_key, app_key);
create index if not exists idx_ops_client_records_updated on ops_client_records (updated_at desc);
