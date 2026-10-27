import { useTranslation } from 'react-i18next';
import type { PrinterSelection } from '../hooks/usePrinterDestination';
export function PrinterDestinationSelector({ selection }: { selection: PrinterSelection }) {
  const { t } = useTranslation();
  if (!selection.visible) return null;
  if (selection.loading) return <p role="status">{t('common.loading')}</p>;
  if (selection.error) return <p role="alert">{t('printers.loadError')} <button type="button" className="button secondary" onClick={selection.retry}>{t('printers.retry')}</button></p>;
  return <div className="form-grid vertical">
    <label>{t('printers.destination')}
      <select value={selection.value} onChange={event => selection.onChange(event.target.value)}>
        {!selection.valid && <option value={selection.value} disabled>{t('printers.unavailable')}</option>}
        {selection.printers.filter(p=>p.enabled).map(p=><option key={p.id} value={p.id}>{p.display_name} — {t(p.online ? 'printers.online' : 'printers.offline')}</option>)}
      </select>
    </label>
    {!selection.valid && <p role="alert">{t('printers.chooseAnother')}</p>}
    {selection.valid && <small className="text-muted">{t('printers.noAutomaticReroute')}</small>}
  </div>;
}
