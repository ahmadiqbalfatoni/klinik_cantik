'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import postData from '@/lib/axios/postData';
import { Toast } from 'primereact/toast';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Dialog } from 'primereact/dialog';
import { Tag } from 'primereact/tag';
import { Dropdown } from 'primereact/dropdown';
import { Divider } from 'primereact/divider';
import { confirmDialog, ConfirmDialog } from 'primereact/confirmdialog';
import { IconField } from 'primereact/iconfield';
import { InputIcon } from 'primereact/inputicon';
import { showError, showSuccess, openWhatsAppChat } from '@/lib/tools/generalTools';
import { PasienFormDialog } from '@/app/(main)/pendaftaran-antrean/pendaftaran-pasien/components/dialogs/PasienFormDialog';
import { useRouter } from 'next/navigation';
import KeteranganStatus from '@/app/components/KeteranganStatus';
import { PasienKtpCard, Pasien } from '@/app/(main)/pendaftaran-antrean/components/PasienKtpCard';
import { DialogPilihanKunjungan } from '@/app/(main)/pendaftaran-antrean/components/DialogPilihanKunjungan';

// Helper hitung umur dari tanggal lahir
const hitungUmur = (tglLahir: string | Date | null | undefined): string => {
    if (!tglLahir) return '-';
    const lahir = new Date(tglLahir);
    if (isNaN(lahir.getTime())) return '-';
    const today = new Date();
    let age = today.getFullYear() - lahir.getFullYear();
    const m = today.getMonth() - lahir.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < lahir.getDate())) {
        age--;
    }
    return age >= 0 ? `${age} thn` : '-';
};

// Helper format tanggal DD-MM-YYYY
const formatTanggal = (dateString: string | null | undefined): string => {
    if (!dateString) return '-';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
};

