import { RowDataPacket } from "mysql2";
import { ScenarioStep } from "./scenarioSteps.js";


export type ScenarioEditedByEnum = 'analyzer' | 'llm' | 'user'
export type ScenarioStatusEnum = 'draft' | 'ready' | 'deprecated'

export interface Scenario {

    id: string;

    userJourneyId: string;

    name: string;

    description?: string;

    editedBy: ScenarioEditedByEnum;

    startRoutePath: string;

    startRouteComponentSelector: string;

    tags?: string[];

    status: ScenarioStatusEnum;

    steps: ScenarioStep[];

}

export interface RowScenario extends RowDataPacket {

    id: string;

    userJourneyId: string;

    name: string;

    description?: string;

    editedBy: ScenarioEditedByEnum;

    startRoutePath: string;

    startRouteComponentSelector: string;

    tags?: string;

    status: ScenarioStatusEnum;

    steps: string;

}

