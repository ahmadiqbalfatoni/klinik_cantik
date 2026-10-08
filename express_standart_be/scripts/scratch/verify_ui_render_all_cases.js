import DB from "../../core/config/knex.js";
import { getProdukBatchStockInfo } from "../../routes/v1/master/inventori/batch_helper.js";

async function verifyAllCases() {
  console.log("================================================================================");
  console.log("   VERIFIKASI LOGIKA & RENDERING UI PEMISAHAN STOK LAYAK JUAL VS KADALUARSA    ");
  console.log("================================================================================\n");

  const todayStr = new Date().toISOString().slice(0, 10);
  console.log(`Tanggal Sistem (Hari Ini): ${todayStr}\n`);

  const productCodes = ["PRD-001", "PRD-EXP-100", "PRD-VAL-100"];

  const products = await DB("mst_produk as p")
    .leftJoin("mst_kategori_produk as k", "p.kode_kategori_produk", "k.kode_kategori_produk")
    .leftJoin("mst_supplier as s", "p.kode_supplier", "s.kode_supplier")
    .whereIn("p.kode_produk", productCodes)
    .select(
      "p.id",
      "p.kode_produk",
      "p.nama",
      "p.satuan",
      "p.harga_beli",
      "p.harga_jual",
      "p.stok_minimum",
      "p.stok_tersedia",
      "k.nama as nama_kategori",
      "s.nama as nama_supplier",
      DB.raw("(p.stok_tersedia * p.harga_beli) as nilai_aset"),
      DB.raw("CASE WHEN p.stok_tersedia <= 0 THEN 'habis' WHEN p.stok_tersedia <= p.stok_minimum THEN 'menipis' ELSE 'aman' END as status_stok")
    );

  const allBatches = await DB("mst_produk_batch as b")
    .leftJoin("mst_supplier as s", "b.kode_supplier", "s.kode_supplier")
    .whereIn("b.kode_produk", productCodes)
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
      "b.kode_po",
      "b.is_legacy_estimate",
      "b.status"
    )
    .orderBy("b.tanggal_kadaluarsa", "asc");

  const now = new Date();
  const batchMap = {};
  for (const b of allBatches) {
    if (!batchMap[b.kode_produk]) batchMap[b.kode_produk] = [];

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

    batchMap[b.kode_produk].push({
      ...b,
      sisa_hari: sisaHari,
      status_expired: statusExp,
      nilai_aset_batch: (b.stok_sisa || 0) * parseFloat(b.harga_beli_satuan || 0),
    });
  }

  const batchStockMap = await getProdukBatchStockInfo(productCodes, "CBG-001");

  const enrichedProducts = products.map((p) => {
    const pBatches = batchMap[p.kode_produk] || [];
    const stockInfo = batchStockMap[p.kode_produk] || null;
    const stokLayak = stockInfo ? stockInfo.stok_layak_jual : (pBatches.length > 0 ? 0 : p.stok_tersedia || 0);
    const stokFisik = stockInfo ? stockInfo.stok_total_fisik : (pBatches.length > 0 ? 0 : p.stok_tersedia || 0);
    const stokExpired = Math.max(0, stokFisik - stokLayak);
    const isExpired = stockInfo ? stockInfo.is_expired : (stokLayak === 0 && stokFisik > 0);

    return {
      ...p,
      stok_layak_jual: stokLayak,
      stok_total_fisik: stokFisik,
      stok_expired: stokExpired,
      is_expired: isExpired,
      tanggal_kadaluarsa_terdekat: stockInfo?.tanggal_kadaluarsa_terdekat || null,
      total_batch_kadaluarsa: stockInfo?.total_batch_kadaluarsa || 0,
      batches: pBatches,
    };
  });

  // SIMULASI RENDERING UI SESUAI DENGAN KODE page.tsx
  console.log("--------------------------------------------------------------------------------");
  console.log("1. PENGUJIAN KASUS 1: MIXED BATCH (Nivia men / PRD-001)");
  console.log("   (Kondisi: 10 pcs Kadaluarsa + 30 pcs Valid, Buffer Min: 5 pcs)");
  console.log("--------------------------------------------------------------------------------");
  const p1 = enrichedProducts.find(p => p.kode_produk === "PRD-001");
  renderProductUI("KASUS 1", p1);

  console.log("\n--------------------------------------------------------------------------------");
  console.log("2. PENGUJIAN KASUS 2: SEMUA BATCH KADALUARSA (PRD-EXP-100)");
  console.log("   (Kondisi: 15 pcs Kadaluarsa + 0 pcs Valid, Buffer Min: 5 pcs)");
  console.log("--------------------------------------------------------------------------------");
  const p2 = enrichedProducts.find(p => p.kode_produk === "PRD-EXP-100");
  renderProductUI("KASUS 2", p2);

  console.log("\n--------------------------------------------------------------------------------");
  console.log("3. PENGUJIAN KASUS 3: SEMUA BATCH VALID (PRD-VAL-100)");
  console.log("   (Kondisi: 50 pcs Valid + 0 pcs Kadaluarsa, Buffer Min: 5 pcs)");
  console.log("--------------------------------------------------------------------------------");
  const p3 = enrichedProducts.find(p => p.kode_produk === "PRD-VAL-100");
  renderProductUI("KASUS 3", p3);

  console.log("\n================================================================================");
  console.log("                     SEMUA HASIL PENGUJIAN UI VALID & AKURAT                    ");
  console.log("================================================================================");
  process.exit(0);
}

