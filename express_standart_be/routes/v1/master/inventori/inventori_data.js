import express from "express";
import DB from "../../../../core/config/knex.js";
import { formatDateSystem } from "../../components/tools/date_tools.js";
import { Logging } from "../../components/tools/servertool.js";
import { status } from "../../components/tools/general.js";
import { getBranchScope } from "../../components/tools/branch_scope.js";
import { getProdukBatchStockInfo } from "./batch_helper.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const oPayload = req.body;
  const username = req?.auth?.username || "";
  const branchCode = getBranchScope(req, oPayload.kode_cabang);
  const keyword = oPayload.keyword || "";
  const filterStatusStok = oPayload.status_stok || null; // 'aman' | 'menipis' | 'habis'
  const filterSupplier = oPayload.kode_supplier || null;
  const filterKategori = oPayload.kode_kategori_produk || null;
  const page = parseInt(oPayload.page) || 1;
  const perPage = parseInt(oPayload.perPage) || 10;
  const hasPagination = oPayload.page !== undefined || oPayload.perPage !== undefined;

  try {
    const baseQuery = DB("mst_produk as p")
      .leftJoin("mst_kategori_produk as k", "p.kode_kategori_produk", "k.kode_kategori_produk")
      .leftJoin("mst_supplier as s", "p.kode_supplier", "s.kode_supplier")
      .whereRaw("p.kode_produk NOT LIKE 'CUSTOM-%' AND p.kode_produk NOT LIKE 'CST-%'")
      .modify((qb) => {
        if (branchCode) {
          qb.where("p.kode_cabang", branchCode);
        }
        if (keyword) {
          const lower = keyword.toLowerCase();
          qb.where(function () {
            this.whereRaw("LOWER(p.kode_produk) LIKE ?", [`%${lower}%`])
              .orWhereRaw("LOWER(p.nama) LIKE ?", [`%${lower}%`])
              .orWhereRaw("LOWER(k.nama) LIKE ?", [`%${lower}%`])
              .orWhereRaw("LOWER(s.nama) LIKE ?", [`%${lower}%`]);
          });
        }
        if (filterSupplier) {
          qb.where("p.kode_supplier", filterSupplier);
        }
        if (filterKategori) {
          qb.where("p.kode_kategori_produk", filterKategori);
        }
        if (filterStatusStok === "habis") {
          qb.where("p.stok_tersedia", "<=", 0);
        } else if (filterStatusStok === "menipis") {
          qb.where("p.stok_tersedia", ">", 0).andWhereRaw("p.stok_tersedia <= p.stok_minimum");
        } else if (filterStatusStok === "aman") {
          qb.whereRaw("p.stok_tersedia > p.stok_minimum");
        } else if (filterStatusStok === "kadaluarsa") {
          qb.whereExists(function () {
            this.select("id")
              .from("mst_produk_batch as b")
              .whereRaw("b.kode_produk = p.kode_produk")
              .where("b.status", "aktif")
              .where("b.stok_sisa", ">", 0)
              .whereRaw("b.tanggal_kadaluarsa < CURDATE()");
          });
        }
      });

    // Ringkasan KPI Inventori
    const qSummary = DB("mst_produk")
      .whereRaw("kode_produk NOT LIKE 'CUSTOM-%' AND kode_produk NOT LIKE 'CST-%'")
      .where("status", "aktif");

    if (branchCode) qSummary.where("kode_cabang", branchCode);

    const summaryRaw = await qSummary
      .select(
        DB.raw("COUNT(id) as total_sku"),
        DB.raw("COALESCE(SUM(stok_tersedia), 0) as total_stok_unit"),
        DB.raw("COALESCE(SUM(CASE WHEN stok_tersedia <= 0 THEN 1 ELSE 0 END), 0) as stok_habis"),
        DB.raw("COALESCE(SUM(CASE WHEN stok_tersedia > 0 AND stok_tersedia <= stok_minimum THEN 1 ELSE 0 END), 0) as stok_menipis"),
        DB.raw("COALESCE(SUM(stok_tersedia * harga_beli), 0) as total_aset")
      )
      .first();

    const summary = {
      total_sku: parseInt(summaryRaw?.total_sku || 0, 10),
      total_stok_unit: parseInt(summaryRaw?.total_stok_unit || 0, 10),
      stok_habis: parseInt(summaryRaw?.stok_habis || 0, 10),
      stok_menipis: parseInt(summaryRaw?.stok_menipis || 0, 10),
      total_aset: parseFloat(summaryRaw?.total_aset || 0),
    };

    const selectFields = [
      "p.id",
      "p.kode_produk",
      "p.kode_kategori_produk",
      "k.nama as nama_kategori",
      "p.kode_supplier",
      "s.nama as nama_supplier",
      "s.no_hp as no_hp_supplier",
      "p.nama",
      "p.satuan",
      "p.foto",
      "p.harga_beli",
      "p.harga_jual",
      "p.stok_minimum",
      "p.stok_tersedia",
      "p.no_batch",
      "p.tanggal_kadaluarsa",
      DB.raw("(p.stok_tersedia * p.harga_beli) as nilai_aset"),
      DB.raw("CASE WHEN p.stok_tersedia <= 0 THEN 'habis' WHEN p.stok_tersedia <= p.stok_minimum THEN 'menipis' ELSE 'aman' END as status_stok"),
      "p.status",
      "p.created_at",
      "p.updated_at",
    ];

    let totalRecords = 0;
    let vaData = [];

    if (hasPagination) {
      const offset = (page - 1) * perPage;
      const countResult = await baseQuery.clone().count("* as total").first();
      totalRecords = parseInt(countResult?.total || 0, 10);
      vaData = await baseQuery.clone().select(selectFields).orderBy("p.stok_tersedia", "asc").limit(perPage).offset(offset);
    } else {
      vaData = await baseQuery.clone().select(selectFields).orderBy("p.stok_tersedia", "asc");
      totalRecords = vaData.length;
    }

    // Ambil daftar batch aktif untuk setiap produk yang tampil
    if (vaData.length > 0) {
      const prodCodes = vaData.map((p) => p.kode_produk);
      const allBatches = await DB("mst_produk_batch as b")
        .leftJoin("mst_supplier as s", "b.kode_supplier", "s.kode_supplier")
        .whereIn("b.kode_produk", prodCodes)
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
          "b.status",
          "b.catatan",
          "b.created_at"
        )
        .orderBy("b.tanggal_kadaluarsa", "asc")
        .orderBy("b.created_at", "desc");

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

      const batchStockMap = await getProdukBatchStockInfo(prodCodes, branchCode);

      vaData = vaData.map((p) => {
        const pBatches = batchMap[p.kode_produk] || [];
        const hasEstimate = pBatches.some((b) => b.is_legacy_estimate === 1 && b.stok_sisa > 0);
        // Prioritaskan batch aktif yang masih valid (FEFO layak jual), fallback ke batch aktif manapun, fallback ke batch[0]
        const nearestExpBatch =
          pBatches.find((b) => b.status === "aktif" && b.stok_sisa > 0 && b.status_expired !== "kadaluarsa" && (b.sisa_hari === null || b.sisa_hari >= 0)) ||
          pBatches.find((b) => b.status === "aktif" && b.stok_sisa > 0) ||
          pBatches[0] ||
          null;

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
          tanggal_kadaluarsa_terdekat: stockInfo?.tanggal_kadaluarsa_terdekat || p.tanggal_kadaluarsa || null,
          total_batch_kadaluarsa: stockInfo?.total_batch_kadaluarsa || 0,
          batches: pBatches,
          total_batch: pBatches.length,
          total_batch_aktif: pBatches.filter((b) => b.status === "aktif" && b.stok_sisa > 0).length,
          has_legacy_estimate: hasEstimate,
          nearest_batch: nearestExpBatch,
        };
      });
    }

    return res.status(200).json({
      status: status.SUKSES,
      message: "Data inventori berhasil dimuat",
      datetime: formatDateSystem(),
      data: vaData,
      total_data: totalRecords,
      summary,
    });
  } catch (error) {
    const oResult = { status: status.BAD_REQUEST, message: error.message || "Sistem sedang maintenance", datetime: formatDateSystem() };
    Logging(error, { file: "/master/inventori/inventori_data.js", func: "data", request: oPayload, response: oResult, user: username });
    return res.status(500).json(oResult);
  }
});

export default router;
