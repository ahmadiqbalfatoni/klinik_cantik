import express from "express";
import DB from "../../../../core/config/knex.js";
import { datetime, formatDateSystem } from "../../components/tools/date_tools.js";
import { Logging, validatePayload } from "../../components/tools/servertool.js";
import Joi from "joi";
import { status } from "../../components/tools/general.js";

export const MASTER_FULL_MENU = [
    {
        label: "HOME",
        icon: "pi pi-fw pi-home",
        items: [
            { label: "Dashboard", icon: "pi pi-fw pi-home", to: "/dashboard" },
            { label: "Dashboard Ruangan", icon: "pi pi-fw pi-home", to: "/pendaftaran-antrean/antrean" },
            { label: "Dashboard Jadwal", icon: "pi pi-fw pi-calendar", to: "/dashboard/jadwal-ruangan" }
        ]
    },
    {
        label: "MASTER DATA",
        icon: "pi pi-fw pi-database",
        items: [
            { label: "Kategori Layanan", icon: "pi pi-fw pi-tags", to: "/master-data/kategori-layanan" },
            { label: "Data Layanan", icon: "pi pi-fw pi-briefcase", to: "/master-data/layanan" },
            { label: "Paket Layanan", icon: "pi pi-fw pi-box", to: "/master-data/paket-layanan" },
            { label: "Kategori Produk", icon: "pi pi-fw pi-tags", to: "/master-data/kategori-produk" },
            { label: "Data Produk", icon: "pi pi-fw pi-box", to: "/master-data/produk" },
            { label: "Paket Produk", icon: "pi pi-fw pi-inbox", to: "/master-data/paket-produk" },
            { label: "Inventori", icon: "pi pi-fw pi-box", to: "/master-data/inventori" },
            { label: "Supplier", icon: "pi pi-fw pi-truck", to: "/master-data/supplier" },
            { label: "Karyawan", icon: "pi pi-fw pi-users", to: "/master-data/karyawan" },
            { label: "Jadwal Karyawan", icon: "pi pi-fw pi-calendar-times", to: "/master-data/jadwal-karyawan" },
            { label: "Alat & Peralatan", icon: "pi pi-fw pi-wrench", to: "/master-data/alat" },
            { label: "Data Ruangan", icon: "pi pi-fw pi-building", to: "/master-data/ruangan" },
            { label: "Data Promo", icon: "pi pi-fw pi-percentage", to: "/master-data/promo" },
            { label: "Detail Promo", icon: "pi pi-fw pi-tags", to: "/master-data/detail-promo" }
        ]
    },
    {
        label: "Pendaftaran & Antrean",
        icon: "pi pi-fw pi-calendar",
        items: [
            { label: "Antrean Pendaftaran", icon: "pi pi-fw pi-ticket", to: "/antrian-awal" },
            { label: "Pasien Baru", icon: "pi pi-fw pi-user-plus", to: "/pendaftaran-antrean/registrasi-pasien" },
            { label: "Pendaftaran Kunjungan", icon: "pi pi-fw pi-calendar", to: "/pendaftaran-antrean/pendaftaran-pasien" },
            { label: "Data Pasien", icon: "pi pi-fw pi-user", to: "/master-data-user/data-pasien" }
        ]
    },
    {
        label: "LAYANAN",
        icon: "pi pi-fw pi-sparkles",
        items: [
            { label: "Tindakan", icon: "pi pi-fw pi-sparkles", to: "/pendaftaran-antrean/antrean?type=layanan" },
            { label: "Konsultasi", icon: "pi pi-fw pi-comments", to: "/pendaftaran-antrean/antrean?type=konsul" },
            { label: "Jadwal Karyawan", icon: "pi pi-fw pi-calendar", to: "/pendaftaran-antrean/jadwal-karyawan" }
        ]
    },
    {
        label: "KASIR",
        icon: "pi pi-fw pi-calculator",
        items: [
            { label: "Kasir", icon: "pi pi-fw pi-calculator", to: "/kasir" }
        ]
    },
    {
        label: "LAPORAN",
        icon: "pi pi-fw pi-chart-bar",
        items: [
            { label: "Laporan & Rekam Medis", icon: "pi pi-fw pi-file", to: "/riwayat/rekam-medis" }
        ]
    },
    {
        label: "PENGATURAN KLINIK",
        icon: "pi pi-fw pi-cog",
        items: [
            { label: "Monitoring Cabang", icon: "pi pi-fw pi-chart-line", to: "/setup/monitoring-cabang" },
            { label: "Manajemen Cabang", icon: "pi pi-fw pi-building", to: "/setup/cabang" },
            { label: "Pengaturan Klinik", icon: "pi pi-fw pi-sliders-h", to: "/setup/config" },
            { label: "Manajemen User", icon: "pi pi-fw pi-users", to: "/setup/users" },
            { label: "Manajemen Role", icon: "pi pi-fw pi-shield", to: "/setup/navigation" }
        ]
    }
];

