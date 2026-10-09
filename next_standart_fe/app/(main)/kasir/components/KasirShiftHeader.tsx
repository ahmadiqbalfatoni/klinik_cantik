'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputNumber } from 'primereact/inputnumber';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Dropdown } from 'primereact/dropdown';
import { Tag } from 'primereact/tag';
import { Divider } from 'primereact/divider';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import postData from '@/lib/axios/postData';
import { showError, showSuccess } from '@/lib/tools/generalTools';
import { signOut, useSession } from 'next-auth/react';
import { format } from 'date-fns';

interface KasirShiftHeaderProps {
  toast: React.RefObject<any>;
  onShiftStateChange?: (allowed: boolean, isShiftOpen: boolean) => void;
  refreshKey?: number;
}

export function KasirShiftHeader({ toast, onShiftStateChange, refreshKey = 0 }: KasirShiftHeaderProps) {
  const { data: session } = useSession();

  // Schedule & Role State
  const [loadingSchedule, setLoadingSchedule] = useState<boolean>(true);
  const [isKasirRole, setIsKasirRole] = useState<boolean>(false);
  const [scheduleAllowed, setScheduleAllowed] = useState<boolean>(true);
  const [scheduleInfo, setScheduleInfo] = useState<any>(null);
  const [showScheduleLockModal, setShowScheduleLockModal] = useState<boolean>(false);

  // Active Shift State
  const [activeShift, setActiveShift] = useState<any>(null);
  const [loadingShift, setLoadingShift] = useState<boolean>(false);

  // Modal Dialogs
  const [showBukaModal, setShowBukaModal] = useState<boolean>(false);
  const [showMutasiModal, setShowMutasiModal] = useState<boolean>(false);
  const [showTutupModal, setShowTutupModal] = useState<boolean>(false);
  const [showRiwayatModal, setShowRiwayatModal] = useState<boolean>(false);

  // Form Buka Shift
  const [modalAwalInput, setModalAwalInput] = useState<number>(200000);
  const [catatanBukaInput, setCatatanBukaInput] = useState<string>('');
  const [submittingBuka, setSubmittingBuka] = useState<boolean>(false);

  // Form Mutasi Kas
  const [mutasiTipe, setMutasiTipe] = useState<'kas_keluar' | 'kas_masuk'>('kas_keluar');
  const [mutasiKategori, setMutasiKategori] = useState<string>('Pengeluaran Operasional Kasir');
  const [mutasiNominal, setMutasiNominal] = useState<number>(0);
  const [mutasiKeterangan, setMutasiKeterangan] = useState<string>('');
  const [submittingMutasi, setSubmittingMutasi] = useState<boolean>(false);

  // Form Tutup Shift
  const [kasAktualInput, setKasAktualInput] = useState<number>(0);
  const [catatanTutupInput, setCatatanTutupInput] = useState<string>('');
  const [submittingTutup, setSubmittingTutup] = useState<boolean>(false);

  // Riwayat Mutasi List
  const [mutasiList, setMutasiList] = useState<any[]>([]);

  // Ref untuk callback agar tidak memicu re-fetch berulang (memutus loop dependency)
  const onShiftStateChangeRef = useRef(onShiftStateChange);
  useEffect(() => {
    onShiftStateChangeRef.current = onShiftStateChange;
  }, [onShiftStateChange]);

  useEffect(() => {
    const handleTriggerOpen = () => {
      setModalAwalInput(200000);
      setCatatanBukaInput('');
      setShowBukaModal(true);
    };
    window.addEventListener('trigger-open-shift-modal', handleTriggerOpen);
    return () => window.removeEventListener('trigger-open-shift-modal', handleTriggerOpen);
  }, []);

  const formatRupiah = (val: number | string | null | undefined) => {
    const num = parseFloat(String(val || 0));
    return `Rp ${num.toLocaleString('id-ID')}`;
  };

  // 1. Cek Jadwal Kerja Kasir
  const checkSchedule = useCallback(async () => {
    setLoadingSchedule(true);
    try {
      const res = await postData('/master/kasir-shift/cek-jadwal', {});
      const data = res.data?.data;
      if (data) {
        setIsKasirRole(data.is_kasir);
        setScheduleAllowed(data.allowed);
        setScheduleInfo(data);
        setActiveShift(data.active_shift || null);

        // Jika kasir dan belum memasuki jadwal kerja, buka dialog peringatan
        if (data.is_kasir && !data.allowed) {
          setShowScheduleLockModal(true);
        } else {
          setShowScheduleLockModal(false);
        }

        onShiftStateChangeRef.current?.(data.allowed, Boolean(data.active_shift));
      }
    } catch (error) {
      console.warn('Gagal memeriksa jadwal kasir:', error);
    } finally {
      setLoadingSchedule(false);
    }
  }, []);

  // 2. Ambil Info Shift Aktif
  const loadActiveShift = useCallback(async () => {
    try {
      const res = await postData('/master/kasir-shift/active', {});
      const data = res.data?.data;
      setActiveShift(data || null);
      if (data?.mutasi) {
        setMutasiList(data.mutasi);
      }
      onShiftStateChangeRef.current?.(scheduleAllowed, Boolean(data));
    } catch (error) {
      console.warn('Gagal memuat shift aktif:', error);
    }
  }, [scheduleAllowed]);

  // Cek jadwal kerja saat mount atau refreshKey berubah
  useEffect(() => {
    checkSchedule();
  }, [refreshKey, checkSchedule]);

  // Refresh shift aktif saat refreshKey berubah (setelah mount)
  useEffect(() => {
    if (refreshKey > 0 && scheduleAllowed) {
      loadActiveShift();
    }
  }, [refreshKey, scheduleAllowed, loadActiveShift]);

  // 3. Aksi Buka Shift
  const handleBukaShift = async () => {
    setSubmittingBuka(true);
    try {
      const res = await postData('/master/kasir-shift/buka', {
        modal_awal: modalAwalInput,
        catatan_buka: catatanBukaInput.trim() || undefined,
      });
      if (['00', '0000'].includes(res?.data?.status) || res?.data?.status === '01') {
        showSuccess(toast, res?.data?.message || 'Sesi shift berhasil dibuka!');
        setShowBukaModal(false);
        loadActiveShift();
      } else {
        showError(toast, res?.data?.message || 'Gagal membuka shift');
      }
    } catch (error: any) {
      showError(toast, error?.response?.data?.message || 'Gagal membuka shift kasir');
    } finally {
      setSubmittingBuka(false);
    }
  };

  // 4. Aksi Tambah Mutasi Kas
  const handleSaveMutasi = async () => {
    if (mutasiNominal <= 0) {
      showError(toast, 'Nominal mutasi kas harus lebih dari 0');
      return;
    }
    setSubmittingMutasi(true);
    try {
      const res = await postData('/master/kasir-shift/mutasi', {
        tipe: mutasiTipe,
        kategori: mutasiKategori.trim(),
        nominal: mutasiNominal,
        keterangan: mutasiKeterangan.trim() || undefined,
      });
      if (['00', '0000'].includes(res?.data?.status) || res?.data?.status === '01') {
        showSuccess(toast, res?.data?.message || 'Pencatatan kas berhasil disimpan');
        setShowMutasiModal(false);
        setMutasiNominal(0);
        setMutasiKeterangan('');
        loadActiveShift();
      } else {
        showError(toast, res?.data?.message || 'Gagal mencatat mutasi kas');
      }
    } catch (error: any) {
      showError(toast, error?.response?.data?.message || 'Gagal mencatat mutasi kas');
    } finally {
      setSubmittingMutasi(false);
    }
  };

  // 5. Aksi Tutup Shift
  const handleTutupShift = async () => {
    setSubmittingTutup(true);
    try {
      const res = await postData('/master/kasir-shift/tutup', {
        kas_aktual: kasAktualInput,
        catatan_tutup: catatanTutupInput.trim() || undefined,
      });
      if (['00', '0000'].includes(res?.data?.status) || res?.data?.status === '01') {
        showSuccess(toast, res?.data?.message || 'Sesi shift kasir berhasil ditutup!');
        setShowTutupModal(false);
        setActiveShift(null);
        if (onShiftStateChange) {
          onShiftStateChange(scheduleAllowed, false);
        }
      } else {
        showError(toast, res?.data?.message || 'Gagal menutup sesi shift');
      }
    } catch (error: any) {
      showError(toast, error?.response?.data?.message || 'Gagal menutup sesi shift');
    } finally {
      setSubmittingTutup(false);
    }
  };

  // Hitung selisih tutup shift secara real-time
  const ekspektasiKas = activeShift ? parseFloat(activeShift.kas_diharapkan || 0) : 0;
  const selisihKas = kasAktualInput - ekspektasiKas;

  // Jika bukan kasir (misal admin/owner login ke kasir), tidak perlu blokir jadwal
  const isOutsideSchedule = isKasirRole && !scheduleAllowed;

  return (
    <div className="w-full mb-3">
      {/* ── BANNER PERINGATAN DI LUAR JAM KERJA (JIKA TERKUNCI) ── */}
      {isOutsideSchedule && (
        <div className="p-3 border-round-xl bg-red-50 border-1 border-red-300 shadow-1 flex flex-wrap align-items-center justify-content-between gap-3 mb-2 animate-fadein">
          <div className="flex align-items-center gap-3">
            <div className="w-3rem h-3rem border-round-xl bg-red-100 flex align-items-center justify-content-center text-red-600">
              <i className="pi pi-lock text-xl" />
            </div>
            <div>
              <div className="text-red-900 font-bold text-base flex align-items-center gap-2">
                <span>Akses Kasir Terkunci: Belum Memasuki Jadwal Kerja</span>
                <Tag severity="danger" value="Di Luar Jam Kerja" className="text-[10px]" />
              </div>
              <div className="text-red-700 text-xs mt-1">
                {scheduleInfo?.message || 'Saat ini belum memasuki jam kerja Anda. Fitur transaksi kasir dinonaktifkan.'}
              </div>
            </div>
          </div>
          <div className="flex align-items-center gap-2">
            <Button
              label="Cek Ulang Jadwal"
              icon="pi pi-refresh"
              size="small"
              severity="danger"
              outlined
              loading={loadingSchedule}
              onClick={checkSchedule}
              className="text-xs border-round-md font-semibold"
            />
            <Button
              label="Pemberitahuan Lengkap"
              icon="pi pi-info-circle"
              size="small"
              severity="danger"
              onClick={() => setShowScheduleLockModal(true)}
              className="text-xs border-round-md font-semibold"
            />
          </div>
        </div>
      )}

      {/* ── BAR SESI SHIFT KASIR ── */}
      {(!isKasirRole || scheduleAllowed) && (
        <div
          className="surface-card border-round-xl shadow-1 border-1 surface-border"
          style={{
            padding: '12px 18px',
            boxSizing: 'border-box',
            width: '100%',
          }}
        >
          {/* Kondisi 1: Shift Belum Dibuka */}
          {!activeShift && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                width: '100%',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    backgroundColor: '#fef3c7',
                    border: '1px solid #fde68a',
                    color: '#d97706',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <i className="pi pi-calendar-times" style={{ fontSize: '18px' }} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 800, fontSize: '14px', color: '#0f172a' }}>
                      Sesi Shift Kasir Belum Dibuka
                    </span>
                    <span
                      style={{
                        backgroundColor: '#fef3c7',
                        color: '#b45309',
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '6px',
                      }}
                    >
                      Shift Belum Aktif
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    Kasir: <strong style={{ color: '#334155' }}>{scheduleInfo?.karyawan?.nama || session?.user?.name || 'Kasir'}</strong>. Buka sesi shift dengan modal kas awal untuk mulai bertransaksi.
                  </div>
                </div>
              </div>

              <div style={{ marginLeft: 'auto' }}>
                <Button
                  label="Buka Sesi Shift Kasir"
                  icon="pi pi-lock-open"
                  severity="success"
                  size="small"
                  className="border-round-lg font-bold text-xs px-3.5 py-2 shadow-1 bg-teal-600 border-teal-600"
                  style={{ whiteSpace: 'nowrap' }}
                  onClick={() => {
                    setModalAwalInput(200000);
                    setCatatanBukaInput('');
                    setShowBukaModal(true);
                  }}
                />
              </div>
            </div>
          )}

          {/* Kondisi 2: Shift Sedang Aktif (OPEN) */}
          {activeShift && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                width: '100%',
                flexWrap: 'nowrap',
              }}
            >
              {/* 1. Identitas Sesi Shift & Kasir */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  flexShrink: 0,
                  paddingRight: '14px',
                  borderRight: '1px solid #e2e8f0',
                }}
              >
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '10px',
                    backgroundColor: '#f0fdfa',
                    border: '1px solid #ccfbf1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <i className="pi pi-wallet" style={{ fontSize: '20px', color: '#0f766e' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500, lineHeight: 1 }}>info</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 800,
                        fontSize: '15px',
                        color: '#0f766e',
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {activeShift.kode_shift}
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        backgroundColor: '#0f766e',
                        color: '#ffffff',
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 10px',
                        borderRadius: '20px',
                      }}
                    >
                      <span
                        style={{
                          width: '5px',
                          height: '5px',
                          borderRadius: '50%',
                          backgroundColor: '#ffffff',
                          display: 'inline-block',
                        }}
                      />
                      Sedang Aktif
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '11px',
                      color: '#64748b',
                    }}
                  >
                    <span>
                      Kasir: <strong style={{ color: '#1e293b' }}>{activeShift.nama_kasir}</strong>
                    </span>
                    <span style={{ color: '#cbd5e1' }}>•</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' }}>
                      <i className="pi pi-clock" style={{ fontSize: '10px', color: '#94a3b8' }} />
                      Buka: <strong style={{ color: '#334155' }}>{activeShift.waktu_buka ? format(new Date(activeShift.waktu_buka), 'HH:mm') : '-'} WIB</strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Ringkasan Kas Cepat (Widget Terpadu Baru seperti Gambar 2) */}
              <div
                style={{
                  padding: '7px 14px',
                  borderRadius: '10px',
                  backgroundColor: '#f0fdfa',
                  border: '1px solid #ccfbf1',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  flexShrink: 0,
                }}
              >
                {/* Slim progress bar di bagian atas */}
                <div style={{ width: '100%', height: '4px', backgroundColor: '#ccfbf1', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: '60%',
                      height: '100%',
                      backgroundColor: '#0d9488',
                      borderRadius: '4px',
                    }}
                  />
                </div>

                {/* Konten Widget: Donut mini + Kas Fisik Laci + Tunai Masuk */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  {/* Donut Chart Mini */}
                  <svg width="34" height="34" viewBox="0 0 36 36" style={{ flexShrink: 0 }}>
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#e2e8f0" strokeWidth="4.5" />
                    <circle
                      cx="18" cy="18" r="14" fill="none"
                      stroke="#0d9488" strokeWidth="4.5"
                      strokeDasharray="65 100"
                      strokeDashoffset="25"
                      strokeLinecap="round"
                    />
                    <circle
                      cx="18" cy="18" r="14" fill="none"
                      stroke="#86efac" strokeWidth="4.5"
                      strokeDasharray="25 100"
                      strokeDashoffset="90"
                      strokeLinecap="round"
                    />
                  </svg>

                  {/* Kolom Kas Fisik Laci */}
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#0d9488', display: 'inline-block' }} />
                      <span style={{ fontSize: '10px', fontWeight: 800, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Kas Fisik Laci
                      </span>
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 900, fontFamily: 'monospace', color: '#0f172a', lineHeight: 1.2 }}>
                      {formatRupiah(activeShift.kas_diharapkan)}
                    </span>
                    <span style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginTop: '2px' }}>
                      Modal Awal: <strong style={{ color: '#475569' }}>{formatRupiah(activeShift.modal_awal)}</strong>
                    </span>
                  </div>

                  {/* Kolom Tunai Masuk */}
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#16a34a', display: 'inline-block' }} />
                      <span style={{ fontSize: '10px', fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Tunai Masuk
                      </span>
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 900, fontFamily: 'monospace', color: '#16a34a', lineHeight: 1.2 }}>
                      +{formatRupiah(activeShift.total_penjualan_tunai)}
                    </span>
                    <span style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginTop: '2px' }}>
                      Tunai Masuk: <strong style={{ color: '#16a34a' }}>+{formatRupiah(activeShift.total_penjualan_tunai)}</strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. Action Buttons Sesi */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginLeft: 'auto',
                  flexShrink: 0,
                }}
              >
                <Button
                  label="Catat Kas"
                  icon="pi pi-plus-circle"
                  outlined
                  severity="secondary"
                  size="small"
                  className="border-round-lg text-xs font-bold px-3 py-2 text-700 hover:text-900 border-300"
                  style={{ whiteSpace: 'nowrap' }}
                  onClick={() => {
                    setMutasiTipe('kas_keluar');
                    setMutasiKategori('Pengeluaran Operasional Kasir');
                    setMutasiNominal(0);
                    setMutasiKeterangan('');
                    setShowMutasiModal(true);
                  }}
                  tooltip="Catat pengeluaran kasir (petty cash) atau penambahan modal"
                  tooltipOptions={{ position: 'bottom' }}
                />
                <Button
                  label="Riwayat Kas"
                  icon="pi pi-history"
                  outlined
                  severity="secondary"
                  size="small"
                  className="border-round-lg text-xs font-bold px-3 py-2 text-700 hover:text-900 border-300"
                  style={{ whiteSpace: 'nowrap' }}
                  onClick={() => {
                    loadActiveShift();
                    setShowRiwayatModal(true);
                  }}
                  tooltip="Lihat riwayat mutasi kas sesi ini"
                  tooltipOptions={{ position: 'bottom' }}
                />
                <Button
                  label="Tutup Shift"
                  icon="pi pi-lock"
                  severity="danger"
                  size="small"
                  className="border-round-lg font-bold text-xs px-3.5 py-2 shadow-1 bg-red-600 border-red-600 hover:bg-red-700"
                  style={{ whiteSpace: 'nowrap' }}
                  onClick={() => {
                    setKasAktualInput(parseFloat(activeShift.kas_diharapkan || 0));
                    setCatatanTutupInput('');
                    setShowTutupModal(true);
                  }}
                  tooltip="Rekonsiliasi kas dan tutup sesi kasir di akhir hari kerja"
                  tooltipOptions={{ position: 'bottom' }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* 1. DIALOG PEMBERITAHUAN JADWAL KASIR TERKUNCI                  */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog
        header={
          <div className="flex align-items-center gap-2 text-red-600">
            <i className="pi pi-clock text-2xl" />
            <span className="font-bold text-lg text-900">Belum Memasuki Jadwal Kerja Kasir</span>
          </div>
        }
        visible={showScheduleLockModal}
        style={{ width: '520px', maxWidth: '95vw' }}
        modal
        closable={false}
        onHide={() => setShowScheduleLockModal(false)}
        footer={
          <div className="flex align-items-center justify-content-between w-full">
            <Button
              label="Keluar / Logout"
              icon="pi pi-power-off"
              outlined
              severity="secondary"
              size="small"
              onClick={() => signOut()}
              className="text-xs border-round-md font-semibold"
            />
            <Button
              label="Cek Ulang Status Jadwal"
              icon="pi pi-refresh"
              severity="danger"
              size="small"
              loading={loadingSchedule}
              onClick={checkSchedule}
              className="text-xs border-round-md font-bold px-3 shadow-1"
            />
          </div>
        }
      >
        <div className="pt-2">
          <div className="p-3 border-round-xl bg-red-50 border-1 border-red-200 mb-3">
            <div className="flex align-items-center justify-content-between text-xs mb-2">
              <span className="text-500">Nama Kasir:</span>
              <strong className="text-900 font-bold">{scheduleInfo?.karyawan?.nama || session?.user?.name || '-'}</strong>
            </div>
            <div className="flex align-items-center justify-content-between text-xs mb-2">
              <span className="text-500">Waktu Saat Ini:</span>
              <span className="text-red-700 font-mono font-bold">
                {scheduleInfo?.current_day?.toUpperCase()}, {scheduleInfo?.current_time} WIB
              </span>
            </div>
            <div className="flex align-items-center justify-content-between text-xs">
              <span className="text-500">Status Akses:</span>
              <Tag severity="danger" value="Fitur Kasir Terkunci" className="text-[10px] px-2 py-0.5 font-bold" />
            </div>
          </div>

          <div className="text-xs text-700 line-height-3 mb-3">
            <p className="font-semibold text-900 mb-1">
              ⚠️ {scheduleInfo?.message || 'Saat ini belum memasuki jam kerja Anda.'}
            </p>
            <p className="m-0 text-500">
              Sesuai dengan ketentuan operasional klinik, modul transaksi pembayaran, pemilihan layanan/produk, dan input kas kasir belum dapat diakses sampai Anda mulai memasuki jadwal kerja shift Anda.
            </p>
          </div>

          {scheduleInfo?.jadwal_hari_ini && scheduleInfo.jadwal_hari_ini.length > 0 && (
            <div className="p-3 border-round-xl surface-50 border-1 surface-border text-xs mb-2">
              <span className="text-500 block mb-1 font-medium">Jadwal Shift Anda Hari Ini:</span>
              {scheduleInfo.jadwal_hari_ini.map((j: any, idx: number) => (
                <div key={idx} className="flex align-items-center justify-content-between font-semibold text-teal-800">
                  <span>Shift {idx + 1}:</span>
                  <span className="font-mono">{(j.jam_mulai || '').slice(0, 5)} - {(j.jam_selesai || '').slice(0, 5)} WIB</span>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-400 italic m-0">
            * Jika jadwal Anda berubah atau perlu penyesuaian, silakan hubungi Manajer Cabang untuk memperbarui jadwal kerja Anda di master jadwal karyawan.
          </p>
        </div>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* 2. DIALOG BUKA SHIFT KASIR                                    */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog
        header={
          <div className="flex align-items-center gap-2">
            <i className="pi pi-lock-open text-teal-600 text-xl" />
            <span className="font-bold text-lg text-900">Buka Sesi Shift Kasir</span>
          </div>
        }
        visible={showBukaModal}
        style={{ width: '450px' }}
        modal
        onHide={() => setShowBukaModal(false)}
        footer={
          <div className="flex align-items-center justify-content-end gap-2">
            <Button label="Batal" outlined severity="secondary" size="small" onClick={() => setShowBukaModal(false)} />
            <Button
              label="Mulai Shift Kasir"
              icon="pi pi-check"
              severity="success"
              size="small"
              loading={submittingBuka}
              onClick={handleBukaShift}
              className="font-bold text-xs px-3 border-round-md"
            />
          </div>
        }
      >
        <div className="p-fluid flex flex-column gap-3 pt-2 text-xs">
          <div className="p-3 border-round-lg bg-teal-50 border-1 border-teal-200">
            <span className="text-teal-800 font-semibold block mb-1">Kasir: {scheduleInfo?.karyawan?.nama || session?.user?.name}</span>
            <span className="text-teal-600 text-xs">Waktu Mulai: {format(new Date(), 'dd MMMM yyyy HH:mm:ss')}</span>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">
              Kas Modal Awal (Float di Laci) <span className="text-red-500">*</span>
            </label>
            <InputNumber
              value={modalAwalInput}
              onValueChange={(e) => setModalAwalInput(e.value || 0)}
              mode="currency"
              currency="IDR"
              locale="id-ID"
              className="w-full text-base font-bold font-mono"
              placeholder="Rp 0"
            />
            <small className="text-500 block mt-1">Uang kembalian yang disiapkan di laci saat mulai buka kasir.</small>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Catatan Pembukaan (Opsional)</label>
            <InputTextarea
              value={catatanBukaInput}
              onChange={(e) => setCatatanBukaInput(e.target.value)}
              rows={2}
              placeholder="Contoh: Pecahan 50rb 2 lembar, 20rb 5 lembar..."
              className="text-xs"
            />
          </div>
        </div>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* 3. DIALOG CATAT KAS KELUAR / KAS MASUK                         */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog
        header={
          <div className="flex align-items-center gap-2">
            <i className="pi pi-money-bill text-teal-600 text-xl" />
            <span className="font-bold text-lg text-900">Pencatatan Kas Kasir (Petty Cash)</span>
          </div>
        }
        visible={showMutasiModal}
        style={{ width: '480px' }}
        modal
        onHide={() => setShowMutasiModal(false)}
        footer={
          <div className="flex align-items-center justify-content-end gap-2">
            <Button label="Batal" outlined severity="secondary" size="small" onClick={() => setShowMutasiModal(false)} />
            <Button
              label="Simpan Pencatatan Kas"
              icon="pi pi-check"
              severity={mutasiTipe === 'kas_keluar' ? 'danger' : 'success'}
              size="small"
              loading={submittingMutasi}
              onClick={handleSaveMutasi}
              className="font-bold text-xs px-3 border-round-md"
            />
          </div>
        }
      >
        <div className="p-fluid flex flex-column gap-3 pt-2 text-xs">
          <div>
            <label className="block text-sm font-semibold mb-1">Jenis Aliran Kas</label>
            <div className="grid formgrid">
              <div className="col-6">
                <Button
                  type="button"
                  label="📤 Kas Keluar (Pengeluaran)"
                  severity={mutasiTipe === 'kas_keluar' ? 'danger' : 'secondary'}
                  outlined={mutasiTipe !== 'kas_keluar'}
                  size="small"
                  className="w-full text-xs font-bold"
                  onClick={() => {
                    setMutasiTipe('kas_keluar');
                    setMutasiKategori('Pengeluaran Operasional Kasir');
                  }}
                />
              </div>
              <div className="col-6">
                <Button
                  type="button"
                  label="📥 Kas Masuk (Tambahan)"
                  severity={mutasiTipe === 'kas_masuk' ? 'success' : 'secondary'}
                  outlined={mutasiTipe !== 'kas_masuk'}
                  size="small"
                  className="w-full text-xs font-bold"
                  onClick={() => {
                    setMutasiTipe('kas_masuk');
                    setMutasiKategori('Kas Masuk Tambahan Modal');
                  }}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">
              Nominal Uang <span className="text-red-500">*</span>
            </label>
            <InputNumber
              value={mutasiNominal}
              onValueChange={(e) => setMutasiNominal(e.value || 0)}
              mode="currency"
              currency="IDR"
              locale="id-ID"
              className="w-full text-base font-bold font-mono"
              placeholder="Rp 0"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Kategori / Keperluan</label>
            <InputText
              value={mutasiKategori}
              onChange={(e) => setMutasiKategori(e.target.value)}
              placeholder="Misal: Beli Galon Air, Pembelian ATK, Tambah Modal Kas"
              className="text-xs"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Keterangan / Rincian</label>
            <InputTextarea
              value={mutasiKeterangan}
              onChange={(e) => setMutasiKeterangan(e.target.value)}
              rows={2}
              placeholder="Keterangan tambahan untuk catatan pembukuan..."
              className="text-xs"
            />
          </div>
        </div>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* 4. DIALOG TUTUP SHIFT KASIR (CLOSING & REKONSILIASI)          */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog
        header={
          <div className="flex align-items-center gap-2 text-slate-800">
            <i className="pi pi-lock text-red-600 text-xl" />
            <span className="font-bold text-lg">Tutup Sesi Shift &amp; Rekonsiliasi Kas</span>
          </div>
        }
        visible={showTutupModal}
        style={{ width: '500px' }}
        modal
        onHide={() => setShowTutupModal(false)}
        footer={
          <div className="flex align-items-center justify-content-end gap-2">
            <Button label="Batal" outlined severity="secondary" size="small" onClick={() => setShowTutupModal(false)} />
            <Button
              label="Konfirmasi &amp; Tutup Shift"
              icon="pi pi-check"
              severity="danger"
              size="small"
              loading={submittingTutup}
              onClick={handleTutupShift}
              className="font-bold text-xs px-3 border-round-md shadow-1"
            />
          </div>
        }
      >
        <div className="p-fluid flex flex-column gap-3 pt-2 text-xs">
          {activeShift && (
            <div className="p-3 border-round-xl surface-50 border-1 surface-border">
              <div className="font-bold text-900 text-sm mb-2">Ringkasan Sesi {activeShift.kode_shift}:</div>
              <div className="grid">
                <div className="col-6">
                  <div className="text-500">Modal Awal:</div>
                  <strong className="text-slate-800">{formatRupiah(activeShift.modal_awal)}</strong>
                </div>
                <div className="col-6">
                  <div className="text-500">Penjualan Tunai:</div>
                  <strong className="text-green-700">+{formatRupiah(activeShift.total_penjualan_tunai)}</strong>
                </div>
                <div className="col-6 mt-1">
                  <div className="text-500">Kas Keluar:</div>
                  <strong className="text-red-600">-{formatRupiah(activeShift.total_kas_keluar)}</strong>
                </div>
                <div className="col-6 mt-1">
                  <div className="text-500">Kas Masuk Lain:</div>
                  <strong className="text-green-600">+{formatRupiah(activeShift.total_kas_masuk_lain)}</strong>
                </div>
              </div>
              <Divider className="my-2" />
              <div className="flex align-items-center justify-content-between">
                <span className="font-semibold text-teal-800">Ekspektasi Kas Laci (Seharusnya):</span>
                <span className="font-bold font-mono text-base text-teal-900">{formatRupiah(ekspektasiKas)}</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold mb-1">
              Kas Aktual Fisik di Laci <span className="text-red-500">*</span>
            </label>
            <InputNumber
              value={kasAktualInput}
              onValueChange={(e) => setKasAktualInput(e.value || 0)}
              mode="currency"
              currency="IDR"
              locale="id-ID"
              className="w-full text-base font-bold font-mono"
              placeholder="Rp 0"
            />
            <small className="text-500 block mt-1">Hitung uang fisik yang ada di laci kasir saat ini.</small>
          </div>

          {/* Status Rekonsiliasi Real-time */}
          <div
            className={`p-3 border-round-lg border-1 flex align-items-center justify-content-between ${
              selisihKas === 0
                ? 'bg-green-50 border-green-200 text-green-900'
                : selisihKas > 0
                ? 'bg-blue-50 border-blue-200 text-blue-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <div>
              <span className="font-semibold block text-xs">Selisih Kas:</span>
              <span className="text-[11px] opacity-80">
                {selisihKas === 0
                  ? 'Jumlah kas fisik pas dengan hitungan sistem.'
                  : selisihKas > 0
                  ? 'Kas fisik lebih besar dari ekspektasi sistem.'
                  : 'Kas fisik kurang dari ekspektasi sistem.'}
              </span>
            </div>
            <strong className="font-mono text-base font-bold">
              {selisihKas === 0 ? 'Rp 0 (Pas)' : selisihKas > 0 ? `+${formatRupiah(selisihKas)}` : formatRupiah(selisihKas)}
            </strong>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Catatan Penutupan Shift</label>
            <InputTextarea
              value={catatanTutupInput}
              onChange={(e) => setCatatanTutupInput(e.target.value)}
              rows={2}
              placeholder="Catatan kendala, keterangan selisih, atau serah terima kasir..."
              className="text-xs"
            />
          </div>
        </div>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* 5. DIALOG RIWAYAT MUTASI KAS SESI AKTIF                       */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog
        header={
          <div className="flex align-items-center gap-2">
            <i className="pi pi-history text-teal-600 text-xl" />
            <span className="font-bold text-lg text-900">
              Riwayat Mutasi Kas Sesi Ini ({activeShift?.kode_shift})
            </span>
          </div>
        }
        visible={showRiwayatModal}
        style={{ width: '700px', maxWidth: '95vw' }}
        modal
        onHide={() => setShowRiwayatModal(false)}
      >
        <div className="pt-2 text-xs">
          {mutasiList.length === 0 ? (
            <div className="text-center p-4 text-500 surface-50 border-round-lg">
              Belum ada mutasi kas selain modal awal pada sesi ini
            </div>
          ) : (
            <DataTable value={mutasiList} size="small" rowHover className="text-xs border-1 surface-border border-round-lg">
              <Column header="No" style={{ width: '3rem' }} body={(_, options) => options.rowIndex + 1} />
              <Column
                header="Waktu"
                style={{ minWidth: '7rem' }}
                body={(m) => (m.created_at ? format(new Date(m.created_at), 'HH:mm:ss') : '-')}
              />
              <Column
                header="Kategori / Tipe"
                style={{ minWidth: '10rem' }}
                body={(m) => (
                  <div>
                    <span className="font-bold text-900">{(m.kategori || m.tipe).toUpperCase()}</span>
                    {m.referensi && <div className="text-500 text-[10px]">Ref: {m.referensi}</div>}
                  </div>
                )}
              />
              <Column header="Keterangan" field="keterangan" style={{ minWidth: '11rem' }} />
              <Column
                header="Nominal"
                align="right"
                style={{ minWidth: '8rem' }}
                body={(m) => (
                  <span className={`font-mono font-bold ${m.arus === 'masuk' ? 'text-green-600' : 'text-red-600'}`}>
                    {m.arus === 'masuk' ? '+' : '-'} {formatRupiah(m.nominal)}
                  </span>
                )}
              />
              <Column
                header="Saldo Kas"
                align="right"
                style={{ minWidth: '8rem' }}
                body={(m) => <strong className="font-mono text-teal-800">{formatRupiah(m.saldo_setelah)}</strong>}
              />
            </DataTable>
          )}
        </div>
      </Dialog>
    </div>
  );
}
