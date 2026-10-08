import DB from "../../../../core/config/knex.js";
import { formatDateSystem } from "../../components/tools/date_tools.js";
import { ChangesLog } from "../../components/tools/servertool.js";

/**
 * Sinkronisasi total stok dan info batch terdekat ke tabel mst_produk
 * @param {string} kodeProduk
 * @param {object} trx Knex transaction instance (optional)
 */
export async function syncProdukBatch(kodeProduk, trx = null) {
  const db = trx || DB;

  // 1. Hitung total sisa stok dari seluruh batch aktif
  const sumRes = await db("mst_produk_batch")
    .where("kode_produk", kodeProduk)
    .where("status", "aktif")
    .sum("stok_sisa as total_stok")
    .first();

  const totalStok = parseInt(sumRes?.total_stok || 0, 10);

  // 2. Cari batch aktif terdekat yang akan kadaluarsa (FEFO summary)
  const nearestBatch = await db("mst_produk_batch")
    .where("kode_produk", kodeProduk)
    .where("status", "aktif")
    .where("stok_sisa", ">", 0)
    .orderBy("tanggal_kadaluarsa", "asc")
    .orderBy("created_at", "asc")
    .first();

  const updateData = {
    stok_tersedia: totalStok,
    no_batch: nearestBatch ? nearestBatch.no_batch : null,
    tanggal_kadaluarsa: nearestBatch ? nearestBatch.tanggal_kadaluarsa : null,
    updated_at: formatDateSystem(),
  };

  await db("mst_produk").where("kode_produk", kodeProduk).update(updateData);

  return {
    totalStok,
    nearestBatch,
  };
}

/**
 * Validasi awal ketersediaan stok produk sebelum simpan draft/bayar
 * @param {Array} items List item transaksi [{ kode, qty, nama, jenis, is_expired_override, produk_expired_override, allow_expired_override }]
 * @param {string} branchCode Kode cabang
 * @param {object} trx Knex transaction instance (optional)
 * @param {boolean} allowGlobalOverride Flag override global opsional
 */
