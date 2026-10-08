import DB from "../../core/config/knex.js";

async function setupData() {
  console.log("=== SETUP DATA UJI INVENTORI UI ===");

  // 1. Cek PRD-001 (Nivia men)
  const p1 = await DB("mst_produk").where("kode_produk", "PRD-001").first();
  console.log("PRD-001 existing:", p1?.nama, "stok_tersedia:", p1?.stok_tersedia);

  const b1 = await DB("mst_produk_batch").where("kode_produk", "PRD-001");
  console.log("PRD-001 batches count:", b1.length);
  b1.forEach(b => console.log(" - Batch:", b.no_batch, b.kode_batch, "exp:", b.tanggal_kadaluarsa, "sisa:", b.stok_sisa, "status:", b.status));

  // Pastikan PRD-001 punya persis 2 batch:
  // Batch 1: 10 pcs expired (24 Sep 2026)
  // Batch 2: 30 pcs valid (03 Mei 2027)
  await DB("mst_produk").where("kode_produk", "PRD-001").update({
    nama: "Nivia men",
    stok_tersedia: 40,
    stok_minimum: 5,
    harga_beli: 30000,
    harga_jual: 45000,
    status: "aktif"
  });

  // Hapus dan reset batch PRD-001 agar persis seperti di screenshot
  await DB("mst_produk_batch").where("kode_produk", "PRD-001").del();
  await DB("mst_produk_batch").insert([
    {
      kode_batch: "BTC-INIT-PRD-001",
      kode_produk: "PRD-001",
      no_batch: "BATCH-AWAL",
      tanggal_kadaluarsa: "2026-09-24",
      stok_masuk: 25,
      stok_sisa: 10,
      harga_beli_satuan: 30000,
      kode_supplier: "SUP-001",
      status: "aktif",
      kode_cabang: "CBG-001",
      is_legacy_estimate: 0
    },
    {
      kode_batch: "BTC-20261001-003",
      kode_produk: "PRD-001",
      no_batch: "LOT-2026-002",
      tanggal_kadaluarsa: "2027-05-03",
      stok_masuk: 30,
      stok_sisa: 30,
      harga_beli_satuan: 30000,
      kode_supplier: "SUP-001",
      kode_po: "PO-20261001-003",
      status: "aktif",
      kode_cabang: "CBG-001",
      is_legacy_estimate: 0
    }
  ]);

  // 2. Setup Produk Kasus 2: 100% Expired (PRD-EXP-100)
  const pExpCode = "PRD-EXP-100";
  await DB("mst_produk_batch").where("kode_produk", pExpCode).del();
  await DB("mst_produk").where("kode_produk", pExpCode).del();

  await DB("mst_produk").insert({
    kode_produk: pExpCode,
    nama: "Serum Anti Aging (Semua Kadaluarsa)",
    kode_kategori_produk: "KTP-001",
    kode_supplier: "SUP-001",
    satuan: "Botol",
    harga_beli: 50000,
    harga_jual: 85000,
    stok_minimum: 5,
    stok_tersedia: 15,
    status: "aktif",
    kode_cabang: "CBG-001"
  });

  await DB("mst_produk_batch").insert({
    kode_batch: "BTC-EXP-100-01",
    kode_produk: pExpCode,
    no_batch: "BATCH-EXP-ALL",
    tanggal_kadaluarsa: "2026-09-15",
    stok_masuk: 15,
    stok_sisa: 15,
    harga_beli_satuan: 50000,
    kode_supplier: "SUP-001",
    status: "aktif",
    kode_cabang: "CBG-001",
    is_legacy_estimate: 0
  });

  // 3. Setup Produk Kasus 3: 100% Valid (PRD-VAL-100)
  const pValCode = "PRD-VAL-100";
  await DB("mst_produk_batch").where("kode_produk", pValCode).del();
  await DB("mst_produk").where("kode_produk", pValCode).del();

  await DB("mst_produk").insert({
    kode_produk: pValCode,
    nama: "Facial Wash Fresh (Semua Valid)",
    kode_kategori_produk: "KTP-001",
    kode_supplier: "SUP-001",
    satuan: "Pcs",
    harga_beli: 25000,
    harga_jual: 40000,
    stok_minimum: 5,
    stok_tersedia: 50,
    status: "aktif",
    kode_cabang: "CBG-001"
  });

  await DB("mst_produk_batch").insert([
    {
      kode_batch: "BTC-VAL-100-01",
      kode_produk: pValCode,
      no_batch: "LOT-VAL-A",
      tanggal_kadaluarsa: "2027-08-10",
      stok_masuk: 20,
      stok_sisa: 20,
      harga_beli_satuan: 25000,
      kode_supplier: "SUP-001",
      status: "aktif",
      kode_cabang: "CBG-001",
      is_legacy_estimate: 0
    },
    {
      kode_batch: "BTC-VAL-100-02",
      kode_produk: pValCode,
      no_batch: "LOT-VAL-B",
      tanggal_kadaluarsa: "2027-12-25",
      stok_masuk: 30,
      stok_sisa: 30,
      harga_beli_satuan: 25000,
      kode_supplier: "SUP-001",
      status: "aktif",
      kode_cabang: "CBG-001",
      is_legacy_estimate: 0
    }
  ]);

  console.log("Setup 3 skenario selesai dengan sukses!");
  process.exit(0);
}

setupData().catch(e => {
  console.error(e);
  process.exit(1);
});
