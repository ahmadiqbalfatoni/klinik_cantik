'use client';

import React, { useState, useEffect } from 'react';
import { Button } from 'primereact/button';
import { Checkbox } from 'primereact/checkbox';
import { TabView, TabPanel } from 'primereact/tabview';
import { Tag } from 'primereact/tag';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Toast } from 'primereact/toast';
import { Dialog } from 'primereact/dialog';
import postData from '@/lib/axios/postData';
import { showError, showSuccess, showWarning } from '@/lib/tools/generalTools';
import { confirmDialog, ConfirmDialog } from 'primereact/confirmdialog';
import { apiPasienLayananOptions, apiPasienAmbilAntrianLayanan, apiPasienKepemilikanPaket } from './endpoints';
import {
  LayananCard,
  ServiceItem,
  RuanganGroup,
  getItemConsultType,
} from '@/app/(main)/pendaftaran-antrean/components/shared/LayananCard';
import { DialogSemuaBookingRuangan } from './DialogSemuaBookingRuangan';

interface PasienInfo {
  no_rm: string;
  nama: string;
  nik?: string;
  no_hp?: string;
}

interface Props {
  pasienData: PasienInfo;
  toast: React.RefObject<Toast>;
  onSuccess: (resultData: any) => void;
  onBack: () => void;
}

