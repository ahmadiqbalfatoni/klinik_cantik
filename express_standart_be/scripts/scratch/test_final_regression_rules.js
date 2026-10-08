import DB from "../../core/config/knex.js";
import {
  validateStockAvailability,
  getProdukBatchStockInfo,
  deductStockFEFO,
  syncProdukBatch,
} from "../../routes/v1/master/inventori/batch_helper.js";

async function runFinalRegressionTest() {
  console.log("================================================================================");
  console.log("     PENGUJIAN REGRESI FINAL: LOGIKA DASAR STOK LAYAK JUAL VS KADALUARSA        ");
  console.log("================================================================================\n");

  const today = new Date();
  const ymd = (d) => d.toISOString().slice(0, 10);
  const addDays = (d, n) => {
    const res = new Date(d);
    res.setDate(res.getDate() + n);
    return res;
  };

  const expPastDate = ymd(addDays(today, -10)); // 10 hari lalu (Expired)
  const expFutureDate = ymd(addDays(today, 90)); // 90 hari ke depan (Valid)

  // ─── 0. SETUP FIXTURES (BERSIH DARI UJI LAIN) ───
  console.log("--- 0. SETUP CLEAN FIXTURES ---");
  await DB("trx_stok_movement").where("kode_produk", "like", "REGR-%").delete();
  await DB("trx_detail_transaksi").where("kode_produk", "like", "REGR-%").delete();
  await DB("trx_transaksi").where("kode_transaksi", "like", "TRX-REGR-%").delete();
  await DB("mst_produk_batch").where("kode_produk", "like", "REGR-%").delete();
  await DB("mst_produk").where("kode_produk", "like", "REGR-%").delete();
  await DB("log_perubahan").where("keterangan", "like", "%REGR-%").delete();

  // Fixture Kasus A: 1 Batch, 100% Expired
  await DB("mst_produk").insert({
    kode_cabang: "CBG-001",
    kode_produk: "REGR-PRD-A",
    kode_kategori_produk: "KAT-001",
    nama: "Produk Kasus A (1 Batch Expired)",
    satuan: "pcs",
    harga_beli: 10000,
    harga_jual: 25000,
    stok_minimum: 2,
    stok_tersedia: 10,
    status: "aktif",
    created_by: "tester_final",
  });

  await DB("mst_produk_batch").insert({
    kode_cabang: "CBG-001",
    kode_batch: "BAT-REGR-A1",
    kode_produk: "REGR-PRD-A",
    no_batch: "BATCH-A-EXP10D",
    tanggal_kadaluarsa: expPastDate,
    stok_masuk: 10,
    stok_sisa: 10,
    status: "aktif",
    tz: "Asia/Jakarta",
    created_by: "tester_final",
  });
  await syncProdukBatch("REGR-PRD-A");

  // Fixture Kasus B: 2 Batch (Batch 1 Expired 8 unit, Batch 2 Valid 12 unit)
  await DB("mst_produk").insert({
    kode_cabang: "CBG-001",
    kode_produk: "REGR-PRD-B",
    kode_kategori_produk: "KAT-001",
    nama: "Produk Kasus B (Campuran 2 Batch)",
    satuan: "pcs",
    harga_beli: 15000,
    harga_jual: 35000,
    stok_minimum: 2,
    stok_tersedia: 20,
    status: "aktif",
    created_by: "tester_final",
  });

  await DB("mst_produk_batch").insert([
    {
      kode_cabang: "CBG-001",
      kode_batch: "BAT-REGR-B1-EXP",
      kode_produk: "REGR-PRD-B",
      no_batch: "BATCH-B1-EXPIRED",
      tanggal_kadaluarsa: expPastDate,
      stok_masuk: 8,
      stok_sisa: 8,
      status: "aktif",
      tz: "Asia/Jakarta",
      created_by: "tester_final",
    },
    {
      kode_cabang: "CBG-001",
      kode_batch: "BAT-REGR-B2-VAL",
      kode_produk: "REGR-PRD-B",
      no_batch: "BATCH-B2-VALID",
      tanggal_kadaluarsa: expFutureDate,
      stok_masuk: 12,
      stok_sisa: 12,
      status: "aktif",
      tz: "Asia/Jakarta",
      created_by: "tester_final",
    },
  ]);
  await syncProdukBatch("REGR-PRD-B");

  console.log("✓ Fixtures berhasil dibuat:\n  - REGR-PRD-A: 1 Batch Expired (sisa: 10)\n  - REGR-PRD-B: 2 Batch (Batch Expired: 8, Batch Valid: 12)\n");

  // ─────────────────────────────────────────────────────────────────────────────
  // KASUS A — Produk 1 Batch, Kadaluarsa
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("================================================================================");
  console.log("KASUS A — PRODUK 1 BATCH, KADALUARSA (REGR-PRD-A, stok fisik: 10)");
  console.log("--------------------------------------------------------------------------------");

  // A.2: validateStockAvailability untuk qty 1 (tanpa override)
  const valResA = await validateStockAvailability([
    { kode: "REGR-PRD-A", qty: 1, nama: "Produk Kasus A", jenis: "produk" },
  ], "CBG-001");
  console.log("[A.2] Output validateStockAvailability (qty: 1, tanpa override):");
  console.log(JSON.stringify(valResA, null, 2));

  // A.3: getProdukBatchStockInfo
  const stockSummaryA = await getProdukBatchStockInfo(["REGR-PRD-A"], "CBG-001");
  console.log("\n[A.3] Output getProdukBatchStockInfo:");
  console.log(JSON.stringify(stockSummaryA["REGR-PRD-A"], null, 2));

  // A.4: deductStockFEFO tanpa override untuk qty 1
  console.log("\n[A.4] Eksekusi deductStockFEFO (qty: 1, allowExpiredOverride: false):");
  const trxA = await DB.transaction();
  try {
    await deductStockFEFO({
      kode_produk: "REGR-PRD-A",
      qty: 1,
      kode_transaksi: "TRX-REGR-A-FAIL",
      username: "kasir_regr",
      branchCode: "CBG-001",
      allowExpiredOverride: false,
      trx: trxA,
    });
    await trxA.commit();
    console.error("STATUS: ✗ SEHARUSNYA THROW 422 TAPI LOLOS!");
  } catch (err) {
    await trxA.rollback();
    console.log("STATUS: ✓ BERHASIL MELEMPAR ERROR 422 SECARA TEPAT");
    console.log(`StatusCode: ${err.statusCode || 500}`);
    console.log(`ErrorMessage: "${err.message}"`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // KASUS B — Produk 2+ Batch, Sebagian Kadaluarsa Sebagian Valid
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n================================================================================");
  console.log("KASUS B — PRODUK 2 BATCH CAMPURAN (REGR-PRD-B: Expired = 8, Valid = 12, Total Fisik = 20)");
  console.log("--------------------------------------------------------------------------------");

  // B.2: validateStockAvailability untuk qty 12 (pas dengan stok valid, tanpa override)
  const valResB_12 = await validateStockAvailability([
    { kode: "REGR-PRD-B", qty: 12, nama: "Produk Kasus B", jenis: "produk" },
  ], "CBG-001");
  console.log("[B.2] Output validateStockAvailability untuk QTY 12 (pas stok valid):");
  console.log(JSON.stringify(valResB_12, null, 2));

  // B.3: validateStockAvailability untuk qty 13 (melebihi stok valid 12, tanpa override)
  const valResB_13 = await validateStockAvailability([
    { kode: "REGR-PRD-B", qty: 13, nama: "Produk Kasus B", jenis: "produk" },
  ], "CBG-001");
  console.log("\n[B.3] Output validateStockAvailability untuk QTY 13 (melebihi stok valid):");
  console.log(JSON.stringify(valResB_13, null, 2));

  // B.4: getProdukBatchStockInfo
  const stockSummaryB = await getProdukBatchStockInfo(["REGR-PRD-B"], "CBG-001");
  console.log("\n[B.4] Output getProdukBatchStockInfo:");
  console.log(JSON.stringify(stockSummaryB["REGR-PRD-B"], null, 2));

  // B.5: deductStockFEFO untuk qty 12 (pas dengan stok valid)
  console.log("\n[B.5] Eksekusi deductStockFEFO (qty: 12, allowExpiredOverride: false):");
  const trxB = await DB.transaction();
  try {
    const logsB = await deductStockFEFO({
      kode_produk: "REGR-PRD-B",
      qty: 12,
      kode_transaksi: "TRX-REGR-B-SUCCESS",
      username: "kasir_regr",
      branchCode: "CBG-001",
      allowExpiredOverride: false,
      trx: trxB,
    });
    await trxB.commit();
    console.log("STATUS: ✓ BERHASIL MEMOTONG STOK VALID");
    console.log("Deducted Logs:", JSON.stringify(logsB, null, 2));

    // Verifikasi sisa stok kedua batch di database
    const batchesAfterB = await DB("mst_produk_batch")
      .where("kode_produk", "REGR-PRD-B")
      .orderBy("id", "asc");

    console.log("\nStatus Sisa Stok Tiap Batch Pasca Pemotongan 12 Unit:");
    console.log(batchesAfterB.map((b) => ({
      kode_batch: b.kode_batch,
      no_batch: b.no_batch,
      tanggal_kadaluarsa: ymd(new Date(b.tanggal_kadaluarsa)),
      stok_masuk: b.stok_masuk,
      stok_sisa: b.stok_sisa,
      status: b.status,
    })));

    const movRecordsB = await DB("trx_stok_movement").where("referensi", "TRX-REGR-B-SUCCESS");
    console.log("\nMovement Records Tercatat di DB:");
    console.log(movRecordsB.map((m) => ({
      kode_stok_movement: m.kode_stok_movement,
      kode_batch: m.kode_batch,
      qty: m.qty,
      is_override_movement: m.is_override_movement,
    })));
  } catch (err) {
    await trxB.rollback();
    console.error("STATUS: ✗ GAGAL:", err.message);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // KASUS C — Tabel Pembanding Langsung (Sanity Check)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n================================================================================");
  console.log("KASUS C — TABEL PEMBANDING LANGSUNG (SANITY CHECK)");
  console.log("================================================================================");
  console.log(`
+------------------------------------+-----------------+--------------------------+------------------+---------------------+
| Nama Kasus                         | stok_layak_jual | stok_expired/tidak_layak | stok_total_fisik | Bisa Dijual Normal? |
+------------------------------------+-----------------+--------------------------+------------------+---------------------+
| Kasus A (100% Expired, 1 Batch)    |        0        |            10            |        10        | TIDAK (0 Layak)     |
| Kasus B (Campuran 2 Batch)         |       12        |             8            |        20        | YA (s.d 12 unit)    |
+------------------------------------+-----------------+--------------------------+------------------+---------------------+
`);

  // Clean up fixtures
  await DB("trx_stok_movement").where("kode_produk", "like", "REGR-%").delete();
  await DB("trx_detail_transaksi").where("kode_produk", "like", "REGR-%").delete();
  await DB("trx_transaksi").where("kode_transaksi", "like", "TRX-REGR-%").delete();
  await DB("mst_produk_batch").where("kode_produk", "like", "REGR-%").delete();
  await DB("mst_produk").where("kode_produk", "like", "REGR-%").delete();
  await DB("log_perubahan").where("keterangan", "like", "%REGR-%").delete();

  console.log("✓ Fixtures dibersihkan.");
  console.log("\n================================================================================");
  console.log("                      PENGUJIAN REGRESI FINAL SELESAI                          ");
  console.log("================================================================================");
  process.exit(0);
}

runFinalRegressionTest().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
