import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  isPending?: boolean;
  confirmDisabled?: boolean;
  tone?: 'danger' | 'primary';
  children?: React.ReactNode;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
  isPending = false,
  confirmDisabled = false,
  tone = 'danger',
  children,
}: ConfirmDialogProps): JSX.Element {
  const { t } = useTranslation();
  const confirmClassName = tone === 'danger' ? 'button danger' : 'button primary';

  return (
    <Modal
      open={open}
      onClose={() => {
        if (isPending) return;
        onClose();
      }}
      title={title}
      width="460px"
    >
      <div className="form-grid vertical">
        {description && <p className="text-muted">{description}</p>}
        {children}
      </div>
      <div className="form-actions">
        <button type="button" className="button secondary" onClick={onClose} disabled={isPending}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className={confirmClassName}
          onClick={onConfirm}
          disabled={isPending || confirmDisabled}
        >
          {isPending ? t('common.loading') : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
