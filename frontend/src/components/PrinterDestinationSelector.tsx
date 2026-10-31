import { useTranslation } from "react-i18next";
import type { PrinterSelection } from "../hooks/usePrinterDestination";
import { SearchableSelect } from "./ui/SearchableSelect";
export function PrinterDestinationSelector({
  selection,
}: {
  selection: PrinterSelection;
}) {
  const { t } = useTranslation();
  if (!selection.visible) return null;
  if (selection.loading) return <p role="status">{t("common.loading")}</p>;
  if (selection.error)
    return (
      <p role="alert">
        {t("printers.loadError")}{" "}
        <button
          type="button"
          className="button secondary"
          onClick={selection.retry}
        >
          {t("printers.retry")}
        </button>
      </p>
    );
  return (
    <div className="form-grid vertical">
      <label id="print-destination-label" htmlFor="print-destination">
        {t("printers.destination")}
      </label>
      <SearchableSelect
        id="print-destination"
        resource="printers"
        labelField="display_name"
        filters={{ enabled: true }}
        value={selection.value === "choose" ? "" : selection.value}
        emptyLabel={t("printers.selectDestination")}
        options={selection.printers.map((p) => ({
          value: p.id,
          label: p.display_name,
        }))}
        onChange={(option) => selection.onChange(option.value || "choose")}
      />
      {!selection.valid && <p role="alert">{t("printers.chooseAnother")}</p>}
      {selection.valid && (
        <small className="text-muted">{t("printers.noAutomaticReroute")}</small>
      )}
    </div>
  );
}
