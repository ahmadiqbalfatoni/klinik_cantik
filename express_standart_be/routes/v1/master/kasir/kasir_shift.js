/**
 * @project Sistem Klinik Kecantikan
 * @file kasir_shift.js
 * @description Modul manajemen sesi shift kasir, pembukaan shift, pencatatan kas, rekonsiliasi, dan validasi jam kerja
 */
import express from "express";
import DB from "../../../../core/config/knex.js";
import { formatDateSystem } from "../../components/tools/date_tools.js";
import { Logging } from "../../components/tools/servertool.js";
import { status } from "../../components/tools/general.js";
import { getBranchScope } from "../../components/tools/branch_scope.js";
import { formatInTimeZone } from "date-fns-tz";

const router = express.Router();
const TZ_INDONESIA = "Asia/Jakarta";

const HARI_MAP = {
  0: "minggu",
  1: "senin",
  2: "selasa",
  3: "rabu",
  4: "kamis",
  5: "jumat",
  6: "sabtu",
};

/**
 * Mendapatkan hari dan waktu saat ini di zona WIB (Asia/Jakarta)
 */
function getCurrentWIB() {
  const now = new Date();
  const hariIndex = parseInt(formatInTimeZone(now, TZ_INDONESIA, "i"), 10) % 7; // 1=Mon..7=Sun -> 0=Sun..6=Sat
  const hariStr = HARI_MAP[hariIndex];
  const timeStr = formatInTimeZone(now, TZ_INDONESIA, "HH:mm:ss");
  const dateStr = formatInTimeZone(now, TZ_INDONESIA, "yyyy-MM-dd");
  return { hariIndex, hariStr, timeStr, dateStr, now };
}

/**
 * 1. CEK STATUS JADWAL KERJA KASIR
 * Memvalidasi apakah kasir saat ini berada dalam rentang jadwal kerjanya
 */
