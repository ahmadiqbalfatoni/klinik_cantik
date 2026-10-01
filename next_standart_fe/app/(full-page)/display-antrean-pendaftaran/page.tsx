'use client';

import React, { useState, useEffect, useRef } from 'react';
import postData from '@/lib/axios/postData';
import { getCompanyConfigs } from '@/lib/tools/generalTools';

interface QueueItem {
    id?: number;
    kode_antrian?: string;
    kode_antrian_awal?: string;
    nomor_antrian?: string;
    no_antrian?: string;
    status: string;
    diambil_at?: string;
    dipanggil_at?: string;
}

interface VideoPreset {
    id: string;
    title: string;
    type: 'youtube' | 'mp4';
    url: string;
    isCustom?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// IndexedDB Helper untuk Menyimpan Video Lokal secara Permanen di Browser
// ─────────────────────────────────────────────────────────────────────────────
const DB_NAME = 'DisplayTV_MediaDB';
const STORE_NAME = 'local_videos';
const DB_VERSION = 1;

interface LocalVideoRecord {
    id: string;
    title: string;
    fileName: string;
    blob: Blob;
    createdAt: number;
}

const openMediaDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || !window.indexedDB) {
            return reject(new Error('IndexedDB tidak didukung pada browser ini'));
        }
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

