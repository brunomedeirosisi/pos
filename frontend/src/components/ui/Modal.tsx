import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

type ModalProps = {
  open: boolean;
  title?: string;
  onClose?: () => void;
  width?: number | string;
  children: React.ReactNode;
};

export function Modal({ open, title, onClose, width = '600px', children }: ModalProps): JSX.Element | null {
  const contentRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = React.useId();

  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
      previousFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (open && contentRef.current) {
      contentRef.current.focus();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && onClose) {
      onClose();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab' && contentRef.current) {
      const focusable = getFocusableElements(contentRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;

      if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
        return;
      }

      if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
        return;
      }
    }

    if (event.key === 'Escape' && onClose) {
      onClose();
    }
  };

  const resolvedWidth = typeof width === 'number' ? `${width}px` : width;

  return createPortal(
    <div className="modal-overlay" role="presentation" onClick={handleOverlayClick}>
      <div
        className="modal"
        style={{ maxWidth: '96%', width: resolvedWidth }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Dialog'}
        tabIndex={-1}
        ref={contentRef}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          {title && <h3 id={titleId} className="modal-title">{title}</h3>}
          {onClose && (
            <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
              <span aria-hidden="true">&times;</span>
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((node) => !node.hasAttribute('hidden') && node.offsetParent !== null);
}
