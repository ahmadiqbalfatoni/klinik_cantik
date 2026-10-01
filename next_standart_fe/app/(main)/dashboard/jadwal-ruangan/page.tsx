'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Toast } from 'primereact/toast';
import { ProgressSpinner } from 'primereact/progressspinner';
import postData from '@/lib/axios/postData';

interface RawJadwalItem {
    id: number;
    kode_jadwal: string;
    no_sip: string;
    kode_ruangan: string;
    nama_ruangan: string;
    nama_karyawan: string;
    jabatan?: string;
    hari: string;
    jam_mulai: string;
    jam_selesai: string;
    kuota?: number | null;
    status: string;
    is_penanggung_jawab?: number | boolean;
}

interface RuanganItem {
    kode_ruangan: string;
    nama_ruangan: string;
    is_konsultasi?: number;
}

interface ShiftDetail {
    shiftKey: string;
    jamFormatted: string;
    jamMulai: string;
    jamSelesai: string;
    pjItem: RawJadwalItem | null;
    pjName: string;
    pjInitials: string;
    kuota: number | null;
    pendampingList: RawJadwalItem[];
}

interface RoomDayCard {
    kode_ruangan: string;
    nama_ruangan: string;
    shifts: ShiftDetail[];
    totalKuota: number | null;
    isLibur: boolean;
}

const DAYS_CONFIG = [
    { key: 'senin', label: 'Senin' },
    { key: 'selasa', label: 'Selasa' },
    { key: 'rabu', label: 'Rabu' },
    { key: 'kamis', label: 'Kamis' },
    { key: 'jumat', label: 'Jumat' },
    { key: 'sabtu', label: 'Sabtu' },
    { key: 'minggu', label: 'Minggu' },
];

const getTodayDayKey = (): string => {
    const dayNum = new Date().getDay(); // 0 = Minggu, 1 = Senin, ...
    const map = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
    return map[dayNum] || 'senin';
};

const getInitials = (fullName: string): string => {
    if (!fullName) return 'PJ';
    const clean = fullName
        .replace(/^(dr\.|drg\.|Ns\.|prof\.|apt\.)\s*/i, '')
        .replace(/,\s*.*$/, '')
        .trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }
    return 'PJ';
};

