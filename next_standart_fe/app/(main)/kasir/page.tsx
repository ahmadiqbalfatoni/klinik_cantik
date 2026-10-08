'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Toast } from 'primereact/toast';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import postData from '@/lib/axios/postData';
import { showError } from '@/lib/tools/generalTools';

import { Button } from 'primereact/button';

import { KasirSidebar } from './components/KasirSidebar';
import { KasirPOSPanel } from './components/KasirPOSPanel';
import { KasirBayarModal } from './components/KasirBayarModal';
import { KasirStrukModal } from './components/KasirStrukModal';
import { KasirShiftHeader } from './components/KasirShiftHeader';

export interface CartItem {
  jenis: 'layanan' | 'produk';
  kode: string;
  nama: string;
  nama_kategori?: string;
  satuan?: string;
  qty: number;
  harga_satuan: number;
  harga_master?: number | null;
  dal_harga?: number | null;
  subtotal: number;
  is_promo?: boolean;
  kode_promo_item?: string;
  is_from_pendaftaran?: boolean;
  is_free_include?: boolean;
  // Info promo per-item dari pendaftaran (diskon diterapkan di kasir)
  kode_promo?: string | null;
  nama_promo?: string | null;
  jenis_diskon?: 'persen' | 'nominal' | 'include_treatment' | string | null;
  nilai_diskon?: number | null;
  diskon?: number | null;
  subtotal_setelah_diskon?: number | null;
}

export interface TransaksiListItem {
  kode_transaksi: string;
  kode_kunjungan: string | null;
  no_rm: string;
  nama_pasien: string;
  no_hp: string;
  kode_promo: string | null;
  nama_promo: string | null;
  tanggal_transaksi: string;
  total_harga: number;
  total_diskon: number;
  total_bayar: number;
  dp_nominal?: number;
  metode_pembayaran_dp?: string | null;
  sisa_bayar?: number;
  metode_bayar: string;
  status: 'draft' | 'lunas' | 'batal';
}

export interface BayarResult {
  kode_transaksi: string;
  metode_bayar: string;
  total_harga?: number;
  total_diskon?: number;
  total_bayar: number;
  dp_nominal?: number;
  metode_pembayaran_dp?: string | null;
  sisa_bayar?: number;
  nominal_bayar: number;
  kembalian: number;
  nama_pasien?: string;
  no_rm?: string;
  items?: CartItem[];
  kode_promo?: string | null;
  nama_promo?: string | null;
}

