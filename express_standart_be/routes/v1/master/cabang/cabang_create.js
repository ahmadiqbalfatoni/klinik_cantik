/**
 * @file cabang_create.js
 * @description Endpoint untuk menambah cabang baru dan akun manager cabang baru
 */
import express from "express";
import DB from "../../../../core/config/knex.js";
import { status } from "../../components/tools/general.js";
import { formatDateSystem } from "../../components/tools/date_tools.js";
import { Logging, validatePayload } from "../../components/tools/servertool.js";
import { hmac } from "../../components/tools/encrypt_tools.js";
import Joi from "joi";

const router = express.Router();

router.post("/", async (req, res) => {
  const oPayload = { ...req.body };
  const username = req?.auth?.username || "SUPERADMIN";

  try {
    const cValidation = await validatePayload(
      {
        nama_cabang: Joi.string().max(150).required().label("Nama Cabang"),
        alamat: Joi.string().allow("", null).label("Alamat"),
        no_telp: Joi.string().allow("", null).label("No Telepon"),
        email: Joi.string().email().allow("", null).label("Email"),
        pj_manager: Joi.string().allow("", null).label("Penanggung Jawab / Manager"),
        status: Joi.string().valid("aktif", "tidak aktif").default("aktif").label("Status"),

        // Data Akun Manager (jika dikirim)
        create_manager: Joi.boolean().optional(),
        manager_fullname: Joi.string().max(100).allow("", null).label("Nama Lengkap Manager"),
        manager_username: Joi.string().max(100).allow("", null).label("Username / Email Login Manager"),
        manager_telp: Joi.string().allow("", null).label("No Telepon / WhatsApp"),
        manager_password: Joi.string().min(6).allow("", null).label("Password Login"),
        manager_role: Joi.string().allow("", null).default("owner").label("Role Manager"),
        manager_status: Joi.string().allow("", null).default("1").label("Status Akun Manager"),
      },
      {
        "string.base": "{#label} harus berupa string",
        "string.empty": "{#label} tidak boleh kosong",
        "any.required": "{#label} wajib diisi",
        "string.min": "{#label} minimal {#limit} karakter",
      },
      oPayload,
      { allowUnknown: true }
    );

    if (cValidation) {
      return res.status(422).json({
        status: status.BAD_REQUEST,
        message: cValidation,
        datetime: formatDateSystem(),
      });
    }

    const hasManagerData = Boolean(
      oPayload.create_manager ||
      oPayload.manager_username ||
      oPayload.manager_password
    );

    if (hasManagerData) {
      if (!oPayload.manager_username || !oPayload.manager_username.trim()) {
        return res.status(422).json({
          status: status.BAD_REQUEST,
          message: "Username / Email login manager wajib diisi",
          datetime: formatDateSystem(),
        });
      }
      if (!oPayload.manager_password || oPayload.manager_password.length < 6) {
        return res.status(422).json({
          status: status.BAD_REQUEST,
          message: "Password login manager minimal 6 karakter",
          datetime: formatDateSystem(),
        });
      }
    }

    let createdResult = null;

    await DB.transaction(async (trx) => {
      // 1. Cek duplikasi username & telp manager jika akun manager dibuat
      if (hasManagerData) {
        const checkUsername = await trx("user_credential")
          .where("username", oPayload.manager_username.trim())
          .first();
        if (checkUsername) {
          throw new Error(`Username / Email "${oPayload.manager_username.trim()}" sudah digunakan oleh akun lain.`);
        }

        if (oPayload.manager_telp && oPayload.manager_telp.trim()) {
          const cleanTelp = oPayload.manager_telp.trim();
          const checkTelp = await trx("user_credential")
            .where("telp", cleanTelp)
            .first();
          if (checkTelp) {
            throw new Error(`No. Telepon / WhatsApp "${cleanTelp}" sudah digunakan oleh akun lain.`);
          }
        }
      }

      // 2. Generate kode_cabang otomatis: CBG-001, CBG-002, dst.
      const lastBranch = await trx("mst_cabang")
        .where("kode_cabang", "like", "CBG-%")
        .orderBy("id", "desc")
        .first();

      let nextNum = 1;
      if (lastBranch && lastBranch.kode_cabang) {
        const num = parseInt(lastBranch.kode_cabang.replace("CBG-", ""), 10);
        if (!isNaN(num)) nextNum = num + 1;
      }
      const kodeCabang = `CBG-${String(nextNum).padStart(3, "0")}`;

      const managerName = (
        oPayload.manager_fullname ||
        oPayload.pj_manager ||
        `Manager ${oPayload.nama_cabang.trim()}`
      ).trim();

      const newBranch = {
        kode_cabang: kodeCabang,
        nama_cabang: oPayload.nama_cabang.trim(),
        alamat: oPayload.alamat ? oPayload.alamat.trim() : "",
        no_telp: oPayload.no_telp ? oPayload.no_telp.trim() : "",
        email: oPayload.email ? oPayload.email.trim() : "",
        pj_manager: managerName,
        status: oPayload.status || "aktif",
        created_by: username,
        created_at: formatDateSystem(),
        updated_at: formatDateSystem(),
      };

      const [branchId] = await trx("mst_cabang").insert(newBranch);

      let createdUser = null;

      // 3. Buat akun manager jika ada data manager
      if (hasManagerData) {
        const lastUser = await trx("user_credential")
          .where("user_code", "like", "USR%")
          .orderBy("user_code", "desc")
          .first();
        let nextUserNum = 1;
        if (lastUser && lastUser.user_code) {
          const numPart = parseInt(lastUser.user_code.replace("USR", ""), 10);
          if (!isNaN(numPart)) nextUserNum = numPart + 1;
        }
        const userCode = `USR${String(nextUserNum).padStart(6, "0")}`;

        const secret = process.env.USER_SECRET || "random";
        const userKey = process.env.USER_KEY || "random";
        const cPassword = userKey + userCode + oPayload.manager_password;
        const hashedPassword = hmac(cPassword, secret, "sha512");

        let oNavigation = await trx("mst_navigation")
          .select("menu")
          .where("role", "owner")
          .first();

        if (!oNavigation || !oNavigation?.menu) {
          oNavigation = await trx("mst_navigation")
            .select("menu")
            .where("role", "master")
            .first();
        }

        const navMenu = oNavigation?.menu || "[]";

        await trx("user_navigation").insert({
          menu: navMenu,
          user_code: userCode,
          created_at: formatDateSystem(),
          updated_at: formatDateSystem(),
        });

        const newManagerRecord = {
          user_code: userCode,
          username: oPayload.manager_username.trim(),
          fullname: managerName,
          telp: (oPayload.manager_telp || oPayload.no_telp || "").trim(),
          role: oPayload.manager_role || "owner",
          password: hashedPassword,
          status: oPayload.manager_status !== undefined ? String(oPayload.manager_status) : "1",
          kode_cabang: kodeCabang,
          tz: "Asia/Jakarta",
          created_by: username,
          created_at: formatDateSystem(),
          updated_at: formatDateSystem(),
        };

        await trx("user_credential").insert(newManagerRecord);

        // Buat record di mst_karyawan jika memungkinkan
        try {
          const rowsKaryawan = await trx("mst_karyawan").select("kode_karyawan");
          let maxKry = 0;
          for (const r of rowsKaryawan) {
            if (r.kode_karyawan) {
              const num = parseInt(r.kode_karyawan.replace(/[^0-9]/g, ""), 10);
              if (!isNaN(num) && num > maxKry) maxKry = num;
            }
          }
          const kodeKaryawan = `KRY-${String(maxKry + 1).padStart(3, "0")}`;
          const noSip = `SIP-${kodeCabang}-MGR`;

          await trx("mst_karyawan").insert({
            kode_cabang: kodeCabang,
            kode_karyawan: kodeKaryawan,
            no_sip: noSip,
            kode_user: userCode,
            nama: managerName,
            jabatan: "owner",
            no_hp: newManagerRecord.telp || null,
            email: newManagerRecord.username || null,
            status: "aktif",
            tz: "Asia/Jakarta",
            created_by: username,
            created_at: formatDateSystem(),
            updated_by: username,
            updated_at: formatDateSystem(),
          });
        } catch (errKry) {
          console.warn("Auto-create karyawan notice:", errKry.message);
        }

        createdUser = {
          user_code: userCode,
          username: newManagerRecord.username,
          fullname: newManagerRecord.fullname,
          role: newManagerRecord.role,
          kode_cabang: kodeCabang,
        };
      }

      createdResult = {
        id: branchId,
        ...newBranch,
        manager_account: createdUser,
      };
    });

    const msg = createdResult?.manager_account
      ? `Cabang ${createdResult.nama_cabang} (${createdResult.kode_cabang}) dan akun manager (${createdResult.manager_account.username}) berhasil dibuat.`
      : `Cabang ${createdResult.nama_cabang} (${createdResult.kode_cabang}) berhasil ditambahkan.`;

    return res.status(200).json({
      status: status.SUKSES,
      message: msg,
      data: createdResult,
      datetime: formatDateSystem(),
    });
  } catch (error) {
    Logging(error, {
      file: "/master/cabang/cabang_create.js",
      func: "create",
      request: oPayload,
      user: username,
    });
    return res.status(400).json({
      status: status.GAGAL,
      message: error.message || "Gagal menambahkan cabang baru",
      datetime: formatDateSystem(),
    });
  }
});

export default router;