const saveLocalVideoToDB = async (item: LocalVideoRecord): Promise<void> => {
    try {
        const db = await openMediaDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.put(item);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (err) {
        console.warn('Gagal menyimpan video ke IndexedDB:', err);
    }
};

const getAllLocalVideosFromDB = async (): Promise<LocalVideoRecord[]> => {
    try {
        const db = await openMediaDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    } catch (err) {
        console.warn('Gagal memuat video lokal dari IndexedDB:', err);
        return [];
    }
};

const deleteLocalVideoFromDB = async (id: string): Promise<void> => {
    try {
        const db = await openMediaDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (err) {
        console.warn('Gagal menghapus video dari IndexedDB:', err);
    }
};

const DEFAULT_VIDEO_PRESETS: VideoPreset[] = [];

export default function DisplayAntreanPendaftaranPage() {
    const [gridData, setGridData] = useState<QueueItem[]>([]);
    const [currentTime, setCurrentTime] = useState<string>('');
    const [currentDate, setCurrentDate] = useState<string>('');
    const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
    const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(true);
    const [isCallingAnimation, setIsCallingAnimation] = useState<boolean>(false);

    // Branding / Logo Klinik dari Pengaturan
    const [clinicName, setClinicName] = useState<string>('KLINIK KECANTIKAN');
    const [clinicSubtitle, setClinicSubtitle] = useState<string>('Display Antrean Loket Pendaftaran & Media Informasi');
    const [clinicLogo, setClinicLogo] = useState<string>('');

    // Video State & Persistent Presets
    const [videoPresets, setVideoPresets] = useState<VideoPreset[]>([]);
    const [selectedVideo, setSelectedVideo] = useState<VideoPreset | null>(null);
    const [showVideoModal, setShowVideoModal] = useState<boolean>(false);
    const [customVideoTitle, setCustomVideoTitle] = useState<string>('');
    const [customVideoUrl, setCustomVideoUrl] = useState<string>('');
    const [isVideoMuted, setIsVideoMuted] = useState<boolean>(true);
    const [localFileName, setLocalFileName] = useState<string>('');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoElementRef = useRef<HTMLVideoElement>(null);
    const prevCalledNoRef = useRef<string>('');
    const isFirstLoadRef = useRef<boolean>(true);

    // Audio chime helper
    const playChime = () => {
        try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const notes = [523.25, 659.25]; // C5 -> E5
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
        } catch (_) {}
    };

    // TTS speech helper
    const speakNomor = (noAntrian: string) => {
        try {
            if (!('speechSynthesis' in window)) return;
            window.speechSynthesis.cancel();

            const teks = `Nomor antrian ${noAntrian}, silakan menuju ke loket pendaftaran`;
            const utter = new SpeechSynthesisUtterance(teks);
            utter.lang = 'id-ID';
            utter.rate = 0.85;
            utter.pitch = 1.05;
            utter.volume = 1;

            const speak = () => {
                const voices = window.speechSynthesis.getVoices();
                const idVoice = voices.find(
                    (v) => v.lang === 'id-ID' || v.lang.startsWith('id')
                );
                if (idVoice) utter.voice = idVoice;
                window.speechSynthesis.speak(utter);
            };

            if (window.speechSynthesis.getVoices().length > 0) {
                setTimeout(speak, 900);
            } else {
                window.speechSynthesis.onvoiceschanged = () => {
                    setTimeout(speak, 900);
                };
            }
        } catch (_) {}
    };

    // Fetch data antrian secara berkala
    const fetchQueueData = async () => {
        try {
            const res = await postData('/master/antrian-awal-data', {
                sortField: 'no_antrian',
                sortOrder: 'asc',
            });
            const data: QueueItem[] = res.data?.data || [];
            setGridData(data);

            const activeItem = data.find((d) => d.status === 'dipanggil');
            const currentNo = activeItem ? (activeItem.no_antrian || activeItem.nomor_antrian || '') : '';

            // Deteksi jika nomor antrean baru dipanggil
            if (currentNo && currentNo !== prevCalledNoRef.current) {
                setIsCallingAnimation(true);
                setTimeout(() => setIsCallingAnimation(false), 5000);

                if (!isFirstLoadRef.current && isAudioEnabled) {
                    playChime();
                    speakNomor(currentNo);
                }
                prevCalledNoRef.current = currentNo;
            } else if (!currentNo) {
                prevCalledNoRef.current = '';
            }

            if (isFirstLoadRef.current) {
                isFirstLoadRef.current = false;
            }
        } catch (error) {
            console.warn('Gagal memuat data antrean untuk TV:', error);
        }
    };

    // Realtime clock
    useEffect(() => {
        const updateClock = () => {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            });
            const dateStr = now.toLocaleDateString('id-ID', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
            });
            setCurrentTime(timeStr);
            setCurrentDate(dateStr);
        };

        updateClock();
        const clockInterval = setInterval(updateClock, 1000);
        return () => clearInterval(clockInterval);
    }, []);

    // Muat konfigurasi branding / logo klinik dari backend & cache lokal
    useEffect(() => {
        const loadClinicConfig = async () => {
            try {
                const cfg = await getCompanyConfigs('/setup/config-data');
                if (cfg) {
                    if (cfg.msNamaPerusahaan) setClinicName(cfg.msNamaPerusahaan);
                    if (cfg.msSubNamaPerusahaan) setClinicSubtitle(cfg.msSubNamaPerusahaan);
                    if (cfg.msLogoPerusahaan) setClinicLogo(cfg.msLogoPerusahaan);
                }
            } catch (err) {
                console.warn('Gagal memuat konfigurasi klinik untuk Display TV:', err);
            }
        };
        loadClinicConfig();
    }, []);

    // Muat video tersimpan (YouTube dari localStorage & Local Video dari IndexedDB) pada mount
    useEffect(() => {
        let isMounted = true;

        const loadAllVideos = async () => {
            try {
                // 1. Ambil video YouTube dari localStorage
                let youtubePresets: VideoPreset[] = [];
                const savedPresetsStr = localStorage.getItem('display_tv_saved_presets');
                if (savedPresetsStr) {
                    const parsed: VideoPreset[] = JSON.parse(savedPresetsStr);
                    if (Array.isArray(parsed)) {
                        youtubePresets = parsed.filter(
                            (p) => p.id !== '1' && p.id !== '2' && p.id !== '3' && p.type === 'youtube'
                        );
                    }
                }

                // 2. Ambil video Lokal dari IndexedDB
                const localRecords = await getAllLocalVideosFromDB();
                const localPresets: VideoPreset[] = localRecords.map((rec) => ({
                    id: rec.id,
                    title: rec.title || rec.fileName || 'Video Lokal',
                    type: 'mp4',
                    url: URL.createObjectURL(rec.blob),
                }));

                const combined: VideoPreset[] = [...youtubePresets, ...localPresets];
                if (!isMounted) return;
                setVideoPresets(combined);

                // 3. Pulihkan video yang sebelumnya sedang aktif
                const activeId = localStorage.getItem('display_tv_active_video_id');
                const activeVideoStr = localStorage.getItem('display_tv_active_video');

                let target: VideoPreset | undefined;
                if (activeId) {
                    target = combined.find((p) => p.id === activeId);
                }
                if (!target && activeVideoStr) {
                    try {
                        const parsedActive = JSON.parse(activeVideoStr);
                        if (parsedActive?.id) {
                            target = combined.find((p) => p.id === parsedActive.id);
                        }
                    } catch (_) {}
                }
                if (!target && combined.length > 0) {
                    target = combined[0];
                }

                if (target) {
                    setSelectedVideo(target);
                    if (target.type === 'mp4') {
                        setLocalFileName(target.title);
                    }
                }
            } catch (err) {
                console.warn('Gagal memuat daftar video tersimpan:', err);
            }
        };

        loadAllVideos();

        return () => {
            isMounted = false;
        };
    }, []);

    // Polling antrean setiap 2.5 detik
    useEffect(() => {
        fetchQueueData();
        const pollInterval = setInterval(fetchQueueData, 2500);
        return () => clearInterval(pollInterval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAudioEnabled]);

    // Toggle Fullscreen
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
            setIsFullscreen(true);
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen().catch(() => {});
            }
            setIsFullscreen(false);
        }
    };

    // Helper Convert Youtube URL to Embed URL
    const parseYoutubeUrl = (input: string) => {
        if (!input) return '';
        let videoId = '';
        if (input.includes('youtube.com/watch?v=')) {
            videoId = input.split('watch?v=')[1]?.split('&')[0];
        } else if (input.includes('youtu.be/')) {
            videoId = input.split('youtu.be/')[1]?.split('?')[0];
        } else if (input.includes('youtube.com/embed/')) {
            return input;
        } else {
            videoId = input; // assume plain ID
        }

        if (videoId) {
            return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=1&rel=0`;
        }
        return input;
    };

    // Handler Pilih Video & Simpan sebagai Video Aktif
    const handleSelectVideo = (preset: VideoPreset) => {
        setSelectedVideo(preset);
        if (preset.type === 'mp4') {
            setLocalFileName(preset.title);
        }
        try {
            localStorage.setItem('display_tv_active_video_id', preset.id);
            localStorage.setItem(
                'display_tv_active_video',
                JSON.stringify({
                    id: preset.id,
                    title: preset.title,
                    type: preset.type,
                    url: preset.type === 'youtube' ? preset.url : '',
                })
            );
        } catch (_) {}
    };

    // Handler Pilih & Simpan File Video Lokal ke IndexedDB
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const newId = `local-${Date.now()}`;
        const objectUrl = URL.createObjectURL(file);

        // Simpan ke IndexedDB secara permanen
        await saveLocalVideoToDB({
            id: newId,
            title: file.name,
            fileName: file.name,
            blob: file,
            createdAt: Date.now(),
        });

        const newPreset: VideoPreset = {
            id: newId,
            title: file.name,
            type: 'mp4',
            url: objectUrl,
        };

        const updatedPresets = [...videoPresets, newPreset];
        setVideoPresets(updatedPresets);
        handleSelectVideo(newPreset);
        setShowVideoModal(false);

        // Reset input file agar bisa pilih file yang sama jika diinginkan
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Handler Simpan & Pasang Link YouTube Kustom
    const handleSaveAndApplyCustomVideo = () => {
        if (!customVideoUrl.trim()) return;
        const embedUrl = parseYoutubeUrl(customVideoUrl.trim());
        if (!embedUrl) return;

        const newPreset: VideoPreset = {
            id: `custom-${Date.now()}`,
            title: customVideoTitle.trim() || 'Video Promosi YouTube',
            type: 'youtube',
            url: embedUrl,
            isCustom: true,
        };

        const updatedPresets = [...videoPresets, newPreset];
        setVideoPresets(updatedPresets);
        handleSelectVideo(newPreset);

        // Simpan hanya YouTube presets ke localStorage
        const youtubePresets = updatedPresets.filter((p) => p.type === 'youtube');
        try {
            localStorage.setItem('display_tv_saved_presets', JSON.stringify(youtubePresets));
        } catch (_) {}

        setCustomVideoUrl('');
        setCustomVideoTitle('');
        setShowVideoModal(false);
    };

    // Handler Hapus Video dari Daftar Tersimpan (YouTube & Local Video)
    const handleDeletePreset = async (presetId: string, e: React.MouseEvent) => {
        e.stopPropagation();

        // Jika video lokal, hapus dari IndexedDB
        if (presetId.startsWith('local-')) {
            await deleteLocalVideoFromDB(presetId);
        }

        const updatedPresets = videoPresets.filter((p) => p.id !== presetId);
        setVideoPresets(updatedPresets);

        // Simpan hanya YouTube presets ke localStorage
        const youtubePresets = updatedPresets.filter((p) => p.type === 'youtube');
        try {
            localStorage.setItem('display_tv_saved_presets', JSON.stringify(youtubePresets));
        } catch (_) {}

        if (selectedVideo?.id === presetId) {
            if (updatedPresets.length > 0) {
                handleSelectVideo(updatedPresets[0]);
            } else {
                setSelectedVideo(null);
                setLocalFileName('');
                try {
                    localStorage.removeItem('display_tv_active_video_id');
                    localStorage.removeItem('display_tv_active_video');
                } catch (_) {}
            }
        }
    };

    // Status hitungan
    const dipanggilItem = gridData.find((d) => d.status === 'dipanggil');
    const nomorDipanggil = dipanggilItem ? (dipanggilItem.no_antrian || dipanggilItem.nomor_antrian) : null;

    const waitingList = gridData
        .filter((d) => d.status === 'diambil')
        .sort((a, b) => {
            const numA = parseInt((a.no_antrian || a.nomor_antrian || '').replace(/\D/g, '')) || 0;
            const numB = parseInt((b.no_antrian || b.nomor_antrian || '').replace(/\D/g, '')) || 0;
            return numA - numB;
        });

    const completedCount = gridData.filter(
        (d) => d.status === 'selesai' || (d.status === 'terpakai' && d.dipanggil_at)
    ).length;

    const availableCount = gridData.filter((d) => d.status === 'tersedia').length;

    return (
        <div
            style={{
                minHeight: '100vh',
                background: 'radial-gradient(circle at 10% 20%, #0f172a 0%, #020617 100%)',
                color: '#ffffff',
                fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '20px 28px',
                boxSizing: 'border-box',
                overflow: 'hidden',
                userSelect: 'none',
            }}
        >
            {/* Hidden native input untuk upload file video dari komputer */}
            <input
                type="file"
                ref={fileInputRef}
                accept="video/mp4,video/webm,video/ogg,video/mkv,video/avi"
                style={{ display: 'none' }}
                onChange={handleFileChange}
            />

            {/* ── TOP HEADER BAR ── */}
            <header
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingBottom: '16px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
                }}
            >
                {/* Logo & Klinik Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {clinicLogo ? (
                        <div
                            style={{
                                width: '52px',
                                height: '52px',
                                borderRadius: '16px',
                                background: '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '4px',
                                boxShadow: '0 8px 24px rgba(16, 185, 129, 0.35)',
                                flexShrink: 0,
                                overflow: 'hidden',
                            }}
                        >
                            <img
                                src={clinicLogo}
                                alt={clinicName}
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                onError={() => setClinicLogo('')}
                            />
                        </div>
                    ) : (
                        <div
                            style={{
                                width: '52px',
                                height: '52px',
                                borderRadius: '16px',
                                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff',
                                boxShadow: '0 8px 24px rgba(16, 185, 129, 0.35)',
                                flexShrink: 0,
                            }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: '28px', color: '#ffffff', lineHeight: 1 }}>
                                spa
                            </span>
                        </div>
                    )}
                    <div>
                        <h1
                            style={{
                                margin: 0,
                                fontSize: '26px',
                                fontWeight: 800,
                                letterSpacing: '0.5px',
                                background: 'linear-gradient(90deg, #ffffff 0%, #e2e8f0 100%)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                            }}
                        >
                            {clinicName}
                        </h1>
                        <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>
                            {clinicSubtitle}
                        </p>
                    </div>
                </div>

                {/* Jam Digital, Tanggal, & Tombol Kontrol */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ textAlign: 'right' }}>
                        <div
                            style={{
                                fontSize: '30px',
                                fontWeight: 800,
                                color: '#38bdf8',
                                letterSpacing: '1px',
                                fontFamily: 'monospace',
                                lineHeight: 1,
                            }}
                        >
                            {currentTime || '00:00:00'}
                        </div>
                        <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '4px', fontWeight: 500 }}>
                            {currentDate || 'Memuat tanggal...'}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        {/* Tombol Pilih File Video Lokal */}
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            title="Pilih File Video Lokal (MP4 / WebM / MKV) untuk Ditampilkan"
                            style={{
                                background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
                                border: '1px solid #10b981',
                                color: '#ffffff',
                                borderRadius: '12px',
                                padding: '10px 14px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            📁 Video Lokal
                        </button>

                        {/* Tombol Ganti Video / Pengaturan */}
                        <button
                            onClick={() => setShowVideoModal(true)}
                            title="Pengaturan Video TV (Preset & YouTube)"
                            style={{
                                background: 'rgba(56, 189, 248, 0.15)',
                                border: '1px solid rgba(56, 189, 248, 0.4)',
                                color: '#38bdf8',
                                borderRadius: '12px',
                                padding: '10px 14px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            🎬 Ganti Video
                        </button>

                        {/* Tombol Audio Panggilan Loket */}
                        <button
                            onClick={() => setIsAudioEnabled(!isAudioEnabled)}
                            title={isAudioEnabled ? 'Suara Panggilan Aktif' : 'Suara Panggilan Dimatikan'}
                            style={{
                                background: isAudioEnabled ? 'rgba(14, 165, 233, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                border: `1px solid ${isAudioEnabled ? '#0284c7' : '#ef4444'}`,
                                color: isAudioEnabled ? '#38bdf8' : '#f87171',
                                borderRadius: '12px',
                                padding: '10px 14px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            {isAudioEnabled ? '🔊 Suara Panggilan: ON' : '🔇 Suara Panggilan: OFF'}
                        </button>

                        {/* Tombol Fullscreen */}
                        <button
                            onClick={toggleFullscreen}
                            title="Layar Penuh (F11)"
                            style={{
                                background: 'rgba(255, 255, 255, 0.08)',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                color: '#ffffff',
                                borderRadius: '12px',
                                padding: '10px 14px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            {isFullscreen ? '⛶ Keluar' : '⛶ Layar Penuh'}
                        </button>
                    </div>
                </div>
            </header>

            {/* ── MAIN DISPLAY AREA (KIRI: ANTREAN LOKET, KANAN: VIDEO HD) ── */}
            <main
                style={{
                    display: 'grid',
                    gridTemplateColumns: '40% 60%',
                    gap: '24px',
                    margin: '18px 0',
                    flex: 1,
                    alignItems: 'stretch',
                }}
            >
                {/* ── KOLOM KIRI: PANEL PANGGILAN ANTREAN LOKET ── */}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px',
                        height: '100%',
                    }}
                >
                    {/* 1. HERO BOX: NOMOR DIPANGGIL */}
                    <div
                        style={{
                            flex: 1,
                            background: nomorDipanggil
                                ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.18) 0%, rgba(217, 119, 6, 0.08) 100%)'
                                : 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)',
                            border: `2.5px solid ${nomorDipanggil ? '#f59e0b' : 'rgba(255, 255, 255, 0.12)'}`,
                            borderRadius: '24px',
                            padding: '24px 20px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            textAlign: 'center',
                            position: 'relative',
                            boxShadow: nomorDipanggil
                                ? '0 0 45px rgba(245, 158, 11, 0.3), inset 0 0 20px rgba(245, 158, 11, 0.1)'
                                : '0 16px 36px rgba(0, 0, 0, 0.4)',
                            backdropFilter: 'blur(12px)',
                            transition: 'all 0.3s ease',
                            minHeight: '260px',
                        }}
                    >
                        {/* Header Loket */}
                        <div>
                            <div
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '6px 18px',
                                    borderRadius: '30px',
                                    background: nomorDipanggil ? '#f59e0b' : '#334155',
                                    color: nomorDipanggil ? '#000000' : '#cbd5e1',
                                    fontSize: '14px',
                                    fontWeight: 800,
                                    letterSpacing: '1px',
                                    textTransform: 'uppercase',
                                    boxShadow: nomorDipanggil ? '0 4px 14px rgba(245, 158, 11, 0.4)' : 'none',
                                }}
                            >
                                <span>📢</span>
                                <span>{nomorDipanggil ? 'PANGGILAN AKTIF' : 'LOKET STANDBY'}</span>
                            </div>
                            <h2
                                style={{
                                    fontSize: '22px',
                                    fontWeight: 700,
                                    color: '#e2e8f0',
                                    margin: '10px 0 0',
                                    letterSpacing: '0.5px',
                                }}
                            >
                                LOKET PENDAFTARAN
                            </h2>
                        </div>

                        {/* JUMBO NOMOR ANTREAN */}
                        <div style={{ margin: '8px 0' }}>
                            <div
                                style={{
                                    fontSize: '110px',
                                    fontWeight: 900,
                                    lineHeight: 0.9,
                                    letterSpacing: '3px',
                                    color: nomorDipanggil ? '#fbbf24' : '#64748b',
                                    textShadow: nomorDipanggil
                                        ? '0 0 30px rgba(251, 191, 36, 0.6), 0 0 50px rgba(245, 158, 11, 0.3)'
                                        : 'none',
                                    transform: isCallingAnimation ? 'scale(1.06)' : 'scale(1)',
                                    transition: 'transform 0.3s ease',
                                }}
                            >
                                {nomorDipanggil || '-'}
                            </div>
                            <p
                                style={{
                                    margin: '12px 0 0',
                                    fontSize: '16px',
                                    fontWeight: 600,
                                    color: nomorDipanggil ? '#fde68a' : '#94a3b8',
                                }}
                            >
                                {nomorDipanggil
                                    ? 'SILAKAN MENUJU KE LOKET PENDAFTARAN'
                                    : 'Belum ada panggilan nomor antrean'}
                            </p>
                        </div>

                        {/* Status Footer Loket */}
                        <div
                            style={{
                                width: '100%',
                                padding: '10px 16px',
                                borderRadius: '14px',
                                background: 'rgba(0, 0, 0, 0.3)',
                                border: '1px solid rgba(255, 255, 255, 0.06)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '13px',
                                color: '#94a3b8',
                            }}
                        >
                            <span>Status: <strong style={{ color: '#ffffff' }}>{nomorDipanggil ? 'Sedang Dilayani' : 'Siap'}</strong></span>
                            <span>Menunggu: <strong style={{ color: '#38bdf8' }}>{waitingList.length} Pasien</strong></span>
                        </div>
                    </div>

                    {/* 2. SLIM BOX: ANTREAN BERIKUTNYA (KOMPAK & RAPI) */}
                    <div
                        style={{
                            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '20px',
                            padding: '16px 20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            backdropFilter: 'blur(12px)',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <span style={{ fontSize: '14px', fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>📋</span>
                                <span>Antrean Berikutnya:</span>
                            </span>
                            <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
                                Total {waitingList.length} Menunggu
                            </span>
                        </div>

                        {waitingList.length === 0 ? (
                            <div style={{ color: '#64748b', fontSize: '13px', padding: '6px 0', fontStyle: 'italic' }}>
                                Tidak ada antrean dalam daftar tunggu saat ini
                            </div>
                        ) : (
                            <div
                                className="tv-hide-scrollbar"
                                style={{
                                    display: 'flex',
                                    gap: '10px',
                                    overflowX: 'auto',
                                    paddingBottom: '4px',
                                    scrollbarWidth: 'none',
                                    msOverflowStyle: 'none',
                                }}
                            >
                                {waitingList.slice(0, 6).map((item, idx) => (
                                    <div
                                        key={item.kode_antrian || item.kode_antrian_awal || idx}
                                        style={{
                                            background: idx === 0 ? 'rgba(14, 165, 233, 0.25)' : 'rgba(255, 255, 255, 0.06)',
                                            border: `1.5px solid ${idx === 0 ? '#38bdf8' : 'rgba(255, 255, 255, 0.12)'}`,
                                            borderRadius: '12px',
                                            padding: '8px 14px',
                                            textAlign: 'center',
                                            minWidth: '65px',
                                            boxShadow: idx === 0 ? '0 0 14px rgba(56, 189, 248, 0.3)' : 'none',
                                            flexShrink: 0,
                                        }}
                                    >
                                        <div
                                            style={{
                                                fontSize: '18px',
                                                fontWeight: 800,
                                                color: idx === 0 ? '#38bdf8' : '#ffffff',
                                            }}
                                        >
                                            {item.no_antrian || item.nomor_antrian}
                                        </div>
                                        <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                                            {idx === 0 ? '⭐ Ke-1' : `Ke-${idx + 1}`}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 3. MINI STATS BAR */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <div
                            style={{
                                flex: 1,
                                background: 'rgba(34, 197, 94, 0.12)',
                                border: '1px solid rgba(34, 197, 94, 0.25)',
                                borderRadius: '12px',
                                padding: '10px 14px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <span style={{ fontSize: '12px', color: '#86efac', fontWeight: 600 }}>Tersedia:</span>
                            <span style={{ fontSize: '16px', color: '#4ade80', fontWeight: 800 }}>{availableCount}</span>
                        </div>
                        <div
                            style={{
                                flex: 1,
                                background: 'rgba(56, 189, 248, 0.12)',
                                border: '1px solid rgba(56, 189, 248, 0.25)',
                                borderRadius: '12px',
                                padding: '10px 14px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <span style={{ fontSize: '12px', color: '#7dd3fc', fontWeight: 600 }}>Menunggu:</span>
                            <span style={{ fontSize: '16px', color: '#38bdf8', fontWeight: 800 }}>{waitingList.length}</span>
                        </div>
                        <div
                            style={{
                                flex: 1,
                                background: 'rgba(148, 163, 184, 0.12)',
                                border: '1px solid rgba(148, 163, 184, 0.25)',
                                borderRadius: '12px',
                                padding: '10px 14px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <span style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 600 }}>Selesai:</span>
                            <span style={{ fontSize: '16px', color: '#ffffff', fontWeight: 800 }}>{completedCount}</span>
                        </div>
                    </div>
                </div>

                {/* ── KOLOM KANAN: VIDEO PLAYER HD EDUKASI & PROMOSI KLINIK ── */}
                <div
                    style={{
                        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)',
                        border: '1.5px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '24px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: '0 16px 36px rgba(0, 0, 0, 0.4)',
                        backdropFilter: 'blur(12px)',
                        overflow: 'hidden',
                        height: '100%',
                    }}
                >
                    {/* Header Video Title & Controls */}
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '12px',
                            padding: '0 6px',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                            <span style={{ fontSize: '18px', flexShrink: 0 }}>🎬</span>
                            <span
                                style={{
                                    fontSize: '15px',
                                    fontWeight: 700,
                                    color: '#f8fafc',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    maxWidth: '340px',
                                }}
                            >
                                {selectedVideo ? selectedVideo.title : 'Pilih / Tambah Video'}
                            </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                            {/* Toggle Audio Video Player */}
                            <button
                                onClick={() => {
                                    setIsVideoMuted(!isVideoMuted);
                                    if (videoElementRef.current) {
                                        videoElementRef.current.muted = !isVideoMuted;
                                    }
                                }}
                                title={isVideoMuted ? 'Suara Video Dimatikan (Muted)' : 'Suara Video Menyala'}
                                style={{
                                    background: isVideoMuted ? 'rgba(255, 255, 255, 0.08)' : 'rgba(34, 197, 94, 0.2)',
                                    border: `1px solid ${isVideoMuted ? 'rgba(255, 255, 255, 0.2)' : '#22c55e'}`,
                                    color: isVideoMuted ? '#cbd5e1' : '#4ade80',
                                    padding: '4px 10px',
                                    borderRadius: '8px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                }}
                            >
                                {isVideoMuted ? '🔇 Video Mute' : '🔊 Video Suara ON'}
                            </button>

                            {selectedVideo && (
                                <span
                                    style={{
                                        background: selectedVideo.type === 'mp4' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                        border: `1px solid ${selectedVideo.type === 'mp4' ? '#10b981' : '#ef4444'}`,
                                        color: selectedVideo.type === 'mp4' ? '#6ee7b7' : '#fca5a5',
                                        padding: '3px 10px',
                                        borderRadius: '8px',
                                        fontSize: '11px',
                                        fontWeight: 800,
                                        letterSpacing: '0.5px',
                                    }}
                                >
                                    {selectedVideo.type === 'mp4' ? '📁 FILE LOKAL' : '▶ YOUTUBE HD'}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Frame Video Player 16:9 */}
                    <div
                        style={{
                            flex: 1,
                            position: 'relative',
                            width: '100%',
                            borderRadius: '16px',
                            overflow: 'hidden',
                            background: '#000000',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            minHeight: '320px',
                        }}
                    >
                        {selectedVideo && selectedVideo.url ? (
                            selectedVideo.type === 'youtube' ? (
                                <iframe
                                    key={selectedVideo.url}
                                    src={selectedVideo.url}
                                    title={selectedVideo.title}
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                    allowFullScreen
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: '100%',
                                        border: 'none',
                                    }}
                                />
                            ) : (
                                <video
                                    ref={videoElementRef}
                                    key={selectedVideo.url}
                                    src={selectedVideo.url}
                                    autoPlay
                                    loop
                                    muted={isVideoMuted}
                                    controls
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'contain',
                                        background: '#000000',
                                    }}
                                />
                            )
                        ) : (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#94a3b8',
                                    gap: '12px',
                                    padding: '24px',
                                    textAlign: 'center',
                                    background: 'radial-gradient(circle, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.95) 100%)',
                                }}
                            >
                                <div style={{ fontSize: '44px' }}>🎬</div>
                                <div style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>Belum Ada Video yang Dipilih</div>
                                <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, maxWidth: '400px', lineHeight: 1.5 }}>
                                    Silakan klik tombol <strong>"Tambah Video"</strong> di bawah untuk memasang link video YouTube klinik atau pilih file video lokal.
                                </p>
                                <button
                                    onClick={() => setShowVideoModal(true)}
                                    style={{
                                        marginTop: '6px',
                                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                        border: 'none',
                                        color: '#ffffff',
                                        padding: '9px 20px',
                                        borderRadius: '10px',
                                        cursor: 'pointer',
                                        fontWeight: 700,
                                        fontSize: '13px',
                                        boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                                    }}
                                >
                                    ➕ Tambah & Simpan Video
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Playlist Quick Switcher & Tombol Pilih Video Lokal */}
                    <div
                        className="tv-hide-scrollbar"
                        style={{
                            display: 'flex',
                            gap: '8px',
                            marginTop: '12px',
                            overflowX: 'auto',
                            paddingTop: '4px',
                            paddingBottom: '2px',
                            alignItems: 'center',
                            scrollbarWidth: 'none',
                            msOverflowStyle: 'none',
                        }}
                    >
                        {/* Tombol Upload File Video Lokal */}
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            title="Upload dan simpan file video dari komputer ke TV"
                            style={{
                                background: 'rgba(16, 185, 129, 0.15)',
                                border: '1px dashed #10b981',
                                color: '#6ee7b7',
                                borderRadius: '10px',
                                padding: '6px 14px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                flexShrink: 0,
                                transition: 'all 0.2s ease',
                            }}
                        >
                            <span>📁</span>
                            <span>Upload Video Lokal</span>
                        </button>

                        {videoPresets.map((preset) => (
                            <button
                                key={preset.id}
                                onClick={() => handleSelectVideo(preset)}
                                style={{
                                    background: selectedVideo?.id === preset.id
                                        ? 'linear-gradient(135deg, #0ea5e9, #0284c7)'
                                        : 'rgba(255, 255, 255, 0.06)',
                                    border: `1px solid ${selectedVideo?.id === preset.id ? '#38bdf8' : 'rgba(255, 255, 255, 0.1)'}`,
                                    color: selectedVideo?.id === preset.id ? '#ffffff' : '#94a3b8',
                                    borderRadius: '10px',
                                    padding: '6px 12px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    transition: 'all 0.2s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    flexShrink: 0,
                                }}
                            >
                                <span>{preset.type === 'mp4' ? '📁' : '▶'}</span>
                                <span>{preset.title}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </main>

            {/* ── FOOTER RUNNING TICKER ── */}
            <footer
                style={{
                    background: 'rgba(15, 23, 42, 0.75)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '16px',
                    padding: '10px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        background: '#0ea5e9',
                        color: '#ffffff',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 800,
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        flexShrink: 0,
                    }}
                >
                    INFORMASI
                </div>

                <div
                    style={{
                        flex: 1,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        fontSize: '13px',
                        color: '#cbd5e1',
                        fontWeight: 500,
                        position: 'relative',
                    }}
                >
                    <style>{`
                        .tv-hide-scrollbar::-webkit-scrollbar {
                            display: none !important;
                            width: 0 !important;
                            height: 0 !important;
                        }
                        .tv-hide-scrollbar {
                            -ms-overflow-style: none !important;
                            scrollbar-width: none !important;
                        }
                        @keyframes marqueeScroll {
                            0% { transform: translateX(100%); }
                            100% { transform: translateX(-100%); }
                        }
                    `}</style>
                    <div
                        style={{
                            display: 'inline-block',
                            paddingLeft: '100%',
                            animation: 'marqueeScroll 60s linear infinite',
                        }}
                    >
                        ✨ Selamat Datang di {clinicName || 'Klinik Kecantikan'} • Harap perhatikan nomor antrean fisik / struk Anda • Mohon siapkan kartu identitas saat menuju ke loket pendaftaran • Silakan menunggu panggilan nomor antrean Anda dengan tertib • Terima kasih atas kepercayaan Anda.
                    </div>
                </div>
            </footer>

            {/* ── MODAL GANTI & SIMPAN VIDEO ── */}
            {showVideoModal && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100vw',
                        height: '100vh',
                        background: 'rgba(0, 0, 0, 0.75)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9999,
                    }}
                >
                    <div
                        style={{
                            background: '#1e293b',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '20px',
                            padding: '24px 28px',
                            maxWidth: '560px',
                            width: '92%',
                            maxHeight: '90vh',
                            overflowY: 'auto',
                            color: '#ffffff',
                            boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
                        }}
                        className="tv-hide-scrollbar"
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '24px' }}>🎬</span>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
                                        Pengaturan & Simpan Video Display TV
                                    </h3>
                                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                                        Video yang disimpan akan otomatis tersimpan permanen di TV ini.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowVideoModal(false)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#94a3b8',
                                    fontSize: '20px',
                                    cursor: 'pointer',
                                    padding: '4px 8px',
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Opsi 1: Upload & Simpan File Video Lokal */}
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                border: '2px dashed #10b981',
                                borderRadius: '14px',
                                padding: '14px',
                                textAlign: 'center',
                                background: 'rgba(16, 185, 129, 0.08)',
                                cursor: 'pointer',
                                marginBottom: '18px',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            <div style={{ fontSize: '26px', marginBottom: '4px' }}>📁</div>
                            <div style={{ fontWeight: 700, fontSize: '14px', color: '#34d399' }}>
                                Klik untuk Upload & Simpan Video Lokal (.mp4, .webm)
                            </div>
                            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>
                                Video akan disimpan permanen di TV ini dan otomatis masuk daftar tersimpan
                            </div>
                        </div>

                        {/* Form Tambah & Simpan Link YouTube */}
                        <div
                            style={{
                                background: 'rgba(15, 23, 42, 0.6)',
                                border: '1px solid rgba(56, 189, 248, 0.25)',
                                borderRadius: '14px',
                                padding: '16px',
                                marginBottom: '18px',
                            }}
                        >
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>➕</span>
                                <span>Tambah & Simpan Link Video YouTube Baru:</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div>
                                    <label style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                                        Judul / Keterangan Video (Opsional):
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Misal: Video Promosi Klinik Terbaru"
                                        value={customVideoTitle}
                                        onChange={(e) => setCustomVideoTitle(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '9px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid rgba(255, 255, 255, 0.15)',
                                            background: 'rgba(0, 0, 0, 0.3)',
                                            color: '#ffffff',
                                            fontSize: '12px',
                                            outline: 'none',
                                            boxSizing: 'border-box',
                                        }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                                        Link / URL YouTube:
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Contoh: https://www.youtube.com/watch?v=... atau https://youtu.be/..."
                                        value={customVideoUrl}
                                        onChange={(e) => setCustomVideoUrl(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '9px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid rgba(255, 255, 255, 0.15)',
                                            background: 'rgba(0, 0, 0, 0.3)',
                                            color: '#ffffff',
                                            fontSize: '12px',
                                            outline: 'none',
                                            boxSizing: 'border-box',
                                        }}
                                    />
                                </div>
                                <button
                                    onClick={handleSaveAndApplyCustomVideo}
                                    disabled={!customVideoUrl.trim()}
                                    style={{
                                        padding: '10px 16px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: customVideoUrl.trim()
                                            ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                                            : '#334155',
                                        color: '#ffffff',
                                        cursor: customVideoUrl.trim() ? 'pointer' : 'not-allowed',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px',
                                        boxShadow: customVideoUrl.trim() ? '0 4px 14px rgba(16, 185, 129, 0.35)' : 'none',
                                        transition: 'all 0.2s ease',
                                    }}
                                >
                                    <span>💾</span>
                                    <span>Simpan & Putar Video YouTube</span>
                                </button>
                            </div>
                        </div>

                        {/* Daftar Video Tersimpan / Preset */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8' }}>
                                    DAFTAR VIDEO TERSIMPAN ({videoPresets.length}):
                                </label>
                                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                    Klik untuk langsung memutar
                                </span>
                            </div>
                            {videoPresets.length === 0 ? (
                                <div
                                    style={{
                                        padding: '24px 16px',
                                        textAlign: 'center',
                                        color: '#94a3b8',
                                        fontSize: '13px',
                                        background: 'rgba(255, 255, 255, 0.03)',
                                        border: '1px dashed rgba(255, 255, 255, 0.1)',
                                        borderRadius: '12px',
                                    }}
                                >
                                    Belum ada video tersimpan. Masukkan link YouTube atau upload video lokal di atas untuk menambahkan video.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }} className="tv-hide-scrollbar">
                                    {videoPresets.map((preset) => (
                                        <div
                                            key={preset.id}
                                            style={{
                                                padding: '10px 14px',
                                                borderRadius: '10px',
                                                background: selectedVideo?.id === preset.id ? 'rgba(14, 165, 233, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                                                border: `1px solid ${selectedVideo?.id === preset.id ? '#0ea5e9' : 'rgba(255, 255, 255, 0.1)'}`,
                                                cursor: 'pointer',
                                                fontSize: '13px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                transition: 'all 0.2s ease',
                                            }}
                                            onClick={() => {
                                                handleSelectVideo(preset);
                                                setShowVideoModal(false);
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                                <span style={{ color: selectedVideo?.id === preset.id ? '#38bdf8' : '#94a3b8' }}>
                                                    {preset.type === 'mp4' ? '📁' : '▶'}
                                                </span>
                                                <span style={{ fontWeight: selectedVideo?.id === preset.id ? 700 : 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                                    {preset.title}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {selectedVideo?.id === preset.id && (
                                                    <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: '12px' }}>✓ Sedang Diputar</span>
                                                )}
                                                <button
                                                    onClick={(e) => handleDeletePreset(preset.id, e)}
                                                    title="Hapus video ini dari daftar tersimpan"
                                                    style={{
                                                        background: 'rgba(239, 68, 68, 0.15)',
                                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                                        color: '#f87171',
                                                        borderRadius: '6px',
                                                        padding: '4px 8px',
                                                        cursor: 'pointer',
                                                        fontSize: '12px',
                                                    }}
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Modal Action Buttons */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                            <button
                                onClick={() => setShowVideoModal(false)}
                                style={{
                                    padding: '8px 18px',
                                    borderRadius: '10px',
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                    background: 'rgba(255, 255, 255, 0.06)',
                                    color: '#cbd5e1',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                }}
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

