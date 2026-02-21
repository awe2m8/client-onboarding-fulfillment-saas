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
