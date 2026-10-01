'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Toast } from 'primereact/toast';
import { Button } from 'primereact/button';
import { ProgressSpinner } from 'primereact/progressspinner';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Tooltip } from 'primereact/tooltip';
import { Dialog } from 'primereact/dialog';
import {
  ShoppingBag,
  Search,
  RotateCcw,
  ChevronDown,
  CheckCircle2,
  Plus,
  X,
} from 'lucide-react';
import postData from '@/lib/axios/postData';
import { showError, showSuccess, showInfo, showWarning } from '@/lib/tools/generalTools';
import type { CartItem, BayarResult } from '../page';
import {
  PromoOption,
  checkPromoEligibility,
  calculateTransactionDiscounts,
  filterValidPromosForCart,
  formatRupiah,
} from '@/lib/tools/diskonKasir';
import { KasirVoucherModal } from './KasirVoucherModal';

interface ProdukItem {
  kode_produk: string;
  nama: string;
  harga_jual: number;
  satuan?: string;
  kode_kategori_produk?: string;
  nama_kategori?: string;
  foto?: string | null;
}

interface SelectedProduk {
  kode_produk: string;
  nama: string;
  harga_jual: number;
  satuan?: string;
  qty: number;
  is_rekomendasi_dokter?: boolean;
  foto?: string | null;
}

const getCategoryBadgeStyle = (catName?: string) => {
  const lower = (catName || '').toLowerCase();
  if (lower.includes('rambut') || lower.includes('hair')) {
    return { color: '#2563EB', borderColor: '#2563EB' };
  }
  if (lower.includes('muka') || lower.includes('wajah') || lower.includes('face')) {
    return { color: '#0C8F62', borderColor: '#0C8F62' };
  }
  if (lower.includes('badan') || lower.includes('tubuh') || lower.includes('body')) {
    return { color: '#D97706', borderColor: '#D97706' };
  }
  return { color: '#0C8F62', borderColor: '#0C8F62' };
};

interface KunjunganOption {
  kode_kunjungan: string;
  kode_booking?: string | null;
  no_rm: string;
  nama_pasien: string;
  no_hp: string;
  jam_datang: string;
  dp_nominal?: number;
  dp_status?: string | null;
  metode_pembayaran_dp?: string | null;
  layanan_pendaftaran?: CartItem[];
}

interface KasirPOSPanelProps {
  toast: React.RefObject<Toast>;
  kode_transaksi: string | null;
  onDraftSaved: (kode: string) => void;
  onOpenBayar: (payload: {
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
  }) => void;
  onOpenStruk?: (result: BayarResult) => void;
}