export async function validateStockAvailability(items, branchCode = null, trx = null, allowGlobalOverride = false) {
  const db = trx || DB;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return { valid: true };
  }

  // Agregasi kebutuhan qty per kode_produk
  const productReqMap = {};
  for (const it of items) {
    const isProduct = it.jenis === "produk" || (!it.is_from_pendaftaran && !it.jenis && it.kode_produk);
    const prodCode = it.kode || it.kode_produk;

    if (isProduct && prodCode && !prodCode.startsWith("CUSTOM-") && !prodCode.startsWith("CST-")) {
      const qty = parseInt(it.qty || 1, 10);
      const isOverride = Boolean(it.is_expired_override || it.produk_expired_override || it.allow_expired_override || allowGlobalOverride);
      if (!productReqMap[prodCode]) {
        productReqMap[prodCode] = {
          qty: 0,
          nama: it.nama || it.nama_produk || prodCode,
          allowOverride: isOverride,
        };
      } else {
        if (isOverride) {
          productReqMap[prodCode].allowOverride = true;
        }
      }
      productReqMap[prodCode].qty += qty;
    }
  }

  // Periksa ketersediaan setiap produk dari mst_produk_batch
  for (const [prodCode, req] of Object.entries(productReqMap)) {
    // 1. Cek stok layak jual (batch valid >= CURDATE())
    let qValidBatch = db("mst_produk_batch")
      .where("kode_produk", prodCode)
      .where("status", "aktif")
      .where("stok_sisa", ">", 0)
      .where("tanggal_kadaluarsa", ">=", db.raw("CURDATE()"));

    if (branchCode) {
      qValidBatch = qValidBatch.andWhere("kode_cabang", branchCode);
    }

    const sumValidRes = await qValidBatch.sum("stok_sisa as total_valid").first();
    const validStock = parseInt(sumValidRes?.total_valid || 0, 10);

    if (validStock >= req.qty) {
      // Stok layak jual mencukupi tanpa perlu override
      continue;
    }

    // 2. Stok layak jual tidak mencukupi. Hitung stok kadaluarsa yang ada
    let qExpiredBatch = db("mst_produk_batch")
      .where("kode_produk", prodCode)
      .where("status", "aktif")
      .where("stok_sisa", ">", 0)
      .where("tanggal_kadaluarsa", "<", db.raw("CURDATE()"));

    if (branchCode) {
      qExpiredBatch = qExpiredBatch.andWhere("kode_cabang", branchCode);
    }

    const sumExpiredRes = await qExpiredBatch.sum("stok_sisa as total_expired").first();
    const expiredStock = parseInt(sumExpiredRes?.total_expired || 0, 10);
    const totalPhysicalStock = validStock + expiredStock;

    if (req.allowOverride) {
      // Jika override diizinkan: pastikan total fisik (valid + expired) mencukupi
      if (totalPhysicalStock < req.qty) {
        return {
          valid: false,
          kode_produk: prodCode,
          nama_produk: req.nama,
          stok_tersedia: totalPhysicalStock,
          stok_layak_jual: validStock,
          stok_expired: expiredStock,
          stok_diminta: req.qty,
          can_override: false,
          message: `Total stok fisik produk "${req.nama}" tidak mencukupi (total fisik: ${totalPhysicalStock}, diminta: ${req.qty}).`,
        };
      }
      // Total fisik cukup dan override diizinkan -> valid
      continue;
    } else {
      // Override tidak diizinkan: tolak dengan pesan yang informatif
      return {
        valid: false,
        kode_produk: prodCode,
        nama_produk: req.nama,
        stok_tersedia: validStock,
        stok_layak_jual: validStock,
        stok_expired: expiredStock,
        stok_diminta: req.qty,
        // can_override: MURNI indikasi kelayakan stok fisik (ada stok expired fisik yang cukup menutup kekurangan),
        // BUKAN izin otorisasi pengguna. Izin otorisasi pengguna tetap divalidasi ketat di endpoint backend berdasarkan role.
        can_override: expiredStock > 0 && totalPhysicalStock >= req.qty,
        message: expiredStock > 0
          ? `Stok layak jual produk "${req.nama}" tidak mencukupi. Tersedia layak jual: ${validStock}, Diminta: ${req.qty}. (Terdapat ${expiredStock} unit kadaluarsa yang membutuhkan persetujuan override)`
          : `Stok layak jual produk "${req.nama}" tidak mencukupi. Tersedia layak jual: ${validStock}, Diminta: ${req.qty}.`,
      };
    }
  }

  return { valid: true };
}

/**
 * Potong stok produk menggunakan algoritma FEFO (First Expired First Out)
 * @param {object} params
 * @param {string} params.kode_produk
 * @param {number} params.qty
 * @param {string} params.kode_transaksi
 * @param {string} params.username
 * @param {string} params.branchCode
 * @param {string} params.tz
 * @param {boolean} params.allowExpiredOverride Flag izin memotong batch expired jika batch valid kurang
 * @param {string|null} params.catatanOverride Catatan/alasan override batch kadaluarsa
 * @param {object} params.trx Knex transaction instance (REQUIRED)
 */
