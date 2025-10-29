import { StageAction } from "./stage-action.js";

export interface Scenario {

    id: string;

    navigationGraphId: string;

    userJourneyId: string;

    stageActions: StageAction[];

    success: boolean;
}