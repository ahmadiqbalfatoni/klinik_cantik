'use client';

import React from 'react';

export interface StatusLegendItem {
  label: string;
  color: string;
  onClick?: () => void;
  active?: boolean;
  count?: number | string;
  title?: string;
}

export interface KeteranganStatusProps {
  /**
   * Daftar item status. Jika tidak diisi, default ke:
   * [ { label: 'Aktif', color: '#22c55e' }, { label: 'Tidak Aktif', color: '#ef4444' } ]
   */
  items?: StatusLegendItem[];
  /**
   * Label judul keterangan status. Default: "KETERANGAN STATUS:"
   */
  title?: string;
  /**
   * Custom className tambahan (misal: "mb-3", "mt-2", dll)
   */
  className?: string;
  /**
   * Item atau elemen khusus sebelum daftar status (misal: tombol 'Semua (n)')
   */
  extraPrefix?: React.ReactNode;
  /**
   * Elemen custom tambahan di dalam legend box
   */
  children?: React.ReactNode;
}

const DEFAULT_STATUS_ITEMS: StatusLegendItem[] = [
  { label: 'Aktif', color: '#22c55e' },
  { label: 'Tidak Aktif', color: '#ef4444' },
];

/**
 * Komponen Standar Global Keterangan Status (Legend Box)
 * Mengikuti standar desain tampilan Halaman Laporan:
 * - Container: flex flex-wrap align-items-center gap-4 mb-3 p-3 surface-50 border-round-xl border-1 surface-border
 * - Judul: text-xs font-bold text-500 uppercase tracking-wider mr-2 dengan ikon pi-info-circle
 * - Indikator Kotak: block border-round-sm 12px x 12px
 * - Jarak Kotak ke Teks: gap-2
 * - Teks Status: text-xs font-semibold text-700
 */
export const KeteranganStatus: React.FC<KeteranganStatusProps> = ({
  items = DEFAULT_STATUS_ITEMS,
  title = 'KETERANGAN STATUS:',
  className = '',
  extraPrefix,
  children,
}) => {
  if ((!items || items.length === 0) && !extraPrefix && !children) {
    return null;
  }

  const hasCustomMargin = /\bmb-\d+\b/.test(className);
  const marginClass = hasCustomMargin ? '' : 'mb-2';

  return (
    <div
      className={`flex flex-wrap align-items-center gap-4 p-3 surface-50 border-round-xl border-1 surface-border ${marginClass} ${className}`.trim()}
    >
      <span className="flex align-items-center text-xs font-bold text-500 uppercase tracking-wider mr-2">
        <i className="pi pi-info-circle mr-2" /> {title}
      </span>

      {extraPrefix}

      {items &&
        items.map((it, idx) => {
          const isClickable = Boolean(it.onClick);
          return (
            <div
              key={idx}
              className={`flex align-items-center gap-2 ${
                isClickable ? 'cursor-pointer transition-colors' : ''
              } ${
                it.active !== undefined
                  ? it.active
                    ? 'font-bold text-900'
                    : 'hover:text-900'
                  : ''
              }`}
              onClick={it.onClick}
              title={it.title}
            >
              <span
                className="block border-round-sm"
                style={{
                  width: '12px',
                  height: '12px',
                  backgroundColor: it.color,
                  flexShrink: 0,
                }}
              />
              <span
                className={`text-xs ${
                  it.active ? 'font-bold text-900' : 'font-semibold text-700'
                }`}
              >
                {it.label}
                {it.count !== undefined ? ` (${it.count})` : ''}
              </span>
            </div>
          );
        })}

      {children}
    </div>
  );
};

export default KeteranganStatus;
