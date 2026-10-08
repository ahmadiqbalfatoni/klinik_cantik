/**
 * @project Sistem Klinik Kecantikan
 * @file kasir_tracking_kas.js
 * @description Modul tracking arus kas masuk dan keluar setiap kasir untuk Manager / Owner / Admin
 */
import express from "express";
import DB from "../../../../core/config/knex.js";
import { formatDateSystem } from "../../components/tools/date_tools.js";
import { Logging } from "../../components/tools/servertool.js";
import { status } from "../../components/tools/general.js";
import { getBranchScope } from "../../components/tools/branch_scope.js";

const router = express.Router();

/**
 * Helper untuk sanitasi nilai filter agar selalu string murni atau null (mencegah Knex object/array assertion error)
 */
const sanitizeFilterString = (val) => {
  if (val === undefined || val === null) return null;
  if (typeof val === "string") {
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof val === "number") {
    return String(val);
  }
  if (typeof val === "object") {
    if (val.value !== undefined && val.value !== null) {
      return sanitizeFilterString(val.value);
    }
    if (val.code !== undefined && val.code !== null) {
      return sanitizeFilterString(val.code);
    }
    if (val.id !== undefined && val.id !== null) {
      return sanitizeFilterString(val.id);
    }
    return null;
  }
  return null;
};

/**
 * 1. AMBIL LIST SESI SHIFT & SUMMARY TRACKING KAS (MANAGER VIEW)
 */
router.post("/data", async (req, res) => {
  const oPayload = req.body || {};
  const username = req?.auth?.username || "";
  const rawBranch = getBranchScope(req, oPayload.kode_cabang);
  const branchCode = sanitizeFilterString(rawBranch);

  const rawKeyword = typeof oPayload.keyword === "object" ? oPayload.keyword?.value : oPayload.keyword;
  const keyword = typeof rawKeyword === "string" ? rawKeyword.trim().toLowerCase() : "";
  const filterUserCode = sanitizeFilterString(oPayload.user_code);
  const filterStatus = sanitizeFilterString(oPayload.status); // 'open', 'closed'
  const filterTanggalMulai = sanitizeFilterString(oPayload.tanggal_mulai);
  const filterTanggalSelesai = sanitizeFilterString(oPayload.tanggal_selesai);

  const page = parseInt(oPayload.page, 10) || 1;
  const perPage = parseInt(oPayload.perPage, 10) || 10;
  const hasPagination = oPayload.page !== undefined || oPayload.perPage !== undefined;

  try {
    const applyFilters = (qb) => {
      if (branchCode && typeof branchCode === "string") {
        qb.where("s.kode_cabang", branchCode);
      }
      if (filterUserCode && typeof filterUserCode === "string") {
        qb.where("s.user_code", filterUserCode);
      }
      if (filterStatus && typeof filterStatus === "string") {
        qb.where("s.status", filterStatus);
      }
      if (filterTanggalMulai && typeof filterTanggalMulai === "string") {
        qb.whereRaw("DATE(s.waktu_buka) >= ?", [filterTanggalMulai]);
      }
      if (filterTanggalSelesai && typeof filterTanggalSelesai === "string") {
        qb.whereRaw("DATE(s.waktu_buka) <= ?", [filterTanggalSelesai]);
      }
      if (keyword && typeof keyword === "string") {
        qb.where(function () {
          this.whereRaw("LOWER(s.kode_shift) LIKE ?", [`%${keyword}%`])
            .orWhereRaw("LOWER(s.nama_kasir) LIKE ?", [`%${keyword}%`])
            .orWhereRaw("LOWER(s.user_code) LIKE ?", [`%${keyword}%`])
            .orWhereRaw("LOWER(COALESCE(s.catatan_buka, '')) LIKE ?", [`%${keyword}%`])
            .orWhereRaw("LOWER(COALESCE(s.catatan_tutup, '')) LIKE ?", [`%${keyword}%`]);
        });
      }
    };

    // Query Summary Aggregates (KPI Cards)
    const summaryQuery = DB("trx_kasir_shift as s");
    applyFilters(summaryQuery);
    const summaryResult = await summaryQuery
      .select(
        DB.raw("COUNT(s.id) as total_shift"),
        DB.raw("SUM(CASE WHEN s.status = 'open' THEN 1 ELSE 0 END) as total_shift_open"),
        DB.raw("SUM(CASE WHEN s.status = 'closed' THEN 1 ELSE 0 END) as total_shift_closed"),
        DB.raw("COALESCE(SUM(s.modal_awal), 0) as total_modal_awal"),
        DB.raw("COALESCE(SUM(s.total_penjualan_tunai), 0) as total_penjualan_tunai"),
        DB.raw("COALESCE(SUM(s.total_penjualan_nontunai), 0) as total_penjualan_nontunai"),
        DB.raw("COALESCE(SUM(s.total_kas_masuk_lain), 0) as total_kas_masuk_lain"),
        DB.raw("COALESCE(SUM(s.total_kas_keluar), 0) as total_kas_keluar"),
        DB.raw("COALESCE(SUM(s.kas_diharapkan), 0) as total_kas_diharapkan"),
        DB.raw("COALESCE(SUM(s.kas_aktual), 0) as total_kas_aktual"),
        DB.raw("COALESCE(SUM(s.selisih), 0) as total_selisih")
      )
      .first();

    // Query Data Table
    const dataQuery = DB("trx_kasir_shift as s")
      .leftJoin("mst_cabang as c", DB.raw("s.kode_cabang COLLATE utf8mb4_unicode_ci = c.kode_cabang COLLATE utf8mb4_unicode_ci"))
      .select(
        "s.id",
        "s.kode_shift",
        "s.user_code",
        "s.nama_kasir",
        "s.kode_cabang",
        "c.nama_cabang",
        "s.waktu_buka",
        "s.waktu_tutup",
        "s.modal_awal",
        "s.total_penjualan_tunai",
        "s.total_penjualan_nontunai",
        "s.total_kas_masuk_lain",
        "s.total_kas_keluar",
        "s.kas_diharapkan",
        "s.kas_aktual",
        "s.selisih",
        "s.status",
        "s.catatan_buka",
        "s.catatan_tutup",
        "s.created_by",
        "s.created_at"
      )
      .orderBy("s.waktu_buka", "desc");

    applyFilters(dataQuery);

    let rows = [];
    let totalRecords = parseInt(summaryResult?.total_shift || 0, 10);

    if (hasPagination) {
      const offset = (page - 1) * perPage;
      rows = await dataQuery.limit(perPage).offset(offset);
    } else {
      rows = await dataQuery;
    }

    // Hitung total kas masuk = penjualan tunai + kas masuk lain
    const totalPenjualanTunai = parseFloat(summaryResult?.total_penjualan_tunai || 0);
    const totalKasMasukLain = parseFloat(summaryResult?.total_kas_masuk_lain || 0);
    const totalKasMasukSemua = totalPenjualanTunai + totalKasMasukLain;

    return res.status(200).json({
      status: status.SUKSES,
      message: "Data tracking kas kasir berhasil diambil",
      datetime: formatDateSystem(),
      data: {
        records: rows,
        totalRecords,
        page,
        perPage,
        summary: {
          total_shift: parseInt(summaryResult?.total_shift || 0, 10),
          total_shift_open: parseInt(summaryResult?.total_shift_open || 0, 10),
          total_shift_closed: parseInt(summaryResult?.total_shift_closed || 0, 10),
          total_modal_awal: parseFloat(summaryResult?.total_modal_awal || 0),
          total_penjualan_tunai: totalPenjualanTunai,
          total_penjualan_nontunai: parseFloat(summaryResult?.total_penjualan_nontunai || 0),
          total_kas_masuk_lain: totalKasMasukLain,
          total_kas_masuk: totalKasMasukSemua,
          total_kas_keluar: parseFloat(summaryResult?.total_kas_keluar || 0),
          total_kas_diharapkan: parseFloat(summaryResult?.total_kas_diharapkan || 0),
          total_kas_aktual: parseFloat(summaryResult?.total_kas_aktual || 0),
          total_selisih: parseFloat(summaryResult?.total_selisih || 0),
        },
      },
    });
  } catch (error) {
    Logging(error, { file: "kasir_tracking_kas.js", func: "data", user: username });
    return res.status(500).json({
      status: status.BAD_REQUEST,
      message: error.message || "Gagal mengambil data tracking kas",
      datetime: formatDateSystem(),
    });
  }
});

