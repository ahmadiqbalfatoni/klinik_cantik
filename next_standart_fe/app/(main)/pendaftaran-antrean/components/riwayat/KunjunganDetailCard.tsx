'use client';

import React, { useMemo } from 'react';
import { KunjunganRiwayat } from './types';
import { KonsultasiDetail } from './KonsultasiDetail';
import { TreatmentDetail } from './TreatmentDetail';
import { FileQuestion } from 'lucide-react';

interface KunjunganDetailCardProps {
  selectedKunjungan: KunjunganRiwayat | null;
  allRiwayat?: KunjunganRiwayat[];
}

export const KunjunganDetailCard: React.FC<KunjunganDetailCardProps> = ({
  selectedKunjungan,
  allRiwayat,
}) => {
  if (!selectedKunjungan) {
    return (
      <div className="h-full flex flex-column align-items-center justify-content-center p-6 text-center surface-card border-1 surface-border border-round-xl">
        <div className="w-16 h-16 border-round-circle bg-emerald-50 text-emerald-600 flex align-items-center justify-center mb-3">
          <FileQuestion size={32} />
        </div>
        <h3 className="text-base font-bold text-800 m-0 mb-1">
          Pilih Kunjungan
        </h3>
        <p className="text-xs text-500 m-0 max-w-sm">
          Pilih salah satu riwayat kunjungan di panel sebelah kiri untuk melihat rincian pemeriksaan, layanan, dan resep.
        </p>
      </div>
    );
  }

  // Jika kunjungan saat ini adalah konsultasi, cari treatment lanjutan pasangannya (noKunjungan sama, jenis treatment)
  const treatmentLanjutan = useMemo(() => {
    if (!selectedKunjungan || selectedKunjungan.jenis !== 'konsultasi') return undefined;
    if (selectedKunjungan.treatmentLanjutan) return selectedKunjungan.treatmentLanjutan;
    return allRiwayat?.find(
      (k) =>
        k.jenis === 'treatment' &&
        k.noKunjungan === selectedKunjungan.noKunjungan &&
        k.id !== selectedKunjungan.id
    );
  }, [selectedKunjungan, allRiwayat]);

  // Jika kunjungan saat ini adalah treatment, cari konsultasi pasangannya (noKunjungan sama, jenis konsultasi)
  const konsultasiSebelumnya = useMemo(() => {
    if (!selectedKunjungan || selectedKunjungan.jenis !== 'treatment') return undefined;
    if (selectedKunjungan.konsultasiSebelumnya) return selectedKunjungan.konsultasiSebelumnya;
    return allRiwayat?.find(
      (k) =>
        k.jenis === 'konsultasi' &&
        k.noKunjungan === selectedKunjungan.noKunjungan &&
        k.id !== selectedKunjungan.id
    );
  }, [selectedKunjungan, allRiwayat]);

  return (
    <div className="h-full w-full flex flex-column min-h-0 overflow-y-auto pr-1.5 custom-thin-scrollbar">
      <style>{`
        .custom-thin-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 transparent;
        }
        .custom-thin-scrollbar::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        .custom-thin-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-thin-scrollbar::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 9999px;
        }
        .custom-thin-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: #94a3b8;
        }
      `}</style>

      {/* JIKA KONSULTASI YANG DILANJUTKAN KE TREATMENT ATAU SEBALIKNYA */}
      {selectedKunjungan.jenis === 'konsultasi' && treatmentLanjutan ? (
        <div className="flex flex-column gap-3 pb-3">
          {/* 1. Riwayat Konsultasi */}
          <KonsultasiDetail kunjungan={selectedKunjungan} />
          {/* 2. Riwayat Treatment Ditaruh di Bawahnya Riwayat Konsul */}
          <div className="flex flex-column gap-2 pt-2 border-top-1 surface-border">
            <div className="flex align-items-center gap-2 px-1">
              <span
                className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 border-round-lg border-1"
                style={{
                  backgroundColor: '#ecfdf5',
                  color: '#059669',
                  borderColor: '#a7f3d0',
                }}
              >
                Tindakan / Treatment Lanjutan
              </span>
            </div>
            <TreatmentDetail kunjungan={treatmentLanjutan} />
          </div>
        </div>
      ) : selectedKunjungan.jenis === 'treatment' && konsultasiSebelumnya ? (
        <div className="flex flex-column gap-3 pb-3">
          {/* Tetap tampilkan Riwayat Konsul di atas, Riwayat Treatment di bawahnya */}
          <KonsultasiDetail kunjungan={konsultasiSebelumnya} />
          <div className="flex flex-column gap-2 pt-2 border-top-1 surface-border">
            <div className="flex align-items-center gap-2 px-1">
              <span
                className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 border-round-lg border-1"
                style={{
                  backgroundColor: '#ecfdf5',
                  color: '#059669',
                  borderColor: '#a7f3d0',
                }}
              >
                Tindakan / Treatment Lanjutan
              </span>
            </div>
            <TreatmentDetail kunjungan={selectedKunjungan} />
          </div>
        </div>
      ) : selectedKunjungan.jenis === 'konsultasi' ? (
        <KonsultasiDetail kunjungan={selectedKunjungan} />
      ) : (
        <TreatmentDetail kunjungan={selectedKunjungan} />
      )}
    </div>
  );
};
