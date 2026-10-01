import { Router, type IRouter } from "express";
import healthRouter from "./health";
import uploadRouter from "./qa/upload";
import dashboardRouter from "./qa/dashboard";
import testcasesRouter from "./qa/testcases";
import defectsRouter from "./qa/defects";
import testersRouter from "./qa/testers";
import coverageRouter from "./qa/coverage";
import activityRouter from "./qa/activity";
import rankingRouter from "./ranking/index.js";
import researchAdminRouter from "./research/admin";
import researchWorkflowRouter from "./research/workflow";
import researchRepositoryRouter from "./research/repository";
import oaiRouter from "./research/oai";
import { requireService } from "../lib/services";

const router: IRouter = Router();

router.use(healthRouter);

// Research information management (CRIS) services
router.use(researchAdminRouter);
router.use(researchWorkflowRouter);
router.use(researchRepositoryRouter);
router.use(oaiRouter);

// QS ranking dashboard service
router.use("/ranking", requireService("ranking"));
router.use(rankingRouter);

// Legacy QA dashboard service (disabled by default)
const qa = Router();
qa.use(uploadRouter, dashboardRouter, testcasesRouter, defectsRouter, testersRouter, coverageRouter, activityRouter);
router.use(["/upload", "/dashboard", "/testcases", "/defects", "/testers", "/coverage", "/activity"], requireService("qa"));
router.use(qa);

export default router;
