'use client';

import React, { useState, useEffect, useRef } from 'react';
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
import { TabView, TabPanel } from 'primereact/tabview';
import { ConfirmDialog } from 'primereact/confirmdialog';
import { ProgressSpinner } from 'primereact/progressspinner';
import postData from '@/lib/axios/postData';
import { showError, showSuccess } from '@/lib/tools/generalTools';
import { useSession } from 'next-auth/react';
import { format } from 'date-fns';
import KeteranganStatus from '@/app/components/KeteranganStatus';

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

  // Active Tab Index (Tab 1: Sesi Shift, Tab 2: Log Mutasi Kas)
  const [activeIndex, setActiveIndex] = useState<number>(0);

  // ==========================================
  // TAB 1: SESI SHIFT KASIR STATE
  // ==========================================
  const [keyword, setKeyword] = useState<string>('');
  const [selectedKasir, setSelectedKasir] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [tanggalMulai, setTanggalMulai] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [tanggalSelesai, setTanggalSelesai] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  const [data, setData] = useState<ShiftRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [rows, setRows] = useState<number>(10);
  const [expandedRows, setExpandedRows] = useState<any>(null);

  // Summary Metrics (KPI Cards)
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
    { label: 'Semua Status Sesi', value: '' },
    { label: 'Sedang Buka (Aktif)', value: 'open' },
    { label: 'Selesai (Ditutup)', value: 'closed' },
  ];

  // ==========================================
  // TAB 2: LOG MUTASI KAS STATE
  // ==========================================
  const [mutasiData, setMutasiData] = useState<MutasiRecord[]>([]);
  const [loadingMutasi, setLoadingMutasi] = useState<boolean>(false);
  const [totalMutasiRecords, setTotalMutasiRecords] = useState<number>(0);
  const [pageMutasi, setPageMutasi] = useState<number>(1);
  const [rowsMutasi, setRowsMutasi] = useState<number>(10);
  const [keywordMutasi, setKeywordMutasi] = useState<string>('');
  const [selectedKasirMutasi, setSelectedKasirMutasi] = useState<string>('');
  const [selectedTipeMutasi, setSelectedTipeMutasi] = useState<string>('');
  const [selectedArusMutasi, setSelectedArusMutasi] = useState<string>('');
  const [tanggalMulaiMutasi, setTanggalMulaiMutasi] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [tanggalSelesaiMutasi, setTanggalSelesaiMutasi] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [summaryMutasi, setSummaryMutasi] = useState<{ total_nominal_masuk: number; total_nominal_keluar: number }>({
    total_nominal_masuk: 0,
    total_nominal_keluar: 0,
  });

  const tipeMutasiOptions = [
    { label: 'Semua Tipe Mutasi', value: '' },
    { label: 'Modal Awal', value: 'modal_awal' },
    { label: 'Penjualan Tunai', value: 'penjualan_tunai' },
    { label: 'Kas Masuk Lain', value: 'kas_masuk' },
    { label: 'Kas Keluar', value: 'kas_keluar' },
    { label: 'Tutup Shift', value: 'tutup_shift' },
  ];

  const arusMutasiOptions = [
    { label: 'Semua Arus Kas', value: '' },
    { label: 'Kas Masuk (+)', value: 'masuk' },
    { label: 'Kas Keluar (-)', value: 'keluar' },
  ];

  // ==========================================
  // MODAL DETAIL MUTASI SHIFT
  // ==========================================
  const [detailVisible, setDetailVisible] = useState<boolean>(false);
  const [selectedShift, setSelectedShift] = useState<ShiftRecord | null>(null);
  const [mutasiList, setMutasiList] = useState<MutasiRecord[]>([]);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  // Helper Formatter
  const formatRupiah = (val: number | string | null | undefined) => {
    const num = parseFloat(String(val || 0));
    return `Rp ${num.toLocaleString('id-ID')}`;
  };

  const formatDatetime = (dt: string | null | undefined) => {
    if (!dt) return '-';
    try {
      const d = new Date(dt);
      return format(d, 'dd/MM/yyyy HH:mm:ss');
    } catch {
      return dt;
    }
  };

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

  // ==========================================
  // DATA LOADERS
  // ==========================================
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

  const loadMutasiData = async (currentPage = pageMutasi, currentRows = rowsMutasi) => {
    setLoadingMutasi(true);
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
        keyword: sanitizeVal(keywordMutasi),
        user_code: sanitizeVal(selectedKasirMutasi),
        tipe: sanitizeVal(selectedTipeMutasi),
        arus: sanitizeVal(selectedArusMutasi),
        tanggal_mulai: sanitizeVal(tanggalMulaiMutasi),
        tanggal_selesai: sanitizeVal(tanggalSelesaiMutasi),
      };

      const res = await postData('/master/kasir-tracking-kas/mutasi-data', payload);
      const resData = res.data?.data;
      if (resData) {
        setMutasiData(resData.records || []);
        setTotalMutasiRecords(resData.totalRecords || 0);
        if (resData.summary) {
          setSummaryMutasi(resData.summary);
        }
      }
    } catch (error: any) {
      showError(toast, error?.response?.data?.message || 'Gagal memuat log mutasi kas');
    } finally {
      setLoadingMutasi(false);
    }
  };

  useEffect(() => {
    loadKasirOptions();
  }, []);

  useEffect(() => {
    loadData(1, rows);
  }, [selectedKasir, selectedStatus, tanggalMulai, tanggalSelesai]);

  useEffect(() => {
    if (activeIndex === 1) {
      loadMutasiData(1, rowsMutasi);
    }
  }, [activeIndex, selectedKasirMutasi, selectedTipeMutasi, selectedArusMutasi, tanggalMulaiMutasi, tanggalSelesaiMutasi]);

  const handleResetFilter = () => {
    setKeyword('');
    setSelectedKasir('');
    setSelectedStatus('');
    setTanggalMulai(format(new Date(), 'yyyy-MM-dd'));
    setTanggalSelesai(format(new Date(), 'yyyy-MM-dd'));
  };

  const handleResetFilterMutasi = () => {
    setKeywordMutasi('');
    setSelectedKasirMutasi('');
    setSelectedTipeMutasi('');
    setSelectedArusMutasi('');
    setTanggalMulaiMutasi(format(new Date(), 'yyyy-MM-dd'));
    setTanggalSelesaiMutasi(format(new Date(), 'yyyy-MM-dd'));
  };

  // Open Detail Mutasi Dialog
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

  // Cetak Rekap Mutasi Kas Sesi Ini (Popup Print)
  const handlePrintRekap = (shiftTarget?: ShiftRecord) => {
    const target = shiftTarget || selectedShift;
    if (!target) return;
    const printWindow = window.open('', '_blank', 'width=850,height=900');
    if (!printWindow) {
      alert('Popup diblokir browser. Izinkan popup untuk mencetak laporan.');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Rekap Sesi Kasir - ${target.kode_shift}</title>
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
            <div><strong>Kode Shift:</strong> ${target.kode_shift}</div>
            <div><strong>Kasir:</strong> ${target.nama_kasir} (${target.user_code})</div>
            <div><strong>Cabang:</strong> ${target.nama_cabang || target.kode_cabang || 'Cabang Utama'}</div>
            <div><strong>Status:</strong> ${target.status === 'open' ? 'SEDANG BUKA (AKTIF)' : 'SUDAH DITUTUP'}</div>
          </div>
          <div class="box">
            <div class="box-title">Waktu & Catatan</div>
            <div><strong>Waktu Buka:</strong> ${formatDatetime(target.waktu_buka)}</div>
            <div><strong>Waktu Tutup:</strong> ${formatDatetime(target.waktu_tutup)}</div>
            <div><strong>Catatan Buka:</strong> ${target.catatan_buka || '-'}</div>
            <div><strong>Catatan Tutup:</strong> ${target.catatan_tutup || '-'}</div>
          </div>
        </div>

        <div class="summary-card">
          <div style="font-weight: bold; margin-bottom: 8px; color: #166534;">RINGKASAN REKONSILIASI KAS:</div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
            <div>Modal Awal: <strong>Rp ${parseFloat(String(target.modal_awal || 0)).toLocaleString('id-ID')}</strong></div>
            <div>Penjualan Tunai: <strong>Rp ${parseFloat(String(target.total_penjualan_tunai || 0)).toLocaleString('id-ID')}</strong></div>
            <div>Kas Keluar: <strong>Rp ${parseFloat(String(target.total_kas_keluar || 0)).toLocaleString('id-ID')}</strong></div>
            <div>Kas Masuk Lain: <strong>Rp ${parseFloat(String(target.total_kas_masuk_lain || 0)).toLocaleString('id-ID')}</strong></div>
          </div>
          <hr style="border: 0; border-top: 1px dashed #86efac; margin: 10px 0;" />
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
            <div>Ekspektasi Kas Laci: <strong>Rp ${parseFloat(String(target.kas_diharapkan || 0)).toLocaleString('id-ID')}</strong></div>
            <div>Kas Aktual Fisik: <strong>Rp ${target.kas_aktual !== null ? parseFloat(String(target.kas_aktual)).toLocaleString('id-ID') : '-'}</strong></div>
            <div>Selisih: <strong>${target.selisih !== null ? 'Rp ' + parseFloat(String(target.selisih)).toLocaleString('id-ID') : '-'}</strong></div>
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
            ${(mutasiList.length > 0 ? mutasiList : [])
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
            ( ${target.nama_kasir} )
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

  // Cetak Semua Sesi Terfilter
  const handlePrintAllShifts = () => {
    const printWindow = window.open('', '_blank', 'width=1000,height=900');
    if (!printWindow) {
      alert('Popup diblokir browser. Izinkan popup untuk mencetak laporan.');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Rekap Sesi Shift Kasir</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 25px; color: #1e293b; font-size: 12px; }
          .header { text-align: center; border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 20px; }
          .title { font-size: 20px; font-weight: bold; color: #0f766e; margin: 0; }
          .subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
          .kpi-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 20px; }
          .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; text-align: center; }
          .kpi-label { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: bold; }
          .kpi-val { font-size: 13px; font-weight: bold; color: #0f172a; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
          th { background: #0f766e; color: white; text-align: left; padding: 7px 8px; font-weight: 600; }
          td { border-bottom: 1px solid #e2e8f0; padding: 7px 8px; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .footer { margin-top: 30px; display: flex; justify-content: space-between; font-size: 11px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">KLINIK KECANTIKAN</div>
          <div class="subtitle">REKAPITULASI SESI SHIFT KASIR & TRACKING KAS (Periode: ${tanggalMulai} s/d ${tanggalSelesai})</div>
        </div>

        <div class="kpi-row">
          <div class="kpi-card">
            <div class="kpi-label">Modal Awal</div>
            <div class="kpi-val">${formatRupiah(summary.total_modal_awal)}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Tunai Masuk</div>
            <div class="kpi-val" style="color: #16a34a;">${formatRupiah(summary.total_penjualan_tunai)}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Kas Keluar</div>
            <div class="kpi-val" style="color: #dc2626;">${formatRupiah(summary.total_kas_keluar)}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Non-Tunai</div>
            <div class="kpi-val">${formatRupiah(summary.total_penjualan_nontunai)}</div>
          </div>
          <div class="kpi-card" style="background: #f0fdf4; border-color: #bbf7d0;">
            <div class="kpi-label">Ekspektasi Kas</div>
            <div class="kpi-val" style="color: #0f766e;">${formatRupiah(summary.total_kas_diharapkan)}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Selisih Kas</div>
            <div class="kpi-val">${summary.total_selisih === 0 ? 'Rp 0 (Pas)' : formatRupiah(summary.total_selisih)}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>Kode Shift</th>
              <th>Kasir</th>
              <th>Waktu Buka / Tutup</th>
              <th class="text-right">Modal Awal</th>
              <th class="text-right">Tunai Masuk</th>
              <th class="text-right">Kas Keluar</th>
              <th class="text-right">Kas Diharapkan</th>
              <th class="text-right">Kas Aktual</th>
              <th class="text-center">Selisih</th>
              <th class="text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            ${data
              .map(
                (s, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td><strong>${s.kode_shift}</strong></td>
                <td>${s.nama_kasir}<br/><span style="color:#64748b; font-size:10px;">${s.user_code}</span></td>
                <td>Buka: ${formatDatetime(s.waktu_buka)}<br/>Tutup: ${s.waktu_tutup ? formatDatetime(s.waktu_tutup) : 'Sedang Aktif'}</td>
                <td class="text-right">${formatRupiah(s.modal_awal)}</td>
                <td class="text-right" style="color:#16a34a; font-weight:bold;">+${formatRupiah(s.total_penjualan_tunai)}</td>
                <td class="text-right" style="color:#dc2626;">${parseFloat(String(s.total_kas_keluar || 0)) > 0 ? '-' + formatRupiah(s.total_kas_keluar) : 'Rp 0'}</td>
                <td class="text-right" style="font-weight:bold; color:#0f766e;">${formatRupiah(s.kas_diharapkan)}</td>
                <td class="text-right">${s.kas_aktual !== null ? formatRupiah(s.kas_aktual) : '-'}</td>
                <td class="text-center">${s.selisih !== null ? formatRupiah(s.selisih) : '-'}</td>
                <td class="text-center">${s.status === 'open' ? 'Buka' : 'Selesai'}</td>
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
            Mengetahui / Penanggung Jawab<br /><br /><br /><br />
            ( __________________________ )
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

  // Row Expansion Template (Format Seragam dengan Inventori)
  const rowExpansionTemplate = (row: ShiftRecord) => {
    return (
      <div className="p-3 surface-50 border-round-lg border-1 surface-border my-2 mx-1">
        <div className="flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <div className="flex align-items-center gap-2">
            <i className="pi pi-info-circle text-teal-600 text-lg" />
            <span className="font-bold text-900 text-sm">
              Ringkasan Rekonsiliasi Sesi #{row.kode_shift} ({row.nama_kasir})
            </span>
            <Tag
              severity={row.status === 'open' ? 'success' : 'secondary'}
              value={row.status === 'open' ? 'Sedang Buka (Aktif)' : 'Sudah Ditutup (Selesai)'}
              className="text-xs"
            />
          </div>
          <div className="flex align-items-center gap-2">
            <Button
              size="small"
              icon="pi pi-receipt"
              label="Lihat Kronologi Mutasi Lengkap"
              outlined
              severity="success"
              className="text-xs px-2.5 py-1 border-round-md font-semibold"
              onClick={() => handleOpenDetail(row)}
            />
            <Button
              size="small"
              icon="pi pi-print"
              label="Cetak Rekap Sesi"
              outlined
              severity="help"
              className="text-xs px-2.5 py-1 border-round-md font-semibold border-purple-600 text-purple-600"
              onClick={async () => {
                try {
                  const res = await postData('/master/kasir-tracking-kas/detail', { kode_shift: row.kode_shift });
                  if (res.data?.data) {
                    setSelectedShift(res.data.data.shift);
                    setMutasiList(res.data.data.mutasi || []);
                    handlePrintRekap(res.data.data.shift);
                  }
                } catch {
                  handlePrintRekap(row);
                }
              }}
            />
          </div>
        </div>

        <div className="grid text-xs">
          <div className="col-12 sm:col-6 md:col-3 p-1">
            <div className="p-2.5 surface-card border-round-md border-1 border-200">
              <span className="text-500 block mb-1">Modal Awal Sesi</span>
              <span className="font-bold text-sm text-900">{formatRupiah(row.modal_awal)}</span>
            </div>
          </div>
          <div className="col-12 sm:col-6 md:col-3 p-1">
            <div className="p-2.5 surface-card border-round-md border-1 border-200">
              <span className="text-500 block mb-1">Penerimaan Tunai</span>
              <span className="font-bold text-sm text-green-700">+{formatRupiah(row.total_penjualan_tunai)}</span>
            </div>
          </div>
          <div className="col-12 sm:col-6 md:col-3 p-1">
            <div className="p-2.5 surface-card border-round-md border-1 border-200">
              <span className="text-500 block mb-1">Total Kas Keluar</span>
              <span className="font-bold text-sm text-red-600">-{formatRupiah(row.total_kas_keluar)}</span>
            </div>
          </div>
          <div className="col-12 sm:col-6 md:col-3 p-1">
            <div className="p-2.5 surface-card border-round-md border-1 border-200 bg-teal-50">
              <span className="text-teal-800 font-semibold block mb-1">Ekspektasi Kas Laci</span>
              <span className="font-bold text-sm text-teal-900">{formatRupiah(row.kas_diharapkan)}</span>
            </div>
          </div>
        </div>

        <div className="grid text-xs mt-1">
          <div className="col-12 sm:col-6 md:col-3 p-1">
            <div className="p-2.5 surface-card border-round-md border-1 border-200">
              <span className="text-500 block mb-1">Kas Masuk Lainnya</span>
              <span className="font-bold text-sm text-teal-700">+{formatRupiah(row.total_kas_masuk_lain)}</span>
            </div>
          </div>
          <div className="col-12 sm:col-6 md:col-3 p-1">
            <div className="p-2.5 surface-card border-round-md border-1 border-200">
              <span className="text-500 block mb-1">Penjualan Non-Tunai</span>
              <span className="font-bold text-sm text-purple-700">{formatRupiah(row.total_penjualan_nontunai)}</span>
            </div>
          </div>
          <div className="col-12 sm:col-6 md:col-3 p-1">
            <div className="p-2.5 surface-card border-round-md border-1 border-200">
              <span className="text-500 block mb-1">Kas Fisik Aktual</span>
              <span className="font-bold text-sm text-900">
                {row.kas_aktual !== null ? formatRupiah(row.kas_aktual) : '- (Belum Dihitung)'}
              </span>
            </div>
          </div>
          <div className="col-12 sm:col-6 md:col-3 p-1">
            <div className="p-2.5 surface-card border-round-md border-1 border-200">
              <span className="text-500 block mb-1">Selisih Rekonsiliasi</span>
              <span className="font-bold text-sm">
                {row.selisih !== null ? (
                  parseFloat(String(row.selisih)) === 0 ? (
                    <span className="text-green-600">Rp 0 (Sesuai / Pas)</span>
                  ) : parseFloat(String(row.selisih)) > 0 ? (
                    <span className="text-blue-600">+{formatRupiah(row.selisih)} (Lebih)</span>
                  ) : (
                    <span className="text-red-600">{formatRupiah(row.selisih)} (Kurang)</span>
                  )
                ) : (
                  '-'
                )}
              </span>
            </div>
          </div>
        </div>

        {(row.catatan_buka || row.catatan_tutup) && (
          <div className="surface-card border-round-md border-1 border-200 p-2.5 mt-2 text-xs">
            {row.catatan_buka && (
              <div>
                <span className="font-semibold text-700">Catatan Buka Sesi:</span> {row.catatan_buka}
              </div>
            )}
            {row.catatan_tutup && (
              <div className="mt-1">
                <span className="font-semibold text-700">Catatan Tutup Sesi:</span> {row.catatan_tutup}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full">
      <Toast ref={toast} />
      <ConfirmDialog />

      {/* =========================================================
          CARD CONTAINER UTAMA (Konsisten dengan tema Inventori)
          ========================================================= */}
      <div className="card border-round-xl p-4 shadow-1 surface-card mb-4">
        {/* PAGE HEADER */}
        <div className="mb-4">
          <h3 className="text-2xl font-bold text-900 flex align-items-center gap-2 mb-1">
            <i className="pi pi-wallet text-teal-600 text-2xl" />
            Tracking Kas Keluar &amp; Masuk Setiap Kasir
          </h3>
          <p className="text-500 text-sm m-0">
            Monitoring riwayat sesi shift kasir, mutasi kas masuk, pengeluaran uang kasir, dan rekonsiliasi saldo kas.
          </p>
        </div>

        {/* =========================================================
            3 KPI CARDS STRIP UTAMA (Ringkas, Rapi & Lega)
            ========================================================= */}
        <div className="grid m-0 mb-4">
          {/* 1. Kas Masuk (Tunai) */}
          <div className="col-12 md:col-4 p-2">
            <div className="p-3 border-round-xl surface-ground border-1 border-200 flex align-items-center justify-content-between h-full hover:shadow-1 transition-shadow">
              <div>
                <span className="text-xs text-500 font-semibold uppercase block mb-1">Kas Masuk (Tunai)</span>
                <span className="text-2xl font-bold text-green-600 block">+{formatRupiah(summary.total_penjualan_tunai)}</span>
                <span className="text-xs text-500 block mt-1">
                  Modal Awal: {formatRupiah(summary.total_modal_awal)} ({summary.total_shift || 0} Shift)
                </span>
              </div>
              <div className="w-3rem h-3rem border-round-lg bg-green-100 flex align-items-center justify-content-center text-green-700 flex-shrink-0">
                <i className="pi pi-arrow-down-left text-xl" />
              </div>
            </div>
          </div>

          {/* 2. Total Kas Keluar */}
          <div className="col-12 md:col-4 p-2">
            <div className="p-3 border-round-xl surface-ground border-1 border-200 flex align-items-center justify-content-between h-full hover:shadow-1 transition-shadow">
              <div>
                <span className="text-xs text-500 font-semibold uppercase block mb-1">Total Kas Keluar</span>
                <span className="text-2xl font-bold text-red-600 block">-{formatRupiah(summary.total_kas_keluar)}</span>
                <span className="text-xs text-500 block mt-1">
                  Biaya Operasional &amp; Pengeluaran Petugas
                </span>
              </div>
              <div className="w-3rem h-3rem border-round-lg bg-red-100 flex align-items-center justify-content-center text-red-700 flex-shrink-0">
                <i className="pi pi-arrow-up-right text-xl" />
              </div>
            </div>
          </div>

          {/* 3. Ekspektasi Kas Laci (Saldo Kas Seharusnya) */}
          <div className="col-12 md:col-4 p-2">
            <div className="p-3 border-round-xl border-1 border-teal-200 flex align-items-center justify-content-between h-full bg-teal-50 hover:shadow-1 transition-shadow">
              <div>
                <span className="text-xs text-teal-800 font-semibold uppercase block mb-1">Ekspektasi Kas Laci</span>
                <span className="text-2xl font-black text-teal-900 block">{formatRupiah(summary.total_kas_diharapkan)}</span>
                <span className="text-xs text-teal-700 block mt-1 font-medium">
                  Selisih: {summary.total_selisih === 0 ? 'Rp 0 (Pas)' : (summary.total_selisih > 0 ? '+' : '') + formatRupiah(summary.total_selisih)} • {summary.total_shift_open || 0} Buka / {summary.total_shift_closed || 0} Tutup
                </span>
              </div>
              <div className="w-3rem h-3rem border-round-lg bg-teal-100 flex align-items-center justify-content-center text-teal-700 flex-shrink-0">
                <i className="pi pi-wallet text-xl" />
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================
            TAB VIEW: SESI SHIFT KASIR & LOG MUTASI KAS
            ========================================================= */}
        <TabView activeIndex={activeIndex} onTabChange={(e) => setActiveIndex(e.index)}>
          {/* ── TAB 1: SESI SHIFT KASIR ── */}
          <TabPanel header="Sesi Shift Kasir" leftIcon="pi pi-clock mr-2">
            {/* ACTION BUTTONS (Outline Style seperti Inventori) */}
            <div className="flex flex-row flex-wrap align-items-center gap-2 pt-2 mb-4">
              <Button
                size="small"
                label="Cetak Rekap Kasir"
                icon="pi pi-print"
                outlined
                className="border-round-md font-medium px-3 border-purple-600 text-purple-600"
                onClick={handlePrintAllShifts}
              />
              <Divider layout="vertical" className="m-0 h-2rem" />
              <Button
                size="small"
                label="Refresh"
                icon="pi pi-refresh"
                outlined
                severity="success"
                className="border-round-md font-medium px-3"
                loading={loading}
                onClick={() => loadData(page, rows)}
              />
            </div>

            {/* DATA TABLE SESI SHIFT KASIR */}
            <DataTable
              value={data}
              loading={loading}
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
              expandedRows={expandedRows}
              onRowToggle={(e) => setExpandedRows(e.data)}
              rowExpansionTemplate={rowExpansionTemplate}
              dataKey="kode_shift"
              className="p-datatable-sm"
              emptyMessage="Belum ada riwayat sesi shift kasir pada rentang filter ini."
              responsiveLayout="scroll"
              rowsPerPageOptions={[10, 25, 50]}
              paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink CurrentPageReport RowsPerPageDropdown"
              currentPageReportTemplate="Menampilkan {first} - {last} dari {totalRecords} sesi shift"
              header={
                <div className="flex flex-column gap-3">
                  <div>
                    <span className="text-xl font-bold text-900 block">Data Sesi Shift Kasir</span>
                    <span className="text-xs text-500">
                      Monitoring riwayat sesi shift kasir, mutasi kas masuk, pengeluaran uang kasir, dan rekonsiliasi saldo kas
                    </span>
                  </div>

                  {/* Baris Filter (Kiri) & Search + Reset (Kanan Mentok) */}
                  <div className="flex flex-wrap align-items-center justify-content-between gap-2">
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
                        className="p-inputtext-sm text-sm border-round-md w-full md:w-13rem"
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
                        placeholder="Status Sesi"
                        className="p-inputtext-sm text-sm border-round-md w-full md:w-11rem"
                        showClear={Boolean(selectedStatus)}
                      />

                      {/* Rentang Tanggal */}
                      <div className="flex align-items-center gap-1 border-1 border-300 border-round-md px-2 py-1 surface-50 text-xs">
                        <span className="text-500 font-medium">Dari:</span>
                        <input
                          type="date"
                          value={tanggalMulai}
                          onChange={(e) => setTanggalMulai(e.target.value)}
                          className="border-none bg-transparent text-xs p-1 text-700 outline-none"
                        />
                        <span className="text-500 font-medium ml-1">Sampai:</span>
                        <input
                          type="date"
                          value={tanggalSelesai}
                          onChange={(e) => setTanggalSelesai(e.target.value)}
                          className="border-none bg-transparent text-xs p-1 text-700 outline-none"
                        />
                      </div>
                    </div>

                    {/* Search Field & Reset Filter di Kanan Mentok */}
                    <div className="flex align-items-center gap-2 ml-auto w-full md:w-auto">
                      <IconField iconPosition="left" className="w-full md:w-16rem">
                        <InputIcon className="pi pi-search" />
                        <InputText
                          value={keyword}
                          onChange={(e) => setKeyword(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              loadData(1, rows);
                            }
                          }}
                          placeholder="Cari Shift / Kasir..."
                          className="w-full text-sm"
                        />
                      </IconField>

                      <Button
                        type="button"
                        icon="pi pi-filter"
                        size="small"
                        severity="success"
                        className="border-round-md text-xs px-3"
                        tooltip="Terapkan Filter"
                        tooltipOptions={{ position: 'bottom' }}
                        onClick={() => loadData(1, rows)}
                      />

                      <Button
                        type="button"
                        icon="pi pi-filter-slash"
                        outlined
                        severity="danger"
                        tooltip="Reset Filter"
                        tooltipOptions={{ position: 'bottom' }}
                        onClick={handleResetFilter}
                      />
                    </div>
                  </div>

                  {/* Keterangan Status Legend */}
                  <KeteranganStatus
                    className="mb-2"
                    items={[
                      { label: 'Sesi Aktif (Buka)', color: '#22c55e' },
                      { label: 'Sesi Selesai (Tutup)', color: '#64748b' },
                      { label: 'Kas Pas / Sesuai (Rp 0)', color: '#0ea5e9' },
                      { label: 'Ada Selisih Kas', color: '#f97316' },
                    ]}
                  />
                </div>
              }
            >
              <Column expander style={{ width: '3rem' }} />

              {/* Status Indicator Dot */}
              <Column
                header=""
                headerStyle={{ width: '2.5rem', textAlign: 'center' }}
                bodyStyle={{ textAlign: 'center' }}
                body={(r: ShiftRecord) => {
                  let dotColor = r.status === 'open' ? '#22c55e' : '#64748b';
                  let dotTitle = r.status === 'open' ? 'Sesi Sedang Buka (Aktif)' : 'Sesi Selesai (Ditutup)';
                  if (r.selisih !== null && parseFloat(String(r.selisih)) !== 0) {
                    dotColor = '#f97316';
                    dotTitle += ` (Selisih: ${formatRupiah(r.selisih)})`;
                  }
                  return (
                    <div className="flex justify-content-center">
                      <span
                        className="inline-block"
                        style={{
                          width: '12px',
                          height: '12px',
                          borderRadius: '3px',
                          backgroundColor: dotColor,
                          boxShadow: r.status === 'open' ? '0 0 6px rgba(34, 197, 94, 0.6)' : 'none',
                        }}
                        title={dotTitle}
                      />
                    </div>
                  );
                }}
              />

              {/* Kode Shift */}
              <Column
                field="kode_shift"
                header="Kode Shift"
                sortable
                style={{ minWidth: '9.5rem' }}
                body={(row: ShiftRecord) => (
                  <span
                    className="font-bold text-teal-700 font-mono text-xs cursor-pointer hover:underline bg-teal-50 px-2 py-1 border-round border-1 border-teal-200"
                    onClick={() => handleOpenDetail(row)}
                  >
                    {row.kode_shift}
                  </span>
                )}
              />

              {/* Kasir */}
              <Column
                field="nama_kasir"
                header="Kasir"
                sortable
                style={{ minWidth: '12rem' }}
                body={(row: ShiftRecord) => (
                  <div className="flex align-items-center gap-2">
                    <div
                      className="w-2rem h-2rem border-round-circle flex align-items-center justify-content-center text-xs font-bold text-white shadow-1 flex-shrink-0"
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

              {/* Waktu Buka / Tutup */}
              <Column
                header="Waktu Buka / Tutup"
                style={{ minWidth: '13rem' }}
                body={(row: ShiftRecord) => (
                  <div className="text-xs">
                    <div className="flex align-items-center gap-1 text-700">
                      <i className="pi pi-sign-in text-green-600 text-[10px]" />
                      <span>
                        Buka: <strong>{formatDatetime(row.waktu_buka)}</strong>
                      </span>
                    </div>
                    <div className="flex align-items-center gap-1 text-500 mt-1">
                      <i className="pi pi-sign-out text-orange-600 text-[10px]" />
                      <span>
                        Tutup:{' '}
                        {row.waktu_tutup ? (
                          <strong>{formatDatetime(row.waktu_tutup)}</strong>
                        ) : (
                          <em className="text-green-600 font-semibold">Sedang Aktif</em>
                        )}
                      </span>
                    </div>
                  </div>
                )}
              />

              {/* Modal Awal */}
              <Column
                field="modal_awal"
                header="Modal Awal"
                align="right"
                style={{ minWidth: '8rem' }}
                body={(row: ShiftRecord) => <span className="font-medium text-xs">{formatRupiah(row.modal_awal)}</span>}
              />

              {/* Tunai Masuk */}
              <Column
                field="total_penjualan_tunai"
                header="Tunai Masuk"
                align="right"
                style={{ minWidth: '8.5rem' }}
                body={(row: ShiftRecord) => (
                  <span className="font-bold text-xs text-green-700 font-mono">
                    +{formatRupiah(row.total_penjualan_tunai)}
                  </span>
                )}
              />

              {/* Kas Keluar */}
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

              {/* Kas Diharapkan */}
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

              {/* Kas Aktual (Fisik) */}
              <Column
                field="kas_aktual"
                header="Kas Aktual (Fisik)"
                align="right"
                style={{ minWidth: '9rem' }}
                body={(row: ShiftRecord) => (
                  <span className="font-bold text-xs text-slate-800 font-mono">
                    {row.kas_aktual !== null ? (
                      formatRupiah(row.kas_aktual)
                    ) : (
                      <span className="text-400 font-normal">-</span>
                    )}
                  </span>
                )}
              />

              {/* Selisih */}
              <Column
                field="selisih"
                header="Selisih"
                align="center"
                style={{ minWidth: '8.5rem' }}
                body={(row: ShiftRecord) => {
                  if (row.selisih === null) return <span className="text-400 text-xs">-</span>;
                  const sel = parseFloat(String(row.selisih || 0));
                  if (sel === 0) {
                    return <Tag severity="info" value="Pas (Rp 0)" className="text-[10px] px-2 py-0.5" />;
                  }
                  if (sel > 0) {
                    return <Tag severity="success" value={`+${formatRupiah(sel)}`} className="text-[10px] px-2 py-0.5" />;
                  }
                  return <Tag severity="danger" value={formatRupiah(sel)} className="text-[10px] px-2 py-0.5" />;
                }}
              />

              {/* Status Sesi */}
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

              {/* Aksi */}
              <Column
                header="Aksi"
                align="center"
                style={{ minWidth: '6.5rem' }}
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
                    <Button
                      icon="pi pi-print"
                      size="small"
                      outlined
                      severity="help"
                      className="p-button-rounded border-circle p-0 w-2rem h-2rem border-purple-600 text-purple-600"
                      onClick={async () => {
                        try {
                          const res = await postData('/master/kasir-tracking-kas/detail', { kode_shift: row.kode_shift });
                          if (res.data?.data) {
                            setSelectedShift(res.data.data.shift);
                            setMutasiList(res.data.data.mutasi || []);
                            handlePrintRekap(res.data.data.shift);
                          }
                        } catch {
                          handlePrintRekap(row);
                        }
                      }}
                      tooltip="Cetak Rekap Sesi"
                      tooltipOptions={{ position: 'top' }}
                    />
                  </div>
                )}
              />
            </DataTable>
          </TabPanel>

          {/* ── TAB 2: LOG MUTASI KAS ── */}
          <TabPanel header="Log Mutasi Kas" leftIcon="pi pi-list mr-2">
            {/* ACTION BUTTONS (Outline Style) */}
            <div className="flex flex-row flex-wrap align-items-center gap-2 pt-2 mb-4">
              <Button
                size="small"
                label="Refresh Mutasi"
                icon="pi pi-refresh"
                outlined
                severity="success"
                className="border-round-md font-medium px-3"
                loading={loadingMutasi}
                onClick={() => loadMutasiData(pageMutasi, rowsMutasi)}
              />
            </div>

            {/* DATA TABLE LOG MUTASI KAS */}
            <DataTable
              value={mutasiData}
              loading={loadingMutasi}
              paginator
              rows={rowsMutasi}
              totalRecords={totalMutasiRecords}
              lazy
              first={(pageMutasi - 1) * rowsMutasi}
              onPage={(e) => {
                setPageMutasi((e.page || 0) + 1);
                setRowsMutasi(e.rows || 10);
                loadMutasiData((e.page || 0) + 1, e.rows || 10);
              }}
              dataKey="id"
              className="p-datatable-sm"
              emptyMessage="Belum ada riwayat mutasi kas pada filter ini."
              responsiveLayout="scroll"
              rowsPerPageOptions={[10, 25, 50]}
              paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink CurrentPageReport RowsPerPageDropdown"
              currentPageReportTemplate="Menampilkan {first} - {last} dari {totalRecords} mutasi"
              header={
                <div className="flex flex-column gap-3">
                  <div>
                    <span className="text-xl font-bold text-900 block">Log Mutasi Kas Masuk &amp; Keluar</span>
                    <span className="text-xs text-500">
                      Catatan transaksi keluar-masuk uang kasir, penerimaan tunai pembayaran, kas operasional, dan modal awal
                    </span>
                  </div>

                  {/* Filter Bar Tab 2 */}
                  <div className="flex flex-wrap xl:flex-nowrap align-items-center justify-content-between gap-2">
                    <div className="flex flex-wrap align-items-center gap-2">
                      {/* Filter Kasir */}
                      <Dropdown
                        value={selectedKasirMutasi}
                        options={kasirOptions}
                        optionLabel="label"
                        optionValue="value"
                        valueTemplate={kasirValueTemplate}
                        itemTemplate={kasirItemTemplate}
                        onChange={(e) => {
                          const val = typeof e.value === 'object' && e.value !== null ? (e.value.value ?? '') : (e.value ?? '');
                          setSelectedKasirMutasi(val);
                        }}
                        placeholder="Semua Kasir"
                        className="p-inputtext-sm text-sm border-round-md w-full sm:w-9rem md:w-9rem"
                        showClear={Boolean(selectedKasirMutasi)}
                      />

                      {/* Filter Tipe Mutasi */}
                      <Dropdown
                        value={selectedTipeMutasi}
                        options={tipeMutasiOptions}
                        onChange={(e) => setSelectedTipeMutasi(e.value)}
                        placeholder="Tipe Mutasi"
                        className="p-inputtext-sm text-sm border-round-md w-full sm:w-8rem md:w-8.5rem"
                        showClear={Boolean(selectedTipeMutasi)}
                      />

                      {/* Filter Arus Kas */}
                      <Dropdown
                        value={selectedArusMutasi}
                        options={arusMutasiOptions}
                        onChange={(e) => setSelectedArusMutasi(e.value)}
                        placeholder="Arus Kas"
                        className="p-inputtext-sm text-sm border-round-md w-full sm:w-7rem md:w-7.5rem"
                        showClear={Boolean(selectedArusMutasi)}
                      />

                      {/* Rentang Tanggal */}
                      <div className="flex align-items-center gap-1 border-1 border-300 border-round-md px-2 py-1 surface-50 text-xs">
                        <span className="text-500 font-medium">Dari:</span>
                        <input
                          type="date"
                          value={tanggalMulaiMutasi}
                          onChange={(e) => setTanggalMulaiMutasi(e.target.value)}
                          className="border-none bg-transparent text-xs p-1 text-700 outline-none"
                          style={{ width: '7.6rem' }}
                        />
                        <span className="text-500 font-medium ml-1">Sampai:</span>
                        <input
                          type="date"
                          value={tanggalSelesaiMutasi}
                          onChange={(e) => setTanggalSelesaiMutasi(e.target.value)}
                          className="border-none bg-transparent text-xs p-1 text-700 outline-none"
                          style={{ width: '7.6rem' }}
                        />
                      </div>
                    </div>

                    {/* Search Field & Reset Filter */}
                    <div className="flex align-items-center gap-2 ml-auto w-full md:w-auto">
                      <IconField iconPosition="left" className="w-full sm:w-11rem md:w-13rem">
                        <InputIcon className="pi pi-search" />
                        <InputText
                          value={keywordMutasi}
                          onChange={(e) => setKeywordMutasi(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              loadMutasiData(1, rowsMutasi);
                            }
                          }}
                          placeholder="Cari Mutasi / Shift..."
                          className="w-full text-sm"
                        />
                      </IconField>

                      <Button
                        type="button"
                        icon="pi pi-filter"
                        size="small"
                        severity="success"
                        className="border-round-md text-xs px-2.5"
                        tooltip="Terapkan Filter"
                        tooltipOptions={{ position: 'bottom' }}
                        onClick={() => loadMutasiData(1, rowsMutasi)}
                      />

                      <Button
                        type="button"
                        icon="pi pi-filter-slash"
                        outlined
                        severity="danger"
                        className="border-round-md text-xs px-2.5"
                        tooltip="Reset Filter"
                        tooltipOptions={{ position: 'bottom' }}
                        onClick={handleResetFilterMutasi}
                      />
                    </div>
                  </div>

                  {/* Keterangan Status Legend */}
                  <KeteranganStatus
                    className="mb-2"
                    items={[
                      { label: 'Kas Masuk (+)', color: '#22c55e' },
                      { label: 'Kas Keluar (-)', color: '#ef4444' },
                      { label: 'Modal Awal', color: '#3b82f6' },
                      { label: 'Tutup Shift', color: '#8b5cf6' },
                    ]}
                  />
                </div>
              }
            >
              <Column
                header="No"
                style={{ width: '3.5rem', textAlign: 'center' }}
                body={(_, options) => (pageMutasi - 1) * rowsMutasi + options.rowIndex + 1}
              />

              <Column
                field="created_at"
                header="Waktu Mutasi"
                style={{ minWidth: '10rem' }}
                body={(m: MutasiRecord) => (
                  <span className="text-xs text-700 font-medium">{formatDatetime(m.created_at)}</span>
                )}
              />

              <Column
                field="kode_mutasi"
                header="Kode Mutasi"
                headerStyle={{ minWidth: '13.5rem', whiteSpace: 'nowrap' }}
                style={{ minWidth: '13.5rem', whiteSpace: 'nowrap' }}
                body={(m: MutasiRecord) => (
                  <span
                    className="font-mono text-xs text-teal-800 font-bold bg-teal-50 px-2 py-1 border-round border-1 border-teal-200 inline-block"
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {m.kode_mutasi}
                  </span>
                )}
              />

              <Column
                field="kode_shift"
                header="Shift Kasir"
                headerStyle={{ minWidth: '12rem', whiteSpace: 'nowrap' }}
                style={{ minWidth: '12rem', whiteSpace: 'nowrap' }}
                body={(m: MutasiRecord) => (
                  <span
                    className="font-mono text-xs text-purple-700 font-semibold cursor-pointer hover:underline inline-block"
                    style={{ whiteSpace: 'nowrap' }}
                    onClick={() => {
                      const sh = data.find((d) => d.kode_shift === m.kode_shift);
                      if (sh) handleOpenDetail(sh);
                    }}
                  >
                    {m.kode_shift}
                  </span>
                )}
              />

              <Column
                field="nama_kasir"
                header="Kasir"
                style={{ minWidth: '11rem' }}
                body={(m: MutasiRecord) => (
                  <div className="text-xs">
                    <span className="font-bold text-900">{m.nama_kasir}</span>
                    <div className="text-500 text-[10px]">{m.user_code}</div>
                  </div>
                )}
              />

              <Column
                header="Tipe &amp; Kategori"
                style={{ minWidth: '10rem' }}
                body={(m: MutasiRecord) => {
                  let tagSeverity: any = 'info';
                  if (m.tipe === 'modal_awal') tagSeverity = 'primary';
                  if (m.tipe === 'penjualan_tunai' || m.arus === 'masuk') tagSeverity = 'success';
                  if (m.tipe === 'kas_keluar' || m.arus === 'keluar') tagSeverity = 'danger';
                  if (m.tipe === 'tutup_shift') tagSeverity = 'secondary';

                  return (
                    <div>
                      <Tag
                        severity={tagSeverity}
                        value={(m.kategori || m.tipe).replace('_', ' ').toUpperCase()}
                        className="text-[10px] px-2 py-0.5"
                      />
                      {m.referensi && <div className="text-500 text-[10px] mt-0.5">Ref: {m.referensi}</div>}
                    </div>
                  );
                }}
              />

              <Column
                field="keterangan"
                header="Keterangan"
                style={{ minWidth: '14rem' }}
                body={(m: MutasiRecord) => <span className="text-xs text-700">{m.keterangan || '-'}</span>}
              />

              <Column
                field="nominal"
                header="Nominal"
                align="right"
                style={{ minWidth: '9rem' }}
                body={(m: MutasiRecord) => (
                  <span
                    className={`font-mono font-bold text-xs ${
                      m.arus === 'masuk' ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {m.arus === 'masuk' ? '+' : '-'} {formatRupiah(m.nominal)}
                  </span>
                )}
              />

              <Column
                field="saldo_setelah"
                header="Saldo Kas Laci"
                align="right"
                style={{ minWidth: '9.5rem' }}
                body={(m: MutasiRecord) => (
                  <span className="font-mono font-bold text-xs text-teal-800">
                    {formatRupiah(m.saldo_setelah)}
                  </span>
                )}
              />
            </DataTable>
          </TabPanel>
        </TabView>
      </div>

      {/* =========================================================
          MODAL DETAIL & MUTASI KAS KRONOLOGIS SESI SHIFT
          ========================================================= */}
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
              onClick={() => handlePrintRekap()}
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
                  {selectedShift.catatan_buka && (
                    <div>
                      <span className="font-semibold">Catatan Buka:</span> {selectedShift.catatan_buka}
                    </div>
                  )}
                  {selectedShift.catatan_tutup && (
                    <div className="mt-1">
                      <span className="font-semibold">Catatan Tutup:</span> {selectedShift.catatan_tutup}
                    </div>
                  )}
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
              <DataTable
                value={mutasiList}
                size="small"
                rowHover
                className="text-xs border-1 surface-border border-round-lg"
              >
                <Column header="No" style={{ width: '3rem' }} body={(_, options) => options.rowIndex + 1} />
                <Column
                  header="Waktu"
                  style={{ minWidth: '7rem' }}
                  body={(m: MutasiRecord) => formatDatetime(m.created_at)}
                />
                <Column
                  header="Tipe &amp; Kategori"
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
                    <span
                      className={`font-mono font-bold ${
                        m.arus === 'masuk' ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
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
