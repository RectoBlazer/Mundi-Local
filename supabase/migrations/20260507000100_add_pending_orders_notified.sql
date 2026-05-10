alter table public.pending_orders
add column if not exists notified boolean not null default false;

create index if not exists pending_orders_notified_idx
  on public.pending_orders (user_id, status, notified);