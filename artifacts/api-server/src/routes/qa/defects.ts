import { Router, type IRouter } from "express";
import { db, defectsTable, projectsTable } from "@workspace/db";
import { requireLogin as requireAuth } from "../../lib/auth";
import { eq, and, sql, count, ilike } from "drizzle-orm";

const router: IRouter = Router();


function parseIntParam(val: unknown): number | null {
  if (val == null || val === "") return null;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}

router.get("/defects", requireAuth, async (req, res): Promise<void> => {
  const projectId = parseIntParam(req.query.projectId);
  const sprint = req.query.sprint as string | undefined;
  const severity = req.query.severity as string | undefined;
  const status = req.query.status as string | undefined;
  const assignedTo = req.query.assignedTo as string | undefined;
  const page = Math.max(1, parseIntParam(req.query.page) ?? 1);
  const limit = Math.min(200, Math.max(1, parseIntParam(req.query.limit) ?? 50));

  const conditions = [];
  if (projectId) conditions.push(eq(defectsTable.projectId, projectId));
  if (sprint) conditions.push(eq(defectsTable.sprint, sprint));
  if (severity) conditions.push(ilike(defectsTable.severity, `%${severity}%`));
  if (status) conditions.push(ilike(defectsTable.status, `%${status}%`));
  if (assignedTo) conditions.push(ilike(defectsTable.assignedTo, `%${assignedTo}%`));

  const where = conditions.length ? and(...conditions) : undefined;

  const [{ total }] = await db.select({ total: count() }).from(defectsTable).where(where);

  const rows = await db
    .select({
      id: defectsTable.id,
      defectId: defectsTable.defectId,
      title: defectsTable.title,
      module: defectsTable.module,
      severity: defectsTable.severity,
      priority: defectsTable.priority,
      status: defectsTable.status,
      assignedTo: defectsTable.assignedTo,
      reportedBy: defectsTable.reportedBy,
      sprint: defectsTable.sprint,
      reportedAt: defectsTable.reportedAt,
      resolvedAt: defectsTable.resolvedAt,
      projectId: defectsTable.projectId,
      projectName: projectsTable.name,
    })
    .from(defectsTable)
    .leftJoin(projectsTable, eq(defectsTable.projectId, projectsTable.id))
    .where(where)
    .orderBy(sql`${defectsTable.reportedAt} DESC NULLS LAST`)
    .limit(limit)
    .offset((page - 1) * limit);

  res.json({
    data: rows.map(r => ({
      ...r,
      projectName: r.projectName ?? "",
      reportedAt: r.reportedAt?.toISOString() ?? null,
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
    })),
    total: Number(total),
    page,
    limit,
  });
});

router.get("/defects/by-severity", requireAuth, async (req, res): Promise<void> => {
  const projectId = parseIntParam(req.query.projectId);
  const sprint = req.query.sprint as string | undefined;
  const conditions = [];
  if (projectId) conditions.push(eq(defectsTable.projectId, projectId));
  if (sprint) conditions.push(eq(defectsTable.sprint, sprint));

  const rows = await db.select({
    status: defectsTable.severity,
    count: count(),
  }).from(defectsTable).where(conditions.length ? and(...conditions) : undefined)
    .groupBy(defectsTable.severity).orderBy(sql`count(*) DESC`);

  res.json(rows.map(r => ({ status: r.status, count: Number(r.count) })));
});

router.get("/defects/by-status", requireAuth, async (req, res): Promise<void> => {
  const projectId = parseIntParam(req.query.projectId);
  const sprint = req.query.sprint as string | undefined;
  const conditions = [];
  if (projectId) conditions.push(eq(defectsTable.projectId, projectId));
  if (sprint) conditions.push(eq(defectsTable.sprint, sprint));

  const rows = await db.select({
    status: defectsTable.status,
    count: count(),
  }).from(defectsTable).where(conditions.length ? and(...conditions) : undefined)
    .groupBy(defectsTable.status).orderBy(sql`count(*) DESC`);

  res.json(rows.map(r => ({ status: r.status, count: Number(r.count) })));
});

export default router;
