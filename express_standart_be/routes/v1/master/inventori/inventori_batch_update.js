import express from "express";
import Joi from "joi";
import DB from "../../../../core/config/knex.js";
import { formatDateSystem } from "../../components/tools/date_tools.js";
import { Logging, ChangesLog, validatePayload } from "../../components/tools/servertool.js";
import { status } from "../../components/tools/general.js";
import { getBranchScope } from "../../components/tools/branch_scope.js";
import { syncProdukBatch } from "./batch_helper.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const oPayload = req.body;
  const username = req?.auth?.username || "system";
  const branchCode = getBranchScope(req, oPayload.kode_cabang);

  try {
    const cValidation = await validatePayload(
      {
        kode_batch: Joi.string().required().label("Kode Batch"),
        no_batch: Joi.string().max(50).required().label("Nomor Batch"),
        tanggal_kadaluarsa: Joi.string().required().label("Tanggal Kadaluarsa"),
        catatan: Joi.string().max(255).allow(null, "").optional().label("Catatan"),
        status: Joi.string().valid("aktif", "habis", "kadaluarsa").optional().label("Status"),
      },
      { "any.required": "{#label} wajib diisi", "string.empty": "{#label} tidak boleh kosong" },
      oPayload,
      { allowUnknown: true }
    );

    if (cValidation) {
      return res.status(422).json({ status: status.BAD_REQUEST, message: cValidation, datetime: formatDateSystem() });
    }

    let updatedBatch = null;

    await DB.transaction(async (trx) => {
      let qBatch = trx("mst_produk_batch").where("kode_batch", oPayload.kode_batch);
      if (branchCode) {
        qBatch = qBatch.andWhere("kode_cabang", branchCode);
      }
      const existing = await qBatch.forUpdate().first();

      if (!existing) {
        const err = new Error("Data batch tidak ditemukan");
        err.statusCode = 404;
        throw err;
      }

      const expDateStr = String(oPayload.tanggal_kadaluarsa).slice(0, 10);
      const updateData = {
        no_batch: oPayload.no_batch,
        tanggal_kadaluarsa: expDateStr,
        catatan: oPayload.catatan !== undefined ? oPayload.catatan : existing.catatan,
        is_legacy_estimate: 0, // Telah diverifikasi dan diupdate oleh user
        updated_by: username,
        updated_at: formatDateSystem(),
      };

      if (oPayload.status) {
        updateData.status = oPayload.status;
      }

      await trx("mst_produk_batch").where("id", existing.id).update(updateData);

      // Sinkronkan ke master produk
      await syncProdukBatch(existing.kode_produk, trx);

      // Catat log perubahan
      await ChangesLog(
        {
          description: `Perbarui Informasi Batch ${oPayload.kode_batch} (${existing.kode_produk})`,
          tableName: "mst_produk_batch",
          referenceCode: oPayload.kode_batch,
          action: "UPDATE",
          dataBefore: existing,
          dataAfter: { ...existing, ...updateData },
          user: username,
          tz: oPayload.tz || "UTC",
        },
        trx
      );

      updatedBatch = {
        ...existing,
        ...updateData,
      };
    });

    return res.status(200).json({
      status: status.SUKSES,
      message: `Data batch "${oPayload.no_batch}" berhasil diverifikasi dan diperbarui.`,
      datetime: formatDateSystem(),
      data: updatedBatch,
    });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ status: status.NOT_FOUND, message: error.message, datetime: formatDateSystem() });
    }
    const oResult = {
      status: status.BAD_REQUEST,
      message: error.message || "Sistem sedang maintenance",
      datetime: formatDateSystem(),
    };
    Logging(error, { file: "/master/inventori/inventori_batch_update.js", func: "batch_update", request: oPayload, response: oResult, user: username });
    return res.status(500).json(oResult);
  }
});

export default router;
