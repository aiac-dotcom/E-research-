import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db, projectsTable, testCasesTable, defectsTable, coverageTable, activityTable } from "@workspace/db";
import { requireLogin as requireAuth, authUserId } from "../../lib/auth";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });


function parseDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === "number") {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(val);
    if (date) return new Date(date.y, date.m - 1, date.d);
  }
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? null : d;
}

function toStr(val: unknown): string {
  if (val == null) return "";
  return String(val).trim();
}

router.post("/upload/excel", requireAuth, upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const dataType = req.body.dataType as string;
  if (!["testcases", "defects", "coverage", "testers"].includes(dataType)) {
    res.status(400).json({ error: "Invalid dataType" });
    return;
  }

  const wb = XLSX.read(req.file.buffer, { type: "buffer", cellDates: false });
  const sheetName = wb.SheetNames[0];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });

  if (!rows.length) {
    res.json({ success: true, rowsImported: 0, rowsSkipped: 0, message: "No rows found in sheet", errors: [] });
    return;
  }

  const errors: string[] = [];
  let rowsImported = 0;
  let rowsSkipped = 0;

  // Determine project from filename or first row
  const projectName = toStr(rows[0]["Project"] || rows[0]["project"] || req.file.originalname.replace(/\.[^/.]+$/, ""));
  let [project] = await db.select().from(projectsTable).where(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (t: any) => t.name.equals(projectName)
  ).limit(1).catch(() => [null]);

  if (!project) {
    const [inserted] = await db.insert(projectsTable).values({ name: projectName }).returning();
    project = inserted;
  }

  if (dataType === "testcases") {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const id = toStr(row["Test Case ID"] || row["TestCaseID"] || row["ID"] || `TC-${i + 1}`);
      const title = toStr(row["Title"] || row["Test Case Name"] || row["Name"] || row["Description"]);
      if (!title) { rowsSkipped++; continue; }
      try {
        await db.insert(testCasesTable).values({
          testCaseId: id,
          title,
          module: toStr(row["Module"] || row["Feature"] || row["Area"] || "General"),
          priority: toStr(row["Priority"] || "Medium"),
          status: toStr(row["Status"] || row["Execution Status"] || "Not Executed"),
          assignedTo: toStr(row["Assigned To"] || row["Tester"] || "") || null,
          sprint: toStr(row["Sprint"] || row["Iteration"] || "") || null,
          executedAt: parseDate(row["Executed Date"] || row["Execution Date"]),
          projectId: project!.id,
        }).onConflictDoNothing();
        rowsImported++;
      } catch (e: unknown) {
        errors.push(`Row ${i + 2}: ${String(e)}`);
        rowsSkipped++;
      }
    }
  } else if (dataType === "defects") {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const id = toStr(row["Defect ID"] || row["Bug ID"] || row["ID"] || `DEF-${i + 1}`);
      const title = toStr(row["Title"] || row["Summary"] || row["Description"] || row["Name"]);
      if (!title) { rowsSkipped++; continue; }
      try {
        await db.insert(defectsTable).values({
          defectId: id,
          title,
          module: toStr(row["Module"] || row["Component"] || row["Area"] || "General"),
          severity: toStr(row["Severity"] || "Medium"),
          priority: toStr(row["Priority"] || "Medium"),
          status: toStr(row["Status"] || "Open"),
          assignedTo: toStr(row["Assigned To"] || row["Assignee"] || "") || null,
          reportedBy: toStr(row["Reported By"] || row["Reporter"] || row["Found By"] || "") || null,
          sprint: toStr(row["Sprint"] || row["Iteration"] || "") || null,
          reportedAt: parseDate(row["Reported Date"] || row["Created Date"] || row["Date Found"]),
          resolvedAt: parseDate(row["Resolved Date"] || row["Closed Date"] || row["Fixed Date"]),
          projectId: project!.id,
        }).onConflictDoNothing();
        rowsImported++;
      } catch (e: unknown) {
        errors.push(`Row ${i + 2}: ${String(e)}`);
        rowsSkipped++;
      }
    }
  } else if (dataType === "coverage") {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const module = toStr(row["Module"] || row["Feature"] || row["Area"] || row["Component"]);
      if (!module) { rowsSkipped++; continue; }
      const total = Number(row["Total Requirements"] || row["Total"] || 0);
      const covered = Number(row["Covered Requirements"] || row["Covered"] || 0);
      const pct = total > 0 ? (covered / total) * 100 : Number(row["Coverage %"] || row["Coverage Percent"] || 0);
      try {
        await db.insert(coverageTable).values({
          module,
          totalRequirements: total,
          coveredRequirements: covered,
          coveragePercent: Math.round(pct * 100) / 100,
          sprint: toStr(row["Sprint"] || "") || null,
          projectId: project!.id,
        });
        rowsImported++;
      } catch (e: unknown) {
        errors.push(`Row ${i + 2}: ${String(e)}`);
        rowsSkipped++;
      }
    }
  }

  // Log activity
  await db.insert(activityTable).values({
    entityType: "upload",
    entityId: req.file.originalname,
    action: "import",
    description: `Imported ${rowsImported} ${dataType} records from ${req.file.originalname}`,
    performedBy: authUserId(req),
    projectId: project!.id,
  }).catch(() => {});

  res.json({
    success: true,
    rowsImported,
    rowsSkipped,
    message: `Successfully imported ${rowsImported} records`,
    errors: errors.slice(0, 10),
  });
});

export default router;
