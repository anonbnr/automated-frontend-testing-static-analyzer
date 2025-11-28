import { RowDataPacket } from "mysql2";
import { ScenarioStep } from "./scenario-steps.js";


export type ScenarioEditedByEnum = 'analyzer' | 'llm' | 'user'
export type ScenarioStatusEnum = 'draft' | 'ready' | 'deprecated'

export type ExpectedResultMatchEnum = 'exact' | 'pattern' | 'contains'

export type ContextEnum = 'innerText' | 'class' | 'id' | 'attribute' | 'tag'

export interface ScenarioStepData {
    value: string;
    usersNote: string;
}



export interface ExpectedResult {
    target: {
        selector: string;
        context: ContextEnum
    };

    match: {
        kind: ExpectedResultMatchEnum;
        value: string
    }
}

export interface Scenario {

    userJourneyId: string;

    name: string;

    description?: string;

    editedBy: ScenarioEditedByEnum; // computed

    tags?: string[];

    status: ScenarioStatusEnum;

    stepsData: ScenarioStepData[];

    expectedResult?: ExpectedResult;

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

