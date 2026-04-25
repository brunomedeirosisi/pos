create table if not exists system_legacy_import_checkpoint (
  import_id uuid not null references system_legacy_import(id) on delete cascade,
  stage text not null,
  status text not null check (status in ('pending', 'running', 'completed', 'failed')),
  started_at timestamptz,
  finished_at timestamptz,
  summary jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (import_id, stage)
);

create index if not exists idx_system_legacy_import_checkpoint_status
  on system_legacy_import_checkpoint(import_id, status, updated_at desc);

create table if not exists system_legacy_import_dead_letter (
  id bigserial primary key,
  import_id uuid references system_legacy_import(id) on delete set null,
  session_id text,
  attempts integer not null default 0,
  error_message text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_system_legacy_import_dead_letter_import
  on system_legacy_import_dead_letter(import_id, created_at desc);

alter table system_legacy_import add column if not exists retry_count integer not null default 0;
alter table system_legacy_import add column if not exists current_stage text;
alter table system_legacy_import add column if not exists last_error_stage text;
alter table system_legacy_import add column if not exists reconciliation_version text;
alter table system_legacy_import add column if not exists report_json_path text;
alter table system_legacy_import add column if not exists last_heartbeat timestamptz;

create table if not exists stg_grupo (
  cod_grup text,
  nome text
);
alter table stg_grupo add column if not exists cod_grup text;
alter table stg_grupo add column if not exists nome text;

create table if not exists stg_produto (
  cod_prod text,
  nome_prod text,
  cod_barra text,
  referencia text,
  cod_grup text,
  esto_min text,
  avista text,
  preco_base text
);
alter table stg_produto add column if not exists cod_prod text;
alter table stg_produto add column if not exists nome_prod text;
alter table stg_produto add column if not exists cod_barra text;
alter table stg_produto add column if not exists referencia text;
alter table stg_produto add column if not exists cod_grup text;
alter table stg_produto add column if not exists esto_min text;
alter table stg_produto add column if not exists avista text;
alter table stg_produto add column if not exists preco_base text;

create table if not exists stg_clientes (
  codigo text,
  nome text,
  cpf text,
  endereco text,
  cidade text,
  uf text,
  cep text,
  fone text,
  status text,
  obs text
);
alter table stg_clientes add column if not exists codigo text;
alter table stg_clientes add column if not exists nome text;
alter table stg_clientes add column if not exists cpf text;
alter table stg_clientes add column if not exists endereco text;
alter table stg_clientes add column if not exists cidade text;
alter table stg_clientes add column if not exists uf text;
alter table stg_clientes add column if not exists cep text;
alter table stg_clientes add column if not exists fone text;
alter table stg_clientes add column if not exists status text;
alter table stg_clientes add column if not exists obs text;

create table if not exists stg_vendedor (
  codigo text,
  nome text
);
alter table stg_vendedor add column if not exists codigo text;
alter table stg_vendedor add column if not exists nome text;

create table if not exists stg_forma_pg (
  cod_fpg text,
  forma text
);
alter table stg_forma_pg add column if not exists cod_fpg text;
alter table stg_forma_pg add column if not exists forma text;

create table if not exists stg_vendas (
  pedido text,
  emissao text,
  cod_vend text,
  cod_cli text,
  cod_fpg text,
  sub_total text,
  desconto text,
  total_gera text,
  cod1 text,
  cod2 text,
  cod3 text,
  cod4 text,
  cod5 text,
  cod6 text,
  cod7 text,
  qtde1 text,
  qtde2 text,
  qtde3 text,
  qtde4 text,
  qtde5 text,
  qtde6 text,
  qtde7 text,
  vlr1 text,
  vlr2 text,
  vlr3 text,
  vlr4 text,
  vlr5 text,
  vlr6 text,
  vlr7 text,
  total1 text,
  total2 text,
  total3 text,
  total4 text,
  total5 text,
  total6 text,
  total7 text
);
alter table stg_vendas add column if not exists pedido text;
alter table stg_vendas add column if not exists emissao text;
alter table stg_vendas add column if not exists cod_vend text;
alter table stg_vendas add column if not exists cod_cli text;
alter table stg_vendas add column if not exists cod_fpg text;
alter table stg_vendas add column if not exists sub_total text;
alter table stg_vendas add column if not exists desconto text;
alter table stg_vendas add column if not exists total_gera text;
alter table stg_vendas add column if not exists cod1 text;
alter table stg_vendas add column if not exists cod2 text;
alter table stg_vendas add column if not exists cod3 text;
alter table stg_vendas add column if not exists cod4 text;
alter table stg_vendas add column if not exists cod5 text;
alter table stg_vendas add column if not exists cod6 text;
alter table stg_vendas add column if not exists cod7 text;
alter table stg_vendas add column if not exists qtde1 text;
alter table stg_vendas add column if not exists qtde2 text;
alter table stg_vendas add column if not exists qtde3 text;
alter table stg_vendas add column if not exists qtde4 text;
alter table stg_vendas add column if not exists qtde5 text;
alter table stg_vendas add column if not exists qtde6 text;
alter table stg_vendas add column if not exists qtde7 text;
alter table stg_vendas add column if not exists vlr1 text;
alter table stg_vendas add column if not exists vlr2 text;
alter table stg_vendas add column if not exists vlr3 text;
alter table stg_vendas add column if not exists vlr4 text;
alter table stg_vendas add column if not exists vlr5 text;
alter table stg_vendas add column if not exists vlr6 text;
alter table stg_vendas add column if not exists vlr7 text;
alter table stg_vendas add column if not exists total1 text;
alter table stg_vendas add column if not exists total2 text;
alter table stg_vendas add column if not exists total3 text;
alter table stg_vendas add column if not exists total4 text;
alter table stg_vendas add column if not exists total5 text;
alter table stg_vendas add column if not exists total6 text;
alter table stg_vendas add column if not exists total7 text;

create table if not exists stg_pedidos (
  pedido text,
  emissao text,
  cod_vend text,
  cod_cli text,
  cod_fpg text,
  sub_total text,
  desconto text,
  total_gera text,
  cod1 text,
  cod2 text,
  cod3 text,
  cod4 text,
  cod5 text,
  cod6 text,
  cod7 text,
  qtde1 text,
  qtde2 text,
  qtde3 text,
  qtde4 text,
  qtde5 text,
  qtde6 text,
  qtde7 text,
  vlr1 text,
  vlr2 text,
  vlr3 text,
  vlr4 text,
  vlr5 text,
  vlr6 text,
  vlr7 text,
  total1 text,
  total2 text,
  total3 text,
  total4 text,
  total5 text,
  total6 text,
  total7 text
);
alter table stg_pedidos add column if not exists pedido text;
alter table stg_pedidos add column if not exists emissao text;
alter table stg_pedidos add column if not exists cod_vend text;
alter table stg_pedidos add column if not exists cod_cli text;
alter table stg_pedidos add column if not exists cod_fpg text;
alter table stg_pedidos add column if not exists sub_total text;
alter table stg_pedidos add column if not exists desconto text;
alter table stg_pedidos add column if not exists total_gera text;
alter table stg_pedidos add column if not exists cod1 text;
alter table stg_pedidos add column if not exists cod2 text;
alter table stg_pedidos add column if not exists cod3 text;
alter table stg_pedidos add column if not exists cod4 text;
alter table stg_pedidos add column if not exists cod5 text;
alter table stg_pedidos add column if not exists cod6 text;
alter table stg_pedidos add column if not exists cod7 text;
alter table stg_pedidos add column if not exists qtde1 text;
alter table stg_pedidos add column if not exists qtde2 text;
alter table stg_pedidos add column if not exists qtde3 text;
alter table stg_pedidos add column if not exists qtde4 text;
alter table stg_pedidos add column if not exists qtde5 text;
alter table stg_pedidos add column if not exists qtde6 text;
alter table stg_pedidos add column if not exists qtde7 text;
alter table stg_pedidos add column if not exists vlr1 text;
alter table stg_pedidos add column if not exists vlr2 text;
alter table stg_pedidos add column if not exists vlr3 text;
alter table stg_pedidos add column if not exists vlr4 text;
alter table stg_pedidos add column if not exists vlr5 text;
alter table stg_pedidos add column if not exists vlr6 text;
alter table stg_pedidos add column if not exists vlr7 text;
alter table stg_pedidos add column if not exists total1 text;
alter table stg_pedidos add column if not exists total2 text;
alter table stg_pedidos add column if not exists total3 text;
alter table stg_pedidos add column if not exists total4 text;
alter table stg_pedidos add column if not exists total5 text;
alter table stg_pedidos add column if not exists total6 text;
alter table stg_pedidos add column if not exists total7 text;

create table if not exists stg_pagament (
  cod_cli text,
  valor_doc text,
  vlr_pago text,
  restante text,
  pagamento text
);
alter table stg_pagament add column if not exists cod_cli text;
alter table stg_pagament add column if not exists valor_doc text;
alter table stg_pagament add column if not exists vlr_pago text;
alter table stg_pagament add column if not exists restante text;
alter table stg_pagament add column if not exists pagamento text;

create table if not exists stg_mov_est (
  tip_mov text,
  data text,
  cod_prod text,
  qtde text,
  valor text,
  total text,
  nf text
);
alter table stg_mov_est add column if not exists tip_mov text;
alter table stg_mov_est add column if not exists data text;
alter table stg_mov_est add column if not exists cod_prod text;
alter table stg_mov_est add column if not exists qtde text;
alter table stg_mov_est add column if not exists valor text;
alter table stg_mov_est add column if not exists total text;
alter table stg_mov_est add column if not exists nf text;
