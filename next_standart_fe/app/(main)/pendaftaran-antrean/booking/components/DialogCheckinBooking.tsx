'use client';

import React, { useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import postData from '@/lib/axios/postData';
import { showError, showSuccess } from '@/lib/tools/generalTools';
import { Toast } from 'primereact/toast';
import {
  CheckCircle2,
  User,
  Calendar,
  MapPin,
  Sparkles,
  Stethoscope,
} from 'lucide-react';

interface BookingItem {
  kode_booking: string;
  no_rm: string;
  nama_pasien: string;
  no_hp_pasien?: string;
  jenis_layanan: string;
  kode_layanan: string;
  nama_layanan: string;
  kode_ruangan?: string;
  nama_ruangan?: string;
  nama_petugas?: string;
  jabatan_petugas?: string;
  tanggal_booking: string;
  jam_booking: string;
  dp_nominal: number;
  dp_status: string;
  butuh_konsul?: number | boolean;
}

interface Props {
  visible: boolean;
  booking: BookingItem | null;
  toast: React.RefObject<Toast>;
  onHide: () => void;
  onSuccess: (result: any) => void;
}

export const DialogCheckinBooking: React.FC<Props> = ({
  visible,
  booking,
  toast,
  onHide,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);

  if (!booking) return null;

  const handleCheckin = async () => {
    setLoading(true);
    try {
      const res = await postData('/transaksi/booking/checkin', {
        kode_booking: booking.kode_booking,
      });

      if (res.data?.status === 200 || res.data?.status === '200' || res.status === 200) {
        showSuccess(toast, res.data?.message || 'Check-in berhasil!');
        onSuccess(res.data?.data);
        onHide();
      } else {
        showError(toast, res.data?.message || 'Gagal melakukan check-in');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err.message || 'Terjadi kesalahan sistem';
      showError(toast, msg);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val || 0);
  };

  return (
    <Dialog
      header={
        <div className="flex align-items-center gap-2">
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: '#dcfce7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <CheckCircle2 size={16} className="text-emerald-600" />
          </div>
          <span className="font-bold text-base text-slate-900">Konfirmasi Check-in Booking</span>
        </div>
      }
      visible={visible}
      style={{ width: '430px', maxWidth: '92vw', borderRadius: '16px' }}
      contentStyle={{ padding: '8px 16px 12px' }}
      onHide={onHide}
      footer={
        <div className="flex justify-content-end gap-2 pt-1 pb-1">
          <Button
            label="Batal"
            icon="pi pi-times"
            className="p-button-outlined p-button-secondary text-xs font-semibold"
            style={{
              borderRadius: '8px',
              padding: '6px 14px',
            }}
            onClick={onHide}
            disabled={loading}
          />
          <Button
            label="Proses Check-in"
            icon="pi pi-check"
            className="text-xs font-bold shadow-1"
            style={{
              background: '#0C8F62',
              borderColor: '#0C8F62',
              color: '#ffffff',
              borderRadius: '8px',
              padding: '6px 16px',
            }}
            onClick={handleCheckin}
            loading={loading}
          />
        </div>
      }
    >
      <div className="flex flex-column" style={{ gap: '10px' }}>
        {/* 1. HERO CARD KODE RESERVASI */}
        <div
          className="p-2 text-center flex flex-column align-items-center justify-content-center"
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            gap: '2px',
          }}
        >
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            KODE RESERVASI
          </span>
          <span className="text-xl font-black tracking-tight" style={{ color: '#0C8F62' }}>
            {booking.kode_booking}
          </span>
        </div>

        {/* 2. COMBINED SECTION CARD: PASIEN & LAYANAN + TANGGAL & RUANGAN */}
        <div
          className="bg-white border-1 surface-border shadow-xs flex flex-column"
          style={{
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
          }}
        >
          {/* Baris Atas: Pasien & Layanan */}
          <div
            className="grid m-0"
            style={{
              padding: '8px 10px',
            }}
          >
            {/* Pasien */}
            <div className="col-12 sm:col-6 p-1.5 flex flex-column" style={{ gap: '3px' }}>
              <div className="flex align-items-center" style={{ gap: '6px' }}>
                <div style={{ width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <User size={14} className="text-slate-500" />
                </div>
                <span className="text-[11px] text-slate-500 font-medium">Pasien</span>
              </div>
              <div style={{ paddingLeft: '22px' }}>
                <div className="font-bold text-xs text-slate-900 leading-tight">{booking.nama_pasien || '-'}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">No. RM: {booking.no_rm || '-'}</div>
              </div>
            </div>

            {/* Layanan */}
            <div className="col-12 sm:col-6 p-1.5 flex flex-column" style={{ gap: '3px' }}>
              <div className="flex align-items-center" style={{ gap: '6px' }}>
                <div style={{ width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Sparkles size={14} className="text-slate-500" />
                </div>
                <span className="text-[11px] text-slate-500 font-medium">Layanan</span>
              </div>
              <div style={{ paddingLeft: '22px' }}>
                <div className="font-bold text-xs text-slate-900 leading-tight">{booking.nama_layanan || '-'}</div>
                <div className="mt-1" style={{ display: 'flex' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: booking.jenis_layanan === 'paket' ? '#d97706' : '#2563eb',
                      color: '#ffffff',
                      borderRadius: '6px',
                      fontSize: '10.5px',
                      fontWeight: 700,
                      lineHeight: 1.2,
                      padding: '2.5px 12px',
                      whiteSpace: 'nowrap',
                      boxSizing: 'border-box',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {booking.jenis_layanan === 'paket' ? 'Paket Layanan' : 'Layanan'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Garis Pemisah Horizontal Tipis */}
          <div style={{ borderTop: '1px solid #f1f5f9', width: '100%' }} />

          {/* Baris Bawah: Tanggal & Ruangan */}
          <div
            className="grid m-0"
            style={{
              padding: '8px 10px',
            }}
          >
            {/* Tanggal & Jam */}
            <div className="col-12 sm:col-6 p-1.5 flex flex-column" style={{ gap: '3px' }}>
              <div className="flex align-items-center" style={{ gap: '6px' }}>
                <div style={{ width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Calendar size={14} className="text-slate-500" />
                </div>
                <span className="text-[11px] text-slate-500 font-medium">Tanggal & Jam</span>
              </div>
              <div style={{ paddingLeft: '22px' }}>
                <div className="font-bold text-xs text-slate-900 leading-tight">{booking.tanggal_booking || '-'}</div>
                <div className="text-[11px] text-slate-500 mt-0.5 font-medium">{booking.jam_booking ? `${booking.jam_booking} WIB` : '-'}</div>
              </div>
            </div>

            {/* Ruangan Tujuan */}
            <div className="col-12 sm:col-6 p-1.5 flex flex-column" style={{ gap: '3px' }}>
              <div className="flex align-items-center" style={{ gap: '6px' }}>
                <div style={{ width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MapPin size={14} className="text-slate-500" />
                </div>
                <span className="text-[11px] text-slate-500 font-medium">Ruangan Tujuan</span>
              </div>
              <div style={{ paddingLeft: '22px' }}>
                <div className="font-bold text-xs text-slate-900 leading-tight">{booking.nama_ruangan || 'Ruang Treatment'}</div>
                <div className="text-[11px] text-slate-500 mt-0.5 leading-normal" style={{ wordBreak: 'break-word' }}>
                  Petugas: {booking.nama_petugas || '-'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. SECTION DP CARD MENONJOL */}
        <div
          style={{
            background: '#f0fdf4',
            border: '1.5px solid #86efac',
            borderRadius: '12px',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            boxSizing: 'border-box',
          }}
        >
          <div className="flex justify-content-between align-items-center">
            <span className="text-xs font-bold text-slate-800">Uang Muka (DP)</span>
            <span className="font-extrabold text-sm text-emerald-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatCurrency(booking.dp_nominal || 0)}
            </span>
          </div>

          <div className="flex justify-content-between align-items-center">
            <span className="text-xs font-bold text-slate-800">Status Pembayaran DP</span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: booking.dp_status === 'sudah_bayar'
                  ? '#059669'
                  : (booking.dp_status === 'belum_bayar' ? '#d97706' : '#dc2626'),
                color: '#ffffff',
                borderRadius: '9999px',
                fontSize: '10.5px',
                fontWeight: 800,
                letterSpacing: '0.04em',
                padding: '3px 12px',
                whiteSpace: 'nowrap',
                boxSizing: 'border-box',
                lineHeight: 1.2,
              }}
            >
              {(booking.dp_status || 'belum_bayar').replace(/_/g, ' ').toUpperCase()}
            </span>
          </div>

          {booking.dp_status === 'sudah_bayar' && (
            <>
              <div style={{ borderTop: '1px dashed #86efac', margin: '2px 0 0 0' }} />
              <div className="flex align-items-start text-[11px] font-medium" style={{ color: '#15803d', gap: '8px', paddingTop: '2px' }}>
                <CheckCircle2 size={14} style={{ color: '#16a34a', flexShrink: 0, marginTop: '2px' }} />
                <span style={{ lineHeight: '1.45', flex: 1 }}>
                  DP akan otomatis dicatat sebagai potongan tagihan saat pembayaran di Kasir.
                </span>
              </div>
            </>
          )}
        </div>

        {/* 4. NOTICE KONSULTASI DOKTER (JIKA butuh_konsul) */}
        {Boolean(booking.butuh_konsul) && (
          <div
            className="border-round-lg border-1 text-[11px] flex align-items-start gap-2"
            style={{
              background: '#eef2ff',
              border: '1px solid #c7d2fe',
              color: '#312e81',
              padding: '8px 12px',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: '#e0e7ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: '1px',
              }}
            >
              <Stethoscope size={13} className="text-indigo-600" />
            </div>
            <div className="leading-snug" style={{ flex: 1 }}>
              <span className="font-bold text-indigo-950">Alur Konsultasi Dokter Aktif:</span> Pasien akan diterbitkan antrean ke <strong>Ruang Konsultasi Dokter</strong> terlebih dahulu. Pastikan dokter jaga di Ruang Konsultasi sudah bertugas atau segera hadir sebelum mengarahkan pasien ke ruang tunggu dokter.
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
};

