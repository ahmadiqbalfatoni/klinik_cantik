'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Toast } from 'primereact/toast';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Dropdown } from 'primereact/dropdown';
import { Tag } from 'primereact/tag';
import { Dialog } from 'primereact/dialog';
import { Divider } from 'primereact/divider';
import { IconField } from 'primereact/iconfield';
import { InputIcon } from 'primereact/inputicon';
import { ProgressSpinner } from 'primereact/progressspinner';
import postData from '@/lib/axios/postData';
import { showError, showSuccess } from '@/lib/tools/generalTools';
import { useSession } from 'next-auth/react';
import { format } from 'date-fns';

interface ShiftRecord {
  id: number;
  kode_shift: string;
  user_code: string;
  nama_kasir: string;
  kode_cabang: string;
  nama_cabang?: string;
  waktu_buka: string;
  waktu_tutup: string | null;
  modal_awal: number | string;
  total_penjualan_tunai: number | string;
  total_penjualan_nontunai: number | string;
  total_kas_masuk_lain: number | string;
  total_kas_keluar: number | string;
  kas_diharapkan: number | string;
  kas_aktual: number | string | null;
  selisih: number | string | null;
  status: 'open' | 'closed';
  catatan_buka?: string | null;
  catatan_tutup?: string | null;
  created_by?: string;
  created_at?: string;
}

interface MutasiRecord {
  id: number;
  kode_mutasi: string;
  kode_shift: string;
  user_code: string;
  nama_kasir: string;
  kode_cabang: string;
  tipe: 'modal_awal' | 'penjualan_tunai' | 'kas_masuk' | 'kas_keluar' | 'tutup_shift';
  kategori: string | null;
  nominal: number | string;
  arus: 'masuk' | 'keluar';
  saldo_setelah: number | string;
  referensi: string | null;
  keterangan: string | null;
  created_at: string;
}