const RoomCardItem: React.FC<{ card: RoomDayCard; activeDayLabel: string }> = ({ card, activeDayLabel }) => {
    return (
        <div
            className="room-card-hover border-round-xl border-1 overflow-hidden flex flex-column w-full h-full"
            style={{
                backgroundColor: '#FFFFFF',
                borderColor: '#E3DFD3',
            }}
        >
            {/* Header Kartu Ruangan */}
            <div
                className="flex align-items-center justify-content-between border-bottom-1"
                style={{
                    padding: '14px 20px',
                    backgroundColor: '#F4FBF7',
                    borderColor: '#ECE9DE',
                }}
            >
                <span
                    className="font-bold text-sm sm:text-base"
                    style={{ color: '#202A26', letterSpacing: '-0.01em' }}
                >
                    {card.nama_ruangan}
                </span>
                <span className="text-xs font-medium" style={{ color: '#6F7A74', letterSpacing: '0.01em' }}>
                    {card.totalKuota !== null
                        ? `Kuota ${card.totalKuota} pasien`
                        : '—'}
                </span>
            </div>

            {/* Isi Kartu Ruangan */}
            {card.isLibur ? (
                /* Status Libur / Tanpa Jadwal */
                <div className="flex-1" style={{ padding: '16px 20px' }}>
                    <p
                        className="italic text-xs sm:text-sm m-0"
                        style={{ color: '#9AA39D' }}
                    >
                        Tidak ada jadwal — libur {activeDayLabel.toLowerCase()}
                    </p>
                </div>
            ) : (
                /* Daftar Shift di Ruangan Ini */
                <div className="flex flex-column flex-1">
                    {card.shifts.map((shift, idx) => {
                        return (
                            <React.Fragment key={shift.shiftKey}>
                                {idx > 0 && (
                                    <div
                                        style={{
                                            height: '1px',
                                            backgroundColor: '#ECE9DE',
                                        }}
                                    />
                                )}
                                <div style={{ padding: '14px 20px' }}>
                                    {/* Baris 1: Jam Shift */}
                                    <div
                                        className="text-xs font-bold uppercase tracking-wider mb-2"
                                        style={{ color: '#6F7A74' }}
                                    >
                                        {shift.jamFormatted}
                                    </div>

                                    {/* Baris 2: PJ (Avatar Logo Green + Nama + Badge PJ Gold) */}
                                    <div className="flex align-items-center gap-2 mb-1.5">
                                        {/* Avatar Inisial Bulat */}
                                        <div
                                            className="border-round-circle flex align-items-center justify-content-center font-bold flex-shrink-0"
                                            style={{
                                                width: '28px',
                                                height: '28px',
                                                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                                color: '#FFFFFF',
                                                fontSize: '11px',
                                                letterSpacing: '0.02em',
                                                boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)',
                                            }}
                                        >
                                            {shift.pjInitials}
                                        </div>

                                        {/* Nama PJ */}
                                        <span
                                            className="font-bold text-xs sm:text-sm line-height-1"
                                            style={{ color: '#202A26' }}
                                        >
                                            {shift.pjName}
                                        </span>

                                        {/* Badge PJ Gold */}
                                        <span
                                            className="font-bold uppercase tracking-wider border-round"
                                            style={{
                                                fontSize: '10px',
                                                padding: '2px 6px',
                                                backgroundColor: '#F1E3C8',
                                                color: '#855b14',
                                                border: '1px solid #e2cc9f',
                                                lineHeight: '1.2',
                                            }}
                                        >
                                            PJ
                                        </span>
                                    </div>

                                    {/* Baris 3: Pendamping Langsung Teks */}
                                    <div
                                        className="text-xs line-height-2"
                                        style={{
                                            color: '#6F7A74',
                                            paddingLeft: '36px',
                                        }}
                                    >
                                        {shift.pendampingList.length === 0 ? (
                                            <span style={{ color: '#9AA39D' }}>
                                                Tanpa pendamping
                                            </span>
                                        ) : (
                                            <span>
                                                Pendamping:{' '}
                                                {shift.pendampingList.map((p, pIdx) => {
                                                    const isFirst = pIdx === 0;
                                                    return (
                                                        <React.Fragment key={p.kode_jadwal || pIdx}>
                                                            {pIdx > 0 && ', '}
                                                            <span
                                                                style={{
                                                                    fontWeight: isFirst ? 700 : 500,
                                                                    color: isFirst ? '#202A26' : '#6F7A74',
                                                                }}
                                                            >
                                                                {p.nama_karyawan}
                                                            </span>
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </React.Fragment>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default function CekJadwalRuanganPage() {
    const toast = useRef<Toast>(null);
    const todayKey = useMemo(() => getTodayDayKey(), []);
    const [selectedDay, setSelectedDay] = useState<string>(todayKey);
    const [searchQuery, setSearchQuery] = useState<string>('');

    const [loading, setLoading] = useState<boolean>(true);
    const [ruanganList, setRuanganList] = useState<RuanganItem[]>([]);
    const [allJadwal, setAllJadwal] = useState<RawJadwalItem[]>([]);

    // Fetch master ruangan dan seluruh jadwal aktif klinik sekaligus
    const fetchData = async () => {
        setLoading(true);
        try {
            const [resRuangan, resJadwal] = await Promise.all([
                postData('/master/ruangan-dropdown', {}),
                postData('/master/jadwal-karyawan-data', { perPage: 500, status: 'aktif' }),
            ]);

            const rData: RuanganItem[] = resRuangan?.data?.data || [];
            const jData: RawJadwalItem[] = resJadwal?.data?.data || [];

            setRuanganList(rData);
            setAllJadwal(jData);
        } catch (error: any) {
            console.error('Gagal memuat jadwal ruangan:', error);
            toast.current?.show({
                severity: 'error',
                summary: 'Gagal Memuat Data',
                detail: error?.response?.data?.message || 'Terjadi kesalahan sistem',
                life: 3000,
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Transformasi data untuk hari yang sedang dipilih
    const roomCardsForSelectedDay: RoomDayCard[] = useMemo(() => {
        if (ruanganList.length === 0) return [];

        const dayJadwal = allJadwal.filter(
            (j) => (j.hari || '').toLowerCase() === selectedDay.toLowerCase() && j.status === 'aktif'
        );

        return ruanganList.map((ruang) => {
            const roomSchedules = dayJadwal.filter((j) => j.kode_ruangan === ruang.kode_ruangan);

            if (roomSchedules.length === 0) {
                return {
                    kode_ruangan: ruang.kode_ruangan,
                    nama_ruangan: ruang.nama_ruangan,
                    shifts: [],
                    totalKuota: null,
                    isLibur: true,
                };
            }

            // Kelompokkan per jam shift (jam_mulai - jam_selesai)
            const shiftMap: Record<string, RawJadwalItem[]> = {};
            roomSchedules.forEach((item) => {
                const jM = (item.jam_mulai || '08:00').slice(0, 5);
                const jS = (item.jam_selesai || '16:00').slice(0, 5);
                const key = `${jM}-${jS}`;
                if (!shiftMap[key]) {
                    shiftMap[key] = [];
                }
                shiftMap[key].push(item);
            });

            const sortedKeys = Object.keys(shiftMap).sort();
            let sumKuota = 0;
            let hasAnyKuota = false;

            const shifts: ShiftDetail[] = sortedKeys.map((key) => {
                const items = shiftMap[key];
                const pjItem =
                    items.find((i) => i.is_penanggung_jawab === 1 || i.is_penanggung_jawab === true) ||
                    items[0] ||
                    null;

                const pendampingList = pjItem
                    ? items.filter((i) => i.kode_jadwal !== pjItem.kode_jadwal)
                    : [];

                const jM = (items[0]?.jam_mulai || '08:00').slice(0, 5);
                const jS = (items[0]?.jam_selesai || '16:00').slice(0, 5);
                const kuotaVal = pjItem?.kuota != null && pjItem.kuota > 0 ? Number(pjItem.kuota) : null;

                if (kuotaVal !== null) {
                    sumKuota += kuotaVal;
                    hasAnyKuota = true;
                }

                return {
                    shiftKey: key,
                    jamFormatted: `${jM} – ${jS} WIB`,
                    jamMulai: jM,
                    jamSelesai: jS,
                    pjItem,
                    pjName: pjItem?.nama_karyawan || 'Petugas Medis',
                    pjInitials: getInitials(pjItem?.nama_karyawan || ''),
                    kuota: kuotaVal,
                    pendampingList,
                };
            });

            return {
                kode_ruangan: ruang.kode_ruangan,
                nama_ruangan: ruang.nama_ruangan,
                shifts,
                totalKuota: hasAnyKuota ? sumKuota : null,
                isLibur: false,
            };
        });
    }, [ruanganList, allJadwal, selectedDay]);

    // Filter pencarian client-side (nama ruangan, nama dokter/PJ, atau nama pendamping)
    const filteredRoomCards = useMemo(() => {
        if (!searchQuery.trim()) return roomCardsForSelectedDay;

        const q = searchQuery.toLowerCase().trim();
        return roomCardsForSelectedDay.filter((card) => {
            // Cek nama ruangan & kode
            if (card.nama_ruangan.toLowerCase().includes(q) || card.kode_ruangan.toLowerCase().includes(q)) {
                return true;
            }

            // Cek nama dokter / staf di setiap shift
            return card.shifts.some((shift) => {
                if (shift.pjName.toLowerCase().includes(q)) return true;
                return shift.pendampingList.some((p) =>
                    (p.nama_karyawan || '').toLowerCase().includes(q)
                );
            });
        });
    }, [roomCardsForSelectedDay, searchQuery]);

    const activeDayLabel = DAYS_CONFIG.find((d) => d.key === selectedDay)?.label || selectedDay;

    return (
        <div className="w-full pb-5">
            <Toast ref={toast} position="top-right" />

            {/* Custom Google Fonts & CSS Utility Injection */}
            <style dangerouslySetInnerHTML={{
                __html: `
                @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;700&family=Inter:wght@400;500;600;700&display=swap');
                
                .font-fraunces {
                    font-family: 'Fraunces', Georgia, serif;
                }
                .font-inter {
                    font-family: 'Inter', system-ui, -apple-system, sans-serif;
                }
                .day-tab-btn {
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .day-tab-btn:hover:not(.day-tab-active) {
                    background-color: #ecfdf5 !important;
                    border-color: #10b981 !important;
                }
                .room-card-hover {
                    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
                }
                .room-card-hover:hover {
                    border-color: #a7f3d0 !important;
                    box-shadow: 0 4px 16px rgba(16, 185, 129, 0.12) !important;
                }
                `
            }} />

            {/* ── CARD UTAMA: WHITE CLEAN CLINIC THEME ── */}
            <div
                className="surface-card border-round-xl border-1 shadow-1 p-3 sm:p-4 md:p-5 font-inter"
                style={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E3DFD3',
                }}
            >
                {/* ── 1. HEADER HALAMAN ── */}
                <div className="mb-4">
                    <h1
                        className="font-fraunces text-2xl sm:text-3xl font-bold m-0 tracking-tight"
                        style={{ color: '#059669' }}
                    >
                        Dashboard Jadwal
                    </h1>
                    <p className="text-xs sm:text-sm m-0 mt-1.5" style={{ color: '#6F7A74' }}>
                        Lihat cepat siapa yang bertugas di ruangan mana — untuk cek jadwal shift dokter & staf.
                    </p>
                </div>

                {/* ── 2. TAB HARI (7 KOTAK SEJAJAR 1 BARIS) ── */}
                <div className="mb-4">
                    <div className="grid grid-nogutter gap-2 sm:gap-2.5">
                        {DAYS_CONFIG.map((day) => {
                            const isSelected = selectedDay === day.key;
                            const isToday = todayKey === day.key;

                            return (
                                <div key={day.key} className="col">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedDay(day.key)}
                                        className={`day-tab-btn relative w-full flex flex-column align-items-center justify-content-center border-round-lg cursor-pointer text-xs sm:text-sm font-semibold select-none ${
                                            isSelected ? 'day-tab-active shadow-1' : ''
                                        }`}
                                        style={{
                                            height: '46px',
                                            background: isSelected ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#FFFFFF',
                                            color: isSelected ? '#FFFFFF' : '#202A26',
                                            border: `1px solid ${isSelected ? '#059669' : '#E3DFD3'}`,
                                            boxShadow: isSelected ? '0 3px 10px rgba(16, 185, 129, 0.28)' : undefined,
                                        }}
                                    >
                                        {/* Floating Badge HARI INI */}
                                        {isToday && (
                                            <span
                                                className="absolute border-round-pill uppercase font-bold tracking-wider"
                                                style={{
                                                    top: '-8px',
                                                    fontSize: '9px',
                                                    padding: '1px 6px',
                                                    backgroundColor: '#F1E3C8',
                                                    color: '#855b14',
                                                    border: '1px solid #d8be93',
                                                    lineHeight: '1.2',
                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                                                }}
                                            >
                                                Hari Ini
                                            </span>
                                        )}

                                        <span>{day.label}</span>
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── 3. SEARCH BAR (FILTER CEPAT REAL-TIME) ── */}
                <div className="mb-4">
                    <div
                        className="flex align-items-center gap-2 px-3 py-2 border-round-lg transition-all"
                        style={{
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #E3DFD3',
                        }}
                    >
                        <i className="pi pi-search text-sm" style={{ color: '#9AA39D' }} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Cari ruangan atau nama dokter..."
                            className="w-full border-none outline-none text-xs sm:text-sm bg-transparent"
                            style={{ color: '#202A26' }}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="border-none bg-transparent cursor-pointer p-0 text-xs text-500 hover:text-900"
                                title="Hapus pencarian"
                            >
                                <i className="pi pi-times-circle" />
                            </button>
                        )}
                    </div>
                </div>

                {/* ── 4. LOADING STATE ── */}
                {loading ? (
                    <div className="flex flex-column align-items-center justify-content-center py-6">
                        <ProgressSpinner style={{ width: '40px', height: '40px' }} strokeWidth="4" />
                        <span className="text-xs sm:text-sm mt-3" style={{ color: '#6F7A74' }}>
                            Memuat data jadwal ruangan...
                        </span>
                    </div>
                ) : filteredRoomCards.length === 0 ? (
                    /* Empty State jika pencarian tidak cocok */
                    <div
                        className="text-center py-6 border-round-lg border-1 border-dashed"
                        style={{ backgroundColor: '#F8FAF8', borderColor: '#E3DFD3' }}
                    >
                        <i className="pi pi-info-circle text-2xl mb-2" style={{ color: '#9AA39D' }} />
                        <p className="text-sm font-semibold m-0" style={{ color: '#202A26' }}>
                            Tidak ada jadwal ruangan yang cocok dengan &quot;{searchQuery}&quot;
                        </p>
                        <span className="text-xs" style={{ color: '#6F7A74' }}>
                            Coba kata kunci lain atau pilih tab hari yang berbeda.
                        </span>
                    </div>
                ) : (
                    /* ── 5. GRID KARTU RUANGAN (2 KOLOM SEJAJAR & PRESISI) ── */
                    <div className="grid">
                        {filteredRoomCards.map((card) => (
                            <div key={card.kode_ruangan} className="col-12 lg:col-6 flex pb-3">
                                <RoomCardItem
                                    card={card}
                                    activeDayLabel={activeDayLabel}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
