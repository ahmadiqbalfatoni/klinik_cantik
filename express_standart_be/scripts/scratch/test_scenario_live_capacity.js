import 'dotenv/config';
import DB from '../../core/config/knex.js';
import { SignJWT } from 'jose';

async function testScenarioLiveCapacity() {
  console.log('================================================================');
  console.log('  TEST SKENARIO DETEKSI DINI: 🟢 AMAN -> 🟡 WASPADA -> 🔴 BERISIKO');
  console.log('================================================================\n');

  const todayStr = new Date().toISOString().slice(0, 10);
  const testRoom = 'RNG-002'; // Ruang B
  const testKodeBooking = 'BKG-TEST-EARLY-01';
  const testKodeAntrian1 = 'ANT-TEST-E1';
  const testKodeAntrian2 = 'ANT-TEST-E2';

  try {
    const user = await DB('user_credential').first();
    const secretKey = new TextEncoder().encode(process.env.USER_SECRET || 'random');
    const token = await new SignJWT({
      user_code: user.user_code,
      username: user.username,
      role: user.role,
      kode_cabang: user.kode_cabang || 'CBG-001',
      nama_cabang: user.nama_cabang || 'Kantor Pusat',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(secretKey);

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'timestamp': new Date().toISOString(),
      'x-timestamp': new Date().toISOString(),
    };

    const fetchRoom = async () => {
      headers['timestamp'] = new Date().toISOString();
      const res = await fetch('http://127.0.0.1:8000/api/v1/master/pendaftaran-pasien-layanan-options', {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });
      const json = await res.json();
      const rooms = json.data?.ruangan_layanan || [];
      return rooms.find((r) => r.kode_ruangan === testRoom);
    };

    // Bersihkan data lama jika ada
    await DB('trx_detail_antrian_layanan').whereIn('kode_antrian_layanan', [testKodeAntrian1, testKodeAntrian2]).del();
    await DB('trx_antrian_layanan').whereIn('kode_antrian_layanan', [testKodeAntrian1, testKodeAntrian2]).del();
    await DB('trx_detail_booking').where('kode_booking', testKodeBooking).del();
    await DB('trx_booking').where('kode_booking', testKodeBooking).del();

    const pasien = await DB('mst_pasien').where('status', 'aktif').first();
    let sch = await DB('mst_jadwal_karyawan').where('kode_ruangan', testRoom).where('status', 'aktif').first();
    if (!sch) {
      sch = await DB('mst_jadwal_karyawan').where('status', 'aktif').first();
    }
    const kodeJadwal = sch?.kode_jadwal || 'JAD-001';

    // 1. Buat booking terkonfirmasi jam 13:00
    await DB('trx_booking').insert({
      kode_booking: testKodeBooking,
      kode_jadwal: kodeJadwal,
      no_rm: pasien.no_rm,
      tanggal_booking: todayStr,
      jam_booking: '13:00:00',
      status: 'dikonfirmasi',
      kode_ruangan: testRoom,
      kode_cabang: 'CBG-001',
      created_at: DB.fn.now(),
      updated_at: DB.fn.now(),
    });
    await DB('trx_detail_booking').insert({
      kode_detail_booking: 'DET-BKG-TEST-01',
      kode_booking: testKodeBooking,
      kode_layanan: 'LAY-001',
      nama_layanan: 'Test Treatment 60m',
      durasi_menit: 60,
      harga: 100000,
      created_at: DB.fn.now(),
    });

    // TEST STATE 1: Ruangan kosong (slack > 60 menit -> 🟢 AMAN)
    const roomState1 = await fetchRoom();
    console.log('[STATE 1 - Ruangan Kosong + Booking 13:00]');
    console.log(`  Status: ${roomState1.status_kapasitas} | Badge: ${roomState1.status_badge} | Slack: ${roomState1.slack_menit}m`);
    console.log(`  Keterangan: ${roomState1.keterangan_status}`);
    const isPass1 = roomState1.status_kapasitas === 'aman' && roomState1.badge_color === 'green';
    console.log(`  Result: ${isPass1 ? '✅ PASS (Aman)' : '❌ FAIL'}\n`);

    // TEST STATE 2: Tambah antrean aktif berdurasi sehingga slack tinggal 15-60 menit -> 🟡 WASPADA
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const bookingMinutes = 13 * 60;
    const diff = bookingMinutes - nowMinutes; // misal 140 min
    const durasiWaspada = Math.max(diff - 40 - 15, 30); // buat sisa slack sekitar 40m (15..60)

    await DB('trx_antrian_layanan').insert({
      kode_antrian_layanan: testKodeAntrian1,
      kode_kunjungan: 'KNJ-TEST-E1',
      nomor_antrian: 'B-01',
      kode_ruangan: testRoom,
      status: 'menunggu',
      kode_cabang: 'CBG-001',
      created_at: DB.fn.now(),
      updated_at: DB.fn.now(),
    });
    await DB('trx_detail_antrian_layanan').insert({
      kode_detail_antrian_layanan: 'DET-ANT-TEST-01',
      kode_kunjungan: 'KNJ-TEST-E1',
      kode_antrian_layanan: testKodeAntrian1,
      jenis_layanan: 'layanan',
      kode_layanan: 'LAY-001',
      nama_layanan: 'Test Treatment Antrian 1',
      durasi_menit: durasiWaspada,
      harga: 100000,
      created_at: DB.fn.now(),
    });

    const roomState2 = await fetchRoom();
    console.log('[STATE 2 - Antrean Menumpuk Sedang -> Slack 15..60m]');
    console.log(`  Status: ${roomState2.status_kapasitas} | Badge: ${roomState2.status_badge} | Slack: ${roomState2.slack_menit}m`);
    console.log(`  Keterangan: ${roomState2.keterangan_status}`);
    const isPass2 = roomState2.status_kapasitas === 'waspada' && roomState2.badge_color === 'yellow';
    console.log(`  Result: ${isPass2 ? '✅ PASS (Waspada)' : '❌ FAIL'}\n`);

    // TEST STATE 3: Tambah antrean antrian ke-2 sehingga total beban waktu membuat slack <= 15m (🔴 BERISIKO PENUH)
    const durasiTambahan = Math.max(diff - 5 - durasiWaspada - 15, 30);
    await DB('trx_antrian_layanan').insert({
      kode_antrian_layanan: testKodeAntrian2,
      kode_kunjungan: 'KNJ-TEST-E2',
      nomor_antrian: 'B-02',
      kode_ruangan: testRoom,
      status: 'menunggu',
      kode_cabang: 'CBG-001',
      created_at: DB.fn.now(),
      updated_at: DB.fn.now(),
    });
    await DB('trx_detail_antrian_layanan').insert({
      kode_detail_antrian_layanan: 'DET-ANT-TEST-02',
      kode_kunjungan: 'KNJ-TEST-E2',
      kode_antrian_layanan: testKodeAntrian2,
      jenis_layanan: 'layanan',
      kode_layanan: 'LAY-001',
      nama_layanan: 'Test Treatment Antrian 2',
      durasi_menit: durasiTambahan,
      harga: 100000,
      created_at: DB.fn.now(),
    });

    const roomState3 = await fetchRoom();
    console.log('[STATE 3 - Antrean Padat Menjelang Booking -> Slack <= 15m]');
    console.log(`  Status: ${roomState3.status_kapasitas} | Badge: ${roomState3.status_badge} | Slack: ${roomState3.slack_menit}m`);
    console.log(`  Keterangan: ${roomState3.keterangan_status}`);
    const isPass3 = roomState3.status_kapasitas === 'berisiko' && roomState3.badge_color === 'red';
    console.log(`  Result: ${isPass3 ? '✅ PASS (Berisiko Penuh)' : '❌ FAIL'}\n`);

    // Cleanup
    await DB('trx_detail_antrian_layanan').whereIn('kode_antrian_layanan', [testKodeAntrian1, testKodeAntrian2]).del();
    await DB('trx_antrian_layanan').whereIn('kode_antrian_layanan', [testKodeAntrian1, testKodeAntrian2]).del();
    await DB('trx_detail_booking').where('kode_booking', testKodeBooking).del();
    await DB('trx_booking').where('kode_booking', testKodeBooking).del();

    console.log('================================================================');
    console.log(`FINAL RESULT: ${isPass1 && isPass2 && isPass3 ? '🎉 ALL 3 CAPACITY STATES VERIFIED SUCCESSFULLY' : '⚠️ SOME STATES FAILED'}`);
    console.log('================================================================');

  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await DB.destroy();
  }
}

testScenarioLiveCapacity();
