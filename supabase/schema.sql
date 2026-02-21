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
  client_id text not null,
  payload jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (workspace_key, client_id)
);

create index if not exists idx_ops_client_records_workspace on ops_client_records (workspace_key);
create index if not exists idx_ops_client_records_updated on ops_client_records (updated_at desc);
