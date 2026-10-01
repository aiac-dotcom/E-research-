import { Router, type IRouter } from "express";
import { db, activityTable, projectsTable } from "@workspace/db";
import { requireLogin as requireAuth } from "../../lib/auth";
import { eq, and, sql, count } from "drizzle-orm";

const router: IRouter = Router();


function parseIntParam(val: unknown): number | null {
  if (val == null || val === "") return null;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}

router.get("/activity", requireAuth, async (req, res): Promise<void> => {
  const limit = Math.min(100, Math.max(1, parseIntParam(req.query.limit) ?? 20));
  const projectId = parseIntParam(req.query.projectId);

  const conditions = [];
  if (projectId) conditions.push(eq(activityTable.projectId, projectId));

  const rows = await db.select({
    id: activityTable.id,
    entityType: activityTable.entityType,
    entityId: activityTable.entityId,
    action: activityTable.action,
    description: activityTable.description,
    performedBy: activityTable.performedBy,
    projectName: projectsTable.name,
    createdAt: activityTable.createdAt,
  })
    .from(activityTable)
    .leftJoin(projectsTable, eq(activityTable.projectId, projectsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sql`${activityTable.createdAt} DESC`)
    .limit(limit);

  res.json(rows.map(r => ({
    id: r.id,
    entityType: r.entityType,
    entityId: r.entityId,
    action: r.action,
    description: r.description,
    performedBy: r.performedBy,
    projectName: r.projectName ?? "Unknown",
    createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
  })));
});

export default router;
