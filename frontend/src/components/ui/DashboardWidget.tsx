import React from "react";
import { useTranslation } from "react-i18next";

type QueryState = {
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error?: unknown;
  refetch?: () => unknown;
};
export function WidgetFrame({
  title,
  state,
  children,
  actions,
  loadingText,
  errorText,
}: {
  title: string;
  state: QueryState;
  children: React.ReactNode;
  actions?: React.ReactNode;
  loadingText: string;
  errorText: string;
}) {
  const { t } = useTranslation();
  return (
    <section className="card dashboard-widget">
      <div className="dashboard-widget__head">
        <h3>{title}</h3>
        <div className="dashboard-widget__actions">
          {actions}
          {state.isFetching && <span className="badge">...</span>}
        </div>
      </div>
      {state.isLoading && (
        <div className="dashboard-widget__state" role="status">
          {loadingText}
        </div>
      )}
      {!state.isLoading && state.isError && (
        <div
          className="dashboard-widget__state dashboard-widget__state--error"
          role="alert"
        >
          {(state.error as Error)?.message ?? errorText}
          <button
            type="button"
            className="button secondary"
            disabled={state.isFetching}
            onClick={() => {
              void state.refetch?.();
            }}
          >
            {t("common.retry")}
          </button>
        </div>
      )}
      {!state.isLoading && !state.isError && children}
    </section>
  );
}