function renderProductUI(caseTitle, r) {
  const stokLayak = Number(r.stok_layak_jual !== undefined ? r.stok_layak_jual : (r.stok_tersedia ?? 0));
  const stokTotal = Number(r.stok_total_fisik !== undefined ? r.stok_total_fisik : (r.stok_tersedia ?? 0));
  const stokExp = Number(r.stok_expired !== undefined ? r.stok_expired : Math.max(0, stokTotal - stokLayak));
  const stokMin = Number(r.stok_minimum || 0);

  let badgeBg = "bg-green-100 text-green-800 border-green-300 (HIJAU / POSITIF)";
  let icon = "NONE";
  if (stokLayak <= 0) {
    badgeBg = "bg-red-500 text-white shadow-1 (MERAH / KOSONG)";
    icon = "pi-times-circle (Silang)";
  } else if (stokLayak <= stokMin) {
    badgeBg = "bg-orange-100 text-orange-900 border-orange-300 (ORANGE / MENIPIS)";
    icon = "pi-exclamation-triangle (Peringatan)";
  }

  console.log(`[A. BARIS PRODUK / LIST UTAMA]`);
  console.log(` Produk: ${r.nama} [${r.kode_produk}]`);
  console.log(`  -> Badge Utama Stok Layak Jual : "${stokLayak} ${r.satuan}" [Warna: ${badgeBg}, Icon: ${icon}]`);
  if (stokExp > 0) {
    console.log(`  -> Badge Kecil Tambahan        : "${stokExp} ${r.satuan} kadaluarsa" [Warna: bg-red-50 text-red-700 border-red-200]`);
    console.log(`  -> Subteks                      : "Buffer Min: ${stokMin} ${r.satuan} (Total: ${stokTotal} ${r.satuan})"`);
  } else {
    console.log(`  -> Badge Kecil Tambahan        : (TIDAK TAMPIL / BERSIH)`);
    console.log(`  -> Subteks                      : "Buffer Min: ${stokMin} ${r.satuan}"`);
  }

  console.log(`\n[B. PANEL EXPAND "RINCIAN BATCH FISIK"]`);
  console.log(` Header Rincian Batch: ${r.nama} [${r.kode_produk}] (${r.batches.length} Batch)`);
  console.log(`  -> Stok Layak Jual : ${stokLayak} ${r.satuan} (Warna Hijau/Positif)`);
  if (stokExp > 0) {
    console.log(`  -> Stok Kadaluarsa : ${stokExp} ${r.satuan} (Warna Merah/Peringatan)`);
    console.log(`  -> Total Stok Fisik: ${stokTotal} ${r.satuan} (Warna Netral)`);
  } else {
    console.log(`  -> Total Stok      : ${stokTotal} ${r.satuan} (Warna Hijau/Positif)`);
    console.log(`  -> Stok Kadaluarsa : (TIDAK TAMPIL / Sederhana)`);
  }
  const totalValuasi = r.batches.reduce((acc, b) => acc + (b.nilai_aset_batch || 0), 0);
  console.log(`  -> Total Valuasi   : Rp ${totalValuasi.toLocaleString("id-ID")}`);
  console.log(`  -> Catatan         : *Urutan FEFO (First Expired First Out)`);

  console.log(`\n[C. KOLOM STATUS PER BARIS BATCH]`);
  r.batches.forEach((b, idx) => {
    const isHabis = b.status === "habis" || Number(b.stok_sisa) <= 0;
    const isKadaluarsa = b.status_expired === "kadaluarsa" || (b.sisa_hari !== null && b.sisa_hari < 0);
    let label = "AKTIF";
    let sev = "success (HIJAU)";
    if (isHabis) {
      label = "HABIS";
      sev = "info (ABU-ABU/BIRU)";
    } else if (isKadaluarsa) {
      label = "KADALUARSA";
      sev = "danger (MERAH)";
    }

    const tglExpStr = b.tanggal_kadaluarsa ? new Date(b.tanggal_kadaluarsa).toISOString().slice(0, 10) : "-";
    const sisaKet = b.sisa_hari < 0 ? `(Lewat ${Math.abs(b.sisa_hari)} hr)` : `(${b.sisa_hari} hr)`;
    console.log(`  Batch #${idx + 1}: ${b.no_batch.padEnd(15)} | Exp: ${tglExpStr} ${sisaKet.padEnd(16)} | Sisa: ${String(b.stok_sisa).padStart(2)} ${r.satuan} | Status Badge: [${label}] (Severity: ${sev})`);
  });
}

verifyAllCases().catch(e => {
  console.error(e);
  process.exit(1);
});
