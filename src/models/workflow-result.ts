import { RowDataPacket } from "mysql2";

export interface WorkflowResult {

    workflowId: number;
    scenarioId: number;
    success: boolean;
    message?: string;
    screenshot?: string;

    insertedAt?: string;
    updatedAt?: string;
}

export interface RowWorkflowResult extends RowDataPacket {

    workflowId: number;
    scenarioId: number;
    success: boolean;
    message: string;
    screenshot: string;

    insertedAt?: string;
    updatedAt?: string;
}
