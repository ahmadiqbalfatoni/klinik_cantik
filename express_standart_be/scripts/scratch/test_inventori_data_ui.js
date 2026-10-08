import DB from "../../core/config/knex.js";
import { getProdukBatchStockInfo } from "../../routes/v1/master/inventori/batch_helper.js";

async function testInventoriData() {
  console.log("=== PENGUJIAN INVENTORI DATA & STOK LAYAK JUAL ===");

  // 1. Setup produk uji
  const testProductCode = "PRD-TEST-UI-001";
  
  // Clean up if exists
  await DB("trx_stok_movement").where("kode_produk", testProductCode).del();
  await DB("mst_produk_batch").where("kode_produk", testProductCode).del();
  await DB("mst_produk").where("kode_produk", testProductCode).del();

  const today = new Date();
  const pastDate = new Date(today);
  pastDate.setDate(today.getDate() - 10);
  const futureDate = new Date(today);
  futureDate.setDate(today.getDate() + 180);

  const pastStr = pastDate.toISOString().slice(0, 10);
  const futureStr = futureDate.toISOString().slice(0, 10);

  // Insert master produk
  await DB("mst_produk").insert({
    kode_produk: testProductCode,
    nama: "Produk Uji UI Pemisahan Stok",
    kode_kategori_produk: "KTP-001",
    kode_supplier: "SUP-001",
    satuan: "Pcs",
    harga_beli: 30000,
    harga_jual: 45000,
    stok_minimum: 5,
    stok_tersedia: 40,
    status: "aktif",
    kode_cabang: "CBG-001"
  });

  // Batch 1: Expired (10 pcs)
  await DB("mst_produk_batch").insert({
    kode_batch: "BTC-TEST-EXP-001",
    kode_produk: testProductCode,
    no_batch: "BATCH-EXP-01",
    tanggal_kadaluarsa: pastStr,
    stok_masuk: 25,
    stok_sisa: 10,
    harga_beli_satuan: 30000,
    kode_supplier: "SUP-001",
    status: "aktif",
    kode_cabang: "CBG-001"
  });

  // Batch 2: Valid (30 pcs)
  await DB("mst_produk_batch").insert({
    kode_batch: "BTC-TEST-VAL-002",
    kode_produk: testProductCode,
    no_batch: "BATCH-VAL-02",
    tanggal_kadaluarsa: futureStr,
    stok_masuk: 30,
    stok_sisa: 30,
    harga_beli_satuan: 30000,
    kode_supplier: "SUP-001",
    status: "aktif",
    kode_cabang: "CBG-001"
  });

  // Panggil getProdukBatchStockInfo
  const stockInfo = await getProdukBatchStockInfo([testProductCode], "CBG-001");
  console.log("\nHasil getProdukBatchStockInfo untuk PRD-TEST-UI-001 (Kasus 1: Mixed 10 expired + 30 valid):");
  console.log(JSON.stringify(stockInfo, null, 2));

  // Ambil semua batches
  const batches = await DB("mst_produk_batch as b")
    .leftJoin("mst_supplier as s", "b.kode_supplier", "s.kode_supplier")
    .where("b.kode_produk", testProductCode)
    .select(
      "b.id",
      "b.kode_batch",
      "b.kode_produk",
      "b.no_batch",
      "b.tanggal_kadaluarsa",
      "b.stok_masuk",
      "b.stok_sisa",
      "b.harga_beli_satuan",
      "b.kode_supplier",
      "s.nama as nama_supplier",
      "b.status"
    )
    .orderBy("b.tanggal_kadaluarsa", "asc");

  const now = new Date();
  const processedBatches = batches.map(b => {
    let sisaHari = null;
    let statusExp = "aman";
    if (b.tanggal_kadaluarsa) {
      const expDate = new Date(b.tanggal_kadaluarsa);
      sisaHari = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (sisaHari < 0) statusExp = "kadaluarsa";
      else if (sisaHari <= 30) statusExp = "kritis";
      else if (sisaHari <= 90) statusExp = "perhatian";
      else statusExp = "aman";
    }

    // Status logic yang kita tetapkan untuk UI:
    const isHabis = b.status === "habis" || Number(b.stok_sisa) <= 0;
    const isKadaluarsa = statusExp === "kadaluarsa" || (sisaHari !== null && sisaHari < 0);
    let uiStatus = "AKTIF";
    let uiSeverity = "success";
    if (isHabis) {
      uiStatus = "HABIS";
      uiSeverity = "info";
    } else if (isKadaluarsa) {
      uiStatus = "KADALUARSA";
      uiSeverity = "danger";
    }

    return {
      no_batch: b.no_batch,
      tanggal_kadaluarsa: b.tanggal_kadaluarsa,
      sisa_hari: sisaHari,
      stok_sisa: b.stok_sisa,
      status_expired: statusExp,
      db_status: b.status,
      ui_status_badge: uiStatus,
      ui_severity: uiSeverity
    };
  });

  console.log("\nProses Batch UI untuk Baris Batch:");
  console.log(JSON.stringify(processedBatches, null, 2));

  // Uji Kasus 2: Semua batch kadaluarsa
  console.log("\n--- Uji Kasus 2: Semua Batch Kadaluarsa ---");
  await DB("mst_produk_batch").where("kode_batch", "BTC-TEST-VAL-002").update({
    tanggal_kadaluarsa: pastStr
  });
  const stockInfoCase2 = await getProdukBatchStockInfo([testProductCode], "CBG-001");
  console.log("Hasil Kasus 2 (Semua Expired):", JSON.stringify(stockInfoCase2, null, 2));

  // Uji Kasus 3: Semua batch valid
  console.log("\n--- Uji Kasus 3: Semua Batch Valid ---");
  await DB("mst_produk_batch").where("kode_batch", "BTC-TEST-EXP-001").update({
    tanggal_kadaluarsa: futureStr
  });
  await DB("mst_produk_batch").where("kode_batch", "BTC-TEST-VAL-002").update({
    tanggal_kadaluarsa: futureStr
  });
  const stockInfoCase3 = await getProdukBatchStockInfo([testProductCode], "CBG-001");
  console.log("Hasil Kasus 3 (Semua Valid):", JSON.stringify(stockInfoCase3, null, 2));

  // Clean up
  await DB("trx_stok_movement").where("kode_produk", testProductCode).del();
  await DB("mst_produk_batch").where("kode_produk", testProductCode).del();
  await DB("mst_produk").where("kode_produk", testProductCode).del();

  console.log("\n=== PENGUJIAN SELESAI ===");
  process.exit(0);
}

testInventoriData().catch((err) => {
  console.error("Error running test:", err);
  process.exit(1);
});
