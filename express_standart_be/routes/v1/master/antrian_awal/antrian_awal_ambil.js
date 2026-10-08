/**
 * @copyright (c) 2026 PT Marstech Global (info@marstech.co.id)
 * @project Sistem Klinik
 * @file antrian_awal_ambil.js
 * @description Endpoint untuk mengambil nomor antrian pendaftaran berikutnya yang berstatus tersedia
 *
 * @author Antigravity
 * @created 2026-09-03
 * @version 1.0.0
 */

import express from "express";
import { status } from "../../components/tools/general.js";
import DB from "../../../../core/config/knex.js";
import {
  Logging,
  ChangesLog,
} from "../../components/tools/servertool.js";
import { formatDateSystem } from "../../components/tools/date_tools.js";
import { getBranchScope } from "../../components/tools/branch_scope.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { body } = req;
  const oPayload = body || {};
  const username = req?.auth?.username || "";
  const branchCode = getBranchScope(req, oPayload.kode_cabang) || req?.auth?.kode_cabang || "CBG-001";

  try {
    let resultData = null;

    await DB.transaction(async (trx) => {
      const now = formatDateSystem();

      // Ambil kartu antrean urutan terkecil yang berstatus 'tersedia' dari pool fisik master (01-50)
      let qRecord = trx("trx_antrian_awal")
        .where("status", "tersedia");
      if (branchCode) {
        qRecord = qRecord.andWhere("kode_cabang", branchCode);
      }
      const record = await qRecord
        .orderByRaw("CAST(nomor_antrian AS UNSIGNED) ASC, nomor_antrian ASC")
        .forUpdate()
        .first();

      let finalKodeAntrian = "";
      let finalNoAntrian = "";

      if (!record) {
        // BATAS NOMOR FISIK TERCAPAI (TIDAK ADA LAGI YANG 'tersedia')
        // Otomatis buat nomor antrean baru (Auto-Extend / Auto-Increment)

        // 1. Cari nomor antrean tertinggi yang pernah ada di cabang ini
        let qMax = trx("trx_antrian_awal");
        if (branchCode) {
          qMax = qMax.where("kode_cabang", branchCode);
        }
        const maxRecord = await qMax
          .orderByRaw("CAST(nomor_antrian AS UNSIGNED) DESC, nomor_antrian DESC")
          .forUpdate()
          .first();

        let maxNum = 0;
        let padLength = 2; // Default 2 digit (01, 02, ..., 30, ...)

        if (maxRecord && maxRecord.nomor_antrian) {
          const rawNo = String(maxRecord.nomor_antrian).trim();
          const parsed = parseInt(rawNo.replace(/\D/g, ""), 10);
          if (!isNaN(parsed)) {
            maxNum = parsed;
          }
          if (rawNo.length > padLength) {
            padLength = rawNo.length;
          }
        }

        const nextNum = maxNum + 1;
        // Pertahankan format padding yang konsisten
        const effectivePad = Math.max(padLength, String(nextNum).length >= 3 ? 3 : 2);
        finalNoAntrian = String(nextNum).padStart(effectivePad, "0");

        // 2. Generate kode_antrian_awal baru (cth: A-YYYYMMDD-001)
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const prefixAntrian = `A-${todayStr}-`;

        let qLastCode = trx("trx_antrian_awal")
          .where("kode_antrian_awal", "like", `${prefixAntrian}%`);
        if (branchCode) {
          qLastCode = qLastCode.andWhere("kode_cabang", branchCode);
        }
        const lastCodeRecord = await qLastCode
          .orderBy("id", "desc")
          .forUpdate()
          .first();

        let nextSeq = 1;
        if (lastCodeRecord && lastCodeRecord.kode_antrian_awal) {
          const parts = lastCodeRecord.kode_antrian_awal.split("-");
          const lastNum = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(lastNum)) {
            nextSeq = lastNum + 1;
          }
        }

        const seqPadded = String(nextSeq).padStart(3, "0");
        finalKodeAntrian = `${prefixAntrian}${seqPadded}`;

        // 3. Insert nomor baru langsung dengan status 'terpakai' & diambil_at = now
        const insertData = {
          kode_cabang: branchCode,
          kode_antrian_awal: finalKodeAntrian,
          nomor_antrian: finalNoAntrian,
          status: "terpakai",
          diambil_at: now,
          dipanggil_at: null,
          tz: oPayload.tz || "UTC",
          created_by: username || "System (Auto-Extend)",
          created_at: now,
          updated_by: username || "System (Auto-Extend)",
          updated_at: now,
        };

        const [newId] = await trx("trx_antrian_awal").insert(insertData);

        await ChangesLog(
          {
            description: `Ambil Tiket Antrean Baru (Auto-Extend) - Nomor ${finalNoAntrian}`,
            tableName: "trx_antrian_awal",
            referenceCode: finalKodeAntrian,
            action: "CREATE",
            dataBefore: null,
            dataAfter: { id: newId, ...insertData },
            user: username || "System",
            tz: oPayload.tz || "UTC",
          },
          trx
        );
      } else {
        // Ambil dari kartu fisik yang sudah tersedia
        finalKodeAntrian = record.kode_antrian_awal;
        finalNoAntrian = record.nomor_antrian;

        const updateData = {
          status: "terpakai",
          diambil_at: now,
          dipanggil_at: null,
          updated_by: username,
          updated_at: now,
        };

        await trx("trx_antrian_awal")
          .where("id", record.id)
          .update(updateData);

        await ChangesLog(
          {
            description: `Ambil Tiket Antrean Pendaftaran - Nomor ${record.nomor_antrian}`,
            tableName: "trx_antrian_awal",
            referenceCode: record.kode_antrian_awal,
            action: "UPDATE",
            dataBefore: record,
            dataAfter: { ...record, ...updateData },
            user: username,
            tz: oPayload.tz || "UTC",
          },
          trx
        );
      }

      // Hitung jumlah antrean yang sedang menunggu di depannya (diambil & belum dipanggil, atau sedang dipanggil)
      let qWaiting = trx("trx_antrian_awal")
        .where((qb) => {
          qb.where(function () {
            this.where("status", "terpakai")
              .whereNull("dipanggil_at")
              .where("kode_antrian_awal", "!=", finalKodeAntrian);
          }).orWhere("status", "dipanggil");
        });
      if (branchCode) {
        qWaiting = qWaiting.andWhere("kode_cabang", branchCode);
      }
      const waitingCount = await qWaiting
        .count("* as total")
        .first();

      const totalMenunggu = parseInt(waitingCount?.total || 0, 10);

      resultData = {
        kode_antrian: finalKodeAntrian,
        no_antrian: finalNoAntrian,
        diambil_at: now,
        antrean_menunggu: totalMenunggu,
        nama_klinik: "Klinik Kecantikan",
      };
    });

    return res.status(200).json({
      status: status.SUKSES,
      message: `Nomor antrean ${resultData.no_antrian} berhasil diambil`,
      datetime: formatDateSystem(),
      data: resultData,
    });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({
        status: status.NOT_FOUND,
        message: error.message,
        datetime: formatDateSystem(),
      });
    }

    if (error.statusCode === 422) {
      return res.status(422).json({
        status: status.BAD_REQUEST,
        message: error.message,
        datetime: formatDateSystem(),
      });
    }

    const oResult = {
      status: status.BAD_REQUEST,
      message: "Sistem sedang maintenance harap tunggu sebentar",
      datetime: formatDateSystem(),
    };

    Logging(error, {
      file: "/master/antrian_awal/antrian_awal_ambil.js",
      func: "ambil",
      request: oPayload,
      response: oResult,
      user: username,
    });

    return res.status(500).json(oResult);
  }
});

export default router;
