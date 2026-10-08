'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { KunjunganRiwayat } from './types';
import { fetchRiwayatKunjungan } from './mockData';
import { formatRupiah, getTanggalBoxParts, formatTanggalIndo } from './utils';
import {
  Search,
  Filter,
  ChevronRight,
  Calendar,
  AlertCircle,
  X,
  RotateCcw,
} from 'lucide-react';
import { OverlayPanel } from 'primereact/overlaypanel';
import { Dropdown } from 'primereact/dropdown';
import { Button } from 'primereact/button';
import { Skeleton } from 'primereact/skeleton';

interface RiwayatKunjunganPanelProps {
  noRm: string;
  namaPasien?: string;
  selectedKunjungan: KunjunganRiwayat | null;
  onSelectKunjungan: (kunjungan: KunjunganRiwayat) => void;
  onDataLoaded?: (data: KunjunganRiwayat[]) => void;
}

export const RiwayatKunjunganPanel: React.FC<RiwayatKunjunganPanelProps> = ({
  noRm,
  namaPasien = '',
  selectedKunjungan,
  onSelectKunjungan,
  onDataLoaded,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [riwayatList, setRiwayatList] = useState<KunjunganRiwayat[]>([]);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('semua');
  const [filterJenis, setFilterJenis] = useState<string>('semua');
  const [filterTanggalDari, setFilterTanggalDari] = useState<string>('');
  const [filterTanggalSampai, setFilterTanggalSampai] = useState<string>('');



  const filterPanelRef = useRef<OverlayPanel>(null);

  // Load data riwayat
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchRiwayatKunjungan(noRm, namaPasien);
        if (!isMounted) return;

        setRiwayatList(data);
        if (onDataLoaded) {
          onDataLoaded(data);
        }

        // Otomatis pilih item pertama bila belum ada yang terpilih
        if (data.length > 0 && !selectedKunjungan) {
          onSelectKunjungan(data[0]);
        }
      } catch (err: any) {
        if (!isMounted) return;
        setError('Gagal memuat riwayat kunjungan.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [noRm, namaPasien]);

  // Client-side filtering
  const filteredList = useMemo(() => {
    return riwayatList.filter((item) => {
      // 1. Filter keyword (tanggal, layanan, no. kunjungan)
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const noKjMatch = (item.noKunjungan || '').toLowerCase().includes(q);
        const layananMatch = (item.layanan?.nama || '').toLowerCase().includes(q);
        const rawDateMatch = String(item.tanggal || '').toLowerCase().includes(q);
        const formattedDateMatch = formatTanggalIndo(item.tanggal).toLowerCase().includes(q);
        const doctorMatch = (item.dokter || '').toLowerCase().includes(q);

        if (!noKjMatch && !layananMatch && !rawDateMatch && !formattedDateMatch && !doctorMatch) {
          return false;
        }
      }

      // 2. Filter Status
      if (filterStatus !== 'semua') {
        if ((item.status || '').toLowerCase() !== filterStatus.toLowerCase()) {
          return false;
        }
      }

      // 3. Filter Jenis
      if (filterJenis !== 'semua') {
        if (item.jenis !== filterJenis) {
          return false;
        }
      }

      // 4. Filter Rentang Tanggal
      if (filterTanggalDari) {
        if (item.tanggal < filterTanggalDari) return false;
      }
      if (filterTanggalSampai) {
        if (item.tanggal > filterTanggalSampai) return false;
      }

      return true;
    });
  }, [riwayatList, searchTerm, filterStatus, filterJenis, filterTanggalDari, filterTanggalSampai]);

  // Auto select item if current selection not in filtered list
  useEffect(() => {
    if (filteredList.length > 0) {
      const isSelectedInList = selectedKunjungan && filteredList.some((k) => k.id === selectedKunjungan.id);
      if (!isSelectedInList) {
        onSelectKunjungan(filteredList[0]);
      }
    }
  }, [filteredList]);

  const isFilterActive =
    filterStatus !== 'semua' ||
    filterJenis !== 'semua' ||
    Boolean(filterTanggalDari) ||
    Boolean(filterTanggalSampai);

  const resetAllFilters = () => {
    setSearchTerm('');
    setFilterStatus('semua');
    setFilterJenis('semua');
    setFilterTanggalDari('');
    setFilterTanggalSampai('');
  };

  return (
    <div className="h-full w-full flex flex-column min-h-0 bg-white overflow-hidden">
      <style>{`
        .custom-thin-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 transparent;
        }
        .custom-thin-scrollbar::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        .custom-thin-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-thin-scrollbar::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 9999px;
        }
        .custom-thin-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: #94a3b8;
        }
      `}</style>



      {/* 2. SEARCH & FILTER BAR */}
      <div className="mt-1 mb-3 flex align-items-center gap-3 flex-shrink-0" style={{ gap: '12px' }}>
        <div className="relative flex-1" style={{ height: '36px' }}>
          <div
            className="pointer-events-none flex align-items-center justify-content-center"
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#94a3b8',
              width: '16px',
              height: '16px',
              zIndex: 2,
            }}
          >
            <Search size={15} />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari tanggal, layanan, atau nomor kunjungan..."
            className="w-full text-xs border-1 border-round-lg focus:outline-none transition-all"
            style={{
              borderColor: '#e2e8f0',
              color: '#1e293b',
              backgroundColor: '#ffffff',
              height: '36px',
              paddingTop: '8px',
              paddingBottom: '8px',
              paddingLeft: '36px',
              paddingRight: searchTerm ? '32px' : '12px',
              boxSizing: 'border-box',
            }}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="flex align-items-center justify-content-center text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer"
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                padding: '2px',
                zIndex: 2,
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* TOMBOL FILTER */}
        <button
          type="button"
          onClick={(e) => filterPanelRef.current?.toggle(e)}
          className={`flex align-items-center gap-1.5 text-xs font-semibold px-3 border-round-lg border-1 transition-all cursor-pointer ${
            isFilterActive
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-50'
          }`}
          style={{
            borderColor: isFilterActive ? '#059669' : '#cbd5e1',
            color: isFilterActive ? '#ffffff' : '#475569',
            height: '36px',
            boxSizing: 'border-box',
          }}
          title="Filter Riwayat"
        >
          <Filter size={13} style={{ color: isFilterActive ? '#ffffff' : '#475569' }} />
          <span>Filter</span>
          {isFilterActive && (
            <span className="w-2 h-2 border-circle bg-amber-400 inline-block" />
          )}
        </button>

        {/* OVERLAY PANEL UNTUK FILTER STATUS & RENTANG TANGGAL */}
        <OverlayPanel ref={filterPanelRef} className="p-3 shadow-4 border-round-xl" style={{ width: '290px' }}>
          <div className="flex flex-column gap-3">
            <div className="flex align-items-center justify-content-between border-bottom-1 surface-border pb-2">
              <span className="text-xs font-bold text-900 uppercase tracking-wide">
                Filter Riwayat
              </span>
              <button
                type="button"
                onClick={resetAllFilters}
                className="text-[11px] text-emerald-700 hover:text-emerald-800 bg-transparent border-none cursor-pointer p-0 font-medium flex align-items-center gap-1"
              >
                <RotateCcw size={11} />
                Reset
              </button>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-600 block mb-1">
                Status Kunjungan
              </label>
              <Dropdown
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.value)}
                options={[
                  { label: 'Semua Status', value: 'semua' },
                  { label: 'Selesai', value: 'selesai' },
                ]}
                className="w-full text-xs p-inputtext-sm"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-600 block mb-1">
                Jenis Kunjungan
              </label>
              <Dropdown
                value={filterJenis}
                onChange={(e) => setFilterJenis(e.value)}
                options={[
                  { label: 'Semua Jenis', value: 'semua' },
                  { label: 'Treatment', value: 'treatment' },
                  { label: 'Konsultasi', value: 'konsultasi' },
                ]}
                className="w-full text-xs p-inputtext-sm"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-600 block mb-1">
                Rentang Tanggal (Dari)
              </label>
              <input
                type="date"
                value={filterTanggalDari}
                onChange={(e) => setFilterTanggalDari(e.target.value)}
                className="w-full text-xs p-2 border-1 surface-border border-round"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-600 block mb-1">
                Rentang Tanggal (Sampai)
              </label>
              <input
                type="date"
                value={filterTanggalSampai}
                onChange={(e) => setFilterTanggalSampai(e.target.value)}
                className="w-full text-xs p-2 border-1 surface-border border-round"
              />
            </div>

            <Button
              type="button"
              label="Tutup"
              size="small"
              className="w-full text-xs py-1.5 bg-emerald-600 border-emerald-600"
              onClick={() => filterPanelRef.current?.hide()}
            />
          </div>
        </OverlayPanel>
      </div>

      {/* 3. LIST CARD KUNJUNGAN / SKELETON / EMPTY STATE */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 mt-1 custom-thin-scrollbar">
        {/* LOADING SKELETON */}
        {loading && (
          <div className="flex flex-column gap-2 p-1">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="p-3 border-1 border-round-xl flex align-items-center gap-3 bg-white"
                style={{ borderColor: '#e2e8f0' }}
              >
                <Skeleton width="58px" height="58px" borderRadius="10px" />
                <div className="flex-1">
                  <Skeleton width="45%" height="13px" className="mb-2" />
                  <Skeleton width="70%" height="15px" className="mb-2" />
                  <Skeleton width="30%" height="13px" borderRadius="9999px" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ERROR STATE */}
        {!loading && error && (
          <div className="p-4 text-center surface-50 border-1 border-dashed surface-border border-round-xl my-4">
            <AlertCircle size={28} className="text-red-500 mb-2" />
            <p className="text-xs text-red-600 font-semibold m-0 mb-2">{error}</p>
            <Button
              type="button"
              label="Coba Lagi"
              size="small"
              outlined
              severity="secondary"
              className="text-xs"
              onClick={() => {
                setLoading(true);
                fetchRiwayatKunjungan(noRm, namaPasien).then((d) => {
                  setRiwayatList(d);
                  setLoading(false);
                });
              }}
            />
          </div>
        )}

        {/* EMPTY STATE */}
        {!loading && !error && filteredList.length === 0 && (
          <div className="h-full flex flex-column align-items-center justify-content-center p-4 text-center surface-50 border-1 border-dashed surface-border border-round-xl min-h-16rem">
            <div className="w-12 h-12 border-round-circle bg-emerald-50 text-emerald-600 flex align-items-center justify-content-center mb-2">
              <Calendar size={24} />
            </div>
            <h4 className="text-sm font-bold text-800 m-0 mb-1">
              Belum ada riwayat kunjungan
            </h4>
            <p className="text-xs text-500 m-0 max-w-xs leading-normal">
              {searchTerm || isFilterActive
                ? 'Tidak ada kunjungan yang cocok dengan pencarian atau filter yang dipilih.'
                : 'Pasien ini belum memiliki catatan riwayat transaksi atau kunjungan klinis.'}
            </p>
            {(searchTerm || isFilterActive) && (
              <Button
                type="button"
                label="Reset Filter"
                size="small"
                outlined
                severity="success"
                className="mt-3 text-xs"
                onClick={resetAllFilters}
              />
            )}
          </div>
        )}

        {/* LIST CARDS */}
        {!loading && !error && filteredList.length > 0 && (
          <div className="flex flex-column gap-2.5">
            {filteredList.map((item) => {
              const isSelected = selectedKunjungan?.id === item.id;
              const dateBox = getTanggalBoxParts(item.tanggal);

              return (
                <div
                  key={item.id}
                  onClick={() => onSelectKunjungan(item)}
                  className="p-2.5 sm:p-3 border-round-xl cursor-pointer transition-all flex align-items-center gap-3 relative select-none"
                  style={{
                    backgroundColor: isSelected ? '#f0fdf4' : '#ffffff',
                    border: isSelected ? '2px solid #10b981' : '1px solid #e2e8f0',
                    borderLeft: isSelected ? '5px solid #059669' : '1px solid #e2e8f0',
                  }}
                >
                  {/* KOTAK TANGGAL DI KIRI */}
                  <div
                    className="flex flex-column align-items-center justify-content-center border-round-xl flex-shrink-0"
                    style={{
                      width: '58px',
                      height: '58px',
                      backgroundColor: isSelected ? '#ffffff' : '#f8fafc',
                      border: isSelected ? '1px solid #bbf7d0' : '1px solid #f1f5f9',
                    }}
                  >
                    <span
                      className="font-bold leading-tight"
                      style={{ color: '#0f2942', fontSize: '1.15rem' }}
                    >
                      {dateBox.day}
                    </span>
                    <span
                      className="font-medium mt-0.5 leading-tight"
                      style={{ color: '#64748b', fontSize: '0.72rem' }}
                    >
                      {dateBox.monthYear}
                    </span>
                  </div>

                  {/* KONTEN TENGAH KARTU */}
                  <div className="flex-1 min-w-0 pr-1">
                    {/* BARIS 1: NO. KUNJUNGAN & KODE */}
                    <div className="flex align-items-center gap-2 leading-tight mb-1">
                      <span
                        className="font-bold mr-1"
                        style={{ color: '#0f2942', fontSize: '0.825rem' }}
                      >
                        No. Kunjungan
                      </span>
                      <span
                        className="font-medium"
                        style={{ color: '#64748b', fontSize: '0.825rem' }}
                      >
                        {item.noKunjungan}
                      </span>
                    </div>

                    {/* BARIS 2: NAMA LAYANAN */}
                    <div
                      className="font-medium truncate mb-1.5"
                      style={{ color: '#334155', fontSize: '0.825rem' }}
                    >
                      {item.layanan?.nama || 'Layanan Estetika'}
                    </div>

                    {/* BARIS 3: BADGE HARGA HIJAU PILL */}
                    <div>
                      <span
                        className="inline-block font-bold"
                        style={{
                          backgroundColor: '#dcfce7',
                          color: '#059669',
                          fontSize: '0.75rem',
                          padding: '2px 10px',
                          borderRadius: '9999px',
                        }}
                      >
                        {formatRupiah(
                          item.totalBayarKasir !== undefined && item.totalBayarKasir !== null
                            ? item.totalBayarKasir
                            : item.layanan?.harga
                        )}
                      </span>
                    </div>
                  </div>

                  {/* KANAN: BADGE "SELESAI" & IKON CHEVRON */}
                  <div className="flex align-items-center gap-2 flex-shrink-0">
                    <span
                      className="font-semibold inline-block"
                      style={{
                        backgroundColor: '#dcfce7',
                        color: '#15803d',
                        fontSize: '0.72rem',
                        padding: '3px 11px',
                        borderRadius: '9999px',
                        lineHeight: 1.2,
                      }}
                    >
                      {item.status || 'Selesai'}
                    </span>
                    <ChevronRight
                      size={18}
                      style={{ color: isSelected ? '#059669' : '#94a3b8' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