/**
 * 2. AMBIL DETAIL SHIFT & KRONOLOGI MUTASI KAS
 */
router.post("/detail", async (req, res) => {
  const rawShift = req.body?.kode_shift;
  const kode_shift = sanitizeFilterString(rawShift);
  const username = req?.auth?.username || "";

  if (!kode_shift || typeof kode_shift !== "string") {
    return res.status(400).json({
      status: status.BAD_REQUEST,
      message: "kode_shift wajib diisi",
      datetime: formatDateSystem(),
    });
  }

  try {
    const shift = await DB("trx_kasir_shift as s")
      .leftJoin("mst_cabang as c", DB.raw("s.kode_cabang COLLATE utf8mb4_unicode_ci = c.kode_cabang COLLATE utf8mb4_unicode_ci"))
      .where("s.kode_shift", kode_shift)
      .select("s.*", "c.nama_cabang")
      .first();

    if (!shift) {
      return res.status(404).json({
        status: status.BAD_REQUEST,
        message: "Data shift tidak ditemukan",
        datetime: formatDateSystem(),
      });
    }

    const mutasi = await DB("trx_kasir_mutasi_kas")
      .where("kode_shift", kode_shift)
      .orderBy("id", "asc");

    return res.status(200).json({
      status: status.SUKSES,
      message: "Detail mutasi kas kasir berhasil diambil",
      datetime: formatDateSystem(),
      data: {
        shift,
        mutasi,
      },
    });
  } catch (error) {
    Logging(error, { file: "kasir_tracking_kas.js", func: "detail", user: username });
    return res.status(500).json({
      status: status.BAD_REQUEST,
      message: error.message || "Gagal mengambil detail mutasi kas",
      datetime: formatDateSystem(),
    });
  }
});

/**
 * 3. DROPDOWN LIST KASIR (UNTUK FILTER TRACKING OLEH MANAGER)
 */
router.post("/kasir-options", async (req, res) => {
  const rawBranch = getBranchScope(req, req.body?.kode_cabang);
  const branchCode = sanitizeFilterString(rawBranch);

  try {
    const query = DB("mst_karyawan as k")
      .where("k.jabatan", "kasir")
      .select("k.no_sip", "k.nama", "k.kode_karyawan", "k.kode_user", "k.email", "k.kode_cabang")
      .orderBy("k.nama", "asc");

    if (branchCode && typeof branchCode === "string") {
      query.where("k.kode_cabang", branchCode);
    }

    const rows = await query;

    return res.status(200).json({
      status: status.SUKSES,
      message: "Daftar kasir berhasil diambil",
      datetime: formatDateSystem(),
      data: rows,
    });
  } catch (error) {
    return res.status(500).json({
      status: status.BAD_REQUEST,
      message: error.message || "Gagal mengambil opsi kasir",
      datetime: formatDateSystem(),
    });
  }
});

export default router;
