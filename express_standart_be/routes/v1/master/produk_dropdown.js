/**
 * @copyright (c) 2026 PT Marstech Global (info@marstech.co.id)
 * @project Sistem Klinik Kecantikan
 * @file produk_dropdown.js
 * @description Endpoint dropdown daftar produk aktif untuk form hasil treatment & rekomendasi
 *
 * @author Antigravity
 * @created 2026-08-27
 */

import express from "express";
import DB from "../../../core/config/knex.js";
import { formatDateSystem } from "../components/tools/date_tools.js";
import { Logging } from "../components/tools/servertool.js";
import { status } from "../components/tools/general.js";
import { getBranchScope } from "../components/tools/branch_scope.js";
import { getProdukBatchStockInfo } from "./inventori/batch_helper.js";

const router = express.Router();

const handleProdukDropdown = async (req, res) => {
  const oPayload = { ...req.query, ...req.body };
  const username = req?.auth?.username || "system";
  const branchCode = getBranchScope(req, oPayload.kode_cabang);
  const search = oPayload.search || oPayload.keyword || "";

  try {
    // 1. Fetch Produk Biasa (mst_produk)
    let query = DB("mst_produk as pr")
      .leftJoin("mst_kategori_produk as kp", "pr.kode_kategori_produk", "kp.kode_kategori_produk")
      .where("pr.status", "aktif")
      .whereRaw("pr.kode_produk NOT LIKE 'CUSTOM-%' AND pr.kode_produk NOT LIKE 'CST-%'");

    if (branchCode) query = query.where("pr.kode_cabang", branchCode);

    query = query
      .select(
        "pr.kode_produk",
        "pr.nama",
        "pr.foto",
        "pr.harga_jual",
        "pr.satuan",
        "pr.stok_tersedia",
        "pr.tanggal_kadaluarsa",
        "pr.kode_kategori_produk",
        "kp.nama as nama_kategori"
      )
      .orderBy("pr.nama", "asc");

    if (search) {
      const lower = search.toLowerCase();
      query = query.where(function () {
        this.whereRaw("LOWER(pr.nama) LIKE ?", [`%${lower}%`])
          .orWhereRaw("LOWER(pr.kode_produk) LIKE ?", [`%${lower}%`]);
      });
    }

    const vaData = await query;

    // 2. Fetch Paket Produk (mst_paket_produk)
    const todayStr = formatDateSystem(new Date(), "yyyy-MM-dd");
    try {
      await DB("mst_paket_produk")
        .where("status", "aktif")
        .whereRaw(
          "DATE(COALESCE(tanggal_selesai, DATE_ADD(COALESCE(tanggal_mulai, created_at), INTERVAL masa_berlaku_hari DAY))) < ?",
          [todayStr]
        )
        .update({
          status: "nonaktif",
          updated_at: formatDateSystem(),
        });
    } catch (_) {}

    let qPaket = DB("mst_paket_produk as pp").where("pp.status", "aktif");
    if (branchCode) qPaket = qPaket.where("pp.kode_cabang", branchCode);

    if (search) {
      const lower = search.toLowerCase();
      qPaket = qPaket.where(function () {
        this.whereRaw("LOWER(pp.nama) LIKE ?", [`%${lower}%`])
          .orWhereRaw("LOWER(pp.kode_paket_produk) LIKE ?", [`%${lower}%`]);
      });
    }

    const vaPaket = await qPaket
      .select(
        "pp.kode_paket_produk",
        "pp.nama",
        "pp.foto",
        "pp.harga_paket as harga_jual",
        "pp.masa_berlaku_hari"
      )
      .orderBy("pp.nama", "asc");

    const paketCodes = vaPaket.map((p) => p.kode_paket_produk);
    let paketDetails = [];
    if (paketCodes.length > 0) {
      paketDetails = await DB("mst_detail_paket_produk as dp")
        .whereIn("dp.kode_paket_produk", paketCodes)
        .select("dp.kode_paket_produk", "dp.kode_produk", "dp.jumlah");
    }

    // Kumpulkan seluruh kode produk (produk mandiri + konstituen detail paket) untuk kalkulasi batch stok
    const allProdCodes = new Set(vaData.map((p) => p.kode_produk));
    paketDetails.forEach((d) => allProdCodes.add(d.kode_produk));

    const batchStockMap = await getProdukBatchStockInfo(Array.from(allProdCodes), branchCode);

    // Ambil promo aktif produk & paket untuk hari ini
    const todayYmd = new Date().toISOString().slice(0, 10);
    const qPromos = DB("mst_promo as p")
      .join("mst_detail_promo as dp", "p.kode_promo", "dp.kode_promo")
      .where("p.status", "aktif")
      .where("dp.status", "aktif")
      .whereRaw("DATE(p.tanggal_mulai) <= ?", [todayYmd])
      .whereRaw("DATE(p.tanggal_selesai) >= ?", [todayYmd]);

    if (branchCode) {
      qPromos.where(function () {
        this.where("p.kode_cabang", branchCode).orWhereNull("p.kode_cabang");
      });
    }

    const activePromos = await qPromos.select(
      "p.kode_promo",
      "p.nama as nama_promo",
      "p.jenis_diskon",
      "p.nilai_diskon",
      "dp.jenis_item",
      "dp.kode_item"
    );

    const promoMap = {};
    activePromos.forEach((pr) => {
      const jenisClean = (pr.jenis_item || "").toLowerCase();
      if (jenisClean.includes("produk") || jenisClean.includes("paket") || !jenisClean.includes("layanan")) {
        const key = pr.kode_item;
        if (!promoMap[key]) {
          promoMap[key] = pr;
        } else {
          const curVal = parseFloat(promoMap[key].nilai_diskon || 0);
          const newVal = parseFloat(pr.nilai_diskon || 0);
          if (newVal > curVal) {
            promoMap[key] = pr;
          }
        }
      }
    });

    const host = req.get("host");
    const protocol = req.protocol || "http";
    const assetsBase = `${protocol}://${host}`;

    // Format Produk Biasa
    const formattedProduk = vaData.map((item) => {
      const fotoUrl = item.foto
        ? (item.foto.startsWith("http") ? item.foto : `${assetsBase}/uploads/produk/${item.foto}`)
        : null;

      const rawHarga = parseFloat(item.harga_jual || 0);
      const promo = promoMap[item.kode_produk];
      const batchInfo = batchStockMap[item.kode_produk] || {
        stok_layak_jual: item.stok_tersedia || 0,
        stok_total_fisik: item.stok_tersedia || 0,
        is_expired: false,
        tanggal_kadaluarsa: item.tanggal_kadaluarsa || null,
        tanggal_kadaluarsa_terdekat: item.tanggal_kadaluarsa || null,
        total_batch_kadaluarsa: 0,
      };

      const stokLayakJual = batchInfo.stok_layak_jual;
      const isExpired = Boolean(batchInfo.is_expired);
      const expDate = batchInfo.tanggal_kadaluarsa || (item.tanggal_kadaluarsa ? String(item.tanggal_kadaluarsa).slice(0, 10) : null);
      const alasanExpired = isExpired
        ? `Batch kadaluarsa sejak ${batchInfo.tanggal_kadaluarsa_terdekat || expDate || 'beberapa hari lalu'}`
        : null;

      const baseItem = {
        ...item,
        foto: fotoUrl,
        stok_tersedia: stokLayakJual,
        stok_layak_jual: stokLayakJual,
        stok_total_fisik: batchInfo.stok_total_fisik,
        is_expired: isExpired,
        tanggal_kadaluarsa: expDate,
        tanggal_kadaluarsa_terdekat: batchInfo.tanggal_kadaluarsa_terdekat,
        alasan_expired: alasanExpired,
      };

      if (promo) {
        const diskonNilai = parseFloat(promo.nilai_diskon || 0);
        let hargaDiskon = rawHarga;
        if (promo.jenis_diskon === "persen") {
          hargaDiskon = Math.max(0, rawHarga - (rawHarga * diskonNilai) / 100);
        } else {
          hargaDiskon = Math.max(0, rawHarga - diskonNilai);
        }

        return {
          ...baseItem,
          is_promo: true,
          kode_promo: promo.kode_promo,
          nama_promo: promo.nama_promo,
          jenis_diskon: promo.jenis_diskon,
          nilai_diskon: diskonNilai,
          harga_asal: rawHarga,
          harga_promo: hargaDiskon,
        };
      }

      return {
        ...baseItem,
        is_promo: false,
        harga_asal: rawHarga,
        harga_promo: null,
      };
    });

    // Format Paket Produk
    const formattedPaket = vaPaket.map((item) => {
      const fotoUrl = item.foto
        ? (item.foto.startsWith("http") ? item.foto : `${assetsBase}/uploads/paket_produk/${item.foto}`)
        : null;

      const rawHarga = parseFloat(item.harga_jual || 0);
      const promo = promoMap[item.kode_paket_produk];

      const details = paketDetails.filter((d) => d.kode_paket_produk === item.kode_paket_produk);
      let stokLayakJual = 999999;
      let stokTotalFisik = 999999;
      let isExpired = false;
      let expDate = null;
      let expDateTerdekat = null;
      let alasanExpired = null;

      if (details.length === 0) {
        stokLayakJual = 0;
        stokTotalFisik = 0;
      } else {
        for (const d of details) {
          const bInfo = batchStockMap[d.kode_produk] || {
            stok_layak_jual: 0,
            stok_total_fisik: 0,
            is_expired: false,
            tanggal_kadaluarsa: null,
            tanggal_kadaluarsa_terdekat: null,
          };
          const reqQty = Math.max(1, parseInt(d.jumlah || 1, 10));
          const availableUnits = Math.floor((bInfo.stok_layak_jual || 0) / reqQty);
          const physicalUnits = Math.floor((bInfo.stok_total_fisik || 0) / reqQty);

          if (availableUnits < stokLayakJual) stokLayakJual = availableUnits;
          if (physicalUnits < stokTotalFisik) stokTotalFisik = physicalUnits;

          if (bInfo.is_expired) {
            isExpired = true;
            expDate = bInfo.tanggal_kadaluarsa;
            expDateTerdekat = bInfo.tanggal_kadaluarsa_terdekat || expDate;
            alasanExpired = `Item dalam paket kadaluarsa (${expDateTerdekat || 'expired'})`;
          }
        }
      }

      if (stokLayakJual === 999999) stokLayakJual = 0;
      if (stokTotalFisik === 999999) stokTotalFisik = 0;

      const baseItem = {
        kode_produk: item.kode_paket_produk,
        nama: item.nama,
        foto: fotoUrl,
        harga_jual: rawHarga,
        satuan: "paket",
        kode_kategori_produk: "PAKET_PRODUK",
        nama_kategori: "Paket Produk",
        stok_tersedia: stokLayakJual,
        stok_layak_jual: stokLayakJual,
        stok_total_fisik: stokTotalFisik,
        is_expired: isExpired,
        tanggal_kadaluarsa: expDate,
        tanggal_kadaluarsa_terdekat: expDateTerdekat,
        alasan_expired: alasanExpired,
        masa_berlaku_hari: item.masa_berlaku_hari,
        is_paket: true,
      };

      if (promo) {
        const diskonNilai = parseFloat(promo.nilai_diskon || 0);
        let hargaDiskon = rawHarga;
        if (promo.jenis_diskon === "persen") {
          hargaDiskon = Math.max(0, rawHarga - (rawHarga * diskonNilai) / 100);
        } else {
          hargaDiskon = Math.max(0, rawHarga - diskonNilai);
        }

        return {
          ...baseItem,
          is_promo: true,
          kode_promo: promo.kode_promo,
          nama_promo: promo.nama_promo,
          jenis_diskon: promo.jenis_diskon,
          nilai_diskon: diskonNilai,
          harga_asal: rawHarga,
          harga_promo: hargaDiskon,
        };
      }

      return {
        ...baseItem,
        is_promo: false,
        harga_asal: rawHarga,
        harga_promo: null,
      };
    });

    const formattedData = [...formattedProduk, ...formattedPaket];

    return res.status(200).json({
      status: status.SUKSES,
      message: "Data produk berhasil dimuat",
      datetime: formatDateSystem(),
      data: formattedData,
    });
  } catch (error) {
    const oResult = {
      status: status.BAD_REQUEST,
      message: "Sistem sedang maintenance harap tunggu sebentar",
      datetime: formatDateSystem(),
    };
    Logging(error, {
      file: "/master/produk_dropdown.js",
      func: "dropdown",
      request: oPayload,
      response: oResult,
      user: username,
    });
    return res.status(500).json(oResult);
  }
};

router.get("/", handleProdukDropdown);
router.post("/", handleProdukDropdown);

export default router;