const router = express.Router();

router.post("/", async (req, res) => {
    const { body } = req;
    const oPayload = body;
    const username = req?.auth?.username || "";

    try {

        if (!oPayload || Object.keys(oPayload).length < 1) {
            return res.status(400).json({
                status: status.BAD_REQUEST,
                message: "Invalid request body",
                datetime: formatDateSystem(),
            });
        }

        const cValidation = await validatePayload(
            {
                role: Joi.string().required().label("Role"),
            },
            {
                "string.base": "{#label} harus berupa string",
                "string.empty": "{#label} tidak boleh kosong",
                "any.required": "{#label} wajib diisi",
            },
            oPayload, {
        });


        if (cValidation) {
            const oResult = {
                status: status.BAD_REQUEST,
                message: cValidation || "Terdapat kesalahan pada data anda",
                datetime: formatDateSystem(),
            };

            Logging(null, {
                file: "mst_navigation_data.js",
                func: "get",
                request: oPayload,
                response: oResult,
                user: username,
            });

            return res.status(422).json(oResult);
        }


        const role = String(oPayload?.role || 'master').toLowerCase();

        let masterRecord = await DB("mst_navigation").where('role', 'master').first();
        let masterMenu = [];
        try {
            masterMenu = masterRecord?.menu ? JSON.parse(masterRecord.menu) : [];
        } catch (_) {
            masterMenu = [];
        }

        // Jika master menu di DB belum lengkap (< 5 kategori / < 15 modul), sinkronkan ke MASTER_FULL_MENU
        const countMasterItems = (masterMenu || []).reduce((acc, g) => acc + (g.items || []).length, 0);
        if (!masterRecord || masterMenu.length < 5 || countMasterItems < 15) {
            masterMenu = MASTER_FULL_MENU;
            const menuStr = JSON.stringify(MASTER_FULL_MENU);
            if (masterRecord) {
                await DB("mst_navigation").where('id', masterRecord.id).update({
                    menu: menuStr,
                    updated_at: formatDateSystem()
                });
            } else {
                await DB("mst_navigation").insert({
                    role: 'master',
                    menu: menuStr,
                    tz: 'Asia/Jakarta',
                    created_at: formatDateSystem(),
                    updated_at: formatDateSystem()
                });
            }
        }

        const roleRecord = role !== 'master' ? await DB("mst_navigation").where('role', role).first() : null;
        let roleMenu = masterMenu;
        if (roleRecord?.menu) {
            try {
                roleMenu = JSON.parse(roleRecord.menu);
            } catch (_) {
                roleMenu = masterMenu;
            }
        }

        const allRoleRecords = await DB("mst_navigation").select("role", "menu");

        return res.status(200).json({
            status: status.SUKSES,
            message: "Data ditemukan",
            datetime: formatDateSystem(),
            data: roleMenu,
            master_menu: masterMenu,
            all_role_menus: allRoleRecords,
            is_custom: Boolean(roleRecord)
        });
    } catch (error) {
        const oResult = {
            status: status.BAD_REQUEST,
            message: "Sistem sedang maintenance harap tunggu sebentar",
            datetime: formatDateSystem(),
        };

        Logging(error, {
            file: "mst_navigation_data.js",
            func: "get",
            request: oPayload,
            response: oResult,
            user: username,
        });

        return res.status(500).json(oResult);
    }
});

export default router;
