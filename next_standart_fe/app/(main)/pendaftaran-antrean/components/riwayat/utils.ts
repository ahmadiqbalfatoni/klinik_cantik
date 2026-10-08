/**
 * Format mata uang Rupiah sesuai standar id-ID
 * Contoh: 250000 -> "Rp 250.000"
 */
export const formatRupiah = (val?: number): string => {
  if (val === undefined || val === null || isNaN(val)) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })
    .format(val)
    .replace(/\u00A0/g, ' ');
};

/**
 * Format tanggal panjang Indonesia
 * Contoh: "2026-10-08" -> "08 Oktober 2026"
 */
export const formatTanggalIndo = (dateStr?: string): string => {
  if (!dateStr) return '-';
  try {
    const cleanStr = typeof dateStr === 'string' ? dateStr.split('T')[0] : '';
    const parts = cleanStr.split('-');
    if (parts.length === 3) {
      const months = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
      ];
      const mIdx = parseInt(parts[1], 10) - 1;
      return `${parts[2].padStart(2, '0')} ${months[mIdx] || parts[1]} ${parts[0]}`;
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const months = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
      ];
      return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
    }
    return String(dateStr);
  } catch {
    return String(dateStr || '-');
  }
};

/**
 * Mengambil bagian tanggal untuk kotak tanggal pada list card
 * Contoh: { day: "08", monthYear: "Okt 2026" }
 */
export const getTanggalBoxParts = (dateStr?: string): { day: string; monthYear: string } => {
  if (!dateStr) return { day: '08', monthYear: 'Okt 2026' };
  try {
    const monthsShort = [
      'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
      'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
    ];
    const cleanStr = typeof dateStr === 'string' ? dateStr.split('T')[0] : '';
    const parts = cleanStr.split('-');
    if (parts.length === 3) {
      const mIdx = parseInt(parts[1], 10) - 1;
      return {
        day: parts[2].padStart(2, '0'),
        monthYear: `${monthsShort[mIdx] || parts[1]} ${parts[0]}`,
      };
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const monthYear = `${monthsShort[d.getMonth()]} ${d.getFullYear()}`;
      return { day, monthYear };
    }
    return { day: '08', monthYear: 'Okt 2026' };
  } catch {
    return { day: '08', monthYear: 'Okt 2026' };
  }
};
