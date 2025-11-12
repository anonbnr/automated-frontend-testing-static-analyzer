import { RowDataPacket } from "mysql2/promise"

export interface AnalysisProject extends RowDataPacket {
    id: string;
    name: string;
    projectRoot: string;
    description: string;
    url: string;
}

