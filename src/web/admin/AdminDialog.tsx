import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react-native';

export function AdminDialog({ title, onClose, children, tools, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; tools?: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
      if (event.key !== 'Tab') return;
      const controls = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]');
      if (!controls?.length) { event.preventDefault(); return; }
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !ref.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return <div className="overlay" onClick={onClose}><div ref={ref} tabIndex={-1} className={`drawer ${wide ? 'drawer-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title" onClick={event => event.stopPropagation()}><div className="section-head drawer-head"><strong id="dialog-title">{title}</strong><div className="tools">{tools}<button className="icon-button" title="关闭详情" aria-label="关闭详情" onClick={onClose}><X size={18} color="currentColor" /></button></div></div>{children}</div></div>;
}