export const StepPilihLayanan: React.FC<Props> = ({
  pasienData,
  toast,
  onSuccess,
  onBack,
}) => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [ruangans, setRuangans] = useState<RuanganGroup[]>([]);
  const [ownedPackages, setOwnedPackages] = useState<any[]>([]);
  const [todayInfo, setTodayInfo] = useState<{
    tanggal?: string;
    hari?: string;
    total_ruangan_aktif?: number;
    ruangan_dengan_petugas_count?: number;
    has_petugas_konsul_today?: boolean;
  } | null>(null);

  // Map item yang dipilih: key = `${jenis}_${kode_layanan}`
  const [selectedMap, setSelectedMap] = useState<{ [key: string]: ServiceItem }>({});
  // Map pilihan konsul khusus untuk item Opsional Konsul (BEAUTY TREATMENT): true = Ya (Ke Ruang Konsul), false = Tidak (Langsung Treatment)
  const [consultChoiceMap, setConsultChoiceMap] = useState<{ [key: string]: boolean }>({});
  // Kode ruangan yang sedang aktif dipilih (null = belum ada yang dipilih)
  const [activeRuangan, setActiveRuangan] = useState<string | null>(null);
  // Dialog konfirmasi terbitkan antrean (dengan pilihan konsultasi terintegrasi)
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitConsultChoices, setSubmitConsultChoices] = useState<{ [key: string]: boolean }>({});
  const [showRejectBookingDialog, setShowRejectBookingDialog] = useState(false);
  const [rejectBookingData, setRejectBookingData] = useState<any>(null);
  const [showWarningBookingDialog, setShowWarningBookingDialog] = useState(false);
  const [warningBookingData, setWarningBookingData] = useState<any>(null);

  // Dialog Semua Jadwal Booking Hari Ini
  const [selectedRuanganForBookings, setSelectedRuanganForBookings] = useState<RuanganGroup | null>(null);
  const [dialogAllBookingsVisible, setDialogAllBookingsVisible] = useState(false);

  const handleOpenAllBookingsDialog = (ruang: RuanganGroup) => {
    setSelectedRuanganForBookings(ruang);
    setDialogAllBookingsVisible(true);
  };

  const [activeTabIndex, setActiveTabIndex] = useState<number>(0);

  useEffect(() => {
    fetchAllData();
  }, [pasienData?.no_rm]);

  const fetchAllData = async () => {
    setLoading(true);
    setActiveTabIndex(0);
    try {
      const promises: Promise<any>[] = [postData(apiPasienLayananOptions)];
      if (pasienData?.no_rm) {
        promises.push(postData(apiPasienKepemilikanPaket, { no_rm: pasienData.no_rm }));
      }

      const [resOptions, resPackages] = await Promise.all(promises);

      if (['00', '0000'].includes(resOptions?.data?.status)) {
        setRuangans(resOptions.data.data.ruangan_layanan || resOptions.data.data.kategori_layanan || []);
        if (resOptions.data.data.today_info) {
          setTodayInfo(resOptions.data.data.today_info);
        }
      } else {
        showError(toast, resOptions?.data?.message || 'Gagal memuat pilihan layanan');
      }

      if (resPackages && ['00', '0000'].includes(resPackages?.data?.status)) {
        setOwnedPackages(resPackages.data.data || []);
      } else {
        setOwnedPackages([]);
      }
    } catch (error: any) {
      showError(toast, 'Terjadi kesalahan saat memuat daftar layanan');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleItem = (item: ServiceItem) => {
    const currentRoom = ruangans.find((r) => r.kode_ruangan === item.kode_ruangan);
    const isCapacityLocked = item.status_kapasitas === 'berisiko' || currentRoom?.status_kapasitas === 'berisiko';
    if (isCapacityLocked) {
      showWarning(
        toast,
        item.keterangan_status ||
          currentRoom?.keterangan_status ||
          `Ruangan "${item.nama_ruangan || currentRoom?.nama_ruangan || 'tujuan'}" sedang dikunci karena kapasitas penuh / ada booking yang sedang ditunggu kehadirannya.`
      );
      return;
    }

    if (item.is_petugas_available === false) {
      showError(
        toast,
        item.alasan_tidak_tersedia ||
          `Layanan "${item.nama}" tidak dapat dipilih karena ruangan tidak memiliki jadwal dokter/petugas jaga aktif hari ini.`
      );
      return;
    }

    const key = `${item.jenis}_${item.kode_layanan}`;
    const isCurrentlySelected = !!selectedMap[key];

    if (isCurrentlySelected) {
      const newMap = { ...selectedMap };
      delete newMap[key];
      setSelectedMap(newMap);
      const remainingItems = Object.values(newMap);
      if (remainingItems.length === 0) setActiveRuangan(null);
    } else {
      if (activeRuangan !== null && activeRuangan !== item.kode_ruangan) {
        const currentSelectedRoom = Object.values(selectedMap)[0]?.nama_ruangan || activeRuangan;
        showError(
          toast,
          `Anda hanya dapat memilih layanan/paket dalam 1 ruangan yang sama per antrean kunjungan. Saat ini ruangan yang dipilih: ${currentSelectedRoom}. Batalkan pilihan sebelumnya jika ingin berganti ruangan.`
        );
        return;
      }
      setSelectedMap((prev) => ({ ...prev, [key]: item }));
      setActiveRuangan(item.kode_ruangan || null);
    }
  };

  const handleClearSelection = () => {
    setSelectedMap({});
    setActiveRuangan(null);
    setConsultChoiceMap({});
  };

  const selectedList = Object.values(selectedMap);
  const totalHarga = selectedList.reduce((acc, curr) => acc + (curr.jenis === 'klaim_paket' ? 0 : (curr.harga || 0)), 0);
  const totalDurasi = selectedList.reduce((acc, curr) => acc + (curr.durasi_menit || 0), 0);

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(val);
  };

  const handleProcessSubmit = async (customItems?: ServiceItem[]) => {
    const itemsToSubmit = customItems !== undefined ? customItems : selectedList;

    setSubmitting(true);
    try {
      const itemsPayload = itemsToSubmit.map((item) => {
        const key = `${item.jenis}_${item.kode_layanan}`;
        const { isWajib, isService } = getItemConsultType(item);

        let chooseConsult = false;
        if (isWajib) {
          chooseConsult = true;
        } else if (isService) {
          chooseConsult = false;
        } else {
          chooseConsult = consultChoiceMap[key] !== false;
        }

        return {
          jenis_layanan: item.jenis,
          kode_layanan: item.kode_layanan,
          kode_ruangan: item.kode_ruangan,
          nama_ruangan: item.nama_ruangan,
          butuh_konsul: chooseConsult,
          wajib_konsultasi: item.wajib_konsultasi || (isWajib ? 'wajib' : isService ? 'tidak' : 'opsional'),
          lewat_konsultasi: chooseConsult,
          kode_kepemilikan_paket_layanan: item.kode_kepemilikan_paket_layanan,
        };
      });

      const res = await postData(apiPasienAmbilAntrianLayanan, {
        no_rm: pasienData.no_rm,
        items: itemsPayload,
      });

      if (['00', '0000'].includes(res.data.status)) {
        showSuccess(toast, res.data.message || 'Pendaftaran kunjungan & antrean berhasil diterbitkan');
        onSuccess(res.data.data);
      } else {
        showError(toast, res.data.message || 'Gagal memproses pendaftaran kunjungan');
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Terjadi kesalahan sistem';
      showError(toast, msg);
    } finally {
      setSubmitting(false);
    }
  };

  const openSubmitModal = (customItems?: ServiceItem[]) => {
    const itemsToConfirm = customItems !== undefined ? customItems : selectedList;
    if (itemsToConfirm.length === 0) {
      showError(toast, 'Silakan pilih minimal satu layanan atau paket terlebih dahulu!');
      return;
    }

    // Pastikan tidak ada item yang ruangannya tanpa petugas aktif hari ini
    const unavailableItem = itemsToConfirm.find((it) => it.is_petugas_available === false);
    if (unavailableItem) {
      showError(
        toast,
        unavailableItem.alasan_tidak_tersedia ||
          `Layanan "${unavailableItem.nama}" tidak dapat diproses karena tidak ada jadwal petugas jaga aktif hari ini.`
      );
      return;
    }

    // Inisialisasi pilihan konsultasi default untuk item opsional
    const defaultChoices: { [key: string]: boolean } = {};
    itemsToConfirm.forEach((it) => {
      const key = `${it.jenis}_${it.kode_layanan}`;
      const { isOpsional } = getItemConsultType(it);
      if (isOpsional) {
        // Jika dokter konsul tidak bertugas hari ini, alihkan default ke tindakan langsung
        const canConsult = todayInfo?.has_petugas_konsul_today !== false;
        if (!canConsult) {
          defaultChoices[key] = false;
        } else {
          defaultChoices[key] = consultChoiceMap[key] !== undefined ? consultChoiceMap[key] : true;
        }
      }
    });
    setSubmitConsultChoices(defaultChoices);
    setShowSubmitModal(true);
  };

  const handleSubmitFromModal = async (isOverride: boolean = false) => {
    // Validasi ulang ketersediaan petugas
    const unavailableItem = selectedList.find((it) => it.is_petugas_available === false);
    if (unavailableItem) {
      showError(
        toast,
        unavailableItem.alasan_tidak_tersedia ||
          `Layanan "${unavailableItem.nama}" tidak dapat diproses karena tidak ada jadwal petugas jaga aktif hari ini.`
      );
      return;
    }

    // Simpan pilihan ke consultChoiceMap lalu submit
    setConsultChoiceMap((prev) => ({ ...prev, ...submitConsultChoices }));
    setShowSubmitModal(false);
    // Buat payload dengan submitConsultChoices
    setSubmitting(true);
    try {
      const itemsPayload = selectedList.map((item) => {
        const key = `${item.jenis}_${item.kode_layanan}`;
        const { isWajib, isService, isOpsional } = getItemConsultType(item);
        let chooseConsult = false;
        if (isWajib) chooseConsult = true;
        else if (isService) chooseConsult = false;
        else if (isOpsional) chooseConsult = submitConsultChoices[key] !== false;
        return {
          jenis_layanan: item.jenis,
          kode_layanan: item.kode_layanan,
          kode_ruangan: item.kode_ruangan,
          nama_ruangan: item.nama_ruangan,
          butuh_konsul: chooseConsult,
          wajib_konsultasi: item.wajib_konsultasi || (isWajib ? 'wajib' : isService ? 'tidak' : 'opsional'),
          lewat_konsultasi: chooseConsult,
          kode_kepemilikan_paket_layanan: item.kode_kepemilikan_paket_layanan,
        };
      });
      const res = await postData(apiPasienAmbilAntrianLayanan, {
        no_rm: pasienData.no_rm,
        items: itemsPayload,
        override_peringatan_booking: isOverride,
      });

      // 1. Cek apakah ada penolakan keras (Hard Reject) karena penumpukan antrean walk-in melampaui slot booking
      if (res.data?.status === 'REJECTED_BOOKING_COLLISION' || res.data?.ditolak === true) {
        setRejectBookingData(res.data?.data_penolakan || {});
        setShowRejectBookingDialog(true);
        setShowWarningBookingDialog(false);
        return;
      }

      // 2. Cek apakah ada peringatan benturan booking (Soft Warning Walk-In Tunggal)
      if (res.data?.status === 'WARN_BOOKING_COLLISION' || res.data?.peringatan === true) {
        setWarningBookingData(res.data?.data_peringatan || {});
        setShowWarningBookingDialog(true);
        return;
      }

      if (['00', '0000', 200].includes(res.data.status)) {
        showSuccess(toast, res.data.message || 'Pendaftaran kunjungan & antrean berhasil diterbitkan');
        setShowRejectBookingDialog(false);
        setRejectBookingData(null);
        setShowWarningBookingDialog(false);
        setWarningBookingData(null);
        onSuccess(res.data.data);
      } else {
        showError(toast, res.data.message || 'Gagal memproses pendaftaran kunjungan');
      }
    } catch (error: any) {
      showError(toast, error?.response?.data?.message || 'Terjadi kesalahan sistem');
    } finally {
      setSubmitting(false);
    }
  };


  const renderItemCard = (item: ServiceItem) => {
    const key = `${item.jenis}_${item.kode_layanan}`;
    const isSelected = !!selectedMap[key];
    const currentRoom = ruangans.find((r) => r.kode_ruangan === item.kode_ruangan);
    const isCapacityLocked = item.status_kapasitas === 'berisiko' || currentRoom?.status_kapasitas === 'berisiko';
    const isDisabled =
      (activeRuangan !== null && activeRuangan !== item.kode_ruangan) ||
      item.is_petugas_available === false ||
      isCapacityLocked;

    const itemWithRoomStatus: ServiceItem = {
      ...item,
      status_kapasitas: item.status_kapasitas || currentRoom?.status_kapasitas,
      keterangan_status: item.keterangan_status || currentRoom?.keterangan_status,
      jam_booking_terdekat: item.jam_booking_terdekat || currentRoom?.jam_booking_terdekat,
      nama_pasien_booking_terdekat: item.nama_pasien_booking_terdekat || currentRoom?.nama_pasien_booking_terdekat,
    };

    const isRuanganKonsultasi = Boolean(
      currentRoom?.is_konsultasi === 1 ||
      currentRoom?.nama_ruangan?.toLowerCase().includes('konsultasi')
    );

    return (
      <LayananCard
        key={key}
        item={itemWithRoomStatus}
        isSelected={isSelected}
        isDisabled={isDisabled}
        isRuanganKonsultasi={isRuanganKonsultasi}
        onToggle={handleToggleItem}
        formatPrice={formatRupiah}
      />
    );
  };

  return (
    <div className="grid">
      <ConfirmDialog />

      {/* ===== DIALOG KONFIRMASI TERBITKAN ANTREAN (dengan pilihan konsultasi terintegrasi) ===== */}
      <Dialog
        visible={showSubmitModal}
        onHide={() => setShowSubmitModal(false)}
        header={
          <div className="flex align-items-center gap-3 py-1">
            <div
              className="flex align-items-center justify-content-center border-round-xl text-white shadow-1"
              style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' }}
            >
              <i className="pi pi-send text-xl" />
            </div>
            <div>
              <h4 className="font-bold text-lg text-900 m-0">Konfirmasi Terbitkan Antrean Kunjungan</h4>
              <p className="text-xs text-500 m-0 mt-1">Verifikasi rincian layanan dan alur kunjungan pasien</p>
            </div>
          </div>
        }
        modal
        style={{ width: '100%', maxWidth: '560px' }}
        className="p-fluid"
        footer={
          <div className="flex align-items-center justify-content-between pt-2">
            <Button
              label="Batal"
              icon="pi pi-times"
              severity="secondary"
              outlined
              className="border-round-lg font-bold px-3"
              onClick={() => setShowSubmitModal(false)}
            />
            <Button
              label={submitting ? 'Memproses...' : 'Ya, Terbitkan Antrean'}
              icon="pi pi-check"
              severity="success"
              loading={submitting}
              className="border-round-lg font-bold px-4"
              onClick={() => handleSubmitFromModal(false)}
            />
          </div>
        }
      >
        <div className="flex flex-column gap-3 pt-2">
          {/* INFO PASIEN */}
          <div className="p-3 border-round-xl border-1 surface-border surface-50 flex flex-column gap-2 text-sm">
            <div className="flex align-items-center justify-content-between">
              <span className="text-500 font-medium text-xs">Pasien</span>
              <div className="flex align-items-center gap-2">
                <span className="font-bold text-900">{pasienData.nama}</span>
                <span
                  className="text-xs font-bold px-2 py-1 border-round-lg text-white"
                  style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' }}
                >
                  {pasienData.no_rm}
                </span>
              </div>
            </div>
            {selectedList[0]?.nama_ruangan && (
              <div className="flex align-items-center justify-content-between">
                <span className="text-500 font-medium text-xs">Tujuan Ruangan</span>
                <span className="font-semibold text-primary text-xs flex align-items-center gap-1">
                  <i className="pi pi-map-marker text-xs" />
                  {selectedList[0].nama_ruangan}
                </span>
              </div>
            )}
          </div>

          {/* DAFTAR LAYANAN DIPILIH */}
          <div className="flex flex-column gap-2">
            <span className="text-sm font-bold text-700">Rincian Layanan & Antrean Kunjungan:</span>
            {selectedList.map((it) => {
              const key = `${it.jenis}_${it.kode_layanan}`;
              const { isWajib, isService, isOpsional } = getItemConsultType(it);
              const priceText = it.jenis === 'klaim_paket' ? 'Rp 0 (Klaim Sesi)' : formatRupiah(it.harga);
              const konsulChoice = submitConsultChoices[key];

              return (
                <div key={key} className="surface-50 border-1 surface-border border-round-xl p-3 flex flex-column gap-2">
                  {/* Nama & Harga */}
                  <div className="flex align-items-center justify-content-between">
                    <span className="font-bold text-900 text-sm">{it.nama}</span>
                    <span className="font-bold text-blue-600 text-sm">{priceText}</span>
                  </div>

                  {/* Badge rute non-opsional */}
                  {isWajib && (
                    <span className="text-xs font-semibold text-red-700 flex align-items-center gap-1">
                      <i className="pi pi-user-edit text-xs" /> Wajib Konsultasi Dokter Dulu
                    </span>
                  )}
                  {isService && (
                    <span className="text-xs font-semibold text-green-700 flex align-items-center gap-1">
                      <i className="pi pi-bolt text-xs" /> Langsung ke {it.nama_ruangan || 'Ruang Tindakan'}
                    </span>
                  )}

                  {/* Pilihan konsultasi untuk opsional */}
                  {isOpsional && (
                    <div className="flex flex-column gap-2 pt-1 border-top-1 surface-border">
                      <div className="flex align-items-center justify-content-between">
                        <span className="text-xs font-bold text-700 flex align-items-center gap-1">
                          <i className="pi pi-question-circle text-indigo-500" />
                          Pilihan Alur Kunjungan
                        </span>
                        <Tag value="Opsional Konsul" severity="info" className="text-xs" />
                      </div>
                      <div className="flex gap-2">
                        {/* Opsi Konsultasi Dulu */}
                        {todayInfo?.has_petugas_konsul_today === false ? (
                          <div
                            className="flex-1 p-2 border-round-xl border-2 flex align-items-center gap-2 opacity-60 cursor-not-allowed surface-200 border-200"
                            title="Dokter jaga di Ruang Konsultasi tidak bertugas hari ini"
                          >
                            <div
                              className="flex align-items-center justify-content-center border-round-lg text-white flex-shrink-0 bg-gray-400"
                              style={{ width: '32px', height: '32px' }}
                            >
                              <i className="pi pi-user-minus text-sm" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-xs text-500">Konsultasi Libur</div>
                              <div className="text-[10px] text-red-500">Tidak ada dokter jaga</div>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="flex-1 p-2 border-round-xl border-2 cursor-pointer transition-all transition-duration-200 flex align-items-center gap-2"
                            style={{
                              borderColor: konsulChoice !== false ? '#6366f1' : '#e2e8f0',
                              background: konsulChoice !== false ? 'linear-gradient(135deg, #eef2ff, #e0e7ff)' : 'var(--surface-50)',
                            }}
                            onClick={() => setSubmitConsultChoices((prev) => ({ ...prev, [key]: true }))}
                          >
                            <div
                              className="flex align-items-center justify-content-center border-round-lg text-white flex-shrink-0"
                              style={{
                                width: '32px', height: '32px',
                                background: konsulChoice !== false ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : '#cbd5e1',
                              }}
                            >
                              <i className="pi pi-user-edit text-sm" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-xs" style={{ color: konsulChoice !== false ? '#4338ca' : '#64748b' }}>Konsultasi Dokter Dulu</div>
                              <div className="text-xs" style={{ color: konsulChoice !== false ? '#6366f1' : '#94a3b8' }}>Ke Ruang Konsultasi</div>
                            </div>
                            {konsulChoice !== false && <i className="pi pi-check-circle text-indigo-500 flex-shrink-0" />}
                          </div>
                        )}

                        {/* Opsi Langsung Tindakan */}
                        <div
                          className="flex-1 p-2 border-round-xl border-2 cursor-pointer transition-all transition-duration-200 flex align-items-center gap-2"
                          style={{
                            borderColor: konsulChoice === false ? '#10b981' : '#e2e8f0',
                            background: konsulChoice === false ? 'linear-gradient(135deg, #ecfdf5, #d1fae5)' : 'var(--surface-50)',
                          }}
                          onClick={() => setSubmitConsultChoices((prev) => ({ ...prev, [key]: false }))}
                        >
                          <div
                            className="flex align-items-center justify-content-center border-round-lg text-white flex-shrink-0"
                            style={{
                              width: '32px', height: '32px',
                              background: konsulChoice === false ? 'linear-gradient(135deg, #10b981, #059669)' : '#cbd5e1',
                            }}
                          >
                            <i className="pi pi-bolt text-sm" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-xs" style={{ color: konsulChoice === false ? '#065f46' : '#64748b' }}>Langsung Tindakan</div>
                            <div className="text-xs" style={{ color: konsulChoice === false ? '#10b981' : '#94a3b8' }}>{it.nama_ruangan || 'Ruang Tindakan'}</div>
                          </div>
                          {konsulChoice === false && <i className="pi pi-check-circle text-green-500 flex-shrink-0" />}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* PANEL ESTIMASI REAL-TIME SEBELUM TERBITKAN (B.1, B.2, B.3) */}
          {selectedList.length > 0 && (() => {
            const activeRoomObj = ruangans.find(
              (r) => r.kode_ruangan === (activeRuangan || selectedList[0]?.kode_ruangan)
            );
            const sisaBebanMenitRuang = activeRoomObj?.sisa_beban_menit || 0;
            const hasConsult = selectedList.some((it) => {
              const ct = getItemConsultType(it);
              return ct.isWajib || (ct.isOpsional && submitConsultChoices[`${it.jenis}_${it.kode_layanan}`] !== false);
            });
            const consultBebanMenit = hasConsult ? 10 : 0;
            const now = new Date();
            const liveMulaiDate = new Date(now.getTime() + (consultBebanMenit + sisaBebanMenitRuang) * 60000);
            const liveSelesaiDate = new Date(liveMulaiDate.getTime() + totalDurasi * 60000);
            const bufferMenit = activeRoomObj?.buffer_booking_menit || 15;
            const liveBatasAmanDate = new Date(liveSelesaiDate.getTime() + bufferMenit * 60000);
            const liveSelesaiStr = liveSelesaiDate.toTimeString().slice(0, 5);
            const liveBatasAmanStr = liveBatasAmanDate.toTimeString().slice(0, 8);

            const jamBookingTerdekat = activeRoomObj?.jam_booking_terdekat;
            const namaPasienBooking = activeRoomObj?.nama_pasien_booking_terdekat;
            const isBentrok = Boolean(
              jamBookingTerdekat &&
              totalDurasi > 0 &&
              liveBatasAmanStr > `${jamBookingTerdekat}:00`
            );

            if (!isBentrok) return null;

            return (
              <div className="p-3 border-round-xl border-1 text-xs flex flex-column gap-1 bg-red-50 border-red-200 text-red-900">
                <div className="flex align-items-center justify-content-between">
                  <span className="text-500">Estimasi selesai:</span>
                  <strong className="font-bold">±{liveSelesaiStr} WIB</strong>
                </div>
                <div className="flex align-items-center justify-content-between">
                  <span className="text-500">Booking terdekat:</span>
                  <span className="font-semibold">
                    {jamBookingTerdekat ? `${jamBookingTerdekat} WIB (${namaPasienBooking || 'Pasien Booking'})` : 'Tidak ada'}
                  </span>
                </div>
                <div className="flex align-items-center justify-content-between">
                  <span className="text-500">Status:</span>
                  <span className="font-bold text-red-700">
                    🔴 Berpotensi bentrok — buffer {bufferMenit} menit terlampaui
                  </span>
                </div>
              </div>
            );
          })()}

          {/* TOTAL */}
          <div className="flex align-items-center justify-content-between font-extrabold text-base pt-2 border-top-2 surface-border text-900">
            <span>Total Estimasi Biaya:</span>
            <span className="text-blue-600">{formatRupiah(totalHarga)}</span>
          </div>
          <p className="text-xs text-500 m-0">
            Nomor antrean dan nomor kunjungan baru akan otomatis diterbitkan ke sistem.
          </p>
        </div>
      </Dialog>

      {/* DIALOG PENOLAKAN KAPASITAS PENUH (BENTURAN JADWAL BOOKING) */}
      <Dialog
        visible={showRejectBookingDialog}
        onHide={() => setShowRejectBookingDialog(false)}
        style={{ width: '90vw', maxWidth: '580px' }}
        modal
        closable={!submitting}
        header={
          <div className="flex align-items-center gap-2">
            <div
              className="flex align-items-center justify-content-center bg-red-100 text-red-600 border-round-lg p-2 flex-shrink-0"
              style={{ width: 40, height: 40 }}
            >
              <i className="pi pi-ban text-2xl font-bold" />
            </div>
            <div>
              <span className="font-bold text-base text-red-900 block">Pendaftaran Ditolak: Kapasitas Sesi Penuh</span>
              <span className="text-xs text-500">Estimasi waktu antrean melampaui slot booking terjadwal</span>
            </div>
          </div>
        }
        footer={
          <div className="flex justify-content-end gap-2 pt-2">
            <Button
              label="Tutup / Batalkan"
              icon="pi pi-times"
              severity="secondary"
              outlined
              onClick={() => setShowRejectBookingDialog(false)}
            />
          </div>
        }
      >
        {rejectBookingData && (
          <div className="flex flex-column gap-3 py-2">
            <div className="p-3 bg-red-50 border-round-xl border-1 border-red-200">
              <div className="text-xs font-semibold text-red-800 mb-1">Ruangan Tujuan:</div>
              <div className="text-base font-bold text-red-900 mb-2">{rejectBookingData.nama_ruangan}</div>
              <p className="text-xs text-red-700 m-0 line-height-3">
                Pendaftaran walk-in untuk sesi ini ditolak oleh sistem karena estimasi waktu pelayanan pasien baru
                (selesai ±<strong>{rejectBookingData.estimasi_selesai} WIB</strong>) akan bertabrakan dengan hak slot pasien
                booking <strong>{rejectBookingData.nama_pasien_booking}</strong> pukul <strong>{rejectBookingData.jam_booking} WIB</strong>.
              </p>
            </div>

            <div className="grid">
              <div className="col-6">
                <div className="p-3 bg-red-100 border-round-xl border-1 border-red-300 h-full">
                  <span className="text-xs text-red-800 block mb-1 font-semibold">
                    <i className="pi pi-calendar-times mr-1" />
                    Slot Pasien Booking:
                  </span>
                  <div className="text-xl font-extrabold text-red-900">
                    Pukul {rejectBookingData.jam_booking} WIB
                  </div>
                  <div className="text-xs font-bold text-red-900 mt-1">
                    {rejectBookingData.nama_pasien_booking}
                  </div>
                  <div className="text-[11px] text-red-700">
                    Kode: {rejectBookingData.kode_booking}
                  </div>
                </div>
              </div>

              <div className="col-6">
                <div className="p-3 bg-blue-50 border-round-xl border-1 border-blue-200 h-full">
                  <span className="text-xs text-blue-700 block mb-1 font-semibold">
                    <i className="pi pi-clock mr-1" />
                    Estimasi Selesai Walk-In:
                  </span>
                  <div className="text-xl font-extrabold text-blue-800">
                    ± {rejectBookingData.estimasi_selesai} WIB
                  </div>
                  <div className="text-xs text-blue-700 mt-1">
                    Batas Aman (+{rejectBookingData.buffer_menit}m):
                  </div>
                  <div className="text-xs font-bold text-blue-900">
                    ± {rejectBookingData.batas_aman} WIB
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 surface-50 border-round-xl border-1 surface-border">
              <span className="text-xs font-bold text-700 block mb-2">Rincian Beban Waktu Antrean:</span>
              {rejectBookingData.is_lanjutan_konsultasi ? (
                <>
                  {(rejectBookingData.sisa_antrean_konsul_menit || 0) > 0 && (
                    <div className="flex justify-content-between text-xs text-600 mb-1">
                      <span>Sisa antrean di Ruang Konsultasi ({rejectBookingData.antrean_konsul_count || 0} pasien):</span>
                      <span className="font-semibold text-900">{rejectBookingData.sisa_antrean_konsul_menit} menit</span>
                    </div>
                  )}
                  <div className="flex justify-content-between text-xs text-600 mb-1">
                    <span>1. Estimasi sesi konsultasi dokter:</span>
                    <span className="font-semibold text-900">{rejectBookingData.durasi_konsultasi_menit || 10} menit</span>
                  </div>
                  {(rejectBookingData.antrean_terusan_konsul_menit || 0) > 0 && (
                    <div className="flex justify-content-between text-xs text-600 mb-1">
                      <span>2. Antrean terusan di {rejectBookingData.nama_ruangan} (dari {rejectBookingData.antrean_terusan_konsul_count || 1} pasien konsul):</span>
                      <span className="font-semibold text-900">{rejectBookingData.antrean_terusan_konsul_menit} menit</span>
                    </div>
                  )}
                  <div className="flex justify-content-between text-xs text-600 mb-1">
                    <span>3. Sisa antrean langsung di {rejectBookingData.nama_ruangan} ({rejectBookingData.antrean_berjalan_count || 0} pasien):</span>
                    <span className="font-semibold text-900">{rejectBookingData.sisa_antrean_menit || 0} menit</span>
                  </div>
                  <div className="flex justify-content-between text-xs text-600 mb-1">
                    <span>4. Durasi tindakan layanan ({rejectBookingData.nama_ruangan}):</span>
                    <span className="font-semibold text-900">{rejectBookingData.durasi_tindakan_menit || rejectBookingData.durasi_walkin_menit || 30} menit</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-content-between text-xs text-600 mb-1">
                    <span>Sisa antrean berjalan ({rejectBookingData.antrean_berjalan_count || 0} pasien):</span>
                    <span className="font-semibold text-900">{rejectBookingData.sisa_antrean_menit || 0} menit</span>
                  </div>
                  <div className="flex justify-content-between text-xs text-600 mb-1">
                    <span>Durasi tindakan layanan pasien baru:</span>
                    <span className="font-semibold text-900">{rejectBookingData.durasi_walkin_menit || 0} menit</span>
                  </div>
                </>
              )}
              <div className="flex justify-content-between text-xs text-600 mb-1">
                <span>Buffer proteksi booking:</span>
                <span className="font-semibold text-900">+{rejectBookingData.buffer_menit || 15} menit</span>
              </div>
              <div className="border-top-1 surface-border pt-1 mt-1 flex justify-content-between text-xs font-bold text-900">
                <span>Total estimasi waktu:</span>
                <span className="text-red-700">{(rejectBookingData.total_beban_menit || 0) + (rejectBookingData.buffer_menit || 15)} menit</span>
              </div>
            </div>

            {/* INFORMASI SESI BERIKUTNYA */}
            {rejectBookingData.sesi_berikutnya_rekomendasi && (
              <div className="p-3 bg-emerald-50 border-round-xl border-1 border-emerald-200">
                <div className="flex align-items-center gap-2 text-emerald-800 font-bold text-xs mb-1">
                  <i className="pi pi-calendar-plus text-emerald-700" />
                  <span>Sesi Berikutnya di {rejectBookingData.nama_ruangan}</span>
                </div>
                <p className="text-xs text-emerald-900 m-0 line-height-3">
                  Pasien walk-in dapat didaftarkan kembali mulai pukul <strong>{rejectBookingData.sesi_berikutnya_rekomendasi} WIB</strong> (setelah sesi pelayanan booking selesai), atau silakan buatkan reservasi booking untuk slot jam tersebut.
                </p>
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* DIALOG PERINGATAN BENTURAN JADWAL BOOKING (SOFT WARNING - WALK-IN TUNGGAL DENGAN OPSI OVERRIDE) */}
      <Dialog
        visible={showWarningBookingDialog}
        onHide={() => setShowWarningBookingDialog(false)}
        style={{ width: '90vw', maxWidth: '560px' }}
        modal
        closable={!submitting}
        header={
          <div className="flex align-items-center gap-2">
            <div
              className="flex align-items-center justify-content-center bg-amber-100 text-amber-600 border-round-lg p-2 flex-shrink-0"
              style={{ width: 40, height: 40 }}
            >
              <i className="pi pi-exclamation-triangle text-2xl font-bold" />
            </div>
            <div>
              <span className="font-bold text-base text-amber-900 block">Peringatan: Potensi Benturan Jadwal Booking</span>
              <span className="text-xs text-500">Estimasi waktu pelayanan mepet dengan jadwal booking pasien</span>
            </div>
          </div>
        }
        footer={
          <div className="flex justify-content-end gap-2 pt-2">
            <Button
              label="Batalkan"
              icon="pi pi-times"
              severity="secondary"
              outlined
              disabled={submitting}
              onClick={() => setShowWarningBookingDialog(false)}
            />
            <Button
              label="Tetap Lanjutkan (Override)"
              icon="pi pi-check"
              severity="warning"
              loading={submitting}
              onClick={() => {
                setShowWarningBookingDialog(false);
                handleSubmitFromModal(true);
              }}
            />
          </div>
        }
      >
        {warningBookingData && (
          <div className="flex flex-column gap-3 py-2">
            <div className="p-3 bg-amber-50 border-round-xl border-1 border-amber-200">
              <div className="text-xs font-semibold text-amber-800 mb-1">Ruangan Tujuan:</div>
              <div className="text-base font-bold text-amber-900 mb-2">{warningBookingData.nama_ruangan}</div>
              <p className="text-xs text-amber-800 m-0 line-height-3">
                Estimasi waktu selesai layanan pasien baru ini diperkirakan pada pukul ±<strong>{warningBookingData.estimasi_selesai} WIB</strong> (termasuk batas aman <strong>+{warningBookingData.buffer_menit} menit</strong> pada pukul <strong>{warningBookingData.batas_aman} WIB</strong>).
                Terdapat jadwal booking pasien <strong>{warningBookingData.nama_pasien_booking}</strong> pukul <strong>{warningBookingData.jam_booking} WIB</strong>.
              </p>
            </div>

            <div className="grid">
              <div className="col-6">
                <div className="p-3 bg-amber-100 border-round-xl border-1 border-amber-300 h-full">
                  <span className="text-xs text-amber-800 block mb-1 font-semibold">
                    <i className="pi pi-calendar-times mr-1" />
                    Slot Booking Terjadwal:
                  </span>
                  <div className="text-xl font-extrabold text-amber-900">
                    Pukul {warningBookingData.jam_booking} WIB
                  </div>
                  <div className="text-xs font-bold text-amber-900 mt-1">
                    {warningBookingData.nama_pasien_booking}
                  </div>
                  <div className="text-[11px] text-amber-700">
                    Kode: {warningBookingData.kode_booking}
                  </div>
                </div>
              </div>

              <div className="col-6">
                <div className="p-3 bg-blue-50 border-round-xl border-1 border-blue-200 h-full">
                  <span className="text-xs text-blue-700 block mb-1 font-semibold">
                    <i className="pi pi-clock mr-1" />
                    Estimasi Selesai Pasien:
                  </span>
                  <div className="text-xl font-extrabold text-blue-800">
                    ± {warningBookingData.estimasi_selesai} WIB
                  </div>
                  <div className="text-xs text-blue-700 mt-1">
                    Batas Aman (+{warningBookingData.buffer_menit}m):
                  </div>
                  <div className="text-xs font-bold text-blue-900">
                    ± {warningBookingData.batas_aman} WIB
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 surface-50 border-round-xl border-1 surface-border">
              <span className="text-xs font-bold text-700 block mb-2">Rincian Durasi Layanan:</span>
              <div className="flex justify-content-between text-xs text-600 mb-1">
                <span>Durasi layanan pasien walk-in:</span>
                <span className="font-semibold text-900">{warningBookingData.durasi_walkin_menit || warningBookingData.durasi_tindakan_menit || 0} menit</span>
              </div>
              <div className="flex justify-content-between text-xs text-600 mb-1">
                <span>Buffer proteksi booking (config):</span>
                <span className="font-semibold text-900">+{warningBookingData.buffer_menit || 15} menit</span>
              </div>
              <div className="border-top-1 surface-border pt-1 mt-1 flex justify-content-between text-xs font-bold text-900">
                <span>Total estimasi beban:</span>
                <span className="text-amber-700">{(warningBookingData.total_beban_menit || 0) + (warningBookingData.buffer_menit || 15)} menit</span>
              </div>
            </div>

            <div className="p-3 bg-yellow-50 border-round-xl border-1 border-yellow-300 text-xs text-yellow-900 line-height-3">
              <i className="pi pi-info-circle mr-1 font-bold text-yellow-700" />
              <strong>Catatan:</strong> Karena ruangan saat ini tidak memiliki antrean berjalan, Anda dapat memilih <strong>Tetap Lanjutkan (Override)</strong> jika yakin durasi tindakan dapat diselesaikan tepat waktu sebelum pasien booking tiba. Tindakan override akan dicatat di log audit sistem.
            </div>
          </div>
        )}
      </Dialog>

      <div className="col-12">
        <div className="surface-card p-4 border-round-xl border-1 surface-border shadow-1 mb-4">
          <div className="flex flex-column md:flex-row align-items-start md:align-items-center justify-content-between gap-3 border-bottom-1 surface-border pb-3 mb-3">
            <div>
              <div className="flex align-items-center gap-2 mb-1">
                <Button
                  icon="pi pi-arrow-left"
                  className="p-button-rounded p-button-text p-button-secondary p-button-sm"
                  onClick={onBack}
                  tooltip="Kembali ke Pencarian Pasien"
                />
                <h3 className="text-xl font-bold text-900 m-0">Langkah 2: Pilih Layanan &amp; Paket Treatment</h3>
              </div>
              <p className="text-500 text-sm m-0 ml-6">
                Pilih satu atau beberapa layanan/paket <strong>dalam ruangan yang sama</strong> untuk menerbitkan nomor antrean.
              </p>
            </div>

            <div className="flex align-items-center gap-2 bg-blue-50 p-3 border-round-xl border-1 border-blue-100 w-full md:w-auto">
              <i className="pi pi-user text-blue-600 text-2xl" />
              <div>
                <span className="text-xs text-500 block">Pasien Terdaftar</span>
                <span className="font-extrabold text-blue-900 text-base">{pasienData.nama}</span>
                <span className="text-xs text-blue-700 block font-semibold">No. RM: {pasienData.no_rm}</span>
              </div>
            </div>
          </div>

          {/* INFO RUANGAN AKTIF */}
          {activeRuangan && selectedList.length > 0 && (
            <div className="flex align-items-center justify-content-between flex-wrap gap-2 p-3 bg-blue-50 border-round-lg border-1 border-blue-200 mb-3">
              <div className="flex align-items-center gap-2">
                <i className="pi pi-check-circle text-blue-600 text-lg" />
                <div>
                  <span className="text-xs text-500 block">Ruangan Aktif</span>
                  <span className="font-bold text-blue-800 text-sm">
                    {selectedList[0]?.nama_ruangan || activeRuangan}
                  </span>
                  <span className="text-xs text-blue-600 ml-2">
                    ({selectedList.length} layanan/paket dipilih)
                  </span>
                </div>
              </div>
              <Button
                label="Batalkan Semua Pilihan"
                icon="pi pi-times"
                size="small"
                severity="danger"
                outlined
                className="border-round-lg text-xs"
                onClick={handleClearSelection}
              />
            </div>
          )}

          {/* BANNER STATUS HARI INI */}
          {todayInfo && (
            <div className="flex flex-column sm:flex-row align-items-start sm:align-items-center justify-content-between gap-2 p-2 px-3 surface-50 border-1 surface-border border-round-lg mb-3 text-xs text-600">
              <div className="flex align-items-center gap-2">
                <i className="pi pi-calendar text-primary text-sm" />
                <span>
                  Jadwal Operasional: <strong className="text-900 uppercase">{todayInfo.hari || ''}</strong>, {todayInfo.tanggal || ''}
                </span>
              </div>
              <div className="flex align-items-center gap-3">
                <span className="flex align-items-center gap-1">
                  <i className="pi pi-building text-blue-500" />
                  Ruangan Buka:{' '}
                  <strong className="text-900">{todayInfo.ruangan_dengan_petugas_count || 0}</strong> /{' '}
                  {todayInfo.total_ruangan_aktif || ruangans.length}
                </span>
                <span className="flex align-items-center gap-1">
                  <i
                    className={`pi ${
                      todayInfo.has_petugas_konsul_today ? 'pi-check-circle text-green-500' : 'pi-times-circle text-red-500'
                    }`}
                  />
                  Dokter Konsul:{' '}
                  <strong className={todayInfo.has_petugas_konsul_today ? 'text-green-700' : 'text-red-700'}>
                    {todayInfo.has_petugas_konsul_today ? 'Bertugas' : 'Libur'}
                  </strong>
                </span>
              </div>
            </div>
          )}

          {/* PERINGATAN JIKA SELURUH RUANGAN TIDAK ADA PETUGAS HARI INI */}
          {!loading && ruangans.length > 0 && !ruangans.some((r) => r.has_petugas_jaga_today) && (
            <div className="p-4 bg-red-50 border-round-xl border-1 border-red-300 mb-4 flex align-items-start gap-3 shadow-1">
              <div className="flex align-items-center justify-content-center bg-red-100 text-red-600 border-round-lg flex-shrink-0" style={{ width: '40px', height: '40px' }}>
                <i className="pi pi-times-circle text-2xl" />
              </div>
              <div>
                <h4 className="text-base font-bold text-red-900 m-0 mb-1">Seluruh Layanan Tidak Tersedia Hari Ini</h4>
                <p className="text-sm text-red-700 m-0 line-height-3">
                  Tidak ada satupun ruangan yang memiliki jadwal petugas atau dokter jaga aktif pada hari ini ({todayInfo?.hari ? todayInfo.hari.toUpperCase() : 'HARI INI'}). Pendaftaran antrean walk-in tidak dapat diproses saat ini. Silakan atur jadwal karyawan terlebih dahulu di menu Master Jadwal Karyawan.
                </p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex flex-column align-items-center justify-content-center p-6 my-4">
              <ProgressSpinner style={{ width: '40px', height: '40px' }} strokeWidth="4" />
              <span className="text-500 text-sm mt-3 font-medium">Memuat opsi layanan &amp; paket...</span>
            </div>
          ) : (
            <>
              {/* Tombol Lihat Semua Jadwal Booking Ruangan Aktif */}
              {(() => {
                const claimableCount = (ownedPackages || []).filter((pkg: any) => {
                  if (pkg.status && pkg.status.toLowerCase() !== 'aktif') return false;
                  return (pkg.details || []).some((det: any) => (det.sisa_sesi || 0) > 0);
                }).length;
                const activeRoomIndex = claimableCount > 0 ? activeTabIndex - 1 : activeTabIndex;
                const currentActiveRuang = activeRoomIndex >= 0 ? ruangans[activeRoomIndex] : null;
                if (!currentActiveRuang) return null;
                const bookingCount = currentActiveRuang.daftar_booking_hari_ini?.length || currentActiveRuang.total_booking_hari_ini || 0;
                if (bookingCount === 0) return null;

                return (
                  <div className="flex justify-content-end mb-2">
                    <Button
                      type="button"
                      label={`Lihat Semua Jadwal Booking (${bookingCount})`}
                      icon="pi pi-calendar"
                      size="small"
                      severity="warning"
                      className="text-xs p-button-sm border-round-lg font-semibold shadow-1"
                      onClick={() => handleOpenAllBookingsDialog(currentActiveRuang)}
                    />
                  </div>
                );
              })()}

              <TabView
                className="p-tabview-custom"
                activeIndex={activeTabIndex}
                onTabChange={(e) => setActiveTabIndex(e.index)}
              >
              {(() => {
                const panels: React.ReactNode[] = [];

                const claimablePackages = (ownedPackages || []).filter((pkg: any) => {
                  if (pkg.status && pkg.status.toLowerCase() !== 'aktif') return false;
                  return (pkg.details || []).some((det: any) => (det.sisa_sesi || 0) > 0);
                });

                if (claimablePackages.length > 0) {
                  panels.push(
                    <TabPanel
                      key="owned_packages_tab"
                      header={`🎁 Paket Dimiliki Pasien (${claimablePackages.length})`}
                      leftIcon="pi pi-gift mr-2 text-amber-600 font-bold"
                    >
                      <div className="p-3 bg-amber-50 border-round-lg border-1 border-amber-200 mb-3 flex align-items-center gap-2">
                        <i className="pi pi-info-circle text-amber-600 text-lg" />
                        <span className="text-sm text-amber-900 font-semibold">
                          Pasien ini memiliki paket aktif! Centang sesi layanan di bawah ini untuk klaim antrean kunjungan tanpa biaya tambahan (Rp 0).
                        </span>
                      </div>

                      <div className="grid">
                        {claimablePackages.map((pkg: any) => {
                          return (pkg.details || [])
                            .filter((det: any) => (det.sisa_sesi || 0) > 0)
                            .map((det: any) => {
                              const claimItem: ServiceItem = {
                                jenis: 'klaim_paket',
                                kode_layanan: det.kode_layanan,
                                kode_kategori: 'KLAIM PAKET',
                                nama_kategori: `Klaim Paket`,
                                nama: `${det.nama_layanan || det.kode_layanan}`,
                                harga: 0,
                                harga_asal: 0,
                                durasi_menit: det.durasi_menit || 45,
                                total_sesi: det.sesi_total,
                                sisa_sesi: det.sisa_sesi,
                                kode_ruangan: det.kode_ruangan || pkg.kode_ruangan_paket || 'RNG-002',
                                nama_ruangan: det.nama_ruangan || pkg.nama_ruangan_paket || 'Ruangan Treatment',
                                // Untuk klaim paket: gunakan tipe PAKET (bukan tipe layanan komponen)
                                // sehingga BEAUTY TREATMENT -> opsional, bukan SERVICE TREATMENT
                                tipe: pkg.tipe_paket || 'BEAUTY TREATMENT',
                                tipe_paket: pkg.tipe_paket || 'BEAUTY TREATMENT',
                                wajib_konsultasi: (pkg.tipe_paket === 'MEDICAL TREATMENT' ? 'wajib' : pkg.tipe_paket === 'SERVICE TREATMENT' ? 'tidak' : 'opsional'),
                                kode_kepemilikan_paket_layanan: pkg.kode_kepemilikan_paket_layanan,
                                nama_paket_asal: pkg.nama_paket,
                                is_petugas_available: det.is_petugas_available,
                                alasan_tidak_tersedia: det.alasan_tidak_tersedia,
                              };

                              return renderItemCard(claimItem);
                            });
                        })}
                      </div>
                    </TabPanel>
                  );
                }

                ruangans.forEach((ruang) => {
                  const isRuangActive = activeRuangan === ruang.kode_ruangan;
                  const isRuangDisabled = activeRuangan !== null && activeRuangan !== ruang.kode_ruangan;
                  const isRuangNoStaff = ruang.has_petugas_jaga_today === false;
                  const capStatus = ruang.status_kapasitas || 'aman';
                  const capBadge = ruang.status_badge || 'Aman';
                  const capText = ruang.keterangan_status || '';
                  const ruangSelectedCount = ruang.items.filter(
                    (item) => !!selectedMap[`${item.jenis}_${item.kode_layanan}`]
                  ).length;
                  const roomTitle = ruang.nama_ruangan
                    ? `${ruang.nama_ruangan}`
                    : `Ruangan ${ruang.kode_ruangan}`;

                  const tabHeader = (
                    <div className="flex align-items-center gap-2 py-1">
                      <i className={`pi ${isRuangActive ? 'pi-check-circle text-primary font-bold' : isRuangNoStaff ? 'pi-times-circle text-red-500' : 'pi-building text-600'}`} />
                      <span className={isRuangNoStaff ? 'text-700' : 'font-medium'}>{roomTitle}</span>
                      {ruangSelectedCount > 0 && (
                        <Tag value={ruangSelectedCount} severity="info" className="text-xs px-2 py-0" />
                      )}
                    </div>
                  );

                  panels.push(
                    <TabPanel
                      key={ruang.kode_ruangan}
                      header={tabHeader}
                    >
                      {/* Banner Peringatan Status Kapasitas Ruangan (HANYA MUNCUL JIKA WASPADA / BERISIKO) */}
                      {!isRuangNoStaff && (capStatus === 'waspada' || capStatus === 'berisiko') && (
                        <div
                          className={`p-3 border-round-xl border-1 mb-3 flex flex-column sm:flex-row align-items-start sm:align-items-center justify-content-between gap-3 shadow-1 ${
                            capStatus === 'berisiko'
                              ? 'bg-red-50 border-red-200'
                              : 'bg-amber-50 border-amber-200'
                          }`}
                        >
                          <div className="flex align-items-center gap-3">
                            <div
                              className={`border-round-xl flex align-items-center justify-content-center flex-shrink-0 ${
                                capStatus === 'berisiko'
                                  ? 'bg-red-100 text-red-600'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                              style={{ width: '38px', height: '38px' }}
                            >
                              <i
                                className={`pi ${
                                  capStatus === 'berisiko'
                                    ? 'pi-exclamation-circle text-lg'
                                    : 'pi-clock text-lg'
                                }`}
                              />
                            </div>
                            <div className="flex flex-column gap-0.5">
                              <div className="text-xs font-bold flex align-items-center gap-2 flex-wrap">
                                <span className={capStatus === 'berisiko' ? 'text-red-900' : 'text-amber-900'}>
                                  Peringatan Kapasitas Ruangan:
                                </span>
                                {capStatus === 'waspada' && (
                                  <Tag
                                    value="Waspada"
                                    severity="warning"
                                    className="text-xs font-bold px-2 py-0.5 border-round-md"
                                  />
                                )}
                              </div>
                              <span className={`text-xs ${capStatus === 'berisiko' ? 'text-red-800' : 'text-amber-800'}`}>
                                {ruang.keterangan_status ||
                                  (ruang.jam_booking_terdekat
                                    ? `Ada booking jam ${ruang.jam_booking_terdekat}${ruang.nama_pasien_booking_terdekat ? ` (${ruang.nama_pasien_booking_terdekat})` : ''}, sisa waktu aman sangat terbatas (±${Math.max(0, ruang.slack_menit || 0)} menit)`
                                    : '')}
                              </span>
                            </div>
                          </div>
                          {ruang.antrean_aktif_count !== undefined && ruang.antrean_aktif_count > 0 && (
                            <div className="flex-shrink-0">
                              <Tag
                                value={`${ruang.antrean_aktif_count} Antrean Menunggu`}
                                icon="pi pi-hourglass mr-1"
                                severity="warning"
                                className="text-xs font-semibold px-2.5 py-1 border-round-md"
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {isRuangNoStaff && (
                        <div className="flex align-items-center gap-3 p-3 mb-3 bg-red-50 border-round-xl border-1 border-red-200">
                          <div className="flex align-items-center justify-content-center bg-red-100 text-red-600 border-round-lg flex-shrink-0" style={{ width: '36px', height: '36px' }}>
                            <i className="pi pi-exclamation-triangle text-lg" />
                          </div>
                          <div className="flex-1">
                            <span className="text-sm font-bold text-red-900 block">Tidak Ada Petugas Jaga Hari Ini</span>
                            <span className="text-xs text-red-700 line-height-2">
                              Ruangan <strong>{roomTitle}</strong> tidak memiliki dokter atau petugas jaga yang terjadwal aktif pada hari ini ({todayInfo?.hari ? todayInfo.hari.toUpperCase() : 'HARI INI'}). Seluruh layanan di ruangan ini dinonaktifkan untuk antrean walk-in.
                            </span>
                          </div>
                        </div>
                      )}
                      {isRuangDisabled && !isRuangNoStaff && (
                        <div className="flex align-items-center gap-2 p-3 mb-3 bg-orange-50 border-round-lg border-1 border-orange-200">
                          <i className="pi pi-info-circle text-orange-500" />
                          <span className="text-sm text-orange-700">
                            Ruangan ini tidak bisa dipilih karena Anda sudah memilih layanan/paket dari ruangan <strong>{selectedList[0]?.nama_ruangan || activeRuangan}</strong>.
                            Batalkan semua pilihan terlebih dahulu untuk berpindah ruangan.
                          </span>
                        </div>
                      )}
                      {ruang.items.length === 0 ? (
                        <div className="flex flex-column align-items-center justify-content-center p-5 surface-card border-round-xl border-1 surface-border my-3 text-center">
                          <i className="pi pi-inbox text-400 text-4xl mb-2" />
                          <span className="text-700 font-bold block text-base">{roomTitle}</span>
                          <span className="text-500 text-sm mt-1">Belum ada layanan atau paket yang tersedia di ruangan ini.</span>
                        </div>
                      ) : (
                        <div className="grid">
                          {ruang.items.map((item) => renderItemCard(item))}
                        </div>
                      )}
                    </TabPanel>
                  );
                });

                return panels;
              })()}
              </TabView>
            </>
          )}
        </div>
      </div>

      {/* FIXED / STICKY BOTTOM SUMMARY BAR */}
      <div
        className="fixed bottom-0 left-0 right-0 surface-card border-top-1 surface-border p-3 shadow-5 flex align-items-center justify-content-between gap-3"
        style={{ zIndex: 1000 }}
      >
        <div className="flex align-items-center gap-4 pl-3 flex-wrap">
          <div>
            <span className="text-xs text-500 block">Dipilih:</span>
            <span className="font-extrabold text-900 text-lg">{selectedList.length} Item</span>
          </div>
          <div className="hidden sm:block border-left-1 surface-border pl-4">
            <span className="text-xs text-500 block">Total Estimasi Durasi:</span>
            <span className="font-bold text-700 text-base flex align-items-center gap-1">
              <i className="pi pi-clock text-blue-500" /> {totalDurasi} Menit
            </span>
          </div>
          <div className="border-left-1 surface-border pl-4">
            <span className="text-xs text-500 block">Total Estimasi Biaya:</span>
            <span className="font-extrabold text-blue-600 text-xl">{formatRupiah(totalHarga)}</span>
          </div>


        </div>

        <div className="flex align-items-center gap-2 pr-3 flex-shrink-0">
          <Button
            label="Batalkan"
            icon="pi pi-times"
            severity="secondary"
            outlined
            className="border-round-lg font-bold px-3"
            onClick={onBack}
          />
          <Button
            label={submitting ? 'Memproses...' : 'Terbitkan Antrean Kunjungan'}
            icon="pi pi-check"
            severity="success"
            loading={submitting}
            className="border-round-lg font-bold px-4"
            onClick={() => openSubmitModal()}
          />
        </div>
      </div>

      {/* Dialog Semua Jadwal Booking Hari Ini */}
      <DialogSemuaBookingRuangan
        visible={dialogAllBookingsVisible}
        onHide={() => setDialogAllBookingsVisible(false)}
        ruangan={selectedRuanganForBookings}
        todayDateStr={todayInfo?.tanggal}
        todayDayName={todayInfo?.hari}
      />
    </div>
  );
};
