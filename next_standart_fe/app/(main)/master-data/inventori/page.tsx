'use client';

import { useEffect, useRef, useState } from 'react';
import postData from '@/lib/axios/postData';
import { Toast } from 'primereact/toast';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Dialog } from 'primereact/dialog';
import { Tag } from 'primereact/tag';
import { Dropdown } from 'primereact/dropdown';
import { Divider } from 'primereact/divider';
import { Checkbox } from 'primereact/checkbox';
import { RadioButton } from 'primereact/radiobutton';
import { TabView, TabPanel } from 'primereact/tabview';
import { confirmDialog, ConfirmDialog } from 'primereact/confirmdialog';
import { IconField } from 'primereact/iconfield';
import { InputIcon } from 'primereact/inputicon';
import { showError, showSuccess } from '@/lib/tools/generalTools';
import KeteranganStatus from '@/app/components/KeteranganStatus';

const Page = () => {
    const toast = useRef<Toast>(null);

    // Active Tab Index
    const [activeIndex, setActiveIndex] = useState<number>(0);

    // ==========================================
    // TAB 1: STOK INVENTORI PRODUK STATE
    // ==========================================
    const [dataProduk, setDataProduk] = useState<any[]>([]);
    const [loadingProduk, setLoadingProduk] = useState<boolean>(false);
    const [totalRecords, setTotalRecords] = useState<number>(0);
    const [page, setPage] = useState<number>(1);
    const [rows, setRows] = useState<number>(10);
    const [keyword, setKeyword] = useState<string>('');
    const [filterStatusStok, setFilterStatusStok] = useState<string>('');
    const [filterKategori, setFilterKategori] = useState<string>('');
    const [filterSupplier, setFilterSupplier] = useState<string>('');
    const [selectedRows, setSelectedRows] = useState<any[]>([]);

    // Ringkasan KPI
    const [summary, setSummary] = useState<any>({
        total_sku: 0,
        total_stok_unit: 0,
        stok_menipis: 0,
        stok_habis: 0,
        total_aset: 0,
    });

    // Dropdown options
    const [kategoriList, setKategoriList] = useState<any[]>([]);
    const [supplierList, setSupplierList] = useState<any[]>([]);
    const [allProdukList, setAllProdukList] = useState<any[]>([]);

    // ==========================================
    // TAB 2: RIWAYAT PURCHASE ORDER (PO) STATE
    // ==========================================
    const [dataPo, setDataPo] = useState<any[]>([]);
    const [loadingPo, setLoadingPo] = useState<boolean>(false);
    const [totalPoRecords, setTotalPoRecords] = useState<number>(0);
    const [pagePo, setPagePo] = useState<number>(1);
    const [rowsPo, setRowsPo] = useState<number>(10);
    const [keywordPo, setKeywordPo] = useState<string>('');
    const [filterStatusPo, setFilterStatusPo] = useState<string>('');
    const [selectedPoDetail, setSelectedPoDetail] = useState<any>(null);
    const [dialogPoDetailVisible, setDialogPoDetailVisible] = useState<boolean>(false);

    // ==========================================
    // TAB 3: LOG MUTASI STOK STATE
    // ==========================================
    const [dataMutasi, setDataMutasi] = useState<any[]>([]);
    const [loadingMutasi, setLoadingMutasi] = useState<boolean>(false);
    const [totalMutasiRecords, setTotalMutasiRecords] = useState<number>(0);
    const [pageMutasi, setPageMutasi] = useState<number>(1);
    const [rowsMutasi, setRowsMutasi] = useState<number>(10);
    const [keywordMutasi, setKeywordMutasi] = useState<string>('');
    const [filterJenisMutasi, setFilterJenisMutasi] = useState<string>('');

    // Modal Mutasi Khusus Per Produk
    const [productMutasiTarget, setProductMutasiTarget] = useState<any>(null);
    const [productMutasiList, setProductMutasiList] = useState<any[]>([]);
    const [loadingProductMutasi, setLoadingProductMutasi] = useState<boolean>(false);
    const [dialogProductMutasiVisible, setDialogProductMutasiVisible] = useState<boolean>(false);

    // Expandable Rows state
    const [expandedRows, setExpandedRows] = useState<any>(null);

    // ==========================================
    // MODAL DIALOG: VERIFIKASI / EDIT BATCH
    // ==========================================
    const [dialogEditBatchVisible, setDialogEditBatchVisible] = useState<boolean>(false);
    const [formEditBatch, setFormEditBatch] = useState<any>({
        kode_batch: '',
        kode_produk: '',
        nama_produk: '',
        no_batch: '',
        tanggal_kadaluarsa: '',
        catatan: '',
        status: 'aktif',
        is_legacy_estimate: 0,
    });
    const [savingEditBatch, setSavingEditBatch] = useState<boolean>(false);

    // ==========================================
    // MODAL DIALOG: PENGADAAN DARI SUPPLIER (GABUNGAN RESTOCK & BELI BARU)
    // ==========================================
    const [dialogPengadaanVisible, setDialogPengadaanVisible] = useState<boolean>(false);
    const [formPengadaan, setFormPengadaan] = useState<{
        kode_supplier: string;
        tanggal: string;
        items: Array<{
            id: string;
            tipe_item: 'existing' | 'baru';
            kode_produk: string;
            update_harga_beli_master: boolean;
            kode_kategori_produk: string;
            satuan: string;
            nama_produk_baru: string;
            harga_beli: number;
            harga_jual: number;
            buffer_min: number;
            batches: Array<{
                id: string;
                qty: number;
                no_batch: string;
                tanggal_kadaluarsa: string;
            }>;
        }>;
    }>({
        kode_supplier: '',
        tanggal: new Date().toISOString().slice(0, 10),
        items: [],
    });
    const [savingPengadaan, setSavingPengadaan] = useState<boolean>(false);

    const createEmptyPengadaanBatch = () => ({
        id: 'batch_p_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        qty: 1,
        no_batch: '',
        tanggal_kadaluarsa: '',
    });

    const createEmptyPengadaanItem = (tipe: 'existing' | 'baru' = 'existing', defaultProd?: any) => {
        const prod = defaultProd || (allProdukList.length > 0 ? allProdukList : dataProduk)[0];
        return {
            id: 'item_p_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            tipe_item: tipe,
            kode_produk: tipe === 'existing' ? prod?.kode_produk || '' : '',
            update_harga_beli_master: true,
            kode_kategori_produk: tipe === 'existing' ? prod?.kode_kategori_produk || kategoriList[0]?.value || '' : kategoriList[0]?.value || '',
            satuan: tipe === 'existing' ? prod?.satuan || 'Pcs' : 'Pcs',
            nama_produk_baru: '',
            harga_beli: tipe === 'existing' && prod ? Number(prod.harga_beli) || 0 : 0,
            harga_jual: tipe === 'existing' && prod ? Number(prod.harga_jual) || 0 : 0,
            buffer_min: tipe === 'existing' && prod ? Number(prod.stok_minimum) || 5 : 5,
            batches: [createEmptyPengadaanBatch()],
        };
    };

    // ==========================================
    // DATA LOADERS
    // ==========================================
    const loadInventoriData = async () => {
        setLoadingProduk(true);
        try {
            const res = await postData('/master/inventori-data', {
                page,
                perPage: rows,
                keyword,
                status_stok: filterStatusStok || null,
                kode_kategori_produk: filterKategori || null,
                kode_supplier: filterSupplier || null,
            });
            setDataProduk(res.data.data || []);
            setTotalRecords(res.data.total_data || 0);
            if (res.data.summary) {
                setSummary(res.data.summary);
            }
        } catch (error: any) {
            showError(toast, error?.response?.data?.message || 'Gagal memuat data inventori');
        } finally {
            setLoadingProduk(false);
        }
    };

    const loadPoData = async () => {
        setLoadingPo(true);
        try {
            const res = await postData('/master/inventori-po-data', {
                page: pagePo,
                perPage: rowsPo,
                keyword: keywordPo,
                status: filterStatusPo || null,
            });
            setDataPo(res.data.data || []);
            setTotalPoRecords(res.data.total_data || 0);
        } catch (error: any) {
            showError(toast, error?.response?.data?.message || 'Gagal memuat data Purchase Order');
        } finally {
            setLoadingPo(false);
        }
    };

    const loadMutasiData = async () => {
        setLoadingMutasi(true);
        try {
            const res = await postData('/master/inventori-mutasi-data', {
                page: pageMutasi,
                perPage: rowsMutasi,
                keyword: keywordMutasi,
                jenis_movement: filterJenisMutasi || null,
            });
            setDataMutasi(res.data.data || []);
            setTotalMutasiRecords(res.data.total_data || 0);
        } catch (error: any) {
            showError(toast, error?.response?.data?.message || 'Gagal memuat data mutasi stok');
        } finally {
            setLoadingMutasi(false);
        }
    };

    const loadDropdowns = async () => {
        try {
            const [resKat, resSup, resPrd] = await Promise.all([
                postData('/master/kategori-produk-data', { status: 'aktif' }),
                postData('/master/supplier-data', { status: 'aktif' }),
                postData('/master/inventori-data', {}),
            ]);
            setKategoriList(
                (resKat.data.data || []).map((k: any) => ({
                    label: k.nama,
                    value: k.kode_kategori_produk,
                }))
            );
            setSupplierList(
                (resSup.data.data || []).map((s: any) => ({
                    label: `${s.nama} (${s.kode_supplier})`,
                    value: s.kode_supplier,
                    raw: s,
                }))
            );
            setAllProdukList(resPrd.data.data || []);
        } catch (error) {
            console.error('Failed to load dropdowns', error);
        }
    };

    useEffect(() => {
        loadDropdowns();
    }, []);

    useEffect(() => {
        loadInventoriData();
    }, [page, rows, keyword, filterStatusStok, filterKategori, filterSupplier]);

    useEffect(() => {
        if (activeIndex === 1) {
            loadPoData();
        } else if (activeIndex === 2) {
            loadMutasiData();
        }
    }, [activeIndex, pagePo, rowsPo, keywordPo, filterStatusPo, pageMutasi, rowsMutasi, keywordMutasi, filterJenisMutasi]);

    // ==========================================
    // HANDLERS: VERIFIKASI / EDIT BATCH
    // ==========================================
    const handleOpenEditBatch = (batch: any, produk: any) => {
        setFormEditBatch({
            kode_batch: batch.kode_batch,
            kode_produk: batch.kode_produk || produk.kode_produk,
            nama_produk: produk.nama || batch.nama_produk,
            no_batch: batch.no_batch || '',
            tanggal_kadaluarsa: batch.tanggal_kadaluarsa ? String(batch.tanggal_kadaluarsa).slice(0, 10) : '',
            catatan: batch.catatan || '',
            status: batch.status || 'aktif',
            is_legacy_estimate: batch.is_legacy_estimate || 0,
        });
        setDialogEditBatchVisible(true);
    };

    const handleSaveEditBatch = async () => {
        if (!formEditBatch.no_batch?.trim()) {
            showError(toast, 'Nomor Batch wajib diisi!');
            return;
        }
        if (!formEditBatch.tanggal_kadaluarsa) {
            showError(toast, 'Tanggal Kadaluarsa wajib diisi!');
            return;
        }

        setSavingEditBatch(true);
        try {
            const res = await postData('/master/inventori-batch-update', formEditBatch);
            showSuccess(toast, res.data.message || 'Data batch berhasil diverifikasi & diperbarui!');
            setDialogEditBatchVisible(false);
            loadInventoriData();
        } catch (error: any) {
            showError(toast, error?.response?.data?.message || 'Gagal memperbarui batch');
        } finally {
            setSavingEditBatch(false);
        }
    };

    // ==========================================
    // HANDLERS: PENGADAAN (GABUNGAN RESTOCK & BELI BARU DENGAN NESTED BATCH)
    // ==========================================
    const handleOpenPengadaan = (targetRow?: any) => {
        const today = new Date().toISOString().slice(0, 10);
        if (targetRow) {
            const item = createEmptyPengadaanItem('existing', targetRow);
            setFormPengadaan({
                kode_supplier: targetRow.kode_supplier || supplierList[0]?.value || '',
                tanggal: today,
                items: [item],
            });
        } else {
            const firstProd = (allProdukList.length > 0 ? allProdukList : dataProduk)[0];
            const firstSup = firstProd?.kode_supplier || supplierList[0]?.value || '';
            const item = createEmptyPengadaanItem('existing', firstProd);
            setFormPengadaan({
                kode_supplier: firstSup,
                tanggal: today,
                items: [item],
            });
        }
        setDialogPengadaanVisible(true);
    };

    const handleAddPengadaanItem = (tipe: 'existing' | 'baru' = 'existing') => {
        setFormPengadaan((prev) => ({
            ...prev,
            items: [...prev.items, createEmptyPengadaanItem(tipe)],
        }));
    };

    const handleRemovePengadaanItem = (index: number) => {
        if (formPengadaan.items.length <= 1) {
            showError(toast, 'Minimal harus ada 1 produk dalam pengadaan!');
            return;
        }
        setFormPengadaan((prev) => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index),
        }));
    };

    const handleUpdatePengadaanItem = (index: number, field: string, value: any) => {
        setFormPengadaan((prev) => {
            const updated = [...prev.items];
            const item = { ...updated[index], [field]: value };

            if (field === 'tipe_item') {
                if (value === 'existing') {
                    const firstProd = (allProdukList.length > 0 ? allProdukList : dataProduk)[0];
                    item.kode_produk = firstProd?.kode_produk || '';
                    item.satuan = firstProd?.satuan || 'Pcs';
                    item.harga_beli = Number(firstProd?.harga_beli) || 0;
                } else {
                    item.kode_produk = '';
                    item.kode_kategori_produk = kategoriList[0]?.value || '';
                    item.satuan = 'Pcs';
                    item.nama_produk_baru = '';
                    item.harga_beli = 0;
                    item.harga_jual = 0;
                    item.buffer_min = 5;
                }
            }

            if (field === 'kode_produk') {
                const found = (allProdukList.length > 0 ? allProdukList : dataProduk).find((p: any) => p.kode_produk === value);
                if (found) {
                    item.satuan = found.satuan || 'Pcs';
                    item.harga_beli = Number(found.harga_beli) || 0;
                }
            }

            updated[index] = item;
            return { ...prev, items: updated };
        });
    };

    const handleAddPengadaanBatch = (prodIndex: number) => {
        setFormPengadaan((prev) => {
            const items = [...prev.items];
            items[prodIndex] = {
                ...items[prodIndex],
                batches: [...items[prodIndex].batches, createEmptyPengadaanBatch()],
            };
            return { ...prev, items };
        });
    };

    const handleRemovePengadaanBatch = (prodIndex: number, batchIndex: number) => {
        setFormPengadaan((prev) => {
            const items = [...prev.items];
            const currentBatches = items[prodIndex].batches;
            if (currentBatches.length <= 1) {
                showError(toast, 'Minimal harus ada 1 batch untuk setiap produk!');
                return prev;
            }
            items[prodIndex] = {
                ...items[prodIndex],
                batches: currentBatches.filter((_, bIdx) => bIdx !== batchIndex),
            };
            return { ...prev, items };
        });
    };

    const handleUpdatePengadaanBatch = (prodIndex: number, batchIndex: number, field: string, value: any) => {
        setFormPengadaan((prev) => {
            const items = [...prev.items];
            const batches = [...items[prodIndex].batches];
            batches[batchIndex] = { ...batches[batchIndex], [field]: value };
            items[prodIndex] = { ...items[prodIndex], batches };
            return { ...prev, items };
        });
    };

    const handleSavePengadaan = async () => {
        if (!formPengadaan.kode_supplier) {
            showError(toast, 'Silakan pilih rekanan Supplier pengirim!');
            return;
        }
        if (!formPengadaan.items || formPengadaan.items.length === 0) {
            showError(toast, 'Daftar item pengadaan produk tidak boleh kosong!');
            return;
        }

        // Validasi tiap produk dan batch
        for (let i = 0; i < formPengadaan.items.length; i++) {
            const prod = formPengadaan.items[i];
            const no = i + 1;

            if (prod.tipe_item === 'existing') {
                if (!prod.kode_produk) {
                    showError(toast, `Produk #${no}: Silakan pilih Produk yang terdaftar!`);
                    return;
                }
                if (Number(prod.harga_beli) < 0) {
                    showError(toast, `Produk #${no}: Harga Beli satuan tidak boleh negatif!`);
                    return;
                }
            } else {
                if (!prod.kode_kategori_produk) {
                    showError(toast, `Produk #${no}: Kategori Produk baru wajib dipilih!`);
                    return;
                }
                if (!prod.nama_produk_baru?.trim()) {
                    showError(toast, `Produk #${no}: Nama Produk baru wajib diisi!`);
                    return;
                }
                if (!prod.satuan?.trim()) {
                    showError(toast, `Produk #${no}: Satuan Produk baru wajib diisi!`);
                    return;
                }
                if (Number(prod.harga_beli) < 0) {
                    showError(toast, `Produk #${no}: Harga Beli satuan tidak boleh negatif!`);
                    return;
                }
                if (Number(prod.harga_jual) < 0) {
                    showError(toast, `Produk #${no}: Harga Jual satuan tidak boleh negatif!`);
                    return;
                }
            }

            if (!prod.batches || prod.batches.length === 0) {
                showError(toast, `Produk #${no}: Minimal harus ada 1 batch fisik!`);
                return;
            }

            for (let j = 0; j < prod.batches.length; j++) {
                const b = prod.batches[j];
                const bNo = j + 1;
                if (Number(b.qty) < 1) {
                    showError(toast, `Produk #${no} (Batch #${bNo}): Jumlah beli (Qty) minimal 1 unit!`);
                    return;
                }
                if (!b.no_batch?.trim()) {
                    showError(toast, `Produk #${no} (Batch #${bNo}): Nomor Batch kemasan wajib diisi untuk pelacakan FEFO!`);
                    return;
                }
                if (!b.tanggal_kadaluarsa) {
                    showError(toast, `Produk #${no} (Batch #${bNo}): Tanggal Kadaluarsa (Expired Date) wajib diisi!`);
                    return;
                }
            }
        }

        setSavingPengadaan(true);
        try {
            const payload = {
                kode_supplier: formPengadaan.kode_supplier,
                tanggal: formPengadaan.tanggal,
                items: formPengadaan.items.map((it) => ({
                    tipe_item: it.tipe_item,
                    kode_produk: it.tipe_item === 'existing' ? it.kode_produk : undefined,
                    update_harga_beli_master: it.tipe_item === 'existing' ? Boolean(it.update_harga_beli_master) : undefined,
                    kode_kategori_produk: it.tipe_item === 'baru' ? it.kode_kategori_produk : undefined,
                    satuan: it.tipe_item === 'baru' ? it.satuan.trim() : undefined,
                    nama_produk_baru: it.tipe_item === 'baru' ? it.nama_produk_baru.trim() : undefined,
                    harga_beli: Number(it.harga_beli) || 0,
                    harga_jual: it.tipe_item === 'baru' ? Number(it.harga_jual) || 0 : undefined,
                    buffer_min: it.tipe_item === 'baru' ? Number(it.buffer_min) || 5 : undefined,
                    batches: it.batches.map((b) => ({
                        qty: Number(b.qty) || 1,
                        no_batch: b.no_batch.trim(),
                        tanggal_kadaluarsa: b.tanggal_kadaluarsa,
                    })),
                })),
            };

            const res = await postData('/master/inventori-pengadaan', payload);
            showSuccess(toast, res.data.message || 'Transaksi pengadaan berhasil disimpan!');
            setDialogPengadaanVisible(false);
            loadInventoriData();
            loadDropdowns();
            loadPoData();
        } catch (error: any) {
            showError(toast, error?.response?.data?.message || 'Gagal menyimpan transaksi pengadaan');
        } finally {
            setSavingPengadaan(false);
        }
    };

    // ==========================================
    // HANDLERS: DETAIL PO & MUTASI PRODUK
    // ==========================================
    const handleViewPoDetail = (poRow: any) => {
        setSelectedPoDetail(poRow);
        setDialogPoDetailVisible(true);
    };

    const handleOpenProductMutasi = async (prodRow: any) => {
        setProductMutasiTarget(prodRow);
        setLoadingProductMutasi(true);
        setDialogProductMutasiVisible(true);
        try {
            const res = await postData('/master/inventori-mutasi-data', {
                kode_produk: prodRow.kode_produk,
                perPage: 50,
            });
            setProductMutasiList(res.data.data || []);
        } catch (error: any) {
            showError(toast, 'Gagal memuat riwayat mutasi produk');
        } finally {
            setLoadingProductMutasi(false);
        }
    };

    const formatRupiah = (val: number | string) => {
        const num = typeof val === 'string' ? parseFloat(val) : val;
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            maximumFractionDigits: 0,
        }).format(num || 0);
    };

    const formatDateIndo = (dStr: string) => {
        if (!dStr) return '-';
        try {
            const d = new Date(dStr);
            return d.toLocaleDateString('id-ID', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
            });
        } catch (_) {
            return dStr;
        }
    };

    const formatDateTimeIndo = (dStr: string) => {
        if (!dStr) return '-';
        try {
            const d = new Date(dStr);
            return `${d.toLocaleDateString('id-ID', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
            })} ${d.toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
            })}`;
        } catch (_) {
            return dStr;
        }
    };

    const rowExpansionTemplate = (data: any) => {
        const batches = data.batches || [];
        const stokLayak = Number(data.stok_layak_jual !== undefined ? data.stok_layak_jual : (data.stok_tersedia ?? 0));
        const stokTotal = Number(data.stok_total_fisik !== undefined ? data.stok_total_fisik : (data.stok_tersedia ?? batches.reduce((acc: number, b: any) => acc + (Number(b.stok_sisa) || 0), 0)));
        const stokExp = Number(data.stok_expired !== undefined ? data.stok_expired : Math.max(0, stokTotal - stokLayak));
        const totalAsetBatch = batches.reduce((acc: number, b: any) => acc + (Number(b.nilai_aset_batch) || 0), 0);

        return (
            <div className="p-3 surface-50 border-round-xl m-2 border-1 border-purple-200 shadow-1">
                {/* SUB-TABLE HEADER */}
                <div className="flex align-items-center gap-2 flex-wrap mb-3 pb-2 border-bottom-1 border-200">
                    <span className="w-2rem h-2rem border-round-lg bg-purple-100 text-purple-700 flex align-items-center justify-content-center font-bold">
                        <i className="pi pi-box text-sm" />
                    </span>
                    <div>
                        <span className="font-bold text-900 text-sm mr-2">
                            Rincian Batch Fisik: {data.nama}
                        </span>
                        <span className="font-mono text-xs text-purple-700 bg-purple-50 px-2 py-0.5 border-round font-semibold">
                            {data.kode_produk}
                        </span>
                    </div>
                    <Tag value={`${batches.length} Batch`} severity="info" className="text-xs py-0 px-2" />
                </div>

                {batches.length === 0 ? (
                    <div className="p-4 text-center text-500 text-xs surface-card border-round-lg border-1 border-200">
                        <i className="pi pi-inbox text-2xl text-400 block mb-2" />
                        Belum ada data batch fisik untuk produk ini.
                    </div>
                ) : (
                    <DataTable
                        value={batches}
                        size="small"
                        className="p-datatable-sm surface-card border-round-lg border-1 border-200 overflow-hidden"
                        responsiveLayout="scroll"
                    >
                        {/* Status Indicator Dot */}
                        <Column
                            header=""
                            headerStyle={{ width: '2.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}
                            bodyStyle={{ textAlign: 'center' }}
                            body={(b) => {
                                const isHabis = b.status === 'habis' || Number(b.stok_sisa) <= 0;
                                const isKadaluarsa = b.status_expired === 'kadaluarsa' || (b.sisa_hari !== null && b.sisa_hari < 0);
                                const isMenipisOrExpSoon = b.status_expired === 'kritis' || b.status_expired === 'perhatian' || (b.sisa_hari !== null && b.sisa_hari <= 30);

                                let dotColor = '#22c55e';
                                let dotTitle = 'Batch Aktif & Layak Jual';

                                if (isHabis) {
                                    dotColor = '#64748b';
                                    dotTitle = 'Batch Habis (0 Pcs)';
                                } else if (isKadaluarsa) {
                                    dotColor = '#dc2626';
                                    dotTitle = `Batch Kadaluarsa (${b.tanggal_kadaluarsa ? formatDateIndo(b.tanggal_kadaluarsa) : '-'})`;
                                } else if (isMenipisOrExpSoon) {
                                    dotColor = '#f97316';
                                    dotTitle = `Mendekati Kadaluarsa (${b.sisa_hari} hari lagi)`;
                                }

                                return (
                                    <div className="flex justify-content-center" title={dotTitle}>
                                        <span
                                            style={{
                                                display: 'inline-block',
                                                width: '12px',
                                                height: '12px',
                                                borderRadius: '3px',
                                                backgroundColor: dotColor,
                                                boxShadow: `0 1px 3px ${dotColor}66`,
                                            }}
                                        />
                                    </div>
                                );
                            }}
                        />
                        <Column
                            header="Kode Batch"
                            field="kode_batch"
                            headerStyle={{ minWidth: '9rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                            body={(b) => (
                                <span className="font-mono font-semibold text-xs text-purple-700 bg-purple-50 px-2 py-0.5 border-round">
                                    {b.kode_batch}
                                </span>
                            )}
                        />
                        <Column
                            header="No. Batch"
                            field="no_batch"
                            headerStyle={{ minWidth: '9rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                            body={(b) => (
                                <span className="font-mono font-bold text-xs text-900 bg-gray-100 px-2 py-0.5 border-round">
                                    {b.no_batch}
                                </span>
                            )}
                        />
                        <Column
                            header="Tanggal Kadaluarsa"
                            headerStyle={{ minWidth: '10.5rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                            body={(b) => {
                                let badgeBg = 'bg-green-100 text-green-800 border-green-300';
                                if (b.status_expired === 'kadaluarsa') badgeBg = 'bg-red-500 text-white font-bold';
                                else if (b.status_expired === 'kritis') badgeBg = 'bg-red-100 text-red-800 font-bold border-red-300';
                                else if (b.status_expired === 'perhatian') badgeBg = 'bg-orange-100 text-orange-800 font-semibold border-orange-300';

                                return (
                                    <div className="flex flex-column gap-1">
                                        <span className={`px-2 py-0.5 border-round text-xs font-semibold border-1 w-max ${badgeBg}`}>
                                            {b.tanggal_kadaluarsa ? formatDateIndo(b.tanggal_kadaluarsa) : '-'}
                                        </span>
                                        {b.is_legacy_estimate === 1 && (
                                            <Tag
                                                value="⚠️ Perkiraan Default (+1 Thn)"
                                                severity="warning"
                                                className="text-[10px] py-0 px-1 border-round w-max cursor-pointer"
                                                title="Klik verifikasi untuk mengubah ke tanggal kemasan asli"
                                                onClick={() => handleOpenEditBatch(b, data)}
                                            />
                                        )}
                                    </div>
                                );
                            }}
                            style={{ minWidth: '10.5rem' }}
                        />
                        <Column
                            header="Kuantitas Stok"
                            body={(b) => (
                                <div className="text-xs">
                                    <div className="flex align-items-center gap-1">
                                        <span className="text-500">Sisa:</span>
                                        <strong className={b.stok_sisa > 0 ? 'text-green-700 text-sm font-bold' : 'text-500'}>
                                            {b.stok_sisa} {data.satuan}
                                        </strong>
                                    </div>
                                    <div className="text-500 text-[11px]">
                                        Masuk: {b.stok_masuk} {data.satuan}
                                    </div>
                                </div>
                            )}
                            style={{ minWidth: '9rem' }}
                        />
                        <Column
                            header="Harga & Nilai Aset"
                            body={(b) => (
                                <div className="text-xs">
                                    <div className="font-bold text-900">
                                        {formatRupiah(b.nilai_aset_batch)}
                                    </div>
                                    <div className="text-500 text-[11px]">
                                        @ {formatRupiah(b.harga_beli_satuan)}
                                    </div>
                                </div>
                            )}
                            style={{ minWidth: '10rem' }}
                        />
                        <Column
                            header="Supplier / PO"
                            body={(b) => (
                                <div className="text-xs">
                                    <span className="font-medium text-800 block">{b.nama_supplier || '-'}</span>
                                    {b.kode_po && <span className="font-mono text-500 text-[11px]">{b.kode_po}</span>}
                                </div>
                            )}
                            style={{ minWidth: '11rem' }}
                        />

                        <Column
                            header="Aksi"
                            align="center"
                            body={(b) => (
                                <Button
                                    icon="pi pi-pencil"
                                    size="small"
                                    outlined
                                    severity={b.is_legacy_estimate === 1 ? 'warning' : 'info'}
                                    label={b.is_legacy_estimate === 1 ? 'Verifikasi' : 'Edit'}
                                    className="p-button-xs text-xs px-2.5 py-1 border-round-md font-bold"
                                    onClick={() => handleOpenEditBatch(b, data)}
                                    tooltip={b.is_legacy_estimate === 1 ? 'Verifikasi nomor batch & tanggal asli dari kemasan fisik' : 'Ubah data batch'}
                                    tooltipOptions={{ position: 'left' }}
                                />
                            )}
                            style={{ minWidth: '8rem' }}
                        />
                    </DataTable>
                )}
            </div>
        );
    };

    return (
        <div className="w-full">
            <Toast ref={toast} />
            <ConfirmDialog />

            {/* =========================================================
                CARD CONTAINER UTAMA (Konsisten dengan tema Supplier)
                ========================================================= */}
            <div className="card border-round-xl p-4 shadow-1 surface-card mb-4">
                {/* PAGE HEADER */}
                <div className="mb-4">
                    <h3 className="text-2xl font-bold text-900 flex align-items-center gap-2 mb-1">
                        <i className="pi pi-box text-purple-600 text-2xl" />
                        Kelola Inventori Produk
                    </h3>
                    <p className="text-500 text-sm m-0">
                        Pantau persediaan stok produk klinik, restock barang dari supplier, dan pengadaan produk baru.
                    </p>
                </div>

                {/* =========================================================
                    5 KPI CARDS STRIP (Standard Modern Design)
                    ========================================================= */}
                <div className="grid m-0 mb-4">
                    {/* 1. Total SKU */}
                    <div className="col-12 sm:col-6 lg:col-2 p-1">
                        <div className="p-3 border-round-xl surface-ground border-1 border-200 flex align-items-center justify-content-between h-full">
                            <div>
                                <span className="text-xs text-500 font-semibold uppercase block mb-1">Total SKU</span>
                                <span className="text-2xl font-bold text-900">{summary.total_sku || 0}</span>
                                <span className="text-xs text-500 block mt-1">Katalog produk aktif</span>
                            </div>
                            <div className="w-3rem h-3rem border-round-lg bg-purple-100 flex align-items-center justify-content-center text-purple-700">
                                <i className="pi pi-tags text-xl" />
                            </div>
                        </div>
                    </div>

                    {/* 2. Total Stok Unit */}
                    <div className="col-12 sm:col-6 lg:col-2 p-1">
                        <div className="p-3 border-round-xl surface-ground border-1 border-200 flex align-items-center justify-content-between h-full">
                            <div>
                                <span className="text-xs text-500 font-semibold uppercase block mb-1">Stok Fisik</span>
                                <span className="text-2xl font-bold text-blue-600">{summary.total_stok_unit || 0}</span>
                                <span className="text-xs text-500 block mt-1">Total unit di klinik</span>
                            </div>
                            <div className="w-3rem h-3rem border-round-lg bg-blue-100 flex align-items-center justify-content-center text-blue-700">
                                <i className="pi pi-box text-xl" />
                            </div>
                        </div>
                    </div>

                    {/* 3. Stok Menipis */}
                    <div className="col-12 sm:col-6 lg:col-2 p-1">
                        <div className="p-3 border-round-xl surface-ground border-1 border-200 flex align-items-center justify-content-between h-full">
                            <div>
                                <span className="text-xs text-500 font-semibold uppercase block mb-1">Stok Menipis</span>
                                <span className="text-2xl font-bold text-orange-600">{summary.stok_menipis || 0}</span>
                                <span className="text-xs text-500 block mt-1">&le; Buffer minimum</span>
                            </div>
                            <div className="w-3rem h-3rem border-round-lg bg-orange-100 flex align-items-center justify-content-center text-orange-700">
                                <i className="pi pi-exclamation-triangle text-xl" />
                            </div>
                        </div>
                    </div>

                    {/* 4. Stok Habis */}
                    <div className="col-12 sm:col-6 lg:col-2 p-1">
                        <div className="p-3 border-round-xl surface-ground border-1 border-200 flex align-items-center justify-content-between h-full">
                            <div>
                                <span className="text-xs text-500 font-semibold uppercase block mb-1">Stok Habis</span>
                                <span className="text-2xl font-bold text-red-600">{summary.stok_habis || 0}</span>
                                <span className="text-xs text-500 block mt-1">Stok 0 unit</span>
                            </div>
                            <div className="w-3rem h-3rem border-round-lg bg-red-100 flex align-items-center justify-content-center text-red-700">
                                <i className="pi pi-times-circle text-xl" />
                            </div>
                        </div>
                    </div>

                    {/* 5. Total Valuasi Aset */}
                    <div className="col-12 sm:col-12 lg:col-4 p-1">
                        <div className="p-3 border-round-xl surface-ground border-1 border-200 flex align-items-center justify-content-between h-full bg-green-50">
                            <div>
                                <span className="text-xs text-green-800 font-semibold uppercase block mb-1">Total Valuasi Aset Stok</span>
                                <span className="text-2xl font-black text-green-900">{formatRupiah(summary.total_aset || 0)}</span>
                                <span className="text-xs text-green-700 block mt-1">Akumulasi harga beli persediaan</span>
                            </div>
                            <div className="w-3rem h-3rem border-round-lg bg-green-100 flex align-items-center justify-content-center text-green-700">
                                <i className="pi pi-money-bill text-xl" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* =========================================================
                    TAB VIEW: INVENTORI, RIWAYAT PO, LOG MUTASI
                    ========================================================= */}
                <TabView activeIndex={activeIndex} onTabChange={(e) => setActiveIndex(e.index)}>
                    {/* ── TAB 1: STOK PRODUK ── */}
                    <TabPanel header="Stok & Inventori Produk" leftIcon="pi pi-box mr-2">
                        {/* ACTION BUTTONS (Outline Style) */}
                        <div className="flex flex-row flex-wrap align-items-center gap-2 pt-2 mb-4">
                            <Button
                                size="small"
                                label="Pengadaan dari Supplier"
                                icon="pi pi-cart-plus"
                                className="border-round-md font-bold px-3 bg-green-600 hover:bg-green-700 border-none text-white shadow-1"
                                onClick={() => handleOpenPengadaan()}
                            />
                            <Divider layout="vertical" className="m-0 h-2rem" />
                            <Button
                                size="small"
                                label="Cetak"
                                icon="pi pi-print"
                                outlined
                                className="border-round-md font-medium px-3 border-purple-600 text-purple-600"
                                onClick={() => window.print()}
                            />
                            <Divider layout="vertical" className="m-0 h-2rem" />
                            <Button
                                size="small"
                                label="Refresh"
                                icon="pi pi-refresh"
                                outlined
                                severity="success"
                                className="border-round-md font-medium px-3"
                                loading={loadingProduk}
                                onClick={loadInventoriData}
                            />
                        </div>

                        {/* DATA TABLE STOK PRODUK */}
                        <DataTable
                            value={dataProduk}
                            loading={loadingProduk}
                            paginator
                            rows={rows}
                            totalRecords={totalRecords}
                            lazy
                            first={(page - 1) * rows}
                            onPage={(e) => {
                                setPage((e.page || 0) + 1);
                                setRows(e.rows);
                            }}
                            selection={selectedRows}
                            onSelectionChange={(e) => setSelectedRows(e.value as any[])}
                            expandedRows={expandedRows}
                            onRowToggle={(e) => setExpandedRows(e.data)}
                            rowExpansionTemplate={rowExpansionTemplate}
                            dataKey="kode_produk"
                            className="p-datatable-sm"
                            emptyMessage="Tidak ada data stok produk yang sesuai filter."
                            responsiveLayout="scroll"
                            rowsPerPageOptions={[10, 25, 50]}
                            paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink CurrentPageReport RowsPerPageDropdown"
                            currentPageReportTemplate="Menampilkan {first} - {last} dari {totalRecords} data"
                            header={
                                <div className="flex flex-column gap-3">
                                    <div>
                                        <span className="text-xl font-bold text-900 block">Data Stok Produk Klinik</span>
                                        <span className="text-xs text-500">Monitoring ketersediaan stok fisik dan masa kadaluarsa produk</span>
                                    </div>

                                    {/* Baris Filter (Kiri) & Search + Reset (Kanan Mentok) */}
                                    <div className="flex flex-wrap align-items-center justify-content-between gap-2">
                                        <div className="flex flex-wrap align-items-center gap-2">
                                            {/* Filter Status Stok */}
                                            <Dropdown
                                                value={filterStatusStok}
                                                options={[
                                                    { label: 'Semua Status Stok', value: '' },
                                                    { label: 'Stok Aman', value: 'aman' },
                                                    { label: 'Stok Menipis', value: 'menipis' },
                                                    { label: 'Stok Habis', value: 'habis' },
                                                    { label: 'Ada Kadaluarsa', value: 'kadaluarsa' },
                                                ]}
                                                onChange={(e) => setFilterStatusStok(e.value)}
                                                placeholder="Status Stok"
                                                className="p-inputtext-sm text-sm border-round-md w-full md:w-11rem"
                                            />

                                            {/* Filter Kategori */}
                                            <Dropdown
                                                value={filterKategori}
                                                options={[{ label: 'Semua Kategori', value: '' }, ...kategoriList]}
                                                onChange={(e) => setFilterKategori(e.value)}
                                                placeholder="Filter Kategori"
                                                className="p-inputtext-sm text-sm border-round-md w-full md:w-12rem"
                                            />

                                            {/* Filter Supplier */}
                                            <Dropdown
                                                value={filterSupplier}
                                                options={[{ label: 'Semua Supplier', value: '' }, ...supplierList]}
                                                onChange={(e) => setFilterSupplier(e.value)}
                                                placeholder="Supplier"
                                                className="p-inputtext-sm text-sm border-round-md w-full md:w-12rem"
                                            />
                                        </div>

                                        {/* Search Field & Reset Filter di Kanan Mentok */}
                                        <div className="flex align-items-center gap-2 ml-auto w-full md:w-auto">
                                            <IconField iconPosition="left" className="w-full md:w-18rem">
                                                <InputIcon className="pi pi-search" />
                                                <InputText
                                                    value={keyword}
                                                    onChange={(e) => setKeyword(e.target.value)}
                                                    placeholder="Cari Produk / Supplier..."
                                                    className="w-full text-sm"
                                                />
                                            </IconField>

                                            {/* Reset Filter Button */}
                                            <Button
                                                type="button"
                                                icon="pi pi-filter-slash"
                                                outlined
                                                severity="danger"
                                                tooltip="Reset Filter"
                                                tooltipOptions={{ position: 'bottom' }}
                                                onClick={() => {
                                                    setKeyword('');
                                                    setFilterStatusStok('');
                                                    setFilterKategori('');
                                                    setFilterSupplier('');
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <KeteranganStatus
                                        className="mb-2"
                                        items={[
                                            { label: 'Stok Aman (> Min)', color: '#22c55e' },
                                            { label: 'Stok Menipis (≤ Min)', color: '#f97316' },
                                            { label: 'Stok Habis (0)', color: '#64748b' },
                                            { label: 'Produk Kadaluarsa (0 Layak Jual)', color: '#dc2626' },
                                        ]}
                                    />
                                </div>
                            }
                        >
                            <Column expander style={{ width: '3rem' }} />
                            <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} />

                            {/* 1. Status Indicator */}
                            <Column
                                header=""
                                headerStyle={{ width: '3rem', textAlign: 'center', whiteSpace: 'nowrap' }}
                                bodyStyle={{ textAlign: 'center' }}
                                body={(r) => {
                                    const stokLayak = Number(r.stok_layak_jual !== undefined ? r.stok_layak_jual : (r.stok_tersedia ?? 0));
                                    const stokTotal = Number(r.stok_total_fisik !== undefined ? r.stok_total_fisik : (r.stok_tersedia ?? 0));
                                    const isAllExpired = Boolean(r.is_expired || (stokLayak === 0 && stokTotal > 0));

                                    let dotColor = '#22c55e';
                                    let dotTitle = 'Stok Aman';

                                    if (stokTotal <= 0 || r.status_stok === 'habis') {
                                        dotColor = '#64748b';
                                        dotTitle = 'Stok Habis (0 Unit)';
                                    } else if (isAllExpired || stokLayak <= 0) {
                                        dotColor = '#dc2626';
                                        dotTitle = `Produk Kadaluarsa (${stokTotal} unit fisik, 0 layak jual)`;
                                    } else if (stokLayak <= (r.stok_minimum || 0)) {
                                        dotColor = '#f97316';
                                        dotTitle = `Stok Menipis (≤ Buffer Min: ${r.stok_minimum} ${r.satuan})`;
                                    }

                                    return (
                                        <div className="flex justify-content-center" title={dotTitle}>
                                            <span
                                                style={{
                                                    display: 'inline-block',
                                                    width: '13px',
                                                    height: '13px',
                                                    borderRadius: '3px',
                                                    backgroundColor: dotColor,
                                                    boxShadow: `0 1px 3px ${dotColor}66`,
                                                }}
                                            />
                                        </div>
                                    );
                                }}
                            />

                            {/* 2. Kode Produk */}
                            <Column
                                header="Kode Produk"
                                sortable
                                field="kode_produk"
                                headerStyle={{ minWidth: '8.5rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                body={(r) => (
                                    <span className="font-mono font-bold text-purple-700 bg-purple-50 px-2 py-1 border-round text-xs inline-block">
                                        {r.kode_produk}
                                    </span>
                                )}
                            />

                            {/* 3. Nama Produk */}
                            <Column
                                header="Nama Produk"
                                sortable
                                field="nama"
                                headerStyle={{ minWidth: '13rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                body={(r) => (
                                    <span
                                        className="font-bold text-900 text-sm hover:text-purple-700 cursor-pointer block"
                                        onClick={() => {
                                            const newExpanded = { ...expandedRows, [r.kode_produk]: !expandedRows[r.kode_produk] };
                                            setExpandedRows(newExpanded);
                                        }}
                                        title="Klik untuk melihat rincian batch"
                                    >
                                        {r.nama}
                                    </span>
                                )}
                            />

                            {/* 4. Supplier Rekanan */}
                            <Column
                                field="nama_supplier"
                                header="Supplier Rekanan"
                                headerStyle={{ minWidth: '10.5rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                body={(r) =>
                                    r.nama_supplier ? (
                                        <div>
                                            <span className="font-medium text-800 text-sm block">{r.nama_supplier}</span>
                                            <span className="text-xs text-500 font-mono">{r.kode_supplier}</span>
                                        </div>
                                    ) : (
                                        <span className="text-xs text-400 italic">Belum di-assign</span>
                                    )
                                }
                            />

                            {/* 5. Harga Jual */}
                            <Column
                                header="Harga Jual"
                                field="harga_jual"
                                sortable
                                headerStyle={{ minWidth: '8.5rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                body={(r) => (
                                    <span className="text-sm font-bold text-green-700">
                                        {formatRupiah(r.harga_jual)}
                                    </span>
                                )}
                            />

                            {/* 6. Harga Beli */}
                            <Column
                                header="Harga Beli"
                                field="harga_beli"
                                sortable
                                headerStyle={{ minWidth: '8.5rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                body={(r) => (
                                    <span className="text-xs text-700 font-medium">
                                        {formatRupiah(r.harga_beli)}
                                    </span>
                                )}
                            />

                            {/* 7. Stok Layak Jual */}
                            <Column
                                header="Stok Layak Jual"
                                headerStyle={{ minWidth: '9.5rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                body={(r) => {
                                    const stokLayak = Number(r.stok_layak_jual !== undefined ? r.stok_layak_jual : (r.stok_tersedia ?? 0));
                                    const stokMin = Number(r.stok_minimum || 0);

                                    let badgeBg = 'bg-green-100 text-green-800 border-green-300';
                                    let statusIcon = null;

                                    if (stokLayak <= 0) {
                                        badgeBg = 'bg-red-500 text-white shadow-1';
                                        statusIcon = <i className="pi pi-times-circle text-xs" />;
                                    } else if (stokLayak <= stokMin) {
                                        badgeBg = 'bg-orange-100 text-orange-900 border-orange-300';
                                        statusIcon = <i className="pi pi-exclamation-triangle text-xs" />;
                                    }

                                    return (
                                        <span
                                            className={`px-2.5 py-1 border-round-md text-xs font-bold inline-flex align-items-center gap-1 w-max ${badgeBg}`}
                                            title={`Stok Layak Jual: ${stokLayak} ${r.satuan} (Belum Kadaluarsa)`}
                                        >
                                            {statusIcon}
                                            {stokLayak} {r.satuan}
                                        </span>
                                    );
                                }}
                            />

                            {/* 8. Stok Keseluruhan */}
                            <Column
                                header="Stok Keseluruhan"
                                headerStyle={{ minWidth: '9.5rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                body={(r) => {
                                    const stokTotal = Number(r.stok_total_fisik !== undefined ? r.stok_total_fisik : (r.stok_tersedia ?? 0));

                                    return (
                                        <span
                                            className="px-2.5 py-1 border-round-md text-xs font-bold text-gray-800 bg-gray-100 border-1 border-gray-300 inline-flex align-items-center w-max"
                                            title={`Total Stok Fisik: ${stokTotal} ${r.satuan}`}
                                        >
                                            {stokTotal} {r.satuan}
                                        </span>
                                    );
                                }}
                            />

                            {/* 9. Batch Terdekat (FEFO) */}
                            <Column
                                header="Batch Terdekat (FEFO)"
                                headerStyle={{ minWidth: '10rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                body={(r) => {
                                    const batches = r.batches || [];
                                    const validActiveBatches = batches.filter(
                                        (b: any) => b.status === 'aktif' && b.stok_sisa > 0 && b.status_expired !== 'kadaluarsa' && (b.sisa_hari === null || b.sisa_hari >= 0)
                                    );
                                    const allActiveBatches = batches.filter((b: any) => b.status === 'aktif' && b.stok_sisa > 0);
                                    const nearest = validActiveBatches[0] || allActiveBatches[0] || batches[0];

                                    if (!nearest || !nearest.no_batch) {
                                        return <span className="text-xs text-400 italic">-</span>;
                                    }

                                    return (
                                        <span className="font-mono font-bold text-xs text-900 bg-gray-100 px-2 py-1 border-round border-1 border-gray-200 inline-block">
                                            {nearest.no_batch}
                                        </span>
                                    );
                                }}
                            />

                            {/* 10. Nilai Aset */}
                            <Column
                                field="nilai_aset"
                                header="Nilai Aset"
                                headerStyle={{ minWidth: '9rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                body={(r) => (
                                    <span className="text-xs font-bold text-900">{formatRupiah(r.nilai_aset)}</span>
                                )}
                            />

                            {/* 10. Aksi Restock Cepat & Mutasi */}
                            <Column
                                header="Aksi"
                                align="center"
                                headerStyle={{ width: '7rem', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                body={(r) => (
                                    <div className="flex align-items-center justify-content-center gap-1">
                                        <Button
                                            icon="pi pi-cart-plus"
                                            outlined
                                            severity="info"
                                            className="p-button-sm border-round-md"
                                            onClick={() => handleOpenPengadaan(r)}
                                            tooltip="Pengadaan / Restock dari Supplier"
                                            tooltipOptions={{ position: 'top' }}
                                        />
                                        <Button
                                            icon="pi pi-history"
                                            outlined
                                            severity="secondary"
                                            className="p-button-sm border-round-md"
                                            onClick={() => handleOpenProductMutasi(r)}
                                            tooltip="Kartu Mutasi Stok"
                                            tooltipOptions={{ position: 'top' }}
                                        />
                                    </div>
                                )}
                            />
                        </DataTable>
                    </TabPanel>

                    {/* ── TAB 2: RIWAYAT PURCHASE ORDER ── */}
                    <TabPanel header="Riwayat Restock & PO Supplier" leftIcon="pi pi-truck mr-2">
                        <DataTable
                            value={dataPo}
                            loading={loadingPo}
                            paginator
                            rows={rowsPo}
                            totalRecords={totalPoRecords}
                            lazy
                            first={(pagePo - 1) * rowsPo}
                            onPage={(e) => {
                                setPagePo((e.page || 0) + 1);
                                setRowsPo(e.rows);
                            }}
                            dataKey="kode_po"
                            className="p-datatable-sm"
                            emptyMessage="Belum ada riwayat transaksi Purchase Order."
                            responsiveLayout="scroll"
                            rowsPerPageOptions={[10, 25, 50]}
                            paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink CurrentPageReport RowsPerPageDropdown"
                            currentPageReportTemplate="Menampilkan {first} - {last} dari {totalPoRecords} data"
                            header={
                                <div className="flex flex-column gap-3">
                                    <div className="flex flex-wrap align-items-center justify-content-between gap-2">
                                        <div>
                                            <span className="text-xl font-bold text-900 block">Riwayat Faktur & Purchase Order</span>
                                            <span className="text-xs text-500">Penerimaan pasokan produk dari rekanan supplier</span>
                                        </div>
                                        <div className="flex flex-wrap align-items-center gap-2 ml-auto w-full md:w-auto">
                                            {/* Filter Status PO */}
                                            <Dropdown
                                                value={filterStatusPo}
                                                options={[
                                                    { label: 'Semua Status', value: '' },
                                                    { label: 'Diterima', value: 'diterima' },
                                                    { label: 'Dikirim', value: 'dikirim' },
                                                    { label: 'Draft', value: 'draft' },
                                                    { label: 'Dibatalkan', value: 'batal' },
                                                ]}
                                                onChange={(e) => setFilterStatusPo(e.value)}
                                                placeholder="Status PO"
                                                className="p-inputtext-sm text-sm border-round-md w-full md:w-11rem"
                                            />

                                            <IconField iconPosition="left" className="w-full md:w-18rem">
                                                <InputIcon className="pi pi-search" />
                                                <InputText
                                                    value={keywordPo}
                                                    onChange={(e) => setKeywordPo(e.target.value)}
                                                    placeholder="Cari Kode PO / Supplier..."
                                                    className="w-full text-sm"
                                                />
                                            </IconField>
                                            <Button
                                                icon="pi pi-refresh"
                                                outlined
                                                severity="success"
                                                tooltip="Refresh Data"
                                                tooltipOptions={{ position: 'bottom' }}
                                                loading={loadingPo}
                                                onClick={loadPoData}
                                            />
                                        </div>
                                    </div>

                                    <KeteranganStatus
                                        className="mb-2"
                                        items={[
                                            { label: 'Diterima (Selesai)', color: '#22c55e' },
                                            { label: 'Dikirim (Dalam Pengiriman)', color: '#0284c7' },
                                            { label: 'Draft (Menunggu)', color: '#f97316' },
                                            { label: 'Dibatalkan', color: '#ef4444' },
                                        ]}
                                    />
                                </div>
                            }
                        >
                            {/* 1. Status Indicator Dot */}
                            <Column
                                header=""
                                headerStyle={{ width: '3rem', textAlign: 'center', whiteSpace: 'nowrap' }}
                                bodyStyle={{ textAlign: 'center' }}
                                body={(r) => {
                                    const st = String(r.status || 'diterima').toLowerCase();
                                    let dotColor = '#22c55e';
                                    let dotTitle = 'PO Diterima (Selesai)';

                                    if (st === 'dikirim') {
                                        dotColor = '#0284c7';
                                        dotTitle = 'PO Dikirim (Dalam Pengiriman)';
                                    } else if (st === 'draft' || st === 'menunggu') {
                                        dotColor = '#f97316';
                                        dotTitle = 'PO Draft (Menunggu)';
                                    } else if (st === 'batal' || st === 'dibatalkan') {
                                        dotColor = '#ef4444';
                                        dotTitle = 'PO Dibatalkan';
                                    }

                                    return (
                                        <div className="flex justify-content-center" title={dotTitle}>
                                            <span
                                                style={{
                                                    display: 'inline-block',
                                                    width: '13px',
                                                    height: '13px',
                                                    borderRadius: '3px',
                                                    backgroundColor: dotColor,
                                                    boxShadow: `0 1px 3px ${dotColor}66`,
                                                }}
                                            />
                                        </div>
                                    );
                                }}
                            />
                            <Column
                                field="kode_po"
                                header="Nomor PO"
                                sortable
                                headerStyle={{ minWidth: '10rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                body={(r) => (
                                    <span className="font-mono font-bold text-purple-700 bg-purple-50 px-2 py-1 border-round text-xs">
                                        {r.kode_po}
                                    </span>
                                )}
                            />
                            <Column
                                field="tanggal_po"
                                header="Tanggal PO"
                                headerStyle={{ minWidth: '9rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                body={(r) => formatDateIndo(r.tanggal_po)}
                                className="text-xs text-600"
                            />
                            <Column
                                field="nama_supplier"
                                header="Supplier Rekanan"
                                headerStyle={{ minWidth: '12rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                body={(r) => (
                                    <div>
                                        <span className="font-semibold text-900 text-sm block">{r.nama_supplier}</span>
                                        <span className="text-xs text-500 font-mono">{r.kode_supplier}</span>
                                    </div>
                                )}
                            />
                            <Column
                                field="item_count"
                                header="Item Dibeli"
                                headerStyle={{ minWidth: '9rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                body={(r) => (
                                    <span className="text-xs text-700 font-medium">
                                        {r.items?.length || 0} macam barang
                                    </span>
                                )}
                            />
                            <Column
                                field="total_po"
                                header="Total Nominal"
                                headerStyle={{ minWidth: '10rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                body={(r) => <span className="font-bold text-green-700 text-sm">{formatRupiah(r.total_po)}</span>}
                            />

                            <Column field="created_by" header="Operator" headerStyle={{ minWidth: '8rem', fontWeight: 'bold', whiteSpace: 'nowrap' }} className="text-xs text-500" />
                            <Column
                                header="Rincian"
                                align="center"
                                headerStyle={{ width: '7rem', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                body={(r) => (
                                    <Button
                                        label="Rincian"
                                        icon="pi pi-eye"
                                        size="small"
                                        outlined
                                        severity="info"
                                        className="text-xs py-1 px-2 border-round-md"
                                        onClick={() => handleViewPoDetail(r)}
                                    />
                                )}
                            />
                        </DataTable>
                    </TabPanel>

                    {/* ── TAB 3: LOG MUTASI STOK ── */}
                    <TabPanel header="Log Mutasi Stok" leftIcon="pi pi-list mr-2">
                        <DataTable
                            value={dataMutasi}
                            loading={loadingMutasi}
                            paginator
                            rows={rowsMutasi}
                            totalRecords={totalMutasiRecords}
                            lazy
                            first={(pageMutasi - 1) * rowsMutasi}
                            onPage={(e) => {
                                setPageMutasi((e.page || 0) + 1);
                                setRowsMutasi(e.rows);
                            }}
                            dataKey="id"
                            className="p-datatable-sm"
                            emptyMessage="Belum ada riwayat mutasi stok tercatat."
                            responsiveLayout="scroll"
                            rowsPerPageOptions={[10, 25, 50]}
                            paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink CurrentPageReport RowsPerPageDropdown"
                            currentPageReportTemplate="Menampilkan {first} - {last} dari {totalMutasiRecords} data"
                            header={
                                <div className="flex flex-column gap-3">
                                    <div>
                                        <span className="text-xl font-bold text-900 block">Kartu Audit Mutasi Stok Fisik</span>
                                        <span className="text-xs text-500">Pencatatan riwayat penambahan, pengurangan, dan penyesuaian stok</span>
                                    </div>

                                    {/* Baris Filter (Kiri) & Search + Refresh (Kanan Mentok) */}
                                    <div className="flex flex-wrap align-items-center justify-content-between gap-2">
                                        <div className="flex flex-wrap align-items-center gap-2">
                                            <Dropdown
                                                value={filterJenisMutasi}
                                                options={[
                                                    { label: 'Semua Mutasi', value: '' },
                                                    { label: 'Stok Masuk', value: 'masuk' },
                                                    { label: 'Stok Keluar', value: 'keluar' },
                                                    { label: 'Penyesuaian', value: 'penyesuaian' },
                                                ]}
                                                onChange={(e) => setFilterJenisMutasi(e.value)}
                                                placeholder="Jenis Mutasi"
                                                className="p-inputtext-sm text-sm border-round-md w-full md:w-12rem"
                                            />
                                        </div>

                                        <div className="flex align-items-center gap-2 ml-auto w-full md:w-auto">
                                            <IconField iconPosition="left" className="w-full md:w-18rem">
                                                <InputIcon className="pi pi-search" />
                                                <InputText
                                                    value={keywordMutasi}
                                                    onChange={(e) => setKeywordMutasi(e.target.value)}
                                                    placeholder="Cari Kode / Produk / Ref..."
                                                    className="w-full text-sm"
                                                />
                                            </IconField>
                                            <Button
                                                icon="pi pi-refresh"
                                                outlined
                                                severity="success"
                                                tooltip="Refresh Data"
                                                tooltipOptions={{ position: 'bottom' }}
                                                loading={loadingMutasi}
                                                onClick={loadMutasiData}
                                            />
                                        </div>
                                    </div>

                                    <KeteranganStatus
                                        className="mb-2"
                                        items={[
                                            { label: 'Stok Masuk (Restock / Penambahan)', color: '#22c55e' },
                                            { label: 'Stok Keluar (Penjualan / Treatment)', color: '#ef4444' },
                                            { label: 'Penyesuaian (Koreksi / Opname)', color: '#f97316' },
                                        ]}
                                    />
                                </div>
                            }
                        >
                            {/* 1. Status Indicator Dot */}
                            <Column
                                header=""
                                headerStyle={{ width: '3rem', textAlign: 'center', whiteSpace: 'nowrap' }}
                                bodyStyle={{ textAlign: 'center', paddingTop: '0.75rem', paddingBottom: '0.75rem' }}
                                body={(r) => {
                                    const jn = String(r.jenis_movement || 'masuk').toLowerCase();
                                    let dotColor = '#22c55e';
                                    let dotTitle = 'Stok Masuk (Restock / Penambahan)';

                                    if (jn === 'keluar') {
                                        dotColor = '#ef4444';
                                        dotTitle = 'Stok Keluar (Penjualan / Treatment)';
                                    } else if (jn === 'penyesuaian') {
                                        dotColor = '#f97316';
                                        dotTitle = 'Penyesuaian (Koreksi / Opname)';
                                    }

                                    return (
                                        <div className="flex justify-content-center" title={dotTitle}>
                                            <span
                                                style={{
                                                    display: 'inline-block',
                                                    width: '13px',
                                                    height: '13px',
                                                    borderRadius: '3px',
                                                    backgroundColor: dotColor,
                                                    boxShadow: `0 1px 3px ${dotColor}66`,
                                                }}
                                            />
                                        </div>
                                    );
                                }}
                            />
                            <Column
                                field="created_at"
                                header="Waktu & Tanggal"
                                headerStyle={{ minWidth: '11rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                bodyStyle={{ paddingTop: '0.75rem', paddingBottom: '0.75rem' }}
                                body={(r) => formatDateTimeIndo(r.created_at || r.tanggal)}
                                className="text-xs text-600"
                            />
                            <Column
                                field="kode_stok_movement"
                                header="Kode Mutasi"
                                headerStyle={{ minWidth: '11rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                bodyStyle={{ paddingTop: '0.75rem', paddingBottom: '0.75rem' }}
                                body={(r) => (
                                    <span className="font-mono font-bold text-700 text-xs">
                                        {r.kode_stok_movement}
                                    </span>
                                )}
                            />
                            <Column
                                field="kode_produk"
                                header="Kode Produk"
                                headerStyle={{ minWidth: '8rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                bodyStyle={{ paddingTop: '0.75rem', paddingBottom: '0.75rem' }}
                                body={(r) => (
                                    <span className="font-mono font-bold text-purple-700 bg-purple-50 px-2 py-1 border-round text-xs">
                                        {r.kode_produk}
                                    </span>
                                )}
                            />
                            <Column
                                field="nama_produk"
                                header="Nama Produk"
                                headerStyle={{ minWidth: '13rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                bodyStyle={{ paddingTop: '0.75rem', paddingBottom: '0.75rem' }}
                                body={(r) => (
                                    <span className="font-semibold text-900 text-sm block">
                                        {r.nama_produk || r.kode_produk}
                                    </span>
                                )}
                            />
                            <Column
                                field="qty"
                                header="Perubahan"
                                headerStyle={{ minWidth: '8rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                bodyStyle={{ paddingTop: '0.75rem', paddingBottom: '0.75rem' }}
                                body={(r) => (
                                    <span
                                        className={`font-bold text-sm ${
                                            r.jenis_movement === 'masuk'
                                                ? 'text-green-700'
                                                : r.jenis_movement === 'keluar'
                                                ? 'text-red-600'
                                                : 'text-amber-600'
                                        }`}
                                    >
                                        {r.jenis_movement === 'masuk' ? `+${r.qty}` : r.jenis_movement === 'keluar' ? `-${r.qty}` : `${r.qty}`} {r.satuan || ''}
                                    </span>
                                )}
                            />
                            <Column
                                header="Sebelum"
                                headerStyle={{ minWidth: '7rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                bodyStyle={{ paddingTop: '0.75rem', paddingBottom: '0.75rem' }}
                                body={(r) => <span className="text-sm text-600 font-medium">{r.stok_sebelum} {r.satuan || ''}</span>}
                            />
                            <Column
                                header="Sesudah"
                                headerStyle={{ minWidth: '7rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                bodyStyle={{ paddingTop: '0.75rem', paddingBottom: '0.75rem' }}
                                body={(r) => <span className="text-sm font-bold text-900">{r.stok_sesudah} {r.satuan || ''}</span>}
                            />
                            <Column
                                field="referensi"
                                header="No. Referensi / PO"
                                headerStyle={{ minWidth: '11rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                bodyStyle={{ paddingTop: '0.75rem', paddingBottom: '0.75rem' }}
                                body={(r) => (
                                    <span className="font-mono font-bold text-primary text-xs bg-teal-50 px-2 py-1 border-round">
                                        {r.referensi || '-'}
                                    </span>
                                )}
                            />
                            <Column
                                field="created_by"
                                header="Operator"
                                headerStyle={{ minWidth: '8rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                bodyStyle={{ paddingTop: '0.75rem', paddingBottom: '0.75rem' }}
                                className="text-xs text-500"
                            />
                        </DataTable>
                    </TabPanel>
                </TabView>
            </div>

            {/* =========================================================
            MODAL PENGADAAN DARI SUPPLIER (MULTI-ITEM & MULTI-BATCH)
            ========================================================= */}
            <Dialog
                header="Pengadaan Produk dari Supplier (Penerimaan Multi-Item & Multi-Batch)"
                visible={dialogPengadaanVisible}
                style={{ width: '920px', maxWidth: '95vw' }}
                modal
                onHide={() => setDialogPengadaanVisible(false)}
            >
                <div className="flex flex-column gap-3 pt-2">
                    <div className="p-3 border-round-lg bg-green-50 border-1 border-green-200 text-xs text-green-900 flex align-items-start gap-2">
                        <i className="pi pi-info-circle text-green-700 text-base mt-0.5" />
                        <div>
                            <span className="font-bold block mb-0.5">Sistem Pengadaan Terpadu (Restock &amp; Produk Baru):</span>
                            Pilih rekanan Supplier dan tanggal nota sekali di atas, lalu daftarkan produk lama (restock) maupun produk baru dalam 1 faktur pengadaan. Setiap produk dapat memiliki beberapa nomor batch fisik yang berbeda.
                        </div>
                    </div>

                    {/* ZONA HEADER (Diisi Sekali) */}
                    <div className="surface-50 p-3 border-round-xl border-1 border-200">
                        <div className="text-xs font-bold text-700 uppercase mb-2 flex align-items-center gap-2">
                            <i className="pi pi-building text-green-600" />
                            Informasi Header Faktur / PO
                        </div>
                        <div className="grid">
                            <div className="col-12 md:col-6">
                                <label className="block text-xs font-bold text-700 mb-1">Supplier Rekanan *</label>
                                <Dropdown
                                    value={formPengadaan.kode_supplier}
                                    options={supplierList}
                                    onChange={(e) => setFormPengadaan({ ...formPengadaan, kode_supplier: e.value })}
                                    placeholder="Pilih Supplier"
                                    className="w-full p-inputtext-sm"
                                    filter
                                />
                            </div>
                            <div className="col-12 md:col-6">
                                <label className="block text-xs font-bold text-700 mb-1">Tanggal Pembelian *</label>
                                <InputText
                                    type="date"
                                    value={formPengadaan.tanggal}
                                    onChange={(e) => setFormPengadaan({ ...formPengadaan, tanggal: e.target.value })}
                                    className="w-full p-inputtext-sm"
                                />
                            </div>
                        </div>
                    </div>

                    {/* ZONA DAFTAR PRODUK (KARTU-KARTU PRODUK) */}
                    <div className="flex flex-column gap-3">
                        <div className="flex align-items-center justify-content-between">
                            <span className="text-sm font-bold text-800 flex align-items-center gap-2">
                                <i className="pi pi-box text-green-600" />
                                Daftar Produk yang Diadakan
                            </span>
                            <span className="text-xs text-500 font-medium">
                                Total {formPengadaan.items.length} Macam Produk
                            </span>
                        </div>

                        {formPengadaan.items.map((prod: any, prodIdx: number) => {
                            const isExisting = prod.tipe_item === 'existing';
                            const selectedProdObj = (allProdukList.length > 0 ? allProdukList : dataProduk).find(
                                (p: any) => p.kode_produk === prod.kode_produk
                            );
                            const prodTitle = isExisting
                                ? (selectedProdObj?.nama || selectedProdObj?.nama_produk || `Produk #${prodIdx + 1}`)
                                : (prod.nama_produk_baru || `Produk Baru #${prodIdx + 1}`);

                            const totalBatchQty = prod.batches?.reduce((acc: number, b: any) => acc + (Number(b.qty) || 0), 0) || 0;
                            const subtotalHarga = totalBatchQty * (Number(prod.harga_beli) || 0);

                            return (
                                <div
                                    key={prodIdx}
                                    className="border-1 border-300 border-round-xl surface-card shadow-1 overflow-hidden"
                                >
                                    {/* Header Kartu Produk: Nomor Urut, Toggle Tipe, & Hapus */}
                                    <div className="p-3 bg-gray-50 border-bottom-1 border-200 flex flex-wrap align-items-center justify-content-between gap-2">
                                        <div className="flex align-items-center gap-3">
                                            <div className="flex align-items-center gap-2">
                                                <span
                                                    style={{
                                                        width: '24px',
                                                        height: '24px',
                                                        minWidth: '24px',
                                                        borderRadius: '50%',
                                                        backgroundColor: '#10b981',
                                                        color: '#ffffff',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '12px',
                                                        fontWeight: 'bold',
                                                    }}
                                                >
                                                    {prodIdx + 1}
                                                </span>
                                                <span className="font-bold text-sm text-800">
                                                    {isExisting ? 'Produk Sudah Ada (Restock)' : 'Produk Baru'} #{prodIdx + 1}
                                                </span>
                                            </div>

                                            {/* Toggle Tipe Produk */}
                                            <div className="flex align-items-center gap-3 ml-2 pl-3 border-left-1 border-300">
                                                <div className="flex align-items-center">
                                                    <RadioButton
                                                        inputId={`tipe_exist_${prodIdx}`}
                                                        name={`tipe_item_${prodIdx}`}
                                                        value="existing"
                                                        onChange={() => handleUpdatePengadaanItem(prodIdx, 'tipe_item', 'existing')}
                                                        checked={prod.tipe_item === 'existing'}
                                                    />
                                                    <label htmlFor={`tipe_exist_${prodIdx}`} className="ml-2 text-xs font-semibold text-700 cursor-pointer">
                                                        Produk Sudah Ada
                                                    </label>
                                                </div>
                                                <div className="flex align-items-center">
                                                    <RadioButton
                                                        inputId={`tipe_baru_${prodIdx}`}
                                                        name={`tipe_item_${prodIdx}`}
                                                        value="baru"
                                                        onChange={() => handleUpdatePengadaanItem(prodIdx, 'tipe_item', 'baru')}
                                                        checked={prod.tipe_item === 'baru'}
                                                    />
                                                    <label htmlFor={`tipe_baru_${prodIdx}`} className="ml-2 text-xs font-semibold text-700 cursor-pointer">
                                                        Produk Baru
                                                    </label>
                                                </div>
                                            </div>
                                        </div>

                                        {formPengadaan.items.length > 1 && (
                                            <Button
                                                type="button"
                                                icon="pi pi-trash"
                                                label="Hapus"
                                                severity="danger"
                                                text
                                                size="small"
                                                onClick={() => handleRemovePengadaanItem(prodIdx)}
                                                className="p-0 text-red-600 text-xs hover:bg-red-50"
                                            />
                                        )}
                                    </div>

                                    {/* Body Kartu Produk */}
                                    <div className="p-3 flex flex-column gap-3">
                                        {isExisting ? (
                                            /* Tipe Existing */
                                            <div className="grid">
                                                <div className="col-12 md:col-6">
                                                    <label className="block text-xs font-bold text-700 mb-1">Pilih Produk *</label>
                                                    <Dropdown
                                                        value={prod.kode_produk}
                                                        options={(allProdukList.length > 0 ? allProdukList : dataProduk).map((p: any) => ({
                                                            label: `${p.nama || p.nama_produk || '-'} (${p.kode_produk}) - Stok Saat Ini: ${p.stok_total_fisik ?? p.stok_tersedia ?? p.stok_total ?? 0} ${p.satuan || 'Pcs'}`,
                                                            value: p.kode_produk,
                                                        }))}
                                                        onChange={(e) => handleUpdatePengadaanItem(prodIdx, 'kode_produk', e.value)}
                                                        placeholder="Cari & Pilih Produk"
                                                        className="w-full p-inputtext-sm"
                                                        filter
                                                    />
                                                </div>
                                                <div className="col-12 md:col-3">
                                                    <label className="block text-xs font-bold text-700 mb-1">Harga Beli Satuan (Rp) *</label>
                                                    <InputNumber
                                                        value={prod.harga_beli}
                                                        onValueChange={(e) => handleUpdatePengadaanItem(prodIdx, 'harga_beli', e.value || 0)}
                                                        mode="currency"
                                                        currency="IDR"
                                                        locale="id-ID"
                                                        className="w-full p-inputtext-sm"
                                                    />
                                                </div>
                                                <div className="col-12 md:col-3 flex align-items-center pt-3">
                                                    <div className="flex align-items-center">
                                                        <Checkbox
                                                            inputId={`update_hb_${prodIdx}`}
                                                            checked={prod.update_harga_beli_master !== false}
                                                            onChange={(e) => handleUpdatePengadaanItem(prodIdx, 'update_harga_beli_master', e.checked)}
                                                        />
                                                        <label htmlFor={`update_hb_${prodIdx}`} className="ml-2 text-xs text-700 cursor-pointer">
                                                            Perbarui Harga Beli Master
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            /* Tipe Baru */
                                            <>
                                                <div className="grid">
                                                    <div className="col-12 md:col-4">
                                                        <label className="block text-xs font-bold text-700 mb-1">Kategori Produk *</label>
                                                        <Dropdown
                                                            value={prod.kode_kategori_produk}
                                                            options={kategoriList}
                                                            onChange={(e) => handleUpdatePengadaanItem(prodIdx, 'kode_kategori_produk', e.value)}
                                                            placeholder="Pilih Kategori"
                                                            className="w-full p-inputtext-sm"
                                                        />
                                                    </div>
                                                    <div className="col-12 md:col-5">
                                                        <label className="block text-xs font-bold text-700 mb-1">Nama Produk Baru *</label>
                                                        <InputText
                                                            value={prod.nama_produk_baru}
                                                            onChange={(e) => handleUpdatePengadaanItem(prodIdx, 'nama_produk_baru', e.target.value)}
                                                            placeholder="Contoh: Glowing Sunscreen SPF 50"
                                                            className="w-full p-inputtext-sm"
                                                        />
                                                    </div>
                                                    <div className="col-12 md:col-3">
                                                        <label className="block text-xs font-bold text-700 mb-1">Satuan *</label>
                                                        <InputText
                                                            value={prod.satuan}
                                                            onChange={(e) => handleUpdatePengadaanItem(prodIdx, 'satuan', e.target.value)}
                                                            placeholder="Pcs, Botol, Tube, Box"
                                                            className="w-full p-inputtext-sm"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="grid">
                                                    <div className="col-12 md:col-4">
                                                        <label className="block text-xs font-bold text-700 mb-1">Harga Beli Satuan (Rp) *</label>
                                                        <InputNumber
                                                            value={prod.harga_beli}
                                                            onValueChange={(e) => handleUpdatePengadaanItem(prodIdx, 'harga_beli', e.value || 0)}
                                                            mode="currency"
                                                            currency="IDR"
                                                            locale="id-ID"
                                                            className="w-full p-inputtext-sm"
                                                        />
                                                    </div>
                                                    <div className="col-12 md:col-4">
                                                        <label className="block text-xs font-bold text-700 mb-1">Harga Jual Satuan (Rp) *</label>
                                                        <InputNumber
                                                            value={prod.harga_jual}
                                                            onValueChange={(e) => handleUpdatePengadaanItem(prodIdx, 'harga_jual', e.value || 0)}
                                                            mode="currency"
                                                            currency="IDR"
                                                            locale="id-ID"
                                                            className="w-full p-inputtext-sm"
                                                        />
                                                    </div>
                                                    <div className="col-12 md:col-4">
                                                        <label className="block text-xs font-bold text-700 mb-1">Batas Buffer Stok Min.</label>
                                                        <InputNumber
                                                            value={prod.buffer_min}
                                                            onValueChange={(e) => handleUpdatePengadaanItem(prodIdx, 'buffer_min', e.value || 0)}
                                                            className="w-full p-inputtext-sm"
                                                            min={0}
                                                        />
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {/* Sub-Daftar Batch Fisik (SAMA UNTUK KEDUA TIPE) */}
                                        <div className="border-1 border-dashed border-300 border-round-lg p-3 bg-gray-50 flex flex-column gap-2">
                                            <div className="flex align-items-center justify-content-between">
                                                <span className="text-xs font-bold text-700 uppercase flex align-items-center gap-2">
                                                    <i className="pi pi-tags text-green-600" />
                                                    Rincian Batch Fisik untuk "{prodTitle}"
                                                </span>
                                                <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 border-round font-semibold">
                                                    {prod.batches.length} Batch Terdaftar
                                                </span>
                                            </div>

                                            <div className="flex flex-column gap-2 mt-1">
                                                {prod.batches.map((batch: any, bIdx: number) => (
                                                    <div
                                                        key={bIdx}
                                                        className="p-2 border-round-lg surface-card border-1 border-200 grid align-items-center m-0"
                                                    >
                                                        <div className="col-12 md:col-2 p-1">
                                                            <div className="flex align-items-center gap-2">
                                                                <span
                                                                    style={{
                                                                        width: '22px',
                                                                        height: '22px',
                                                                        minWidth: '22px',
                                                                        borderRadius: '50%',
                                                                        backgroundColor: '#10b981',
                                                                        color: '#ffffff',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        fontSize: '11px',
                                                                        fontWeight: 'bold',
                                                                    }}
                                                                >
                                                                    {bIdx + 1}
                                                                </span>
                                                                <span className="text-xs font-bold text-700">
                                                                    Batch {bIdx + 1}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="col-12 md:col-3 p-1">
                                                            <label className="block text-xs font-medium text-600 mb-1">
                                                                Qty ({prod.satuan || 'Pcs'}) *
                                                            </label>
                                                            <InputNumber
                                                                value={batch.qty}
                                                                onValueChange={(e) => handleUpdatePengadaanBatch(prodIdx, bIdx, 'qty', e.value || 1)}
                                                                className="w-full p-inputtext-sm"
                                                                min={1}
                                                            />
                                                        </div>
                                                        <div className="col-12 md:col-3 p-1">
                                                            <label className="block text-xs font-medium text-600 mb-1">
                                                                No. Batch Pabrik *
                                                            </label>
                                                            <InputText
                                                                value={batch.no_batch}
                                                                onChange={(e) => handleUpdatePengadaanBatch(prodIdx, bIdx, 'no_batch', e.target.value)}
                                                                placeholder="Misal: LOT-2026-A"
                                                                className="w-full p-inputtext-sm font-monospace"
                                                            />
                                                        </div>
                                                        <div className="col-12 md:col-3 p-1">
                                                            <label className="block text-xs font-medium text-600 mb-1">
                                                                Tgl Kadaluarsa (Exp) *
                                                            </label>
                                                            <InputText
                                                                type="date"
                                                                value={batch.tanggal_kadaluarsa}
                                                                onChange={(e) => handleUpdatePengadaanBatch(prodIdx, bIdx, 'tanggal_kadaluarsa', e.target.value)}
                                                                className="w-full p-inputtext-sm"
                                                            />
                                                        </div>
                                                        <div className="col-12 md:col-1 p-1 flex justify-content-center">
                                                            {prod.batches.length > 1 && (
                                                                <Button
                                                                    type="button"
                                                                    icon="pi pi-times"
                                                                    severity="danger"
                                                                    text
                                                                    rounded
                                                                    size="small"
                                                                    tooltip="Hapus batch ini"
                                                                    onClick={() => handleRemovePengadaanBatch(prodIdx, bIdx)}
                                                                    className="p-1 h-2rem w-2rem text-red-500"
                                                                />
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="mt-1">
                                                <Button
                                                    type="button"
                                                    label="Tambah Batch Lain untuk Produk Ini"
                                                    icon="pi pi-plus"
                                                    size="small"
                                                    onClick={() => handleAddPengadaanBatch(prodIdx)}
                                                    className="w-full py-2 text-xs font-bold bg-green-600 hover:bg-green-700 text-white border-none shadow-1"
                                                />
                                            </div>
                                        </div>

                                        {/* Subtotal ringkasan per produk */}
                                        <div className="flex align-items-center justify-content-between text-xs text-600 px-1">
                                            <span>
                                                Total Batch Fisik: <strong>{totalBatchQty} {prod.satuan || 'Pcs'}</strong> ({prod.batches.length} batch)
                                            </span>
                                            <span className="font-semibold text-800">
                                                Subtotal Nilai: {formatRupiah(subtotalHarga)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Tombol Tambah Produk Lainnya */}
                        <Button
                            type="button"
                            label="+ Tambah Produk Lainnya (PO Campuran / Multi-Produk)"
                            icon="pi pi-plus"
                            outlined
                            onClick={() => handleAddPengadaanItem()}
                            className="w-full py-2.5 font-bold border-2 text-green-700 border-green-600 hover:bg-green-50"
                        />
                    </div>

                    {/* RINGKASAN TOTAL NILAI TRANSAKSI */}
                    {(() => {
                        const totalMacam = formPengadaan.items.length;
                        const totalBatch = formPengadaan.items.reduce(
                            (acc: number, item: any) => acc + (item.batches?.length || 0),
                            0
                        );
                        const totalPcs = formPengadaan.items.reduce(
                            (acc: number, item: any) =>
                                acc + (item.batches?.reduce((bAcc: number, b: any) => bAcc + (Number(b.qty) || 0), 0) || 0),
                            0
                        );
                        const totalNilai = formPengadaan.items.reduce((acc: number, item: any) => {
                            const itemQty = item.batches?.reduce((bAcc: number, b: any) => bAcc + (Number(b.qty) || 0), 0) || 0;
                            return acc + itemQty * (Number(item.harga_beli) || 0);
                        }, 0);

                        return (
                            <div className="surface-900 text-white p-3 border-round-xl flex align-items-center justify-content-between mt-2">
                                <div>
                                    <span className="text-xs uppercase font-bold text-400 block mb-1">
                                        TOTAL NILAI PENGADAAN (PO)
                                    </span>
                                    <span className="text-sm font-semibold text-200">
                                        {totalMacam} macam produk · {totalBatch} batch fisik · {totalPcs} total unit
                                    </span>
                                </div>
                                <div className="text-right">
                                    <span className="text-xs uppercase font-bold text-400 block mb-1">
                                        Total Tagihan Supplier
                                    </span>
                                    <span className="text-xl font-bold text-green-400">
                                        {formatRupiah(totalNilai)}
                                    </span>
                                </div>
                            </div>
                        );
                    })()}
                </div>

                <div className="flex justify-content-end gap-2 mt-4">
                    <Button label="Batal" icon="pi pi-times" text onClick={() => setDialogPengadaanVisible(false)} />
                    <Button
                        label={`Simpan Pengadaan (${formPengadaan.items.length} Produk)`}
                        icon="pi pi-check"
                        loading={savingPengadaan}
                        onClick={handleSavePengadaan}
                        className="bg-green-600 hover:bg-green-700 border-none font-bold px-4"
                    />
                </div>
            </Dialog>

            {/* =========================================================
                MODAL 4: VERIFIKASI & EDIT BATCH FISIK
                ========================================================= */}
            <Dialog
                header={`Verifikasi / Edit Batch Fisik - ${formEditBatch.nama_produk}`}
                visible={dialogEditBatchVisible}
                style={{ width: '500px' }}
                modal
                onHide={() => setDialogEditBatchVisible(false)}
            >
                <div className="flex flex-column gap-3 pt-2">
                    {formEditBatch.is_legacy_estimate === 1 && (
                        <div className="p-3 bg-amber-50 border-1 border-amber-300 border-round-lg flex align-items-start gap-2 text-xs text-amber-900">
                            <i className="pi pi-exclamation-triangle text-amber-600 text-base mt-0.5" />
                            <div>
                                <span className="font-bold block">Batch Warisan Sistem:</span>
                                Tanggal kadaluarsa batch ini sebelumnya diset default perkiraan (+1 tahun). Silakan periksa kemasan fisik produk dan masukkan nomor batch serta tanggal kadaluarsa yang sebenarnya.
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-semibold mb-1">Kode Batch Sistem</label>
                        <InputText value={formEditBatch.kode_batch} disabled className="w-full text-sm bg-100 font-mono" />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold mb-1">Nomor Batch (dari Kemasan) *</label>
                        <InputText
                            value={formEditBatch.no_batch}
                            onChange={(e) => setFormEditBatch({ ...formEditBatch, no_batch: e.target.value })}
                            placeholder="Contoh: LOT-2026-X01"
                            className="w-full text-sm font-mono"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold mb-1">Tanggal Kadaluarsa (Expired Date) *</label>
                        <InputText
                            type="date"
                            value={formEditBatch.tanggal_kadaluarsa}
                            onChange={(e) => setFormEditBatch({ ...formEditBatch, tanggal_kadaluarsa: e.target.value })}
                            className="w-full text-sm"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold mb-1">Status Batch</label>
                        <Dropdown
                            value={formEditBatch.status}
                            options={[
                                { label: 'Aktif (Dapat Dijual / Prioritas FEFO)', value: 'aktif' },
                                { label: 'Habis (Stok 0)', value: 'habis' },
                                { label: 'Kadaluarsa (Karantina / Tidak Dijual)', value: 'kadaluarsa' },
                            ]}
                            onChange={(e) => setFormEditBatch({ ...formEditBatch, status: e.value })}
                            className="w-full text-sm"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold mb-1">Catatan Verifikasi</label>
                        <InputText
                            value={formEditBatch.catatan}
                            onChange={(e) => setFormEditBatch({ ...formEditBatch, catatan: e.target.value })}
                            placeholder="misal: Telah diverifikasi fisik oleh staf farmasi"
                            className="w-full text-sm"
                        />
                    </div>
                </div>

                <div className="flex justify-content-end gap-2 mt-4">
                    <Button label="Batal" icon="pi pi-times" text onClick={() => setDialogEditBatchVisible(false)} />
                    <Button
                        label="Simpan Verifikasi"
                        icon="pi pi-check"
                        loading={savingEditBatch}
                        onClick={handleSaveEditBatch}
                        className="bg-primary border-none"
                    />
                </div>
            </Dialog>

            {/* =========================================================
                MODAL 3: DETAIL ITEM PURCHASE ORDER (PO)
                ========================================================= */}
            <Dialog
                header={`Rincian Faktur PO: ${selectedPoDetail?.kode_po || ''}`}
                visible={dialogPoDetailVisible}
                style={{ width: '650px' }}
                modal
                onHide={() => setDialogPoDetailVisible(false)}
            >
                {selectedPoDetail && (
                    <div className="flex flex-column gap-3">
                        <div className="surface-100 border-round-lg p-3 grid m-0 text-xs">
                            <div className="col-6">
                                <span className="text-500 block">Supplier:</span>
                                <span className="font-bold text-900 text-sm">{selectedPoDetail.nama_supplier}</span>
                                <span className="text-500 block">{selectedPoDetail.kode_supplier}</span>
                            </div>
                            <div className="col-3">
                                <span className="text-500 block">Tanggal:</span>
                                <span className="font-bold text-700">{formatDateIndo(selectedPoDetail.tanggal_po)}</span>
                            </div>
                            <div className="col-3">
                                <span className="text-500 block">Status:</span>
                                <Tag value={String(selectedPoDetail.status || 'DITERIMA').toUpperCase()} severity="success" />
                            </div>
                        </div>

                        <DataTable
                            value={selectedPoDetail.items || []}
                            className="p-datatable-sm mt-2"
                            emptyMessage="Tidak ada item pada PO ini."
                        >
                            <Column field="kode_produk" header="Kode" className="text-xs font-bold text-primary" />
                            <Column field="nama_produk" header="Nama Produk" className="text-xs font-semibold" />
                            <Column
                                field="qty"
                                header="Qty"
                                align="center"
                                body={(r) => <span className="text-xs font-bold">{r.qty} {r.satuan}</span>}
                            />
                            <Column
                                field="harga_satuan"
                                header="Harga Satuan"
                                align="right"
                                body={(r) => <span className="text-xs">{formatRupiah(r.harga_satuan)}</span>}
                            />
                            <Column
                                field="subtotal"
                                header="Subtotal"
                                align="right"
                                body={(r) => <span className="text-xs font-bold text-green-700">{formatRupiah(r.subtotal)}</span>}
                            />
                        </DataTable>

                        <div className="flex justify-content-between align-items-center surface-card p-3 border-round-lg border-1 border-200">
                            <span className="font-bold text-sm text-700 uppercase">Total Pembayaran PO</span>
                            <span className="font-black text-xl text-green-800">{formatRupiah(selectedPoDetail.total_po)}</span>
                        </div>
                    </div>
                )}
            </Dialog>

            {/* =========================================================
                MODAL 4: KARTU MUTASI KHUSUS PER PRODUK
                ========================================================= */}
            <Dialog
                header={`Kartu Riwayat Mutasi: ${productMutasiTarget?.nama || ''} (${productMutasiTarget?.kode_produk || ''})`}
                visible={dialogProductMutasiVisible}
                style={{ width: '700px' }}
                modal
                onHide={() => setDialogProductMutasiVisible(false)}
            >
                <DataTable
                    value={productMutasiList}
                    loading={loadingProductMutasi}
                    paginator
                    rows={10}
                    className="p-datatable-sm"
                    emptyMessage="Belum ada riwayat mutasi untuk produk ini."
                >
                    <Column
                        field="created_at"
                        header="Waktu"
                        body={(r) => formatDateTimeIndo(r.created_at || r.tanggal)}
                        className="text-xs text-500"
                    />
                    <Column
                        field="jenis_movement"
                        header="Jenis"
                        body={(r) => (
                            <Tag
                                value={String(r.jenis_movement || 'MASUK').toUpperCase()}
                                severity={
                                    r.jenis_movement === 'masuk'
                                        ? 'success'
                                        : r.jenis_movement === 'keluar'
                                        ? 'danger'
                                        : 'warning'
                                }
                                className="text-[10px]"
                            />
                        )}
                    />
                    <Column
                        header="Perubahan"
                        body={(r) => (
                            <span
                                className={`text-xs font-bold ${
                                    r.jenis_movement === 'masuk' ? 'text-green-700' : 'text-red-600'
                                }`}
                            >
                                {r.jenis_movement === 'masuk' ? `+${r.qty}` : `-${r.qty}`}
                            </span>
                        )}
                    />
                    <Column field="stok_sebelum" header="Sebelum" className="text-xs" />
                    <Column field="stok_sesudah" header="Sesudah" className="text-xs font-bold text-900" />
                    <Column field="referensi" header="Referensi / PO" className="text-xs font-mono text-primary" />
                    <Column field="created_by" header="Operator" className="text-xs text-500" />
                </DataTable>
            </Dialog>
        </div>
    );
};

export default Page;
