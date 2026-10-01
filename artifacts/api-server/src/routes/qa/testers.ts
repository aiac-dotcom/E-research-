import { Router, type IRouter } from "express";
import { db, testCasesTable, defectsTable } from "@workspace/db";
import { requireLogin as requireAuth } from "../../lib/auth";
import { eq, and, sql, count } from "drizzle-orm";

const router: IRouter = Router();


function parseIntParam(val: unknown): number | null {
  if (val == null || val === "") return null;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}

router.get("/testers", requireAuth, async (req, res): Promise<void> => {
  const projectId = parseIntParam(req.query.projectId);
  const sprint = req.query.sprint as string | undefined;

  const tcConditions = [];
  if (projectId) tcConditions.push(eq(testCasesTable.projectId, projectId));
  if (sprint) tcConditions.push(eq(testCasesTable.sprint, sprint));

  const defConditions = [];
  if (projectId) defConditions.push(eq(defectsTable.projectId, projectId));
  if (sprint) defConditions.push(eq(defectsTable.sprint, sprint));

  const tcRows = await db.select({
    tester: testCasesTable.assignedTo,
    executed: count(),
    passed: sql<number>`SUM(CASE WHEN LOWER(${testCasesTable.status}) IN ('passed','pass') THEN 1 ELSE 0 END)`,
    failed: sql<number>`SUM(CASE WHEN LOWER(${testCasesTable.status}) IN ('failed','fail') THEN 1 ELSE 0 END)`,
  })
    .from(testCasesTable)
    .where(and(...tcConditions, sql`${testCasesTable.assignedTo} IS NOT NULL`))
    .groupBy(testCasesTable.assignedTo)
    .orderBy(sql`count(*) DESC`);

  const defRows = await db.select({
    tester: defectsTable.reportedBy,
    defectsFound: count(),
  })
    .from(defectsTable)
    .where(and(...defConditions, sql`${defectsTable.reportedBy} IS NOT NULL`))
    .groupBy(defectsTable.reportedBy);

  const defMap = new Map(defRows.map(r => [r.tester, Number(r.defectsFound)]));

  const result = tcRows.map(r => {
    const executed = Number(r.executed);
    const passed = Number(r.passed);
    const failed = Number(r.failed);
    const executed2 = passed + failed;
    const passRate = executed2 > 0 ? Math.round((passed / executed2) * 10000) / 100 : 0;
    const defectsFound = defMap.get(r.tester) ?? 0;
    const productivity = executed > 0 ? Math.round((defectsFound / executed) * 1000) / 100 : 0;
    return {
      testerName: r.tester ?? "Unknown",
      testsExecuted: executed,
      testsPassed: passed,
      testsFailed: failed,
      defectsFound,
      passRate,
      productivity,
    };
  });

  // If no data, provide sample
  if (result.length === 0) {
    res.json([
      { testerName: "Upload data to see team performance", testsExecuted: 0, testsPassed: 0, testsFailed: 0, defectsFound: 0, passRate: 0, productivity: 0 },
    ]);
    return;
  }

  res.json(result);
});

export default router;