router.post("/cek-jadwal", async (req, res) => {
  const user = req?.auth || {};
  const userCode = user.user_code || req.body?.user_code || "";
  const username = user.username || req.body?.username || "";
  const role = (user.role || req.body?.role || "").toLowerCase();

  try {
    // Jika bukan kasir (misal owner, manager, admin, superadmin), bypass pembatasan jadwal
    if (role !== "kasir") {
      return res.status(200).json({
        status: status.SUKSES,
        message: "Pengguna bukan kasir, akses diizinkan.",
        datetime: formatDateSystem(),
        data: {
          is_kasir: false,
          allowed: true,
          role,
        },
      });
    }

    // Cari profil karyawan kasir berdasarkan kode_user atau email/username
    let karyawan = await DB("mst_karyawan")
      .where(function () {
        if (userCode) this.where("kode_user", userCode);
        if (username) this.orWhere("email", username);
      })
      .first();

    if (!karyawan) {
      // Coba cari dengan LIKE nama atau username
      karyawan = await DB("mst_karyawan")
        .where("jabatan", "kasir")
        .where(function () {
          if (user.fullname) this.where("nama", user.fullname);
        })
        .first();
    }

    if (!karyawan) {
      return res.status(200).json({
        status: status.SUKSES,
        message: "Data karyawan kasir belum terhubung dengan akun Anda.",
        datetime: formatDateSystem(),
        data: {
          is_kasir: true,
          allowed: false,
          reason: "karyawan_tidak_ditemukan",
          message: "Data staf kasir untuk akun ini belum terdaftar di master karyawan.",
        },
      });
    }

    const { hariStr, timeStr, dateStr } = getCurrentWIB();

    // Ambil semua jadwal aktif kasir ini
    const allSchedules = await DB("mst_jadwal_karyawan")
      .where("no_sip", karyawan.no_sip)
      .where("status", "aktif")
      .orderByRaw("FIELD(hari, 'senin','selasa','rabu','kamis','jumat','sabtu','minggu') ASC")
      .orderBy("jam_mulai", "asc");

    // Cari jadwal untuk hari ini
    const todaySchedules = allSchedules.filter((j) => (j.hari || "").toLowerCase() === hariStr);

    let allowed = false;
    let reason = "";
    let statusMessage = "";
    let activeMatchedJadwal = null;

    if (allSchedules.length === 0) {
      allowed = false;
      reason = "belum_ada_jadwal";
      statusMessage = "Anda belum memiliki jadwal shift kasir yang terdaftar di sistem. Silakan hubungi Manager.";
    } else if (todaySchedules.length === 0) {
      allowed = false;
      reason = "tidak_ada_jadwal_hari_ini";
      statusMessage = `Anda tidak memiliki jadwal kerja pada hari ini (${hariStr.toUpperCase()}).`;
    } else {
      // Cek apakah waktu sekarang berada di antara jam_mulai dan jam_selesai salah satu jadwal hari ini
      const curTime = timeStr.slice(0, 8);

      for (const j of todaySchedules) {
        const jStart = (j.jam_mulai || "00:00:00").slice(0, 8);
        const jEnd = (j.jam_selesai || "23:59:59").slice(0, 8);

        if (curTime >= jStart && curTime <= jEnd) {
          allowed = true;
          activeMatchedJadwal = j;
          statusMessage = `Saat ini sedang dalam jam kerja aktif (${jStart.slice(0, 5)} - ${jEnd.slice(0, 5)} WIB).`;
          break;
        }
      }

      if (!allowed) {
        // Cek apakah sebelum jadwal pertama hari ini atau sesudah jadwal terakhir
        const firstStart = (todaySchedules[0].jam_mulai || "").slice(0, 5);
        const lastEnd = (todaySchedules[todaySchedules.length - 1].jam_selesai || "").slice(0, 5);

        if (curTime < (todaySchedules[0].jam_mulai || "")) {
          reason = "belum_mulai";
          statusMessage = `Saat ini belum memasuki jadwal kerja Anda. Jadwal shift Anda hari ini dimulai pukul ${firstStart} WIB.`;
        } else {
          reason = "sudah_selesai";
          statusMessage = `Jadwal shift kerja Anda hari ini telah berakhir pada pukul ${lastEnd} WIB.`;
        }
      }
    }

    // Ambil info shift kasir yang sedang aktif / open jika ada
    const activeShift = await DB("trx_kasir_shift")
      .where("user_code", userCode || karyawan.kode_user || "")
      .where("status", "open")
      .orderBy("id", "desc")
      .first();

    return res.status(200).json({
      status: status.SUKSES,
      message: "Status jadwal kasir berhasil diperiksa",
      datetime: formatDateSystem(),
      data: {
        is_kasir: true,
        allowed,
        reason,
        message: statusMessage,
        current_time: timeStr,
        current_date: dateStr,
        current_day: hariStr,
        karyawan: {
          no_sip: karyawan.no_sip,
          nama: karyawan.nama,
          kode_karyawan: karyawan.kode_karyawan,
          kode_cabang: karyawan.kode_cabang,
        },
        jadwal_hari_ini: todaySchedules,
        active_matched_jadwal: activeMatchedJadwal,
        all_schedules: allSchedules,
        active_shift: activeShift || null,
        shift_open: Boolean(activeShift),
      },
    });
  } catch (error) {
    Logging(error, { file: "kasir_shift.js", func: "cek-jadwal", user: username });
    return res.status(500).json({
      status: status.BAD_REQUEST,
      message: error.message || "Gagal memeriksa jadwal kasir",
      datetime: formatDateSystem(),
    });
  }
});

/**
 * 2. BUKA SESI SHIFT KASIR (START SHIFT)
 */
