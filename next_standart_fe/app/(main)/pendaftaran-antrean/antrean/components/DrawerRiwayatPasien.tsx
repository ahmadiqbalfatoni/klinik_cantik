'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from 'primereact/sidebar';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { Dialog } from 'primereact/dialog';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Toast } from 'primereact/toast';
import { InputText } from 'primereact/inputtext';
import { IconField } from 'primereact/iconfield';
import { InputIcon } from 'primereact/inputicon';
import postData from '@/lib/axios/postData';
import { showError } from '@/lib/tools/generalTools';
import KeteranganStatus from '@/app/components/KeteranganStatus';
import {
    ArrowLeft,
    Clock,
    User,
    AlertTriangle,
    FileText,
    Activity,
    Stethoscope,
    Sparkles,
    Building2,
    CheckCircle2,
    ClipboardList,
    Image as ImageIcon,
    ZoomIn,
    Printer,
} from 'lucide-react';
import { RMEReportPrint } from './RMEReportPrint';

export const IconMedicalRecord: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({
    size = 16,
    className = '',
    style,
}) => (
    <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        className={className}
        style={style}
    >
        {/* Document outline with rounded corners and folded corner */}
        <path
            d="M14.5 1.5H6.5C4.6 1.5 3 3.1 3 5v14c0 1.9 1.6 3.5 3.5 3.5h11c1.9 0 3.5-1.6 3.5-3.5V7.5L14.5 1.5z"
            strokeWidth="1.8"
            strokeLinejoin="round"
        />
        <path
            d="M14.5 1.5V6c0 .8.7 1.5 1.5 1.5h4.5"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        {/* Avatar Head (Larger & Bolder on top-left) */}
        <circle cx="8.8" cy="6" r="2.2" fill="currentColor" stroke="none" />
        {/* Avatar Shoulders / Suit */}
        <path
            d="M5.5 13v-.3c0-1.8 1.4-2.8 3.3-2.8s3.3 1 3.3 2.8v.3h-1.4l-.7-1.4-.7 1.4z"
            fill="currentColor"
            stroke="none"
        />
        {/* Document Data Bars (Solid Bold Lines) */}
        <rect x="5.5" y="14.8" width="13" height="1.6" rx="0.8" fill="currentColor" stroke="none" />
        <rect x="5.5" y="17.4" width="13" height="1.6" rx="0.8" fill="currentColor" stroke="none" />
        <rect x="5.5" y="20" width="7.5" height="1.6" rx="0.8" fill="currentColor" stroke="none" />
    </svg>
);

interface DrawerRiwayatPasienProps {
    visible: boolean;
    onHide: () => void;
    noRm: string;
    namaPasien?: string;
    excludeKodeKunjungan?: string;
    toast?: React.RefObject<Toast>;
}

const getFullImageUrl = (url?: string) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
        return url;
    }
    const clean = url.startsWith('/') ? url : `/${url}`;
    return `http://127.0.0.1:8000${clean}`;
};