export default function DataPasienPage() {
    const router = useRouter();
    const toast = useRef<Toast>(null);

    // Data State
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [totalRecords, setTotalRecords] = useState<number>(0);
    const [page, setPage] = useState<number>(1);
    const [rows, setRows] = useState<number>(10);
    const [keyword, setKeyword] = useState<string>('');
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [filterGender, setFilterGender] = useState<string>('');
    const [selectedRows, setSelectedRows] = useState<any[]>([]);

    // Detail Modal State
    const [detailVisible, setDetailVisible] = useState<boolean>(false);
    const [selectedPatient, setSelectedPatient] = useState<Pasien | null>(null);
    const [pilihanKunjunganPasien, setPilihanKunjunganPasien] = useState<Pasien | null>(null);

    // Edit Modal State
    const [editVisible, setEditVisible] = useState<boolean>(false);
    const [patientToEdit, setPatientToEdit] = useState<any>(null);

    // Load data from backend
    const loadData = async () => {
        setLoading(true);
        try {
            const res = await postData('/master/pasien-data', {
                page,
                perPage: rows,
                keyword,
                status: filterStatus || undefined,
                jenis_kelamin: filterGender || undefined,
                sortField: 'created_at',
                sortOrder: 'desc'
            });

            if (res.data?.status === '00' || res.data?.status === 200 || res.status === 200) {
                setData(res.data.data || []);
                setTotalRecords(res.data.total_data || 0);
            } else {
                setData(res.data?.data || []);
                setTotalRecords(res.data?.total_data || 0);
            }
        } catch (error: any) {
            showError(toast, error?.response?.data?.message || 'Gagal memuat data pasien');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [page, rows, keyword, filterStatus, filterGender]);

    // Batch or Single Delete
    const handleDelete = (rms: string[]) => {
        confirmDialog({
            message: `Apakah Anda yakin ingin menghapus atau menonaktifkan ${rms.length} data pasien ini?`,
            header: 'Konfirmasi Hapus Pasien',
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'Ya, Hapus',
            rejectLabel: 'Batal',
            acceptClassName: 'p-button-danger',
            accept: async () => {
                try {
                    const res = await postData('/master/pasien-delete', { no_rm: rms });
                    showSuccess(toast, res.data.message || 'Data pasien berhasil diproses');
                    setSelectedRows([]);
                    loadData();
                } catch (error: any) {
                    showError(toast, error?.response?.data?.message || 'Gagal memproses penghapusan');
                }
            }
        });
    };

    // Open detail modal
    const handleOpenDetail = (row: any) => {
        setSelectedPatient(row);
        setDetailVisible(true);
    };

    // Open edit modal
    const handleOpenEdit = (row: any) => {
        setPatientToEdit(row);
        setEditVisible(true);
    };

    // Stats Summary calculation
    const stats = useMemo(() => {
        const total = totalRecords;
        const aktif = data.filter((d) => d.status === 'aktif').length;
        const laki = data.filter((d) => d.jenis_kelamin === 'L').length;
        const perempuan = data.filter((d) => d.jenis_kelamin === 'P').length;
        return { total, aktif, laki, perempuan };
    }, [data, totalRecords]);

    return (
        <div className="w-full">
            <Toast ref={toast} />
            <ConfirmDialog />

            {/* Quick Detail Dialog (Kartu Identitas Pasien) */}
            <Dialog
                visible={detailVisible}
                onHide={() => setDetailVisible(false)}
                header={
                    <div className="flex align-items-center gap-2">
                        <i className="pi pi-id-card text-emerald-600 text-xl" />
                        <span className="font-bold text-base text-800">Kartu Identitas Pasien</span>
                    </div>
                }
                modal
                style={{ width: '100%', maxWidth: '660px' }}
                breakpoints={{ '661px': '95vw' }}
                contentClassName="p-3 surface-50"
                footer={
                    <div className="flex justify-content-end align-items-center gap-2 pt-3 border-top-1 surface-border">
                        <Button
                            type="button"
                            label="Tutup"
                            icon="pi pi-times"
                            severity="secondary"
                            outlined
                            className="text-xs font-medium"
                            onClick={() => setDetailVisible(false)}
                        />
                        <Button
                            type="button"
                            label="Daftarkan Kunjungan"
                            icon="pi pi-calendar-plus"
                            severity="success"
                            className="font-bold text-xs px-3 py-2 bg-emerald-600 border-emerald-600 hover:bg-emerald-700 text-white shadow-1"
                            onClick={() => {
                                if (selectedPatient) {
                                    const target = selectedPatient;
                                    setDetailVisible(false);
                                    setPilihanKunjunganPasien(target);
                                }
                            }}
                        />
                    </div>
                }
            >
                {selectedPatient && <PasienKtpCard pasien={selectedPatient} />}
            </Dialog>

            {/* POPUP PILIH JENIS PENDAFTARAN (DAFTAR SEKARANG VS BOOKING JADWAL) */}
            <DialogPilihanKunjungan
                visible={Boolean(pilihanKunjunganPasien)}
                onHide={() => setPilihanKunjunganPasien(null)}
                pasien={pilihanKunjunganPasien}
                onSelectDaftarSekarang={(p) => {
                    router.push(`/pendaftaran-antrean/pendaftaran-pasien?no_rm=${encodeURIComponent(p.no_rm)}`);
                }}
                onSelectBooking={(p) => {
                    router.push(`/pendaftaran-antrean/pendaftaran-pasien?tab=1&no_rm=${encodeURIComponent(p.no_rm)}&create=true`);
                }}
            />

            {/* Edit Patient Dialog */}
            <PasienFormDialog
                visible={editVisible}
                onHide={() => {
                    setEditVisible(false);
                    setPatientToEdit(null);
                }}
                initialData={patientToEdit}
                title={patientToEdit?.no_rm ? `Edit Profil Pasien (${patientToEdit.no_rm})` : 'Edit Profil Pasien'}
                submitLabel="Simpan Perubahan"
                toast={toast}
                onSuccess={() => {
                    loadData();
                }}
            />

            {/* Main Content Card */}
            <div className="card border-round-xl p-4 shadow-1 surface-card mb-4">
                {/* Page Header */}
                <div className="mb-4">
                    <h3 className="text-2xl font-bold text-900 flex align-items-center gap-2 mb-1">
                        <i className="pi pi-user text-purple-600 text-2xl" />
                        Kelola Master Data Pasien
                    </h3>
                    <p className="text-500 text-sm m-0">
                        Katalog lengkap rekam medis profil pasien, identitas kependudukan, informasi kontak, dan demografis.
                    </p>
                </div>

                {/* Quick Stats Cards */}
                <div className="grid mb-3">
                    <div className="col-12 sm:col-6 lg:col-3">
                        <div className="p-3 border-round-xl surface-ground border-1 border-200 flex align-items-center justify-content-between">
                            <div>
                                <span className="text-xs text-500 font-semibold uppercase block mb-1">Total Pasien</span>
                                <span className="text-2xl font-bold text-900">{stats.total}</span>
                            </div>
                            <div className="w-3rem h-3rem border-round-lg bg-purple-100 flex align-items-center justify-content-center text-purple-700">
                                <i className="pi pi-users text-xl" />
                            </div>
                        </div>
                    </div>
                    <div className="col-12 sm:col-6 lg:col-3">
                        <div className="p-3 border-round-xl surface-ground border-1 border-200 flex align-items-center justify-content-between">
                            <div>
                                <span className="text-xs text-500 font-semibold uppercase block mb-1">Pasien Aktif</span>
                                <span className="text-2xl font-bold text-green-600">{stats.aktif}</span>
                            </div>
                            <div className="w-3rem h-3rem border-round-lg bg-green-100 flex align-items-center justify-content-center text-green-700">
                                <i className="pi pi-check-circle text-xl" />
                            </div>
                        </div>
                    </div>
                    <div className="col-12 sm:col-6 lg:col-3">
                        <div className="p-3 border-round-xl surface-ground border-1 border-200 flex align-items-center justify-content-between">
                            <div>
                                <span className="text-xs text-500 font-semibold uppercase block mb-1">Pasien Laki-laki</span>
                                <span className="text-2xl font-bold text-blue-600">{stats.laki}</span>
                            </div>
                            <div className="w-3rem h-3rem border-round-lg bg-blue-100 flex align-items-center justify-content-center text-blue-700">
                                <i className="pi pi-user text-xl" />
                            </div>
                        </div>
                    </div>
                    <div className="col-12 sm:col-6 lg:col-3">
                        <div className="p-3 border-round-xl surface-ground border-1 border-200 flex align-items-center justify-content-between">
                            <div>
                                <span className="text-xs text-500 font-semibold uppercase block mb-1">Pasien Perempuan</span>
                                <span className="text-2xl font-bold text-pink-600">{stats.perempuan}</span>
                            </div>
                            <div className="w-3rem h-3rem border-round-lg bg-pink-100 flex align-items-center justify-content-center text-pink-700">
                                <i className="pi pi-heart text-xl" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action Toolbar (Tanpa Tombol 'Baru' sesuai instruksi user) */}
                <div className="flex flex-row flex-wrap align-items-center gap-2 mb-4">
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
                        label={`Hapus${selectedRows.length > 0 ? ` (${selectedRows.length})` : ''}`}
                        icon="pi pi-trash"
                        severity="danger"
                        outlined
                        disabled={selectedRows.length === 0}
                        className="border-round-md font-medium px-3"
                        onClick={() => {
                            if (selectedRows.length < 1) return;
                            handleDelete(selectedRows.map((r) => r.no_rm));
                        }}
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
                        onClick={loadData}
                    />
                </div>

                {/* PrimeReact DataTable */}
                <DataTable
                    value={data}
                    loading={loading}
                    scrollable
                    tableStyle={{ minWidth: '1360px' }}
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
                    dataKey="no_rm"
                    className="p-datatable-sm data-pasien-table"
                    emptyMessage="Data pasien tidak ditemukan."
                    rowsPerPageOptions={[10, 25, 50]}
                    paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink CurrentPageReport RowsPerPageDropdown"
                    currentPageReportTemplate="Menampilkan {first} - {last} dari {totalRecords} data"
                    header={
                        <div className="flex flex-column gap-3">
                            <div className="flex flex-wrap align-items-center justify-content-between gap-2">
                                <span className="text-xl font-bold text-900">Katalog Data Pasien</span>
                                <div className="flex flex-wrap align-items-center gap-2 ml-auto w-full md:w-auto">
                                    <Dropdown
                                        value={filterStatus}
                                        options={[
                                            { label: 'Semua Status', value: '' },
                                            { label: 'Aktif', value: 'aktif' },
                                            { label: 'Tidak Aktif', value: 'tidak aktif' }
                                        ]}
                                        onChange={(e) => setFilterStatus(e.value)}
                                        placeholder="Filter Status"
                                        className="w-full md:w-12rem p-inputtext-sm text-sm border-round-md"
                                    />
                                    <Dropdown
                                        value={filterGender}
                                        options={[
                                            { label: 'Semua Gender', value: '' },
                                            { label: 'Laki-laki (L)', value: 'L' },
                                            { label: 'Perempuan (P)', value: 'P' }
                                        ]}
                                        onChange={(e) => setFilterGender(e.value)}
                                        placeholder="Filter Gender"
                                        className="w-full md:w-12rem p-inputtext-sm text-sm border-round-md"
                                    />
                                    <IconField iconPosition="left" className="w-full md:w-16rem">
                                        <InputIcon className="pi pi-search" />
                                        <InputText
                                            value={keyword}
                                            onChange={(e) => setKeyword(e.target.value)}
                                            placeholder="Cari No RM, Nama, NIK..."
                                            className="w-full text-sm"
                                        />
                                    </IconField>
                                    <Button
                                        type="button"
                                        icon="pi pi-filter-slash"
                                        outlined
                                        severity="danger"
                                        tooltip="Reset Filter"
                                        tooltipOptions={{ position: 'bottom' }}
                                        onClick={() => {
                                            setKeyword('');
                                            setFilterStatus('');
                                            setFilterGender('');
                                        }}
                                    />
                                </div>
                            </div>

                            <KeteranganStatus className="mb-2" />
                        </div>
                    }
                >
                    {/* Kolom Selection */}
                    <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} />

                    {/* Kolom Indikator Status */}
                    <Column
                        header=""
                        headerStyle={{ width: '3rem', textAlign: 'center' }}
                        bodyStyle={{ textAlign: 'center' }}
                        body={(rowData) => {
                            const isAktif = rowData.status === 'aktif';
                            return (
                                <div className="flex justify-content-center">
                                    <span
                                        title={isAktif ? 'Status: Aktif' : 'Status: Tidak Aktif'}
                                        style={{
                                            display: 'inline-block',
                                            width: '14px',
                                            height: '14px',
                                            borderRadius: '3px',
                                            backgroundColor: isAktif ? '#22c55e' : '#ef4444',
                                            boxShadow: isAktif ? '0 1px 3px #22c55e66' : '0 1px 3px #ef444466'
                                        }}
                                    />
                                </div>
                            );
                        }}
                    />

                    {/* Kolom No RM */}
                    <Column
                        field="no_rm"
                        header="No. RM"
                        style={{ minWidth: '8rem' }}
                        body={(rowData) => (
                            <span className="font-mono font-bold text-purple-700 bg-purple-50 px-2 py-1 border-round text-sm">
                                {rowData.no_rm}
                            </span>
                        )}
                    />

                    {/* Kolom Nama & NIK */}
                    <Column
                        field="nama"
                        header="Nama Pasien & NIK"
                        style={{ minWidth: '14rem' }}
                        body={(rowData) => (
                            <div className="flex flex-column">
                                <span className="font-bold text-900 text-sm hover:text-purple-600 cursor-pointer" onClick={() => handleOpenDetail(rowData)}>
                                    {rowData.nama}
                                </span>
                                <span className="text-500 text-xs mt-1">
                                    NIK: <span className="font-mono">{rowData.nik || '-'}</span>
                                </span>
                            </div>
                        )}
                    />

                    {/* Kolom Gender & Usia */}
                    <Column
                        header="Gender & Usia"
                        style={{ minWidth: '9rem' }}
                        body={(rowData) => {
                            const isLaki = rowData.jenis_kelamin === 'L';
                            return (
                                <div className="flex align-items-center gap-2">
                                    <Tag
                                        value={isLaki ? '♂ L' : '♀ P'}
                                        severity={isLaki ? 'info' : 'warning'}
                                        className="font-bold text-xs px-2"
                                    />
                                    <span className="text-700 text-xs font-semibold">
                                        {hitungUmur(rowData.tanggal_lahir)}
                                    </span>
                                </div>
                            );
                        }}
                    />

                    {/* Kolom Kontak No HP */}
                    <Column
                        field="no_hp"
                        header="No. HP"
                        style={{ minWidth: '10rem' }}
                        body={(rowData) => {
                            const hasPhone = Boolean(rowData.no_hp && rowData.no_hp.trim() !== '-');

                            return (
                                <div className="flex flex-column">
                                    {hasPhone ? (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                openWhatsAppChat(rowData.no_hp);
                                            }}
                                            className="p-0 m-0 bg-transparent border-none text-left font-semibold text-green-700 text-xs flex align-items-center gap-1 hover:underline cursor-pointer"
                                            title="Buka Chat WhatsApp (Aplikasi / Web)"
                                        >
                                            <i className="pi pi-whatsapp text-green-600" />
                                            {rowData.no_hp}
                                        </button>
                                    ) : (
                                        <span className="text-500 text-xs">-</span>
                                    )}
                                    {rowData.email && (
                                        <span className="text-500 text-xs mt-1 truncate" style={{ maxWidth: '140px' }} title={rowData.email}>
                                            {rowData.email}
                                        </span>
                                    )}
                                </div>
                            );
                        }}
                    />

                    {/* Kolom Wilayah / Alamat */}
                    <Column
                        field="kota_kabupaten"
                        header="Domisili"
                        style={{ minWidth: '11rem' }}
                        body={(rowData) => (
                            <div className="flex flex-column">
                                <span className="font-medium text-800 text-xs">
                                    {rowData.kota_kabupaten || '-'}
                                </span>
                                <span className="text-500 text-xs mt-1">
                                    {rowData.provinsi || '-'}
                                </span>
                            </div>
                        )}
                    />

                    {/* Kolom Riwayat Alergi */}
                    <Column
                        header="Alergi"
                        style={{ minWidth: '8rem' }}
                        body={(rowData) => {
                            if (!rowData.alergi) {
                                return <span className="text-400 text-xs">-</span>;
                            }
                            return (
                                <Tag
                                    icon="pi pi-exclamation-triangle"
                                    severity="warning"
                                    value="Ada Alergi"
                                    title={rowData.alergi}
                                    className="text-xs cursor-pointer"
                                    onClick={() => handleOpenDetail(rowData)}
                                />
                            );
                        }}
                    />

                    {/* Kolom Terdaftar */}
                    <Column
                        field="created_at"
                        header="Terdaftar"
                        style={{ minWidth: '7.5rem' }}
                        body={(rowData) => (
                            <span className="text-600 text-xs">
                                {formatTanggal(rowData.created_at)}
                            </span>
                        )}
                    />

                    {/* Kolom Aksi */}
                    <Column
                        header="Aksi"
                        align="center"
                        headerStyle={{ width: '6.5rem', textAlign: 'center' }}
                        bodyStyle={{ textAlign: 'center' }}
                        body={(rowData) => (
                            <div className="flex align-items-center justify-content-center gap-2">
                                <Button
                                    type="button"
                                    icon="pi pi-eye"
                                    size="small"
                                    outlined
                                    severity="info"
                                    className="w-2rem h-2rem p-0 border-round-md"
                                    tooltip="Lihat Detail Pasien"
                                    tooltipOptions={{ position: 'top' }}
                                    onClick={() => handleOpenDetail(rowData)}
                                />
                                <Button
                                    type="button"
                                    icon="pi pi-pencil"
                                    size="small"
                                    outlined
                                    severity="success"
                                    className="w-2rem h-2rem p-0 border-round-md"
                                    tooltip="Edit Data Pasien"
                                    tooltipOptions={{ position: 'top' }}
                                    onClick={() => handleOpenEdit(rowData)}
                                />
                            </div>
                        )}
                    />
                </DataTable>
            </div>

            <style jsx global>{`
                .data-pasien-table .p-datatable-tbody > tr > td {
                    white-space: nowrap !important;
                    height: 52px !important;
                    box-sizing: border-box !important;
                    vertical-align: middle !important;
                }
                .data-pasien-table .p-datatable-thead > tr > th {
                    white-space: nowrap !important;
                    height: 48px !important;
                    box-sizing: border-box !important;
                    vertical-align: middle !important;
                }
            `}</style>
        </div>
    );
}
