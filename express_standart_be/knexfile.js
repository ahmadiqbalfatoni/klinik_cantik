/**
 * @copyright (c) 2026 PT Marstech Global (info@marstech.co.id)
 * @project Standard
 * @file page.tsx
 * @description File konfigurasi database untuk Knex.js
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


import 'dotenv/config';
import pg from 'pg';

const IS_ONSITE = process.env.APP_PREMISE === "ONSITE";
const TARGET_TZ = IS_ONSITE ? (process.env.APP_TZ || 'Asia/Jakarta') : 'UTC';
const MYSQL_TZ = IS_ONSITE ? 'local' : '+00:00';

const parseFn = (val) => val;
pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, parseFn);
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, parseFn);
pg.types.setTypeParser(pg.types.builtins.DATE, parseFn);

const parseDbUrl = (dbUrl) => {
  if (!dbUrl) return null;
  try {
    const parsed = new URL(dbUrl);
    const dbms = parsed.protocol.replace(':', '');
    return {
      dbms: dbms.includes('pg') ? 'pg' : 'mysql2',
      host: parsed.hostname,
      port: Number(parsed.port) || (dbms.includes('pg') ? 5432 : 3306),
      username: decodeURIComponent(parsed.username || ''),
      password: decodeURIComponent(parsed.password || ''),
      database: parsed.pathname.replace(/^\//, '') || '',
    };
  } catch {
    return null;
  }
};

const rawDbUrl = process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.MYSQL_PRIVATE_URL;
const parsedUrl = parseDbUrl(rawDbUrl);

const isRailwayOrProd = Boolean(
  process.env.RAILWAY_ENVIRONMENT ||
  process.env.RAILWAY_PROJECT_ID ||
  process.env.MYSQLHOST ||
  process.env.NODE_ENV === 'production'
);

const resolvedDbms = process.env.DB_DBMS || parsedUrl?.dbms || "mysql2";

let resolvedHost = parsedUrl?.host || process.env.MYSQLHOST || process.env.MYSQL_HOST;
if (!resolvedHost) {
  if (isRailwayOrProd && (!process.env.DB_HOST || process.env.DB_HOST === '127.0.0.1' || process.env.DB_HOST === 'localhost')) {
    resolvedHost = 'mysql.railway.internal';
  } else {
    resolvedHost = process.env.DB_HOST || 'localhost';
  }
}

const resolvedPort = parsedUrl?.port || Number(process.env.MYSQLPORT || process.env.MYSQL_PORT || process.env.DB_PORT) || (resolvedDbms.includes('pg') ? 5432 : 3306);
const resolvedUser = parsedUrl?.username || process.env.MYSQLUSER || process.env.MYSQL_USER || process.env.DB_USERNAME || process.env.DB_USER || "root";
const resolvedPassword = parsedUrl?.password || process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || process.env.MYSQL_ROOT_PASSWORD || process.env.DB_PASSWORD || "";

let resolvedDatabase = parsedUrl?.database || process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE;
if (!resolvedDatabase) {
  resolvedDatabase = isRailwayOrProd ? (process.env.DB_DATABASE || 'railway') : (process.env.DB_DATABASE || process.env.DB_NAME || 'db_klinik_kecantikan');
}

const connectionConfig = {
  host: resolvedHost,
  port: resolvedPort,
  user: resolvedUser,
  password: resolvedPassword,
  database: resolvedDatabase,
  timezone: MYSQL_TZ,
  dateStrings: false,
  multipleStatements: true,
  ...(resolvedDbms.includes('pg')
    ? { ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false }
    : (process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {}))
};

const knexConfig = {
  default: {
    client: resolvedDbms,
    connection: connectionConfig,
    pool: {
      min: 2,
      max: resolvedDbms === "pg" ? 10 : 20,
      idleTimeoutMillis: 30000,

      afterCreate: function (conn, done) {
        if (resolvedDbms === "pg" || resolvedDbms === "postgresql") {
          conn.query(`SET TIME ZONE '${TARGET_TZ}';`, function (err) {
            done(err, conn);
          });
        } else {
          done(null, conn);
        }
      }
    }
  },
};

const configuration = {
  development: knexConfig.default,
  production: knexConfig.default,
  test: knexConfig.default,
};

export default configuration;