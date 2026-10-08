/**
 * @copyright (c) 2026 PT Marstech Global (info@marstech.co.id)
 * @project Sistem Klinik Kecantikan
 * @file test_include_konsultasi_scenarios.js
 * @description Automated Verification Script for all 5 Business Scenarios of "Include vs Non-Include Biaya Konsultasi"
 */

import assert from "assert";

/**
 * Pure logic simulation of getCompletedItemsForKasir matching express_standart_be/routes/v1/master/kasir/kasir_sync_service.js
 */
function simulateKasirSync(rawItems, childQueues) {
  // 1. Map relasi antrean induk -> antrean anak rujukan yang statusnya include
  const includeParentMap = new Map();
  for (const cq of childQueues) {
    const isInclude = cq.lay_include === 1 || cq.lay_include === "1" || cq.pkt_include === 1 || cq.pkt_include === "1";
    if (isInclude && cq.kode_antrian_asal && !includeParentMap.has(cq.kode_antrian_asal)) {
      includeParentMap.set(cq.kode_antrian_asal, cq);
    }
  }

  // 2. Kalkulasi Gross - Diskon - Net
  return rawItems.map((item) => {
    const isConsultationQueue = Boolean(item.is_konsultasi) ||
      (item.nama_layanan || "").toLowerCase().includes("konsul") ||
      (item.kode_layanan || "").toLowerCase().includes("konsul");

    const matchedIncludeChild = includeParentMap.get(item.kode_antrian_layanan);

    if (isConsultationQueue && matchedIncludeChild) {
      // Skenario INCLUDE (is_include_konsultasi = 1)
      const hargaAsli = parseFloat(item.master_harga_layanan || item.harga || 0);
      return {
        ...item,
        is_free_include: true,
        harga_satuan_gross: hargaAsli,
        harga: 0,
        diskon: hargaAsli,
        jenis_diskon: "include_treatment",
        nilai_diskon: hargaAsli,
        nama_promo: `Gratis (Include ${matchedIncludeChild.nama_layanan})`,
        subtotal_setelah_diskon: 0,
      };
    }

    // Skenario NON-INCLUDE / NORMAL / HANYA KONSULTASI
    const rawHarga = parseFloat(item.master_harga_layanan || item.master_harga_paket || item.master_harga_produk || item.harga || 0);
    return {
      ...item,
      is_free_include: false,
      harga_satuan_gross: rawHarga,
      harga: rawHarga,
      diskon: 0,
      jenis_diskon: null,
      nilai_diskon: 0,
      nama_promo: null,
      subtotal_setelah_diskon: rawHarga * (item.qty || 1),
    };
  });
}

