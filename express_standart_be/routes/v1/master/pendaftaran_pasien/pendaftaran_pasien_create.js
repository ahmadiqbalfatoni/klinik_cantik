/**
 * @copyright (c) 2026 PT Marstech Global (info@marstech.co.id)
 * @project Sistem Klinik
 * @file pendaftaran_pasien_create.js
 * @description Endpoint untuk merestorasi / registrasi profil pasien baru (mst_pasien saja)
 *
 * @author Antigravity
 * @created 2026-08-21
 */

import express from "express";
import DB from "../../../../core/config/knex.js";
import { formatDateSystem } from "../../components/tools/date_tools.js";
import { Logging, ChangesLog } from "../../components/tools/servertool.js";
import { status } from "../../components/tools/general.js";
import { getBranchScope } from "../../components/tools/branch_scope.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { body } = req;
  const oPayload = body || {};
  const username = req?.auth?.username || "system";
  const branchCode = getBranchScope(req, oPayload.kode_cabang) || req?.auth?.kode_cabang || "CBG-001";

  try {
    if (!oPayload || Object.keys(oPayload).length < 1) {
      return res.status(400).json({
        status: status.BAD_REQUEST,
        message: "Request body tidak boleh kosong",
        datetime: formatDateSystem(),
      });
    }

    // ─── VALIDASI MANDATORI & FORMAT ────────────────────────────────────────
    const nama = (oPayload.nama || "").trim();
    const no_hp = (oPayload.no_hp || "").trim();
    const tanggal_lahir = (oPayload.tanggal_lahir || "").trim();
    const jenis_kelamin = (oPayload.jenis_kelamin || "").trim().toUpperCase();
    const nik = (oPayload.nik || "").trim();

    const cleanStr = (val) => (val !== undefined && val !== null && String(val).trim() !== "" ? String(val).trim() : null);

    if (!nama) {
      return res.status(422).json({
        status: status.BAD_REQUEST,
        message: "Nama pasien wajib diisi",
        datetime: formatDateSystem(),
      });
    }

    if (!nik || !/^\d{16}$/.test(nik)) {
      return res.status(422).json({
        status: status.BAD_REQUEST,
        message: "NIK wajib diisi dan harus terdiri dari 16 digit angka",
        datetime: formatDateSystem(),
      });
    }

    if (!no_hp) {
      return res.status(422).json({
        status: status.BAD_REQUEST,
        message: "Nomor HP wajib diisi",
        datetime: formatDateSystem(),
      });
    }

    const cleanPhone = no_hp.replace(/[\s-]/g, "");
    const phoneRegex = /^(?:\+62|62|0)[8][1-9]\d{6,11}$/;
    if (!phoneRegex.test(cleanPhone)) {
      return res.status(422).json({
        status: status.BAD_REQUEST,
        message: "Format nomor HP tidak valid (contoh: 081234567890)",
        datetime: formatDateSystem(),
      });
    }

    if (!tanggal_lahir) {
      return res.status(422).json({
        status: status.BAD_REQUEST,
        message: "Tanggal lahir wajib diisi",
        datetime: formatDateSystem(),
      });
    }

    const tglLahirDate = new Date(tanggal_lahir);
    const todayDate = new Date();
    todayDate.setHours(23, 59, 59, 999);
    if (isNaN(tglLahirDate.getTime()) || tglLahirDate > todayDate) {
      return res.status(422).json({
        status: status.BAD_REQUEST,
        message: "Tanggal lahir tidak valid atau tidak boleh di masa depan",
        datetime: formatDateSystem(),
      });
    }

    const provinsi = cleanStr(oPayload.provinsi);
    if (!provinsi) {
      return res.status(422).json({
        status: status.BAD_REQUEST,
        message: "Provinsi wajib diisi/dipilih",
        datetime: formatDateSystem(),
      });
    }

    const existingNik = await DB("mst_pasien")
      .where("nik", nik)
      .where("status", "aktif")
      .first();

    if (existingNik) {
      return res.status(422).json({
        status: status.BAD_REQUEST,
        message: `NIK ${nik} sudah terdaftar atas nama ${existingNik.nama} (RM: ${existingNik.no_rm})`,
        datetime: formatDateSystem(),
      });
    }

    const validGolDarah = ["A", "B", "AB", "O", "-"];
    const validAgama = ["Islam", "Kristen", "Katolik", "Hindu", "Buddha", "Konghucu", "Lainnya"];
    const validStatusNikah = ["belum_menikah", "menikah", "cerai_hidup", "cerai_mati"];
    const validKewarganegaraan = ["WNI", "WNA"];
    const validJenisKelamin = ["L", "P"];

    const safeGolDarah = validGolDarah.includes(oPayload.golongan_darah) ? oPayload.golongan_darah : null;
    const safeAgama = validAgama.includes(oPayload.agama) ? oPayload.agama : null;
    const safeStatusNikah = validStatusNikah.includes(oPayload.status_perkawinan) ? oPayload.status_perkawinan : null;
    const safeKewarganegaraan = validKewarganegaraan.includes(oPayload.kewarganegaraan) ? oPayload.kewarganegaraan : "WNI";
    const safeJenisKelamin = validJenisKelamin.includes(jenis_kelamin) ? jenis_kelamin : "L";

    // ─── TRANSAKSI DB HANYA UNTUK MST_PASIEN ──────────────────────────────────
    let resultData = null;

    await DB.transaction(async (trx) => {
      // 1. Generate No RM Auto (RM-000001 dst)
      const lastPasien = await trx("mst_pasien")
        .where("no_rm", "like", "RM-%")
        .whereNot("no_rm", "RM-000000")
        .orderBy("id", "desc")
        .first();

      let nextRmSeq = 1;
      if (lastPasien && lastPasien.no_rm) {
        const parts = lastPasien.no_rm.split("-");
        const num = parseInt(parts[1], 10);
        if (!isNaN(num)) {
          nextRmSeq = num + 1;
        }
      }
      const cNoRm = `RM-${String(nextRmSeq).padStart(6, "0")}`;

      // 2. Insert mst_pasien
      const oPasienData = {
        kode_cabang: branchCode,
        no_rm: cNoRm,
        nama: nama,
        nik: nik,
        tempat_lahir: cleanStr(oPayload.tempat_lahir),
        tanggal_lahir: tanggal_lahir,
        jenis_kelamin: safeJenisKelamin,
        golongan_darah: safeGolDarah,
        agama: safeAgama,
        status_perkawinan: safeStatusNikah,
        kewarganegaraan: safeKewarganegaraan,
        pekerjaan: cleanStr(oPayload.pekerjaan),
        provinsi: provinsi,
        kota_kabupaten: cleanStr(oPayload.kota_kabupaten),
        kecamatan: cleanStr(oPayload.kecamatan),
        kelurahan_desa: cleanStr(oPayload.kelurahan_desa),
        kode_pos: cleanStr(oPayload.kode_pos),
        patokan: cleanStr(oPayload.patokan),
        no_hp: cleanPhone,
        email: cleanStr(oPayload.email),
        nama_kontak_darurat: cleanStr(oPayload.nama_kontak_darurat),
        no_hp_kontak_darurat: cleanStr(oPayload.no_hp_kontak_darurat),
        hubungan_kontak_darurat: cleanStr(oPayload.hubungan_kontak_darurat),
        alergi: cleanStr(oPayload.alergi),
        foto: cleanStr(oPayload.foto),
        status: ["aktif", "nonaktif"].includes(oPayload.status) ? oPayload.status : "aktif",
        tz: oPayload.tz || "Asia/Jakarta",
        created_by: username,
        created_at: formatDateSystem(),
        updated_by: username,
        updated_at: formatDateSystem(),
      };

      const [pasienId] = await trx("mst_pasien").insert(oPasienData);

      // Audit Log
      await ChangesLog(
        {
          description: `Pendaftaran Pasien Baru (${cNoRm} - ${nama})`,
          tableName: "mst_pasien",
          referenceCode: cNoRm,
          action: "CREATE",
          dataBefore: null,
          dataAfter: oPasienData,
          user: username,
          tz: oPayload.tz || "Asia/Jakarta",
        },
        trx
      );

      resultData = {
        id: pasienId,
        no_rm: cNoRm,
        nama: nama,
        nik: nik || null,
        no_hp: cleanPhone,
        tanggal_lahir: tanggal_lahir,
        jenis_kelamin: jenis_kelamin,
        provinsi: oPayload.provinsi || null,
        kota_kabupaten: oPayload.kota_kabupaten || null,
      };
    });

    return res.status(200).json({
      status: status.SUKSES,
      message: "Profil pasien baru berhasil terdaftar",
      datetime: formatDateSystem(),
      data: resultData,
    });
  } catch (error) {
    if (error.statusCode === 422) {
      return res.status(422).json({
        status: status.BAD_REQUEST,
        message: error.message,
        datetime: formatDateSystem(),
      });
    }

    const oResult = {
      status: status.BAD_REQUEST,
      message: error.message || "Sistem sedang maintenance harap tunggu sebentar",
      datetime: formatDateSystem(),
    };

    Logging(error, {
      file: "/master/pendaftaran_pasien/pendaftaran_pasien_create.js",
      func: "create_pasien",
      request: body,
      response: oResult,
      user: username,
    });

    return res.status(500).json(oResult);
  }
});

export default router;