export async function deductStockFEFO({
  kode_produk,
  qty,
  kode_transaksi,
  username,
  branchCode,
  tz = "UTC",
  allowExpiredOverride = false,
  catatanOverride = null,
  trx,
}) {
  if (!trx) {
    throw new Error("deductStockFEFO memerlukan transaksi database aktif (trx)");
  }

  if (kode_produk.startsWith("CUSTOM-") || kode_produk.startsWith("CST-")) {
    return []; // Item custom tidak memiliki stok fisik
  }

  const reqQty = parseInt(qty, 10);
  if (reqQty <= 0) return [];

  // 1. Ambil semua batch aktif yang valid (tanggal_kadaluarsa >= CURDATE()), urutkan FEFO (tanggal_kadaluarsa ASC, created_at ASC)
  let qValidBatches = trx("mst_produk_batch")
    .where("kode_produk", kode_produk)
    .where("status", "aktif")
    .where("stok_sisa", ">", 0)
    .where("tanggal_kadaluarsa", ">=", trx.raw("CURDATE()"));

  if (branchCode) {
    qValidBatches = qValidBatches.andWhere("kode_cabang", branchCode);
  }

  const validBatches = await qValidBatches
    .orderBy("tanggal_kadaluarsa", "asc")
    .orderBy("created_at", "asc")
    .forUpdate();

  const totalValidAvailable = validBatches.reduce((acc, b) => acc + parseInt(b.stok_sisa || 0, 10), 0);

  let expiredBatches = [];
  let totalExpiredAvailable = 0;

  if (allowExpiredOverride && totalValidAvailable < reqQty) {
    // Ambil batch expired (tanggal_kadaluarsa < CURDATE()), urutkan FEFO terdekat (tanggal_kadaluarsa ASC, created_at ASC)
    let qExpiredBatches = trx("mst_produk_batch")
      .where("kode_produk", kode_produk)
      .where("status", "aktif")
      .where("stok_sisa", ">", 0)
      .where("tanggal_kadaluarsa", "<", trx.raw("CURDATE()"));

    if (branchCode) {
      qExpiredBatches = qExpiredBatches.andWhere("kode_cabang", branchCode);
    }

    expiredBatches = await qExpiredBatches
      .orderBy("tanggal_kadaluarsa", "asc")
      .orderBy("created_at", "asc")
      .forUpdate();

    totalExpiredAvailable = expiredBatches.reduce((acc, b) => acc + parseInt(b.stok_sisa || 0, 10), 0);
  }

  const totalPhysicalAvailable = totalValidAvailable + totalExpiredAvailable;

  // Validasi kecukupan stok sesuai mode override
  if (!allowExpiredOverride) {
    if (totalValidAvailable < reqQty) {
      const prod = await trx("mst_produk").where("kode_produk", kode_produk).first();
      const prodName = prod?.nama || kode_produk;
      const err = new Error(`Stok layak jual tidak mencukupi untuk ${prodName} (tersedia: ${totalValidAvailable}, diminta: ${reqQty})`);
      err.statusCode = 422;
      throw err;
    }
  } else {
    if (totalPhysicalAvailable < reqQty) {
      const prod = await trx("mst_produk").where("kode_produk", kode_produk).first();
      const prodName = prod?.nama || kode_produk;
      const err = new Error(`Total stok fisik tidak mencukupi untuk ${prodName} (total fisik termasuk kadaluarsa: ${totalPhysicalAvailable}, diminta: ${reqQty})`);
      err.statusCode = 422;
      throw err;
    }
  }

  // Gabungkan batch yang akan dipotong: Dahulukan batch valid, lalu batch expired jika ada sisa kekurangan
  const batchesToDeduct = [...validBatches, ...expiredBatches];

  let remainingToDeduct = reqQty;
  const deductedLogs = [];
  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  // Ambil sequence mutasi terakhir hari ini
  const lastMov = await trx("trx_stok_movement")
    .where("kode_stok_movement", "like", `MOV-${todayStr}-%`)
    .orderBy("kode_stok_movement", "desc")
    .select("kode_stok_movement")
    .first();

  let movSeq = lastMov ? parseInt(lastMov.kode_stok_movement.split("-").pop(), 10) + 1 : 1;

  for (const batch of batchesToDeduct) {
    if (remainingToDeduct <= 0) break;

    const currentBatchSisa = parseInt(batch.stok_sisa, 10);
    const deductAmount = Math.min(currentBatchSisa, remainingToDeduct);
    const newBatchSisa = currentBatchSisa - deductAmount;
    const newBatchStatus = newBatchSisa <= 0 ? "habis" : "aktif";

    // Update batch sisa stok & status
    await trx("mst_produk_batch")
      .where("id", batch.id)
      .update({
        stok_sisa: newBatchSisa,
        status: newBatchStatus,
        updated_by: username,
        updated_at: DB.fn.now(),
      });

    // Generate kode mutasi
    const kodeMovement = `MOV-${todayStr}-${String(movSeq).padStart(3, "0")}`;
    movSeq++;

    // Cek apakah batch ini adalah batch expired
    const isExpiredBatch = expiredBatches.some((eb) => eb.id === batch.id);
    const isOverrideMovement = isExpiredBatch ? 1 : 0;
    const movementCatatan = isExpiredBatch
      ? (catatanOverride || "Override batch kadaluarsa disetujui")
      : null;

    // Catat kartu stok / log mutasi keluar
    const movementRow = {
      kode_cabang: branchCode || batch.kode_cabang || "CBG-001",
      kode_stok_movement: kodeMovement,
      kode_produk: kode_produk,
      kode_batch: batch.kode_batch,
      jenis_movement: "keluar",
      is_override_movement: isOverrideMovement,
      catatan: movementCatatan,
      referensi: kode_transaksi,
      qty: deductAmount,
      stok_sebelum: currentBatchSisa,
      stok_sesudah: newBatchSisa,
      tanggal: formatDateSystem(),
      tz: tz,
      created_by: username,
      created_at: formatDateSystem(),
      updated_by: username,
      updated_at: formatDateSystem(),
    };

    await trx("trx_stok_movement").insert(movementRow);

    // Audit Trail: Jika memotong dari batch expired, catat ke ChangesLog (Langkah 7)
    if (isExpiredBatch) {
      await ChangesLog({
        description: `Pemotongan Stok Batch Kadaluarsa (Kasir): Produk ${kode_produk}, Batch ${batch.kode_batch} (${batch.no_batch || "-"}), Qty ${deductAmount}, Referensi ${kode_transaksi} (${movementCatatan})`,
        tableName: "trx_stok_movement",
        referenceCode: kodeMovement,
        action: "CREATE",
        dataBefore: { stok_sebelum: currentBatchSisa },
        dataAfter: {
          kode_transaksi,
          kode_produk,
          kode_batch: batch.kode_batch,
          qty_potong: deductAmount,
          stok_sesudah: newBatchSisa,
          is_override_movement: 1,
          catatan: movementCatatan,
        },
        user: username,
        tz: tz || "Asia/Jakarta",
      }, trx);
    }

    deductedLogs.push({
      kode_batch: batch.kode_batch,
      no_batch: batch.no_batch,
      tanggal_kadaluarsa: batch.tanggal_kadaluarsa,
      qty_potong: deductAmount,
      sisa_setelah_potong: newBatchSisa,
      is_expired_override: isExpiredBatch,
    });

    remainingToDeduct -= deductAmount;
  }

  // Sinkronkan ke master produk
  await syncProdukBatch(kode_produk, trx);

  return deductedLogs;
}