export const DrawerRiwayatPasien: React.FC<DrawerRiwayatPasienProps> = ({
    visible,
    onHide,
    noRm,
    namaPasien = 'Pasien',
    excludeKodeKunjungan,
    toast,
}) => {
    const [loading, setLoading] = useState<boolean>(false);
    const [riwayatList, setRiwayatList] = useState<any[]>([]);
    const [totalRecords, setTotalRecords] = useState<number>(0);
    const [globalFilter, setGlobalFilter] = useState<string>('');

    // Selected visit for detailed EMR dossier view (null = Table view)
    const [selectedVisit, setSelectedVisit] = useState<any | null>(null);

    // Modal Print Laporan RME
    const [printModalVisible, setPrintModalVisible] = useState<boolean>(false);
    const [visitToPrint, setVisitToPrint] = useState<any | null>(null);

    // Modal Zoom Preview Foto
    const [previewModalVisible, setPreviewModalVisible] = useState<boolean>(false);
    const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string>('');
    const [previewPhotoTitle, setPreviewPhotoTitle] = useState<string>('');


    useEffect(() => {
        if (visible && noRm) {
            setSelectedVisit(null);
            setGlobalFilter('');
            fetchRiwayat();
        }
    }, [visible, noRm, excludeKodeKunjungan]);

    const fetchRiwayat = async () => {
        setLoading(true);
        try {
            const res = await postData('/master/pasien-rekam-medis', {
                no_rm: noRm,
                exclude_kode_kunjungan: excludeKodeKunjungan || '',
                only_selesai: true,
                page: 1,
                perPage: 100, // Load complete history for table view
            });

            const rawData = res.data?.data || [];
            // Filter agar HANYA kunjungan yang sudah 'selesai' yang ditampilkan (kunjungan yang sedang berlangsung tidak ditampilkan)
            const data = rawData.filter((item: any) => {
                const status = (item.status_kunjungan || '').toLowerCase();
                if (status !== 'selesai') return false;
                if (excludeKodeKunjungan && item.kode_kunjungan === excludeKodeKunjungan) return false;
                return true;
            });
            const total = data.length;

            setRiwayatList(data);
            setTotalRecords(total);
        } catch (error: any) {
            if (toast) {
                showError(toast, error?.response?.data?.message || 'Gagal memuat riwayat rekam medis pasien');
            }
        } finally {
            setLoading(false);
        }
    };

    const formatDateIndo = (dateStr?: string) => {
        if (!dateStr) return '-';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('id-ID', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
            });
        } catch (_) {
            return dateStr;
        }
    };

    const formatShortDate = (dateStr?: string) => {
        if (!dateStr) return '-';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
            });
        } catch (_) {
            return dateStr;
        }
    };

    const formatDateSimple = (dateStr?: string) => {
        if (!dateStr) return '-';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
            });
        } catch (_) {
            return dateStr;
        }
    };

    const calculateAge = (birthDateStr?: string) => {
        if (!birthDateStr) return '';
        try {
            const birth = new Date(birthDateStr);
            const now = new Date();
            let age = now.getFullYear() - birth.getFullYear();
            const m = now.getMonth() - birth.getMonth();
            if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
                age--;
            }
            return age > 0 ? ` (${age} Thn)` : '';
        } catch (_) {
            return '';
        }
    };

    const formatFullAddress = (item: any) => {
        if (!item) return '-';
        const parts = [
            item.patokan,
            item.kelurahan_desa ? `Kel. ${item.kelurahan_desa}` : '',
            item.kecamatan ? `Kec. ${item.kecamatan}` : '',
            item.kota_kabupaten,
            item.provinsi,
            item.kode_pos,
        ].filter(Boolean);
        return parts.length > 0 ? parts.join(', ') : '-';
    };

    const formatGender = (g?: string) => {
        if (!g) return '-';
        const up = g.toUpperCase();
        if (up === 'L' || up === 'LAKI-LAKI' || up === 'PRIA') return 'Laki-Laki';
        if (up === 'P' || up === 'PEREMPUAN' || up === 'WANITA') return 'Perempuan';
        return g;
    };

    const openPhotoZoom = (url: string, title: string) => {
        setPreviewPhotoUrl(getFullImageUrl(url));
        setPreviewPhotoTitle(title);
        setPreviewModalVisible(true);
    };

    // Filtered data for DataTable search (hanya kunjungan selesai)
    const filteredRiwayatList = riwayatList.filter((item) => {
        if (item.status_kunjungan?.toLowerCase() !== 'selesai') return false;
        if (!globalFilter) return true;
        const q = globalFilter.toLowerCase();
        const tgl = item.tanggal_kunjungan || '';
        const kode = item.kode_kunjungan || '';
        const dokter = item.header_rekam_medis?.dokter_nama || '';
        const diagnosis = item.header_rekam_medis?.diagnosis || '';
        const layanan = (item.layanan || []).map((l: any) => l.nama_layanan).join(' ');
        return (
            tgl.toLowerCase().includes(q) ||
            kode.toLowerCase().includes(q) ||
            dokter.toLowerCase().includes(q) ||
            diagnosis.toLowerCase().includes(q) ||
            layanan.toLowerCase().includes(q)
        );
    });

    // Custom Header Drawer — clean & compact
    const customHeader = (
        <div className="flex align-items-center w-full pr-4" style={{ gap: '12px' }}>
            <div
                className="flex align-items-center justify-content-center flex-shrink-0"
                style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: '#ccfbf1',
                    color: '#0f766e',
                }}
            >
                <IconMedicalRecord size={18} />
            </div>
            <div>
                <div className="text-base font-bold text-900 line-height-1 flex align-items-center" style={{ gap: '8px' }}>
                    <span>{namaPasien}</span>
                </div>
                <div className="flex align-items-center mt-1.5 text-xs text-500" style={{ gap: '8px' }}>
                    <span
                        className="font-mono font-bold text-teal-800 bg-teal-50 border-1 border-teal-200 inline-flex align-items-center justify-content-center"
                        style={{ borderRadius: '6px', fontSize: '11px', height: '22px', padding: '0 8px', lineHeight: 1 }}
                    >
                        RM: {noRm || '-'}
                    </span>
                    <span>•</span>
                    <span className="font-semibold text-600">{totalRecords} Riwayat Kunjungan Selesai</span>
                </div>
            </div>
        </div>
    );

    // Helper untuk membedakan visual data terisi vs data kosong/placeholder
    const renderFieldContent = (val?: string | null, fallbackText: string = 'Tidak ada catatan') => {
        const isBlank =
            !val ||
            val.trim() === '' ||
            val.trim() === '-' ||
            val.toLowerCase() === 'tidak ada' ||
            val.toLowerCase().startsWith('tidak') ||
            val.toLowerCase().startsWith('belum') ||
            val.toLowerCase().startsWith('(tidak');

        if (isBlank) {
            return (
                <span
                    style={{
                        color: '#94a3b8',
                        fontStyle: 'italic',
                        fontWeight: 400,
                        fontSize: '12px',
                        display: 'block',
                        lineHeight: 1.6,
                    }}
                >
                    {val && val.trim() !== '' && val.trim() !== '-' ? val : fallbackText}
                </span>
            );
        }
        return (
            <span
                style={{
                    color: '#0f172a',
                    fontWeight: 600,
                    fontSize: '12px',
                    display: 'block',
                    lineHeight: 1.6,
                }}
            >
                {val}
            </span>
        );
    };

    // ==========================================
    // RENDER DETAIL VIEW FOR SELECTED VISIT
    // (Mengikuti layout Cetak RME agar rapi & terstruktur, tanpa tombol cetak)
    // ==========================================
    const renderDetailView = () => {
        if (!selectedVisit) return null;

        const headerRM = selectedVisit.header_rekam_medis || {};
        const layananList = selectedVisit.layanan || [];
        const isSelesai = selectedVisit.status_kunjungan === 'selesai';
        const resolvedPatientName = selectedVisit.nama_pasien || namaPasien || '-';
        const patientNoRm = selectedVisit.no_rm || noRm || '-';

        // Extract vital signs and structured form entries
        const formFieldsCombined: { label: string; value: any }[] = [];
        layananList.forEach((lay: any) => {
            const formItems = lay.rekam_medis?.formatted_data_form || [];
            formItems.forEach((f: any) => {
                if (f.label && f.value !== undefined && f.value !== null && String(f.value).trim() !== '' && String(f.value).trim() !== '-') {
                    formFieldsCombined.push({
                        label: f.label,
                        value: f.value,
                    });
                }
            });
        });

        // Resolve doctor name
        let resolvedDokterName = headerRM.dokter_nama || selectedVisit.dokter_nama;
        if (!resolvedDokterName && layananList.length > 0) {
            for (const lay of layananList) {
                if (lay.petugas?.nama) {
                    resolvedDokterName = lay.petugas.nama;
                    break;
                }
                if (Array.isArray(lay.daftar_petugas)) {
                    const pj = lay.daftar_petugas.find((p: any) => p.is_dokter_pj || p.role === 'DOKTER');
                    if (pj?.nama) {
                        resolvedDokterName = pj.nama;
                        break;
                    }
                }
                if (lay.rekam_medis?.dokter_penanggung_jawab?.nama) {
                    resolvedDokterName = lay.rekam_medis.dokter_penanggung_jawab.nama;
                    break;
                }
            }
        }
        const dokterName = resolvedDokterName || 'dr. Penanggung Jawab';
        const dokterFormatted = dokterName.toLowerCase().startsWith('dr.') || dokterName.includes(',')
            ? dokterName
            : `dr. ${dokterName}`;

        // Collect all visit photos (header before photo + layanans fotos)
        const allVisitFotos: { url: string; label: string }[] = [];
        if (headerRM.foto_before) {
            allVisitFotos.push({
                url: headerRM.foto_before,
                label: 'Kondisi Awal (Sebelum Treatment)',
            });
        }
        layananList.forEach((lay: any) => {
            const fotos = lay.rekam_medis?.fotos || [];
            fotos.forEach((foto: any) => {
                const isBefore = foto.tipe === 'before' || foto.tipe === 'foto_before';
                const isAfter = foto.tipe === 'after' || foto.tipe === 'foto_after';
                const badgeLabel = isBefore ? 'BEFORE' : isAfter ? 'AFTER' : String(foto.tipe || 'FOTO').toUpperCase();
                allVisitFotos.push({
                    url: foto.url_foto,
                    label: `${badgeLabel} — ${lay.nama_layanan || 'Treatment'}`,
                });
            });
        });

        return (
            <div
                className="flex flex-column gap-3 animate-fadein"
                style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
            >
                {/* ── TOP BAR: Back + Status Visit (TANPA TOMBOL CETAK) ── */}
                <div className="flex align-items-center justify-content-between pb-3 border-bottom-1 surface-border flex-wrap gap-2">
                    <Button
                        type="button"
                        icon="pi pi-arrow-left"
                        label="Kembali ke Tabel Riwayat"
                        size="small"
                        outlined
                        severity="secondary"
                        className="text-xs font-bold py-1.5 px-3 border-round-lg text-slate-700 surface-border hover:surface-100"
                        onClick={() => setSelectedVisit(null)}
                    />
                    <div className="flex align-items-center gap-2 flex-wrap">
                        <span
                            className="text-xs font-mono font-bold text-slate-700 bg-slate-100 border-round-md border-1 surface-border inline-flex align-items-center justify-content-center"
                            style={{ height: '26px', padding: '0 10px', borderRadius: '6px', lineHeight: 1 }}
                        >
                            {selectedVisit.kode_kunjungan}
                        </span>
                        {isSelesai ? (
                            <span
                                className="text-xs font-bold text-teal-700 bg-teal-50 border-1 border-teal-200 inline-flex align-items-center justify-content-center flex-shrink-0 uppercase"
                                style={{
                                    height: '26px',
                                    padding: '0 10px',
                                    borderRadius: '6px',
                                    whiteSpace: 'nowrap',
                                    lineHeight: 1,
                                }}
                            >
                                Selesai
                            </span>
                        ) : (
                            <span
                                className="text-xs font-bold text-blue-700 bg-blue-50 border-1 border-blue-200 inline-flex align-items-center justify-content-center flex-shrink-0 uppercase"
                                style={{
                                    height: '26px',
                                    padding: '0 10px',
                                    borderRadius: '6px',
                                    whiteSpace: 'nowrap',
                                    lineHeight: 1,
                                }}
                            >
                                Sedang Berlangsung
                            </span>
                        )}
                    </div>
                </div>

                {/* ── DOKUMEN REKAM MEDIS ELEKTRONIK (DESAIN RAPI MENGIKUTI CETAK RME) ── */}
                <div className="bg-white border-1 surface-border border-round-xl shadow-1 p-3 md:p-5 rme-detail-document">
                    <style>{`
                        .rme-table-info {
                            width: 100%;
                            border-collapse: collapse;
                        }
                        .rme-table-info tr {
                            border-bottom: 1px dashed #f1f5f9;
                        }
                        .rme-table-info tr:last-child {
                            border-bottom: none;
                        }
                        .rme-table-info td {
                            padding: 4px 6px;
                            vertical-align: top;
                            font-size: 11px;
                            line-height: 1.4;
                        }
                        .rme-table-info td.rme-label {
                            width: 125px;
                            color: #475569;
                            font-weight: 500;
                            white-space: nowrap;
                        }
                        .rme-table-info td.rme-colon {
                            width: 12px;
                            text-align: center;
                            color: #64748b;
                            font-weight: 600;
                            padding-left: 0;
                            padding-right: 0;
                        }
                        .rme-table-info td.rme-value {
                            color: #0f172a;
                            font-weight: 700;
                        }
                        .rme-section-header {
                            background-color: #f8fafc;
                            border-left: 3px solid #0f766e;
                            border-bottom: 1px solid #e2e8f0;
                            padding: 5px 8px;
                            font-weight: 700;
                            font-size: 11px;
                            text-transform: uppercase;
                            letter-spacing: 0.4px;
                            color: #0f172a;
                            margin-top: 8px;
                            margin-bottom: 5px;
                            border-radius: 0 4px 4px 0;
                        }
                        .rme-border-box {
                            border: 1px solid #cbd5e1;
                            border-radius: 6px;
                            padding: 8px 10px;
                            background-color: #ffffff;
                        }
                        .rme-data-table {
                            width: 100%;
                            border-collapse: collapse;
                            border: 1px solid #cbd5e1;
                            margin-top: 6px;
                        }
                        .rme-data-table th {
                            background-color: #f1f5f9;
                            border: 1px solid #cbd5e1;
                            padding: 7px 10px;
                            font-size: 11px;
                            font-weight: 700;
                            text-transform: uppercase;
                            letter-spacing: 0.3px;
                            color: #0f172a;
                            vertical-align: middle;
                        }
                        .rme-data-table td {
                            border: 1px solid #cbd5e1;
                            padding: 7px 10px;
                            font-size: 11.5px;
                            vertical-align: top;
                            line-height: 1.4;
                            color: #0f172a;
                        }
                        .rme-skin-grid {
                            display: grid;
                            grid-template-columns: repeat(5, 1fr);
                            gap: 6px;
                            margin-bottom: 4px;
                        }
                        .rme-skin-card {
                            border: 1px solid #cbd5e1;
                            border-radius: 4px;
                            background-color: #f8fafc;
                            padding: 6px 4px;
                            text-align: center;
                            min-height: 42px;
                            display: flex;
                            flex-direction: column;
                            justify-content: center;
                            box-sizing: border-box;
                        }
                        .rme-skin-card .rme-skin-label {
                            font-size: 9px;
                            color: #64748b;
                            font-weight: 600;
                            text-transform: uppercase;
                            line-height: 1;
                            letter-spacing: 0.2px;
                        }
                        .rme-skin-card .rme-skin-value {
                            font-size: 11px;
                            color: #0f172a;
                            font-weight: 700;
                            margin-top: 3px;
                            line-height: 1.2;
                            word-break: break-word;
                        }
                    `}</style>

                    {/* 2. JUDUL DOKUMEN */}
                    <div className="text-center my-2">
                        <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 800, textDecoration: 'underline', letterSpacing: '0.5px', color: '#0f172a' }}>
                            LAPORAN DATA REKAM MEDIS PASIEN
                        </h2>
                    </div>

                    {/* 3. INFORMASI KUNJUNGAN & IDENTITAS PASIEN (2 KOLOM SEJAJAR) */}
                    <div className="grid formgrid mb-1" style={{ margin: '0 -4px' }}>
                        {/* Kolom Kiri: Informasi Kunjungan */}
                        <div className="col-12 md:col-6 p-1">
                            <div className="rme-section-header" style={{ marginTop: 0 }}>
                                Informasi Kunjungan
                            </div>
                            <div className="rme-border-box h-full">
                                <table className="rme-table-info">
                                    <tbody>
                                        <tr>
                                            <td className="rme-label">Tanggal Kunjungan</td>
                                            <td className="rme-colon">:</td>
                                            <td className="rme-value">{formatDateIndo(selectedVisit.tanggal_kunjungan)}</td>
                                        </tr>
                                        <tr>
                                            <td className="rme-label">No. Kunjungan</td>
                                            <td className="rme-colon">:</td>
                                            <td className="rme-value font-mono text-teal-800">{selectedVisit.kode_kunjungan || '-'}</td>
                                        </tr>
                                        <tr>
                                            <td className="rme-label">Jaminan / Penjamin</td>
                                            <td className="rme-colon">:</td>
                                            <td className="rme-value">Umum / Mandiri</td>
                                        </tr>
                                        <tr>
                                            <td className="rme-label">Nama Poli / Ruangan</td>
                                            <td className="rme-colon">:</td>
                                            <td className="rme-value">{layananList[0]?.nama_ruangan || 'Ruang Konsultasi & Treatment'}</td>
                                        </tr>
                                        <tr>
                                            <td className="rme-label">Dokter Pemeriksa</td>
                                            <td className="rme-colon">:</td>
                                            <td className="rme-value">{dokterFormatted}</td>
                                        </tr>
                                        <tr>
                                            <td className="rme-label">Waktu Pemeriksaan</td>
                                            <td className="rme-colon">:</td>
                                            <td className="rme-value">
                                                {formatShortDate(selectedVisit.tanggal_kunjungan)}{' '}
                                                {selectedVisit.jam_datang ? `(${selectedVisit.jam_datang} WIB)` : ''}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Kolom Kanan: Identitas Pasien */}
                        <div className="col-12 md:col-6 p-1">
                            <div className="rme-section-header" style={{ marginTop: 0 }}>
                                Identitas Pasien
                            </div>
                            <div className="rme-border-box h-full">
                                <table className="rme-table-info">
                                    <tbody>
                                        <tr>
                                            <td className="rme-label">No. Rekam Medis</td>
                                            <td className="rme-colon">:</td>
                                            <td className="rme-value font-mono text-teal-800">{patientNoRm}</td>
                                        </tr>
                                        <tr>
                                            <td className="rme-label">NIK / Identitas</td>
                                            <td className="rme-colon">:</td>
                                            <td className="rme-value font-mono">{selectedVisit.nik || '-'}</td>
                                        </tr>
                                        <tr>
                                            <td className="rme-label">Nama Pasien</td>
                                            <td className="rme-colon">:</td>
                                            <td className="rme-value">{resolvedPatientName}</td>
                                        </tr>
                                        <tr>
                                            <td className="rme-label">Jenis Kelamin / Usia</td>
                                            <td className="rme-colon">:</td>
                                            <td className="rme-value">
                                                {formatGender(selectedVisit.jenis_kelamin)}
                                                {calculateAge(selectedVisit.tanggal_lahir)}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="rme-label">Alamat</td>
                                            <td className="rme-colon">:</td>
                                            <td className="rme-value">{formatFullAddress(selectedVisit)}</td>
                                        </tr>
                                        <tr>
                                            <td className="rme-label">No. HP / WA</td>
                                            <td className="rme-colon">:</td>
                                            <td className="rme-value">{selectedVisit.no_hp || '-'}</td>
                                        </tr>
                                        <tr>
                                            <td className="rme-label">Alergi Obat / Zat</td>
                                            <td className="rme-colon">:</td>
                                            <td
                                                className="rme-value"
                                                style={{
                                                    color: (selectedVisit.alergi || headerRM.riwayat_alergi) ? '#b91c1c' : '#475569',
                                                    fontWeight: (selectedVisit.alergi || headerRM.riwayat_alergi) ? 800 : 600,
                                                }}
                                            >
                                                {selectedVisit.alergi || headerRM.riwayat_alergi || 'Tidak Ada Riwayat Alergi'}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* 4. SUBJEKTIF & OBJEKTIF (2 KOLOM SEJAJAR SIDE-BY-SIDE) */}
                    <div className="grid formgrid mb-1" style={{ margin: '0 -4px' }}>
                        {/* Kolom Kiri: I. SUBJEKTIF */}
                        <div className="col-12 md:col-6 p-1">
                            <div className="rme-section-header">
                                I. Subjektif (Anamnesis &amp; Keluhan)
                            </div>
                            <div className="rme-border-box h-full" style={{ minHeight: '90px' }}>
                                <table className="rme-table-info">
                                    <tbody>
                                        <tr>
                                            <td className="rme-label">Keluhan Utama</td>
                                            <td className="rme-colon">:</td>
                                            <td className="rme-value">
                                                {headerRM.keluhan || headerRM.subjective || selectedVisit.catatan_pasien || '-'}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="rme-label">Durasi Keluhan</td>
                                            <td className="rme-colon">:</td>
                                            <td className="rme-value">{headerRM.durasi_keluhan || '-'}</td>
                                        </tr>
                                        <tr>
                                            <td className="rme-label">Riwayat Treatment</td>
                                            <td className="rme-colon">:</td>
                                            <td className="rme-value">{headerRM.riwayat_treatment || '-'}</td>
                                        </tr>
                                        <tr>
                                            <td className="rme-label">Riwayat Alergi</td>
                                            <td className="rme-colon">:</td>
                                            <td
                                                className="rme-value"
                                                style={{
                                                    color: headerRM.riwayat_alergi ? '#b91c1c' : '#475569',
                                                    fontWeight: headerRM.riwayat_alergi ? 800 : 600,
                                                }}
                                            >
                                                {headerRM.riwayat_alergi || selectedVisit.alergi || 'Tidak Ada'}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Kolom Kanan: II. OBJEKTIF */}
                        <div className="col-12 md:col-6 p-1">
                            <div className="rme-section-header">
                                II. Objektif (Pemeriksaan &amp; Kulit)
                            </div>
                            <div className="rme-border-box h-full" style={{ minHeight: '90px' }}>
                                <div style={{ fontSize: '10px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                    Karakteristik Kulit Pasien:
                                </div>
                                <div className="rme-skin-grid">
                                    <div className="rme-skin-card">
                                        <span className="rme-skin-label">Tipe</span>
                                        <strong className="rme-skin-value">{headerRM.pemeriksaan_skin_type || 'Normal'}</strong>
                                    </div>
                                    <div className="rme-skin-card">
                                        <span className="rme-skin-label">Inflamasi</span>
                                        <strong className="rme-skin-value">{headerRM.pemeriksaan_inflammation || 'Tidak Ada'}</strong>
                                    </div>
                                    <div className="rme-skin-card">
                                        <span className="rme-skin-label">Acne</span>
                                        <strong className="rme-skin-value">{headerRM.pemeriksaan_acne || 'Tidak Ada'}</strong>
                                    </div>
                                    <div className="rme-skin-card">
                                        <span className="rme-skin-label">Pigmentasi</span>
                                        <strong className="rme-skin-value">{headerRM.pemeriksaan_pigmentation || 'Normal'}</strong>
                                    </div>
                                    <div className="rme-skin-card">
                                        <span className="rme-skin-label">Sensitivitas</span>
                                        <strong className="rme-skin-value">{headerRM.pemeriksaan_sensitivity || 'Normal'}</strong>
                                    </div>
                                </div>

                                {headerRM.objective && (
                                    <div className="mt-2 pt-2 border-top-1 surface-border" style={{ fontSize: '11px', lineHeight: 1.4 }}>
                                        <span style={{ color: '#475569', fontWeight: 600 }}>Temuan Fisik: </span>
                                        <span style={{ color: '#0f172a', fontWeight: 700 }}>{headerRM.objective}</span>
                                    </div>
                                )}

                                {formFieldsCombined.length > 0 && (
                                    <div className="mt-2 pt-2 border-top-1 surface-border">
                                        <div style={{ fontSize: '10px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                            Parameter Form Ruangan:
                                        </div>
                                        <div className="grid" style={{ margin: '0 -3px' }}>
                                            {formFieldsCombined.map((f, fIdx) => (
                                                <div key={fIdx} className="col-6 sm:col-4 p-1" style={{ fontSize: '10.5px' }}>
                                                    <span style={{ color: '#475569', fontWeight: 500 }}>{f.label}: </span>
                                                    <strong style={{ color: '#0f172a', fontWeight: 700 }}>{String(f.value)}</strong>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 5. ASSESSMENT (DIAGNOSIS) & PLANNING (TINDAKAN) */}
                    <div className="rme-section-header">
                        III. Assessment &amp; Penatalaksanaan Tindakan (Planning)
                    </div>
                    <div className="rme-border-box mb-1">
                        {/* Diagnosis & Plan note in compact row */}
                        <div className="flex flex-wrap gap-3 justify-content-between align-items-center mb-2 pb-2 border-bottom-1 surface-border" style={{ fontSize: '11px' }}>
                            <div>
                                <span style={{ color: '#475569', fontWeight: 500 }}>Diagnosis Utama:</span>{' '}
                                <strong style={{ color: '#0f172a', fontWeight: 700, fontSize: '11.5px' }}>
                                    {headerRM.diagnosis || selectedVisit.diagnosis || '-'}
                                </strong>
                                {headerRM.assessment && (
                                    <span style={{ color: '#475569', marginLeft: '8px', fontWeight: 500 }}>
                                        ({headerRM.assessment})
                                    </span>
                                )}
                            </div>
                            {headerRM.plan && (
                                <div style={{ fontSize: '11px', color: '#334155' }}>
                                    <span style={{ color: '#475569', fontWeight: 500 }}>Anjuran / Terapi:</span>{' '}
                                    <strong style={{ color: '#0f172a', fontWeight: 700 }}>{headerRM.plan}</strong>
                                </div>
                            )}
                        </div>

                        {/* Rincian Layanan & Tindakan */}
                        {layananList.length > 0 ? (
                            <table className="rme-data-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '36px', textAlign: 'center' }}>No</th>
                                        <th>Nama Layanan / Tindakan</th>
                                        <th style={{ width: '130px' }}>Ruangan</th>
                                        <th style={{ width: '180px' }}>Petugas / Pelaksana</th>
                                        <th>Catatan Hasil Tindakan</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {layananList.map((lay: any, idx: number) => {
                                        const dokterObj = lay.petugas || lay.rekam_medis?.dokter_penanggung_jawab || null;
                                        const terapisList: any[] = Array.isArray(lay.terapis_pendamping) ? lay.terapis_pendamping : [];
                                        const allDaftarPetugas: any[] = Array.isArray(lay.daftar_petugas) && lay.daftar_petugas.length > 0
                                            ? lay.daftar_petugas
                                            : [];
                                        const catatan = lay.catatan_hasil_treatment || lay.catatan_tindakan || lay.catatan_petugas || '-';

                                        return (
                                            <tr key={idx}>
                                                <td style={{ textAlign: 'center', fontWeight: 600 }}>{idx + 1}</td>
                                                <td style={{ fontWeight: 700, color: '#0f172a' }}>{lay.nama_layanan || 'Pelayanan Klinik'}</td>
                                                <td>{lay.nama_ruangan || '-'}</td>
                                                <td>
                                                    {allDaftarPetugas.length > 0 ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '10.5px' }}>
                                                            {allDaftarPetugas.map((p: any, pIdx: number) => (
                                                                <div key={pIdx} style={{ lineHeight: '1.3' }}>
                                                                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{p.nama}</span>
                                                                    <span style={{ color: p.is_dokter_pj ? '#0f766e' : '#7c3aed', fontSize: '10px', fontWeight: 600 }}>
                                                                        {' '}({p.role || p.jabatan || 'PETUGAS'})
                                                                    </span>
                                                                    {p.no_sip && p.no_sip !== '-' && (
                                                                        <div style={{ fontSize: '9.5px', color: '#64748b' }}>SIP: {p.no_sip}</div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (dokterObj || terapisList.length > 0) ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '10.5px' }}>
                                                            {dokterObj && (
                                                                <div style={{ lineHeight: '1.3' }}>
                                                                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{dokterObj.nama}</span>
                                                                    <span style={{ color: '#0f766e', fontSize: '10px', fontWeight: 600 }}> (Dokter/PJ)</span>
                                                                    {(dokterObj.kode_karyawan || dokterObj.no_sip) && (
                                                                        <div style={{ fontSize: '9.5px', color: '#64748b' }}>SIP: {dokterObj.kode_karyawan || dokterObj.no_sip}</div>
                                                                    )}
                                                                </div>
                                                            )}
                                                            {terapisList.map((t: any, tIdx: number) => (
                                                                <div key={tIdx} style={{ lineHeight: '1.3' }}>
                                                                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{t.nama || t.nama_petugas}</span>
                                                                    <span style={{ color: '#7c3aed', fontSize: '10px', fontWeight: 600 }}>
                                                                        {' '}({(t.role || t.jabatan || 'TERAPIS').toUpperCase()})
                                                                    </span>
                                                                    {t.no_sip && t.no_sip !== '-' && (
                                                                        <div style={{ fontSize: '9.5px', color: '#64748b' }}>SIP: {t.no_sip}</div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span style={{ fontSize: '10.5px', fontWeight: 700 }}>{dokterFormatted}</span>
                                                    )}
                                                </td>
                                                <td style={{ color: catatan === '-' ? '#94a3b8' : '#0f172a' }}>{catatan}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        ) : (
                            <p style={{ margin: 0, fontStyle: 'italic', color: '#94a3b8', fontSize: '11px', padding: '6px' }}>
                                Tidak ada tindakan / konsultasi tercatat.
                            </p>
                        )}
                    </div>

                    {/* 6. DOKUMENTASI FOTO KLINIS (JIKA ADA FOTO) */}
                    {allVisitFotos.length > 0 && (
                        <>
                            <div className="rme-section-header">
                                IV. Dokumentasi Foto Klinis (Sebelum &amp; Sesudah Treatment)
                            </div>
                            <div className="rme-border-box mb-1">
                                <div className="flex flex-wrap align-items-center gap-3">
                                    {allVisitFotos.map((foto, fIdx) => {
                                        const fullUrl = getFullImageUrl(foto.url);
                                        return (
                                            <div
                                                key={fIdx}
                                                className="bg-white p-2 border-round-lg border-1 surface-border flex flex-column align-items-center cursor-pointer hover:shadow-2 transition-all"
                                                style={{ gap: '6px' }}
                                                onClick={() => openPhotoZoom(foto.url, foto.label)}
                                            >
                                                <div
                                                    className="relative border-round-md overflow-hidden border-1 surface-border bg-gray-50"
                                                    style={{ width: '76px', height: '76px' }}
                                                >
                                                    <img
                                                        src={fullUrl}
                                                        alt={foto.label}
                                                        className="w-full h-full object-cover"
                                                        onError={(e) => {
                                                            const target = e.target as HTMLImageElement;
                                                            if (!target.src.includes('/api/assets') && foto.url) {
                                                                target.src = `/api/assets${foto.url}`;
                                                            }
                                                        }}
                                                    />
                                                    <div className="absolute inset-0 bg-black-alpha-30 opacity-0 hover:opacity-100 flex align-items-center justify-content-center transition-all">
                                                        <ZoomIn size={16} className="text-white" />
                                                    </div>
                                                </div>
                                                <span
                                                    className="text-[10px] font-bold text-slate-700 max-w-7rem text-center truncate"
                                                    title={foto.label}
                                                >
                                                    {foto.label}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="text-[10.5px] text-slate-500 italic mt-2">
                                    * Klik gambar untuk memperbesar foto dalam ukuran resolusi penuh.
                                </div>
                            </div>
                        </>
                    )}


                </div>
            </div>
        );
    };

    // ==========================================
    // RENDER TABLE VIEW (DEFAULT LIST)
    // ==========================================
    const renderTableView = () => {
        // DataTable header matching standard laporan toolbar design
        const tableHeader = (
            <div className="flex flex-wrap align-items-center justify-content-between gap-3">
                <div className="flex align-items-center gap-2">
                    <Clock size={18} className="text-teal-600 flex-shrink-0" />
                    <span className="text-base font-bold text-800">
                        Daftar Riwayat Kunjungan Pasien
                    </span>
                </div>
                <div className="flex align-items-center gap-2 ml-auto w-full md:w-auto">
                    <IconField iconPosition="left" className="w-full md:w-20rem">
                        <InputIcon className="pi pi-search" />
                        <InputText
                            value={globalFilter}
                            onChange={(e) => setGlobalFilter(e.target.value)}
                            placeholder="Cari kunjungan, dokter, layanan..."
                            className="w-full text-sm"
                        />
                    </IconField>
                    <Button
                        type="button"
                        icon="pi pi-filter-slash"
                        outlined
                        severity="danger"
                        size="small"
                        className="border-round-lg"
                        tooltip="Reset Filter"
                        tooltipOptions={{ position: 'bottom' }}
                        onClick={() => setGlobalFilter('')}
                    />
                </div>
            </div>
        );

        return (
            <div className="flex flex-column gap-3">
                {/* Legend Box Keterangan Status Sesuai Desain Laporan */}
                <KeteranganStatus
                    className="mb-2"
                    items={[
                        { label: 'Selesai', color: '#22c55e' },
                        { label: 'Sedang Berlangsung', color: '#f59e0b' },
                    ]}
                />

                {/* Card Container Tabel Sesuai Desain Laporan */}
                <div className="card p-3 border-round-xl border-1 surface-border surface-card shadow-1">
                    <DataTable
                        value={filteredRiwayatList}
                        loading={loading}
                        emptyMessage="Tidak ada data riwayat kunjungan pasien ditemukan."
                        className="p-datatable-sm"
                        rowHover
                        paginator
                        rows={10}
                        rowsPerPageOptions={[5, 10, 20]}
                        paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink CurrentPageReport RowsPerPageDropdown"
                        currentPageReportTemplate="Menampilkan {first} - {last} dari {totalRecords} data"
                        header={tableHeader}
                        responsiveLayout="scroll"
                    >
                        {/* 1. Status Indicator (Kolom Pertama Sesuai Standar Laporan) */}
                        <Column
                            header=""
                            headerStyle={{ width: '3.5rem' }}
                            align="center"
                            body={(rowData) => {
                                const isSelesai = rowData.status_kunjungan === 'selesai';
                                const color = isSelesai ? '#22c55e' : '#f59e0b';
                                return (
                                    <span
                                        style={{
                                            display: 'inline-block',
                                            width: '14px',
                                            height: '14px',
                                            borderRadius: '3px',
                                            backgroundColor: color,
                                            boxShadow: `0 1px 3px ${color}55`,
                                            verticalAlign: 'middle',
                                        }}
                                        title={isSelesai ? 'Status: Selesai' : 'Status: Sedang Berlangsung'}
                                    />
                                );
                            }}
                        />

                        {/* Tanggal Kunjungan */}
                        <Column
                            header="Tanggal Kunjungan"
                            sortable
                            sortField="tanggal_kunjungan"
                            headerStyle={{ fontWeight: 'bold' }}
                            style={{ minWidth: '160px' }}
                            body={(rowData) => (
                                <div>
                                    <div className="font-bold text-900">
                                        {formatShortDate(rowData.tanggal_kunjungan)}
                                    </div>
                                    {rowData.jam_datang && (
                                        <div className="text-xs text-500 mt-1">
                                            {rowData.jam_datang} WIB
                                        </div>
                                    )}
                                </div>
                            )}
                        />

                        {/* Kode Kunjungan */}
                        <Column
                            header="Kode"
                            sortable
                            sortField="kode_kunjungan"
                            headerStyle={{ fontWeight: 'bold' }}
                            style={{ width: '130px' }}
                            body={(rowData) => (
                                <span className="font-mono font-semibold text-color-secondary text-xs">
                                    {rowData.kode_kunjungan || ''}
                                </span>
                            )}
                        />

                        {/* Dokter / Petugas Pelaksana (Terapis ada di dalam riwayat) */}
                        <Column
                            header="Dokter / Petugas"
                            sortable
                            sortField="header_rekam_medis.dokter_nama"
                            headerStyle={{ fontWeight: 'bold' }}
                            style={{ minWidth: '180px' }}
                            body={(rowData) => {
                                let dokter = rowData.header_rekam_medis?.dokter_nama;
                                const layList = rowData.layanan || [];

                                if (!dokter && layList.length > 0) {
                                    for (const lay of layList) {
                                        if (lay.petugas?.nama) {
                                            dokter = lay.petugas.nama;
                                            break;
                                        }
                                        if (Array.isArray(lay.daftar_petugas)) {
                                            const pj = lay.daftar_petugas.find((p: any) => p.is_dokter_pj || p.role === 'DOKTER');
                                            if (pj?.nama) {
                                                dokter = pj.nama;
                                                break;
                                            }
                                        }
                                        if (lay.rekam_medis?.dokter_penanggung_jawab?.nama) {
                                            dokter = lay.rekam_medis.dokter_penanggung_jawab.nama;
                                            break;
                                        }
                                    }
                                }

                                if (!dokter) {
                                    return null;
                                }

                                const cleanDokter =
                                    dokter.toLowerCase().startsWith('dr') || dokter.includes(',')
                                        ? dokter
                                        : `dr. ${dokter}`;

                                return (
                                    <span className="font-semibold text-900 text-sm">
                                        {cleanDokter}
                                    </span>
                                );
                            }}
                        />

                {/* Layanan */}
                <Column
                    header="Layanan"
                    headerStyle={{ fontWeight: 'bold' }}
                    style={{ minWidth: '180px' }}
                    body={(rowData) => {
                        const layList = rowData.layanan || [];
                        if (layList.length === 0) return null;

                        // Ambil nama layanan unik agar layanan yang sama pada sesi Konsultasi & Tindakan tidak tampil dobel
                        const uniqueLayananNames = Array.from(
                            new Set(layList.map((l: any) => l.nama_layanan).filter(Boolean))
                        );

                        return (
                            <div className="flex flex-column gap-1">
                                {uniqueLayananNames.slice(0, 2).map((nama: any, lIdx: number) => (
                                    <span
                                        key={lIdx}
                                        className="text-900 text-truncate block font-medium"
                                        title={nama}
                                        style={{ maxWidth: '200px' }}
                                    >
                                        {nama}
                                    </span>
                                ))}
                                {uniqueLayananNames.length > 2 && (
                                    <span className="text-xs text-teal-700 font-bold">
                                        +{uniqueLayananNames.length - 2} lainnya
                                    </span>
                                )}
                            </div>
                        );
                    }}
                />

                {/* Aksi */}
                <Column
                    header="Aksi"
                    align="center"
                    alignHeader="center"
                    headerStyle={{ width: '110px', textAlign: 'center', fontWeight: 'bold' }}
                    style={{ width: '110px', textAlign: 'center' }}
                    body={(rowData) => (
                        <div className="flex align-items-center justify-content-center gap-2">
                            <Button
                                icon="pi pi-eye"
                                outlined
                                severity="info"
                                size="small"
                                className="p-button-sm border-round-lg"
                                tooltip="Lihat Detail RME"
                                tooltipOptions={{ position: 'top' }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedVisit(rowData);
                                }}
                            />
                            <Button
                                icon={<IconMedicalRecord size={15} />}
                                outlined
                                severity="success"
                                size="small"
                                className="p-button-sm border-round-lg"
                                tooltip="Cetak Laporan RME"
                                tooltipOptions={{ position: 'top' }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setVisitToPrint(rowData);
                                    setPrintModalVisible(true);
                                }}
                            />
                        </div>
                    )}
                />
            </DataTable>
        </div>
    </div>
);
};

    return (
        <>
            <Sidebar
                visible={visible}
                position="right"
                onHide={onHide}
                header={customHeader}
                className="w-full md:w-11 lg:w-10 xl:w-9"
                style={{ maxWidth: '1280px' }}
            >
                <div className="p-1 md:p-3 pb-6">
                    {loading ? (
                        <div className="flex flex-column align-items-center justify-content-center p-6 text-center surface-card border-round-2xl border-1 surface-border my-4 shadow-1">
                            <ProgressSpinner style={{ width: '44px', height: '44px' }} strokeWidth="4" />
                            <div className="text-sm font-bold text-700 mt-3">Memuat riwayat rekam medis pasien...</div>
                            <span className="text-xs text-500 mt-1">Mengambil data kunjungan, konsultasi dokter, dan tindakan</span>
                        </div>
                    ) : riwayatList.length === 0 ? (
                        <div className="flex flex-column align-items-center justify-content-center p-6 text-center surface-card border-round-2xl border-1 surface-border my-4 shadow-1">
                            <div className="w-4rem h-4rem bg-teal-50 border-circle flex align-items-center justify-content-center mb-3 text-teal-600 shadow-1">
                                <i className="pi pi-folder-open text-3xl" />
                            </div>
                            <h3 className="text-lg font-black text-800 m-0">Belum Ada Riwayat Rekam Medis</h3>
                            <p className="text-xs text-500 mt-2 line-height-3 max-w-24rem m-0">
                                Pasien ini belum memiliki catatan rekam medis atau riwayat tindakan tersimpan di sistem.
                            </p>
                        </div>
                    ) : selectedVisit ? (
                        renderDetailView()
                    ) : (
                        renderTableView()
                    )}
                </div>
            </Sidebar>

            {/* MODAL ZOOM PREVIEW FOTO HIGH RESOLUTION */}
            <Dialog
                header={previewPhotoTitle || 'Dokumentasi Foto Treatment'}
                visible={previewModalVisible}
                onHide={() => setPreviewModalVisible(false)}
                className="w-full max-w-30rem mx-3"
                contentClassName="p-0 text-center bg-black-alpha-90 flex align-items-center justify-content-center"
                dismissableMask
            >
                {previewPhotoUrl ? (
                    <div className="p-3 w-full flex flex-column align-items-center justify-content-center">
                        <img
                            src={previewPhotoUrl}
                            alt="Foto Treatment Preview"
                            className="w-full border-round-xl shadow-4"
                            style={{ maxHeight: '75vh', objectFit: 'contain' }}
                            onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                if (previewPhotoUrl && !target.src.includes('/api/assets')) {
                                    target.src = `/api/assets${previewPhotoUrl.replace('http://127.0.0.1:8000', '')}`;
                                }
                            }}
                        />
                    </div>
                ) : null}
            </Dialog>
            {/* MODAL PRINT LAPORAN REKAM MEDIS ELEKTRONIK (RME) */}
            <RMEReportPrint
                visible={printModalVisible}
                onHide={() => setPrintModalVisible(false)}
                visitData={visitToPrint}
            />
        </>
    );
};
