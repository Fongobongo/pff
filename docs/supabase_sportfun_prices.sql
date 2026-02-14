-- Run once in Supabase SQL editor.
-- Stores token prices used by Sport.fun pages.

create table if not exists public.sportfun_token_prices (
  chain text not null default 'base',
  token_address text not null,
  -- "__contract__" = contract-level price row (no specific ERC-1155 token_id).
  token_id text not null default '__contract__',
  price_usdc_raw text not null,
  source text not null,
  as_of timestamptz not null default now(),
  provider_payload jsonb null,
  updated_at timestamptz not null default now(),
  constraint sportfun_token_prices_pk primary key (chain, token_address, token_id)
);

create index if not exists sportfun_token_prices_token_idx
  on public.sportfun_token_prices (token_address, token_id);

create index if not exists sportfun_token_prices_asof_idx
  on public.sportfun_token_prices (as_of desc);

create or replace function public.sportfun_token_prices_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sportfun_token_prices_updated_at on public.sportfun_token_prices;
create trigger trg_sportfun_token_prices_updated_at
before update on public.sportfun_token_prices
for each row execute function public.sportfun_token_prices_set_updated_at();
