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
    // Normalisasi struktur jika menerima payload flat tunggal (backward compatibility)
    if (!Array.isArray(oPayload.items) && (oPayload.nama || oPayload.nama_produk_baru)) {
      oPayload.items = [
        {
          kode_kategori_produk: oPayload.kode_kategori_produk,
          satuan: oPayload.satuan,
          nama_produk_baru: oPayload.nama_produk_baru || oPayload.nama,
          harga_beli: oPayload.harga_beli,
          harga_jual: oPayload.harga_jual,
          buffer_min: oPayload.buffer_min ?? oPayload.stok_minimum ?? 5,
          batches: [
            {
              qty: oPayload.qty || oPayload.qty_beli || 1,
              no_batch: oPayload.no_batch,
              tanggal_kadaluarsa: oPayload.tanggal_kadaluarsa,
            },
          ],
        },
      ];
    } else if (Array.isArray(oPayload.items)) {
      // Normalisasi setiap produk di dalam items
      oPayload.items = oPayload.items.map((item) => {
        let batches = [];
        if (Array.isArray(item.batches) && item.batches.length > 0) {
          batches = item.batches.map((b) => ({
            qty: parseInt(b.qty, 10) || 1,
            no_batch: b.no_batch,
            tanggal_kadaluarsa: b.tanggal_kadaluarsa,
          }));
        } else if (item.no_batch || item.qty || item.qty_beli) {
          batches = [
            {
              qty: parseInt(item.qty || item.qty_beli, 10) || 1,
              no_batch: item.no_batch,
              tanggal_kadaluarsa: item.tanggal_kadaluarsa,
            },
          ];
        }

        return {
          kode_kategori_produk: item.kode_kategori_produk,
          satuan: item.satuan,
          nama_produk_baru: item.nama_produk_baru || item.nama,
          harga_beli: item.harga_beli,
          harga_jual: item.harga_jual,
          buffer_min: item.buffer_min ?? item.stok_minimum ?? 5,
          batches: batches,
        };
      });
    }

    const cValidation = await validatePayload(
      {
        kode_supplier: Joi.string().required().label("Supplier"),
        tanggal: Joi.string().optional().label("Tanggal Pembelian"),
        items: Joi.array()
          .min(1)
          .items(
            Joi.object({
              kode_kategori_produk: Joi.string().required().label("Kategori Produk"),
              satuan: Joi.string().required().label("Satuan"),
              nama_produk_baru: Joi.string().max(100).required().label("Nama Produk"),
              harga_beli: Joi.number().min(0).required().label("Harga Beli Satuan"),
              harga_jual: Joi.number().min(0).required().label("Harga Jual Satuan"),
              buffer_min: Joi.number().integer().min(0).optional().default(5).label("Batas Buffer Min"),
              batches: Joi.array()
                .min(1)
                .items(
                  Joi.object({
                    qty: Joi.number().integer().min(1).required().label("Jumlah Beli (Qty)"),
                    no_batch: Joi.string().max(50).required().label("No. Batch"),
                    tanggal_kadaluarsa: Joi.string().required().label("Tanggal Kadaluarsa"),
                  })
                )
                .required()
                .label("Daftar Batch"),
            })
          )
          .required()
          .label("Daftar Produk"),
      },
      { "any.required": "{#label} wajib diisi", "string.empty": "{#label} tidak boleh kosong" },
      oPayload
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

      // 2. Hitung Grand Total PO & Total Qty Akumulasi Seluruh Batch
      let totalPo = 0;
      let totalQty = 0;
      let totalBatchesCount = 0;

      for (const item of oPayload.items) {
        const hargaBeli = parseFloat(item.harga_beli) || 0;
        for (const batch of item.batches) {
          const qty = parseInt(batch.qty, 10) || 1;
          totalPo += qty * hargaBeli;
          totalQty += qty;
          totalBatchesCount++;
        }
      }

      // 3. Generate 1 kode_po unik (PO-YYYYMMDD-XXX)
      const existingPos = await trx("trx_purchase_order").where("kode_po", "like", `PO-${todayStr}-%`).select("kode_po");
      let maxPoNum = 0;
      for (const p of existingPos) {
        const parts = p.kode_po.split("-");
        const n = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(n) && n > maxPoNum) maxPoNum = n;
      }
      const nextPoNum = maxPoNum + 1;
      const kodePo = `PO-${todayStr}-${String(nextPoNum).padStart(3, "0")}`;

      // 4. Simpan 1 Header Induk PO
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

      // 5. Persiapkan generator kode increment untuk produk, batch, dan movement
      const allPrd = await trx("mst_produk").where("kode_produk", "like", "PRD-%").select("kode_produk");
      let currentPrdNum = 0;
      for (const p of allPrd) {
        const num = parseInt(p.kode_produk.replace("PRD-", ""), 10);
        if (!isNaN(num) && num > currentPrdNum) currentPrdNum = num;
      }

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

      const processedProducts = [];
      let globalDetailPoIndex = 0;

      // 6. Loop setiap produk (Tingkat 1)
      for (let i = 0; i < oPayload.items.length; i++) {
        const item = oPayload.items[i];
        const itemIndex = i + 1;

        // Cek duplikasi nama produk di database
        const existProd = await trx("mst_produk").where("nama", item.nama_produk_baru.trim()).first();
        if (existProd) {
          const err = new Error(`Produk #${itemIndex}: Nama Produk "${item.nama_produk_baru}" sudah terdaftar di sistem!`);
          err.statusCode = 422;
          throw err;
        }

        // Generate kode_produk baru
        currentPrdNum++;
        const kodeProduk = `PRD-${String(currentPrdNum).padStart(3, "0")}`;

        const hargaBeli = parseFloat(item.harga_beli);
        const hargaJual = parseFloat(item.harga_jual);
        const bufferMin = parseInt(item.buffer_min ?? 5, 10);

        // Hitung total stok dari semua batch untuk produk ini
        const totalQtyForProduct = item.batches.reduce((sum, b) => sum + (parseInt(b.qty, 10) || 1), 0);

        // Ambil batch dengan tanggal kadaluarsa paling awal untuk cache di mst_produk
        const sortedBatches = [...item.batches].sort((a, b) => {
          const dateA = new Date(a.tanggal_kadaluarsa).getTime();
          const dateB = new Date(b.tanggal_kadaluarsa).getTime();
          return dateA - dateB;
        });
        const primaryBatch = sortedBatches[0];
        const primaryNoBatch = primaryBatch ? primaryBatch.no_batch.trim() : "";
        const primaryTglExp = primaryBatch ? String(primaryBatch.tanggal_kadaluarsa).slice(0, 10) : tglPo;

        // 6.a Simpan 1 baris produk ke mst_produk
        const oProduk = {
          kode_cabang: branchCode,
          kode_produk: kodeProduk,
          kode_kategori_produk: item.kode_kategori_produk,
          kode_supplier: oPayload.kode_supplier,
          nama: item.nama_produk_baru.trim(),
          satuan: item.satuan.trim(),
          harga_beli: hargaBeli,
          harga_jual: hargaJual,
          stok_minimum: bufferMin,
          stok_tersedia: totalQtyForProduct,
          no_batch: primaryNoBatch,
          tanggal_kadaluarsa: primaryTglExp,
          status: "aktif",
          tz: oPayload.tz || "UTC",
          created_by: username,
          created_at: formatDateSystem(),
          updated_by: username,
          updated_at: formatDateSystem(),
        };
        await trx("mst_produk").insert(oProduk);

        const createdBatchesForProduct = [];

        // 6.b Loop setiap batch dalam produk ini (Tingkat 2)
        for (let j = 0; j < item.batches.length; j++) {
          const batch = item.batches[j];
          const qtyBatch = parseInt(batch.qty, 10) || 1;
          const subtotalBatch = qtyBatch * hargaBeli;
          const tglExpBatch = String(batch.tanggal_kadaluarsa).slice(0, 10);
          const noBatchBatch = batch.no_batch.trim();

          // Generate kode_batch unik & Simpan ke mst_produk_batch
          currentBatchNum++;
          const kodeBatch = `BTC-${todayStr}-${String(currentBatchNum).padStart(4, "0")}`;

          const oBatch = {
            kode_batch: kodeBatch,
            kode_produk: kodeProduk,
            no_batch: noBatchBatch,
            tanggal_kadaluarsa: tglExpBatch,
            stok_masuk: qtyBatch,
            stok_sisa: qtyBatch,
            harga_beli_satuan: hargaBeli,
            kode_supplier: oPayload.kode_supplier,
            kode_po: kodePo,
            is_legacy_estimate: 0,
            status: "aktif",
            catatan: `Pengadaan produk baru (${kodePo}) - Batch ${j + 1}`,
            tz: oPayload.tz || "UTC",
            created_by: username,
            created_at: formatDateSystem(),
            updated_by: username,
            updated_at: formatDateSystem(),
            kode_cabang: branchCode,
          };
          await trx("mst_produk_batch").insert(oBatch);

          // Simpan detail purchase order (DPO-YYYYMMDD-XXX-1, -2, ...)
          globalDetailPoIndex++;
          const kodeDetailPo = `DPO-${todayStr}-${String(nextPoNum).padStart(3, "0")}-${globalDetailPoIndex}`;
          const oDetailPo = {
            kode_detail_po: kodeDetailPo,
            kode_po: kodePo,
            kode_produk: kodeProduk,
            kode_batch: kodeBatch,
            no_batch: noBatchBatch,
            tanggal_kadaluarsa: tglExpBatch,
            qty: qtyBatch,
            harga_satuan: hargaBeli,
            subtotal: subtotalBatch,
            tz: oPayload.tz || "UTC",
            created_by: username,
            created_at: formatDateSystem(),
            updated_by: username,
            updated_at: formatDateSystem(),
          };
          await trx("trx_detail_purchase_order").insert(oDetailPo);

          // Simpan log mutasi stok masuk (trx_stok_movement)
          currentMovNum++;
          const kodeMovement = `MOV-${todayStr}-${String(currentMovNum).padStart(4, "0")}`;

          const oMovement = {
            kode_cabang: branchCode,
            kode_stok_movement: kodeMovement,
            kode_produk: kodeProduk,
            kode_batch: kodeBatch,
            jenis_movement: "masuk",
            referensi: kodePo,
            qty: qtyBatch,
            stok_sebelum: 0,
            stok_sesudah: qtyBatch,
            tanggal: formatDateSystem(),
            tz: oPayload.tz || "UTC",
            created_by: username,
            created_at: formatDateSystem(),
            updated_by: username,
            updated_at: formatDateSystem(),
          };
          await trx("trx_stok_movement").insert(oMovement);

          createdBatchesForProduct.push({
            kode_batch: kodeBatch,
            no_batch: noBatchBatch,
            qty: qtyBatch,
            subtotal: subtotalBatch,
            tanggal_kadaluarsa: tglExpBatch,
          });
        }

        // 6.c Sinkronisasi status & data master FEFO (sekali per produk setelah semua batch masuk)
        await syncProdukBatch(kodeProduk, trx);

        // 6.d Catat ChangesLog per produk
        await ChangesLog(
          {
            description: `Pengadaan Produk Baru ${kodeProduk} (${item.nama_produk_baru}) dari Supplier ${oPayload.kode_supplier} (${kodePo} - Total: ${totalQtyForProduct} ${item.satuan}, ${item.batches.length} Batch)`,
            tableName: "mst_produk",
            referenceCode: kodeProduk,
            action: "CREATE",
            dataBefore: null,
            dataAfter: { ...oProduk, batches: createdBatchesForProduct, po: oPo },
            user: username,
            tz: oPayload.tz || "UTC",
          },
          trx
        );

        processedProducts.push({
          kode_produk: kodeProduk,
          nama: item.nama_produk_baru,
          total_qty: totalQtyForProduct,
          harga_beli: hargaBeli,
          subtotal: totalQtyForProduct * hargaBeli,
          batches: createdBatchesForProduct,
        });
      }

      resultData = {
        kode_po: kodePo,
        total_items: processedProducts.length,
        total_batches: totalBatchesCount,
        total_qty: totalQty,
        total_nilai: totalPo,
        items: processedProducts,
      };
    });

    return res.status(200).json({
      status: status.SUKSES,
      message: `Pengadaan ${resultData.total_items} produk baru (${resultData.total_batches} batch) berhasil disimpan dengan nomor PO: ${resultData.kode_po}`,
      datetime: formatDateSystem(),
      data: resultData,
    });
  } catch (error) {
    if (error.statusCode === 404 || error.statusCode === 422) {
      return res.status(error.statusCode).json({ status: status.BAD_REQUEST, message: error.message, datetime: formatDateSystem() });
    }
    const oResult = { status: status.BAD_REQUEST, message: error.message || "Sistem sedang maintenance", datetime: formatDateSystem() };
    Logging(error, { file: "/master/inventori/inventori_beli_baru.js", func: "beli_baru", request: oPayload, response: oResult, user: username });
    return res.status(500).json(oResult);
  }
});

export default router;
