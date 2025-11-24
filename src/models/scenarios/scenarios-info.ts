import { RowDataPacket } from "mysql2";
import { ScenarioStep } from "./scenario-steps.js";


export type ScenarioEditedByEnum = 'analyzer' | 'llm' | 'user'
export type ScenarioStatusEnum = 'draft' | 'ready' | 'deprecated'

export interface ScenarioStepData {
    value: string;
    usersNote: string;
}

export interface Scenario {

    userJourneyId: string;

    name: string;

    description?: string;

    editedBy: ScenarioEditedByEnum; // computed

    tags?: string[];

    status: ScenarioStatusEnum;

    stepsData: ScenarioStepData[];

    // !! NEEDS MORE DETAILS !! \\
    coverage?: string;
    
    id?: number;
}

export interface RowScenario extends RowDataPacket {

    userJourneyId: string

    name: string;

    description?: string;

    editedBy: ScenarioEditedByEnum;

    startRoutePath: string;

    startComponentSelector: string;

    tags?: string;

    status: ScenarioStatusEnum;

    stepsData: string;

    // !! NEEDS MORE DETAILS !! \\
    coverage?: string;

    id?: number;
}