/**
 * Kembalikan stok yang sebelumnya dipotong jika transaksi dibatalkan / void
 * @param {string} kodeTransaksi
 * @param {string} username
 * @param {object} trx Knex transaction instance (REQUIRED)
 */
export async function restoreStockFEFO({ kodeTransaksi, username, trx }) {
  if (!trx) {
    throw new Error("restoreStockFEFO memerlukan transaksi database aktif (trx)");
  }

  const movements = await trx("trx_stok_movement")
    .where("referensi", kodeTransaksi)
    .where("jenis_movement", "keluar");

  const affectedProducts = new Set();
  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  const lastMov = await trx("trx_stok_movement")
    .where("kode_stok_movement", "like", `MOV-${todayStr}-%`)
    .orderBy("kode_stok_movement", "desc")
    .select("kode_stok_movement")
    .first();

  let movSeq = lastMov ? parseInt(lastMov.kode_stok_movement.split("-").pop(), 10) + 1 : 1;

  for (const mov of movements) {
    if (mov.kode_batch) {
      const batch = await trx("mst_produk_batch").where("kode_batch", mov.kode_batch).first();
      if (batch) {
        const restoreQty = parseInt(mov.qty, 10);
        const newSisa = parseInt(batch.stok_sisa, 10) + restoreQty;

        await trx("mst_produk_batch")
          .where("id", batch.id)
          .update({
            stok_sisa: newSisa,
            status: "aktif",
            updated_by: username,
            updated_at: DB.fn.now(),
          });

        const kodeMovement = `MOV-${todayStr}-${String(movSeq).padStart(3, "0")}`;
        movSeq++;

        await trx("trx_stok_movement").insert({
          kode_cabang: mov.kode_cabang,
          kode_stok_movement: kodeMovement,
          kode_produk: mov.kode_produk,
          kode_batch: mov.kode_batch,
          jenis_movement: "penyesuaian",
          is_override_movement: mov.is_override_movement || 0,
          catatan: mov.is_override_movement ? "Pengembalian stok void (override batch)" : "Pengembalian stok void",
          referensi: `VOID-${kodeTransaksi}`,
          qty: restoreQty,
          stok_sebelum: batch.stok_sisa,
          stok_sesudah: newSisa,
          tanggal: formatDateSystem(),
          tz: mov.tz || "UTC",
          created_by: username,
          created_at: formatDateSystem(),
          updated_by: username,
          updated_at: formatDateSystem(),
        });

        affectedProducts.add(mov.kode_produk);
      }
    }
  }

  for (const kodeProd of affectedProducts) {
    await syncProdukBatch(kodeProd, trx);
  }
}

