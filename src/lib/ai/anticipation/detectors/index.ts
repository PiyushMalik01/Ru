// Detector registry. Each detector is a self-contained module that exports
// a Detector. The orchestrator runs them all in parallel; failures in one
// don't take down the others.

import type { Detector } from "../types";
import { routineAdherenceDetector } from "./routine-adherence";
import { taskUrgencyDetector } from "./task-urgency";
import { routineCandidatesDetector } from "./routine-candidates";
import { promiseFollowupDetector } from "./promise-followup";

export const detectors: Detector[] = [
  routineAdherenceDetector,
  taskUrgencyDetector,
  routineCandidatesDetector,
  promiseFollowupDetector,
];
