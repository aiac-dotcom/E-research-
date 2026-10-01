import { Router, type IRouter } from "express";
import { db, testCasesTable, projectsTable } from "@workspace/db";
import { requireLogin as requireAuth } from "../../lib/auth";
import { eq, and, sql, count, ilike } from "drizzle-orm";

const router: IRouter = Router();


function parseIntParam(val: unknown): number | null {
  if (val == null || val === "") return null;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}

router.get("/testcases", requireAuth, async (req, res): Promise<void> => {
  const projectId = parseIntParam(req.query.projectId);
  const sprint = req.query.sprint as string | undefined;
  const status = req.query.status as string | undefined;
  const module = req.query.module as string | undefined;
  const assignedTo = req.query.assignedTo as string | undefined;
  const page = Math.max(1, parseIntParam(req.query.page) ?? 1);
  const limit = Math.min(200, Math.max(1, parseIntParam(req.query.limit) ?? 50));

  const conditions = [];
  if (projectId) conditions.push(eq(testCasesTable.projectId, projectId));
  if (sprint) conditions.push(eq(testCasesTable.sprint, sprint));
  if (status) conditions.push(ilike(testCasesTable.status, `%${status}%`));
  if (module) conditions.push(ilike(testCasesTable.module, `%${module}%`));
  if (assignedTo) conditions.push(ilike(testCasesTable.assignedTo, `%${assignedTo}%`));

  const where = conditions.length ? and(...conditions) : undefined;

  const [{ total }] = await db.select({ total: count() }).from(testCasesTable).where(where);

  const rows = await db
    .select({
      id: testCasesTable.id,
      testCaseId: testCasesTable.testCaseId,
      title: testCasesTable.title,
      module: testCasesTable.module,
      priority: testCasesTable.priority,
      status: testCasesTable.status,
      assignedTo: testCasesTable.assignedTo,
      sprint: testCasesTable.sprint,
      executedAt: testCasesTable.executedAt,
      projectId: testCasesTable.projectId,
      projectName: projectsTable.name,
    })
    .from(testCasesTable)
    .leftJoin(projectsTable, eq(testCasesTable.projectId, projectsTable.id))
    .where(where)
    .orderBy(testCasesTable.createdAt)
    .limit(limit)
    .offset((page - 1) * limit);

  res.json({
    data: rows.map(r => ({
      ...r,
      projectName: r.projectName ?? "",
      executedAt: r.executedAt?.toISOString() ?? null,
    })),
    total: Number(total),
    page,
    limit,
  });
});

router.get("/testcases/by-status", requireAuth, async (req, res): Promise<void> => {
  const projectId = parseIntParam(req.query.projectId);
  const sprint = req.query.sprint as string | undefined;

  const conditions = [];
  if (projectId) conditions.push(eq(testCasesTable.projectId, projectId));
  if (sprint) conditions.push(eq(testCasesTable.sprint, sprint));

  const rows = await db.select({
    status: testCasesTable.status,
    count: count(),
  })
    .from(testCasesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(testCasesTable.status)
    .orderBy(sql`count(*) DESC`);

  res.json(rows.map(r => ({ status: r.status, count: Number(r.count) })));
});

router.get("/testcases/by-module", requireAuth, async (req, res): Promise<void> => {
  const projectId = parseIntParam(req.query.projectId);
  const sprint = req.query.sprint as string | undefined;

  const conditions = [];
  if (projectId) conditions.push(eq(testCasesTable.projectId, projectId));
  if (sprint) conditions.push(eq(testCasesTable.sprint, sprint));

  const rows = await db.select({
    module: testCasesTable.module,
    total: count(),
    passed: sql<number>`SUM(CASE WHEN LOWER(${testCasesTable.status}) IN ('passed','pass') THEN 1 ELSE 0 END)`,
    failed: sql<number>`SUM(CASE WHEN LOWER(${testCasesTable.status}) IN ('failed','fail') THEN 1 ELSE 0 END)`,
    blocked: sql<number>`SUM(CASE WHEN LOWER(${testCasesTable.status}) = 'blocked' THEN 1 ELSE 0 END)`,
  })
    .from(testCasesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(testCasesTable.module)
    .orderBy(sql`count(*) DESC`);

  res.json(rows.map(r => ({
    module: r.module,
    total: Number(r.total),
    passed: Number(r.passed),
    failed: Number(r.failed),
    blocked: Number(r.blocked),
  })));
});

export default router;