router.post("/buka", async (req, res) => {
  const user = req?.auth || {};
  const userCode = user.user_code || req.body?.user_code || "";
  const username = user.username || req.body?.username || "";
  const branchCode = getBranchScope(req, req.body?.kode_cabang);

  const { modal_awal, catatan_buka } = req.body;
  const modalAwalNum = Math.max(0, parseFloat(modal_awal) || 0);

  try {
    // Cari data karyawan/nama kasir
    let karyawan = await DB("mst_karyawan")
      .where(function () {
        if (userCode) this.where("kode_user", userCode);
        if (username) this.orWhere("email", username);
      })
      .first();

    const namaKasir = karyawan?.nama || user.fullname || username || "Kasir";
    const effectiveBranch = karyawan?.kode_cabang || branchCode || "CBG-001";

    // Pastikan kasir tidak memiliki shift yang masih OPEN
    const existingOpen = await DB("trx_kasir_shift")
      .where("user_code", userCode)
      .where("status", "open")
      .first();

    if (existingOpen) {
      return res.status(400).json({
        status: status.BAD_REQUEST,
        message: `Anda sudah memiliki sesi shift aktif (${existingOpen.kode_shift}). Silakan tutup sesi sebelumnya terlebih dahulu.`,
        datetime: formatDateSystem(),
        data: existingOpen,
      });
    }

    // Generate kode shift: SFT-YYYYMMDD-XXX
    const todayYmd = formatInTimeZone(new Date(), TZ_INDONESIA, "yyyyMMdd");
    const countShift = await DB("trx_kasir_shift")
      .where("kode_shift", "like", `SFT-${todayYmd}-%`)
      .count("id as total")
      .first();
    const nextSeq = (parseInt(countShift?.total || 0, 10) + 1).toString().padStart(3, "0");
    const kodeShift = `SFT-${todayYmd}-${nextSeq}`;

    // Generate kode mutasi modal awal: MUT-YYYYMMDD-XXX
    const countMut = await DB("trx_kasir_mutasi_kas")
      .where("kode_mutasi", "like", `MUT-${todayYmd}-%`)
      .count("id as total")
      .first();
    const nextMutSeq = (parseInt(countMut?.total || 0, 10) + 1).toString().padStart(3, "0");
    const kodeMutasi = `MUT-${todayYmd}-${nextMutSeq}`;

    const waktuSekarang = formatInTimeZone(new Date(), TZ_INDONESIA, "yyyy-MM-dd HH:mm:ss");

    await DB.transaction(async (trx) => {
      // 1. Simpan Header Shift
      await trx("trx_kasir_shift").insert({
        kode_shift: kodeShift,
        user_code: userCode,
        nama_kasir: namaKasir,
        kode_cabang: effectiveBranch,
        waktu_buka: waktuSekarang,
        modal_awal: modalAwalNum,
        total_penjualan_tunai: 0,
        total_penjualan_nontunai: 0,
        total_kas_masuk_lain: 0,
        total_kas_keluar: 0,
        kas_diharapkan: modalAwalNum,
        kas_aktual: null,
        selisih: null,
        status: "open",
        catatan_buka: catatan_buka || null,
        created_by: username,
        created_at: waktuSekarang,
        updated_by: username,
        updated_at: waktuSekarang,
      });

      // 2. Catat Mutasi Kas Awal
      await trx("trx_kasir_mutasi_kas").insert({
        kode_mutasi: kodeMutasi,
        kode_shift: kodeShift,
        user_code: userCode,
        nama_kasir: namaKasir,
        kode_cabang: effectiveBranch,
        tipe: "modal_awal",
        kategori: "Modal Buka Kasir",
        nominal: modalAwalNum,
        arus: "masuk",
        saldo_setelah: modalAwalNum,
        referensi: kodeShift,
        keterangan: catatan_buka || "Modal awal buka shift kasir",
        created_by: username,
        created_at: waktuSekarang,
      });
    });

    const createdShift = await DB("trx_kasir_shift").where("kode_shift", kodeShift).first();

    return res.status(200).json({
      status: status.SUKSES,
      message: `Sesi shift kasir berhasil dibuka (${kodeShift}) dengan modal Rp ${modalAwalNum.toLocaleString("id-ID")}`,
      datetime: formatDateSystem(),
      data: createdShift,
    });
  } catch (error) {
    Logging(error, { file: "kasir_shift.js", func: "buka", user: username });
    return res.status(500).json({
      status: status.BAD_REQUEST,
      message: error.message || "Gagal membuka sesi shift kasir",
      datetime: formatDateSystem(),
    });
  }
});

/**
 * 3. AMBIL DATA SHIFT AKTIF & MUTASI KAS SAAT INI
 */
