alter table product add column if not exists stock_version bigint not null default 0;

update app_role set permissions=permissions || '["stock:adjust"]'::jsonb
where name in ('admin','manager') and not permissions @> '["stock:adjust"]'::jsonb
  and not permissions @> '["*"]'::jsonb;

-- Every stock writer participates, including sales, cancellations and imports.
create or replace function advance_product_stock_version() returns trigger language plpgsql as $$
declare targets uuid[];
begin
  if TG_OP='INSERT' then targets:=array[NEW.product_id];
  elsif TG_OP='DELETE' then targets:=array[OLD.product_id];
  else targets:=array[OLD.product_id,NEW.product_id]; end if;
  perform id from product where id=any(targets) order by id for no key update;
  update product set stock_version=stock_version+1 where id=any(targets);
  if TG_OP='DELETE' then return OLD; end if;
  return NEW;
end $$;
create trigger stock_movement_version before insert or update or delete on stock_movement
for each row execute function advance_product_stock_version();
create trigger legacy_stock_version before insert or update or delete on product_legacy_stock
for each row execute function advance_product_stock_version();

-- Audit snapshots remain available after product/user labels change.
create index idx_manual_stock_history on audit_log((details->'product'->>'id'),created_at desc,id desc)
where action='STOCK_MANUAL_ADJUSTMENT';
create index idx_manual_stock_actor on audit_log((details->'actor'->>'id'),created_at desc,id desc)
where action='STOCK_MANUAL_ADJUSTMENT';
create or replace function protect_manual_stock_audit() returns trigger language plpgsql as $$
begin
  if TG_OP='TRUNCATE' then
    raise exception 'manual stock audit is append-only' using errcode='42501';
  end if;
  if OLD.action='STOCK_MANUAL_ADJUSTMENT' or (TG_OP='UPDATE' and NEW.action='STOCK_MANUAL_ADJUSTMENT') then
    raise exception 'manual stock audit is append-only' using errcode='42501';
  end if;
  if TG_OP='DELETE' then return OLD; end if;
  return NEW;
end $$;
create trigger manual_stock_audit_immutable before update or delete on audit_log
for each row execute function protect_manual_stock_audit();
create trigger manual_stock_audit_no_truncate before truncate on audit_log
for each statement execute function protect_manual_stock_audit();
