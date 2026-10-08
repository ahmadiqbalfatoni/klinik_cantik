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
    // Normalisasi items jika dikirim dalam bentuk single-item legacy
    if (!Array.isArray(oPayload.items)) {
      if (oPayload.kode_produk) {
        // Legacy single-item restock
        oPayload.items = [
          {
            tipe_item: "existing",
            kode_produk: oPayload.kode_produk,
            update_harga_beli_master: oPayload.update_harga_beli_master ?? true,
            harga_beli: oPayload.harga_beli,
            batches: [
              {
                qty: oPayload.qty_masuk || oPayload.qty || 1,
                no_batch: oPayload.no_batch,
                tanggal_kadaluarsa: oPayload.tanggal_kadaluarsa,
                harga_beli: oPayload.harga_beli,
              },
            ],
          },
        ];
      } else if (oPayload.nama_produk_baru || oPayload.nama) {
        // Legacy single-item beli baru
        oPayload.items = [
          {
            tipe_item: "baru",
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
      }
    } else if (Array.isArray(oPayload.items)) {
      // Normalisasi nested batches di setiap produk
      oPayload.items = oPayload.items.map((item) => {
        let batches = [];
        if (Array.isArray(item.batches) && item.batches.length > 0) {
          batches = item.batches.map((b) => ({
            qty: parseInt(b.qty, 10) || 1,
            no_batch: b.no_batch ? String(b.no_batch).trim() : "",
            tanggal_kadaluarsa: b.tanggal_kadaluarsa,
            harga_beli: b.harga_beli !== undefined ? parseFloat(b.harga_beli) : undefined,
          }));
        } else if (item.no_batch || item.qty || item.qty_beli || item.qty_masuk) {
          batches = [
            {
              qty: parseInt(item.qty || item.qty_beli || item.qty_masuk, 10) || 1,
              no_batch: item.no_batch ? String(item.no_batch).trim() : "",
              tanggal_kadaluarsa: item.tanggal_kadaluarsa,
              harga_beli: item.harga_beli !== undefined ? parseFloat(item.harga_beli) : undefined,
            },
          ];
        }

        return {
          tipe_item: item.tipe_item || (item.kode_produk ? "existing" : "baru"),
          kode_produk: item.kode_produk,
          update_harga_beli_master: item.update_harga_beli_master ?? true,
          kode_kategori_produk: item.kode_kategori_produk,
          satuan: item.satuan,
          nama_produk_baru: item.nama_produk_baru || item.nama,
          harga_beli: item.harga_beli !== undefined ? parseFloat(item.harga_beli) : undefined,
          harga_jual: item.harga_jual !== undefined ? parseFloat(item.harga_jual) : undefined,
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
              tipe_item: Joi.string().valid("existing", "baru").required().label("Tipe Item"),
              // Validasi tipe = existing
              kode_produk: Joi.string().when("tipe_item", {
                is: "existing",
                then: Joi.required().label("Kode Produk"),
                otherwise: Joi.optional().allow("", null),
              }),
              update_harga_beli_master: Joi.boolean().optional().default(true).label("Perbarui Harga Master"),
              // Validasi tipe = baru
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
              nama_produk_baru: Joi.string().max(100).when("tipe_item", {
                is: "baru",
                then: Joi.required().label("Nama Produk Baru"),
                otherwise: Joi.optional().allow("", null),
              }),
              harga_beli: Joi.number().min(0).when("tipe_item", {
                is: "baru",
                then: Joi.required().label("Harga Beli Satuan"),
                otherwise: Joi.optional().allow(null),
              }),
              harga_jual: Joi.number().min(0).when("tipe_item", {
                is: "baru",
                then: Joi.required().label("Harga Jual Satuan"),
                otherwise: Joi.optional().allow(null),
              }),
              buffer_min: Joi.number().integer().min(0).optional().default(5).label("Batas Buffer Min"),
              // Validasi batches (umum untuk kedua tipe)
              batches: Joi.array()
                .min(1)
                .items(
                  Joi.object({
                    qty: Joi.number().integer().min(1).required().label("Jumlah Beli (Qty)"),
                    no_batch: Joi.string().max(50).required().label("No. Batch"),
                    tanggal_kadaluarsa: Joi.string().required().label("Tanggal Kadaluarsa"),
                    harga_beli: Joi.number().min(0).optional().label("Harga Beli Satuan Batch"),
                  })
                )
                .required()
                .label("Daftar Batch"),
            })
          )
          .required()
          .label("Daftar Item Produk"),
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

      // 2. Fetch cache produk existing untuk validasi dan penentuan harga
      const existingProductCodes = oPayload.items.filter((it) => it.tipe_item === "existing").map((it) => it.kode_produk);
      const existingProductsMap = {};
      if (existingProductCodes.length > 0) {
        const prdRows = await trx("mst_produk").whereIn("kode_produk", existingProductCodes);
        for (const p of prdRows) {
          existingProductsMap[p.kode_produk] = p;
        }
      }

      // 3. Hitung Grand Total PO & Total Qty Akumulasi Seluruh Item & Batch
      let totalPo = 0;
      let totalQty = 0;
      let totalBatchesCount = 0;
      let existingProductsCount = 0;
      let newProductsCount = 0;

      for (let i = 0; i < oPayload.items.length; i++) {
        const item = oPayload.items[i];
        const itemIndex = i + 1;

        if (item.tipe_item === "existing") {
          const prd = existingProductsMap[item.kode_produk];
          if (!prd) {
            const err = new Error(`Item #${itemIndex}: Produk dengan kode "${item.kode_produk}" tidak ditemukan di database!`);
            err.statusCode = 404;
            throw err;
          }
          existingProductsCount++;
          const defaultHarga = item.harga_beli !== undefined ? parseFloat(item.harga_beli) : parseFloat(prd.harga_beli) || 0;
          for (const batch of item.batches) {
            const qty = parseInt(batch.qty, 10) || 1;
            const hrg = batch.harga_beli !== undefined ? parseFloat(batch.harga_beli) : defaultHarga;
            totalPo += qty * hrg;
            totalQty += qty;
            totalBatchesCount++;
          }
        } else {
          // Produk Baru
          newProductsCount++;
          const hargaBeli = parseFloat(item.harga_beli) || 0;
          for (const batch of item.batches) {
            const qty = parseInt(batch.qty, 10) || 1;
            const hrg = batch.harga_beli !== undefined ? parseFloat(batch.harga_beli) : hargaBeli;
            totalPo += qty * hrg;
            totalQty += qty;
            totalBatchesCount++;
          }
        }
      }

      // 4. Generate 1 kode_po unik (PO-YYYYMMDD-XXX)
      const existingPos = await trx("trx_purchase_order").where("kode_po", "like", `PO-${todayStr}-%`).select("kode_po");
      let maxPoNum = 0;
      for (const p of existingPos) {
        const parts = p.kode_po.split("-");
        const n = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(n) && n > maxPoNum) maxPoNum = n;
      }
      const nextPoNum = maxPoNum + 1;
      const kodePo = `PO-${todayStr}-${String(nextPoNum).padStart(3, "0")}`;

      // 5. Simpan 1 Header Induk PO
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

      // 6. Persiapkan generator nomor urut untuk produk baru, batch, dan movement
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

      // 7. Loop setiap produk (Tingkat 1)
      for (let i = 0; i < oPayload.items.length; i++) {
        const item = oPayload.items[i];
        const itemIndex = i + 1;
        let kodeProduk = "";
        let namaProduk = "";
        let hargaBeliFinal = 0;
        let runningStockProduct = 0;

        if (item.tipe_item === "baru") {
          // Cek duplikasi nama produk baru
          const existProd = await trx("mst_produk").where("nama", item.nama_produk_baru.trim()).first();
          if (existProd) {
            const err = new Error(`Item #${itemIndex}: Nama Produk Baru "${item.nama_produk_baru}" sudah terdaftar di sistem!`);
            err.statusCode = 422;
            throw err;
          }

          // Generate kode_produk baru
          currentPrdNum++;
          kodeProduk = `PRD-${String(currentPrdNum).padStart(3, "0")}`;
          namaProduk = item.nama_produk_baru.trim();
          hargaBeliFinal = parseFloat(item.harga_beli) || 0;
          const hargaJual = parseFloat(item.harga_jual) || 0;
          const bufferMin = parseInt(item.buffer_min ?? 5, 10);

          // Hitung total stok dari semua batch untuk produk ini
          const totalQtyForProduct = item.batches.reduce((sum, b) => sum + (parseInt(b.qty, 10) || 1), 0);

          // Ambil batch pertama terurut expired untuk primary field
          const sortedBatches = [...item.batches].sort((a, b) => {
            const dateA = new Date(a.tanggal_kadaluarsa).getTime();
            const dateB = new Date(b.tanggal_kadaluarsa).getTime();
            return dateA - dateB;
          });
          const primaryBatch = sortedBatches[0];
          const primaryNoBatch = primaryBatch ? primaryBatch.no_batch.trim() : "";
          const primaryTglExp = primaryBatch ? String(primaryBatch.tanggal_kadaluarsa).slice(0, 10) : tglPo;

          // Simpan produk baru ke mst_produk
          const oProduk = {
            kode_cabang: branchCode,
            kode_produk: kodeProduk,
            kode_kategori_produk: item.kode_kategori_produk,
            kode_supplier: oPayload.kode_supplier,
            nama: namaProduk,
            satuan: item.satuan.trim(),
            harga_beli: hargaBeliFinal,
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
          runningStockProduct = 0;
        } else {
          // Produk Existing
          const prd = existingProductsMap[item.kode_produk];
          kodeProduk = prd.kode_produk;
          namaProduk = prd.nama;
          hargaBeliFinal = item.harga_beli !== undefined ? parseFloat(item.harga_beli) : parseFloat(prd.harga_beli) || 0;
          runningStockProduct = parseInt(prd.stok_tersedia, 10) || 0;

          // Update harga beli master jika diminta
          if (item.update_harga_beli_master && item.harga_beli !== undefined) {
            await trx("mst_produk")
              .where("kode_produk", kodeProduk)
              .update({
                harga_beli: hargaBeliFinal,
                updated_by: username,
                updated_at: formatDateSystem(),
              });
          }
        }

        const createdBatchesForProduct = [];

        // 8. Loop setiap batch dalam produk ini (Tingkat 2)
        for (let j = 0; j < item.batches.length; j++) {
          const batch = item.batches[j];
          const qtyBatch = parseInt(batch.qty, 10) || 1;
          const hargaBeliBatch = batch.harga_beli !== undefined ? parseFloat(batch.harga_beli) : hargaBeliFinal;
          const subtotalBatch = qtyBatch * hargaBeliBatch;
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
            harga_beli_satuan: hargaBeliBatch,
            kode_supplier: oPayload.kode_supplier,
            kode_po: kodePo,
            is_legacy_estimate: 0,
            status: "aktif",
            catatan: `Pengadaan ${item.tipe_item === "baru" ? "produk baru" : "restock"} (${kodePo}) - Batch ${j + 1}`,
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
            harga_satuan: hargaBeliBatch,
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
          const stokSebelum = runningStockProduct;
          const stokSesudah = stokSebelum + qtyBatch;
          runningStockProduct = stokSesudah;

          const oMovement = {
            kode_cabang: branchCode,
            kode_stok_movement: kodeMovement,
            kode_produk: kodeProduk,
            kode_batch: kodeBatch,
            jenis_movement: "masuk",
            referensi: kodePo,
            qty: qtyBatch,
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

          createdBatchesForProduct.push({
            kode_batch: kodeBatch,
            no_batch: noBatchBatch,
            qty: qtyBatch,
            harga_beli: hargaBeliBatch,
            subtotal: subtotalBatch,
            tanggal_kadaluarsa: tglExpBatch,
          });
        }

        // 9. Sinkronisasi master FEFO (sekali per produk setelah semua batch selesai diproses)
        await syncProdukBatch(kodeProduk, trx);

        // 10. Catat ChangesLog
        const totalQtyForThisProduct = createdBatchesForProduct.reduce((sum, b) => sum + b.qty, 0);
        const subtotalForThisProduct = createdBatchesForProduct.reduce((sum, b) => sum + b.subtotal, 0);

        await ChangesLog(
          {
            description: `Pengadaan ${item.tipe_item === "baru" ? "Produk Baru" : "Restock"} ${kodeProduk} (${namaProduk}) dari Supplier ${oPayload.kode_supplier} (${kodePo} - Total: ${totalQtyForThisProduct} unit, ${item.batches.length} Batch)`,
            tableName: "mst_produk",
            referenceCode: kodeProduk,
            action: item.tipe_item === "baru" ? "CREATE" : "UPDATE",
            dataBefore: item.tipe_item === "existing" ? existingProductsMap[kodeProduk] : null,
            dataAfter: { kode_produk: kodeProduk, nama: namaProduk, batches: createdBatchesForProduct, po: oPo },
            user: username,
            tz: oPayload.tz || "UTC",
          },
          trx
        );

        processedProducts.push({
          tipe_item: item.tipe_item,
          kode_produk: kodeProduk,
          nama: namaProduk,
          total_qty: totalQtyForThisProduct,
          harga_beli: hargaBeliFinal,
          subtotal: subtotalForThisProduct,
          batches: createdBatchesForProduct,
        });
      }

      resultData = {
        kode_po: kodePo,
        total_items: processedProducts.length,
        total_existing_items: existingProductsCount,
        total_new_items: newProductsCount,
        total_batches: totalBatchesCount,
        total_qty: totalQty,
        total_nilai: totalPo,
        items: processedProducts,
      };
    });

    return res.status(200).json({
      status: status.SUKSES,
      message: `Pengadaan ${resultData.total_items} produk (${resultData.total_existing_items} restock, ${resultData.total_new_items} baru - total ${resultData.total_batches} batch) berhasil disimpan dengan nomor PO: ${resultData.kode_po}`,
      datetime: formatDateSystem(),
      data: resultData,
    });
  } catch (error) {
    if (error.statusCode === 404 || error.statusCode === 422) {
      return res.status(error.statusCode).json({ status: status.BAD_REQUEST, message: error.message, datetime: formatDateSystem() });
    }
    const oResult = { status: status.BAD_REQUEST, message: error.message || "Sistem sedang maintenance", datetime: formatDateSystem() };
    Logging(error, { file: "/master/inventori/inventori_pengadaan.js", func: "pengadaan", request: oPayload, response: oResult, user: username });
    return res.status(500).json(oResult);
  }
});

export default router;