router.post("/active", async (req, res) => {
  const user = req?.auth || {};
  const userCode = user.user_code || req.body?.user_code || "";

  try {
    const shift = await DB("trx_kasir_shift")
      .where("user_code", userCode)
      .where("status", "open")
      .orderBy("id", "desc")
      .first();

    if (!shift) {
      return res.status(200).json({
        status: status.SUKSES,
        message: "Tidak ada shift kasir yang sedang aktif",
        datetime: formatDateSystem(),
        data: null,
      });
    }

    // Ambil mutasi kas shift ini
    const mutasi = await DB("trx_kasir_mutasi_kas")
      .where("kode_shift", shift.kode_shift)
      .orderBy("id", "asc");

    return res.status(200).json({
      status: status.SUKSES,
      message: "Data shift aktif ditemukan",
      datetime: formatDateSystem(),
      data: {
        ...shift,
        mutasi,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: status.BAD_REQUEST,
      message: error.message || "Gagal mengambil data shift aktif",
      datetime: formatDateSystem(),
    });
  }
});

/**
 * 4. PENCATATAN KAS KELUAR / KAS MASUK LAIN (PETTY CASH / PENYESUAIAN)
 */
router.post("/mutasi", async (req, res) => {
  const user = req?.auth || {};
  const userCode = user.user_code || req.body?.user_code || "";
  const username = user.username || req.body?.username || "";

  const { kode_shift, tipe, kategori, nominal, keterangan } = req.body;
  const numNominal = Math.max(0, parseFloat(nominal) || 0);

  if (!["kas_masuk", "kas_keluar"].includes(tipe)) {
    return res.status(400).json({
      status: status.BAD_REQUEST,
      message: "Tipe mutasi harus 'kas_masuk' atau 'kas_keluar'",
      datetime: formatDateSystem(),
    });
  }

  if (numNominal <= 0) {
    return res.status(400).json({
      status: status.BAD_REQUEST,
      message: "Nominal mutasi kas harus lebih dari 0",
      datetime: formatDateSystem(),
    });
  }

  try {
    const shift = await DB("trx_kasir_shift")
      .where(function () {
        if (kode_shift) this.where("kode_shift", kode_shift);
        else this.where("user_code", userCode).where("status", "open");
      })
      .first();

    if (!shift || shift.status !== "open") {
      return res.status(400).json({
        status: status.BAD_REQUEST,
        message: "Sesi shift aktif tidak ditemukan untuk kasir ini.",
        datetime: formatDateSystem(),
      });
    }

    const todayYmd = formatInTimeZone(new Date(), TZ_INDONESIA, "yyyyMMdd");
    const countMut = await DB("trx_kasir_mutasi_kas")
      .where("kode_mutasi", "like", `MUT-${todayYmd}-%`)
      .count("id as total")
      .first();
    const nextMutSeq = (parseInt(countMut?.total || 0, 10) + 1).toString().padStart(3, "0");
    const kodeMutasi = `MUT-${todayYmd}-${nextMutSeq}`;

    const waktuSekarang = formatInTimeZone(new Date(), TZ_INDONESIA, "yyyy-MM-dd HH:mm:ss");

    let updatedShiftData = {};
    let saldoSetelah = parseFloat(shift.kas_diharapkan || 0);

    if (tipe === "kas_masuk") {
      const newMasukLain = parseFloat(shift.total_kas_masuk_lain || 0) + numNominal;
      saldoSetelah += numNominal;
      updatedShiftData = {
        total_kas_masuk_lain: newMasukLain,
        kas_diharapkan: saldoSetelah,
        updated_by: username,
        updated_at: waktuSekarang,
      };
    } else {
      const newKeluar = parseFloat(shift.total_kas_keluar || 0) + numNominal;
      saldoSetelah -= numNominal;
      updatedShiftData = {
        total_kas_keluar: newKeluar,
        kas_diharapkan: saldoSetelah,
        updated_by: username,
        updated_at: waktuSekarang,
      };
    }

    await DB.transaction(async (trx) => {
      await trx("trx_kasir_shift").where("id", shift.id).update(updatedShiftData);

      await trx("trx_kasir_mutasi_kas").insert({
        kode_mutasi: kodeMutasi,
        kode_shift: shift.kode_shift,
        user_code: shift.user_code,
        nama_kasir: shift.nama_kasir,
        kode_cabang: shift.kode_cabang,
        tipe,
        kategori: kategori || (tipe === "kas_keluar" ? "Pengeluaran Operasional Kasir" : "Kas Masuk Tambahan"),
        nominal: numNominal,
        arus: tipe === "kas_masuk" ? "masuk" : "keluar",
        saldo_setelah: saldoSetelah,
        referensi: null,
        keterangan: keterangan || (tipe === "kas_keluar" ? "Kas keluar kasir" : "Kas masuk kasir"),
        created_by: username,
        created_at: waktuSekarang,
      });
    });

    const resShift = await DB("trx_kasir_shift").where("id", shift.id).first();

    return res.status(200).json({
      status: status.SUKSES,
      message: `Pencatatan ${tipe === "kas_masuk" ? "kas masuk" : "kas keluar"} sebesar Rp ${numNominal.toLocaleString("id-ID")} berhasil disimpan.`,
      datetime: formatDateSystem(),
      data: resShift,
    });
  } catch (error) {
    Logging(error, { file: "kasir_shift.js", func: "mutasi", user: username });
    return res.status(500).json({
      status: status.BAD_REQUEST,
      message: error.message || "Gagal mencatat mutasi kas",
      datetime: formatDateSystem(),
    });
  }
});

/**
 * 5. TUTUP SESI SHIFT KASIR & REKONSILIASI KAS (END SHIFT)
 */
router.post("/tutup", async (req, res) => {
  const user = req?.auth || {};
  const userCode = user.user_code || req.body?.user_code || "";
  const username = user.username || req.body?.username || "";

  const { kode_shift, kas_aktual, catatan_tutup } = req.body;
  const numKasAktual = parseFloat(kas_aktual !== undefined ? kas_aktual : 0);

  try {
    const shift = await DB("trx_kasir_shift")
      .where(function () {
        if (kode_shift) this.where("kode_shift", kode_shift);
        else this.where("user_code", userCode).where("status", "open");
      })
      .first();

    if (!shift || shift.status !== "open") {
      return res.status(400).json({
        status: status.BAD_REQUEST,
        message: "Sesi shift aktif tidak ditemukan untuk kasir ini.",
        datetime: formatDateSystem(),
      });
    }

    const modalAwal = parseFloat(shift.modal_awal || 0);
    const penjualanTunai = parseFloat(shift.total_penjualan_tunai || 0);
    const kasMasukLain = parseFloat(shift.total_kas_masuk_lain || 0);
    const kasKeluar = parseFloat(shift.total_kas_keluar || 0);

    const kasDiharapkan = modalAwal + penjualanTunai + kasMasukLain - kasKeluar;
    const selisih = numKasAktual - kasDiharapkan;

    const waktuSekarang = formatInTimeZone(new Date(), TZ_INDONESIA, "yyyy-MM-dd HH:mm:ss");

    // Catat mutasi penutupan kasir
    const todayYmd = formatInTimeZone(new Date(), TZ_INDONESIA, "yyyyMMdd");
    const countMut = await DB("trx_kasir_mutasi_kas")
      .where("kode_mutasi", "like", `MUT-${todayYmd}-%`)
      .count("id as total")
      .first();
    const nextMutSeq = (parseInt(countMut?.total || 0, 10) + 1).toString().padStart(3, "0");
    const kodeMutasi = `MUT-${todayYmd}-${nextMutSeq}`;

    await DB.transaction(async (trx) => {
      await trx("trx_kasir_shift").where("id", shift.id).update({
        waktu_tutup: waktuSekarang,
        kas_diharapkan: kasDiharapkan,
        kas_aktual: numKasAktual,
        selisih: selisih,
        catatan_tutup: catatan_tutup || null,
        status: "closed",
        updated_by: username,
        updated_at: waktuSekarang,
      });

      await trx("trx_kasir_mutasi_kas").insert({
        kode_mutasi: kodeMutasi,
        kode_shift: shift.kode_shift,
        user_code: shift.user_code,
        nama_kasir: shift.nama_kasir,
        kode_cabang: shift.kode_cabang,
        tipe: "tutup_shift",
        kategori: "Penutupan Sesi & Penyerahan Kas Laci",
        nominal: numKasAktual,
        arus: "keluar",
        saldo_setelah: 0,
        referensi: shift.kode_shift,
        keterangan: `Penutupan shift. Ekspektasi kas: Rp ${kasDiharapkan.toLocaleString("id-ID")}, Fisik: Rp ${numKasAktual.toLocaleString("id-ID")}, Selisih: Rp ${selisih.toLocaleString("id-ID")}. ${catatan_tutup || ""}`,
        created_by: username,
        created_at: waktuSekarang,
      });
    });

    const closedShift = await DB("trx_kasir_shift").where("id", shift.id).first();

    return res.status(200).json({
      status: status.SUKSES,
      message: `Sesi shift ${shift.kode_shift} berhasil ditutup. Rekonsiliasi kas: ${selisih === 0 ? "Pas (Rp 0)" : (selisih > 0 ? "Lebih Rp " + selisih.toLocaleString("id-ID") : "Kurang Rp " + Math.abs(selisih).toLocaleString("id-ID"))}`,
      datetime: formatDateSystem(),
      data: closedShift,
    });
  } catch (error) {
    Logging(error, { file: "kasir_shift.js", func: "tutup", user: username });
    return res.status(500).json({
      status: status.BAD_REQUEST,
      message: error.message || "Gagal menutup sesi shift kasir",
      datetime: formatDateSystem(),
    });
  }
});

export default router;
