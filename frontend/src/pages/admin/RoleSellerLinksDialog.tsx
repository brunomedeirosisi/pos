import { useListQuery, useListState } from '../../hooks/useListQuery';
import { ListPagination } from '../../components/ui/Pagination';
import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { rolesService } from "../../services/admin";
import { sellersService } from "../../services/catalog";
import type { Role, RoleUserSeller } from "../../types/admin";
import { useHasPermission } from "../../store/auth";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { Modal } from "../../components/ui/Modal";
import {
  SearchableSelect,
  type SelectOption,
} from "../../components/ui/SearchableSelect";
import { useToast } from "../../components/ui/ToastProvider";

function UserSellerRow({
  user,
  options,
  disabled,
  saving,
  canWrite,
  save,
}: {
  user: RoleUserSeller;
  options: SelectOption[];
  disabled: boolean;
  saving: boolean;
  canWrite: boolean;
  save: (sellerId: string | null) => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<SelectOption>({
    value: user.seller?.id ?? "",
    label: user.seller?.name ?? "",
  });
  const choices =
    selected.value && !options.some((item) => item.value === selected.value)
      ? [...options, selected]
      : options;
  return (
    <tr>
      <td>
        {user.fullName}
        <br />
        <small>{user.email}</small>
        {user.status !== "active" && (
          <small> · {t("roles.userDisabled")}</small>
        )}
      </td>
      <td>
        <label
          className="sr-only"
          id={`user-seller-${user.id}-label`}
          htmlFor={`user-seller-${user.id}`}
        >
          {t("roles.sellerForUser", { name: user.fullName })}
        </label>
        <SearchableSelect
          id={`user-seller-${user.id}`} resource="sellers"
          value={selected.value}
          options={choices}
          onChange={setSelected}
          optionsKey="role-user-sellers"
          disabled={disabled || !canWrite}
          loadOptions={async (search) =>
            (await sellersService.list(search)).map((item) => ({
              value: item.id,
              label: item.name,
            }))
          }
        />
        {!selected.value && <small>{t("roles.automaticSeller")}</small>}
      </td>
      <td>
        {canWrite && (
          <button
            type="button"
            className="button primary"
            disabled={disabled || selected.value === (user.seller?.id ?? "")}
            onClick={() => save(selected.value || null)}
          >
            {saving ? t("common.loading") : t("common.save")}
          </button>
        )}
      </td>
    </tr>
  );
}

export function RoleSellerLinksDialog({
  role,
  onClose,
}: {
  role: Role;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const cache = useQueryClient();
  const canRead = useHasPermission(["users:read", "users:write"]);
  const canWrite = useHasPermission("users:write");
  const [search, setSearch] = useListState(`role-${role.id}-users-search`, "");
  const term = useDebouncedValue(search, 300);
  const users = useListQuery<RoleUserSeller>({queryKey:['roles-user-sellers',role.id,term],resource:'role-users',
    filters:{roleId:role.id,search:term || undefined},stateKey:`role-${role.id}-users`,enabled:canRead});
  const sellers = useQuery({
    queryKey: ["role-seller-options"],
    queryFn: () => sellersService.list(),
    enabled: canWrite,
  });
  const mutation = useMutation({
    mutationFn: ({
      userId,
      sellerId,
    }: {
      userId: string;
      sellerId: string | null;
    }) => rolesService.linkSeller(role.id, userId, sellerId),
    onSuccess: () => {
      toast.show(t("common.saved"), "success");
      void cache.invalidateQueries({
        queryKey: ["roles-user-sellers", role.id],
      });
      void cache.invalidateQueries({ queryKey: ["pos-sellers"] });
      void cache.invalidateQueries({ queryKey: ["sales-sellers"] });
    },
    onError: (error: Error) => {
      toast.show(error.message, "error");
      void cache.invalidateQueries({
        queryKey: ["roles-user-sellers", role.id],
      });
    },
  });
  const options = (sellers.data ?? []).map((item) => ({
    value: item.id,
    label: item.name,
  }));
  return (
    <Modal
      open
      title={t("roles.sellerLinksTitle", { name: role.name })}
      width="1000px"
      onClose={() => {
        if (!mutation.isPending) onClose();
      }}
    >
      <p>{t("roles.sellerLinksHint")}</p>
      {!canRead ? (
        <p>{t("common.noPermission")}</p>
      ) : (
        <>
          <div className="form-group">
            <label htmlFor="role-user-search">{t("roles.searchUsers")}</label>
            <input
              id="role-user-search"
              type="search"
              value={search}
              disabled={mutation.isPending}
              onChange={(event) => {
                setSearch(event.target.value);
                
              }}
            />
          </div>
          {users.isPending && <p role="status">{t("common.loading")}</p>}
          {users.isError && (
            <p role="alert">
              {users.error.message}{" "}
              <button
                className="button secondary"
                onClick={() => {
                  void users.refetch();
                }}
              >
                {t("common.retry")}
              </button>
            </p>
          )}
          {canWrite && sellers.isError && (
            <p role="alert">
              {t("common.searchSelectLoadError")}{" "}
              <button
                className="button secondary"
                onClick={() => {
                  void sellers.refetch();
                }}
              >
                {t("common.retry")}
              </button>
            </p>
          )}
          {mutation.isError && <p role="alert">{mutation.error.message}</p>}
          {users.data && (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("users.fullName")}</th>
                    <th>{t("sellers.heading")}</th>
                    <th>{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.data.length === 0 && (
                    <tr>
                      <td colSpan={3}>{t("common.empty")}</td>
                    </tr>
                  )}
                  {users.data.map((user) => (
                    <UserSellerRow
                      key={`${user.id}:${user.seller?.id ?? ""}`}
                      user={user}
                      options={options}
                      disabled={
                        mutation.isPending || (canWrite && !sellers.isSuccess)
                      }
                      saving={
                        mutation.isPending &&
                        mutation.variables.userId === user.id
                      }
                      canWrite={canWrite}
                      save={(sellerId) =>
                        mutation.mutate({ userId: user.id, sellerId })
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ListPagination query={{...users,isFetching:users.isFetching || mutation.isPending}}/>

        </>
      )}
    </Modal>
  );
}
