/**
 * @copyright (c) 2026 PT Marstech Global (info@marstech.co.id)
 * @project Sistem Klinik Kecantikan
 * @file kasir_sync_service.js
 * @description Helper terpusat untuk sinkronisasi draf transaksi Kasir dan item layanan/produk
 *              dari trx_detail_antrian_layanan.
 *              Mengimplementasikan deduplikasi rujukan konsultasi -> tindakan secara otomatis
 *              serta fitur Include Biaya Konsultasi (Gratis Konsul jika tindakan include = 1).
 */

import DB from "../../../../core/config/knex.js";
import { formatDateSystem } from "../../components/tools/date_tools.js";

/**
 * Mengambil SEMUA item layanan dari antrean yang berstatus 'selesai' untuk satu atau beberapa kunjungan,
 * dengan DEDUPLIKASI OTOMATIS & EVALUASI INCLUDE KONSULTASI:
 * 1. Deduplikasi: Item layanan pendaftaran yang diteruskan ke antrean rujukan anak hanya diambil 1x.
 * 2. Include Konsultasi: Jika antrean konsultasi memiliki antrean anak (tindakan lanjutan) yang statusnya
 *    selesai dan memiliki is_include_konsultasi = 1, item konsultasi otomatis digratiskan (Diskon 100%).
 *
 * @param {import('knex').Knex | import('knex').Knex.Transaction} dbOrTrx
 * @param {string | string[]} kodeKunjungan
 * @returns {Promise<Array<Object>>}
 */
