import { Router, type IRouter } from "express";
import { db, coverageTable, testCasesTable, defectsTable } from "@workspace/db";
import { requireLogin as requireAuth } from "../../lib/auth";
import { eq, and, sql, count } from "drizzle-orm";

const router: IRouter = Router();


function parseIntParam(val: unknown): number | null {
  if (val == null || val === "") return null;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}

router.get("/coverage", requireAuth, async (req, res): Promise<void> => {
  const projectId = parseIntParam(req.query.projectId);
  const sprint = req.query.sprint as string | undefined;

  const covConditions = [];
  if (projectId) covConditions.push(eq(coverageTable.projectId, projectId));
  if (sprint) covConditions.push(eq(coverageTable.sprint, sprint));

  const covRows = await db.select().from(coverageTable)
    .where(covConditions.length ? and(...covConditions) : undefined)
    .orderBy(coverageTable.module);

  // If no coverage data, derive from test cases
  if (covRows.length === 0) {
    const tcConditions = [];
    if (projectId) tcConditions.push(eq(testCasesTable.projectId, projectId));
    if (sprint) tcConditions.push(eq(testCasesTable.sprint, sprint));

    const tcByModule = await db.select({
      module: testCasesTable.module,
      total: count(),
      passed: sql<number>`SUM(CASE WHEN LOWER(${testCasesTable.status}) IN ('passed','pass') THEN 1 ELSE 0 END)`,
    })
      .from(testCasesTable)
      .where(tcConditions.length ? and(...tcConditions) : undefined)
      .groupBy(testCasesTable.module)
      .orderBy(sql`count(*) DESC`);

    const defConditions = [];
    if (projectId) defConditions.push(eq(defectsTable.projectId, projectId));
    if (sprint) defConditions.push(eq(defectsTable.sprint, sprint));

    const defByModule = await db.select({
      module: defectsTable.module,
      cnt: count(),
    }).from(defectsTable).where(defConditions.length ? and(...defConditions) : undefined)
      .groupBy(defectsTable.module);

    const defMap = new Map(defByModule.map(r => [r.module, Number(r.cnt)]));

    res.json(tcByModule.map(r => {
      const total = Number(r.total);
      const passed = Number(r.passed);
      return {
        module: r.module,
        totalRequirements: total,
        coveredRequirements: passed,
        coveragePercent: total > 0 ? Math.round((passed / total) * 10000) / 100 : 0,
        totalTests: total,
        passedTests: passed,
        defectCount: defMap.get(r.module) ?? 0,
      };
    }));
    return;
  }

  const tcByModule = await db.select({
    module: testCasesTable.module,
    total: count(),
    passed: sql<number>`SUM(CASE WHEN LOWER(${testCasesTable.status}) IN ('passed','pass') THEN 1 ELSE 0 END)`,
  })
    .from(testCasesTable)
    .where(projectId ? eq(testCasesTable.projectId, projectId) : undefined)
    .groupBy(testCasesTable.module);

  const defByModule = await db.select({
    module: defectsTable.module,
    cnt: count(),
  }).from(defectsTable).where(projectId ? eq(defectsTable.projectId, projectId) : undefined)
    .groupBy(defectsTable.module);

  const tcMap = new Map(tcByModule.map(r => [r.module, { total: Number(r.total), passed: Number(r.passed) }]));
  const defMap = new Map(defByModule.map(r => [r.module, Number(r.cnt)]));

  res.json(covRows.map(r => ({
    module: r.module,
    totalRequirements: r.totalRequirements,
    coveredRequirements: r.coveredRequirements,
    coveragePercent: r.coveragePercent,
    totalTests: tcMap.get(r.module)?.total ?? 0,
    passedTests: tcMap.get(r.module)?.passed ?? 0,
    defectCount: defMap.get(r.module) ?? 0,
  })));
});

export default router;
