import { RowDataPacket } from "mysql2";

export interface Workflow {

    name: string;
    description?: string;

    id?: number;
}

export interface RowWorkflow extends RowDataPacket {

    name: string;
    description?: string;

    id?: number;
}

