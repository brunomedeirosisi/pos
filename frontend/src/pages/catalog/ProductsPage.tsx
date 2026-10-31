import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { useListQuery, useListState } from "../../hooks/useListQuery";
import { ListPagination } from "../../components/ui/Pagination";
import React, { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { productsService } from "../../services/catalog";
import type { Product } from "../../types/catalog";
import { useToast } from "../../components/ui/ToastProvider";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useHasPermission } from "../../store/auth";
import { Modal } from "../../components/ui/Modal";
import { CurrencyInput } from "../../components/ui/CurrencyInput";
import { formatCurrencyBrl } from "../../utils/number";
import {
  buildProductPayload,
  productFormDefaults,
  productFormSchema,
  type ProductFormValues,
} from "./products/product-form";

export function ProductsPage(): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useListState(
    searchParams.has("q")
      ? `catalog-products-q-${searchParams.get("q")}`
      : "catalog/ProductsPage-search",
    () => searchParams.get("q") ?? "",
  );
  const debouncedSearch = useDebouncedValue(search, 400);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const focusProductId = searchParams.get("focus");

  const canReadCatalog = useHasPermission("catalog:read");
  const canWriteCatalog = useHasPermission("catalog:write");

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: productFormDefaults,
  });

  const productsQuery = useListQuery<Product>({
    queryKey: ["products", debouncedSearch],
    resource: "products",
    filters: { search: debouncedSearch || undefined },
    enabled: canReadCatalog,
  });

  const createMutation = useMutation({
    mutationFn: (values: ProductFormValues) =>
      productsService.create(buildProductPayload(values)),
    onSuccess: () => {
      toast.show(t("common.saved"), "success");
      // Refetch é eventual; o QueryClient mantém o estado de erro das consultas.
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      closeForm();
    },
    onError: (error: Error) => toast.show(error.message, "error"),
  });

  const updateMutation = useMutation({
    mutationFn: (values: ProductFormValues) => {
      if (!editing) throw new Error("No product selected");
      return productsService.update(editing.id, buildProductPayload(values));
    },
    onSuccess: () => {
      toast.show(t("common.saved"), "success");
      // Refetch é eventual; o QueryClient mantém o estado de erro das consultas.
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      closeForm();
    },
    onError: (error: Error) => toast.show(error.message, "error"),
  });

  function openCreateForm() {
    if (!canWriteCatalog) {
      toast.show(t("common.noPermission"), "error");
      return;
    }
    setEditing(null);
    form.reset(productFormDefaults);
    setIsFormOpen(true);
  }

  function openEditForm(product: Product) {
    if (!canWriteCatalog) {
      toast.show(t("common.noPermission"), "error");
      return;
    }
    setEditing(product);
    form.reset({
      name: product.name,
      barcode: product.barcode ?? "",
      group_id: product.group_id ?? "",
      reference: product.reference ?? "",
      min_stock: product.min_stock,
      price_cash: product.price_cash,
      price_base: product.price_base,
    });
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditing(null);
    form.reset(productFormDefaults);
  }

  const onSubmit = form.handleSubmit((values) => {
    if (editing) {
      updateMutation.mutate(values);
    } else {
      createMutation.mutate(values);
    }
  });

  const products = productsQuery.data ?? [];

  React.useEffect(() => {
    const searchFromUrl = searchParams.get("q") ?? "";
    setSearch((current) =>
      current === searchFromUrl ? current : searchFromUrl,
    );
  }, [searchParams]);

  React.useEffect(() => {
    if (!focusProductId) {
      return;
    }

    const target = document.getElementById(`product-row-${focusProductId}`);
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusProductId, products]);

  const tableBody = useMemo(() => {
    if (!canReadCatalog) {
      return (
        <tr>
          <td colSpan={6}>
            <div className="empty-state">{t("common.noPermission")}</div>
          </td>
        </tr>
      );
    }

    if (productsQuery.isLoading) {
      return (
        <tr>
          <td colSpan={6}>
            <div className="empty-state">{t("common.loading")}</div>
          </td>
        </tr>
      );
    }

    if (productsQuery.isError) {
      return (
        <tr>
          <td colSpan={6}>
            <div className="empty-state">
              {(productsQuery.error as Error)?.message ?? t("common.error")}
            </div>
          </td>
        </tr>
      );
    }

    if (products.length === 0) {
      return (
        <tr>
          <td colSpan={6}>
            <div className="empty-state">{t("common.empty")}</div>
          </td>
        </tr>
      );
    }

    return products.map((product) => (
      <tr
        key={product.id}
        id={`product-row-${product.id}`}
        className={focusProductId === product.id ? "table-row-focus" : ""}
      >
        <td>{product.name}</td>
        <td>{product.legacy_code ?? "-"}</td>
        <td>{product.barcode ?? "-"}</td>
        <td>{product.group_name ?? "-"}</td>
        <td>
          {product.price_cash != null
            ? formatCurrencyBrl(product.price_cash)
            : "-"}
        </td>
        <td>
          <button
            type="button"
            className="button secondary"
            onClick={() => openEditForm(product)}
            disabled={!canWriteCatalog}
          >
            {t("common.edit")}
          </button>
        </td>
      </tr>
    ));
  }, [
    canReadCatalog,
    productsQuery.isLoading,
    productsQuery.isError,
    productsQuery.error,
    products,
    t,
    canWriteCatalog,
    focusProductId,
  ]);

  if (!canReadCatalog) {
    return (
      <div className="card">
        <h2>{t("products.heading")}</h2>
        <p>{t("common.noPermission")}</p>
      </div>
    );
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const modalOpen = isFormOpen && canWriteCatalog;
  const handleModalClose = () => {
    if (isSubmitting) return;
    closeForm();
  };

  return (
    <div className="card">
      <div className="toolbar">
        <input
          type="search"
          placeholder={`${t("common.search")}...`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {canWriteCatalog && (
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
              <th>{t("products.heading")}</th>
              <th>{t("products.code")}</th>
              <th>{t("products.barcode")}</th>
              <th>{t("products.group")}</th>
              <th>{t("products.priceCash")}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>{tableBody}</tbody>
        </table>
        <ListPagination query={productsQuery} />
      </div>

      <Modal
        open={modalOpen}
        onClose={handleModalClose}
        title={editing ? t("products.editTitle") : t("products.addTitle")}
        width="720px"
      >
        <p style={{ marginTop: 0, color: "#64748b" }}>
          {t("products.formHint")}
        </p>
        <form onSubmit={onSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="name">{t("products.heading")}*</label>
              <input id="name" {...form.register("name")} />
              {form.formState.errors.name && (
                <small style={{ color: "#dc2626" }}>
                  {form.formState.errors.name.message}
                </small>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="barcode">{t("products.barcode")}</label>
              <input id="barcode" {...form.register("barcode")} />
            </div>
            <div className="form-group">
              <label id="group_id-label" htmlFor="group_id">
                {t("products.group")}
              </label>
              <SearchableSelect
                id="group_id"
                resource="product-groups"
                value={form.watch("group_id") ?? ""}
                options={[]}
                onChange={(option) =>
                  form.setValue("group_id", option.value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
            </div>
            <div className="form-group">
              <label htmlFor="reference">{t("products.reference")}</label>
              <input id="reference" {...form.register("reference")} />
            </div>
            <div className="form-group">
              <label htmlFor="min_stock">{t("products.minStock")}</label>
              <input
                id="min_stock"
                type="number"
                step="0.001"
                {...form.register("min_stock")}
              />
              {form.formState.errors.min_stock && (
                <small style={{ color: "#dc2626" }}>
                  {form.formState.errors.min_stock.message as string}
                </small>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="price_cash">{t("products.priceCash")}</label>
              <Controller
                name="price_cash"
                control={form.control}
                render={({ field }) => (
                  <CurrencyInput
                    id="price_cash"
                    value={field.value}
                    onValueChange={field.onChange}
                  />
                )}
              />
              {form.formState.errors.price_cash && (
                <small style={{ color: "#dc2626" }}>
                  {form.formState.errors.price_cash.message as string}
                </small>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="price_base">{t("products.priceBase")}</label>
              <Controller
                name="price_base"
                control={form.control}
                render={({ field }) => (
                  <CurrencyInput
                    id="price_base"
                    value={field.value}
                    onValueChange={field.onChange}
                  />
                )}
              />
              {form.formState.errors.price_base && (
                <small style={{ color: "#dc2626" }}>
                  {form.formState.errors.price_base.message as string}
                </small>
              )}
            </div>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              onClick={handleModalClose}
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
    </div>
  );
}
