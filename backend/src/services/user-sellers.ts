import type { PoolClient } from "pg";
import { query, withTransaction } from "../db.js";
import { badRequest, conflict, notFound, unauthorized } from "../errors.js";
import { logAudit } from "../utils/audit.js";

type Seller = {
  id: string;
  legacy_code: string | null;
  name: string;
  user_id?: string | null;
};

/** Called inside the sale transaction. Request JSON never supplies the actor ID. */
export async function resolveCheckoutSeller(
  client: PoolClient,
  actorUserId: string,
  sellerId: string | null,
): Promise<string> {
  if (sellerId) {
    const result = await query<Seller>(
      "select id from seller where id=$1 for key share",
      [sellerId],
      client,
    );
    if (!result.rows[0]) throw badRequest("seller_not_found");
    return result.rows[0].id;
  }
  // Serialize first-use creation and administrative reassignment for this account.
  const user = (
    await query<{ full_name: string; status: string }>(
      "select full_name,status from app_user where id=$1 for update",
      [actorUserId],
      client,
    )
  ).rows[0];
  if (!user || user.status !== "active") throw unauthorized();
  const linked = (
    await query<{ seller_id: string }>(
      "select seller_id from user_seller where user_id=$1",
      [actorUserId],
      client,
    )
  ).rows[0];
  if (linked) return linked.seller_id;
  // Keep an account's automatic identity stable even after clearing a manual link.
  const seller = (
    await query<Seller>(
      `insert into seller(name,user_id) values($1,$2)
    on conflict(user_id) do update set user_id=excluded.user_id returning id`,
      [user.full_name, actorUserId],
      client,
    )
  ).rows[0];
  await query(
    "insert into user_seller(user_id,seller_id,automatic) values($1,$2,true)",
    [actorUserId, seller.id],
    client,
  );
  await logAudit({
    userId: actorUserId,
    action: "USER_SELLER_AUTO_LINKED",
    details: { sellerId: seller.id },
    client,
  });
  return seller.id;
}

export async function listRoleUserSellers(
  roleId: string,
  search: string | undefined,
  limit: number,
  offset: number,
) {
  if (!(await query("select id from app_role where id=$1", [roleId])).rowCount)
    throw notFound("role not found");
  const { rows } = await query(
    `select u.id,u.full_name as "fullName",u.email,u.status,
    case when s.id is null then null else jsonb_build_object('id',s.id,'name',s.name,'legacy_code',s.legacy_code) end as seller,
    coalesce(us.automatic,false) as automatic
    from app_user u left join user_seller us on us.user_id=u.id left join seller s on s.id=us.seller_id
    where u.role_id=$1 and ($2='' or u.full_name ilike $2 or u.email ilike $2)
    order by lower(u.full_name),u.id limit $3 offset $4`,
    [roleId, search ? `%${search}%` : "", limit + 1, offset],
  );
  return {
    items: rows.slice(0, limit),
    limit,
    offset,
    hasMore: rows.length > limit,
  };
}

export async function setUserSeller(input: {
  roleId: string;
  userId: string;
  sellerId: string | null;
  actorId: string;
  ip?: string | null;
}) {
  try {
    return await withTransaction(async (client) => {
      const user = (
        await query<{ role_id: string | null }>(
          "select role_id from app_user where id=$1 for update",
          [input.userId],
          client,
        )
      ).rows[0];
      if (!user) throw notFound("user_not_found");
      if (user.role_id !== input.roleId) throw conflict("user_role_changed");
      const previous =
        (
          await query<{ seller_id: string }>(
            "select seller_id from user_seller where user_id=$1",
            [input.userId],
            client,
          )
        ).rows[0]?.seller_id ?? null;
      if (previous === input.sellerId) return { sellerId: previous };
      if (input.sellerId) {
        const seller = (
          await query<Seller>(
            "select id,user_id from seller where id=$1 for key share",
            [input.sellerId],
            client,
          )
        ).rows[0];
        if (!seller) throw badRequest("seller_not_found");
        if (seller.user_id && seller.user_id !== input.userId)
          throw conflict("seller_link_in_use");
        await query(
          `insert into user_seller(user_id,seller_id,automatic) values($1,$2,false)
          on conflict(user_id) do update set seller_id=excluded.seller_id,automatic=false,updated_at=now()`,
          [input.userId, input.sellerId],
          client,
        );
      } else {
        await query(
          "delete from user_seller where user_id=$1",
          [input.userId],
          client,
        );
      }
      await logAudit({
        userId: input.actorId,
        action: "USER_SELLER_LINK_CHANGED",
        details: {
          userId: input.userId,
          roleId: input.roleId,
          previousSellerId: previous,
          sellerId: input.sellerId,
        },
        ipAddress: input.ip,
        client,
      });
      return { sellerId: input.sellerId };
    });
  } catch (error) {
    if (
      (error as { constraint?: string }).constraint ===
      "user_seller_seller_id_key"
    )
      throw conflict("seller_link_in_use");
    throw error;
  }
}
