'use client';

import { Button } from 'primereact/button';
import { useRouter } from 'next/navigation';
import { confirmDialog, ConfirmDialog } from 'primereact/confirmdialog';
import { GridPanggilProps, TableData } from '../interfaces';
import postData from '@/lib/axios/postData';
import { showError, showSuccess, showWarning } from '@/lib/tools/generalTools';
import { apiEndpointCreate, apiEndpointPanggil, apiEndpointReset } from '../endpoints';
import { getTzUser } from '@/lib/tools/dateTools';
import KeteranganStatus from '@/app/components/KeteranganStatus';

// ─── Audio: Chime 2 nada ────────────────────────────────────────────────────
const playChime = () => {
    try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const notes = [523.25, 659.25]; // C5 → E5
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.value = freq;
            const t = ctx.currentTime + i * 0.4;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.45, t + 0.05);
            gain.gain.linearRampToValueAtTime(0.45, t + 0.45);
            osc.start(t);
            osc.stop(t + 0.5);
        });
    } catch (_) {
        console.warn('AudioContext tidak tersedia');
    }
};

// ─── TTS: Text to Speech Bahasa Indonesia ───────────────────────────────────
const speakNomor = (noAntrian: string) => {
    try {
        if (!('speechSynthesis' in window)) {
            console.warn('SpeechSynthesis tidak tersedia di browser ini');
            return;
        }
        window.speechSynthesis.cancel();

        const teks = `Nomor antrian ${noAntrian}, silakan menuju ke loket`;
        const utter = new SpeechSynthesisUtterance(teks);
        utter.lang = 'id-ID';
        utter.rate = 0.85;
        utter.pitch = 1.05;
        utter.volume = 1;

        // Tunggu voices tersedia
        const speak = () => {
            const voices = window.speechSynthesis.getVoices();
            const idVoice = voices.find(
                (v) => v.lang === 'id-ID' || v.lang.startsWith('id')
            );
            if (idVoice) utter.voice = idVoice;
            window.speechSynthesis.speak(utter);
        };

        if (window.speechSynthesis.getVoices().length > 0) {
            setTimeout(speak, 900); // delay setelah chime
        } else {
            window.speechSynthesis.onvoiceschanged = () => {
                setTimeout(speak, 900);
            };
        }
    } catch (_) {
        console.warn('SpeechSynthesis error');
    }
};

// ─── Konfigurasi tampilan per status ────────────────────────────────────────
const STATUS_CONFIG: Record<string, {
    bg: string; border: string; color: string;
    shadow: string; cursor: string; label: string;
}> = {
    tersedia: {
        bg: 'linear-gradient(135deg,#dcfce7,#bbf7d0)',
        border: '#22c55e', color: '#15803d',
        shadow: '0 2px 8px rgba(34,197,94,0.3)', cursor: 'pointer', label: ''
    },
    diambil: {
        bg: 'linear-gradient(135deg,#dbeafe,#bfdbfe)',
        border: '#3b82f6', color: '#1d4ed8',
        shadow: '0 2px 8px rgba(59,130,246,0.3)', cursor: 'pointer', label: '📋'
    },
    dipanggil: {
        bg: 'linear-gradient(135deg,#fef9c3,#fde68a)',
        border: '#f59e0b', color: '#b45309',
        shadow: '0 2px 8px rgba(245,158,11,0.3)', cursor: 'pointer', label: '📢'
    },
    selesai: {
        bg: 'linear-gradient(135deg,#f3f4f6,#e5e7eb)',
        border: '#9ca3af', color: '#6b7280',
        shadow: 'none', cursor: 'not-allowed', label: '✅'
    },
    nonaktif: {
        bg: '#f9fafb',
        border: '#e5e7eb', color: '#d1d5db',
        shadow: 'none', cursor: 'not-allowed', label: '🚫'
    },
};