export const KasirPOSPanel: React.FC<KasirPOSPanelProps> = ({
  toast,
  kode_transaksi,
  onDraftSaved,
  onOpenBayar,
  onOpenStruk,
}) => {
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  const [kunjunganList, setKunjunganList] = useState<KunjunganOption[]>([]);
  const [promoList, setPromoList] = useState<PromoOption[]>([]);
  const [layananList, setLayananList] = useState<any[]>([]);

  const [selectedKunjungan, setSelectedKunjungan] = useState<KunjunganOption | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [editingKodeTrx, setEditingKodeTrx] = useState<string | null>(null);
  const [trxStatus, setTrxStatus] = useState<'draft' | 'lunas' | 'batal' | null>(null);
  const [selectedPromos, setSelectedPromos] = useState<PromoOption[]>([]);
  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [dpNominal, setDpNominal] = useState<number>(0);
  const [metodeDp, setMetodeDp] = useState<string | null>(null);

  // State Popup Modal Produk & Draft Seleksi (Katalog Produk Walk-in / Tambahan)
  const [produkOptions, setProdukOptions] = useState<ProdukItem[]>([]);
  const [loadingProduk, setLoadingProduk] = useState<boolean>(false);
  const [showProdukModal, setShowProdukModal] = useState<boolean>(false);
  const [draftProdukList, setDraftProdukList] = useState<SelectedProduk[]>([]);
  const [modalSearch, setModalSearch] = useState<string>('');
  const [modalCategory, setModalCategory] = useState<string>('ALL');
  const lastAddRef = useRef<{ kode: string; time: number }>({ kode: '', time: 0 });

  useEffect(() => {
    fetchOptions();
  }, []);

  useEffect(() => {
    if (kode_transaksi) {
      fetchDetail(kode_transaksi);
    } else {
      resetForm();
    }
  }, [kode_transaksi]);

  const resetForm = () => {
    setSelectedKunjungan(null);
    setCart([]);
    setEditingKodeTrx(null);
    setTrxStatus(null);
    setSelectedPromos([]);
    setShowVoucherModal(false);
    setDpNominal(0);
    setMetodeDp(null);
  };

  const fetchProdukOptions = async () => {
    setLoadingProduk(true);
    try {
      const res = await postData('/master/produk-dropdown', {});
      const list: ProdukItem[] = (res.data?.data || [])
        .filter((p: any) => !String(p.kode_produk || '').startsWith('CUSTOM-') && !String(p.kode_produk || '').startsWith('CST-'))
        .map((p: any) => ({
          kode_produk: p.kode_produk,
          nama: p.nama,
          harga_jual: parseFloat(p.harga_jual || 0),
          satuan: p.satuan || 'pcs',
          kode_kategori_produk: p.kode_kategori_produk,
          nama_kategori: p.nama_kategori || 'Produk',
          foto: p.foto || null,
        }));
      setProdukOptions(list);
    } catch (_) {
      showError(toast, 'Gagal memuat daftar produk');
    } finally {
      setLoadingProduk(false);
    }
  };

  const fetchOptions = async () => {
    setLoadingOptions(true);
    try {
      const [resKasir, resProduk] = await Promise.all([
        postData('/master/kasir-options', {}),
        postData('/master/produk-dropdown', {}),
      ]);
      if (['00', '0000'].includes(resKasir?.data?.status)) {
        setKunjunganList(resKasir.data.data.kunjungan || []);
        setPromoList(resKasir.data.data.promo || []);
        setLayananList(resKasir.data.data.layanan || []);
      }
      if (['00', '0000', 200, '200'].includes(resProduk?.data?.status) || resProduk?.status === 200) {
        const list: ProdukItem[] = (resProduk.data?.data || [])
          .filter((p: any) => !String(p.kode_produk || '').startsWith('CUSTOM-') && !String(p.kode_produk || '').startsWith('CST-'))
          .map((p: any) => ({
            kode_produk: p.kode_produk,
            nama: p.nama,
            harga_jual: parseFloat(p.harga_jual || 0),
            satuan: p.satuan || 'pcs',
            kode_kategori_produk: p.kode_kategori_produk,
            nama_kategori: p.nama_kategori || 'Produk',
            foto: p.foto || null,
          }));
        setProdukOptions(list);
      }
    } catch (err: any) {
      showError(toast, err?.response?.data?.message || err?.message || 'Gagal memuat opsi kasir');
    } finally {
      setLoadingOptions(false);
    }
  };

  const fetchDetail = async (kode: string) => {
    setLoadingDetail(true);
    try {
      const res = await postData('/master/kasir-detail', { kode_transaksi: kode });
      if (['00', '0000'].includes(res?.data?.status)) {
        const trx = res.data.data;
        setEditingKodeTrx(trx.kode_transaksi);
        setTrxStatus(trx.status);
        setDpNominal(parseFloat(String(trx.dp_nominal || 0)));
        setMetodeDp(trx.metode_pembayaran_dp || null);

        const kunjungan = kunjunganList.find((k) => k.kode_kunjungan === trx.kode_kunjungan) ||
          ((trx.kode_kunjungan || trx.nama_pasien || trx.no_rm) ? {
            kode_kunjungan: trx.kode_kunjungan || '',
            kode_booking: trx.kode_booking || null,
            no_rm: trx.no_rm || '-',
            nama_pasien: trx.nama_pasien || trx.no_rm || 'WALK-IN',
            no_hp: trx.no_hp || '',
            jam_datang: '',
            dp_nominal: parseFloat(String(trx.dp_nominal || 0)),
            dp_status: trx.dp_status || null,
            metode_pembayaran_dp: trx.metode_pembayaran_dp || null,
          } : null);
        setSelectedKunjungan(kunjungan);

        const cartItems: CartItem[] = (trx.details || []).map((d: any) => ({
          jenis: d.jenis,
          kode: d.kode,
          nama: d.nama,
          satuan: d.satuan || (d.jenis === 'layanan' ? 'tindakan' : 'pcs'),
          qty: d.qty,
          harga_satuan: parseFloat(d.harga_satuan),
          harga_master: d.harga_master != null ? parseFloat(d.harga_master) : (d.harga_satuan ? parseFloat(d.harga_satuan) : null),
          subtotal: parseFloat(d.subtotal),
          is_from_pendaftaran: Boolean(d.is_from_pendaftaran),
          kode_promo: d.kode_promo || null,
          nama_promo: d.nama_promo || null,
          jenis_diskon: d.jenis_diskon || null,
          nilai_diskon: d.nilai_diskon != null ? parseFloat(d.nilai_diskon) : null,
          diskon: d.diskon != null ? parseFloat(d.diskon) : 0,
          subtotal_setelah_diskon: d.subtotal_setelah_diskon != null ? parseFloat(d.subtotal_setelah_diskon) : parseFloat(d.subtotal),
        }));
        setCart(cartItems);

        // Rekonstruksi promo yang dipilih dari per-item snapshot atau kode_promo transaksi
        const promosFromItems: PromoOption[] = [];
        const usedItemCodes = new Set<string>();

        for (const item of cartItems) {
          if (item.kode_promo) {
            const foundInList = promoList.find((p) => p.kode_promo === item.kode_promo && p.kode_item === item.kode);
            if (foundInList) {
              promosFromItems.push(foundInList);
              usedItemCodes.add(item.kode);
            } else {
              promosFromItems.push({
                kode_detail_promo: `saved_${item.kode_promo}_${item.kode}`,
                kode_promo: item.kode_promo,
                nama_promo: item.nama_promo || trx.nama_promo || item.kode_promo,
                jenis_diskon: (item.jenis_diskon as any) || 'persen',
                nilai_diskon: item.nilai_diskon || 0,
                jenis_item: item.jenis,
                kode_item: item.kode,
                nama_item: item.nama,
              });
              usedItemCodes.add(item.kode);
            }
          }
        }

        // Auto-select promo untuk item di keranjang yang memiliki promo aktif di promoList
        for (const item of cartItems) {
          if (!usedItemCodes.has(item.kode)) {
            const promoEligible = promoList.find((p) => p.kode_item === item.kode);
            if (promoEligible) {
              promosFromItems.push(promoEligible);
              usedItemCodes.add(item.kode);
            }
          }
        }

        if (promosFromItems.length > 0) {
          setSelectedPromos(promosFromItems);
        } else if (trx.kode_promo) {
          const codes = String(trx.kode_promo).split(',').map((s: string) => s.trim()).filter(Boolean);
          const allCartCodes = new Set(cartItems.map((c: any) => c.kode));
          const foundDetails = promoList.filter((p) =>
            codes.includes(p.kode_promo) && allCartCodes.has(p.kode_item)
          );
          setSelectedPromos(foundDetails);
        } else {
          setSelectedPromos([]);
        }
      }
    } catch (err: any) {
      showError(toast, err?.response?.data?.message || err?.message || 'Gagal memuat detail transaksi');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleKunjunganChange = (kunjungan: KunjunganOption | null) => {
    setSelectedKunjungan(kunjungan);
    if (!kunjungan) {
      setCart([]);
      setEditingKodeTrx(null);
      setTrxStatus(null);
      setSelectedPromos([]);
      setShowVoucherModal(false);
      setDpNominal(0);
      setMetodeDp(null);
      return;
    }

    setDpNominal(parseFloat(String(kunjungan.dp_nominal || 0)));
    setMetodeDp(kunjungan.metode_pembayaran_dp || null);

    if (!editingKodeTrx) {
      const itemsFromPendaftaran = kunjungan.layanan_pendaftaran || [];
      setCart(itemsFromPendaftaran);

      const autoPromos: PromoOption[] = [];
      const usedCodes = new Set<string>();

      for (const item of itemsFromPendaftaran) {
        if (item.kode_promo) {
          const found = promoList.find((p) => p.kode_promo === item.kode_promo && p.kode_item === item.kode);
          if (found) {
            autoPromos.push(found);
            usedCodes.add(item.kode);
          } else {
            autoPromos.push({
              kode_detail_promo: `pendaftaran_${item.kode_promo}_${item.kode}`,
              kode_promo: item.kode_promo,
              nama_promo: item.nama_promo || item.kode_promo,
              jenis_diskon: (item.jenis_diskon as any) || 'persen',
              nilai_diskon: item.nilai_diskon || 0,
              jenis_item: item.jenis,
              kode_item: item.kode,
              nama_item: item.nama,
            });
            usedCodes.add(item.kode);
          }
        }
      }
      for (const item of itemsFromPendaftaran) {
        if (!usedCodes.has(item.kode)) {
          const found = promoList.find((p) => p.kode_item === item.kode);
          if (found) {
            autoPromos.push(found);
            usedCodes.add(item.kode);
          }
        }
      }
      setSelectedPromos(autoPromos);
    }
  };

  const updateQty = (idx: number, newQty: number) => {
    if (newQty <= 0) {
      setCart(cart.filter((_, i) => i !== idx));
    } else {
      setCart(cart.map((c, i) => i === idx ? { ...c, qty: newQty, subtotal: newQty * c.harga_satuan } : c));
    }
  };

  const removeItem = (idx: number) => {
    setCart(cart.filter((_, i) => i !== idx));
  };

  const confirmDelete = (idx: number, namaItem: string) => {
    confirmDialog({
      message: `Hapus "${namaItem}" dari transaksi?`,
      header: 'Konfirmasi Hapus',
      icon: 'pi pi-trash',
      acceptClassName: 'p-button-danger p-button-sm text-xs',
      rejectClassName: 'p-button-secondary p-button-text p-button-sm text-xs',
      acceptLabel: 'Hapus',
      rejectLabel: 'Batal',
      accept: () => removeItem(idx),
    });
  };

  const handleMinus = (idx: number, item: CartItem) => {
    if (item.qty > 1) {
      updateQty(idx, item.qty - 1);
    } else {
      confirmDelete(idx, item.nama);
    }
  };

  // Real-time Total & Discount Calculations via pure helper
  const {
    totalHarga,
    totalDiskon,
    totalBayar,
    itemDiscounts,
  } = useMemo(() => {
    return calculateTransactionDiscounts(cart, selectedPromos);
  }, [cart, selectedPromos]);

  // Reaktif: pantau keranjang untuk otomatis melepas promo yang targetnya dihapus dari keranjang
  useEffect(() => {
    if (selectedPromos.length === 0) return;
    const { validPromos, droppedPromos } = filterValidPromosForCart(cart, selectedPromos);
    if (droppedPromos.length > 0) {
      setSelectedPromos(validPromos);
      droppedPromos.forEach((p) => {
        showInfo(toast, `Promo "${p.nama_promo}" dilepas karena item "${p.nama_item || p.kode_item}" dihapus`);
      });
    }
  }, [cart]);

  // Auto-select promo aktif untuk produk dan layanan di keranjang yang belum memiliki promo terpilih
  useEffect(() => {
    if (promoList.length === 0 || cart.length === 0) return;
    setSelectedPromos((prev) => {
      const currentItemCodes = new Set(prev.map((p) => p.kode_item));
      const newlySelected: PromoOption[] = [];
      for (const item of cart) {
        if (!currentItemCodes.has(item.kode)) {
          const promo = promoList.find((p) => p.kode_item === item.kode);
          if (promo) {
            newlySelected.push(promo);
            currentItemCodes.add(item.kode);
          }
        }
      }
      if (newlySelected.length > 0) {
        return [...prev, ...newlySelected];
      }
      return prev;
    });
  }, [promoList, cart]);

  // Hitung jumlah promo yang eligible dari promoList untuk keranjang saat ini
  const eligiblePromoCount = useMemo(() => {
    return promoList.filter((p) => checkPromoEligibility(p, cart).eligible).length;
  }, [promoList, cart]);

  const sisaBayar = Math.max(0, totalBayar - dpNominal);

  // Kategori produk unik untuk filter di modal katalog
  const availableCategories = useMemo(() => {
    const setCats = new Set<string>();
    produkOptions.forEach((p) => {
      if (p.nama_kategori) setCats.add(p.nama_kategori);
    });
    return Array.from(setCats);
  }, [produkOptions]);

  // Filter produk options di modal
  const modalFilteredProduk = useMemo(() => {
    return produkOptions.filter((p) => {
      if (modalCategory !== 'ALL' && p.nama_kategori !== modalCategory) return false;
      if (modalSearch.trim()) {
        const q = modalSearch.toLowerCase().trim();
        const matchName = (p.nama || '').toLowerCase().includes(q);
        const matchCode = (p.kode_produk || '').toLowerCase().includes(q);
        const matchCat = (p.nama_kategori || '').toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchCat) return false;
      }
      return true;
    });
  }, [produkOptions, modalCategory, modalSearch]);

  // Map produk terpilih di draft untuk indikator visual di katalog modal
  const draftSelectedMap = useMemo(() => {
    const map = new Map<string, number>();
    draftProdukList.forEach((item) => {
      map.set(item.kode_produk, item.qty);
    });
    return map;
  }, [draftProdukList]);

  // Subtotal dan total item dalam draft modal
  const draftGrandTotal = useMemo(() => {
    return draftProdukList.reduce((acc, curr) => acc + curr.qty * curr.harga_jual, 0);
  }, [draftProdukList]);

  const draftTotalQty = useMemo(() => {
    return draftProdukList.reduce((acc, curr) => acc + curr.qty, 0);
  }, [draftProdukList]);

  // Buka Pop-up Modal Produk: inisialisasi draft dari daftar produk yang sudah ada di cart
  const handleOpenProdukModal = () => {
    if (isReadOnly) return;
    const existingProdukInCart: SelectedProduk[] = cart
      .filter((item) => item.jenis === 'produk')
      .map((item) => {
        const option = produkOptions.find((p) => p.kode_produk === item.kode);
        return {
          kode_produk: item.kode,
          nama: item.nama,
          harga_jual: item.harga_satuan,
          satuan: item.satuan || 'pcs',
          qty: item.qty,
          foto: option?.foto || null,
        };
      });
    setDraftProdukList(existingProdukInCart);
    setModalSearch('');
    setModalCategory('ALL');
    setShowProdukModal(true);
  };

  // Konfirmasi dari Pop-up Modal Produk: terapkan draft ke cart
  const handleConfirmProdukModal = () => {
    const existingLayanan = cart.filter((item) => item.jenis === 'layanan');

    const newProdukCartItems: CartItem[] = draftProdukList.map((item) => {
      const option = produkOptions.find((p) => p.kode_produk === item.kode_produk);
      const subtotal = item.qty * item.harga_jual;
      return {
        jenis: 'produk',
        kode: item.kode_produk,
        nama: item.nama,
        satuan: item.satuan || 'pcs',
        nama_kategori: option?.nama_kategori || 'Produk',
        qty: item.qty,
        harga_satuan: item.harga_jual,
        harga_master: item.harga_jual,
        subtotal: subtotal,
        is_from_pendaftaran: false,
        diskon: 0,
        subtotal_setelah_diskon: subtotal,
      };
    });

    const updatedCart = [...existingLayanan, ...newProdukCartItems];
    setCart(updatedCart);

    if (!selectedKunjungan && newProdukCartItems.length > 0) {
      setSelectedKunjungan({
        kode_kunjungan: '',
        kode_booking: null,
        no_rm: 'WALK-IN',
        nama_pasien: 'Walk-In',
        no_hp: '',
        jam_datang: '',
        dp_nominal: 0,
        dp_status: null,
        metode_pembayaran_dp: null,
      });
    }

    setShowProdukModal(false);
    showSuccess(toast, 'Daftar produk berhasil diterapkan!');
  };

  const handleDraftAddProduk = (prod: ProdukItem) => {
    const now = Date.now();
    if (lastAddRef.current.kode === prod.kode_produk && now - lastAddRef.current.time < 250) {
      return;
    }
    lastAddRef.current = { kode: prod.kode_produk, time: now };

    setDraftProdukList((prev) => {
      const existingIndex = prev.findIndex((p) => p.kode_produk === prod.kode_produk);
      if (existingIndex > -1) {
        return prev.map((p, idx) =>
          idx === existingIndex ? { ...p, qty: p.qty + 1 } : p
        );
      }
      return [
        ...prev,
        {
          kode_produk: prod.kode_produk,
          nama: prod.nama,
          harga_jual: prod.harga_jual,
          satuan: prod.satuan || 'pcs',
          qty: 1,
          foto: prod.foto || null,
        },
      ];
    });
  };

  const handleDraftUpdateQty = (kode_produk: string, delta: number) => {
    setDraftProdukList((prev) =>
      prev
        .map((p) => {
          if (p.kode_produk === kode_produk) {
            const newQty = p.qty + delta;
            return newQty > 0 ? { ...p, qty: newQty } : null;
          }
          return p;
        })
        .filter((p): p is SelectedProduk => p !== null)
    );
  };

  const handleDraftRemoveProduk = (kode_produk: string) => {
    setDraftProdukList((prev) => prev.filter((p) => p.kode_produk !== kode_produk));
  };

  const getItemsPayload = (): CartItem[] => {
    return cart.map((c) => {
      const disc = itemDiscounts[c.kode];
      const isLayanan = Boolean(c.is_from_pendaftaran) || c.jenis === 'layanan' || (c.jenis as string) === 'paket';
      return {
        jenis: c.jenis,
        kode: c.kode,
        nama: c.nama,
        qty: c.qty,
        harga_satuan: c.harga_satuan,
        subtotal: c.subtotal,
        is_from_pendaftaran: isLayanan,
        kode_promo: disc?.promo?.kode_promo || c.kode_promo || null,
        nama_promo: disc?.promo?.nama_promo || c.nama_promo || null,
        jenis_diskon: disc?.promo?.jenis_diskon || c.jenis_diskon || null,
        nilai_diskon: disc?.promo?.nilai_diskon != null ? disc.promo.nilai_diskon : (c.nilai_diskon || null),
        diskon: isLayanan ? 0 : (disc ? disc.diskon : (c.diskon || 0)),
        subtotal_setelah_diskon: isLayanan ? c.subtotal : (disc ? disc.subtotal_setelah_diskon : (c.subtotal_setelah_diskon || (c.subtotal - (c.diskon || 0)))),
      };
    });
  };

  const handleSaveDraft = async () => {
    const currentKunjungan = selectedKunjungan || {
      kode_kunjungan: '',
      kode_booking: null,
      no_rm: 'WALK-IN',
      nama_pasien: 'Walk-In',
      no_hp: '',
      jam_datang: '',
      dp_nominal: 0,
      dp_status: null,
      metode_pembayaran_dp: null,
    };
    if (cart.length === 0) {
      showError(toast, 'Tambahkan minimal 1 item ke cart');
      return;
    }

    setSavingDraft(true);
    try {
      const itemsPayload = getItemsPayload();
      const uniquePromoCodes = [...new Set(selectedPromos.map((p) => p.kode_promo))].join(',');
      const uniquePromoNames = [...new Set(selectedPromos.map((p) => p.nama_promo))].join(', ');

      const payload = {
        kode_transaksi: editingKodeTrx || undefined,
        kode_kunjungan: currentKunjungan.kode_kunjungan || undefined,
        no_rm: currentKunjungan.no_rm,
        items: itemsPayload,
        kode_promo: uniquePromoCodes || undefined,
        nama_promo: uniquePromoNames || undefined,
        total_harga: totalHarga,
        total_diskon: totalDiskon,
        total_bayar: totalBayar,
        metode_bayar: 'tunai',
      };

      const res = await postData('/master/kasir-save', payload);
      if (['00', '0000'].includes(res?.data?.status)) {
        showSuccess(toast, 'Draft transaksi berhasil disimpan');
        onDraftSaved(res.data.data.kode_transaksi);
      } else {
        showError(toast, res?.data?.message || 'Gagal menyimpan draft');
      }
    } catch (err: any) {
      showError(toast, err?.response?.data?.message || err?.message || 'Gagal terhubung ke server');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleBayar = async () => {
    const currentKunjungan = selectedKunjungan || {
      kode_kunjungan: '',
      kode_booking: null,
      no_rm: 'WALK-IN',
      nama_pasien: 'Walk-In',
      no_hp: '',
      jam_datang: '',
      dp_nominal: 0,
      dp_status: null,
      metode_pembayaran_dp: null,
    };
    if (cart.length === 0) { showError(toast, 'Cart masih kosong'); return; }

    setSavingDraft(true);
    try {
      const itemsPayload = getItemsPayload();
      const uniquePromoCodes = [...new Set(selectedPromos.map((p) => p.kode_promo))].join(',');
      const uniquePromoNames = [...new Set(selectedPromos.map((p) => p.nama_promo))].join(', ');

      const payload = {
        kode_transaksi: editingKodeTrx || undefined,
        kode_kunjungan: currentKunjungan.kode_kunjungan || undefined,
        no_rm: currentKunjungan.no_rm,
        items: itemsPayload,
        kode_promo: uniquePromoCodes || undefined,
        nama_promo: uniquePromoNames || undefined,
        total_harga: totalHarga,
        total_diskon: totalDiskon,
        total_bayar: totalBayar,
        metode_bayar: 'tunai',
      };
      const res = await postData('/master/kasir-save', payload);
      if (['00', '0000'].includes(res?.data?.status)) {
        const kodeTrx = res.data.data.kode_transaksi;
        setEditingKodeTrx(kodeTrx);
        onOpenBayar({
          kode_transaksi: kodeTrx,
          total_bayar: totalBayar,
          total_harga: totalHarga,
          dp_nominal: dpNominal,
          metode_pembayaran_dp: metodeDp,
          sisa_bayar: sisaBayar,
          nama_pasien: currentKunjungan.nama_pasien,
          no_rm: currentKunjungan.no_rm,
          items: itemsPayload,
          kode_promo: uniquePromoCodes || null,
          nama_promo: uniquePromoNames || null,
          total_diskon: totalDiskon,
        });
      } else {
        showError(toast, res?.data?.message || 'Gagal menyimpan sebelum bayar');
      }
    } catch (err: any) {
      showError(toast, err?.response?.data?.message || err?.message || 'Gagal terhubung ke server');
    } finally {
      setSavingDraft(false);
    }
  };

  const isReadOnly = trxStatus === 'lunas' || trxStatus === 'batal';

  if (loadingDetail) {
    return (
      <div className="flex align-items-center justify-content-center h-full surface-ground">
        <ProgressSpinner style={{ width: '32px', height: '32px' }} />
        <span className="ml-2 text-sm text-500 font-medium">Memuat rincian transaksi...</span>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden flex flex-column" style={{ minHeight: 0, minWidth: 0 }}>
      {/* RINCIAN TRANSAKSI KASIR */}
      <div className="flex flex-column h-full w-full surface-card border-round-xl border-1 surface-border shadow-1 overflow-hidden" style={{ minHeight: 0, minWidth: 0 }}>
        {/* Panel Header */}
        <div className="p-3 border-bottom-1 surface-border bg-white flex-shrink-0 flex align-items-center justify-content-between">
          <label className="text-xs font-extrabold text-teal-800 uppercase tracking-wider flex align-items-center gap-2 m-0">
            <i className="pi pi-user text-teal-600 text-sm" />
            RINCIAN TRANSAKSI KASIR
          </label>
          <div className="flex align-items-center gap-2">
            {editingKodeTrx && (
              <span className="text-xs font-medium text-slate-600 mr-2">
                {editingKodeTrx}
              </span>
            )}
            {!isReadOnly && (
              <Button
                type="button"
                label={cart.some((c) => c.jenis === 'produk') ? "Ubah / Tambah Produk" : "Tambah Produk"}
                icon={cart.some((c) => c.jenis === 'produk') ? "pi pi-pencil" : "pi pi-plus"}
                size="small"
                className="text-xs font-bold py-1.5 px-3 border-round-lg bg-teal-600 text-white border-none hover:bg-teal-700 shadow-1 transition-all"
                onClick={handleOpenProdukModal}
              />
            )}
          </div>
        </div>

        {/* Table Area (Scrollable Items) */}
        <div className="flex-1 p-3 surface-ground flex flex-column overflow-hidden" style={{ minHeight: 0 }}>
          <div
            className="surface-card border-round-xl border-1 surface-border flex-1 min-h-0 overflow-y-auto overflow-x-hidden kasir-scroll-area flex flex-column"
            style={{ boxSizing: 'border-box' }}
          >
            {cart.length === 0 ? (
              <div
                className="text-center py-4 px-3 surface-card border-1 border-dashed surface-border border-round-xl flex-1 flex flex-column align-items-center justify-content-center gap-2 my-auto"
                style={{ minHeight: '160px' }}
              >
                <div
                  className="flex align-items-center justify-content-center"
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    background: '#f1f5f9',
                    color: '#94a3b8',
                  }}
                >
                  <ShoppingBag size={18} />
                </div>
                <span className="text-xs text-600 font-semibold">Belum ada item transaksi</span>
                {!isReadOnly && (
                  <Button
                    type="button"
                    label="Tambah Produk"
                    icon="pi pi-plus"
                    size="small"
                    outlined
                    className="text-xs font-bold mt-1 text-teal-700 border-teal-400 hover:bg-teal-50"
                    onClick={handleOpenProdukModal}
                  />
                )}
              </div>
            ) : (
              <>
                {/* Sticky Table Header */}
                <div
                  className="kasir-table-grid"
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 5,
                    minHeight: '48px',
                    padding: '14px 16px',
                    backgroundColor: '#f0fdfa',
                    borderBottom: '1px solid #e2e8f0',
                    borderTopLeftRadius: '12px',
                    borderTopRightRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#115e59',
                    letterSpacing: '0.03em',
                    boxSizing: 'border-box',
                    alignItems: 'center',
                  }}
                >
                  <div className="text-left font-semibold truncate flex align-items-center">Item</div>
                  <div className="text-center font-semibold truncate flex align-items-center justify-content-center" style={{ whiteSpace: 'nowrap' }}>Qty</div>
                  <div className="text-center font-semibold kasir-col-responsive-hide justify-content-center align-items-center truncate" style={{ whiteSpace: 'nowrap' }}>Harga Satuan</div>
                  <div className="text-center font-semibold kasir-col-responsive-hide justify-content-center align-items-center truncate" style={{ whiteSpace: 'nowrap' }}>Diskon</div>
                  <div className="text-center font-semibold justify-content-center align-items-center truncate flex" style={{ whiteSpace: 'nowrap' }}>Subtotal</div>
                </div>

                {/* Table Rows */}
                <div className="flex flex-column flex-1">
                  {cart.map((item, idx) => {
                    const disc = itemDiscounts[item.kode];
                    const activePromo = disc?.promo || selectedPromos.find((p) => p.kode_item === item.kode) || (item.kode_promo ? {
                      kode_detail_promo: `item_${item.kode_promo}_${item.kode}`,
                      kode_promo: item.kode_promo,
                      nama_promo: item.nama_promo || item.kode_promo,
                      jenis_diskon: (item.jenis_diskon as any) || 'persen',
                      nilai_diskon: item.nilai_diskon != null ? Number(item.nilai_diskon) : 0,
                      kode_item: item.kode,
                      nama_item: item.nama,
                    } : null);

                    const baseSubtotal = item.harga_satuan * item.qty;
                    const isFromPendaftaran = Boolean(item.is_from_pendaftaran);

                    // Diskon kasir (hanya untuk item tambahan kasir non-pendaftaran yang dipotong di kasir)
                    const diskonSubtotal = !isFromPendaftaran
                      ? (disc
                        ? disc.diskon
                        : (item.diskon && item.diskon > 0
                          ? item.diskon
                          : (item.nilai_diskon && item.nilai_diskon > 0
                            ? (item.jenis_diskon === 'nominal'
                              ? Math.min(item.nilai_diskon * item.qty, baseSubtotal)
                              : (baseSubtotal * item.nilai_diskon) / 100)
                            : 0)))
                      : 0;

                    const isPersen = activePromo?.jenis_diskon === 'persen' || (!activePromo && (!item.jenis_diskon || item.jenis_diskon === 'persen'));
                    const isNominal = activePromo?.jenis_diskon === 'nominal' || (!activePromo && item.jenis_diskon === 'nominal');

                    const activeNilaiDiskon = activePromo?.nilai_diskon != null && Number(activePromo.nilai_diskon) > 0
                      ? Number(activePromo.nilai_diskon)
                      : (item.nilai_diskon != null && Number(item.nilai_diskon) > 0 ? Number(item.nilai_diskon) : null);

                    const displayDiskonPersen = isPersen && activeNilaiDiskon != null && activeNilaiDiskon > 0
                      ? Math.round(activeNilaiDiskon)
                      : (!isFromPendaftaran && baseSubtotal > 0 && diskonSubtotal > 0 ? Math.round((diskonSubtotal / baseSubtotal) * 100) : null);

                    const displayDiskonNominal = isNominal && activeNilaiDiskon != null && activeNilaiDiskon > 0
                      ? activeNilaiDiskon
                      : (!isFromPendaftaran && diskonSubtotal > 0 && !displayDiskonPersen ? diskonSubtotal : null);

                    const activePromoName = activePromo?.nama_promo || item.nama_promo || null;

                    const subtotalSetelahDiskon = !isFromPendaftaran
                      ? (disc
                        ? disc.subtotal_setelah_diskon
                        : (item.subtotal_setelah_diskon != null && item.subtotal_setelah_diskon > 0 && item.subtotal_setelah_diskon < baseSubtotal
                          ? item.subtotal_setelah_diskon
                          : Math.max(0, baseSubtotal - diskonSubtotal)))
                      : baseSubtotal;

                    // Harga master / harga asli sebelum diskon
                    const masterPrice = item.harga_master ||
                      layananList.find((l) => l.kode === item.kode)?.harga ||
                      produkOptions.find((p) => p.kode_produk === item.kode)?.harga_jual;

                    const displayHargaSatuan = (masterPrice && masterPrice > 0)
                      ? masterPrice
                      : (isFromPendaftaran && displayDiskonPersen && displayDiskonPersen > 0 && displayDiskonPersen < 100
                          ? Math.round((item.harga_satuan / (100 - displayDiskonPersen)) * 100)
                          : (isFromPendaftaran && displayDiskonNominal && displayDiskonNominal > 0
                              ? item.harga_satuan + displayDiskonNominal
                              : item.harga_satuan));

                    return (
                      <div
                        key={`${item.jenis}_${item.kode}_${idx}`}
                        className="kasir-table-grid hover:bg-slate-50 transition-colors"
                        style={{
                          minHeight: '58px',
                          padding: '10px 16px',
                          borderBottom: idx === cart.length - 1 ? 'none' : '1px solid #f1f5f9',
                          boxSizing: 'border-box',
                        }}
                      >
                        {/* Kolom 1: Item */}
                        <div className="flex flex-column text-left min-w-0 pr-2" style={{ gap: '2px' }}>
                          <span
                            className="font-semibold text-sm text-slate-900 leading-tight"
                            title={item.nama}
                            style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              wordBreak: 'normal',
                              overflowWrap: 'break-word',
                            }}
                          >
                            {item.nama}
                          </span>
                          <div className="text-xs text-slate-500 font-normal flex align-items-center flex-wrap" style={{ gap: '6px' }}>
                            <span>
                              {item.nama_kategori || (item.jenis === 'layanan' ? 'Layanan' : (item.satuan ? `Produk (${item.satuan})` : 'Produk'))}
                            </span>
                            {activePromoName && (
                              <span className="font-semibold text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 border-round">
                                Promo: {activePromoName}
                              </span>
                            )}
                            <span className="kasir-desc-responsive-show text-slate-600 font-medium">
                              · {formatRupiah(displayHargaSatuan)}
                              {displayDiskonPersen && displayDiskonPersen > 0 ? ` (Disc ${displayDiskonPersen}%)` : (displayDiskonNominal && displayDiskonNominal > 0 ? ` (Disc -${formatRupiah(displayDiskonNominal)})` : '')}
                            </span>
                          </div>
                        </div>

                        {/* Kolom 2: Qty */}
                        <div className="flex justify-content-center align-items-center text-center">
                          <span className="font-semibold text-sm text-slate-800 tabular-nums">
                            {item.qty}
                          </span>
                        </div>

                        {/* Kolom 3: Harga Satuan (Centered) */}
                        <div className="kasir-col-responsive-hide justify-content-center align-items-center text-center">
                          <span className="font-medium text-xs text-slate-700 tabular-nums" style={{ whiteSpace: 'nowrap' }}>
                            {formatRupiah(displayHargaSatuan)}
                          </span>
                        </div>

                        {/* Kolom 4: Diskon (Pemberitahuan persentase/nominal diskon) */}
                        <div className="kasir-col-responsive-hide justify-content-center align-items-center text-center">
                          {displayDiskonPersen && displayDiskonPersen > 0 ? (
                            <span className="font-semibold text-xs text-emerald-600 tabular-nums" style={{ whiteSpace: 'nowrap' }}>
                              {displayDiskonPersen}%
                            </span>
                          ) : displayDiskonNominal && displayDiskonNominal > 0 ? (
                            <span className="font-semibold text-xs text-emerald-600 tabular-nums" style={{ whiteSpace: 'nowrap' }}>
                              -{formatRupiah(displayDiskonNominal)}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs tabular-nums" style={{ whiteSpace: 'nowrap' }}>0%</span>
                          )}
                        </div>

                        {/* Kolom 5: Subtotal (Centered) */}
                        <div className="flex justify-content-center align-items-center text-center">
                          {!isFromPendaftaran && diskonSubtotal > 0 ? (
                            <div className="flex flex-column align-items-center" style={{ gap: '2px', whiteSpace: 'nowrap' }}>
                              <span className="text-slate-400 line-through text-[10px] font-normal tabular-nums leading-none">
                                {formatRupiah(baseSubtotal)}
                              </span>
                              <span className="font-bold text-xs text-teal-800 tabular-nums leading-tight">
                                {formatRupiah(subtotalSetelahDiskon)}
                              </span>
                            </div>
                          ) : (
                            <span className="font-bold text-xs text-teal-800 tabular-nums" style={{ whiteSpace: 'nowrap' }}>
                              {formatRupiah(baseSubtotal)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer Summary & Actions */}
        <div
          className="p-3 border-top-1 surface-border bg-white flex-shrink-0 flex flex-column kasir-pos-footer"
          style={{ marginTop: 'auto', gap: '12px' }}
        >
          {/* Baris Ringkas Voucher / Promo Diskon Ala Shopee */}
          <div>
            <div
              onClick={() => setShowVoucherModal(true)}
              className="surface-card border-round-xl border-1 surface-border hover:border-teal-500 hover:shadow-2 cursor-pointer flex align-items-center justify-content-between transition-all"
              style={{
                minHeight: '48px',
                padding: '12px 16px',
                gap: '10px',
                boxSizing: 'border-box',
              }}
            >
              {/* Kiri: Icon + Label */}
              <div className="flex align-items-center flex-1 min-w-0" style={{ gap: '10px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <i className="pi pi-ticket text-white text-xs" />
                </div>
                <span
                  className="font-extrabold text-xs text-slate-800 truncate"
                  title="Voucher / Promo Diskon"
                >
                  Voucher / Promo Diskon
                </span>
              </div>

              {/* Kanan: Ringkasan Status */}
              <div className="flex align-items-center flex-shrink-0" style={{ gap: '8px' }}>
                {selectedPromos.length > 0 ? (
                  <span
                    className="font-extrabold bg-teal-100 text-teal-800 border-round-md"
                    style={{ fontSize: '10px', padding: '2px 8px', whiteSpace: 'nowrap' }}
                  >
                    {selectedPromos.length} promo dipakai
                  </span>
                ) : eligiblePromoCount > 0 && !isReadOnly ? (
                  <span
                    className="font-extrabold bg-amber-100 text-amber-800 border-round-md"
                    style={{ fontSize: '10px', padding: '2px 8px', whiteSpace: 'nowrap' }}
                  >
                    {eligiblePromoCount} promo tersedia
                  </span>
                ) : (
                  <span className="text-slate-400 font-medium text-xs" style={{ whiteSpace: 'nowrap' }}>
                    {isReadOnly ? 'Tanpa Promo' : 'Pilih atau masukkan kode'}
                  </span>
                )}
                <i className="pi pi-chevron-right text-slate-400 text-xs" />
              </div>
            </div>
          </div>

          {/* Totals Summary */}
          <div
            className="surface-card border-round-xl border-1 surface-border shadow-1 flex flex-column"
            style={{ padding: '16px', gap: '8px', boxSizing: 'border-box' }}
          >
            {/* 1. Subtotal Layanan & Produk */}
            <div className="flex justify-content-between align-items-center text-xs text-slate-600 font-normal">
              <span>Subtotal Layanan & Produk</span>
              <span>{formatRupiah(totalHarga)}</span>
            </div>

            {/* 2. Voucher Diskon (warna hijau, hanya tampil jika ada diskon) */}
            {totalDiskon > 0 && (
              <div className="flex justify-content-between align-items-center text-xs text-emerald-600 font-normal">
                <span>Voucher Diskon</span>
                <span>-{formatRupiah(totalDiskon)}</span>
              </div>
            )}

            {dpNominal > 0 && (
              <div className="flex justify-content-between align-items-center text-xs text-teal-700 font-medium">
                <span className="flex align-items-center" style={{ gap: '6px' }}>
                  <i className="pi pi-check-circle text-xs text-teal-600" />
                  Uang Muka (DP {metodeDp ? metodeDp.toUpperCase() : 'Terbayar'})
                </span>
                <span className="font-semibold text-teal-800">-{formatRupiah(dpNominal)}</span>
              </div>
            )}

            {/* 3. TOTAL BAYAR (paling menonjol) */}
            <div className="flex justify-content-between align-items-center pt-2 border-top-1 surface-border">
              <div>
                <span className="font-extrabold text-xs text-slate-800 uppercase tracking-wide block">
                  {dpNominal > 0 ? 'Sisa Pelunasan' : 'TOTAL BAYAR'}
                </span>
              </div>
              <span className="font-black text-base text-teal-700">
                {formatRupiah(dpNominal > 0 ? sisaBayar : totalBayar)}
              </span>
            </div>
          </div>

          {/* Actions */}
          {!isReadOnly && (
            <div className="flex gap-2">
              <Button
                label="Draft"
                icon="pi pi-save"
                outlined
                severity="secondary"
                onClick={handleSaveDraft}
                loading={savingDraft}
                disabled={cart.length === 0}
                className="font-bold text-xs border-round-lg flex-1 py-2"
              />
              <Button
                label={dpNominal > 0 ? 'Pelunasan' : 'Bayar'}
                icon="pi pi-credit-card"
                severity="success"
                onClick={handleBayar}
                loading={savingDraft}
                disabled={cart.length === 0}
                className="font-bold text-xs bg-teal-600 border-none border-round-lg text-white shadow-2 flex-1 py-2"
              />
            </div>
          )}

          {isReadOnly && trxStatus === 'lunas' && (
            <div className="flex gap-2">
              <Button
                label="Cetak Struk"
                icon="pi pi-print"
                severity="success"
                onClick={() => {
                  if (onOpenStruk) {
                    onOpenStruk({
                      kode_transaksi: editingKodeTrx || '',
                      metode_bayar: 'tunai',
                      total_harga: totalHarga,
                      total_diskon: totalDiskon,
                      total_bayar: totalBayar,
                      dp_nominal: dpNominal,
                      metode_pembayaran_dp: metodeDp,
                      sisa_bayar: sisaBayar,
                      nominal_bayar: totalBayar,
                      kembalian: 0,
                      nama_pasien: selectedKunjungan?.nama_pasien,
                      no_rm: selectedKunjungan?.no_rm,
                      items: cart.map((c) => {
                        const disc = itemDiscounts[c.kode];
                        return {
                          ...c,
                          diskon: disc ? disc.diskon : (c.diskon || 0),
                          subtotal_setelah_diskon: disc ? disc.subtotal_setelah_diskon : (c.subtotal_setelah_diskon || c.subtotal),
                          nama_promo: disc?.promo?.nama_promo || c.nama_promo || null,
                          jenis_diskon: disc?.promo?.jenis_diskon || c.jenis_diskon || null,
                          nilai_diskon: disc?.promo?.nilai_diskon != null ? disc.promo.nilai_diskon : (c.nilai_diskon || null),
                        };
                      }),
                      kode_promo: [...new Set(selectedPromos.map((p) => p.kode_promo))].join(','),
                      nama_promo: [...new Set(selectedPromos.map((p) => p.nama_promo))].join(', '),
                    });
                  }
                }}
                className="font-bold text-xs bg-teal-600 hover:bg-teal-700 border-none border-round-lg text-white shadow-2 flex-1 py-2"
              />
            </div>
          )}
        </div>
      </div>

      {/* POPUP MODAL KATALOG PRODUK (PERSIS SEPERTI DI MENU TINDAKAN) */}
      <Dialog
        visible={showProdukModal}
        onHide={() => setShowProdukModal(false)}
        closable={false}
        header={
          <div className="flex align-items-center justify-content-between w-full">
            <div className="flex align-items-center gap-3">
              <div
                className="flex align-items-center justify-content-center flex-shrink-0"
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  color: '#0C8F62',
                }}
              >
                <ShoppingBag size={20} />
              </div>
              <div className="flex flex-column gap-0.5">
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', lineHeight: 1.25 }}>
                  Pilih Produk Tambahan Kasir
                </span>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 400 }}>
                  Cari produk, atur kuantitas, dan lihat subtotal rincian tagihan kasir
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowProdukModal(false)}
              className="flex align-items-center justify-content-center cursor-pointer transition-colors"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                color: '#64748b',
                padding: 0,
              }}
              title="Tutup dialog"
            >
              <X size={16} />
            </button>
          </div>
        }
        style={{ width: '980px', maxWidth: '96vw', borderRadius: '16px', overflow: 'hidden' }}
        contentStyle={{ backgroundColor: '#ffffff', padding: '16px 20px', maxHeight: '80vh', overflowY: 'auto' }}
        headerStyle={{ backgroundColor: '#ffffff', borderBottom: '1px solid #f1f5f9', padding: '14px 20px' }}
        modal
        className="p-fluid"
        footer={
          <div
            className="flex align-items-center justify-content-between w-full flex-wrap gap-2 pt-2"
            style={{
              backgroundColor: '#ffffff',
              borderTop: '1px solid #f1f5f9',
            }}
          >
            <div className="flex align-items-baseline gap-1.5 text-left">
              <span style={{ fontSize: '13px', color: '#64748b' }}>
                Subtotal produk ({draftTotalQty} item):
              </span>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                {formatRupiah(draftGrandTotal)}
              </span>
            </div>
            <div className="flex align-items-center gap-2">
              <button
                type="button"
                onClick={() => setShowProdukModal(false)}
                className="flex align-items-center justify-content-center gap-1.5 cursor-pointer transition-colors"
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '7px 16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#475569',
                }}
              >
                <X size={14} />
                <span>Batal</span>
              </button>
              <button
                type="button"
                onClick={handleConfirmProdukModal}
                className="flex align-items-center justify-content-center gap-1.5 cursor-pointer transition-colors"
                style={{
                  backgroundColor: '#0C8F62',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '7px 20px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#ffffff',
                  boxShadow: '0 1px 4px rgba(12, 143, 98, 0.25)',
                }}
              >
                <CheckCircle2 size={15} />
                <span>Konfirmasi & Terapkan</span>
              </button>
            </div>
          </div>
        }
      >
        <div className="grid pt-0 m-0">
          {/* KOLOM KIRI: KATALOG PRODUK */}
          <div className="col-12 lg:col-7 p-0 flex flex-column border-bottom-1 lg:border-bottom-none lg:border-right-1 surface-border pb-3 lg:pb-0 lg:pr-3">
            {/* Search, Filter Kategori & Refresh */}
            <div className="flex align-items-center gap-2 mb-3">
              {/* Search Input */}
              <div className="relative flex-1" style={{ minWidth: '170px' }}>
                <span
                  className="absolute left-0 top-0 bottom-0 flex align-items-center pl-3 pointer-events-none text-slate-400"
                  style={{ zIndex: 1 }}
                >
                  <Search size={15} />
                </span>
                <input
                  type="text"
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  placeholder="Cari nama atau kode produk..."
                  className="w-full"
                  style={{
                    height: '36px',
                    padding: '0 30px 0 32px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#ffffff',
                    color: '#1e293b',
                    outline: 'none',
                    fontSize: '12px',
                  }}
                  autoFocus
                />
                {modalSearch && (
                  <button
                    type="button"
                    onClick={() => setModalSearch('')}
                    className="absolute right-0 top-0 bottom-0 flex align-items-center pr-2.5 border-none bg-transparent text-slate-400 hover:text-slate-700 cursor-pointer"
                    style={{ zIndex: 2 }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Dropdown Filter Kategori */}
              <div className="relative flex-shrink-0" style={{ minWidth: '140px', maxWidth: '160px' }}>
                <select
                  value={modalCategory}
                  onChange={(e) => setModalCategory(e.target.value)}
                  className="w-full cursor-pointer appearance-none"
                  style={{
                    height: '36px',
                    padding: '0 30px 0 10px',
                    borderRadius: '8px',
                    border: modalCategory !== 'ALL' ? '1.5px solid #0C8F62' : '1px solid #e2e8f0',
                    backgroundColor: modalCategory !== 'ALL' ? '#f0fdf4' : '#ffffff',
                    color: modalCategory !== 'ALL' ? '#0C8F62' : '#334155',
                    fontWeight: modalCategory !== 'ALL' ? 600 : 500,
                    fontSize: '12px',
                    outline: 'none',
                  }}
                  title="Filter berdasarkan kategori"
                >
                  <option value="ALL">Semua Kategori</option>
                  {availableCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <span
                  className="absolute top-0 bottom-0 flex align-items-center pointer-events-none"
                  style={{ right: '12px', color: modalCategory !== 'ALL' ? '#0C8F62' : '#94a3b8' }}
                >
                  <ChevronDown size={14} />
                </span>
              </div>

              {/* Tombol Refresh */}
              <button
                type="button"
                onClick={() => fetchProdukOptions()}
                disabled={loadingProduk}
                className="flex align-items-center justify-content-center cursor-pointer transition-colors"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#ffffff',
                  color: '#475569',
                  flexShrink: 0,
                }}
                title="Segarkan data produk"
              >
                <RotateCcw size={15} className={loadingProduk ? 'animate-spin' : ''} />
              </button>
            </div>

            {/* Grid Katalog Produk (2 Kolom) */}
            <div
              className="overflow-y-auto pr-1 custom-thin-scrollbar"
              style={{ height: '460px' }}
            >
              {loadingProduk ? (
                <div className="flex flex-column align-items-center justify-content-center h-full py-5">
                  <ProgressSpinner style={{ width: '28px', height: '28px' }} />
                  <p className="text-xs text-slate-500 m-0 mt-2">Memuat daftar produk...</p>
                </div>
              ) : modalFilteredProduk.length === 0 ? (
                <div className="flex flex-column align-items-center justify-content-center h-full text-center py-5">
                  <ShoppingBag size={28} className="text-slate-300 mb-2" />
                  <span className="text-xs text-slate-500 font-medium">Tidak ada produk yang cocok dengan pencarian / filter.</span>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                  {modalFilteredProduk.map((prod) => {
                    const selectedQty = draftSelectedMap.get(prod.kode_produk) || 0;
                    const isSelected = selectedQty > 0;
                    const badgeStyle = getCategoryBadgeStyle(prod.nama_kategori);

                    return (
                      <div
                        key={prod.kode_produk}
                        onClick={() => handleDraftAddProduk(prod)}
                        className="cursor-pointer transition-all"
                        style={{
                          backgroundColor: '#ffffff',
                          border: isSelected ? '1.5px solid #0C8F62' : '1px solid #e2e8f0',
                          borderRadius: '10px',
                          overflow: 'hidden',
                          boxShadow: isSelected ? '0 0 0 1px #0C8F62, 0 2px 8px rgba(12, 143, 98, 0.12)' : '0 1px 3px rgba(0,0,0,0.03)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          position: 'relative',
                        }}
                      >
                        {/* Area Gambar */}
                        <div
                          style={{
                            height: '112px',
                            backgroundColor: '#ffffff',
                            borderBottom: '1px solid #f1f5f9',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                            padding: '6px',
                          }}
                        >
                          {prod.foto ? (
                            <img
                              src={prod.foto}
                              alt={prod.nama}
                              style={{
                                maxWidth: '100%',
                                maxHeight: '100%',
                                objectFit: 'contain',
                                display: 'block',
                              }}
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="flex align-items-center justify-content-center text-slate-300">
                              <ShoppingBag size={28} strokeWidth={1.5} />
                            </div>
                          )}

                          {/* Selected Badge */}
                          {isSelected && (
                            <div
                              style={{
                                position: 'absolute',
                                top: '6px',
                                right: '6px',
                                backgroundColor: '#0C8F62',
                                color: '#ffffff',
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '2px 7px',
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                                boxShadow: '0 1px 4px rgba(12,143,98,0.35)',
                              }}
                            >
                              <CheckCircle2 size={11} strokeWidth={2.5} />
                              <span>x{selectedQty}</span>
                            </div>
                          )}
                        </div>

                        {/* Info Produk */}
                        <div style={{ padding: '10px 10px 8px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1 }}>
                          <div>
                            {/* Baris 1: Nama Produk */}
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: '12.5px',
                                color: '#1e293b',
                                lineHeight: 1.3,
                                minHeight: '33px',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                              title={prod.nama}
                            >
                              {prod.nama}
                            </div>

                            {/* Baris 2: SKU & Kategori */}
                            <div className="flex align-items-center justify-content-between gap-1 mt-1">
                              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                {prod.kode_produk}
                              </span>
                              {prod.nama_kategori && (
                                <span
                                  style={{
                                    backgroundColor: '#ffffff',
                                    border: `1px solid ${badgeStyle.borderColor}`,
                                    color: badgeStyle.color,
                                    fontSize: '9.5px',
                                    fontWeight: 600,
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                    whiteSpace: 'nowrap',
                                    flexShrink: 0,
                                    lineHeight: 1.2,
                                  }}
                                >
                                  {prod.nama_kategori}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Baris 3: Harga & Tombol + */}
                          <div className="flex align-items-center justify-content-between pt-2 mt-2" style={{ borderTop: '1px solid #f1f5f9' }}>
                            <div className="flex align-items-baseline gap-1 min-w-0">
                              <span style={{ fontWeight: 700, fontSize: '12.5px', color: '#0f172a' }}>
                                {formatRupiah(prod.harga_jual)}
                              </span>
                              <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                                /{prod.satuan || 'pcs'}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDraftAddProduk(prod);
                              }}
                              className="flex align-items-center justify-content-center cursor-pointer transition-transform active:scale-95 flex-shrink-0"
                              style={{
                                width: '26px',
                                height: '26px',
                                borderRadius: '50%',
                                backgroundColor: '#0C8F62',
                                border: 'none',
                                color: '#ffffff',
                                boxShadow: '0 1px 3px rgba(12,143,98,0.3)',
                              }}
                              title="Tambah ke produk terpilih"
                            >
                              <Plus size={14} strokeWidth={2.5} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* KOLOM KANAN: PRODUK TERPILIH */}
          <div className="col-12 lg:col-5 p-0 flex flex-column lg:pl-3">
            <div
              style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '8px 14px 12px 14px',
                height: '508px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              {/* Header Panel */}
              <div className="flex align-items-center pb-2" style={{ borderBottom: '1px solid #e2e8f0', gap: '8px' }}>
                <ShoppingBag size={15} color="#0C8F62" className="flex-shrink-0" />
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#1e293b', letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                  PRODUK TERPILIH ({draftProdukList.length})
                </span>
              </div>

              {/* List Item Terpilih / Empty State */}
              <div className="flex-1 flex flex-column overflow-hidden mt-2">
                {draftProdukList.length === 0 ? (
                  <div className="flex flex-column align-items-center justify-content-center text-center h-full py-4">
                    <div
                      className="flex align-items-center justify-content-center mb-2.5"
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '10px',
                        backgroundColor: '#ffffff',
                        border: '1px solid #e2e8f0',
                        color: '#94a3b8',
                      }}
                    >
                      <ShoppingBag size={20} strokeWidth={1.5} />
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#1e293b', marginBottom: '3px' }}>
                      Belum ada produk dipilih
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', maxWidth: '210px', lineHeight: 1.4 }}>
                      Klik ikon + pada produk di katalog kiri untuk menambahkannya ke sini.
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-column gap-1.5 overflow-y-auto pr-1 custom-thin-scrollbar h-full">
                    {draftProdukList.map((item) => {
                      const itemSubtotal = item.qty * item.harga_jual;
                      return (
                        <div
                          key={item.kode_produk}
                          className="flex align-items-center justify-content-between gap-2 transition-all"
                          style={{
                            backgroundColor: '#ffffff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            padding: '6px 8px',
                          }}
                        >
                          {/* Thumbnail Foto */}
                          <div
                            className="flex-shrink-0 flex align-items-center justify-content-center"
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '6px',
                              border: '1px solid #f1f5f9',
                              backgroundColor: '#ffffff',
                              overflow: 'hidden',
                              padding: '2px',
                            }}
                          >
                            {item.foto ? (
                              <img
                                src={item.foto}
                                alt={item.nama}
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <ShoppingBag size={15} color="#0C8F62" style={{ opacity: 0.6 }} />
                            )}
                          </div>

                          {/* Info: Nama & Satuan */}
                          <div className="flex-1 min-w-0 flex flex-column gap-0.5 justify-content-center">
                            <div className="flex align-items-center gap-1.5">
                              <span
                                style={{
                                  fontWeight: 600,
                                  fontSize: '12px',
                                  color: '#1e293b',
                                  lineHeight: 1.25,
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                                title={item.nama}
                              >
                                {item.nama}
                              </span>
                              {item.is_rekomendasi_dokter && (
                                <span
                                  style={{
                                    fontSize: '9px',
                                    fontWeight: 700,
                                    padding: '1px 4px',
                                    borderRadius: '3px',
                                    backgroundColor: '#FEF3C7',
                                    color: '#B45309',
                                    border: '1px solid #FDE68A',
                                    flexShrink: 0,
                                  }}
                                >
                                  Resep
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#64748b' }}>
                              {formatRupiah(item.harga_jual)} / {item.satuan || 'pcs'}
                            </div>
                          </div>

                          {/* Stepper Kuantitas */}
                          <div className="flex align-items-center gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => handleDraftUpdateQty(item.kode_produk, -1)}
                              className="flex align-items-center justify-content-center cursor-pointer transition-colors"
                              style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '5px',
                                border: '1px solid #cbd5e1',
                                backgroundColor: '#ffffff',
                                color: '#475569',
                                fontSize: '11px',
                                fontWeight: 700,
                              }}
                              title="Kurangi kuantitas"
                            >
                              −
                            </button>
                            <span
                              style={{
                                fontWeight: 700,
                                fontSize: '11.5px',
                                color: '#0f172a',
                                minWidth: '18px',
                                textAlign: 'center',
                              }}
                            >
                              {item.qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDraftUpdateQty(item.kode_produk, 1)}
                              className="flex align-items-center justify-content-center cursor-pointer transition-colors"
                              style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '5px',
                                border: 'none',
                                backgroundColor: '#0C8F62',
                                color: '#ffffff',
                                fontSize: '11px',
                                fontWeight: 700,
                              }}
                              title="Tambah kuantitas"
                            >
                              +
                            </button>
                          </div>

                          {/* Subtotal Item */}
                          <div className="text-right flex-shrink-0" style={{ minWidth: '66px' }}>
                            <span style={{ fontWeight: 600, fontSize: '11.5px', color: '#0f172a' }}>
                              {formatRupiah(itemSubtotal)}
                            </span>
                          </div>

                          {/* Tombol Hapus */}
                          <button
                            type="button"
                            onClick={() => handleDraftRemoveProduk(item.kode_produk)}
                            className="border-none bg-transparent cursor-pointer p-0.5 flex-shrink-0 text-slate-400 hover:text-red-500 transition-colors flex align-items-center justify-content-center"
                            title="Hapus produk"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Ringkasan Bawah Panel */}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '10px', marginTop: '10px' }}>
                <div className="flex align-items-center justify-content-between mb-1" style={{ fontSize: '11.5px', color: '#64748b' }}>
                  <span>Total item</span>
                  <span style={{ fontWeight: 600, color: '#334155' }}>{draftTotalQty} item</span>
                </div>
                <div className="flex align-items-center justify-content-between">
                  <span style={{ fontWeight: 600, fontSize: '12.5px', color: '#1e293b' }}>Subtotal produk</span>
                  <span style={{ fontWeight: 700, fontSize: '15px', color: '#0C8F62' }}>{formatRupiah(draftGrandTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Dialog>

      {/* MODAL VOUCHER / PROMO DISKON ALA SHOPEE */}
      <KasirVoucherModal
        visible={showVoucherModal}
        onHide={() => setShowVoucherModal(false)}
        promoList={promoList}
        cart={cart}
        selectedPromos={selectedPromos}
        readOnly={isReadOnly}
        onApply={(newPromos) => {
          setSelectedPromos(newPromos);
          showSuccess(toast, `${newPromos.length} promo berhasil diterapkan`);
        }}
        onNotifyConflict={(msg) => {
          showWarning(toast, msg);
        }}
      />

      <ConfirmDialog />

      <style jsx global>{`
        .kasir-table-grid {
          display: grid;
          align-items: center;
          box-sizing: border-box;
          width: 100%;
        }

        @media (min-width: 1024px) {
          .kasir-table-grid,
          .kasir-table-grid-action,
          .kasir-table-grid-readonly {
            grid-template-columns: minmax(130px, 1.5fr) 1fr 1fr 1fr 1fr;
          }
          .kasir-col-responsive-hide {
            display: flex !important;
            align-items: center;
            justify-content: center;
          }
          .kasir-desc-responsive-show {
            display: none !important;
          }
        }

        @media (max-width: 1023px) {
          .kasir-table-grid,
          .kasir-table-grid-action,
          .kasir-table-grid-readonly {
            grid-template-columns: minmax(110px, 1.5fr) 1fr 1fr;
          }
          .kasir-col-responsive-hide {
            display: none !important;
          }
          .kasir-desc-responsive-show {
            display: inline-flex !important;
          }
        }
      `}</style>
    </div>
  );
};
