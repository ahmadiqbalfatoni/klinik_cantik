import 'dotenv/config';
import DB from '../../core/config/knex.js';
import { SignJWT } from 'jose';

async function runScenarioTests() {
  console.log('================================================================');
  console.log('  PENGUJIAN RESMI VALIDASI PROTEKSI JADWAL BOOKING VS WALK-IN   ');
  console.log('================================================================\n');

  const baseUrl = 'http://127.0.0.1:8000/api/v1/master/pendaftaran-pasien-ambil-antrian-layanan';
  const now = new Date();
  const todayYmd = now.toISOString().slice(0, 10);

  // 1. Authenticate as manager@klinik.com
  let user = await DB('user_credential').where('username', 'manager@klinik.com').first();
  if (!user) {
    user = await DB('user_credential').where('username', 'superadmin@admin.com').first();
  }
  console.log(`[AUTH] Login sebagai: ${user.username} (Role: ${user.role})`);

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
    'x-timestamp': new Date().toISOString(),
  };

  const sendPendaftaran = async (payload) => {
    headers['x-timestamp'] = new Date().toISOString();
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    return await res.json();
  };

  const pasien1 = await DB('mst_pasien').where('status', 'aktif').first();
  const pasien2 = (await DB('mst_pasien').where('status', 'aktif').whereNot('no_rm', pasien1.no_rm).first()) || pasien1;
  const targetRoom = 'RNG-004'; // Ruang D (PJ: dr. Amanda, aktif 08:00 - 16:00)

  const layananTindakan = await DB('mst_layanan').where('kode_layanan', 'LAY-005').first() || {
    kode_layanan: 'LAY-005',
    nama: 'Body Scrub & Massage',
    kode_ruangan: targetRoom,
    durasi_menit: 30,
  };

  const jadwalTarget = await DB('mst_jadwal_karyawan').where('kode_ruangan', targetRoom).where('status', 'aktif').first();
  const kodeJadwalTarget = jadwalTarget?.kode_jadwal || 'JDW-069';

  console.log(`[SETUP] Pasien 1: ${pasien1.no_rm} (${pasien1.nama}) | Pasien 2: ${pasien2.no_rm} (${pasien2.nama})`);
  console.log(`[SETUP] Ruang Target: ${targetRoom} | Layanan: ${layananTindakan.kode_layanan} (${layananTindakan.nama}) | Jadwal: ${kodeJadwalTarget}`);

  // Pastikan config buffer awal 15 menit
  await DB('config').where('kode', 'buffer_waktu_booking_menit').update({ keterangan: '15' });

  // Bersihkan semua data test antrean dan booking hari ini agar state awal bersih
  const allTestQueues = await DB('trx_antrian_layanan').whereRaw('DATE(created_at) = ?', [todayYmd]);
  if (allTestQueues.length > 0) {
    const allQCodes = allTestQueues.map(q => q.kode_antrian_layanan);
    await DB('trx_detail_antrian_layanan').whereIn('kode_antrian_layanan', allQCodes).delete();
    await DB('trx_antrian_layanan').whereIn('kode_antrian_layanan', allQCodes).delete();
  }
  await DB('trx_detail_booking').where('kode_booking', 'like', 'BKG-TEST%').delete();
  await DB('trx_booking').where('kode_booking', 'like', 'BKG-TEST%').delete();

  const results = {};

  // =========================================================================
  // SKENARIO 1 — Walk-in Tunggal di Ruangan Kosong (harus SOFT WARNING)
  // =========================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('▶ MENJALANKAN SKENARIO 1: Walk-in Tunggal di Ruangan Kosong');
  console.log('----------------------------------------------------------------');
  try {
    // 1. Bersihkan antrean hari ini di targetRoom agar benar-benar kosong
    const existingQueues = await DB('trx_antrian_layanan').where('kode_ruangan', targetRoom).whereRaw('DATE(created_at) = ?', [todayYmd]);
    if (existingQueues.length > 0) {
      const qCodes = existingQueues.map(q => q.kode_antrian_layanan);
      await DB('trx_detail_antrian_layanan').whereIn('kode_antrian_layanan', qCodes).delete();
      await DB('trx_antrian_layanan').whereIn('kode_antrian_layanan', qCodes).delete();
    }

    // 2. Set waktu booking 30 menit ke depan dari sekarang (misal sekarang 10:30 -> booking 11:00)
    const bkgTimeDate = new Date(now.getTime() + 30 * 60000);
    const bkgTimeStr = bkgTimeDate.toTimeString().slice(0, 8);
    const bkgTimeDisplay = bkgTimeStr.slice(0, 5);
    const kodeBkg1 = 'BKG-TEST-SK1';

    await DB('trx_detail_booking').where('kode_booking', kodeBkg1).delete();
    await DB('trx_booking').where('kode_booking', kodeBkg1).orWhere(function() {
      this.where('tanggal_booking', todayYmd).where('kode_ruangan', targetRoom);
    }).delete();

    await DB('trx_booking').insert({
      kode_booking: kodeBkg1,
      no_rm: pasien2.no_rm,
      tanggal_booking: todayYmd,
      jam_booking: bkgTimeStr,
      kode_ruangan: targetRoom,
      kode_jadwal: kodeJadwalTarget,
      status: 'dikonfirmasi',
      kode_cabang: 'CBG-001',
      created_by: 'system_test',
      created_at: new Date(),
    });

    await DB('trx_detail_booking').insert({
      kode_detail_booking: `DBK-SK1-001`,
      kode_booking: kodeBkg1,
      jenis_layanan: 'layanan',
      jenis_item: 'layanan_baru',
      kode_layanan: layananTindakan.kode_layanan,
      nama_layanan: layananTindakan.nama,
      durasi_menit: 30,
      harga: 150000,
    });

    console.log(`[TEST 1A] Setup Booking terkonfirmasi (${kodeBkg1}) pukul ${bkgTimeDisplay} WIB di ${targetRoom} (Ruangan KOSONG)`);
    console.log(`[TEST 1A] Mendaftarkan Walk-in Pasien 1 (Durasi: 30m, Buffer: 15m, Tanpa Override)...`);

    const res1A = await sendPendaftaran({
      no_rm: pasien1.no_rm,
      kode_cabang: 'CBG-001',
      kode_jadwal: kodeJadwalTarget,
      items: [{
        jenis_layanan: 'layanan',
        kode_layanan: layananTindakan.kode_layanan,
        kode_ruangan: targetRoom,
        durasi_menit: 30,
        butuh_konsul: false,
      }],
      override_peringatan_booking: false,
    });

    console.log(`[TEST 1A Respon] Status: ${res1A.status} | Peringatan: ${res1A.peringatan} | Ditolak: ${res1A.ditolak}`);
    console.log(`[TEST 1A Respon] Pesan: ${res1A.message}`);

    const is1APass = res1A.status === 'WARN_BOOKING_COLLISION' && res1A.peringatan === true && !res1A.ditolak;

    // 3. Uji tombol override (Kirim request dengan override_peringatan_booking: true)
    console.log(`\n[TEST 1B] Menguji klik tombol "Tetap Lanjutkan (Override)" (override_peringatan_booking = true)...`);
    const res1B = await sendPendaftaran({
      no_rm: pasien1.no_rm,
      kode_cabang: 'CBG-001',
      kode_jadwal: kodeJadwalTarget,
      items: [{
        jenis_layanan: 'layanan',
        kode_layanan: layananTindakan.kode_layanan,
        kode_ruangan: targetRoom,
        durasi_menit: 30,
        butuh_konsul: false,
      }],
      override_peringatan_booking: true,
    });

    console.log(`[TEST 1B Respon] Status: ${res1B.status} | Pesan: ${res1B.message}`);
    const is1BPass = ['00', '0000', 200].includes(res1B.status);

    // Cek DB apakah flag override tersimpan
    const savedQueue = await DB('trx_antrian_layanan')
      .where('kode_ruangan', targetRoom)
      .whereRaw('DATE(created_at) = ?', [todayYmd])
      .orderBy('id', 'desc')
      .first();

    const isDbOverrideRecorded = savedQueue && savedQueue.override_peringatan_booking === 1;
    console.log(`[TEST 1B DB] Antrean ID: ${savedQueue?.id} | Nomor: ${savedQueue?.nomor_antrian} | override_peringatan_booking: ${savedQueue?.override_peringatan_booking} | catatan: ${savedQueue?.catatan_override_booking}`);

    if (is1APass && is1BPass && isDbOverrideRecorded) {
      results['SKENARIO_1'] = { status: 'PASS', detail: `Muncul Soft Warning (WARN_BOOKING_COLLISION) saat mendaftar di ruangan kosong, dan berhasil diterbitkan dengan flag override=1 tercatat di database saat tombol override ditekan.` };
    } else {
      results['SKENARIO_1'] = { status: 'FAIL', detail: `Gagal: 1A=${is1APass} (Expected WARN_BOOKING_COLLISION), 1B=${is1BPass} (Expected Sukses 200), DB_Record=${isDbOverrideRecorded}` };
    }
  } catch (err) {
    results['SKENARIO_1'] = { status: 'FAIL', detail: `Exception: ${err.message}` };
  }

  // =========================================================================
  // SKENARIO 2 — Walk-in Kedua di Ruangan yang Sudah Ada Antrean (harus HARD REJECT)
  // =========================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('▶ MENJALANKAN SKENARIO 2: Walk-in Kedua di Ruangan dengan Antrean Berjalan');
  console.log('----------------------------------------------------------------');
  try {
    // Pada titik ini, Pasien 1 dari Skenario 1 sudah terdaftar dan antreannya aktif di targetRoom (status = 'menunggu').
    // Sekarang Pasien 2 mencoba mendaftar walk-in di ruangan yang sama.
    console.log(`[TEST 2A] Mendaftarkan Walk-in Pasien 2 pada ${targetRoom} yang sudah memiliki 1 antrean berjalan (beban 30m)...`);
    const res2A = await sendPendaftaran({
      no_rm: pasien2.no_rm,
      kode_cabang: 'CBG-001',
      kode_jadwal: kodeJadwalTarget,
      items: [{
        jenis_layanan: 'layanan',
        kode_layanan: layananTindakan.kode_layanan,
        kode_ruangan: targetRoom,
        durasi_menit: 30,
        butuh_konsul: false,
      }],
      override_peringatan_booking: false,
    });

    console.log(`[TEST 2A Respon] Status: ${res2A.status} | Ditolak: ${res2A.ditolak} | Peringatan: ${res2A.peringatan}`);
    console.log(`[TEST 2A Respon] Pesan: ${res2A.message}`);
    console.log(`[TEST 2A Data Penolakan] Sesi Rekomendasi: ${res2A.data_penolakan?.sesi_berikutnya_rekomendasi} WIB | Alternatif Ruangan: ${res2A.data_penolakan?.alternatif_ruangan?.length || 0} ruangan`);

    const is2APass = res2A.status === 'REJECTED_BOOKING_COLLISION' && res2A.ditolak === true;
    const hasRekomendasi = Boolean(res2A.data_penolakan?.sesi_berikutnya_rekomendasi);
    const hasAlternatif = Array.isArray(res2A.data_penolakan?.alternatif_ruangan);

    // Coba tembus dengan override = true (HARUS TETAP DITOLAK KERAS)
    console.log(`\n[TEST 2B] Mencoba mengirim request dengan override_peringatan_booking: true (HARUS TETAP DITOLAK)...`);
    const res2B = await sendPendaftaran({
      no_rm: pasien2.no_rm,
      kode_cabang: 'CBG-001',
      kode_jadwal: kodeJadwalTarget,
      items: [{
        jenis_layanan: 'layanan',
        kode_layanan: layananTindakan.kode_layanan,
        kode_ruangan: targetRoom,
        durasi_menit: 30,
        butuh_konsul: false,
      }],
      override_peringatan_booking: true,
    });

    console.log(`[TEST 2B Respon] Status: ${res2B.status} | Ditolak: ${res2B.ditolak}`);
    const is2BPass = res2B.status === 'REJECTED_BOOKING_COLLISION' && res2B.ditolak === true;

    if (is2APass && hasRekomendasi && hasAlternatif && is2BPass) {
      results['SKENARIO_2'] = {
        status: 'PASS',
        detail: `Muncul Hard Reject (REJECTED_BOOKING_COLLISION), menampilkan jam sesi aman berikutnya (${res2A.data_penolakan?.sesi_berikutnya_rekomendasi} WIB) & ${res2A.data_penolakan?.alternatif_ruangan?.length} opsi ruangan alternatif, serta mutlak memblokir upaya override.`
      };
    } else {
      results['SKENARIO_2'] = {
        status: 'FAIL',
        detail: `Gagal: 2A=${is2APass} (Expected REJECTED_BOOKING_COLLISION), SesiRekomendasi=${hasRekomendasi}, AlternatifRuangan=${hasAlternatif}, OverrideBlocked=${is2BPass}`
      };
    }
  } catch (err) {
    results['SKENARIO_2'] = { status: 'FAIL', detail: `Exception: ${err.message}` };
  }

  // =========================================================================
  // SKENARIO 3 — Walk-in yang TIDAK Bertabrakan (harus LOLOS NORMAL)
  // =========================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('▶ MENJALANKAN SKENARIO 3: Walk-in Tanpa Benturan (Lolos Normal)');
  console.log('----------------------------------------------------------------');
  try {
    // Bersihkan booking & antrean pada targetRoom (RNG-004) agar tidak ada benturan apapun
    await DB('trx_booking').where('tanggal_booking', todayYmd).delete();
    const qClean = await DB('trx_antrian_layanan').whereRaw('DATE(created_at) = ?', [todayYmd]);
    if (qClean.length > 0) {
      const qcCodes = qClean.map(q => q.kode_antrian_layanan);
      await DB('trx_detail_antrian_layanan').whereIn('kode_antrian_layanan', qcCodes).delete();
      await DB('trx_antrian_layanan').whereIn('kode_antrian_layanan', qcCodes).delete();
    }

    console.log(`[TEST 3] Mendaftarkan Walk-in di ${targetRoom} (Jadwal: ${kodeJadwalTarget}, Tanpa Booking)...`);
    const res3 = await sendPendaftaran({
      no_rm: pasien1.no_rm,
      kode_cabang: 'CBG-001',
      kode_jadwal: kodeJadwalTarget,
      items: [{
        jenis_layanan: 'layanan',
        kode_layanan: layananTindakan.kode_layanan,
        kode_ruangan: targetRoom,
        durasi_menit: 30,
        butuh_konsul: false,
      }],
      override_peringatan_booking: false,
    });

    console.log(`[TEST 3 Respon] Status: ${res3.status} | Pesan: ${res3.message}`);
    const is3Pass = ['00', '0000', 200].includes(res3.status) && !res3.peringatan && !res3.ditolak;

    if (is3Pass) {
      results['SKENARIO_3'] = {
        status: 'PASS',
        detail: `Pendaftaran langsung sukses (${res3.status} - ${res3.message}) secara instan tanpa dialog peringatan/penolakan.`
      };
    } else {
      results['SKENARIO_3'] = {
        status: 'FAIL',
        detail: `Gagal: Status=${res3.status}, Peringatan=${res3.peringatan}, Ditolak=${res3.ditolak}, Msg=${res3.message}`
      };
    }
  } catch (err) {
    results['SKENARIO_3'] = { status: 'FAIL', detail: `Exception: ${err.message}` };
  }

  // =========================================================================
  // SKENARIO 4 — Alur Konsultasi 2 Ruangan (Konsultasi -> Tindakan)
  // =========================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('▶ MENJALANKAN SKENARIO 4: Alur Konsultasi 2 Ruangan (Konsultasi -> Tindakan)');
  console.log('----------------------------------------------------------------');
  try {
    const testTindakanRoom = 'RNG-003'; // Ruang C
    const jadwalTindakan = await DB('mst_jadwal_karyawan').where('kode_ruangan', testTindakanRoom).where('is_penanggung_jawab', 1).where('status', 'aktif').first();
    const kodeJadwalTindakan = jadwalTindakan?.kode_jadwal || 'JDW-087';

    // Bersihkan antrean di RNG-003
    await DB('trx_booking').where('tanggal_booking', todayYmd).where('kode_ruangan', testTindakanRoom).delete();
    const q3 = await DB('trx_antrian_layanan').where('kode_ruangan', testTindakanRoom).whereRaw('DATE(created_at) = ?', [todayYmd]);
    if (q3.length > 0) {
      const q3Codes = q3.map(q => q.kode_antrian_layanan);
      await DB('trx_detail_antrian_layanan').whereIn('kode_antrian_layanan', q3Codes).delete();
      await DB('trx_antrian_layanan').whereIn('kode_antrian_layanan', q3Codes).delete();
    }

    // Pasang Booking di Ruang Tindakan (RNG-003) pada 45 menit ke depan
    const bkg4Date = new Date(now.getTime() + 45 * 60000);
    const bkg4Str = bkg4Date.toTimeString().slice(0, 8);
    const bkg4Display = bkg4Str.slice(0, 5);
    const kodeBkg4 = 'BKG-TEST-SK4';

    await DB('trx_detail_booking').where('kode_booking', kodeBkg4).delete();
    await DB('trx_booking').insert({
      kode_booking: kodeBkg4,
      no_rm: pasien2.no_rm,
      tanggal_booking: todayYmd,
      jam_booking: bkg4Str,
      kode_ruangan: testTindakanRoom,
      kode_jadwal: kodeJadwalTindakan,
      status: 'dikonfirmasi',
      kode_cabang: 'CBG-001',
      created_by: 'system_test',
      created_at: new Date(),
    });

    await DB('trx_detail_booking').insert({
      kode_detail_booking: `DBK-SK4-001`,
      kode_booking: kodeBkg4,
      jenis_layanan: 'layanan',
      jenis_item: 'layanan_baru',
      kode_layanan: 'LAY-004',
      nama_layanan: 'Hair Spa Therapy',
      durasi_menit: 45,
      harga: 200000,
    });

    console.log(`[TEST 4] Setup Booking di Ruang Tindakan (${testTindakanRoom}) pukul ${bkg4Display} WIB`);
    console.log(`[TEST 4] Mendaftarkan Pasien Walk-in Konsultasi (10m) -> Tindakan di ${testTindakanRoom} (60m)...`);

    const res4 = await sendPendaftaran({
      no_rm: pasien1.no_rm,
      kode_cabang: 'CBG-001',
      kode_jadwal: kodeJadwalTindakan,
      items: [{
        jenis_layanan: 'layanan',
        kode_layanan: 'LAY-004',
        kode_ruangan: testTindakanRoom,
        durasi_menit: 60,
        butuh_konsul: true,
        wajib_konsultasi: 'wajib',
        lewat_konsultasi: true,
      }],
      override_peringatan_booking: false,
    });

    console.log(`[TEST 4 Respon] Status: ${res4.status} | Peringatan: ${res4.peringatan}`);
    console.log(`[TEST 4 Data Peringatan] Target Ruangan Bentrok: ${res4.data_peringatan?.nama_ruangan} (${res4.data_peringatan?.kode_ruangan})`);
    console.log(`[TEST 4 Data Peringatan] is_lanjutan_konsultasi: ${res4.data_peringatan?.is_lanjutan_konsultasi}`);
    console.log(`[TEST 4 Data Peringatan] Durasi Konsul: ${res4.data_peringatan?.durasi_konsultasi_menit}m | Durasi Tindakan: ${res4.data_peringatan?.durasi_tindakan_menit}m`);

    const is4Pass = res4.status === 'WARN_BOOKING_COLLISION' &&
      res4.data_peringatan?.kode_ruangan === testTindakanRoom &&
      res4.data_peringatan?.is_lanjutan_konsultasi === true;

    if (is4Pass) {
      results['SKENARIO_4'] = {
        status: 'PASS',
        detail: `Alur 2-ruangan berjalan presisi: Peringatan tertuju tepat ke Ruang Tindakan (${res4.data_peringatan?.nama_ruangan}), is_lanjutan_konsultasi=true, dan rincian waktu konsul (${res4.data_peringatan?.durasi_konsultasi_menit}m) + tindakan (${res4.data_peringatan?.durasi_tindakan_menit}m) terakumulasi benar.`
      };
    } else {
      results['SKENARIO_4'] = {
        status: 'FAIL',
        detail: `Gagal: Status=${res4.status}, TargetRuangan=${res4.data_peringatan?.kode_ruangan} (Expected ${testTindakanRoom}), isLanjutan=${res4.data_peringatan?.is_lanjutan_konsultasi}`
      };
    }
  } catch (err) {
    results['SKENARIO_4'] = { status: 'FAIL', detail: `Exception: ${err.message}` };
  }

  // =========================================================================
  // SKENARIO 5 — Verifikasi Buffer & Config
  // =========================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('▶ MENJALANKAN SKENARIO 5: Verifikasi Buffer & Config Dinamis');
  console.log('----------------------------------------------------------------');
  try {
    // 1. Ambil nilai asli config
    const origCfg = await DB('config').where('kode', 'buffer_waktu_booking_menit').first();
    const origVal = origCfg ? parseInt(origCfg.keterangan || 15, 10) : 15;
    console.log(`[TEST 5] Nilai asli config buffer_waktu_booking_menit: ${origVal} menit`);

    // 2. Ubah config ke 25 menit
    await DB('config').where('kode', 'buffer_waktu_booking_menit').update({
      keterangan: '25',
      updated_at: new Date(),
    });
    console.log(`[TEST 5] Config buffer_waktu_booking_menit diubah menjadi: 25 menit`);

    // 3. Jalankan pengujian request ke backend
    const testRoom5 = 'RNG-004';
    await DB('trx_booking').where('tanggal_booking', todayYmd).where('kode_ruangan', testRoom5).delete();
    const q5 = await DB('trx_antrian_layanan').where('kode_ruangan', testRoom5).whereRaw('DATE(created_at) = ?', [todayYmd]);
    if (q5.length > 0) {
      const q5Codes = q5.map(q => q.kode_antrian_layanan);
      await DB('trx_detail_antrian_layanan').whereIn('kode_antrian_layanan', q5Codes).delete();
      await DB('trx_antrian_layanan').whereIn('kode_antrian_layanan', q5Codes).delete();
    }

    const bkg5Date = new Date(now.getTime() + 40 * 60000);
    const bkg5Str = bkg5Date.toTimeString().slice(0, 8);
    const kodeBkg5 = 'BKG-TEST-SK5';

    await DB('trx_detail_booking').where('kode_booking', kodeBkg5).delete();
    await DB('trx_booking').insert({
      kode_booking: kodeBkg5,
      no_rm: pasien2.no_rm,
      tanggal_booking: todayYmd,
      jam_booking: bkg5Str,
      kode_ruangan: testRoom5,
      kode_jadwal: kodeJadwalTarget,
      status: 'dikonfirmasi',
      kode_cabang: 'CBG-001',
      created_by: 'system_test',
      created_at: new Date(),
    });

    await DB('trx_detail_booking').insert({
      kode_detail_booking: `DBK-SK5-001`,
      kode_booking: kodeBkg5,
      jenis_layanan: 'layanan',
      jenis_item: 'layanan_baru',
      kode_layanan: layananTindakan.kode_layanan,
      nama_layanan: layananTindakan.nama,
      durasi_menit: 30,
      harga: 100000,
    });

    const res5 = await sendPendaftaran({
      no_rm: pasien1.no_rm,
      kode_cabang: 'CBG-001',
      kode_jadwal: kodeJadwalTarget,
      items: [{
        jenis_layanan: 'layanan',
        kode_layanan: layananTindakan.kode_layanan,
        kode_ruangan: testRoom5,
        durasi_menit: 20,
        butuh_konsul: false,
      }],
      override_peringatan_booking: false,
    });

    console.log(`[TEST 5 Respon] Buffer Terdeteksi di Respon: ${res5.data_peringatan?.buffer_menit} menit`);
    const isBufferChanged = res5.data_peringatan?.buffer_menit === 25;

    // 4. Kembalikan nilai config ke 15 menit
    await DB('config').where('kode', 'buffer_waktu_booking_menit').update({
      keterangan: '15',
      updated_at: new Date(),
    });
    const restoredCfg = await DB('config').where('kode', 'buffer_waktu_booking_menit').first();
    console.log(`[TEST 5] Config buffer_waktu_booking_menit BERHASIL DIKEMBALIKAN ke: ${restoredCfg.keterangan} menit`);

    if (isBufferChanged && restoredCfg.keterangan === '15') {
      results['SKENARIO_5'] = {
        status: 'PASS',
        detail: `Config dinamis terbukti aktif: buffer berubah menjadi 25 menit saat diubah di tabel config, dan berhasil dikembalikan bersih ke 15 menit.`
      };
    } else {
      results['SKENARIO_5'] = {
        status: 'FAIL',
        detail: `Gagal: BufferRespon=${res5.data_peringatan?.buffer_menit} (Expected 25), RestoredValue=${restoredCfg.keterangan} (Expected 15)`
      };
    }
  } catch (err) {
    results['SKENARIO_5'] = { status: 'FAIL', detail: `Exception: ${err.message}` };
  }

  // =========================================================================
  // CLEANUP & REKAP LAPORAN
  // =========================================================================
  console.log('\n================================================================');
  console.log('                      RINGKASAN HASIL PENGUJIAN                 ');
  console.log('================================================================');
  console.table(results);

  // Bersihkan data test booking
  await DB('trx_detail_booking').where('kode_booking', 'like', 'BKG-TEST%').delete();
  await DB('trx_booking').where('kode_booking', 'like', 'BKG-TEST%').delete();
  console.log('\nData pengujian temporary telah dibersihkan.');
  process.exit(0);
}

runScenarioTests().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