export const getCompletedItemsForKasir = async (dbOrTrx, kodeKunjungan) => {
  if (!kodeKunjungan || (Array.isArray(kodeKunjungan) && kodeKunjungan.length === 0)) {
    return [];
  }

  // 1. Ambil semua baris detail antrean dari antrean yang berstatus 'selesai'
  let query = dbOrTrx("trx_detail_antrian_layanan as dal")
    .join("trx_antrian_layanan as al", "dal.kode_antrian_layanan", "al.kode_antrian_layanan")
    .leftJoin("mst_ruangan as r", "al.kode_ruangan", "r.kode_ruangan")
    .leftJoin("mst_layanan as l", "dal.kode_layanan", "l.kode_layanan")
    .leftJoin("mst_paket_layanan as pl", "dal.kode_layanan", "pl.kode_paket_layanan")
    .leftJoin("mst_produk as prod", "dal.kode_layanan", "prod.kode_produk")
    .where("al.status", "selesai")
    .whereNotExists(function () {
      this.select("child.id")
        .from("trx_antrian_layanan as child")
        .join("trx_detail_antrian_layanan as cdal", "child.kode_antrian_layanan", "cdal.kode_antrian_layanan")
        .whereRaw("child.kode_antrian_asal = al.kode_antrian_layanan")
        .whereRaw("cdal.kode_layanan = dal.kode_layanan")
        .whereNot("child.status", "batal");
    })
    .select(
      "al.kode_kunjungan",
      "al.kode_antrian_layanan",
      "al.kode_antrian_asal",
      "al.kode_ruangan",
      "al.kode_karyawan",
      "r.is_konsultasi",
      "dal.id",
      "dal.kode_detail_antrian_layanan",
      "dal.kode_layanan",
      "dal.nama_layanan",
      "dal.harga",
      "dal.jenis_layanan",
      "dal.kode_promo",
      "dal.nama_promo",
      "dal.jenis_diskon",
      "dal.nilai_diskon",
      "l.harga as master_harga_layanan",
      "l.is_include_konsultasi as master_is_include_layanan",
      "pl.harga_paket as master_harga_paket",
      "pl.is_include_konsultasi as master_is_include_paket",
      "prod.harga_jual as master_harga_produk"
    )
    .orderBy("dal.id", "asc");

  if (Array.isArray(kodeKunjungan)) {
    query = query.whereIn("al.kode_kunjungan", kodeKunjungan);
  } else {
    query = query.where("al.kode_kunjungan", kodeKunjungan);
  }

  const rawItems = await query;
  if (rawItems.length === 0) return [];

  // 2. Kumpulkan semua antrean anak (rujukan aktif/selesai, tidak batal) untuk kunjungan ini
  // Guna mengevaluasi apakah ada tindakan rujukan yang is_include_konsultasi = 1
  const childQueues = await dbOrTrx("trx_antrian_layanan as child")
    .join("trx_detail_antrian_layanan as cdal", "child.kode_antrian_layanan", "cdal.kode_antrian_layanan")
    .leftJoin("mst_layanan as cl", "cdal.kode_layanan", "cl.kode_layanan")
    .leftJoin("mst_paket_layanan as cpl", "cdal.kode_layanan", "cpl.kode_paket_layanan")
    .whereNot("child.status", "batal")
    .whereNotNull("child.kode_antrian_asal")
    .modify((qb) => {
      if (Array.isArray(kodeKunjungan)) {
        qb.whereIn("child.kode_kunjungan", kodeKunjungan);
      } else {
        qb.where("child.kode_kunjungan", kodeKunjungan);
      }
    })
    .select(
      "child.kode_kunjungan",
      "child.kode_antrian_layanan",
      "child.kode_antrian_asal",
      "cdal.kode_layanan",
      "cdal.nama_layanan",
      "cl.is_include_konsultasi as lay_include",
      "cpl.is_include_konsultasi as pkt_include"
    );

  // Map relasi induk -> list tindakan anak & list tindakan per kunjungan
  const parentChildrenMap = new Map();
  const visitTreatmentsMap = new Map();

  for (const cq of childQueues) {
    const isInclude = cq.lay_include === 1 || cq.lay_include === "1" || cq.pkt_include === 1 || cq.pkt_include === "1";
    if (cq.kode_antrian_asal) {
      if (!parentChildrenMap.has(cq.kode_antrian_asal)) parentChildrenMap.set(cq.kode_antrian_asal, []);
      parentChildrenMap.get(cq.kode_antrian_asal).push({ ...cq, isInclude });
    }
    if (cq.kode_kunjungan) {
      if (!visitTreatmentsMap.has(cq.kode_kunjungan)) visitTreatmentsMap.set(cq.kode_kunjungan, []);
      visitTreatmentsMap.get(cq.kode_kunjungan).push({ ...cq, isInclude });
    }
  }

  // Juga cek tindakan dalam rawItems kunjungan ini (Pintu Masuk 2 / Multi-item)
  for (const itm of rawItems) {
    const isKonsul = Boolean(itm.is_konsultasi) ||
      (itm.nama_layanan || "").toLowerCase().includes("konsul") ||
      (itm.kode_layanan || "").toLowerCase().includes("konsul");
    if (!isKonsul && itm.kode_kunjungan) {
      const isInclude = itm.master_is_include_layanan === 1 || itm.master_is_include_layanan === "1" ||
        itm.master_is_include_paket === 1 || itm.master_is_include_paket === "1";
      if (!visitTreatmentsMap.has(itm.kode_kunjungan)) visitTreatmentsMap.set(itm.kode_kunjungan, []);
      visitTreatmentsMap.get(itm.kode_kunjungan).push({ ...itm, isInclude });
    }
  }

  // 3. Proses penyesuaian diskon Include Konsultasi:
  // Bebas biaya konsultasi (Rp 0) HANYA jika SEMUA tindakan yang diambil adalah INCLUDE KONSULTASI (tidak ada yang non-include)
  return rawItems.map((item) => {
    const isConsultationQueue = Boolean(item.is_konsultasi) ||
      (item.nama_layanan || "").toLowerCase().includes("konsul") ||
      (item.kode_layanan || "").toLowerCase().includes("konsul");

    if (isConsultationQueue) {
      const relatedChildren = parentChildrenMap.get(item.kode_antrian_layanan) || [];
      const relatedVisitTreatments = visitTreatmentsMap.get(item.kode_kunjungan) || [];
      const allTreatments = relatedChildren.length > 0 ? relatedChildren : relatedVisitTreatments;

      const hasTreatments = allTreatments.length > 0;
      const isAllInclude = hasTreatments && allTreatments.every((t) => t.isInclude);

      if (isAllInclude) {
        // Skenario A: SEMUA TINDAKAN INCLUDE (Gratis Konsultasi Rp 0)
        const promoPrice = parseFloat(item.harga || 0);
        const hargaAsli = promoPrice > 0 ? promoPrice : parseFloat(item.master_harga_layanan || 0);
        const firstName = allTreatments[0]?.nama_layanan || allTreatments[0]?.nama || "Tindakan Include";
        return {
          ...item,
          is_free_include: true,
          harga_satuan_gross: hargaAsli,
          harga: 0,
          diskon: 0,
          jenis_diskon: "include_treatment",
          nilai_diskon: 0,
          kode_promo: null,
          nama_promo: `Gratis (Include ${firstName})`,
          subtotal_setelah_diskon: 0,
        };
      }
    }

    // Skenario B: NORMAL / NON-INCLUDE / HANYA KONSULTASI / ADA TINDAKAN NON-INCLUDE
    const rawHarga = parseFloat(item.master_harga_layanan || item.master_harga_paket || item.master_harga_produk || item.harga || 0);
    return {
      ...item,
      is_free_include: false,
      harga_satuan_gross: rawHarga,
    };
  });
};

