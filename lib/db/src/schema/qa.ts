import { pgTable, text, serial, timestamp, integer, real, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Projects ─────────────────────────────────────────────────────────────────
export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({ id: true, createdAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;

// ── Test Cases ────────────────────────────────────────────────────────────────
export const testCasesTable = pgTable("test_cases", {
  id: serial("id").primaryKey(),
  testCaseId: text("test_case_id").notNull(),
  title: text("title").notNull(),
  module: text("module").notNull().default("General"),
  priority: text("priority").notNull().default("Medium"),
  status: text("status").notNull().default("Not Executed"),
  assignedTo: text("assigned_to"),
  sprint: text("sprint"),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTestCaseSchema = createInsertSchema(testCasesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTestCase = z.infer<typeof insertTestCaseSchema>;
export type TestCase = typeof testCasesTable.$inferSelect;

// ── Defects ───────────────────────────────────────────────────────────────────
export const defectsTable = pgTable("defects", {
  id: serial("id").primaryKey(),
  defectId: text("defect_id").notNull(),
  title: text("title").notNull(),
  module: text("module").notNull().default("General"),
  severity: text("severity").notNull().default("Medium"),
  priority: text("priority").notNull().default("Medium"),
  status: text("status").notNull().default("Open"),
  assignedTo: text("assigned_to"),
  reportedBy: text("reported_by"),
  sprint: text("sprint"),
  reportedAt: timestamp("reported_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDefectSchema = createInsertSchema(defectsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDefect = z.infer<typeof insertDefectSchema>;
export type Defect = typeof defectsTable.$inferSelect;

// ── Coverage ──────────────────────────────────────────────────────────────────
export const coverageTable = pgTable("coverage", {
  id: serial("id").primaryKey(),
  module: text("module").notNull(),
  totalRequirements: integer("total_requirements").notNull().default(0),
  coveredRequirements: integer("covered_requirements").notNull().default(0),
  coveragePercent: real("coverage_percent").notNull().default(0),
  sprint: text("sprint"),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCoverageSchema = createInsertSchema(coverageTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCoverage = z.infer<typeof insertCoverageSchema>;
export type Coverage = typeof coverageTable.$inferSelect;

// ── Activity Log ──────────────────────────────────────────────────────────────
export const activityTable = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  description: text("description").notNull(),
  performedBy: text("performed_by"),
  projectId: integer("project_id").references(() => projectsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertActivitySchema = createInsertSchema(activityTable).omit({ id: true, createdAt: true });
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activityTable.$inferSelect;