export default function TrackingKasKasirPage() {
  const { data: session } = useSession();
  const toast = useRef<Toast>(null);

  // Filter States
  const [keyword, setKeyword] = useState<string>('');
  const [selectedKasir, setSelectedKasir] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [tanggalMulai, setTanggalMulai] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [tanggalSelesai, setTanggalSelesai] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  // Table Data & Pagination
  const [data, setData] = useState<ShiftRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [rows, setRows] = useState<number>(10);

  // Summary Metrics
  const [summary, setSummary] = useState<any>({
    total_shift: 0,
    total_shift_open: 0,
    total_shift_closed: 0,
    total_modal_awal: 0,
    total_penjualan_tunai: 0,
    total_penjualan_nontunai: 0,
    total_kas_masuk_lain: 0,
    total_kas_masuk: 0,
    total_kas_keluar: 0,
    total_kas_diharapkan: 0,
    total_kas_aktual: 0,
    total_selisih: 0,
  });

  // Dropdown Options
  const [kasirOptions, setKasirOptions] = useState<any[]>([]);

  const statusOptions = [
    { label: 'Semua Status', value: '' },
    { label: 'Sedang Buka (Open)', value: 'open' },
    { label: 'Selesai (Closed)', value: 'closed' },
  ];

  // Custom Dropdown Templates
  const kasirValueTemplate = (option: any, props: any) => {
    if (option && option.value) {
      return (
        <span className="flex align-items-center gap-1.5 text-xs text-900 font-medium">
          <i className="pi pi-user text-teal-600 text-xs" />
          <span className="white-space-nowrap overflow-hidden text-overflow-ellipsis">
            {option.nama || option.label}
          </span>
        </span>
      );
    }
    return <span className="text-xs text-700">{option?.label || props.placeholder || 'Semua Kasir'}</span>;
  };

  const kasirItemTemplate = (option: any) => {
    if (!option.value) {
      return <div className="text-xs font-medium py-1">{option.label}</div>;
    }
    return (
      <div className="flex align-items-center justify-content-between gap-3 text-xs py-1 w-full">
        <div className="flex align-items-center gap-2">
          <i className="pi pi-user text-teal-600 text-xs" />
          <span className="font-semibold text-900">{option.nama || option.label}</span>
        </div>
        {option.kode && (
          <span className="text-500 font-mono text-[10px] bg-gray-100 px-1.5 py-0.5 border-round">
            {option.kode}
          </span>
        )}
      </div>
    );
  };

  const statusValueTemplate = (option: any, props: any) => {
    if (option && option.value) {
      const isOpen = option.value === 'open';
      return (
        <span className="flex align-items-center gap-2 text-xs font-medium">
          <span
            className="border-circle flex-shrink-0"
            style={{ width: '8px', height: '8px', backgroundColor: isOpen ? '#16a34a' : '#64748b' }}
          />
          <span className={isOpen ? 'text-green-700 font-semibold' : 'text-700'}>{option.label}</span>
        </span>
      );
    }
    return <span className="text-xs text-700">{option?.label || props.placeholder || 'Semua Status'}</span>;
  };

  const statusItemTemplate = (option: any) => {
    if (!option.value) {
      return <div className="text-xs font-medium py-1">{option.label}</div>;
    }
    const isOpen = option.value === 'open';
    return (
      <div className="flex align-items-center gap-2 text-xs py-1">
        <span
          className="border-circle flex-shrink-0"
          style={{ width: '8px', height: '8px', backgroundColor: isOpen ? '#16a34a' : '#64748b' }}
        />
        <span className={isOpen ? 'text-green-700 font-semibold' : 'text-700'}>{option.label}</span>
      </div>
    );
  };

  // Modal Detail Mutasi
  const [detailVisible, setDetailVisible] = useState<boolean>(false);
  const [selectedShift, setSelectedShift] = useState<ShiftRecord | null>(null);
  const [mutasiList, setMutasiList] = useState<MutasiRecord[]>([]);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  // Format IDR Helper
  const formatRupiah = (val: number | string | null | undefined) => {
    const num = parseFloat(String(val || 0));
    return `Rp ${num.toLocaleString('id-ID')}`;
  };

  // Format Tanggal Helper
  const formatDatetime = (dt: string | null | undefined) => {
    if (!dt) return '-';
    try {
      const d = new Date(dt);
      return format(d, 'dd/MM/yyyy HH:mm:ss');
    } catch {
      return dt;
    }
  };

  // Load Kasir Dropdown
  const loadKasirOptions = async () => {
    try {
      const res = await postData('/master/kasir-tracking-kas/kasir-options', {});
      const list = (res.data?.data || []).map((k: any) => ({
        label: `${k.nama} (${k.kode_karyawan || k.kode_user || '-'})`,
        value: k.kode_user || k.no_sip,
        nama: k.nama,
        kode: k.kode_karyawan || k.kode_user || '-',
      }));
      setKasirOptions([{ label: 'Semua Kasir', value: '', nama: 'Semua Kasir', kode: '' }, ...list]);
    } catch (error) {
      console.error('Gagal memuat opsi kasir:', error);
    }
  };

  // Load Data Shifts & Summary
  const loadData = async (currentPage = page, currentRows = rows) => {
    setLoading(true);
    try {
      const sanitizeVal = (val: any) => {
        if (!val) return undefined;
        if (typeof val === 'string') {
          const t = val.trim();
          return t.length > 0 ? t : undefined;
        }
        if (typeof val === 'object' && val !== null) {
          if (val.value !== undefined && val.value !== null) {
            const v = String(val.value).trim();
            return v.length > 0 ? v : undefined;
          }
          return undefined;
        }
        return String(val);
      };

      const payload: any = {
        page: currentPage,
        perPage: currentRows,
        keyword: sanitizeVal(keyword),
        user_code: sanitizeVal(selectedKasir),
        status: sanitizeVal(selectedStatus),
        tanggal_mulai: sanitizeVal(tanggalMulai),
        tanggal_selesai: sanitizeVal(tanggalSelesai),
      };

      const res = await postData('/master/kasir-tracking-kas/data', payload);
      const resData = res.data?.data;
      if (resData) {
        setData(resData.records || []);
        setTotalRecords(resData.totalRecords || 0);
        if (resData.summary) {
          setSummary(resData.summary);
        }
      }
    } catch (error: any) {
      showError(toast, error?.response?.data?.message || 'Gagal memuat tracking kas kasir');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKasirOptions();
  }, []);

  useEffect(() => {
    loadData(1, rows);
  }, [selectedKasir, selectedStatus, tanggalMulai, tanggalSelesai]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadData(1, rows);
  };

  const handleResetFilter = () => {
    setKeyword('');
    setSelectedKasir('');
    setSelectedStatus('');
    setTanggalMulai(format(new Date(), 'yyyy-MM-dd'));
    setTanggalSelesai(format(new Date(), 'yyyy-MM-dd'));
  };

  // Open Detail Mutasi
  const handleOpenDetail = async (shift: ShiftRecord) => {
    setSelectedShift(shift);
    setDetailVisible(true);
    setLoadingDetail(true);
    try {
      const res = await postData('/master/kasir-tracking-kas/detail', { kode_shift: shift.kode_shift });
      if (res.data?.data) {
        setSelectedShift(res.data.data.shift);
        setMutasiList(res.data.data.mutasi || []);
      }
    } catch (error: any) {
      showError(toast, error?.response?.data?.message || 'Gagal memuat detail mutasi kas');
    } finally {
      setLoadingDetail(false);
    }
  };

  // Cetak Rekap Mutasi Kas Sesi Ini
  const handlePrintRekap = () => {
    if (!selectedShift) return;
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) {
      alert('Popup diblokir browser. Izinkan popup untuk mencetak laporan.');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Rekap Sesi Kasir - ${selectedShift.kode_shift}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 25px; color: #1e293b; }
          .header { text-align: center; border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 20px; }
          .title { font-size: 20px; font-weight: bold; color: #0f766e; margin: 0; }
          .subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; font-size: 13px; }
          .box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
          .box-title { font-weight: bold; color: #334155; margin-bottom: 6px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
          th { background: #0f766e; color: white; text-align: left; padding: 8px 10px; }
          td { border-bottom: 1px solid #e2e8f0; padding: 8px 10px; }
          .badge-in { color: #047857; font-weight: bold; }
          .badge-out { color: #b91c1c; font-weight: bold; }
          .summary-card { margin-top: 20px; padding: 15px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; font-size: 13px; }
          .text-right { text-align: right; }
          .footer { margin-top: 40px; display: flex; justify-content: space-between; font-size: 12px; text-align: center; }
          @media print {
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">KLINIK KECANTIKAN</div>
          <div class="subtitle">LAPORAN REKONSILIASI KAS & SESI SHIFT KASIR</div>
        </div>

        <div class="grid">
          <div class="box">
            <div class="box-title">Informasi Sesi Shift</div>
            <div><strong>Kode Shift:</strong> ${selectedShift.kode_shift}</div>
            <div><strong>Kasir:</strong> ${selectedShift.nama_kasir} (${selectedShift.user_code})</div>
            <div><strong>Cabang:</strong> ${selectedShift.nama_cabang || selectedShift.kode_cabang || 'Cabang Utama'}</div>
            <div><strong>Status:</strong> ${selectedShift.status === 'open' ? 'SEDANG BUKA (AKTIF)' : 'SUDAH DITUTUP'}</div>
          </div>
          <div class="box">
            <div class="box-title">Waktu & Catatan</div>
            <div><strong>Waktu Buka:</strong> ${formatDatetime(selectedShift.waktu_buka)}</div>
            <div><strong>Waktu Tutup:</strong> ${formatDatetime(selectedShift.waktu_tutup)}</div>
            <div><strong>Catatan Buka:</strong> ${selectedShift.catatan_buka || '-'}</div>
            <div><strong>Catatan Tutup:</strong> ${selectedShift.catatan_tutup || '-'}</div>
          </div>
        </div>

        <div class="summary-card">
          <div style="font-weight: bold; margin-bottom: 8px; color: #166534;">RINGKASAN REKONSILIASI KAS:</div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
            <div>Modal Awal: <strong>Rp ${parseFloat(String(selectedShift.modal_awal || 0)).toLocaleString('id-ID')}</strong></div>
            <div>Penjualan Tunai: <strong>Rp ${parseFloat(String(selectedShift.total_penjualan_tunai || 0)).toLocaleString('id-ID')}</strong></div>
            <div>Kas Keluar: <strong>Rp ${parseFloat(String(selectedShift.total_kas_keluar || 0)).toLocaleString('id-ID')}</strong></div>
            <div>Kas Masuk Lain: <strong>Rp ${parseFloat(String(selectedShift.total_kas_masuk_lain || 0)).toLocaleString('id-ID')}</strong></div>
          </div>
          <hr style="border: 0; border-top: 1px dashed #86efac; margin: 10px 0;" />
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
            <div>Ekspektasi Kas Laci: <strong>Rp ${parseFloat(String(selectedShift.kas_diharapkan || 0)).toLocaleString('id-ID')}</strong></div>
            <div>Kas Aktual Fisik: <strong>Rp ${selectedShift.kas_aktual !== null ? parseFloat(String(selectedShift.kas_aktual)).toLocaleString('id-ID') : '-'}</strong></div>
            <div>Selisih: <strong>${selectedShift.selisih !== null ? 'Rp ' + parseFloat(String(selectedShift.selisih)).toLocaleString('id-ID') : '-'}</strong></div>
          </div>
        </div>

        <h4 style="margin: 20px 0 8px 0; color: #334155;">Kronologi Keluar-Masuk Kas (Mutasi Kas):</h4>
        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>Waktu</th>
              <th>Tipe & Kategori</th>
              <th>Referensi</th>
              <th>Keterangan</th>
              <th class="text-right">Nominal</th>
              <th class="text-right">Saldo Kas</th>
            </tr>
          </thead>
          <tbody>
            ${mutasiList
              .map(
                (m, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td>${formatDatetime(m.created_at)}</td>
                <td><strong>${(m.kategori || m.tipe).toUpperCase()}</strong></td>
                <td>${m.referensi || '-'}</td>
                <td>${m.keterangan || '-'}</td>
                <td class="text-right ${m.arus === 'masuk' ? 'badge-in' : 'badge-out'}">
                  ${m.arus === 'masuk' ? '+' : '-'} Rp ${parseFloat(String(m.nominal || 0)).toLocaleString('id-ID')}
                </td>
                <td class="text-right"><strong>Rp ${parseFloat(String(m.saldo_setelah || 0)).toLocaleString('id-ID')}</strong></td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>

        <div class="footer">
          <div>
            Dicetak oleh: ${session?.user?.name || 'Manager'}<br />
            Pada: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}
          </div>
          <div>
            Tanda Tangan Kasir<br /><br /><br />
            ( ${selectedShift.nama_kasir} )
          </div>
          <div>
            Tanda Tangan Manager<br /><br /><br />
            ( ___________________ )
          </div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="w-full">
      <Toast ref={toast} />

      {/* ── Page Header ── */}
      <div className="card border-round-xl p-4 shadow-1 surface-card mb-4">
        <div className="flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
          <div>
            <h3 className="text-2xl font-bold text-900 flex align-items-center gap-2 mb-1">
              <i className="pi pi-wallet text-teal-600 text-2xl" />
              Tracking Kas Keluar &amp; Masuk Setiap Kasir
            </h3>
            <p className="text-500 text-sm m-0">
              Monitoring riwayat sesi shift kasir, mutasi kas masuk, pengeluaran uang kasir, dan rekonsiliasi saldo kas.
            </p>
          </div>
          <div className="flex align-items-center gap-2">
            <Button
              size="small"
              label="Refresh Data"
              icon="pi pi-refresh"
              outlined
              severity="success"
              loading={loading}
              onClick={() => loadData(page, rows)}
              className="border-round-md font-semibold text-xs px-3"
            />
          </div>
        </div>

        {/* ── KPI Summary Cards ── */}
        <div className="grid mt-2 mb-1">
          {/* Card 1: Modal Awal */}
          <div className="col-12 sm:col-6 md:col-4 lg:col-2">
            <div className="p-3 border-round-xl surface-50 border-1 surface-border flex flex-column justify-content-between h-full">
              <div className="flex align-items-center justify-content-between mb-2">
                <span className="text-500 font-medium text-xs">Total Modal Awal</span>
                <i className="pi pi-briefcase text-blue-500 text-lg" />
              </div>
              <div className="text-900 font-bold text-base">{formatRupiah(summary.total_modal_awal)}</div>
              <span className="text-xs text-500 mt-1">{summary.total_shift} Sesi Shift</span>
            </div>
          </div>

          {/* Card 2: Kas Masuk Tunai */}
          <div className="col-12 sm:col-6 md:col-4 lg:col-2">
            <div className="p-3 border-round-xl bg-green-50 border-1 border-green-200 flex flex-column justify-content-between h-full">
              <div className="flex align-items-center justify-content-between mb-2">
                <span className="text-green-700 font-medium text-xs">Kas Masuk (Tunai)</span>
                <i className="pi pi-arrow-down-left text-green-600 text-lg" />
              </div>
              <div className="text-green-900 font-bold text-base">{formatRupiah(summary.total_penjualan_tunai)}</div>
              <span className="text-xs text-green-600 mt-1">+ Lain: {formatRupiah(summary.total_kas_masuk_lain)}</span>
            </div>
          </div>

          {/* Card 3: Kas Keluar */}
          <div className="col-12 sm:col-6 md:col-4 lg:col-2">
            <div className="p-3 border-round-xl bg-red-50 border-1 border-red-200 flex flex-column justify-content-between h-full">
              <div className="flex align-items-center justify-content-between mb-2">
                <span className="text-red-700 font-medium text-xs">Total Kas Keluar</span>
                <i className="pi pi-arrow-up-right text-red-600 text-lg" />
              </div>
              <div className="text-red-900 font-bold text-base">{formatRupiah(summary.total_kas_keluar)}</div>
              <span className="text-xs text-red-500 mt-1">Pengeluaran &amp; Petugas</span>
            </div>
          </div>

          {/* Card 4: Saldo Kas Diharapkan (Laci) */}
          <div className="col-12 sm:col-6 md:col-4 lg:col-2">
            <div className="p-3 border-round-xl bg-teal-50 border-1 border-teal-200 flex flex-column justify-content-between h-full">
              <div className="flex align-items-center justify-content-between mb-2">
                <span className="text-teal-700 font-medium text-xs">Ekspektasi Kas Laci</span>
                <i className="pi pi-wallet text-teal-600 text-lg" />
              </div>
              <div className="text-teal-900 font-bold text-base">{formatRupiah(summary.total_kas_diharapkan)}</div>
              <span className="text-xs text-teal-600 mt-1">Saldo Kas Seharusnya</span>
            </div>
          </div>

          {/* Card 5: Non-Tunai (QRIS/EDC) */}
          <div className="col-12 sm:col-6 md:col-4 lg:col-2">
            <div className="p-3 border-round-xl surface-50 border-1 surface-border flex flex-column justify-content-between h-full">
              <div className="flex align-items-center justify-content-between mb-2">
                <span className="text-500 font-medium text-xs">Penjualan Non-Tunai</span>
                <i className="pi pi-credit-card text-purple-500 text-lg" />
              </div>
              <div className="text-900 font-bold text-base">{formatRupiah(summary.total_penjualan_nontunai)}</div>
              <span className="text-xs text-purple-600 mt-1">QRIS / EDC / Transfer</span>
            </div>
          </div>

          {/* Card 6: Rekonsiliasi Selisih */}
          <div className="col-12 sm:col-6 md:col-4 lg:col-2">
            <div
              className={`p-3 border-round-xl border-1 flex flex-column justify-content-between h-full ${
                summary.total_selisih === 0
                  ? 'bg-slate-50 border-slate-200'
                  : summary.total_selisih > 0
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-orange-50 border-orange-200'
              }`}
            >
              <div className="flex align-items-center justify-content-between mb-2">
                <span className="font-medium text-xs text-700">Total Selisih Kas</span>
                <i className="pi pi-sliders-h text-700 text-lg" />
              </div>
              <div
                className={`font-bold text-base ${
                  summary.total_selisih === 0
                    ? 'text-700'
                    : summary.total_selisih > 0
                    ? 'text-blue-700'
                    : 'text-orange-700'
                }`}
              >
                {summary.total_selisih === 0
                  ? 'Rp 0 (Pas)'
                  : summary.total_selisih > 0
                  ? `+${formatRupiah(summary.total_selisih)}`
                  : formatRupiah(summary.total_selisih)}
              </div>
              <span className="text-xs text-500 mt-1">
                {summary.total_shift_open} Buka / {summary.total_shift_closed} Tutup
              </span>
            </div>
          </div>
        </div>

        <Divider className="my-3" />

        {/* ── Filter Bar ── */}
        <form onSubmit={handleSearch} className="flex flex-wrap align-items-center justify-content-between gap-2">
          <div className="flex flex-wrap align-items-center gap-2">
            {/* Filter Kasir */}
            <Dropdown
              value={selectedKasir}
              options={kasirOptions}
              optionLabel="label"
              optionValue="value"
              valueTemplate={kasirValueTemplate}
              itemTemplate={kasirItemTemplate}
              onChange={(e) => {
                const val = typeof e.value === 'object' && e.value !== null ? (e.value.value ?? '') : (e.value ?? '');
                setSelectedKasir(val);
              }}
              placeholder="Semua Kasir"
              className="p-inputtext-sm text-xs w-14rem border-round-md"
              showClear={Boolean(selectedKasir)}
            />

            {/* Filter Status Shift */}
            <Dropdown
              value={selectedStatus}
              options={statusOptions}
              optionLabel="label"
              optionValue="value"
              valueTemplate={statusValueTemplate}
              itemTemplate={statusItemTemplate}
              onChange={(e) => {
                const val = typeof e.value === 'object' && e.value !== null ? (e.value.value ?? '') : (e.value ?? '');
                setSelectedStatus(val);
              }}
              placeholder="Semua Status"
              className="p-inputtext-sm text-xs w-13rem border-round-md"
              showClear={Boolean(selectedStatus)}
            />

            {/* Rentang Tanggal */}
            <div className="flex align-items-center gap-1 text-xs">
              <span className="text-500 font-medium">Dari:</span>
              <input
                type="date"
                value={tanggalMulai}
                onChange={(e) => setTanggalMulai(e.target.value)}
                className="p-inputtext p-component text-xs p-2 border-round-md"
              />
              <span className="text-500 font-medium">Sampai:</span>
              <input
                type="date"
                value={tanggalSelesai}
                onChange={(e) => setTanggalSelesai(e.target.value)}
                className="p-inputtext p-component text-xs p-2 border-round-md"
              />
            </div>
          </div>

          <div className="flex align-items-center gap-2 ml-auto">
            <IconField iconPosition="left">
              <InputIcon className="pi pi-search" />
              <InputText
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Cari Shift / Kasir..."
                className="text-xs w-14rem"
              />
            </IconField>
            <Button
              type="submit"
              icon="pi pi-filter"
              size="small"
              severity="success"
              className="border-round-md text-xs px-3"
              tooltip="Terapkan Filter"
            />
            <Button
              type="button"
              icon="pi pi-filter-slash"
              outlined
              severity="danger"
              size="small"
              className="border-round-md text-xs"
              tooltip="Reset Filter"
              onClick={handleResetFilter}
            />
          </div>
        </form>
      </div>

      {/* ── Table Sesi Shift Kasir ── */}
      <div className="card border-round-xl p-4 shadow-1 surface-card">
        <DataTable
          value={data}
          loading={loading}
          dataKey="id"
          paginator
          rows={rows}
          totalRecords={totalRecords}
          lazy
          first={(page - 1) * rows}
          onPage={(e) => {
            setPage((e.page || 0) + 1);
            setRows(e.rows || 10);
            loadData((e.page || 0) + 1, e.rows || 10);
          }}
          rowsPerPageOptions={[10, 25, 50]}
          emptyMessage="Belum ada data sesi shift kasir pada rentang filter ini"
          rowHover
          className="text-sm"
          paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink CurrentPageReport RowsPerPageDropdown"
          currentPageReportTemplate="Menampilkan {first} - {last} dari {totalRecords} sesi shift"
        >
          <Column
            field="kode_shift"
            header="Kode Shift"
            sortable
            style={{ minWidth: '9rem' }}
            body={(row: ShiftRecord) => (
              <span className="font-bold text-teal-700 font-mono text-xs cursor-pointer hover:underline" onClick={() => handleOpenDetail(row)}>
                {row.kode_shift}
              </span>
            )}
          />

          <Column
            field="nama_kasir"
            header="Kasir"
            sortable
            style={{ minWidth: '12rem' }}
            body={(row: ShiftRecord) => (
              <div className="flex align-items-center gap-2">
                <div
                  className="w-2rem h-2rem border-round-circle flex align-items-center justify-content-center text-xs font-bold text-white shadow-1"
                  style={{ background: 'linear-gradient(135deg, #0d9488 0%, #047857 100%)' }}
                >
                  {(row.nama_kasir || 'K').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-900 text-xs">{row.nama_kasir}</div>
                  <div className="text-500 text-[10px]">{row.user_code}</div>
                </div>
              </div>
            )}
          />

          <Column
            header="Waktu Buka / Tutup"
            style={{ minWidth: '13rem' }}
            body={(row: ShiftRecord) => (
              <div className="text-xs">
                <div className="flex align-items-center gap-1 text-700">
                  <i className="pi pi-sign-in text-green-600 text-[10px]" />
                  <span>Buka: <strong>{formatDatetime(row.waktu_buka)}</strong></span>
                </div>
                <div className="flex align-items-center gap-1 text-500 mt-1">
                  <i className="pi pi-sign-out text-orange-600 text-[10px]" />
                  <span>Tutup: {row.waktu_tutup ? <strong>{formatDatetime(row.waktu_tutup)}</strong> : <em className="text-green-600">Sedang Aktif</em>}</span>
                </div>
              </div>
            )}
          />

          <Column
            field="modal_awal"
            header="Modal Awal"
            align="right"
            style={{ minWidth: '8rem' }}
            body={(row: ShiftRecord) => <span className="font-medium text-xs">{formatRupiah(row.modal_awal)}</span>}
          />

          <Column
            field="total_penjualan_tunai"
            header="Tunai Masuk"
            align="right"
            style={{ minWidth: '9rem' }}
            body={(row: ShiftRecord) => (
              <span className="font-bold text-xs text-green-700 font-mono">
                +{formatRupiah(row.total_penjualan_tunai)}
              </span>
            )}
          />

          <Column
            field="total_kas_keluar"
            header="Kas Keluar"
            align="right"
            style={{ minWidth: '8rem' }}
            body={(row: ShiftRecord) => {
              const keluar = parseFloat(String(row.total_kas_keluar || 0));
              return (
                <span className={`text-xs font-mono ${keluar > 0 ? 'text-red-600 font-bold' : 'text-400'}`}>
                  {keluar > 0 ? `-${formatRupiah(keluar)}` : 'Rp 0'}
                </span>
              );
            }}
          />

          <Column
            field="kas_diharapkan"
            header="Kas Diharapkan"
            align="right"
            style={{ minWidth: '9rem' }}
            body={(row: ShiftRecord) => (
              <span className="font-bold text-xs text-teal-800 font-mono">
                {formatRupiah(row.kas_diharapkan)}
              </span>
            )}
          />

          <Column
            field="kas_aktual"
            header="Kas Aktual (Fisik)"
            align="right"
            style={{ minWidth: '9rem' }}
            body={(row: ShiftRecord) => (
              <span className="font-bold text-xs text-slate-800 font-mono">
                {row.kas_aktual !== null ? formatRupiah(row.kas_aktual) : <span className="text-400 font-normal">-</span>}
              </span>
            )}
          />

          <Column
            field="selisih"
            header="Selisih"
            align="center"
            style={{ minWidth: '8rem' }}
            body={(row: ShiftRecord) => {
              if (row.selisih === null) return <span className="text-400 text-xs">-</span>;
              const sel = parseFloat(String(row.selisih || 0));
              if (sel === 0) {
                return <Tag severity="success" value="Pas (Rp 0)" className="text-[10px] px-2 py-0.5" />;
              }
              if (sel > 0) {
                return <Tag severity="info" value={`+${formatRupiah(sel)}`} className="text-[10px] px-2 py-0.5" />;
              }
              return <Tag severity="danger" value={formatRupiah(sel)} className="text-[10px] px-2 py-0.5" />;
            }}
          />

          <Column
            field="status"
            header="Status Sesi"
            align="center"
            style={{ minWidth: '7rem' }}
            body={(row: ShiftRecord) => (
              <Tag
                severity={row.status === 'open' ? 'success' : 'secondary'}
                value={row.status === 'open' ? 'Buka' : 'Selesai'}
                className="text-[11px] px-2 py-1 font-bold"
              />
            )}
          />

          <Column
            header="Aksi"
            align="center"
            style={{ minWidth: '6rem' }}
            body={(row: ShiftRecord) => (
              <div className="flex align-items-center justify-content-center gap-1">
                <Button
                  icon="pi pi-eye"
                  size="small"
                  outlined
                  severity="success"
                  className="p-button-rounded border-circle p-0 w-2rem h-2rem"
                  onClick={() => handleOpenDetail(row)}
                  tooltip="Lihat Detail Mutasi Kas"
                  tooltipOptions={{ position: 'top' }}
                />
              </div>
            )}
          />
        </DataTable>
      </div>

      {/* ── Modal Detail & Mutasi Kas Kronologis ── */}
      <Dialog
        header={
          <div className="flex align-items-center gap-2">
            <i className="pi pi-receipt text-teal-600 text-xl" />
            <span className="font-bold text-lg text-900">
              Rincian Mutasi Kas Shift: {selectedShift?.kode_shift}
            </span>
          </div>
        }
        visible={detailVisible}
        style={{ width: '850px', maxWidth: '95vw' }}
        onHide={() => setDetailVisible(false)}
        footer={
          <div className="flex align-items-center justify-content-between w-full">
            <Button
              label="Cetak Rekap Shift"
              icon="pi pi-print"
              severity="success"
              size="small"
              className="border-round-md font-semibold text-xs px-3"
              onClick={handlePrintRekap}
            />
            <Button
              label="Tutup"
              icon="pi pi-times"
              outlined
              severity="secondary"
              size="small"
              className="border-round-md font-medium text-xs px-3"
              onClick={() => setDetailVisible(false)}
            />
          </div>
        }
      >
        {selectedShift && (
          <div>
            {/* Header Shift Info Card */}
            <div className="p-3 border-round-xl surface-50 border-1 surface-border mb-3">
              <div className="grid text-xs">
                <div className="col-12 sm:col-6 md:col-3">
                  <div className="text-500">Kasir Bertugas:</div>
                  <div className="font-bold text-900 text-sm mt-1">{selectedShift.nama_kasir}</div>
                  <div className="text-500 text-[10px]">{selectedShift.user_code}</div>
                </div>
                <div className="col-12 sm:col-6 md:col-3">
                  <div className="text-500">Status Sesi:</div>
                  <div className="mt-1">
                    <Tag
                      severity={selectedShift.status === 'open' ? 'success' : 'secondary'}
                      value={selectedShift.status === 'open' ? '🟢 Sedang Buka' : '⚪ Sudah Ditutup'}
                      className="text-xs font-bold px-2 py-0.5"
                    />
                  </div>
                </div>
                <div className="col-12 sm:col-6 md:col-3">
                  <div className="text-500">Waktu Buka:</div>
                  <div className="font-semibold text-900 mt-1">{formatDatetime(selectedShift.waktu_buka)}</div>
                </div>
                <div className="col-12 sm:col-6 md:col-3">
                  <div className="text-500">Waktu Tutup:</div>
                  <div className="font-semibold text-900 mt-1">
                    {selectedShift.waktu_tutup ? formatDatetime(selectedShift.waktu_tutup) : '-'}
                  </div>
                </div>
              </div>

              <Divider className="my-2" />

              {/* Metric Breakdown */}
              <div className="grid text-xs pt-1">
                <div className="col-6 sm:col-3 md:col-2">
                  <div className="text-500">Modal Awal:</div>
                  <div className="font-bold text-slate-800">{formatRupiah(selectedShift.modal_awal)}</div>
                </div>
                <div className="col-6 sm:col-3 md:col-2">
                  <div className="text-500">Penjualan Tunai:</div>
                  <div className="font-bold text-green-700">+{formatRupiah(selectedShift.total_penjualan_tunai)}</div>
                </div>
                <div className="col-6 sm:col-3 md:col-2">
                  <div className="text-500">Kas Masuk Lain:</div>
                  <div className="font-bold text-green-600">+{formatRupiah(selectedShift.total_kas_masuk_lain)}</div>
                </div>
                <div className="col-6 sm:col-3 md:col-2">
                  <div className="text-500">Kas Keluar:</div>
                  <div className="font-bold text-red-600">-{formatRupiah(selectedShift.total_kas_keluar)}</div>
                </div>
                <div className="col-6 sm:col-3 md:col-2">
                  <div className="text-500">Kas Diharapkan:</div>
                  <div className="font-bold text-teal-800">{formatRupiah(selectedShift.kas_diharapkan)}</div>
                </div>
                <div className="col-6 sm:col-3 md:col-2">
                  <div className="text-500">Kas Fisik Aktual:</div>
                  <div className="font-bold text-indigo-900">
                    {selectedShift.kas_aktual !== null ? formatRupiah(selectedShift.kas_aktual) : '-'}
                  </div>
                </div>
              </div>

              {(selectedShift.catatan_buka || selectedShift.catatan_tutup) && (
                <div className="mt-2 pt-2 border-top-1 surface-border text-xs text-600">
                  {selectedShift.catatan_buka && <div><span className="font-semibold">Catatan Buka:</span> {selectedShift.catatan_buka}</div>}
                  {selectedShift.catatan_tutup && <div className="mt-1"><span className="font-semibold">Catatan Tutup:</span> {selectedShift.catatan_tutup}</div>}
                </div>
              )}
            </div>

            {/* Mutasi Kas Table */}
            <h5 className="font-bold text-900 text-sm mb-2 flex align-items-center gap-2">
              <i className="pi pi-list text-teal-600" />
              Kronologi Aliran Kas Masuk &amp; Keluar ({mutasiList.length} Mutasi)
            </h5>

            {loadingDetail ? (
              <div className="flex justify-content-center p-4">
                <ProgressSpinner style={{ width: '40px', height: '40px' }} />
              </div>
            ) : mutasiList.length === 0 ? (
              <div className="text-center p-4 text-500 text-sm surface-50 border-round-lg">
                Belum ada catatan mutasi kas pada sesi shift ini
              </div>
            ) : (
              <DataTable value={mutasiList} size="small" rowHover className="text-xs border-1 surface-border border-round-lg">
                <Column
                  header="No"
                  style={{ width: '3rem' }}
                  body={(_, options) => options.rowIndex + 1}
                />
                <Column
                  header="Waktu"
                  style={{ minWidth: '7rem' }}
                  body={(m: MutasiRecord) => formatDatetime(m.created_at)}
                />
                <Column
                  header="Tipe & Kategori"
                  style={{ minWidth: '10rem' }}
                  body={(m: MutasiRecord) => (
                    <div>
                      <span className="font-bold text-900">{(m.kategori || m.tipe).toUpperCase()}</span>
                      {m.referensi && <div className="text-500 text-[10px]">Ref: {m.referensi}</div>}
                    </div>
                  )}
                />
                <Column
                  header="Keterangan"
                  field="keterangan"
                  style={{ minWidth: '12rem' }}
                  body={(m: MutasiRecord) => m.keterangan || '-'}
                />
                <Column
                  header="Nominal"
                  align="right"
                  style={{ minWidth: '8rem' }}
                  body={(m: MutasiRecord) => (
                    <span className={`font-mono font-bold ${m.arus === 'masuk' ? 'text-green-600' : 'text-red-600'}`}>
                      {m.arus === 'masuk' ? '+' : '-'} {formatRupiah(m.nominal)}
                    </span>
                  )}
                />
                <Column
                  header="Saldo Laci"
                  align="right"
                  style={{ minWidth: '8rem' }}
                  body={(m: MutasiRecord) => (
                    <span className="font-mono font-bold text-teal-800">
                      {formatRupiah(m.saldo_setelah)}
                    </span>
                  )}
                />
              </DataTable>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
