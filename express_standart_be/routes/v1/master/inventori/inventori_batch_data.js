import express from "express";
import DB from "../../../../core/config/knex.js";
import { formatDateSystem } from "../../components/tools/date_tools.js";
import { Logging } from "../../components/tools/servertool.js";
import { status } from "../../components/tools/general.js";
import { getBranchScope } from "../../components/tools/branch_scope.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const oPayload = req.body;
  const username = req?.auth?.username || "";
  const branchCode = getBranchScope(req, oPayload.kode_cabang);
  const kodeProduk = oPayload.kode_produk || null;
  const filterStatus = oPayload.status || null; // 'aktif' | 'habis' | 'kadaluarsa'
  const page = parseInt(oPayload.page) || 1;
  const perPage = parseInt(oPayload.perPage) || 50;
  const hasPagination = oPayload.page !== undefined;

  try {
    const baseQuery = DB("mst_produk_batch as b")
      .leftJoin("mst_produk as p", "b.kode_produk", "p.kode_produk")
      .leftJoin("mst_supplier as s", "b.kode_supplier", "s.kode_supplier")
      .modify((qb) => {
        if (branchCode) {
          qb.where(function () {
            this.where("b.kode_cabang", branchCode).orWhere("p.kode_cabang", branchCode);
          });
        }
        if (kodeProduk) {
          qb.where("b.kode_produk", kodeProduk);
        }
        if (filterStatus) {
          qb.where("b.status", filterStatus);
        }
      });

    const selectFields = [
      "b.id",
      "b.kode_batch",
      "b.kode_produk",
      "p.nama as nama_produk",
      "p.satuan",
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
      "b.created_by",
      "b.created_at",
      "b.updated_at",
    ];

    let totalRecords = 0;
    let vaData = [];

    if (hasPagination) {
      const offset = (page - 1) * perPage;
      const countResult = await baseQuery.clone().count("* as total").first();
      totalRecords = parseInt(countResult?.total || 0, 10);
      vaData = await baseQuery
        .clone()
        .select(selectFields)
        .orderBy("b.tanggal_kadaluarsa", "asc")
        .orderBy("b.created_at", "desc")
        .limit(perPage)
        .offset(offset);
    } else {
      vaData = await baseQuery
        .clone()
        .select(selectFields)
        .orderBy("b.tanggal_kadaluarsa", "asc")
        .orderBy("b.created_at", "desc");
      totalRecords = vaData.length;
    }

    const now = new Date();
    const formattedData = vaData.map((item) => {
      let sisaHari = null;
      let statusExpired = "aman";

      if (item.tanggal_kadaluarsa) {
        const expDate = new Date(item.tanggal_kadaluarsa);
        sisaHari = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (sisaHari < 0) {
          statusExpired = "kadaluarsa";
        } else if (sisaHari <= 30) {
          statusExpired = "kritis";
        } else if (sisaHari <= 90) {
          statusExpired = "perhatian";
        } else {
          statusExpired = "aman";
        }
      }

      return {
        ...item,
        sisa_hari: sisaHari,
        status_expired: statusExpired,
        nilai_aset_batch: (item.stok_sisa || 0) * parseFloat(item.harga_beli_satuan || 0),
      };
    });

    return res.status(200).json({
      status: status.SUKSES,
      message: "Data batch produk berhasil dimuat",
      datetime: formatDateSystem(),
      data: formattedData,
      total_data: totalRecords,
    });
  } catch (error) {
    const oResult = {
      status: status.BAD_REQUEST,
      message: error.message || "Sistem sedang maintenance",
      datetime: formatDateSystem(),
    };
    Logging(error, { file: "/master/inventori/inventori_batch_data.js", func: "batch_data", request: oPayload, response: oResult, user: username });
    return res.status(500).json(oResult);
  }
});

export default router;