// Aksi berikutnya berdasarkan status
const NEXT_AKSI: Record<string, { aksi: string; label: string; pesan: string } | null> = {
    tersedia:  { aksi: 'diambil',   label: 'Tandai Diambil',         pesan: 'Pasien mengambil nomor ini?' },
    diambil:   { aksi: 'dipanggil', label: 'Panggil ke Loket',       pesan: 'Panggil nomor antrean ini ke loket?' },
    dipanggil: { aksi: 'lanjutkan', label: 'Lanjutkan Pendaftaran',   pesan: 'Lanjutkan nomor antrean ini ke pendaftaran pasien baru?' },
    selesai:   null,
    nonaktif:  null,
};

const GridPanggil = ({ state, setState, toast, getGridData }: GridPanggilProps) => {
    const router = useRouter();
    const aktif      = state.gridData.filter((d) => d.status !== 'nonaktif');
    const currentDipanggil = state.gridData.find((d) => d.status === 'dipanggil');

    // Urutkan nomor yang diambil (FIFO)
    const takenItems = state.gridData
        .filter((d) => d.status === 'diambil')
        .sort((a, b) => {
            const numA = parseInt(a.no_antrian.replace(/\D/g, '')) || 0;
            const numB = parseInt(b.no_antrian.replace(/\D/g, '')) || 0;
            return numA !== numB ? numA - numB : a.no_antrian.localeCompare(b.no_antrian);
        });
    const nextTakenToCall = takenItems.length > 0 ? takenItems[0] : null;

    // Urutkan nomor yang tersedia (FIFO)
    const availableItems = state.gridData
        .filter((d) => d.status === 'tersedia')
        .sort((a, b) => {
            const numA = parseInt(a.no_antrian.replace(/\D/g, '')) || 0;
            const numB = parseInt(b.no_antrian.replace(/\D/g, '')) || 0;
            return numA !== numB ? numA - numB : a.no_antrian.localeCompare(b.no_antrian);
        });
    const nextAvailableToTake = availableItems.length > 0 ? availableItems[0] : null;

    // Nomor aktif terurut untuk penamaan pool dinamis (cth: 01-10)
    const activeNumbers = state.gridData
        .filter((d) => d.status !== 'nonaktif')
        .map((d) => d.no_antrian)
        .sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, '')) || 0;
            const numB = parseInt(b.replace(/\D/g, '')) || 0;
            return numA !== numB ? numA - numB : a.localeCompare(b);
        });
    const firstNo = activeNumbers.length > 0 ? activeNumbers[0] : '01';
    const lastNo = activeNumbers.length > 0 ? activeNumbers[activeNumbers.length - 1] : `${aktif.length || 10}`;
    const poolRangeText = activeNumbers.length > 0 ? `${firstNo}-${lastNo}` : `${aktif.length || 10}`;

    const handleLewati = (item: TableData) => {
        confirmDialog({
            className: 'confirm-dialog-centered',
            style: { width: '400px', maxWidth: '92vw' },
            message: (
                <div className="flex flex-column align-items-center text-center w-full" style={{ padding: '4px 0 0 0' }}>
                    <div
                        className="flex align-items-center justify-content-center"
                        style={{
                            width: '56px',
                            height: '56px',
                            borderRadius: '50%',
                            backgroundColor: '#fff1f2',
                            border: '1.5px solid #fecdd3',
                            marginBottom: '16px',
                        }}
                    >
                        <i className="pi pi-forward text-2xl text-rose-600 font-bold" />
                    </div>
                    <div className="w-full">
                        <h3 className="font-bold text-lg text-900 m-0" style={{ marginBottom: '6px' }}>
                            Lewati Nomor {item.no_antrian}?
                        </h3>
                        <p className="text-color-secondary text-sm m-0 line-height-3">
                            Pasien nomor <strong>{item.no_antrian}</strong> tidak hadir atau ditinggal? Nomor antrean ini akan diselesaikan (dilewati) dan tidak dapat dipanggil lagi.
                        </p>
                    </div>
                </div>
            ) as any,
            header: 'Konfirmasi Lewati Antrean',
            acceptLabel: '⏭️ Ya, Lewati (Selesai)',
            rejectLabel: 'Batal',
            acceptClassName: 'p-button-danger p-button-sm font-semibold modal-btn-primary',
            rejectClassName: 'p-button-secondary p-button-outlined p-button-sm font-medium modal-btn-secondary',
            accept: async () => {
                setState((p) => ({ ...p, loadGrid: true }));
                try {
                    const res = await postData(apiEndpointPanggil, {
                        kode_antrian: item.kode_antrian,
                        aksi: 'lewati',
                        tz: getTzUser(),
                    });
                    showSuccess(toast, res.data?.message || `Nomor antrean ${item.no_antrian} berhasil dilewati.`);
                    await getGridData();
                } catch (error: any) {
                    const e = error?.response?.data || error;
                    showError(toast, e?.message || 'Terjadi Kesalahan saat melewati antrean');
                } finally {
                    setState((p) => ({ ...p, loadGrid: false }));
                }
            },
        });
    };

    const handleAksi = (item: TableData) => {
        const next = NEXT_AKSI[item.status];
        if (!next) return;

        // Validasi: Cegah memanggil antrean baru jika masih ada antrean lain yang sedang dipanggil di loket
        if (next.aksi === 'dipanggil' && currentDipanggil && currentDipanggil.kode_antrian !== item.kode_antrian) {
            showWarning(
                toast,
                `Nomor antrean ${currentDipanggil.no_antrian} sedang dipanggil di loket dan belum diselesaikan. Harap selesaikan nomor ${currentDipanggil.no_antrian} terlebih dahulu sebelum memanggil antrean berikutnya.`
            );
            return;
        }

        // Aksi Khusus: Lanjutkan Pendaftaran (Langsung arahkan ke halaman Pasien Baru)
        if (next.aksi === 'lanjutkan') {
            confirmDialog({
                className: 'confirm-dialog-centered',
                style: { width: '400px', maxWidth: '92vw' },
                message: (
                    <div className="flex flex-column align-items-center text-center w-full" style={{ padding: '4px 0 0 0' }}>
                        <div
                            className="flex align-items-center justify-content-center"
                            style={{
                                width: '56px',
                                height: '56px',
                                borderRadius: '50%',
                                backgroundColor: '#ecfdf5',
                                border: '1.5px solid #a7f3d0',
                                marginBottom: '16px',
                            }}
                        >
                            <i className="pi pi-user-plus text-2xl text-emerald-600" />
                        </div>
                        <div className="w-full">
                            <h3 className="font-bold text-lg text-900 m-0" style={{ marginBottom: '6px' }}>
                                Nomor {item.no_antrian} — Lanjutkan Pendaftaran
                            </h3>
                            <p className="text-color-secondary text-sm m-0 line-height-3">
                                Arahkan nomor antrean <strong>{item.no_antrian}</strong> ke pendaftaran pasien baru?
                            </p>
                            <div className="mt-3 pt-2 border-top-1 surface-border">
                                <span className="text-xs text-color-secondary mr-2">Pasien tidak hadir / ditinggal?</span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const closeBtn = document.querySelector('.confirm-dialog-centered .p-dialog-header-close') as HTMLElement;
                                        if (closeBtn) closeBtn.click();
                                        setTimeout(() => handleLewati(item), 150);
                                    }}
                                    className="p-link text-xs font-bold text-rose-600 hover:text-rose-700 underline cursor-pointer"
                                >
                                    ⏭️ Lewati Antrean Ini
                                </button>
                            </div>
                        </div>
                    </div>
                ) as any,
                header: 'Konfirmasi Lanjutkan Pendaftaran',
                acceptLabel: '👉 Lanjutkan Pendaftaran',
                rejectLabel: 'Batal',
                acceptClassName: 'p-button-success p-button-sm font-semibold modal-btn-primary',
                rejectClassName: 'p-button-secondary p-button-outlined p-button-sm font-medium modal-btn-secondary',
                accept: () => {
                    showSuccess(
                        toast,
                        `Nomor antrean ${item.no_antrian} dilanjutkan ke pendaftaran pasien baru.`
                    );
                    router.push('/pendaftaran-antrean/registrasi-pasien');
                },
            });
            return;
        }

        confirmDialog({
            className: 'confirm-dialog-centered',
            style: { width: '400px', maxWidth: '92vw' },
            message: (
                <div className="flex flex-column align-items-center text-center w-full" style={{ padding: '4px 0 0 0' }}>
                    <div
                        className="flex align-items-center justify-content-center"
                        style={{
                            width: '56px',
                            height: '56px',
                            borderRadius: '50%',
                            backgroundColor: next.aksi === 'dipanggil' ? '#eff6ff' : '#f0fdf4',
                            color: next.aksi === 'dipanggil' ? '#2563eb' : '#059669',
                            border: `1.5px solid ${next.aksi === 'dipanggil' ? '#bfdbfe' : '#bbf7d0'}`,
                            marginBottom: '16px',
                        }}
                    >
                        <i className={`pi ${next.aksi === 'dipanggil' ? 'pi-megaphone text-blue-600' : 'pi-ticket text-teal-600'} text-2xl font-bold`} />
                    </div>
                    <div className="w-full">
                        <h3 className="font-bold text-lg text-900 m-0" style={{ marginBottom: '6px' }}>
                            Nomor {item.no_antrian} — {next.label}
                        </h3>
                        <p className="text-color-secondary text-sm m-0 line-height-3">{next.pesan}</p>
                    </div>
                </div>
            ) as any,
            header: next.aksi === 'dipanggil' ? 'Konfirmasi Panggilan Loket' : 'Konfirmasi Aksi Antrian',
            acceptLabel: next.aksi === 'dipanggil' ? '📢 Panggil ke Loket' : next.label,
            rejectLabel: 'Batal',
            acceptClassName: next.aksi === 'dipanggil' ? 'p-button-primary p-button-sm font-semibold modal-btn-primary' : 'p-button-info p-button-sm font-semibold modal-btn-primary',
            rejectClassName: 'p-button-secondary p-button-outlined p-button-sm font-medium modal-btn-secondary',
            accept: async () => {
                setState((p) => ({ ...p, loadGrid: true }));
                try {
                    const res = await postData(apiEndpointPanggil, {
                        kode_antrian: item.kode_antrian,
                        aksi: next.aksi,
                        tz: getTzUser(),
                    });
                    showSuccess(toast, res.data?.message || 'Berhasil');

                    // Hanya mainkan suara saat dipanggil ke loket
                    if (next.aksi === 'dipanggil') {
                        playChime();
                        speakNomor(item.no_antrian);
                    }

                    await getGridData();
                } catch (error: any) {
                    const e = error?.response?.data || error;
                    showError(toast, e?.message || 'Terjadi Kesalahan');
                } finally {
                    setState((p) => ({ ...p, loadGrid: false }));
                }
            },
        });
    };

    const handleReset = () => {
        confirmDialog({
            style: { width: '420px', maxWidth: '92vw' },
            message: (
                <div className="flex flex-column align-items-center text-center gap-3 py-1">
                    <div
                        className="w-3rem h-3rem border-round-circle flex align-items-center justify-content-center shadow-1"
                        style={{ backgroundColor: '#fff7ed', color: '#ea580c' }}
                    >
                        <i className="pi pi-refresh text-2xl font-bold text-orange-600" />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg mb-1 text-900">Reset Semua Antrean ({poolRangeText})?</h3>
                        <p className="text-color-secondary text-xs m-0 line-height-3">
                            Semua nomor kartu fisik ({poolRangeText}) yang diambil/dipanggil akan dikembalikan ke status tersedia.
                        </p>
                    </div>
                </div>
            ) as any,
            header: 'Konfirmasi Reset Pool Antrean',
            acceptLabel: 'Ya, Reset Semua',
            rejectLabel: 'Batal',
            acceptClassName: 'p-button-warning p-button-sm font-bold',
            rejectClassName: 'p-button-secondary p-button-outlined p-button-sm font-semibold',
            accept: async () => {
                setState((p) => ({ ...p, loadGrid: true }));
                try {
                    const res = await postData(apiEndpointReset, { tz: getTzUser() });
                    showSuccess(toast, res.data?.message || 'Antrian berhasil direset');
                    await getGridData();
                } catch (error: any) {
                    const e = error?.response?.data || error;
                    showError(toast, e?.message || 'Terjadi Kesalahan');
                } finally {
                    setState((p) => ({ ...p, loadGrid: false }));
                }
            },
        });
    };

    const handleQuickGenerate = async () => {
        setState((p) => ({ ...p, loadGrid: true }));
        try {
            const body = {
                mode: 'bulk',
                dari: '01',
                sampai: '30',
                status: 'tersedia',
                tz: getTzUser(),
            };
            const res = await postData(apiEndpointCreate, body, { 'X-Level': '1' });
            showSuccess(toast, res.data?.message || 'Berhasil meng-generate 30 nomor antrean.');
            await getGridData();
        } catch (error: any) {
            const e = error?.response?.data || error;
            showError(toast, e?.message || 'Terjadi Kesalahan');
        } finally {
            setState((p) => ({ ...p, loadGrid: false }));
        }
    };

    return (
        <div className="card">
            <ConfirmDialog
                className="confirm-dialog-centered"
                style={{ width: '400px', maxWidth: '92vw' }}
            />
            <style jsx global>{`
                .confirm-dialog-centered.p-dialog {
                    border-radius: 16px !important;
                    overflow: hidden !important;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important;
                    border: 1px solid rgba(226, 232, 240, 0.8) !important;
                }
                .confirm-dialog-centered .p-dialog-header {
                    position: relative !important;
                    padding: 20px 24px 10px 24px !important;
                    border-bottom: none !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    text-align: center !important;
                    background: #ffffff !important;
                }
                .confirm-dialog-centered .p-dialog-title {
                    font-size: 1.125rem !important;
                    font-weight: 700 !important;
                    color: #1e293b !important;
                    line-height: 1.4 !important;
                    text-align: center !important;
                    width: 100% !important;
                    margin: 0 auto !important;
                    padding: 0 28px !important;
                }
                .confirm-dialog-centered .p-dialog-header-icons {
                    position: absolute !important;
                    right: 16px !important;
                    top: 50% !important;
                    transform: translateY(-50%) !important;
                    display: flex !important;
                    align-items: center !important;
                }
                .confirm-dialog-centered .p-dialog-header-icon {
                    width: 32px !important;
                    height: 32px !important;
                    border-radius: 8px !important;
                    color: #64748b !important;
                    transition: all 0.15s ease-in-out !important;
                }
                .confirm-dialog-centered .p-dialog-header-icon:hover {
                    background-color: #f1f5f9 !important;
                    color: #0f172a !important;
                }
                .confirm-dialog-centered .p-dialog-content {
                    padding: 8px 24px 20px 24px !important;
                    background: #ffffff !important;
                    display: flex !important;
                    flex-direction: column !important;
                    align-items: center !important;
                    justify-content: center !important;
                    text-align: center !important;
                    width: 100% !important;
                }
                .confirm-dialog-centered .p-confirm-dialog-message {
                    margin: 0 !important;
                    padding: 0 !important;
                    width: 100% !important;
                    text-align: center !important;
                    display: flex !important;
                    flex-direction: column !important;
                    align-items: center !important;
                    justify-content: center !important;
                }
                .confirm-dialog-centered .p-confirm-dialog-icon {
                    display: none !important;
                }
                .confirm-dialog-centered .p-dialog-footer {
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    gap: 12px !important;
                    padding: 0 24px 24px 24px !important;
                    border-top: none !important;
                    background: #ffffff !important;
                    width: 100% !important;
                }
                .confirm-dialog-centered .p-dialog-footer .p-button {
                    height: 42px !important;
                    min-height: 42px !important;
                    border-radius: 8px !important;
                    padding: 0 18px !important;
                    font-size: 0.875rem !important;
                    font-weight: 600 !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    transition: all 0.2s ease-in-out !important;
                    box-sizing: border-box !important;
                    margin: 0 !important;
                }
                .confirm-dialog-centered .p-dialog-footer .modal-btn-secondary,
                .confirm-dialog-centered .p-dialog-footer .p-button-secondary {
                    flex: 1 1 0 !important;
                    background: #ffffff !important;
                    color: #475569 !important;
                    border: 1px solid #cbd5e1 !important;
                    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05) !important;
                }
                .confirm-dialog-centered .p-dialog-footer .modal-btn-secondary:hover,
                .confirm-dialog-centered .p-dialog-footer .p-button-secondary:hover {
                    background: #f8fafc !important;
                    color: #1e293b !important;
                    border-color: #94a3b8 !important;
                }
                .confirm-dialog-centered .p-dialog-footer .modal-btn-secondary:focus,
                .confirm-dialog-centered .p-dialog-footer .p-button-secondary:focus {
                    outline: none !important;
                    box-shadow: 0 0 0 3px rgba(203, 213, 225, 0.5) !important;
                }
                .confirm-dialog-centered .p-dialog-footer .modal-btn-primary,
                .confirm-dialog-centered .p-dialog-footer .p-button-success {
                    flex: 1.4 1 0 !important;
                    background: #10b981 !important;
                    color: #ffffff !important;
                    border: 1px solid #10b981 !important;
                    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05) !important;
                }
                .confirm-dialog-centered .p-dialog-footer .modal-btn-primary:hover,
                .confirm-dialog-centered .p-dialog-footer .p-button-success:hover {
                    background: #059669 !important;
                    border-color: #059669 !important;
                    box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.25) !important;
                }
                .confirm-dialog-centered .p-dialog-footer .modal-btn-primary:focus,
                .confirm-dialog-centered .p-dialog-footer .p-button-success:focus {
                    outline: none !important;
                    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.3) !important;
                }
            `}</style>

            {/* Header */}
            <div className="mb-3">
                <h3 className="text-2xl font-bold flex align-items-center gap-2 mb-1 text-900">
                    <i className="pi pi-bell text-blue-600 text-2xl" />
                    Antrean Manual
                </h3>
                <p className="text-color-secondary text-sm m-0">
                    Klik nomor sesuai kartu pasien untuk mengubah statusnya. Panggilan antrean berjalan sesuai urutan.
                </p>
            </div>

            {/* Tombol Aksi: Display TV & Reset Semua */}
            <div className="flex align-items-center gap-2 mb-3 flex-wrap">
                <Button
                    label="Display TV"
                    icon="pi pi-desktop"
                    severity="info"
                    outlined
                    size="small"
                    onClick={() => window.open('/display-antrean-pendaftaran', '_blank')}
                    title="Buka Layar Display TV Antrean di Tab Baru"
                    className="font-bold text-xs"
                />
                <Button
                    label="Reset Semua"
                    icon="pi pi-refresh"
                    severity="warning"
                    outlined
                    size="small"
                    onClick={handleReset}
                    loading={state.loadGrid}
                    className="font-bold text-xs"
                />
                {aktif.length === 0 && (
                    <Button
                        label="⚡ Generate 30 Nomor (01 - 30)"
                        icon="pi pi-bolt"
                        severity="success"
                        outlined
                        size="small"
                        onClick={handleQuickGenerate}
                        loading={state.loadGrid}
                        className="font-bold text-xs"
                    />
                )}
            </div>

            {/* Legend */}
            <KeteranganStatus
                className="mb-3"
                items={[
                    { color: '#22c55e', label: 'Tersedia = klik tandai diambil' },
                    { color: '#3b82f6', label: 'Diambil = klik panggil ke loket' },
                    { color: '#f59e0b', label: 'Dipanggil = klik lanjutkan pendaftaran' },
                    { color: '#94a3b8', label: 'Selesai = tidak dapat diklik' },
                    { color: '#ef4444', label: 'Nonaktif' },
                ]}
            />

            {/* Banner Status Sedang Dipanggil di Loket */}
            {currentDipanggil && (
                <div
                    className="mb-4 p-3 border-round-xl surface-card border-1 border-amber-300 shadow-2 flex flex-wrap align-items-center justify-content-between gap-3"
                    style={{ background: 'linear-gradient(135deg, #fffbeb, #fef3c7)' }}
                >
                    <div className="flex align-items-center gap-3">
                        <div className="w-3rem h-3rem border-round-circle flex align-items-center justify-content-center bg-amber-500 text-white shadow-1">
                            <i className="pi pi-volume-up text-xl font-bold" />
                        </div>
                        <div>
                            <div className="flex align-items-center gap-2">
                                <span className="font-bold text-xs text-amber-900 uppercase tracking-wide">Sedang Dipanggil di Loket:</span>
                                <span className="text-xl font-black text-amber-700">Nomor {currentDipanggil.no_antrian}</span>
                            </div>
                            <span className="text-xs text-amber-800">Pasien sedang berada / dipanggil ke loket pendaftaran.</span>
                        </div>
                    </div>
                    <div className="flex align-items-center gap-2 flex-wrap">
                        <Button
                            label="🔊 Panggil Ulang"
                            icon="pi pi-volume-up"
                            severity="warning"
                            size="small"
                            onClick={() => {
                                playChime();
                                speakNomor(currentDipanggil.no_antrian);
                                showSuccess(toast, `Panggilan suara nomor ${currentDipanggil.no_antrian} diulang.`);
                            }}
                            className="font-bold text-xs"
                        />
                        <Button
                            label="⏭️ Lewati"
                            icon="pi pi-forward"
                            severity="danger"
                            outlined
                            size="small"
                            onClick={() => handleLewati(currentDipanggil)}
                            className="font-bold text-xs"
                            tooltip="Lewati nomor ini jika pasien tidak hadir"
                        />
                        <Button
                            label="👉 Lanjutkan Pendaftaran"
                            icon="pi pi-user-plus"
                            severity="success"
                            size="small"
                            onClick={() => {
                                showSuccess(
                                    toast,
                                    `Nomor antrean ${currentDipanggil.no_antrian} dilanjutkan ke pendaftaran pasien baru.`
                                );
                                router.push('/pendaftaran-antrean/registrasi-pasien');
                            }}
                            className="font-bold text-xs"
                        />
                    </div>
                </div>
            )}

            {/* Grid Tombol */}
            {state.loadGrid ? (
                <div className="flex justify-content-center align-items-center py-6">
                    <i className="pi pi-spinner pi-spin text-4xl text-blue-500" />
                </div>
            ) : aktif.length === 0 ? (
                <div className="flex flex-column align-items-center justify-content-center p-6 surface-50 border-round-xl border-1 surface-border text-center my-3">
                    <div className="w-4rem h-4rem border-round-circle bg-blue-100 flex align-items-center justify-content-center mb-3">
                        <i className="pi pi-ticket text-blue-600 text-3xl" />
                    </div>
                    <h4 className="text-xl font-bold text-900 mb-2">Belum Ada Nomor Antrean Terdaftar</h4>
                    <p className="text-500 text-sm mb-4" style={{ maxWidth: '400px' }}>
                        Nomor kartu antrean fisik belum terdaftar di sistem. Silakan klik tombol di bawah untuk membuat 30 nomor antrean awal atau buka tab Kelola Master.
                    </p>
                    <div className="flex align-items-center gap-2">
                        <Button
                            label="Generate Cepat (01 - 30)"
                            icon="pi pi-bolt"
                            severity="success"
                            className="font-bold text-sm"
                            onClick={handleQuickGenerate}
                        />
                        <Button
                            label="Buka Kelola Master"
                            icon="pi pi-list"
                            outlined
                            className="font-semibold text-sm"
                            onClick={() => setState((p) => ({ ...p, activeTab: 2 }))}
                        />
                    </div>
                </div>
            ) : (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
                        gap: '12px',
                    }}
                >
                    {aktif.map((item) => {
                        const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.nonaktif;
                        const nextAksi = NEXT_AKSI[item.status]?.aksi;
                        const isDipanggil = item.status === 'dipanggil';
                        const isDiambil = item.status === 'diambil';

                        // Aturan Kunci: Jika sedang ada antrean lain dipanggil, antrean diambil lainnya tidak dapat dipanggil
                        const isCallingOther = !!currentDipanggil && currentDipanggil.kode_antrian !== item.kode_antrian;
                        const isDipanggilBlocked = isCallingOther && nextAksi === 'dipanggil';

                        const isNextInLine = !currentDipanggil && isDiambil && nextTakenToCall?.kode_antrian === item.kode_antrian;
                        const canClick = !!NEXT_AKSI[item.status] && !isDipanggilBlocked;

                        let badgeText = cfg.label;
                        if (isDipanggilBlocked) {
                            badgeText = '🔒 Tunggu';
                        } else if (isNextInLine) {
                            badgeText = '⭐ Panggil';
                        }

                        let tooltipText = `No. ${item.no_antrian} — ${item.status}`;
                        if (isDipanggilBlocked) {
                            tooltipText = `No. ${item.no_antrian} (Selesaikan No. ${currentDipanggil?.no_antrian} terlebih dahulu)`;
                        }

                        return (
                            <div
                                key={item.kode_antrian}
                                style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
                            >
                                {/* Kartu nomor utama */}
                                <button
                                    onClick={() => handleAksi(item)}
                                    disabled={!canClick}
                                    title={tooltipText}
                                    style={{
                                        height: '84px',
                                        fontSize: '1.5rem',
                                        fontWeight: 'bold',
                                        borderRadius: '12px',
                                        border: isNextInLine
                                            ? '2.5px solid #2563eb'
                                            : `2px solid ${isDipanggilBlocked ? '#cbd5e1' : cfg.border}`,
                                        background: isDipanggilBlocked ? '#f1f5f9' : cfg.bg,
                                        color: isDipanggilBlocked ? '#94a3b8' : isNextInLine ? '#1d4ed8' : cfg.color,
                                        cursor: isDipanggilBlocked ? 'not-allowed' : cfg.cursor,
                                        opacity: isDipanggilBlocked ? 0.75 : 1,
                                        transition: 'all 0.18s ease',
                                        boxShadow: isNextInLine
                                            ? '0 0 12px rgba(37,99,235,0.45)'
                                            : isDipanggilBlocked
                                            ? 'none'
                                            : cfg.shadow,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '2px',
                                        width: '100%',
                                        position: 'relative',
                                    }}
                                    onMouseEnter={(e) => {
                                        if (canClick && !isDipanggilBlocked) {
                                            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.07)';
                                            (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 6px 18px ${cfg.border}66`;
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                                        (e.currentTarget as HTMLButtonElement).style.boxShadow = isNextInLine
                                            ? '0 0 12px rgba(37,99,235,0.45)'
                                            : isDipanggilBlocked
                                            ? 'none'
                                            : cfg.shadow;
                                    }}
                                >
                                    <span style={{ lineHeight: 1 }}>{item.no_antrian}</span>
                                    {badgeText && (
                                        <span
                                            style={{
                                                fontSize: '0.7rem',
                                                fontWeight: isNextInLine ? '800' : '600',
                                                color: isNextInLine ? '#1d4ed8' : isDipanggilBlocked ? '#94a3b8' : 'inherit',
                                                opacity: isDipanggilBlocked ? 0.9 : 0.95,
                                            }}
                                        >
                                            {badgeText}
                                        </span>
                                    )}
                                </button>

                                {/* Tombol Panggil Ulang — hanya tampil saat dipanggil */}
                                {isDipanggil && (
                                    <button
                                        onClick={() => {
                                            playChime();
                                            speakNomor(item.no_antrian);
                                        }}
                                        title={`Panggil ulang nomor ${item.no_antrian}`}
                                        style={{
                                            padding: '4px 0',
                                            fontSize: '0.7rem',
                                            fontWeight: '600',
                                            borderRadius: '8px',
                                            border: '1.5px solid #f59e0b',
                                            background: '#fffbeb',
                                            color: '#b45309',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                            width: '100%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '4px',
                                        }}
                                        onMouseEnter={(e) => {
                                            (e.currentTarget as HTMLButtonElement).style.background = '#fef3c7';
                                            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 8px rgba(245,158,11,0.4)';
                                        }}
                                        onMouseLeave={(e) => {
                                            (e.currentTarget as HTMLButtonElement).style.background = '#fffbeb';
                                            (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
                                        }}
                                    >
                                        🔁 Panggil Ulang
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default GridPanggil;
