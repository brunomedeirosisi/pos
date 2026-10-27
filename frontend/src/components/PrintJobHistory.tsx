import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { salesService } from '../services/sales';

export function PrintJobHistory({ saleId }: { saleId: string }) {
  const { t } = useTranslation();
  const jobs = useQuery({
    queryKey: ['sale-print-jobs', saleId], queryFn: () => salesService.printJobs(saleId),
    refetchInterval: query => query.state.data?.some(job => ['queued','claimed','spooling'].includes(job.status)) ? 3000 : false, retry: false,
  });
  if (!jobs.data?.length) return null;
  return <section aria-label={t('sales.printJobs')} className="card" aria-live="polite">
    <h2>{t('sales.printJobs')}</h2>
    <ul>{jobs.data.slice(0, 5).map(job => <li key={job.job_id}>
      {job.receipt_code} — {job.printer_name} — {t('sales.printStatus.' + job.status)} ({job.copies})
      {job.status === 'uncertain' && <p>{t('sales.printUncertainHelp')}</p>}
    </li>)}</ul>
  </section>;
}
