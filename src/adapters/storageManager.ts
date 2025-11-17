import { PoolConnection } from "mysql2/promise";
import dbPool from "../db/connection.js";

export class StorageSession{


    constructor(
        private _dbConnection: PoolConnection
    ) { }

    async beginTransaction() {
        return this._dbConnection.beginTransaction();
    }

    async commit() {
        return this._dbConnection.commit();
    }

    async rollback() {
        return this._dbConnection.rollback();
    }

    ends() {
        return this._dbConnection.release();
    }

    getConnector() {
        return this._dbConnection;
    }
}

export async function getSession() {
    const dbConnection = await dbPool.getConnection();
    
    const session = new StorageSession(dbConnection);
    return session;
}
