import mysql from 'mysql2/promise'
import { env } from '../api/env.js';

const dbConfig = {
  host: env.db.config.HOST,
  port: env.db.config.PORT,
  user: env.db.config.USER,
   password: env.db.config.PASSWORD,
   database: env.db.config.DB,
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10, // max idle connections, the default value is the same as `connectionLimit`
  idleTimeout: 60000, // idle connections timeout, in milliseconds, the default value 60000
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};

 const dbPool = mysql.createPool(dbConfig);

export default dbPool;