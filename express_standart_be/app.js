/**
 * @copyright (c) 2026 PT Marstech Global (info@marstech.co.id)
 * @project Standard
 * @file page.tsx
 * @description File untuk menggabungkan semua routing setup dan middleware
 * 
 * @author Fadil <risqullah.s.fadhilah@gmail.com>
 * @created 2026-07-14
 * 
 * @contributors
 * - Fadil <risqullah.s.fadhilah@gmail.com>
 * 
 * @lastModified Fadil (2026-08-03)
 * @version 1.0.1
 */


import cors from "cors";
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import APIV1 from "./routes/v1/index.js";

import { formatDateSystem } from "./routes/v1/components/tools/date_tools.js";
import { validateTimestamp } from "./middleware/validate_header.js";
import { useragentMiddleware } from "./middleware/allow_user_agent.js";
import secureHeader from "./middleware/secure_header.js";
import Logger from "./middleware/logger.js";

process.env.TZ = "Asia/Jakarta";
if (!process.env.APP_TZ || process.env.APP_TZ === "UTC") {
  process.env.APP_TZ = "Asia/Jakarta";
}

// Normalisasi ASSETS_PATH agar tidak pernah menggunakan localhost pada hosting online
if (!process.env.ASSETS_PATH || process.env.ASSETS_PATH.includes("localhost") || process.env.ASSETS_PATH.includes("127.0.0.1")) {
  process.env.ASSETS_PATH = "/api/assets";
}

const app = express();

const allowedOrigins = (process.env.ORIGIN || process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter((o) => Boolean(o) && !o.includes("<") && !o.includes(">"));

app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedOrigins.length === 0 ||
        allowedOrigins.includes("*") ||
        allowedOrigins.includes(origin) ||
        origin.includes("railway.app") ||
        origin.includes("localhost") ||
        origin.includes("127.0.0.1")
      ) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Timestamp",
      "X-Signature",
      "X-Credential",
      "X-Endpoint",
      "X-Custom-Header",
      "X-Level",
      "X-Kode-Cabang",
      "X-UniqueId",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    optionSuccessStatus: 200,
  })
);

// app.use(logger("dev"));
app.use(Logger);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

import { checkAndInitDatabase } from "./core/init_db.js";

// Healthcheck / Root endpoint
app.get("/", (req, res) => {
  return res.status(200).json({
    status: "success",
    message: "Klinik Kecantikan Backend API is running",
    datetime: formatDateSystem(),
  });
});

app.get("/health", (req, res) => {
  return res.status(200).send("OK");
});

app.get("/init-db", async (req, res) => {
  const force = req.query.force === "true";
  const result = await checkAndInitDatabase(force);
  return res.status(result.status === "error" ? 500 : 200).json(result);
});

app.get("/api/v1/init-db", async (req, res) => {
  const force = req.query.force === "true";
  const result = await checkAndInitDatabase(force);
  return res.status(result.status === "error" ? 500 : 200).json(result);
});

// useragentMiddleware,
// Middleware global untuk semua api
app.use(
  "/api/v1",
  [secureHeader, validateTimestamp],
  APIV1
);

const uploadsDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));
app.use('/api/assets/uploads', express.static(uploadsDir));
app.use('/api/assets', express.static(uploadsDir));

app.use((req, res, next) => {
  console.log(req.url)
  return res.status(404).json({
    status: "404",
    message: "Endpoint tidak ditemukan",
    datetime: formatDateSystem(),
  });
});




export default app;
