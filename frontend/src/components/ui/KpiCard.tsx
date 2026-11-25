import React from "react";

export function KpiCard({
  label,
  value,
  subtitle,
  isLoading,
  tooltip,
}: {
  label: string;
  value: string;
  subtitle?: string;
  isLoading?: boolean;
  tooltip?: string;
}) {
  return (
    <article
      className="card dashboard-kpi-card"
      aria-busy={isLoading || undefined}
    >
      <p>
        {label}
        {tooltip && (
          <span
            className="kpi-help"
            tabIndex={0}
            role="note"
            aria-label={tooltip}
          >
            {" "}
            ⓘ
            <span className="kpi-help__text" role="tooltip">
              {tooltip}
            </span>
          </span>
        )}
      </p>
      <h3>{isLoading ? "..." : value}</h3>
      <small>{subtitle ?? "\u00A0"}</small>
    </article>
  );
}