function runTests() {
  console.log("================================================================================");
  console.log("🧪 RUNNING AUDIT TEST SUITE: INCLUDE VS NON-INCLUDE BIAYA KONSULTASI");
  console.log("================================================================================\n");

  const TARIF_KONSUL = 100000;
  const TARIF_LASER_INCLUDE = 500000;
  const TARIF_FACIAL_NON_INCLUDE = 150000;

  // -------------------------------------------------------------------------
  // KASUS 1A: Pasien Konsul Dulu -> Dirujuk Tindakan INCLUDE (is_include = 1)
  // -------------------------------------------------------------------------
  console.log("▶ [Test 1A] Pasien Konsul Dulu -> Dokter Rujuk Tindakan INCLUDE (is_include = 1)");
  {
    const rawItems = [
      { kode_antrian_layanan: "AL-001", kode_layanan: "LAY-KONSUL", nama_layanan: "Konsultasi Dokter Spesialis", is_konsultasi: 1, master_harga_layanan: TARIF_KONSUL, qty: 1 },
      { kode_antrian_layanan: "AL-002", kode_layanan: "LAY-LASER", nama_layanan: "Laser Rejuvenation", is_konsultasi: 0, master_harga_layanan: TARIF_LASER_INCLUDE, qty: 1 }
    ];
    const childQueues = [
      { kode_antrian_layanan: "AL-002", kode_antrian_asal: "AL-001", kode_layanan: "LAY-LASER", nama_layanan: "Laser Rejuvenation", lay_include: 1 }
    ];

    const result = simulateKasirSync(rawItems, childQueues);
    const konsulItem = result.find((i) => i.kode_antrian_layanan === "AL-001");
    const tindakanItem = result.find((i) => i.kode_antrian_layanan === "AL-002");
    const totalBayar = result.reduce((sum, i) => sum + i.subtotal_setelah_diskon, 0);

    assert.strictEqual(konsulItem.harga_satuan_gross, TARIF_KONSUL, "Gross konsul wajib 100.000");
    assert.strictEqual(konsulItem.diskon, TARIF_KONSUL, "Diskon konsul wajib 100%");
    assert.strictEqual(konsulItem.subtotal_setelah_diskon, 0, "Subtotal net konsul wajib Rp 0");
    assert.strictEqual(konsulItem.jenis_diskon, "include_treatment", "Jenis diskon wajib 'include_treatment'");
    assert.strictEqual(tindakanItem.subtotal_setelah_diskon, TARIF_LASER_INCLUDE, "Tindakan wajib bayar penuh");
    assert.strictEqual(totalBayar, TARIF_LASER_INCLUDE, "Total bayar pasien HANYA harga tindakan (500.000)");

    console.log("   ✅ PASSED: Konsultasi Gross Rp 100.000, Diskon Rp 100.000, Net Rp 0. Total Tagihan: Rp " + totalBayar.toLocaleString("id-ID"));
  }

  // -------------------------------------------------------------------------
  // KASUS 1B: Pasien Konsul Dulu -> Dirujuk Tindakan NON-INCLUDE (is_include = 0)
  // -------------------------------------------------------------------------
  console.log("\n▶ [Test 1B] Pasien Konsul Dulu -> Dokter Rujuk Tindakan NON-INCLUDE (is_include = 0)");
  {
    const rawItems = [
      { kode_antrian_layanan: "AL-003", kode_layanan: "LAY-KONSUL", nama_layanan: "Konsultasi Dokter Umum", is_konsultasi: 1, master_harga_layanan: TARIF_KONSUL, qty: 1 },
      { kode_antrian_layanan: "AL-004", kode_layanan: "LAY-FACIAL", nama_layanan: "Basic Facial Care", is_konsultasi: 0, master_harga_layanan: TARIF_FACIAL_NON_INCLUDE, qty: 1 }
    ];
    const childQueues = [
      { kode_antrian_layanan: "AL-004", kode_antrian_asal: "AL-003", kode_layanan: "LAY-FACIAL", nama_layanan: "Basic Facial Care", lay_include: 0 }
    ];

    const result = simulateKasirSync(rawItems, childQueues);
    const konsulItem = result.find((i) => i.kode_antrian_layanan === "AL-003");
    const tindakanItem = result.find((i) => i.kode_antrian_layanan === "AL-004");
    const totalBayar = result.reduce((sum, i) => sum + i.subtotal_setelah_diskon, 0);

    assert.strictEqual(konsulItem.subtotal_setelah_diskon, TARIF_KONSUL, "Konsul ditagihkan normal");
    assert.strictEqual(tindakanItem.subtotal_setelah_diskon, TARIF_FACIAL_NON_INCLUDE, "Tindakan ditagihkan normal");
    assert.strictEqual(totalBayar, TARIF_KONSUL + TARIF_FACIAL_NON_INCLUDE, "Total bayar pasien wajib Konsul + Tindakan (250.000)");

    console.log("   ✅ PASSED: Konsultasi Rp 100.000 + Tindakan Rp 150.000 = Total Rp " + totalBayar.toLocaleString("id-ID"));
  }

  // -------------------------------------------------------------------------
  // KASUS 1C: Pasien Konsul Murni / Batal Tindakan (Tidak ada antrean anak rujukan)
  // -------------------------------------------------------------------------
  console.log("\n▶ [Test 1C] Pasien Konsul Murni / Batal Tindakan (Tanpa antrean rujukan selesai)");
  {
    const rawItems = [
      { kode_antrian_layanan: "AL-005", kode_layanan: "LAY-KONSUL", nama_layanan: "Konsultasi Dokter Spesialis", is_konsultasi: 1, master_harga_layanan: TARIF_KONSUL, qty: 1 }
    ];
    const childQueues = []; // Tidak ada tindakan rujukan

    const result = simulateKasirSync(rawItems, childQueues);
    const konsulItem = result[0];
    const totalBayar = result.reduce((sum, i) => sum + i.subtotal_setelah_diskon, 0);

    assert.strictEqual(konsulItem.subtotal_setelah_diskon, TARIF_KONSUL, "Konsultasi murni wajib bayar 100.000");
    assert.strictEqual(totalBayar, TARIF_KONSUL, "Total bayar 1 layanan jasa konsul");

    console.log("   ✅ PASSED: Tagihan hanya Jasa Konsultasi Rp " + totalBayar.toLocaleString("id-ID"));
  }

  // -------------------------------------------------------------------------
  // KASUS 2A: Pintu Masuk 2 -> Tindakan INCLUDE Centang Lewat Konsul
  // -------------------------------------------------------------------------
  console.log("\n▶ [Test 2A] Pintu Masuk 2 -> Tindakan INCLUDE Dipilih (Centang Opsi Lewat Konsul)");
  {
    // Terbuat AL-006 (Konsul Induk) dan AL-007 (Tindakan Laser Include)
    const rawItems = [
      { kode_antrian_layanan: "AL-006", kode_layanan: "LAY-KONSUL", nama_layanan: "Pemeriksaan Awal Dokter", is_konsultasi: 1, master_harga_layanan: TARIF_KONSUL, qty: 1 },
      { kode_antrian_layanan: "AL-007", kode_layanan: "LAY-LASER", nama_layanan: "Laser Rejuvenation", is_konsultasi: 0, master_harga_layanan: TARIF_LASER_INCLUDE, qty: 1 }
    ];
    const childQueues = [
      { kode_antrian_layanan: "AL-007", kode_antrian_asal: "AL-006", kode_layanan: "LAY-LASER", nama_layanan: "Laser Rejuvenation", lay_include: 1 }
    ];

    const result = simulateKasirSync(rawItems, childQueues);
    const konsulItem = result.find((i) => i.kode_antrian_layanan === "AL-006");
    const totalBayar = result.reduce((sum, i) => sum + i.subtotal_setelah_diskon, 0);

    assert.strictEqual(konsulItem.subtotal_setelah_diskon, 0, "Konsultasi otomatis Rp 0");
    assert.strictEqual(totalBayar, TARIF_LASER_INCLUDE, "Total tagihan persis harga tindakan (500.000)");

    console.log("   ✅ PASSED: Tagihan tetap sesuai harga tindakan Rp " + totalBayar.toLocaleString("id-ID") + " (Konsultasi Rp 0)");
  }

  // -------------------------------------------------------------------------
  // KASUS 2B: Pintu Masuk 2 -> Tindakan NON-INCLUDE Dipilih (Centang Opsi Lewat Konsul)
  // -------------------------------------------------------------------------
  console.log("\n▶ [Test 2B] Pintu Masuk 2 -> Tindakan NON-INCLUDE Dipilih (Centang Opsi Lewat Konsul)");
  {
    // Terbuat AL-008 (Konsul Induk) dan AL-009 (Tindakan Facial Non-Include)
    const rawItems = [
      { kode_antrian_layanan: "AL-008", kode_layanan: "LAY-KONSUL", nama_layanan: "Pemeriksaan Dokter", is_konsultasi: 1, master_harga_layanan: TARIF_KONSUL, qty: 1 },
      { kode_antrian_layanan: "AL-009", kode_layanan: "LAY-FACIAL", nama_layanan: "Basic Facial Care", is_konsultasi: 0, master_harga_layanan: TARIF_FACIAL_NON_INCLUDE, qty: 1 }
    ];
    const childQueues = [
      { kode_antrian_layanan: "AL-009", kode_antrian_asal: "AL-008", kode_layanan: "LAY-FACIAL", nama_layanan: "Basic Facial Care", lay_include: 0 }
    ];

    const result = simulateKasirSync(rawItems, childQueues);
    const totalBayar = result.reduce((sum, i) => sum + i.subtotal_setelah_diskon, 0);

    assert.strictEqual(totalBayar, TARIF_KONSUL + TARIF_FACIAL_NON_INCLUDE, "Kasir menambahkan biaya konsul (250.000)");

    console.log("   ✅ PASSED: Tagihan ditambahkan biaya konsultasi. Total Rp " + totalBayar.toLocaleString("id-ID"));
  }

  console.log("\n================================================================================");
  console.log("🎉 ALL 5 BUSINESS RULES AUDIT & TEST CASES COMPLETED SUCCESSFULLY!");
  console.log("================================================================================\n");
}

runTests();
