import { useListQuery } from "../../hooks/useListQuery";
import { ListPagination } from "../../components/ui/Pagination";
import React, { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { rolesService } from "../../services/admin";
import type { Role } from "../../types/admin";
import { useToast } from "../../components/ui/ToastProvider";
import { useHasPermission } from "../../store/auth";
import { parseLocaleNumericInput } from "../../utils/number";
import { Modal } from "../../components/ui/Modal";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { RoleSellerLinksDialog } from "./RoleSellerLinksDialog";

const numericField = z.preprocess(
  parseLocaleNumericInput,
  z
    .number({ invalid_type_error: "Invalid number" })
    .nonnegative()
    .max(1000)
    .nullable(),
);

const roleSchema = z.object({
  name: z.string().trim().min(2, "Required"),
  description: z.string().trim().optional(),
  permissions: z.string().trim().min(1, "Required"),
  discountLimit: numericField.optional(),
});

type RoleFormValues = z.infer<typeof roleSchema>;

const defaultValues: RoleFormValues = {
  name: "",
  description: "",
  permissions: "",
  discountLimit: null,
};

export function RolesPage(): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  const [sellerLinksRole, setSellerLinksRole] = useState<Role | null>(null);

  const canReadRoles = useHasPermission([
    "roles:read",
    "roles:write",
    "users:read",
    "users:write",
  ]);
  const canManageRoles = useHasPermission("roles:write");
  const canReadSellerLinks = useHasPermission(["users:read", "users:write"]);

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleSchema),
    defaultValues,
  });

  const rolesQuery = useListQuery<Role>({
    queryKey: ["roles", "list"],
    resource: "roles",
    enabled: canReadRoles,
  });

  const roles = rolesQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: rolesService.create,
    onSuccess: () => {
      toast.show(t("common.saved"), "success");
      // Refetch é eventual; o QueryClient mantém o estado de erro das consultas.
      void queryClient.invalidateQueries({ queryKey: ["roles"] });
      closeForm();
    },
    onError: (error: Error) => toast.show(error.message, "error"),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof rolesService.update>[1];
    }) => rolesService.update(id, payload),
    onSuccess: () => {
      toast.show(t("common.saved"), "success");
      // Refetch é eventual; o QueryClient mantém o estado de erro das consultas.
      void queryClient.invalidateQueries({ queryKey: ["roles"] });
      closeForm();
    },
    onError: (error: Error) => toast.show(error.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => rolesService.remove(id),
    onSuccess: () => {
      toast.show(t("common.saved"), "success");
      // Refetch é eventual; o QueryClient mantém o estado de erro das consultas.
      void queryClient.invalidateQueries({ queryKey: ["roles"] });
      setRoleToDelete(null);
    },
    onError: (error: Error) => toast.show(error.message, "error"),
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  function closeForm() {
    setEditing(null);
    setIsFormOpen(false);
  }

  function openCreateForm() {
    if (!canManageRoles) {
      toast.show(t("common.noPermission"), "error");
      return;
    }
    setEditing(null);
    form.reset(defaultValues);
    setIsFormOpen(true);
  }

  function openEditForm(role: Role) {
    if (!canManageRoles) {
      toast.show(t("common.noPermission"), "error");
      return;
    }
    setEditing(role);
    form.reset({
      name: role.name,
      description: role.description ?? "",
      permissions: role.permissions.join("\n"),
      discountLimit: role.discountLimit,
    });
    setIsFormOpen(true);
  }

  const onSubmit = form.handleSubmit((values) => {
    if (!canManageRoles) {
      toast.show(t("common.noPermission"), "error");
      return;
    }

    const permissions = Array.from(
      new Set(
        values.permissions
          .split(/[\r\n,]+/)
          .map((token) => token.trim())
          .filter(Boolean),
      ),
    );

    if (permissions.length === 0) {
      form.setError("permissions", {
        type: "manual",
        message: t("roles.permissionsHint"),
      });
      return;
    }

    const payload = {
      name: values.name.trim(),
      description: values.description ? values.description.trim() : null,
      permissions,
      discountLimit: values.discountLimit ?? null,
    };

    if (editing) {
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  });

  const tableRows = useMemo(() => {
    if (rolesQuery.isLoading) {
      return (
        <tr>
          <td colSpan={4}>{t("common.loading")}</td>
        </tr>
      );
    }

    if (rolesQuery.isError) {
      return (
        <tr>
          <td colSpan={4}>{(rolesQuery.error as Error).message}</td>
        </tr>
      );
    }

    if (roles.length === 0) {
      return (
        <tr>
          <td colSpan={4}>{t("common.empty")}</td>
        </tr>
      );
    }

    return roles.map((role) => (
      <tr key={role.id}>
        <td>{role.name}</td>
        <td>{role.description ?? "--"}</td>
        <td>{role.permissions.join(", ")}</td>
        <td>
          <div className="table-actions">
            {canReadSellerLinks && (
              <button
                type="button"
                className="button secondary"
                onClick={() => setSellerLinksRole(role)}
              >
                {t("roles.sellerLinks")}
              </button>
            )}
            <button
              type="button"
              className="button secondary"
              onClick={() => openEditForm(role)}
              disabled={!canManageRoles}
            >
              {t("common.edit")}
            </button>
            <button
              type="button"
              className="button danger"
              onClick={() => handleDelete(role)}
              disabled={!canManageRoles || deleteMutation.isPending}
            >
              {t("common.delete")}
            </button>
          </div>
        </td>
      </tr>
    ));
  }, [
    rolesQuery.isLoading,
    rolesQuery.isError,
    rolesQuery.error,
    roles,
    t,
    canManageRoles,
    canReadSellerLinks,
    deleteMutation.isPending,
  ]);

  const handleDelete = (role: Role) => {
    if (!canManageRoles) {
      toast.show(t("common.noPermission"), "error");
      return;
    }
    setRoleToDelete(role);
  };

  if (!canReadRoles) {
    return (
      <div className="card">
        <h2>{t("roles.heading")}</h2>
        <p>{t("common.noPermission")}</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="toolbar">
        <div />
        {canManageRoles && (
          <button
            type="button"
            className="button primary"
            onClick={openCreateForm}
          >
            {t("common.add")}
          </button>
        )}
      </div>

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>{t("roles.heading")}</th>
              <th>{t("roles.description")}</th>
              <th>{t("roles.permissions")}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>{tableRows}</tbody>
        </table>
        <ListPagination query={rolesQuery} />
      </div>

      <Modal
        open={isFormOpen && canManageRoles}
        onClose={() => {
          if (isSubmitting) return;
          closeForm();
        }}
        title={editing ? t("roles.editTitle") : t("roles.addTitle")}
        width="760px"
      >
        <form onSubmit={onSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="name">{t("roles.heading")}*</label>
              <input id="name" {...form.register("name")} />
              {form.formState.errors.name && (
                <small className="form-error">
                  {form.formState.errors.name.message}
                </small>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="description">{t("roles.description")}</label>
              <input id="description" {...form.register("description")} />
            </div>
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="permissions">{t("roles.permissions")}*</label>
              <textarea
                id="permissions"
                rows={4}
                {...form.register("permissions")}
                placeholder={t("roles.permissionsHint")}
              />
              {form.formState.errors.permissions && (
                <small className="form-error">
                  {form.formState.errors.permissions.message}
                </small>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="discountLimit">{t("roles.discountLimit")}</label>
              <input
                id="discountLimit"
                type="number"
                step="0.01"
                {...form.register("discountLimit")}
              />
              {form.formState.errors.discountLimit && (
                <small className="form-error">
                  {form.formState.errors.discountLimit.message as string}
                </small>
              )}
            </div>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              onClick={closeForm}
              disabled={isSubmitting}
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? t("common.loading") : t("common.save")}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(roleToDelete)}
        title={t("roles.deleteConfirm")}
        description={roleToDelete?.name}
        confirmLabel={t("common.delete")}
        onClose={() => setRoleToDelete(null)}
        onConfirm={() => {
          if (!roleToDelete) return;
          deleteMutation.mutate(roleToDelete.id);
        }}
        isPending={deleteMutation.isPending}
        tone="danger"
      />
      {sellerLinksRole && (
        <RoleSellerLinksDialog
          key={sellerLinksRole.id}
          role={sellerLinksRole}
          onClose={() => setSellerLinksRole(null)}
        />
      )}
    </div>
  );
}
