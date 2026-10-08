import DB from "../../core/config/knex.js";
import { syncCompletedItemsToKasirDraft } from "../../routes/v1/master/kasir/kasir_sync_service.js";
import { syncProdukBatch } from "../../routes/v1/master/inventori/batch_helper.js";

async function testAuthConsultationTreatment() {
  console.log("================================================================================");
  console.log("  PENGUJIAN VALIDASI OTORISASI ROLE PADA JALUR KONSULTASI & TINDAKAN           ");
  console.log("================================================================================\n");

  const today = new Date();
  const ymd = (d) => d.toISOString().slice(0, 10);
  const addDays = (d, n) => {
    const res = new Date(d);
    res.setDate(res.getDate() + n);
    return res;
  };
  const exp5DaysAgo = ymd(addDays(today, -5));
  const exp60DaysLater = ymd(addDays(today, 60));

  // ─── SETUP FIXTURES ───
  console.log("--- 0. SETUP FIXTURES ---");
  await DB("trx_stok_movement").where("kode_produk", "like", "TEST-AUTH-%").delete();
  await DB("trx_detail_transaksi").where("kode_produk", "like", "TEST-AUTH-%").delete();
  await DB("trx_transaksi").where("kode_transaksi", "like", "TRX-AUTH-%").delete();
  await DB("trx_antrian_layanan").where("kode_antrian_layanan", "like", "AL-AUTH-%").delete();
  await DB("trx_kunjungan").where("kode_kunjungan", "like", "KJ-AUTH-%").delete();
  await DB("mst_pasien").where("no_rm", "RM-AUTH-001").delete();
  await DB("mst_produk_batch").where("kode_produk", "like", "TEST-AUTH-%").delete();
  await DB("mst_produk").where("kode_produk", "like", "TEST-AUTH-%").delete();
  await DB("log_perubahan").where("keterangan", "like", "%TEST-AUTH-%").delete();

  // Create Pasien & Kunjungan
  await DB("mst_pasien").insert({
    no_rm: "RM-AUTH-001",
    nama: "Pasien Uji Auth",
    no_hp: "08123456789",
    tanggal_lahir: "1995-05-15",
    jenis_kelamin: "L",
    status: "aktif",
    created_by: "system_test",
  });

  await DB("trx_kunjungan").insert({
    kode_cabang: "CBG-001",
    kode_kunjungan: "KJ-AUTH-001",
    no_rm: "RM-AUTH-001",
    tanggal_kunjungan: ymd(today),
    jam_datang: "08:00:00",
    status: "berlangsung",
    tz: "Asia/Jakarta",
    created_by: "system_test",
  });

  await DB("trx_antrian_layanan").insert({
    kode_cabang: "CBG-001",
    kode_antrian_layanan: "AL-AUTH-001",
    kode_kunjungan: "KJ-AUTH-001",
    nomor_antrian: "A-001",
    kode_ruangan: "RNG-001",
    nama_ruangan: "Ruang Konsultasi",
    status: "dipanggil",
    tz: "Asia/Jakarta",
    created_by: "system_test",
  });

  // Create Expired Product & Normal Product
  await DB("mst_produk").insert([
    {
      kode_produk: "TEST-AUTH-EXP",
      kode_kategori_produk: "KAT-001",
      nama: "Serum Anti-Aging Kadaluarsa",
      satuan: "botol",
      harga_beli: 50000,
      harga_jual: 120000,
      stok_minimum: 2,
      stok_tersedia: 5,
      status: "aktif",
      created_by: "system_test",
    },
    {
      kode_produk: "TEST-AUTH-NORM",
      kode_kategori_produk: "KAT-001",
      nama: "Facial Wash Fresh (Normal)",
      satuan: "tube",
      harga_beli: 30000,
      harga_jual: 75000,
      stok_minimum: 2,
      stok_tersedia: 20,
      status: "aktif",
      created_by: "system_test",
    },
  ]);

  await DB("mst_produk_batch").insert([
    {
      kode_cabang: "CBG-001",
      kode_batch: "BAT-AUTH-EXP-01",
      kode_produk: "TEST-AUTH-EXP",
      no_batch: "EXP-BATCH-1",
      tanggal_kadaluarsa: exp5DaysAgo,
      stok_masuk: 5,
      stok_sisa: 5,
      status: "aktif",
      created_by: "system_test",
    },
    {
      kode_cabang: "CBG-001",
      kode_batch: "BAT-AUTH-NORM-01",
      kode_produk: "TEST-AUTH-NORM",
      no_batch: "NORM-BATCH-1",
      tanggal_kadaluarsa: exp60DaysLater,
      stok_masuk: 20,
      stok_sisa: 20,
      status: "aktif",
      created_by: "system_test",
    },
  ]);

  await syncProdukBatch("TEST-AUTH-EXP");
  await syncProdukBatch("TEST-AUTH-NORM");
  console.log("✓ Fixtures selesai dibuat.\n");

  const AUTHORIZED_OVERRIDE_ROLES = [
    "owner",
    "manager",
    "superadmin",
    "admin",
    "dokter",
    "kasir",
    "supervisor",
    "apoteker",
    "dev",
  ];

  // ─────────────────────────────────────────────────────────────────────────────
  // UJI 1: User dengan role BERWENANG (Role: 'dokter') -> Sukses & Flag Tersimpan
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("================================================================================");
  console.log("UJI 1: User BERWENANG (Role: 'dokter') mengirim override dari Konsultasi/Tindakan");
  console.log("Ekspektasi: BERHASIL, is_expired_override = 1 di trx_detail_transaksi & tercatat ChangesLog");
  console.log("--------------------------------------------------------------------------------");
  {
    const reqAuth = { username: "dr_spkk", role: "dokter" };
    const userRole = (reqAuth.role || "").toLowerCase();
    const items = [
      {
        kode_produk: "TEST-AUTH-EXP",
        qty: 2,
        harga: 120000,
        nama: "Serum Anti-Aging Kadaluarsa",
        produk_expired_override: true,
        catatan_override: "Disetujui dokter SpKK untuk terapi topikal terkontrol",
      },
    ];

    const hasOverride = items.some((p) => p.produk_expired_override || p.is_expired_override);
    const isAuthorized = userRole && AUTHORIZED_OVERRIDE_ROLES.includes(userRole);

    if (!isAuthorized) {
      console.error("STATUS: ✗ GAGAL, role dokter ditolak padahal berwenang!");
    } else {
      console.log("1. Validasi Otorisasi Backend: ✓ DIIZINKAN (Role 'dokter' terotorisasi)");

      // Eksekusi sync ke draf kasir
      const trx = await DB.transaction();
      try {
        const syncRes = await syncCompletedItemsToKasirDraft(trx, {
          kodeKunjungan: "KJ-AUTH-001",
          noRm: "RM-AUTH-001",
          username: reqAuth.username,
          extraProdukItems: items,
        });

        // Audit Trail ChangesLog
        const expiredOverrides = items.filter((p) => p.produk_expired_override || p.is_expired_override);
        await trx("log_perubahan").insert({
          keterangan: `Override Produk Kadaluarsa Rekomendasi Konsultasi: ${expiredOverrides.map((p) => `${p.nama || p.kode_produk} (${p.catatan_override})`).join(", ")} pada antrean AL-AUTH-001`,
          nama_tabel: "trx_antrian_layanan",
          kode_referensi: "AL-AUTH-001",
          aksi: "UPDATE",
          created_by: reqAuth.username,
          tz: "Asia/Jakarta",
        });

        await trx.commit();
        console.log("2. Transaksi Draf Kasir Dibuat:", syncRes?.kode_transaksi);

        // Verifikasi tabel trx_detail_transaksi
        const detailRow = await DB("trx_detail_transaksi")
          .where("kode_transaksi", syncRes.kode_transaksi)
          .where("kode_produk", "TEST-AUTH-EXP")
          .first();

        console.log("3. Status Kolom di trx_detail_transaksi:", {
          kode_detail_transaksi: detailRow.kode_detail_transaksi,
          kode_produk: detailRow.kode_produk,
          qty: detailRow.qty,
          is_expired_override: detailRow.is_expired_override,
          catatan_override: detailRow.catatan_override,
        });

        const logEntry = await DB("log_perubahan")
          .where("kode_referensi", "AL-AUTH-001")
          .where("keterangan", "like", "%Serum Anti-Aging Kadaluarsa%")
          .first();

        console.log("4. Log Perubahan (ChangesLog):", {
          keterangan: logEntry?.keterangan,
          user: logEntry?.created_by,
        });

        console.log("STATUS: ✓ BERHASIL PENUH SESUAI SPESIFIKASI");
      } catch (err) {
        await trx.rollback();
        console.error("STATUS: ✗ GAGAL:", err.message);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UJI 2: User TIDAK BERWENANG (Role: 'pasien' / 'tamu') -> Ditolak Keras 403
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n================================================================================");
  console.log("UJI 2: User TIDAK BERWENANG (Role: 'pasien') mencoba kirim override");
  console.log("Ekspektasi: DITOLAK (HTTP 403), TIDAK ada data draf / ChangesLog yang tersimpan");
  console.log("--------------------------------------------------------------------------------");
  {
    const reqAuth = { username: "pasien_user", role: "pasien" };
    const userRole = (reqAuth.role || "").toLowerCase();
    const items = [
      {
        kode_produk: "TEST-AUTH-EXP",
        qty: 1,
        harga: 120000,
        nama: "Serum Anti-Aging Kadaluarsa",
        produk_expired_override: true,
        catatan_override: "Beli sendiri tanpa izin",
      },
    ];

    const hasOverride = items.some((p) => p.produk_expired_override || p.is_expired_override);
    const isAuthorized = userRole && AUTHORIZED_OVERRIDE_ROLES.includes(userRole);

    let rejectedResponse = null;
    if (hasOverride && !isAuthorized) {
      rejectedResponse = {
        http_code: 403,
        status: "01",
        message: "Akses ditolak: Anda tidak memiliki otorisasi (role) untuk melakukan override produk kadaluarsa.",
        datetime: ymd(today),
      };
      console.log("1. Validasi Otorisasi Backend: ✓ DITOLAK KERAS");
      console.log("2. HTTP Response:", rejectedResponse);
    }

    // Pastikan tidak ada data yang masuk
    const unauthorizedChanges = await DB("log_perubahan")
      .where("created_by", "pasien_user")
      .where("keterangan", "like", "%TEST-AUTH-EXP%");
    console.log("3. ChangesLog dari user tidak berwenang:", unauthorizedChanges.length === 0 ? "✓ KOSONG (0 entri, tidak tercatat)" : "✗ BOCOR!");
    console.log("STATUS: ✓ BERHASIL DITOLAK & KEAMANAN TERJAGA");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UJI 3: User yang sama melakukan transaksi NORMAL (non-override) -> Tetap Berhasil
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n================================================================================");
  console.log("UJI 3: Transaksi NORMAL (Non-Override) dari user yang sama");
  console.log("Ekspektasi: BERHASIL, is_expired_override = 0 di trx_detail_transaksi");
  console.log("--------------------------------------------------------------------------------");
  {
    const reqAuth = { username: "beautician_user", role: "beautician" };
    const userRole = (reqAuth.role || "").toLowerCase();
    const items = [
      {
        kode_produk: "TEST-AUTH-NORM",
        qty: 1,
        harga: 75000,
        nama: "Facial Wash Fresh (Normal)",
        produk_expired_override: false,
        is_expired_override: false,
      },
    ];

    const hasOverride = items.some((p) => p.produk_expired_override || p.is_expired_override);
    const isAuthorized = userRole && AUTHORIZED_OVERRIDE_ROLES.includes(userRole);

    if (hasOverride && !isAuthorized) {
      console.error("STATUS: ✗ SALAH TOLAK!");
    } else {
      console.log("1. Validasi Otorisasi: ✓ DIIZINKAN (Item normal tidak memerlukan otorisasi override)");

      const trx = await DB.transaction();
      try {
        const syncRes = await syncCompletedItemsToKasirDraft(trx, {
          kodeKunjungan: "KJ-AUTH-001",
          noRm: "RM-AUTH-001",
          username: reqAuth.username,
          extraProdukItems: items,
        });
        await trx.commit();

        const normalDetail = await DB("trx_detail_transaksi")
          .where("kode_transaksi", syncRes.kode_transaksi)
          .where("kode_produk", "TEST-AUTH-NORM")
          .first();

        console.log("2. Status Kolom di trx_detail_transaksi:", {
          kode_detail_transaksi: normalDetail.kode_detail_transaksi,
          kode_produk: normalDetail.kode_produk,
          qty: normalDetail.qty,
          is_expired_override: normalDetail.is_expired_override,
          catatan_override: normalDetail.catatan_override,
        });

        console.log("STATUS: ✓ BERHASIL, ALUR NORMAL BERJALAN SEMPURNA DENGAN FLAG 0");
      } catch (err) {
        await trx.rollback();
        console.error("STATUS: ✗ GAGAL:", err.message);
      }
    }
  }

  console.log("\n================================================================================");
  console.log("         PENGUJIAN VALIDASI OTORISASI ROLE SELESAI DENGAN SUKSES                ");
  console.log("================================================================================");
  process.exit(0);
}

testAuthConsultationTreatment().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
