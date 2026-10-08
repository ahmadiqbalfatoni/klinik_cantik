'use client';

import React from 'react';
import { KunjunganRiwayat } from './types';
import { formatRupiah, formatTanggalIndo } from './utils';
import {
  User,
  FileText,
  Pill,
} from 'lucide-react';

interface KonsultasiDetailProps {
  kunjungan: KunjunganRiwayat;
  isSubCard?: boolean; // Bila ditampilkan di atas Treatment
}

export const KonsultasiDetail: React.FC<KonsultasiDetailProps> = ({
  kunjungan,
  isSubCard = false,
}) => {
  if (!kunjungan) return null;

  const jamText =
    kunjungan.jamMulai && kunjungan.jamSelesai
      ? `${kunjungan.jamMulai} - ${kunjungan.jamSelesai}`
      : kunjungan.jamMulai || '10:15 - 11:05';

  const hasCatatan = Boolean(
    kunjungan.catatan &&
    kunjungan.catatan.trim() !== '' &&
    kunjungan.catatan.trim() !== '-'
  );

  const hasResep = Boolean(
    Array.isArray(kunjungan.resep) &&
    kunjungan.resep.length > 0 &&
    kunjungan.resep.some(
      (r) =>
        r &&
        (typeof r === 'string'
          ? r.trim() !== '' && r.trim() !== '-' && !r.toLowerCase().includes('tidak ada')
          : true)
    )
  );

  const namaLayanan = kunjungan.layanan?.nama || 'Konsultasi Dokter Estetika';
  const deskripsiLayanan =
    kunjungan.layanan?.deskripsi ||
    'Konsultasi kondisi kulit, saran perawatan, dan rekomendasi program perawatan.';
  const hargaLayanan =
    kunjungan.totalBayarKasir !== undefined && kunjungan.totalBayarKasir !== null
      ? kunjungan.totalBayarKasir
      : kunjungan.layanan?.harga !== undefined && kunjungan.layanan?.harga !== null
      ? kunjungan.layanan.harga
      : 250000;

  return (
    <div className="w-full flex flex-column">
      {/* 1. TOP CARD: HEADER DENGAN USER BADGE + 3x2 GRID (Persis Referensi Gambar 2) */}
      <div
        className="w-full bg-white border-round-xl overflow-hidden"
        style={{
          border: '1px solid #e2e8f0',
        }}
      >
        {/* HEADER BAR HIJAU PASTEL */}
        <div
          className="flex align-items-center justify-content-between px-3 py-2.5 sm:px-4 sm:py-3"
          style={{
            backgroundColor: '#f0fdf4',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          <div className="flex align-items-center gap-2.5">
            <div
              className="flex-shrink-0 flex align-items-center justify-content-center"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '9999px',
                backgroundColor: '#ccfbf1',
                color: '#0f766e',
              }}
            >
              <User size={19} strokeWidth={2.2} />
            </div>
            <h3
              className="m-0 font-bold leading-tight"
              style={{ color: '#0f2942', fontSize: '0.95rem' }}
            >
              Detail Kunjungan Konsultasi
            </h3>
          </div>

          <span
            className="font-semibold"
            style={{
              backgroundColor: '#dcfce7',
              color: '#15803d',
              fontSize: '0.72rem',
              padding: '3px 12px',
              borderRadius: '9999px',
              lineHeight: 1.2,
            }}
          >
            {kunjungan.status || 'Selesai'}
          </span>
        </div>

        {/* 3 KOLOM X 2 BARIS GRID DENGAN PEMBATAS VERTIKAL */}
        <div className="p-3 sm:p-4">
          <div className="grid formgrid m-0">
            {/* KOLOM 1: NO KUNJUNGAN & DOKTER / PJ */}
            <div
              className="col-12 md:col-4 p-2 sm:p-3"
              style={{
                borderRight: '1px solid #f1f5f9',
              }}
            >
              <div className="mb-3">
                <span
                  className="block font-medium mb-1"
                  style={{ color: '#64748b', fontSize: '0.75rem' }}
                >
                  No. Kunjungan
                </span>
                <span
                  className="block font-bold"
                  style={{ color: '#0f2942', fontSize: '0.875rem' }}
                >
                  {kunjungan.noKunjungan}
                </span>
              </div>
              <div>
                <span
                  className="block font-medium mb-1"
                  style={{ color: '#64748b', fontSize: '0.75rem' }}
                >
                  Dokter / PJ
                </span>
                <span
                  className="block font-semibold"
                  style={{ color: '#0f2942', fontSize: '0.875rem' }}
                >
                  {kunjungan.dokter || 'dr. Sari Wulandari'}
                </span>
              </div>
            </div>

            {/* KOLOM 2: TANGGAL KUNJUNGAN & RUANGAN */}
            <div
              className="col-12 md:col-4 p-2 sm:p-3"
              style={{
                borderRight: '1px solid #f1f5f9',
              }}
            >
              <div className="mb-3">
                <span
                  className="block font-medium mb-1"
                  style={{ color: '#64748b', fontSize: '0.75rem' }}
                >
                  Tanggal Kunjungan
                </span>
                <span
                  className="block font-bold"
                  style={{ color: '#0f2942', fontSize: '0.875rem' }}
                >
                  {formatTanggalIndo(kunjungan.tanggal)}
                </span>
              </div>
              <div>
                <span
                  className="block font-medium mb-1"
                  style={{ color: '#64748b', fontSize: '0.75rem' }}
                >
                  Ruangan
                </span>
                <span
                  className="block font-semibold"
                  style={{ color: '#0f2942', fontSize: '0.875rem' }}
                >
                  {kunjungan.ruangan || 'Ruang Facial'}
                </span>
              </div>
            </div>

            {/* KOLOM 3: JAM & PETUGAS PENDAMPING */}
            <div className="col-12 md:col-4 p-2 sm:p-3">
              <div className="mb-3">
                <span
                  className="block font-medium mb-1"
                  style={{ color: '#64748b', fontSize: '0.75rem' }}
                >
                  Jam
                </span>
                <span
                  className="block font-bold"
                  style={{ color: '#0f2942', fontSize: '0.875rem' }}
                >
                  {jamText}
                </span>
              </div>
              <div>
                <span
                  className="block font-medium mb-1"
                  style={{ color: '#64748b', fontSize: '0.75rem' }}
                >
                  Petugas Pendamping
                </span>
                <span
                  className="block font-semibold"
                  style={{ color: '#0f2942', fontSize: '0.875rem' }}
                >
                  {kunjungan.petugas || 'Nina Ayu'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. CARD KEDUA: DETAIL LAYANAN (Persis Referensi Gambar 2) */}
      <div
        className="w-full bg-white border-round-xl p-3 sm:p-4 mt-3"
        style={{ border: '1px solid #e2e8f0' }}
      >
        <div className="flex align-items-center gap-2 mb-3">
          <FileText size={17} strokeWidth={2.2} style={{ color: '#0f2942' }} />
          <h4
            className="m-0 font-bold"
            style={{ color: '#0f2942', fontSize: '0.875rem' }}
          >
            Detail Layanan
          </h4>
        </div>

        {/* INNER BOX CONTAINER */}
        <div
          className="p-3 border-round-xl flex flex-column sm:flex-row align-items-start sm:align-items-center justify-content-between gap-3 bg-white"
          style={{ border: '1px solid #e2e8f0' }}
        >
          {/* SISI KIRI: ICON BOX BIRU MUDA + NAMA LAYANAN + DESKRIPSI */}
          <div className="flex align-items-center gap-3 flex-1 min-w-0">
            <div
              className="flex-shrink-0 flex align-items-center justify-content-center border-round-xl"
              style={{
                width: '46px',
                height: '46px',
                backgroundColor: '#f0f9ff',
                color: '#0284c7',
              }}
            >
              <User size={22} strokeWidth={2.2} />
            </div>
            <div className="min-w-0 pr-2">
              <span
                className="block font-bold truncate mb-1"
                style={{ color: '#0f2942', fontSize: '0.85rem' }}
              >
                {namaLayanan}
              </span>
              <p
                className="m-0 line-height-2"
                style={{ color: '#64748b', fontSize: '0.75rem' }}
              >
                {deskripsiLayanan}
              </p>
            </div>
          </div>

          {/* SISI KANAN: TINDAKAN & HARGA */}
          <div className="flex align-items-center gap-5 sm:gap-6 flex-shrink-0 pt-2 sm:pt-0 border-top-1 sm:border-top-none surface-border sm:border-none w-full sm:w-auto justify-content-between sm:justify-content-end">
            <div>
              <span
                className="block font-medium"
                style={{ color: '#64748b', fontSize: '0.75rem' }}
              >
                Tindakan
              </span>
              <span
                className="block font-semibold mt-1"
                style={{ color: '#0f2942', fontSize: '0.875rem' }}
              >
                {kunjungan.layanan?.qty || 1}
              </span>
            </div>
            <div className="text-right sm:text-left min-w-6rem">
              <span
                className="block font-medium"
                style={{ color: '#64748b', fontSize: '0.75rem' }}
              >
                Harga
              </span>
              <span
                className="block font-bold mt-1"
                style={{ color: '#0f2942', fontSize: '0.875rem' }}
              >
                {formatRupiah(hargaLayanan)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. CARD KETIGA: CATATAN / HASIL PEMERIKSAAN (Persis Referensi Gambar 2) */}
      <div
        className="w-full bg-white border-round-xl p-3 sm:p-4 mt-3"
        style={{ border: '1px solid #e2e8f0' }}
      >
        <div className="flex align-items-center gap-2 mb-2.5">
          <FileText size={17} strokeWidth={2.2} style={{ color: '#0f2942' }} />
          <h4
            className="m-0 font-bold"
            style={{ color: '#0f2942', fontSize: '0.875rem' }}
          >
            Catatan / Hasil Pemeriksaan
          </h4>
        </div>
        <p
          className="m-0 line-height-3"
          style={{ color: '#475569', fontSize: '0.8rem' }}
        >
          {hasCatatan
            ? kunjungan.catatan
            : 'Pasien datang dengan keluhan kulit wajah kusam dan berjerawat ringan. Dokter memberikan saran perawatan facial dan skincare routine di rumah.'}
        </p>
      </div>

      {/* 4. CARD KEEMPAT: RESEP / OBAT (Persis Referensi Gambar 2) */}
      <div
        className="w-full bg-white border-round-xl p-3 sm:p-4 mt-3"
        style={{ border: '1px solid #e2e8f0' }}
      >
        <div className="flex align-items-center gap-2 mb-2.5">
          <Pill size={17} strokeWidth={2.2} style={{ color: '#0f2942' }} />
          <h4
            className="m-0 font-bold"
            style={{ color: '#0f2942', fontSize: '0.875rem' }}
          >
            Resep / Obat
          </h4>
        </div>
        {hasResep ? (
          <ul className="m-0 p-0 list-none flex flex-column gap-1.5">
            {kunjungan.resep!.map((item, idx) => {
              const text =
                typeof item === 'string'
                  ? item
                  : (item as any)?.nama_obat || (item as any)?.nama_produk || String(item);
              return (
                <li
                  key={idx}
                  className="flex align-items-center gap-2"
                  style={{ color: '#475569', fontSize: '0.8rem' }}
                >
                  <span
                    className="w-1.5 h-1.5 border-circle inline-block flex-shrink-0"
                    style={{ backgroundColor: '#10b981' }}
                  />
                  <span>{text}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p
            className="m-0"
            style={{ color: '#475569', fontSize: '0.8rem' }}
          >
            - Tidak ada resep obat
          </p>
        )}
      </div>
    </div>
  );
};
