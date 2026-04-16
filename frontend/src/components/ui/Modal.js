import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
export function Modal({ open, title, onClose, width = '600px', children }) {
    const contentRef = useRef(null);
    useEffect(() => {
        if (!open)
            return;
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalOverflow;
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
    const handleOverlayClick = (event) => {
        if (event.target === event.currentTarget && onClose) {
            onClose();
        }
    };
    const handleKeyDown = (event) => {
        if (event.key === 'Escape' && onClose) {
            onClose();
        }
    };
    const resolvedWidth = typeof width === 'number' ? `${width}px` : width;
    return createPortal(_jsx("div", { className: "modal-overlay", role: "presentation", onClick: handleOverlayClick, children: _jsxs("div", { className: "modal", style: { maxWidth: '96%', width: resolvedWidth }, role: "dialog", "aria-modal": "true", "aria-label": title, tabIndex: -1, ref: contentRef, onKeyDown: handleKeyDown, children: [_jsxs("div", { className: "modal-header", children: [title && _jsx("h3", { className: "modal-title", children: title }), onClose && (_jsx("button", { type: "button", className: "modal-close", "aria-label": "Close", onClick: onClose, children: _jsx("span", { "aria-hidden": "true", children: "\u00D7" }) }))] }), _jsx("div", { className: "modal-body", children: children })] }) }), document.body);
}
