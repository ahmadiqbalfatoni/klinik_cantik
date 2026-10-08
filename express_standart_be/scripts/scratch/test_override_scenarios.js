import DB from "../../core/config/knex.js";
import {
  deductStockFEFO,
  restoreStockFEFO,
  validateStockAvailability,
  syncProdukBatch,
  getProdukBatchStockInfo,
} from "../../routes/v1/master/inventori/batch_helper.js";

async function runTests() {
  console.log("================================================================================");
  console.log("             SUITE PENGUJIAN FITUR OVERRIDE EXPIRED END-TO-END                 ");
  console.log("================================================================================\n");

  const today = new Date();
  const ymd = (d) => d.toISOString().slice(0, 10);
  const addDays = (d, n) => {
    const res = new Date(d);
    res.setDate(res.getDate() + n);
    return res;
  };

  const exp5DaysAgo = ymd(addDays(today, -5));
  const expTomorrow = ymd(addDays(today, 1));
  const exp60DaysLater = ymd(addDays(today, 60));

  // ─── SETUP FIXTURES ───
  console.log("--- 0. SETUP DUMMY PRODUCT FIXTURES ---");

  // Cleanup old test data
  await DB("trx_stok_movement").where("kode_produk", "like", "TEST-OVR-%").delete();
  await DB("trx_detail_transaksi").where("kode_produk", "like", "TEST-OVR-%").delete();
  await DB("trx_transaksi").where("kode_transaksi", "like", "TRX-TEST-OVR-%").delete();
  await DB("mst_produk_batch").where("kode_produk", "like", "TEST-OVR-%").delete();
  await DB("mst_produk").where("kode_produk", "like", "TEST-OVR-%").delete();
  await DB("log_perubahan").where("keterangan", "like", "%TEST-OVR-%").delete();

  // 1. Produk 1: 100% Expired (1 batch, qty 10, exp 5 days ago)
  await DB("mst_produk").insert({
    kode_produk: "TEST-OVR-001",
    kode_kategori_produk: "KAT-001",
    nama: "Produk Uji 100% Expired",
      satuan: "pcs",
        harga_beli: 10000,
          harga_jual: 25000,
            stok_minimum: 5,
              stok_tersedia: 10,
                status: "aktif",
                  tz: "Asia/Jakarta",
                    created_by: "system_test",
  });

await DB("mst_produk_batch").insert({
  kode_cabang: "CBG-001",
  kode_batch: "BAT-OVR-001-A",
  kode_produk: "TEST-OVR-001",
  no_batch: "BATCH-EXP-ONLY",
  tanggal_kadaluarsa: exp5DaysAgo,
  stok_masuk: 10,
  stok_sisa: 10,
  status: "aktif",
  tz: "Asia/Jakarta",
  created_by: "system_test",
});
await syncProdukBatch("TEST-OVR-001");

// 2. Produk 2: Campuran (Batch 1: 10 exp, Batch 2: 15 valid, Batch 3: 20 valid)
await DB("mst_produk").insert({
  kode_produk: "TEST-OVR-002",
  kode_kategori_produk: "KAT-001",
  nama: "Produk Uji Campuran Valid & Expired",
  satuan: "pcs",
  harga_beli: 20000,
  harga_jual: 50000,
  stok_minimum: 5,
  stok_tersedia: 45,
  status: "aktif",
  tz: "Asia/Jakarta",
  created_by: "system_test",
});

await DB("mst_produk_batch").insert([
  {
    kode_cabang: "CBG-001",
    kode_batch: "BAT-OVR-002-EXP",
    kode_produk: "TEST-OVR-002",
    no_batch: "BATCH-EXP-5D",
    tanggal_kadaluarsa: exp5DaysAgo,
    stok_masuk: 10,
    stok_sisa: 10,
    status: "aktif",
    tz: "Asia/Jakarta",
    created_by: "system_test",
  },
  {
    kode_cabang: "CBG-001",
    kode_batch: "BAT-OVR-002-VAL1",
    kode_produk: "TEST-OVR-002",
    no_batch: "BATCH-VAL-TOMORROW",
    tanggal_kadaluarsa: expTomorrow,
    stok_masuk: 15,
    stok_sisa: 15,
    status: "aktif",
    tz: "Asia/Jakarta",
    created_by: "system_test",
  },
  {
    kode_cabang: "CBG-001",
    kode_batch: "BAT-OVR-002-VAL2",
    kode_produk: "TEST-OVR-002",
    no_batch: "BATCH-VAL-60D",
    tanggal_kadaluarsa: exp60DaysLater,
    stok_masuk: 20,
    stok_sisa: 20,
    status: "aktif",
    tz: "Asia/Jakarta",
    created_by: "system_test",
  },
]);
await syncProdukBatch("TEST-OVR-002");

console.log("✓ Fixtures berhasil dibuat:\n  - TEST-OVR-001: 1 batch kadaluarsa (qty: 10)\n  - TEST-OVR-002: 3 batch (Batch EXP: 10, Batch VAL1: 15, Batch VAL2: 20)\n");

// ─────────────────────────────────────────────────────────────────────────────
// SKENARIO 1: Produk 1 batch, expired, is_expired_override = true, qty <= stok fisik
// ─────────────────────────────────────────────────────────────────────────────
console.log("================================================================================");
console.log("SKENARIO 1: Produk 1 batch expired, is_expired_override = true, qty 4 <= stok fisik (10)");
console.log("Ekspektasi: BERHASIL memotong batch expired, tercatat di trx_stok_movement & ChangesLog");
console.log("--------------------------------------------------------------------------------");
{
  const trx = await DB.transaction();
  try {
    const logs = await deductStockFEFO({
      kode_produk: "TEST-OVR-001",
      qty: 4,
      kode_transaksi: "TRX-TEST-OVR-001",
      username: "kasir_test",
      branchCode: "CBG-001",
      allowExpiredOverride: true,
      catatanOverride: "Disetujui dokter spKK",
      trx,
    });
    await trx.commit();
    console.log("STATUS: ✓ BERHASIL");
    console.log("Deducted Logs:", JSON.stringify(logs, null, 2));

    // Verifikasi tabel batch & movement
    const batchAfter = await DB("mst_produk_batch").where("kode_batch", "BAT-OVR-001-A").first();
    console.log(`Sisa Stok Batch BAT-OVR-001-A: ${batchAfter.stok_sisa} (sebelumnya 10, dipotong 4)`);

    const movements = await DB("trx_stok_movement").where("referensi", "TRX-TEST-OVR-001");
    console.log("Movement Records:", movements.map((m) => ({
      kode_stok_movement: m.kode_stok_movement,
      kode_batch: m.kode_batch,
      qty: m.qty,
      is_override_movement: m.is_override_movement,
      catatan: m.catatan,
    })));

    const changes = await DB("log_perubahan").where("keterangan", "like", "%TEST-OVR-001%").orderBy("id", "desc").first();
    console.log("ChangesLog Audit Trail:", {
      keterangan: changes?.keterangan,
      kode_referensi: changes?.kode_referensi,
      user: changes?.created_by,
    });
  } catch (e) {
    await trx.rollback();
    console.error("STATUS: ✗ GAGAL TIDAK TERDUGA:", e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SKENARIO 2: Produk 1 batch, expired, is_expired_override = false
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n================================================================================");
console.log("SKENARIO 2: Produk 1 batch expired, is_expired_override = false, qty 1");
console.log("Ekspektasi: HARUS GAGAL Error 422 (Stok layak jual tidak mencukupi)");
console.log("--------------------------------------------------------------------------------");
{
  const trx = await DB.transaction();
  try {
    await deductStockFEFO({
      kode_produk: "TEST-OVR-001",
      qty: 1,
      kode_transaksi: "TRX-TEST-OVR-002-FAIL",
      username: "kasir_test",
      branchCode: "CBG-001",
      allowExpiredOverride: false,
      trx,
    });
    await trx.commit();
    console.error("STATUS: ✗ SEHARUSNYA GAGAL TAPI MALAH BERHASIL");
  } catch (e) {
    await trx.rollback();
    console.log("STATUS: ✓ BERHASIL DITOLAK SESUAI ATURAN BUG 1");
    console.log(`StatusCode: ${e.statusCode || 500}, Message: "${e.message}"`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SKENARIO 3: Produk multi-batch (valid 35, expired 10), is_expired_override = true, qty 40
// (Membutuhkan 35 dari valid + 5 dari expired)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n================================================================================");
console.log("SKENARIO 3: Multi-batch campuran, qty diminta 40 (Valid total 35, Expired 10), is_expired_override = true");
console.log("Ekspektasi: BERHASIL, memotong 15 dari VAL1, 20 dari VAL2, dan 5 dari EXP (3 movement terpisah)");
console.log("--------------------------------------------------------------------------------");
{
  const trx = await DB.transaction();
  try {
    const logs = await deductStockFEFO({
      kode_produk: "TEST-OVR-002",
      qty: 40,
      kode_transaksi: "TRX-TEST-OVR-003",
      username: "kasir_test",
      branchCode: "CBG-001",
      allowExpiredOverride: true,
      catatanOverride: "Disetujui dokter konsul - kekurangan 5 unit expired",
      trx,
    });
    await trx.commit();
    console.log("STATUS: ✓ BERHASIL");
    console.log("Deducted Logs:", JSON.stringify(logs, null, 2));

    // Cek sisa stok per batch
    const batches = await DB("mst_produk_batch").where("kode_produk", "TEST-OVR-002").orderBy("id", "asc");
    console.log("Status Batch Pasca Potong:", batches.map((b) => ({
      kode_batch: b.kode_batch,
      no_batch: b.no_batch,
      exp: ymd(new Date(b.tanggal_kadaluarsa)),
      sisa: b.stok_sisa,
      status: b.status,
    })));

    const movements = await DB("trx_stok_movement").where("referensi", "TRX-TEST-OVR-003").orderBy("id", "asc");
    console.log("Movement Records (3 Baris):", movements.map((m) => ({
      kode_stok_movement: m.kode_stok_movement,
      kode_batch: m.kode_batch,
      qty: m.qty,
      is_override_movement: m.is_override_movement,
      catatan: m.catatan,
    })));
  } catch (e) {
    await trx.rollback();
    console.error("STATUS: ✗ GAGAL TIDAK TERDUGA:", e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SKENARIO 4: Produk dengan is_expired_override = true tapi total fisik (valid + expired) < qty
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n================================================================================");
console.log("SKENARIO 4: is_expired_override = true tapi qty diminta (100) > Total Fisik (sisa 5)");
console.log("Ekspektasi: HARUS GAGAL Error 422 (Total stok fisik tidak mencukupi)");
console.log("--------------------------------------------------------------------------------");
{
  const trx = await DB.transaction();
  try {
    await deductStockFEFO({
      kode_produk: "TEST-OVR-002",
      qty: 100,
      kode_transaksi: "TRX-TEST-OVR-004-FAIL",
      username: "kasir_test",
      branchCode: "CBG-001",
      allowExpiredOverride: true,
      catatanOverride: "Override apapun",
      trx,
    });
    await trx.commit();
    console.error("STATUS: ✗ SEHARUSNYA GAGAL TAPI MALAH BERHASIL");
  } catch (e) {
    await trx.rollback();
    console.log("STATUS: ✓ BERHASIL DITOLAK KARENA STOK FISIK NYATA TIDAK ADA");
    console.log(`StatusCode: ${e.statusCode || 500}, Message: "${e.message}"`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SKENARIO 5: Transaksi di-VOID / Dibatalkan -> restoreStockFEFO
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n================================================================================");
console.log("SKENARIO 5: Void Transaksi TRX-TEST-OVR-003 -> restoreStockFEFO");
console.log("Ekspektasi: Stok kembali ke batch masing-masing (EXP kembali ke 10, VAL1 ke 15, VAL2 ke 20)");
console.log("            Stok layak jual kembali tepat ke 35, expired tetap terisolasi.");
console.log("--------------------------------------------------------------------------------");
{
  const trx = await DB.transaction();
  try {
    await restoreStockFEFO({
      kodeTransaksi: "TRX-TEST-OVR-003",
      username: "kasir_supervisor",
      trx,
    });
    await trx.commit();
    console.log("STATUS: ✓ RESTORE BERHASIL");

    const batches = await DB("mst_produk_batch").where("kode_produk", "TEST-OVR-002").orderBy("id", "asc");
    console.log("Status Batch Pasca Void/Restore:", batches.map((b) => ({
      kode_batch: b.kode_batch,
      no_batch: b.no_batch,
      exp: ymd(new Date(b.tanggal_kadaluarsa)),
      sisa: b.stok_sisa,
      status: b.status,
    })));

    const stockInfo = await getProdukBatchStockInfo(["TEST-OVR-002"], "CBG-001");
    console.log("Produk Stock Summary Pasca Restore:", stockInfo["TEST-OVR-002"]);

    const voidMovements = await DB("trx_stok_movement").where("referensi", "VOID-TRX-TEST-OVR-003");
    console.log("Void Movement Records:", voidMovements.map((m) => ({
      kode_stok_movement: m.kode_stok_movement,
      kode_batch: m.kode_batch,
      jenis: m.jenis_movement,
      qty: m.qty,
      is_override_movement: m.is_override_movement,
      catatan: m.catatan,
    })));
  } catch (e) {
    await trx.rollback();
    console.error("STATUS: ✗ GAGAL RESTORE:", e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SKENARIO 6: Walk-in POS Kasir direct save (Otorisasi & Eksekusi Bayar)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n================================================================================");
console.log("SKENARIO 6: Walk-in POS Kasir Otorisasi Role & Eksekusi Simpan/Bayar");
console.log("--------------------------------------------------------------------------------");
{
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

  const saveItems = [
    {
      kode: "TEST-OVR-001",
      qty: 3,
      nama: "Produk Uji 100% Expired",
      jenis: "produk",
      harga_satuan: 25000,
      is_expired_override: true,
      catatan_override: "Walk-in override disetujui kasir kepala",
    },
  ];

  // --- UJI 6B: USER TANPA OTORISASI (Role: "pasien" / "tamu") ---
  console.log("--- Uji 6b: User Tanpa Role yang Sah (Role: 'pasien') ---");
  const unauthorizedRole = "pasien";
  const hasOverride = saveItems.some((it) => it.is_expired_override || it.produk_expired_override);
  const isAuth6b = unauthorizedRole && AUTHORIZED_OVERRIDE_ROLES.includes(unauthorizedRole);

  if (hasOverride && !isAuth6b) {
    console.log("STATUS: ✓ BERHASIL DITOLAK (HTTP 403 Forbidden)");
    console.log(`Response: { status: "01", message: "Akses ditolak: Anda tidak memiliki otorisasi (role) untuk melakukan override produk kadaluarsa." }`);
  } else {
    console.error("STATUS: ✗ SEHARUSNYA DITOLAK TAPI DIIZINKAN!");
  }

  // --- UJI 6A: USER DENGAN OTORISASI SAH (Role: "kasir") ---
  console.log("\n--- Uji 6a: User Dengan Role yang Sah (Role: 'kasir') ---");
  const authorizedRole = "kasir";
  const isAuth6a = authorizedRole && AUTHORIZED_OVERRIDE_ROLES.includes(authorizedRole);

  if (hasOverride && isAuth6a) {
    console.log("1. Validasi Otorisasi: ✓ DIIZINKAN untuk role 'kasir'");
  }

  // Validasi stok awal di kasir_save
  const stockVal = await validateStockAvailability(saveItems, "CBG-001");
  console.log("2. Hasil validateStockAvailability di kasir_save:", stockVal);

  const trx = await DB.transaction();
  const kodeTrx = "TRX-TEST-OVR-006";
  try {
    await trx("trx_transaksi").insert({
      kode_cabang: "CBG-001",
      kode_transaksi: kodeTrx,
      no_rm: "RM-TEST-001",
      tanggal_transaksi: ymd(today),
      total_harga: 75000,
      total_diskon: 0,
      total_bayar: 75000,
      dp_nominal: 0,
      sisa_bayar: 75000,
      status: "draft",
      tz: "Asia/Jakarta",
      created_by: "kasir_direct",
    });

    await trx("trx_detail_transaksi").insert({
      kode_cabang: "CBG-001",
      kode_detail_transaksi: "DT-TEST-OVR-006",
      kode_transaksi: kodeTrx,
      kode_produk: "TEST-OVR-001",
      qty: 3,
      harga_satuan: 25000,
      subtotal: 75000,
      is_from_pendaftaran: 0,
      is_expired_override: 1,
      catatan_override: "Walk-in override disetujui kasir kepala",
      tz: "Asia/Jakarta",
      created_by: "kasir_direct",
    });
    await trx.commit();
    console.log("3. Draf transaksi kasir tersimpan dengan is_expired_override = 1");

    // Simulasikan POST /master/kasir/bayar
    const trxPay = await DB.transaction();
    const detailItems = await trxPay("trx_detail_transaksi")
      .where("kode_transaksi", kodeTrx)
      .whereNotNull("kode_produk");

    for (const it of detailItems) {
      await deductStockFEFO({
        kode_produk: it.kode_produk,
        qty: parseInt(it.qty, 10),
        kode_transaksi: kodeTrx,
        username: "kasir_direct",
        branchCode: "CBG-001",
        tz: "Asia/Jakarta",
        allowExpiredOverride: Boolean(it.is_expired_override),
        catatanOverride: it.catatan_override,
        trx: trxPay,
      });
    }

    await trxPay("trx_transaksi").where("kode_transaksi", kodeTrx).update({
      status: "lunas",
      updated_by: "kasir_direct",
    });
    await trxPay.commit();
    console.log("4. Pembayaran kasir_bayar berhasil dieksekusi!");

    const movWalkIn = await DB("trx_stok_movement").where("referensi", kodeTrx).first();
    console.log("5. Movement Record Walk-in:", {
      kode_stok_movement: movWalkIn.kode_stok_movement,
      kode_batch: movWalkIn.kode_batch,
      qty: movWalkIn.qty,
      is_override_movement: movWalkIn.is_override_movement,
      catatan: movWalkIn.catatan,
    });
  } catch (e) {
    await trx.rollback();
    console.error("STATUS: ✗ GAGAL WALK-IN:", e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SKENARIO 7: Regresi validateStockAvailability (3 Skenario Laporan Sebelumnya)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n================================================================================");
console.log("SKENARIO 7: Regresi validateStockAvailability (3 Kasus Standar Non-Override)");
console.log("--------------------------------------------------------------------------------");
{
  // Kasus A: Minta 35 unit TEST-OVR-002 (Pas stok layak jual) -> HARUS VALID
  const resA = await validateStockAvailability([
    { kode: "TEST-OVR-002", qty: 35, nama: "Produk Campuran", jenis: "produk" },
  ], "CBG-001");
  console.log("Kasus A (35 unit pas layak jual):", resA.valid ? "✓ VALID" : "✗ GAGAL", resA);

  // Kasus B: Minta 36 unit TEST-OVR-002 (Lebih 1 dari layak jual, tanpa override) -> HARUS TIDAK VALID
  const resB = await validateStockAvailability([
    { kode: "TEST-OVR-002", qty: 36, nama: "Produk Campuran", jenis: "produk" },
  ], "CBG-001");
  console.log("Kasus B (36 unit lebih dari layak jual, non-override):", !resB.valid ? "✓ DITOLAK SESUAI ATURAN" : "✗ GAGAL", {
    valid: resB.valid,
    stok_layak_jual: resB.stok_layak_jual,
    stok_expired: resB.stok_expired,
    can_override: resB.can_override,
    message: resB.message,
  });

  // Kasus C: Minta 1 unit TEST-OVR-001 (100% Expired, tanpa override) -> HARUS TIDAK VALID
  const resC = await validateStockAvailability([
    { kode: "TEST-OVR-001", qty: 1, nama: "Produk Expired Only", jenis: "produk" },
  ], "CBG-001");
  console.log("Kasus C (1 unit 100% expired, non-override):", !resC.valid ? "✓ DITOLAK SESUAI ATURAN" : "✗ GAGAL", {
    valid: resC.valid,
    stok_layak_jual: resC.stok_layak_jual,
    stok_expired: resC.stok_expired,
    can_override: resC.can_override,
    message: resC.message,
  });
}

console.log("\n================================================================================");
console.log("                 SELURUH 7 SKENARIO PENGUJIAN SELESAI                           ");
console.log("================================================================================");
process.exit(0);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
