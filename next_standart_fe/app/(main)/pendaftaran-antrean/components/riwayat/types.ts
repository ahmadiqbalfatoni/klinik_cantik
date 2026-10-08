export interface LayananItem {
  nama: string;
  deskripsi?: string;
  qty: number;
  harga: number;
}

export interface ProdukItem {
  nama: string;
  qty: number;
  satuan?: string;
  harga: number;
}

export interface KunjunganRiwayat {
  id: string | number;
  noKunjungan: string;
  tanggal: string; // YYYY-MM-DD or ISO
  jamMulai?: string;
  jamSelesai?: string;
  jenis: 'konsultasi' | 'treatment';
  status: string; // e.g. 'Selesai'
  dokter?: string;
  ruangan?: string;
  petugas?: string;
  layanan: LayananItem;
  produk?: ProdukItem[];
  catatan?: string;
  resep?: string[];
  totalBayarKasir?: number;
  metodeBayar?: string;
  statusTransaksi?: string;
  konsultasiTerkaitId?: string | number;
  treatmentLanjutan?: KunjunganRiwayat;
  konsultasiSebelumnya?: KunjunganRiwayat;
}

export interface RiwayatFilterState {
  keyword: string;
  status: string; // 'semua' | 'selesai' | etc
  jenis: string; // 'semua' | 'konsultasi' | 'treatment'
  tanggalDari?: string;
  tanggalSampai?: string;
}