/**
 * Sinkronisasi terpusat ke trx_transaksi dan trx_detail_transaksi:
 * 1. Membuat atau memperbarui draf trx_transaksi.
 * 2. Memasukkan layanan pendaftaran/tindakan (yang sudah didedup & disinkronkan include konsultasi).
 * 3. Memasukkan atau memperbarui produk tambahan rekomendasi dokter.
 * 4. Merekalibrasi diskon promo, DP booking, total_harga, total_bayar, dan sisa_bayar.
 *
 * @param {import('knex').Knex | import('knex').Knex.Transaction} trx
 * @param {Object} params
 * @param {string} params.kodeKunjungan
 * @param {string} [params.kodeTransaksi]
 * @param {string} [params.noRm]
 * @param {string} [params.kodeRekamMedis]
 * @param {string} [params.username="system"]
 * @param {string} [params.tz="Asia/Jakarta"]
 * @param {Array<Object>} [params.extraProdukItems=[]] - [{ kode/kode_produk, nama, harga/harga_satuan/harga_jual, qty, satuan }]
 * @returns {Promise<Object>} Object { kode_transaksi, total_bayar, total_harga, total_diskon, sisa_bayar }
 */
export const syncCompletedItemsToKasirDraft = async (trx, {
  kodeKunjungan,
  kodeTransaksi = "",
  noRm = "",
  kodeRekamMedis = null,
  username = "system",
  tz = "Asia/Jakarta",
  extraProdukItems = [],
}) => {
  if (!kodeKunjungan) return null;

  const todayYmd = new Date().toISOString().slice(0, 10);
  const todayStr = todayYmd.replace(/-/g, "");
  const prefixTrx = `TRX-${todayStr}-`;
  const prefixDetail = `DT-${todayStr}-`;

  // 1. Cek apakah transaksi sudah lunas (jika sudah lunas, jangan ubah status/detailnya)
  const lunasTrx = await trx("trx_transaksi")
    .where("kode_kunjungan", kodeKunjungan)
    .where("status", "lunas")
    .first();

  if (lunasTrx) {
    return lunasTrx;
  }

  // 2. Cari atau buat draf transaksi
  let draftTrx = null;
  if (kodeTransaksi) {
    draftTrx = await trx("trx_transaksi")
      .where("kode_transaksi", kodeTransaksi)
      .where("status", "draft")
      .first();
  }
  if (!draftTrx) {
    draftTrx = await trx("trx_transaksi")
      .where("kode_kunjungan", kodeKunjungan)
      .where("status", "draft")
      .first();
  }

  const kunjunganData = await trx("trx_kunjungan")
    .where("kode_kunjungan", kodeKunjungan)
    .select("no_rm", "kode_cabang")
    .first();
  const resolvedCabang = draftTrx?.kode_cabang || kunjunganData?.kode_cabang || "CBG-001";

  let createdTransaksiKode = "";

  if (draftTrx) {
    createdTransaksiKode = draftTrx.kode_transaksi;
    const updateDraftPayload = {};
    if (kodeRekamMedis && !draftTrx.kode_rekam_medis) {
      updateDraftPayload.kode_rekam_medis = kodeRekamMedis;
    }
    if (!draftTrx.kode_cabang && resolvedCabang) {
      updateDraftPayload.kode_cabang = resolvedCabang;
    }
    if (Object.keys(updateDraftPayload).length > 0) {
      updateDraftPayload.updated_by = username;
      updateDraftPayload.updated_at = formatDateSystem();
      await trx("trx_transaksi")
        .where("kode_transaksi", createdTransaksiKode)
        .update(updateDraftPayload);
    }
  } else {
    const lastTrx = await trx("trx_transaksi")
      .where("kode_transaksi", "like", `${prefixTrx}%`)
      .orderBy("id", "desc")
      .first();

    let nextTrxSeq = 1;
    if (lastTrx && lastTrx.kode_transaksi) {
      const parts = lastTrx.kode_transaksi.split("-");
      const num = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(num)) nextTrxSeq = num + 1;
    }
    createdTransaksiKode = `${prefixTrx}${String(nextTrxSeq).padStart(3, "0")}`;

    const resolvedNoRm = noRm || (kunjunganData ? kunjunganData.no_rm : null);

    const newTrx = {
      kode_cabang: resolvedCabang,
      kode_transaksi: createdTransaksiKode,
      kode_kunjungan: kodeKunjungan,
      no_rm: resolvedNoRm,
      kode_rekam_medis: kodeRekamMedis || null,
      tanggal_transaksi: todayYmd,
      total_harga: 0,
      total_diskon: 0,
      total_bayar: 0,
      metode_bayar: "tunai",
      status: "draft",
      tz: tz || "Asia/Jakarta",
      created_by: username,
      created_at: formatDateSystem(),
      updated_by: username,
      updated_at: formatDateSystem(),
    };

    await trx("trx_transaksi").insert(newTrx);
  }

  // 3. Ambil item layanan & produk antrean yang sudah berstatus 'selesai' (DEDUPLIKASI & INCLUDE KONSULTASI)
  const completedItems = await getCompletedItemsForKasir(trx, kodeKunjungan);

  // 4. Hitung detail yang sudah ada untuk sinkronisasi yang idempotent
  const existingDetails = await trx("trx_detail_transaksi")
    .where("kode_transaksi", createdTransaksiKode);

  const lastDetail = await trx("trx_detail_transaksi")
    .where("kode_detail_transaksi", "like", `${prefixDetail}%`)
    .orderBy("id", "desc")
    .first();

  let nextDetailSeq = 1;
  if (lastDetail && lastDetail.kode_detail_transaksi) {
    const parts = lastDetail.kode_detail_transaksi.split("-");
    const num = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(num)) nextDetailSeq = num + 1;
  }

  const hasDiscountCols = await trx.schema.hasColumn("trx_detail_transaksi", "kode_promo");

  // Masukkan / Perbarui completedItems dari antrean layanan
  for (const item of completedItems) {
    if (!item.kode_layanan) continue;

    const isProduct = ["produk", "paket_produk"].includes((item.jenis_layanan || "").toLowerCase());
    if (isProduct) {
      const existRow = existingDetails.find((d) => d.kode_produk === item.kode_layanan);
      const hargaSatuan = parseFloat(item.harga || 0);

      if (existRow) {
        await trx("trx_detail_transaksi")
          .where("id", existRow.id)
          .update({
            harga_satuan: hargaSatuan,
            subtotal: hargaSatuan * (existRow.qty || 1),
            updated_by: username,
            updated_at: formatDateSystem(),
          });
      } else {
        const cKodeDetail = `${prefixDetail}${String(nextDetailSeq).padStart(3, "0")}`;
        nextDetailSeq++;

        const insertPayload = {
          kode_cabang: resolvedCabang,
          kode_detail_transaksi: cKodeDetail,
          kode_transaksi: createdTransaksiKode,
          kode_layanan: null,
          kode_produk: item.kode_layanan,
          qty: 1,
          harga_satuan: hargaSatuan,
          subtotal: hargaSatuan,
          is_from_pendaftaran: 1,
          tz: tz || "Asia/Jakarta",
          created_by: username,
          created_at: formatDateSystem(),
          updated_by: username,
          updated_at: formatDateSystem(),
        };
        if (hasDiscountCols && item.kode_promo) {
          insertPayload.kode_promo = item.kode_promo;
          insertPayload.nama_promo = item.nama_promo || null;
          insertPayload.jenis_diskon = item.jenis_diskon || null;
          insertPayload.nilai_diskon = item.nilai_diskon != null ? parseFloat(item.nilai_diskon) : null;
          insertPayload.diskon = 0;
          insertPayload.subtotal_setelah_diskon = hargaSatuan;
        }

        await trx("trx_detail_transaksi").insert(insertPayload);
      }
    } else {
      // Layanan / Paket Layanan
      const isKlaim = (item.jenis_layanan || "").toLowerCase() === "klaim_paket";
      const isFreeInclude = Boolean(item.is_free_include);

      let hargaSatuanGross = isKlaim || isFreeInclude ? 0 : parseFloat(item.harga_satuan_gross || item.master_harga_layanan || item.harga || 0);
      let itemSubtotal = isKlaim || isFreeInclude ? 0 : hargaSatuanGross;
      let itemDiskon = isFreeInclude ? 0 : (item.diskon || 0);
      let itemSubtotalSetelahDiskon = isFreeInclude ? 0 : itemSubtotal;
      let itemJenisDiskon = isFreeInclude ? "include_treatment" : (item.jenis_diskon || null);
      let itemNilaiDiskon = isFreeInclude ? 0 : (item.nilai_diskon != null ? parseFloat(item.nilai_diskon) : null);
      let itemNamaPromo = isFreeInclude ? "Gratis (Include Tindakan)" : (item.nama_promo || null);
      let itemKodePromo = isFreeInclude ? null : (item.kode_promo || null);

      const existRow = existingDetails.find((d) => d.kode_layanan === item.kode_layanan);

      if (existRow) {
        const updatePayload = {
          harga_satuan: hargaSatuanGross,
          subtotal: itemSubtotal,
          updated_by: username,
          updated_at: formatDateSystem(),
        };
        if (hasDiscountCols) {
          updatePayload.kode_promo = itemKodePromo;
          updatePayload.nama_promo = itemNamaPromo;
          updatePayload.jenis_diskon = itemJenisDiskon;
          updatePayload.nilai_diskon = itemNilaiDiskon;
          updatePayload.diskon = itemDiskon;
          updatePayload.subtotal_setelah_diskon = itemSubtotalSetelahDiskon;
        }
        await trx("trx_detail_transaksi").where("id", existRow.id).update(updatePayload);
      } else {
        const cKodeDetail = `${prefixDetail}${String(nextDetailSeq).padStart(3, "0")}`;
        nextDetailSeq++;

        const insertPayload = {
          kode_cabang: resolvedCabang,
          kode_detail_transaksi: cKodeDetail,
          kode_transaksi: createdTransaksiKode,
          kode_layanan: item.kode_layanan,
          kode_produk: null,
          qty: 1,
          harga_satuan: hargaSatuanGross,
          subtotal: itemSubtotal,
          is_from_pendaftaran: 1,
          tz: tz || "Asia/Jakarta",
          created_by: username,
          created_at: formatDateSystem(),
          updated_by: username,
          updated_at: formatDateSystem(),
        };
        if (hasDiscountCols) {
          insertPayload.kode_promo = itemKodePromo;
          insertPayload.nama_promo = itemNamaPromo;
          insertPayload.jenis_diskon = itemJenisDiskon;
          insertPayload.nilai_diskon = itemNilaiDiskon;
          insertPayload.diskon = itemDiskon;
          insertPayload.subtotal_setelah_diskon = itemSubtotalSetelahDiskon;
        }

        await trx("trx_detail_transaksi").insert(insertPayload);
      }
    }
  }

  // 5. Masukkan / update produk tambahan dokter (extraProdukItems jika dikirim via form)
  if (Array.isArray(extraProdukItems) && extraProdukItems.length > 0) {
    const freshDetails = await trx("trx_detail_transaksi").where("kode_transaksi", createdTransaksiKode);

    // Pre-fetch harga jual dari mst_produk
    const kodeProdukList = extraProdukItems.map((i) => i.kode || i.kode_produk).filter(Boolean);
    let produkPriceMap = {};
    if (kodeProdukList.length > 0) {
      const mstProdukList = await trx("mst_produk")
        .whereIn("kode_produk", kodeProdukList)
        .select("kode_produk", "nama", "harga_jual");
      mstProdukList.forEach((p) => {
        produkPriceMap[p.kode_produk] = parseFloat(p.harga_jual || 0);
      });
    }

    // Pre-fetch promo aktif untuk produk
    let productPromoMap = {};
    if (kodeProdukList.length > 0) {
      const activeProductPromos = await trx("mst_promo as p")
        .join("mst_detail_promo as dp", "p.kode_promo", "dp.kode_promo")
        .where("p.status", "aktif")
        .where("dp.status", "aktif")
        .whereIn("dp.kode_item", kodeProdukList)
        .whereRaw("DATE(p.tanggal_mulai) <= ?", [todayYmd])
        .whereRaw("DATE(p.tanggal_selesai) >= ?", [todayYmd])
        .select(
          "p.kode_promo",
          "p.nama as nama_promo",
          "p.jenis_diskon",
          "p.nilai_diskon",
          "dp.kode_item"
        );

      activeProductPromos.forEach((pr) => {
        if (!productPromoMap[pr.kode_item]) {
          productPromoMap[pr.kode_item] = pr;
        } else {
          const curVal = parseFloat(productPromoMap[pr.kode_item].nilai_diskon || 0);
          const newVal = parseFloat(pr.nilai_diskon || 0);
          if (newVal > curVal) {
            productPromoMap[pr.kode_item] = pr;
          }
        }
      });
    }

    for (const prd of extraProdukItems) {
      const kdProduk = prd.kode || prd.kode_produk;
      if (kdProduk) {
        // Cek jika produk kustom
        const isCustom = String(kdProduk).startsWith("CUSTOM-") || String(kdProduk).startsWith("CST-");
        if (isCustom && prd.nama) {
          const existP = await trx("mst_produk").where("kode_produk", kdProduk).first();
          if (!existP) {
            const kat = await trx("mst_kategori_produk").where("status", "aktif").first();
            const defaultKatKode = kat?.kode_kategori_produk || "KATPRD-001";

            await trx("mst_produk").insert({
              kode_produk: kdProduk,
              kode_kategori_produk: defaultKatKode,
              nama: prd.nama,
              satuan: prd.satuan || "item",
              harga_beli: 0,
              harga_jual: parseFloat(prd.harga || prd.harga_satuan || prd.harga_jual || 0),
              stok_minimum: 0,
              stok_tersedia: 999,
              status: "nonaktif",
              tz: tz || "Asia/Jakarta",
              created_by: username,
              created_at: formatDateSystem(),
              updated_by: username,
              updated_at: formatDateSystem(),
            });
          }
          produkPriceMap[kdProduk] = parseFloat(prd.harga || prd.harga_satuan || prd.harga_jual || 0);
        }

        const qty = Math.max(1, parseInt(prd.qty || 1, 10));
        const rawHarga = produkPriceMap[kdProduk] !== undefined
          ? produkPriceMap[kdProduk]
          : parseFloat(prd.harga || prd.harga_satuan || prd.harga_jual || 0);
        const subtotal = qty * rawHarga;

        // Ambil info promo untuk produk ini jika ada
        const promo = (prd.kode_promo && prd.nilai_diskon != null)
          ? {
              kode_promo: prd.kode_promo,
              nama_promo: prd.nama_promo || null,
              jenis_diskon: prd.jenis_diskon || "persen",
              nilai_diskon: parseFloat(prd.nilai_diskon),
            }
          : productPromoMap[kdProduk];

        let itemDiskon = 0;
        if (promo && promo.nilai_diskon) {
          const nDisc = parseFloat(promo.nilai_diskon || 0);
          if (promo.jenis_diskon === "persen") {
            itemDiskon = (subtotal * nDisc) / 100;
          } else if (promo.jenis_diskon === "nominal") {
            itemDiskon = Math.min(nDisc * qty, subtotal);
          }
        }
        const subtotalSetelahDiskon = Math.max(0, subtotal - itemDiskon);

        const isOverride = Boolean(prd.is_expired_override || prd.produk_expired_override) ? 1 : 0;
        const catatanOverride = prd.catatan_override || (isOverride ? "Disetujui dokter/petugas" : null);

        const existPrd = freshDetails.find((d) => d.kode_produk === kdProduk);
        if (existPrd) {
          const updatePayload = {
            qty: qty,
            harga_satuan: rawHarga,
            subtotal: subtotal,
            is_expired_override: isOverride,
            catatan_override: catatanOverride,
            updated_by: username,
            updated_at: formatDateSystem(),
          };
          if (hasDiscountCols) {
            updatePayload.kode_promo = promo?.kode_promo || null;
            updatePayload.nama_promo = promo?.nama_promo || null;
            updatePayload.jenis_diskon = promo?.jenis_diskon || null;
            updatePayload.nilai_diskon = promo?.nilai_diskon != null ? parseFloat(promo.nilai_diskon) : null;
            updatePayload.diskon = itemDiskon;
            updatePayload.subtotal_setelah_diskon = subtotalSetelahDiskon;
          }
          await trx("trx_detail_transaksi")
            .where("id", existPrd.id)
            .update(updatePayload);
        } else {
          const cKodeDetail = `${prefixDetail}${String(nextDetailSeq).padStart(3, "0")}`;
          nextDetailSeq++;

          const insertPayload = {
            kode_cabang: resolvedCabang,
            kode_detail_transaksi: cKodeDetail,
            kode_transaksi: createdTransaksiKode,
            kode_layanan: null,
            kode_produk: kdProduk,
            qty: qty,
            harga_satuan: rawHarga,
            subtotal: subtotal,
            is_from_pendaftaran: 0,
            is_expired_override: isOverride,
            catatan_override: catatanOverride,
            tz: tz || "Asia/Jakarta",
            created_by: username,
            created_at: formatDateSystem(),
            updated_by: username,
            updated_at: formatDateSystem(),
          };
          if (hasDiscountCols) {
            insertPayload.kode_promo = promo?.kode_promo || null;
            insertPayload.nama_promo = promo?.nama_promo || null;
            insertPayload.jenis_diskon = promo?.jenis_diskon || null;
            insertPayload.nilai_diskon = promo?.nilai_diskon != null ? parseFloat(promo.nilai_diskon) : null;
            insertPayload.diskon = itemDiskon;
            insertPayload.subtotal_setelah_diskon = subtotalSetelahDiskon;
          }
          await trx("trx_detail_transaksi").insert(insertPayload);
        }
      }
    }
  }

  // 6. Rekalibrasi total_harga, promo diskon, DP booking, total_bayar, & sisa_bayar
  const allCurrentDetails = await trx("trx_detail_transaksi")
    .where("kode_transaksi", createdTransaksiKode);

  const grandTotalHarga = allCurrentDetails.reduce((sum, d) => sum + parseFloat(d.subtotal || 0), 0);

  // Ambil state transaksi terkini untuk promo dan DP
  const currentTrx = await trx("trx_transaksi")
    .where("kode_transaksi", createdTransaksiKode)
    .first();

  // Hitung total diskon dari produk/item tambahan kasir + diskon include konsultasi
  const extraDetails = allCurrentDetails.filter((d) => d.is_from_pendaftaran === 0);
  let totalDiskon = 0;
  allCurrentDetails.forEach((d) => {
    if (d.jenis_diskon === "include_treatment") {
      // Diskon include konsultasi sudah mengurangi subtotal item menjadi 0
      // jadi tidak perlu memotong grandTotalHarga lagi
    } else {
      totalDiskon += parseFloat(d.diskon || 0);
    }
  });

  if (totalDiskon === 0 && currentTrx?.kode_promo && extraDetails.length > 0) {
    const rawCodes = String(currentTrx.kode_promo).split(",").map((s) => s.trim()).filter(Boolean);
    const activePromos = await trx("mst_promo")
      .whereIn("kode_promo", rawCodes)
      .where("status", "aktif");

    let calculatedDiskon = 0;
    const extraTotalHarga = extraDetails.reduce((sum, d) => sum + parseFloat(d.subtotal || 0), 0);

    for (const promoData of activePromos) {
      const nilDiskon = parseFloat(promoData.nilai_diskon || 0);
      const detailPromo = await trx("mst_detail_promo")
        .where("kode_promo", promoData.kode_promo)
        .where("status", "aktif")
        .select("kode_item");

      if (detailPromo.length === 0) {
        calculatedDiskon += promoData.jenis_diskon === "persen"
          ? (extraTotalHarga * nilDiskon) / 100
          : nilDiskon;
      } else {
        const promoKodeSet = new Set(detailPromo.map((dp) => dp.kode_item));
        let baseDiskon = 0;
        for (const d of extraDetails) {
          const kode = d.kode_layanan || d.kode_produk;
          if (kode && promoKodeSet.has(kode)) {
            baseDiskon += parseFloat(d.harga_satuan || 0) * parseInt(d.qty || 1, 10);
          }
        }
        calculatedDiskon += promoData.jenis_diskon === "persen"
          ? (baseDiskon * nilDiskon) / 100
          : Math.min(nilDiskon, baseDiskon);
      }
    }
    totalDiskon = Math.min(calculatedDiskon, grandTotalHarga);
  } else {
    totalDiskon = Math.min(totalDiskon, grandTotalHarga);
  }

  const grandTotalBayar = Math.max(0, grandTotalHarga - totalDiskon);

  // Cek DP jika ada booking
  let dpNominal = 0;
  let metodeDp = null;
  const kunjunganRow = await trx("trx_kunjungan")
    .where("kode_kunjungan", kodeKunjungan)
    .first();

  if (kunjunganRow?.kode_booking) {
    const bookingRow = await trx("trx_booking")
      .where("kode_booking", kunjunganRow.kode_booking)
      .first();
    if (bookingRow && (["sudah_bayar", "lunas", "dipotong_treatment"].includes(bookingRow.dp_status) || parseFloat(bookingRow.dp_nominal || 0) > 0)) {
      dpNominal = parseFloat(bookingRow.dp_nominal || 0);
      metodeDp = dpNominal > 0 ? bookingRow.metode_pembayaran_dp : null;
    }
  }

  const sisaBayar = Math.max(0, grandTotalBayar - dpNominal);

  // Kumpulkan semua kode promo & nama promo dari detail item untuk sinkronisasi ke header transaksi
  const allDetailsWithPromo = await trx("trx_detail_transaksi")
    .where("kode_transaksi", createdTransaksiKode)
    .whereNotNull("kode_promo");

  const promoCodes = [];
  const promoNames = [];
  allDetailsWithPromo.forEach((d) => {
    if (d.kode_promo && !promoCodes.includes(d.kode_promo)) promoCodes.push(d.kode_promo);
    if (d.nama_promo && !promoNames.includes(d.nama_promo)) promoNames.push(d.nama_promo);
  });

  const hasNamaPromoTrx = await trx.schema.hasColumn("trx_transaksi", "nama_promo");
  const updateTrxPayload = {
    total_harga: grandTotalHarga,
    total_diskon: totalDiskon,
    total_bayar: grandTotalBayar,
    dp_nominal: dpNominal,
    metode_pembayaran_dp: metodeDp,
    sisa_bayar: sisaBayar,
    updated_by: username,
    updated_at: formatDateSystem(),
  };
  if (promoCodes.length > 0) {
    updateTrxPayload.kode_promo = promoCodes.join(",");
  }
  if (hasNamaPromoTrx && promoNames.length > 0) {
    updateTrxPayload.nama_promo = promoNames.join(", ");
  }

  await trx("trx_transaksi")
    .where("kode_transaksi", createdTransaksiKode)
    .update(updateTrxPayload);

  return {
    kode_transaksi: createdTransaksiKode,
    total_harga: grandTotalHarga,
    total_diskon: totalDiskon,
    total_bayar: grandTotalBayar,
    dp_nominal: dpNominal,
    metode_pembayaran_dp: metodeDp,
    sisa_bayar: sisaBayar,
  };
};
