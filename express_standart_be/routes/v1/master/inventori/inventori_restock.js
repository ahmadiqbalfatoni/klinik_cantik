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
  const branchCode = getBranchScope(req, oPayload.kode_cabang) || req?.auth?.kode_cabang || "CBG-001";

  try {
    // Normalisasi jika payload legacy dikirim dalam bentuk single-item flat
    if (!oPayload.items && oPayload.kode_produk) {
      oPayload.items = [
        {
          tipe_item: "existing",
          kode_produk: oPayload.kode_produk,
          qty_masuk: oPayload.qty_masuk,
          harga_beli: oPayload.harga_beli,
          no_batch: oPayload.no_batch,
          tanggal_kadaluarsa: oPayload.tanggal_kadaluarsa,
          update_harga_beli_master: oPayload.update_harga_beli_master ?? true,
        },
      ];
    }

    const cValidation = await validatePayload(
      {
        kode_supplier: Joi.string().required().label("Supplier"),
        tanggal: Joi.string().optional().label("Tanggal Restock"),
        items: Joi.array()
          .min(1)
          .items(
            Joi.object({
              tipe_item: Joi.string().valid("existing", "baru").required().label("Tipe Item"),
              // Untuk tipe_item = "existing"
              kode_produk: Joi.string().when("tipe_item", {
                is: "existing",
                then: Joi.required().label("Kode Produk"),
                otherwise: Joi.optional().allow("", null),
              }),
              // Untuk tipe_item = "baru"
              nama_produk_baru: Joi.string().max(100).when("tipe_item", {
                is: "baru",
                then: Joi.required().label("Nama Produk Baru"),
                otherwise: Joi.optional().allow("", null),
              }),
              kode_kategori_produk: Joi.string().when("tipe_item", {
                is: "baru",
                then: Joi.required().label("Kategori Produk"),
                otherwise: Joi.optional().allow("", null),
              }),
              satuan: Joi.string().max(20).when("tipe_item", {
                is: "baru",
                then: Joi.required().label("Satuan Produk"),
                otherwise: Joi.optional().allow("", null),
              }),
              harga_jual: Joi.number().min(0).when("tipe_item", {
                is: "baru",
                then: Joi.required().label("Harga Jual Satuan"),
                otherwise: Joi.optional().allow(null),
              }),
              stok_minimum: Joi.number().integer().min(0).optional().default(5).label("Stok Minimum"),
              // Field umum untuk kedua tipe
              qty_masuk: Joi.number().integer().min(1).required().label("Jumlah Restock (Qty)"),
              harga_beli: Joi.number().min(0).required().label("Harga Beli Satuan"),
              no_batch: Joi.string().max(50).required().label("No. Batch"),
              tanggal_kadaluarsa: Joi.string().required().label("Tanggal Kadaluarsa"),
              update_harga_beli_master: Joi.boolean().optional().default(true).label("Perbarui Harga Master"),
            })
          )
          .required()
          .label("Daftar Item Produk"),
      },
      { "any.required": "{#label} wajib diisi", "string.empty": "{#label} tidak boleh kosong" },
      oPayload,
      { allowUnknown: true }
    );

    if (cValidation) {
      return res.status(422).json({ status: status.BAD_REQUEST, message: cValidation, datetime: formatDateSystem() });
    }

    let resultData = {};

    await DB.transaction(async (trx) => {
      // 1. Verifikasi Supplier
      let qSup = trx("mst_supplier").where("kode_supplier", oPayload.kode_supplier);
      if (branchCode) qSup = qSup.andWhere("kode_cabang", branchCode);
      const supplier = await qSup.first();
      if (!supplier) {
        const err = new Error("Data supplier tidak ditemukan");
        err.statusCode = 404;
        throw err;
      }

      const tglPo = oPayload.tanggal || new Date().toISOString().slice(0, 10);
      const todayStr = tglPo.replace(/-/g, "");

      // 2. Hitung total nilai seluruh item PO
      let totalPo = 0;
      for (const item of oPayload.items) {
        const qty = parseInt(item.qty_masuk, 10);
        const harga = parseFloat(item.harga_beli);
        totalPo += qty * harga;
      }

      // 3. Generate 1 kode_po (PO-YYYYMMDD-XXXX)
      const existingPos = await trx("trx_purchase_order").where("kode_po", "like", `PO-${todayStr}-%`).select("kode_po");
      let maxPoNum = 0;
      for (const p of existingPos) {
        const parts = p.kode_po.split("-");
        const n = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(n) && n > maxPoNum) maxPoNum = n;
      }
      const nextPoNum = maxPoNum + 1;
      const kodePo = `PO-${todayStr}-${String(nextPoNum).padStart(3, "0")}`;

      // 4. Simpan ke trx_purchase_order (1 baris induk PO)
      const oPo = {
        kode_cabang: branchCode,
        kode_po: kodePo,
        kode_supplier: oPayload.kode_supplier,
        tanggal_po: tglPo,
        total_po: totalPo,
        status: "diterima",
        tz: oPayload.tz || "UTC",
        created_by: username,
        created_at: formatDateSystem(),
        updated_by: username,
        updated_at: formatDateSystem(),
      };
      await trx("trx_purchase_order").insert(oPo);

      // Persiapkan generator nomor urut untuk batch, movement, dan produk baru
      const existingBatches = await trx("mst_produk_batch").where("kode_batch", "like", `BTC-${todayStr}-%`).select("kode_batch");
      let currentBatchNum = 0;
      for (const b of existingBatches) {
        const parts = b.kode_batch.split("-");
        const n = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(n) && n > currentBatchNum) currentBatchNum = n;
      }

      const existingMovs = await trx("trx_stok_movement").where("kode_stok_movement", "like", `MOV-${todayStr}-%`).select("kode_stok_movement");
      let currentMovNum = 0;
      for (const m of existingMovs) {
        const parts = m.kode_stok_movement.split("-");
        const n = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(n) && n > currentMovNum) currentMovNum = n;
      }

      const allPrd = await trx("mst_produk").where("kode_produk", "like", "PRD-%").select("kode_produk");
      let currentPrdNum = 0;
      for (const p of allPrd) {
        const num = parseInt(p.kode_produk.replace("PRD-", ""), 10);
        if (!isNaN(num) && num > currentPrdNum) currentPrdNum = num;
      }

      const processedItems = [];

      // 5. Loop setiap item produk dalam request
      for (let i = 0; i < oPayload.items.length; i++) {
        const item = oPayload.items[i];
        const qtyMasuk = parseInt(item.qty_masuk, 10);
        const hargaBeli = parseFloat(item.harga_beli);
        const subtotalItem = qtyMasuk * hargaBeli;
        const tglExp = String(item.tanggal_kadaluarsa).slice(0, 10);
        const noBatch = item.no_batch.trim();

        let kodeProduk = "";
        let namaProduk = "";
        let stokSebelum = 0;
        let produkRef = null;

        if (item.tipe_item === "baru") {
          // Buat produk baru di mst_produk
          currentPrdNum++;
          kodeProduk = `PRD-${String(currentPrdNum).padStart(3, "0")}`;
          namaProduk = item.nama_produk_baru.trim();

          // Cek apakah nama produk sudah ada
          let qDup = trx("mst_produk").whereRaw("LOWER(nama) = ?", [namaProduk.toLowerCase()]);
          if (branchCode) qDup = qDup.andWhere("kode_cabang", branchCode);
          const dupProd = await qDup.first();
          if (dupProd) {
            const err = new Error(`Nama produk "${namaProduk}" sudah terdaftar dengan kode ${dupProd.kode_produk}`);
            err.statusCode = 422;
            throw err;
          }

          const hargaJual = parseFloat(item.harga_jual || 0);
          const stokMin = parseInt(item.stok_minimum ?? 5, 10);

          const oNewProduk = {
            kode_cabang: branchCode,
            kode_produk: kodeProduk,
            kode_kategori_produk: item.kode_kategori_produk,
            kode_supplier: oPayload.kode_supplier,
            nama: namaProduk,
            satuan: item.satuan || "Pcs",
            harga_beli: hargaBeli,
            harga_jual: hargaJual,
            stok_minimum: stokMin,
            stok_tersedia: 0,
            no_batch: noBatch,
            tanggal_kadaluarsa: tglExp,
            status: "aktif",
            tz: oPayload.tz || "UTC",
            created_by: username,
            created_at: formatDateSystem(),
            updated_by: username,
            updated_at: formatDateSystem(),
          };
          await trx("mst_produk").insert(oNewProduk);
          stokSebelum = 0;
        } else {
          // Produk existing
          kodeProduk = item.kode_produk;
          let qProd = trx("mst_produk").where("kode_produk", kodeProduk);
          if (branchCode) qProd = qProd.andWhere("kode_cabang", branchCode);
          produkRef = await qProd.forUpdate().first();
          if (!produkRef) {
            const err = new Error(`Data produk ${kodeProduk} tidak ditemukan`);
            err.statusCode = 404;
            throw err;
          }
          namaProduk = produkRef.nama;
          stokSebelum = parseInt(produkRef.stok_tersedia || 0, 10);
        }

        const stokSesudah = stokSebelum + qtyMasuk;

        // Generate kode_batch unik & Simpan ke mst_produk_batch
        currentBatchNum++;
        const kodeBatch = `BTC-${todayStr}-${String(currentBatchNum).padStart(3, "0")}`;

        const oBatch = {
          kode_batch: kodeBatch,
          kode_produk: kodeProduk,
          no_batch: noBatch,
          tanggal_kadaluarsa: tglExp,
          stok_masuk: qtyMasuk,
          stok_sisa: qtyMasuk,
          harga_beli_satuan: hargaBeli,
          kode_supplier: oPayload.kode_supplier,
          kode_po: kodePo,
          is_legacy_estimate: 0,
          status: "aktif",
          catatan: `Restock produk (${kodePo})`,
          tz: oPayload.tz || "UTC",
          created_by: username,
          created_at: formatDateSystem(),
          updated_by: username,
          updated_at: formatDateSystem(),
          kode_cabang: branchCode,
        };
        await trx("mst_produk_batch").insert(oBatch);

        // Simpan detail PO (DPO-YYYYMMDD-XXX-1, DPO-YYYYMMDD-XXX-2, dst)
        const kodeDetailPo = `DPO-${todayStr}-${String(nextPoNum).padStart(3, "0")}-${i + 1}`;
        const oDetailPo = {
          kode_detail_po: kodeDetailPo,
          kode_po: kodePo,
          kode_produk: kodeProduk,
          kode_batch: kodeBatch,
          no_batch: noBatch,
          tanggal_kadaluarsa: tglExp,
          qty: qtyMasuk,
          harga_satuan: hargaBeli,
          subtotal: subtotalItem,
          tz: oPayload.tz || "UTC",
          created_by: username,
          created_at: formatDateSystem(),
          updated_by: username,
          updated_at: formatDateSystem(),
        };
        await trx("trx_detail_purchase_order").insert(oDetailPo);

        // Simpan log mutasi stok masuk (trx_stok_movement)
        currentMovNum++;
        const kodeMovement = `MOV-${todayStr}-${String(currentMovNum).padStart(3, "0")}`;

        const oMovement = {
          kode_cabang: branchCode,
          kode_stok_movement: kodeMovement,
          kode_produk: kodeProduk,
          kode_batch: kodeBatch,
          jenis_movement: "masuk",
          referensi: kodePo,
          qty: qtyMasuk,
          stok_sebelum: stokSebelum,
          stok_sesudah: stokSesudah,
          tanggal: formatDateSystem(),
          tz: oPayload.tz || "UTC",
          created_by: username,
          created_at: formatDateSystem(),
          updated_by: username,
          updated_at: formatDateSystem(),
        };
        await trx("trx_stok_movement").insert(oMovement);

        // Update harga beli master jika diaktifkan
        if (item.update_harga_beli_master !== false) {
          await trx("mst_produk").where("kode_produk", kodeProduk).update({
            harga_beli: hargaBeli,
            kode_supplier: oPayload.kode_supplier,
            updated_by: username,
            updated_at: formatDateSystem(),
          });
        }

        // Sinkronisasi batch summary untuk SETIAP produk dalam loop
        await syncProdukBatch(kodeProduk, trx);

        // Log perubahan
        await ChangesLog(
          {
            description: `Restock Produk ${kodeProduk} (${namaProduk} +${qtyMasuk} - Batch: ${noBatch}) dari Supplier ${oPayload.kode_supplier} (${kodePo})`,
            tableName: "mst_produk",
            referenceCode: kodeProduk,
            action: item.tipe_item === "baru" ? "INSERT" : "UPDATE",
            dataBefore: item.tipe_item === "baru" ? null : { stok_tersedia: stokSebelum, harga_beli: produkRef?.harga_beli },
            dataAfter: { stok_tersedia: stokSesudah, harga_beli: hargaBeli, batch: oBatch, po: oPo },
            user: username,
            tz: oPayload.tz || "UTC",
          },
          trx
        );

        processedItems.push({
          kode_produk: kodeProduk,
          nama_produk: namaProduk,
          tipe_item: item.tipe_item,
          kode_batch: kodeBatch,
          no_batch: noBatch,
          tanggal_kadaluarsa: tglExp,
          qty_masuk: qtyMasuk,
          harga_beli: hargaBeli,
          subtotal: subtotalItem,
          stok_sebelum: stokSebelum,
          stok_sesudah: stokSesudah,
        });
      }

      resultData = {
        kode_po: kodePo,
        kode_supplier: oPayload.kode_supplier,
        nama_supplier: supplier.nama,
        tanggal_po: tglPo,
        total_po: totalPo,
        total_items: processedItems.length,
        items: processedItems,
      };
    });

    return res.status(200).json({
      status: status.SUKSES,
      message: `Berhasil memproses Purchase Order ${resultData.kode_po} dengan ${resultData.total_items} produk dari Supplier ${resultData.nama_supplier}.`,
      datetime: formatDateSystem(),
      data: resultData,
    });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ status: status.NOT_FOUND, message: error.message, datetime: formatDateSystem() });
    }
    if (error.statusCode === 422) {
      return res.status(422).json({ status: status.BAD_REQUEST, message: error.message, datetime: formatDateSystem() });
    }
    const oResult = { status: status.BAD_REQUEST, message: error.message || "Sistem sedang maintenance", datetime: formatDateSystem() };
    Logging(error, { file: "/master/inventori/inventori_restock.js", func: "restock", request: oPayload, response: oResult, user: username });
    return res.status(500).json(oResult);
  }
});

export default router;