export default function KasirPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const toast = useRef<Toast>(null);

  useEffect(() => {
    if (session?.user?.role === 'superadmin') {
      router.replace('/dashboard');
    }
  }, [session, router]);

  // State shift & schedule kasir
  const [isAccessAllowed, setIsAccessAllowed] = useState(true);
  const [isShiftOpen, setIsShiftOpen] = useState(false);
  const [shiftRefreshKey, setShiftRefreshKey] = useState(0);

  // State sidebar
  const [transaksiList, setTransaksiList] = useState<TransaksiListItem[]>([]);
  const [selectedKodeTrx, setSelectedKodeTrx] = useState<string | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);

  // State modal
  const [showBayarModal, setShowBayarModal] = useState(false);
  const [showStrukModal, setShowStrukModal] = useState(false);
  const [bayarResult, setBayarResult] = useState<BayarResult | null>(null);

  // Pending bayar payload (from POS panel)
  const [pendingBayarPayload, setPendingBayarPayload] = useState<{
    kode_transaksi: string;
    total_bayar: number;
    total_harga?: number;
    dp_nominal?: number;
    metode_pembayaran_dp?: string | null;
    sisa_bayar?: number;
    nama_pasien: string;
    no_rm: string;
    items: CartItem[];
    kode_promo?: string | null;
    nama_promo?: string | null;
    total_diskon?: number;
  } | null>(null);

  const handleShiftStateChange = useCallback((allowed: boolean, isOpen: boolean) => {
    setIsAccessAllowed((prev) => (prev !== allowed ? allowed : prev));
    setIsShiftOpen((prev) => (prev !== isOpen ? isOpen : prev));
  }, []);

  const refreshList = useCallback(() => {
    setListRefreshKey((k) => k + 1);
  }, []);

  const handleSelectTrx = useCallback((kode: string) => {
    setSelectedKodeTrx(kode);
  }, []);

  const handleNewTrx = useCallback(() => {
    setSelectedKodeTrx(null);
  }, []);

  const handleDraftSaved = useCallback((kode_transaksi: string) => {
    setSelectedKodeTrx(kode_transaksi);
    refreshList();
  }, [refreshList]);

  const handleOpenBayar = useCallback((payload: typeof pendingBayarPayload) => {
    setPendingBayarPayload(payload);
    setShowBayarModal(true);
  }, []);

  const handleListChange = useCallback((list: TransaksiListItem[]) => {
    setTransaksiList(list);
  }, []);

  const handleBayarConfirm = useCallback(async (metode: string, nominal: number) => {
    if (!pendingBayarPayload) return;
    try {
      const res = await postData('/master/kasir-bayar', {
        kode_transaksi: pendingBayarPayload.kode_transaksi,
        metode_bayar: metode,
        nominal_bayar: nominal,
      });

      if (['00', '0000'].includes(res?.data?.status)) {
        const result: BayarResult = {
          ...res.data.data,
          nama_pasien: pendingBayarPayload.nama_pasien,
          no_rm: pendingBayarPayload.no_rm,
          items: pendingBayarPayload.items,
          kode_promo: res.data.data?.kode_promo || pendingBayarPayload.kode_promo,
          nama_promo: res.data.data?.nama_promo || pendingBayarPayload.nama_promo,
          total_diskon: res.data.data?.total_diskon !== undefined ? res.data.data.total_diskon : pendingBayarPayload.total_diskon,
        };
        setBayarResult(result);
        setShowBayarModal(false);
        setShowStrukModal(true);
        setSelectedKodeTrx(null);
        refreshList();
        setShiftRefreshKey((k) => k + 1);
      } else {
        showError(toast, res?.data?.message || 'Pembayaran gagal');
      }
    } catch {
      showError(toast, 'Gagal terhubung ke server');
    }
  }, [pendingBayarPayload, refreshList]);

  return (
    <div className="w-full h-full kasir-page-container flex flex-column" style={{ minHeight: 0, minWidth: 0 }}>
      <Toast ref={toast} position="top-right" />

      {/* SHIFT & SCHEDULE HEADER BAR */}
      <KasirShiftHeader
        toast={toast}
        refreshKey={shiftRefreshKey}
        onShiftStateChange={handleShiftStateChange}
      />

      <div
        className="flex flex-column lg:flex-row gap-3 h-full w-full kasir-main-layout relative"
        style={{ minHeight: 0, minWidth: 0, flex: 1 }}
      >
        {/* LOCK OVERLAY IF CASHIER IS OUTSIDE WORKING SCHEDULE */}
        {!isAccessAllowed && (
          <div
            className="absolute inset-0 z-5 flex flex-column align-items-center justify-content-center border-round-xl"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.88)', backdropFilter: 'blur(3px)' }}
          >
            <div className="p-4 border-round-xl bg-white shadow-4 border-1 surface-border text-center max-w-md mx-3">
              <div className="w-4rem h-4rem border-round-circle bg-red-100 flex align-items-center justify-content-center text-red-600 mx-auto mb-3">
                <i className="pi pi-lock text-3xl" />
              </div>
              <h4 className="font-bold text-900 mb-1">Fitur Kasir Terkunci</h4>
              <p className="text-500 text-xs mb-3">
                Anda belum dapat mengakses transaksi kasir karena saat ini belum memasuki jadwal shift kerja Anda.
              </p>
              <div className="flex justify-content-center gap-2">
                <Button
                  label="Cek Ulang Status Jadwal"
                  icon="pi pi-refresh"
                  size="small"
                  severity="danger"
                  onClick={() => setShiftRefreshKey((k) => k + 1)}
                  className="text-xs font-bold border-round-md px-3"
                />
              </div>
            </div>
          </div>
        )}

        {/* SIDEBAR KIRI: Daftar Transaksi & Stat */}
        <div className="h-full overflow-hidden border-round-xl shadow-1 border-1 surface-border kasir-sidebar-wrapper">
          <KasirSidebar
            toast={toast}
            selectedKodeTrx={selectedKodeTrx}
            refreshKey={listRefreshKey}
            onSelectTrx={handleSelectTrx}
            onNewTrx={handleNewTrx}
            onListChange={handleListChange}
          />
        </div>

        {/* PANEL UTAMA POS: Rincian Transaksi Kasir */}
        <div className="h-full overflow-hidden kasir-pos-wrapper">
          <KasirPOSPanel
            toast={toast}
            kode_transaksi={selectedKodeTrx}
            onDraftSaved={handleDraftSaved}
            onOpenBayar={handleOpenBayar}
            onOpenStruk={(res) => {
              setBayarResult(res);
              setShowStrukModal(true);
            }}
          />
        </div>

        {/* MODAL BAYAR */}
        <KasirBayarModal
          visible={showBayarModal}
          totalBayar={pendingBayarPayload?.sisa_bayar !== undefined ? pendingBayarPayload.sisa_bayar : (pendingBayarPayload?.total_bayar || 0)}
          totalTagihanAsli={pendingBayarPayload?.total_bayar || 0}
          dpNominal={pendingBayarPayload?.dp_nominal || 0}
          metodeDp={pendingBayarPayload?.metode_pembayaran_dp || null}
          onHide={() => setShowBayarModal(false)}
          onConfirm={handleBayarConfirm}
        />

        {/* MODAL STRUK */}
        <KasirStrukModal
          visible={showStrukModal}
          result={bayarResult}
          onHide={() => setShowStrukModal(false)}
        />
      </div>
    </div>
  );
}
