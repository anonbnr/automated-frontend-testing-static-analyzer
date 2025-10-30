
import { Request, Response, Router } from "express";
import { performance } from "node:perf_hooks";
import { FanoutMode } from "../../builders/user-journeys/user-journey-processors.js";
import logger from "../../logging/logger.js";
import { ExtractOptions, UserJourneyExtractor } from "../../orchestrators/user-journey-extractor.js";
import { resolveTsConfig } from "../utils.js";
import { UserJourneyRegistry } from "../../models/user-journeys/user-journey-info.js";

const router = Router();

/**
 * Create one scenario based on the infered stage-actions
 */
router.post("/", async (req: Request, res: Response) => {});

/**
 * Get all scenarios of the analyze by default
 * if journeyId provided only return scenarios for this journey
 * 
 */
router.get("/", async (req: Request, res: Response) => {});

/**
 * Get a scenario for in a journey
 */
router.get("/:scenarioId", async (req: Request, res: Response) => {});

/**
 * Return a scenario with his stage-actions completed by a llm
 */
router.get("/:scenarioId/llm-completion", async (req: Request, res: Response) => {});

/**
 * Return a scenario with his stage-actions completed by a llm
 */
router.get("/:scenarioId/llm-completion", async (req: Request, res: Response) => {});


export default router;