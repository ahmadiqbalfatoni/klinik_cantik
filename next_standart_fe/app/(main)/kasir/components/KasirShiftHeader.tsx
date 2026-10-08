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
        <div className="p-3 border-round-xl surface-card shadow-1 border-1 surface-border flex flex-wrap align-items-center justify-content-between gap-3">
          {/* Kondisi 1: Shift Belum Dibuka */}
          {!activeShift && (
            <div className="flex flex-wrap align-items-center justify-content-between w-full gap-3">
              <div className="flex align-items-center gap-3">
                <div className="w-2.5rem h-2.5rem border-round-lg bg-amber-100 flex align-items-center justify-content-center text-amber-700">
                  <i className="pi pi-calendar-times text-lg" />
                </div>
                <div>
                  <div className="font-bold text-900 text-sm flex align-items-center gap-2">
                    <span>Sesi Shift Kasir Belum Dibuka</span>
                    <Tag severity="warning" value="Shift Belum Aktif" className="text-[10px] px-2 py-0.5" />
                  </div>
                  <div className="text-500 text-xs mt-0.5">
                    Kasir: <strong>{scheduleInfo?.karyawan?.nama || session?.user?.name || 'Kasir'}</strong>. Buka sesi shift dengan modal kas awal untuk mulai bertransaksi.
                  </div>
                </div>
              </div>

              <div className="flex align-items-center gap-2 ml-auto">
                <Button
                  label="Buka Sesi Shift Kasir"
                  icon="pi pi-lock-open"
                  severity="success"
                  size="small"
                  className="border-round-md font-bold text-xs px-3 shadow-1"
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
            <div className="flex flex-wrap align-items-center justify-content-between w-full gap-3">
              <div className="flex flex-wrap align-items-center gap-3">
                {/* Badge Sesi Shift */}
                <div className="flex align-items-center gap-2 pr-3 border-right-1 surface-border">
                  <div className="w-2.5rem h-2.5rem border-round-lg bg-teal-100 flex align-items-center justify-content-center text-teal-700">
                    <i className="pi pi-wallet text-lg" />
                  </div>
                  <div>
                    <div className="font-bold text-teal-800 text-xs flex align-items-center gap-1.5">
                      <span className="w-2 h-2 border-round-circle bg-green-500 inline-block animate-pulse" />
                      <span>{activeShift.kode_shift}</span>
                      <Tag severity="success" value="Sedang Aktif" className="text-[9px] px-1.5 py-0" />
                    </div>
                    <div className="text-500 text-[11px] mt-0.5">
                      Kasir: <strong>{activeShift.nama_kasir}</strong> | Buka: {activeShift.waktu_buka ? format(new Date(activeShift.waktu_buka), 'HH:mm') : '-'} WIB
                    </div>
                  </div>
                </div>

                {/* Ringkasan Kas Cepat */}
                <div className="flex flex-wrap align-items-center gap-3 text-xs">
                  <div className="px-2 py-1 border-round-md bg-slate-50 border-1 surface-border">
                    <span className="text-500 text-[10px] block">Modal Awal:</span>
                    <strong className="text-slate-800">{formatRupiah(activeShift.modal_awal)}</strong>
                  </div>
                  <div className="px-2 py-1 border-round-md bg-green-50 border-1 border-green-200">
                    <span className="text-green-700 text-[10px] block">Tunai Masuk:</span>
                    <strong className="text-green-800">+{formatRupiah(activeShift.total_penjualan_tunai)}</strong>
                  </div>
                  {parseFloat(activeShift.total_kas_keluar || 0) > 0 && (
                    <div className="px-2 py-1 border-round-md bg-red-50 border-1 border-red-200">
                      <span className="text-red-700 text-[10px] block">Kas Keluar:</span>
                      <strong className="text-red-800">-{formatRupiah(activeShift.total_kas_keluar)}</strong>
                    </div>
                  )}
                  <div className="px-2.5 py-1 border-round-md bg-teal-50 border-1 border-teal-300">
                    <span className="text-teal-700 text-[10px] block font-medium">Kas Fisik Laci:</span>
                    <strong className="text-teal-900 text-sm font-mono">{formatRupiah(activeShift.kas_diharapkan)}</strong>
                  </div>
                </div>
              </div>

              {/* Action Buttons Sesi */}
              <div className="flex align-items-center gap-2 ml-auto">
                <Button
                  label="Catat Kas Keluar / Masuk"
                  icon="pi pi-plus-circle"
                  outlined
                  severity="secondary"
                  size="small"
                  className="border-round-md text-xs font-semibold px-2.5 py-1.5"
                  onClick={() => {
                    setMutasiTipe('kas_keluar');
                    setMutasiKategori('Pengeluaran Operasional Kasir');
                    setMutasiNominal(0);
                    setMutasiKeterangan('');
                    setShowMutasiModal(true);
                  }}
                  tooltip="Catat pengeluaran kasir (petty cash) atau penambahan modal"
                />
                <Button
                  label="Riwayat Kas"
                  icon="pi pi-history"
                  outlined
                  severity="secondary"
                  size="small"
                  className="border-round-md text-xs font-semibold px-2.5 py-1.5"
                  onClick={() => {
                    loadActiveShift();
                    setShowRiwayatModal(true);
                  }}
                />
                <Button
                  label="Tutup Shift"
                  icon="pi pi-lock"
                  severity="danger"
                  size="small"
                  className="border-round-md font-bold text-xs px-3 py-1.5 shadow-1"
                  onClick={() => {
                    setKasAktualInput(parseFloat(activeShift.kas_diharapkan || 0));
                    setCatatanTutupInput('');
                    setShowTutupModal(true);
                  }}
                  tooltip="Rekonsiliasi kas dan tutup sesi kasir di akhir hari kerja"
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
