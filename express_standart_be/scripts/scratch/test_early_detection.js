import 'dotenv/config';
import DB from '../../core/config/knex.js';
import { SignJWT } from 'jose';

async function testEarlyDetection() {
  console.log('================================================================');
  console.log('  TEST DETEKSI DINI STATUS RUANGAN & REAL-TIME ESTIMASI PANEL   ');
  console.log('================================================================\n');

  try {
    const user = await DB('user_credential').first();
    const secretKey = new TextEncoder().encode(process.env.USER_SECRET || "random");
    const token = await new SignJWT({
      user_code: user.user_code,
      username: user.username,
      role: user.role,
      kode_cabang: user.kode_cabang || 'CBG-001',
      nama_cabang: user.nama_cabang || 'Kantor Pusat',
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(secretKey);

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'timestamp': new Date().toISOString(),
      'x-timestamp': new Date().toISOString(),
    };

    const res = await fetch('http://127.0.0.1:8000/api/v1/master/pendaftaran-pasien-layanan-options', {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });

    const json = await res.json();
    console.log('Response Status:', json.status);
    console.log('Response Message:', json.message);

    const ruanganLayanan = json.data?.ruangan_layanan || [];
    console.log(`\nTotal Ruangan Ditemukan: ${ruanganLayanan.length}\n`);

    ruanganLayanan.forEach((r) => {
      console.log(`[RUANGAN] ${r.nama_ruangan} (${r.kode_ruangan})`);
      console.log(`  - Status Kapasitas : ${r.status_kapasitas} [Badge: ${r.status_badge}, Color: ${r.badge_color}]`);
      console.log(`  - Slack Menit      : ${r.slack_menit !== null ? r.slack_menit + ' menit' : '(Tidak ada booking)'}`);
      console.log(`  - Keterangan       : ${r.keterangan_status}`);
      console.log(`  - Antrean Aktif    : ${r.antrean_aktif_count}`);
      console.log(`  - Sisa Beban Menit : ${r.sisa_beban_menit}m`);
      console.log(`  - Booking Terdekat : ${r.jam_booking_terdekat ? r.jam_booking_terdekat + ' (' + (r.nama_pasien_booking_terdekat || '') + ')' : '-'}`);
      console.log('----------------------------------------------------------------');
    });

    const allHaveStatus = ruanganLayanan.length > 0 && ruanganLayanan.every(
      (r) => r.status_kapasitas && r.status_badge && r.badge_color && r.keterangan_status !== undefined
    );

    console.log(`\nHASIL PENGECEKAN FIELD DETEKSI DINI: ${allHaveStatus ? '✅ SEMUA SESUAI (PASS)' : '❌ ADA FIELD KOSONG (FAIL)'}`);

  } catch (err) {
    console.error('Test error:', err);
  } finally {
    process.exit(0);
  }
}

testEarlyDetection();
