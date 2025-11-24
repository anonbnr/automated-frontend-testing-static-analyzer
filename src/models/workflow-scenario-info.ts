import { RowDataPacket } from "mysql2";

export interface WorkflowScenario {

    workflowId: number;
    scenarioId: number;
    order?: number;

    insertedAt?: string;
    updatedAt?: string;
}

export interface RowWorkflowScenario extends RowDataPacket {

    workflowId: number;
    scenarioId: number;
    order: number;

    insertedAt?: string;
    updatedAt?: string;
}