/**
 * Mengambil ringkasan stok layak jual dan status expired untuk kumpulan kode_produk
 * @param {Array<string>} productCodes
 * @param {string|null} branchCode
 * @param {object|null} trx
 * @returns {Promise<Record<string, { stok_layak_jual: number, stok_total_fisik: number, is_expired: boolean, tanggal_kadaluarsa: string|null, tanggal_kadaluarsa_terdekat: string|null, total_batch_kadaluarsa: number }>>}
 */
export async function getProdukBatchStockInfo(productCodes = [], branchCode = null, trx = null) {
  const db = trx || DB;
  const result = {};

  if (!productCodes || productCodes.length === 0) {
    return result;
  }

  let qBatch = db("mst_produk_batch")
    .whereIn("kode_produk", productCodes)
    .where("status", "aktif")
    .groupBy("kode_produk")
    .select(
      "kode_produk",
      db.raw("SUM(CASE WHEN tanggal_kadaluarsa >= CURDATE() THEN stok_sisa ELSE 0 END) as stok_layak_jual"),
      db.raw("SUM(stok_sisa) as stok_total_fisik"),
      db.raw("MIN(CASE WHEN tanggal_kadaluarsa >= CURDATE() THEN tanggal_kadaluarsa ELSE NULL END) as tanggal_kadaluarsa_layak"),
      db.raw("MIN(tanggal_kadaluarsa) as tanggal_kadaluarsa_terdekat"),
      db.raw("COUNT(CASE WHEN tanggal_kadaluarsa < CURDATE() AND stok_sisa > 0 THEN 1 ELSE NULL END) as total_batch_kadaluarsa")
    );

  if (branchCode) {
    qBatch = qBatch.andWhere(function () {
      this.where("kode_cabang", branchCode).orWhereNull("kode_cabang");
    });
  }

  const batchStats = await qBatch;
  const batchMap = new Map();
  batchStats.forEach((b) => {
    batchMap.set(b.kode_produk, b);
  });

  for (const kode of productCodes) {
    const b = batchMap.get(kode);
    if (b) {
      const stokLayak = parseInt(b.stok_layak_jual || 0, 10);
      const stokFisik = parseInt(b.stok_total_fisik || 0, 10);
      const totalKadaluarsa = parseInt(b.total_batch_kadaluarsa || 0, 10);
      const isExpired = stokLayak === 0 && (stokFisik > 0 || totalKadaluarsa > 0);

      // Prioritaskan tanggal kadaluarsa dari batch valid (layak jual terdekat untuk FEFO),
      // jika seluruh batch sudah kadaluarsa (stokLayak === 0), baru tampilkan tanggal kadaluarsa batch kadaluarsa terdekat
      const tglExpLayak = b.tanggal_kadaluarsa_layak;
      const tglExpAll = b.tanggal_kadaluarsa_terdekat;
      const tglExpTerdekatVal = tglExpLayak || tglExpAll;
      const tglExpStr = tglExpTerdekatVal ? (tglExpTerdekatVal instanceof Date ? tglExpTerdekatVal.toISOString().slice(0, 10) : String(tglExpTerdekatVal).slice(0, 10)) : null;

      result[kode] = {
        stok_layak_jual: stokLayak,
        stok_total_fisik: stokFisik,
        is_expired: isExpired,
        tanggal_kadaluarsa: tglExpStr,
        tanggal_kadaluarsa_terdekat: tglExpStr,
        total_batch_kadaluarsa: totalKadaluarsa,
      };
    } else {
      result[kode] = {
        stok_layak_jual: 0,
        stok_total_fisik: 0,
        is_expired: false,
        tanggal_kadaluarsa: null,
        tanggal_kadaluarsa_terdekat: null,
        total_batch_kadaluarsa: 0,
      };
    }
  }

  return result;
}

