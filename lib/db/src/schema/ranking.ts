import {
  pgTable, text, serial, timestamp, integer, real, jsonb, index,
} from "drizzle-orm/pg-core";

// ── Arab Rankings Browser ─────────────────────────────────────────────────────
// One row per university per year, loaded from Arab Rankings Excel files
export const arabRankings = pgTable("ranking_arab", {
  id: serial("id").primaryKey(),
  year: text("year").notNull(),
  rank: text("rank"),
  rankNumeric: integer("rank_numeric"),
  universityName: text("university_name").notNull(),
  country: text("country"),
  scores: jsonb("scores").$type<Record<string, number>>().notNull().default({}),
  syncedAt: timestamp("synced_at").defaultNow(),
}, (t) => [
  index("ranking_arab_year_idx").on(t.year),
  index("ranking_arab_name_idx").on(t.universityName),
]);

// ── World Rankings Browser ────────────────────────────────────────────────────
// One row per university per year, loaded from World Rankings Excel files
export const worldRankings = pgTable("ranking_world", {
  id: serial("id").primaryKey(),
  year: text("year").notNull(),
  rank: text("rank"),
  rankNumeric: integer("rank_numeric"),
  universityName: text("university_name").notNull(),
  country: text("country"),
  scores: jsonb("scores").$type<Record<string, number>>().notNull().default({}),
  syncedAt: timestamp("synced_at").defaultNow(),
}, (t) => [
  index("ranking_world_year_idx").on(t.year),
  index("ranking_world_name_idx").on(t.universityName),
]);

// ── QS Analytical: Ranks ──────────────────────────────────────────────────────
// From wurt_ranks_scores.xlsx — WURT_ranks sheet
// Contains all peers × all years × all indicators
export const qsRanks = pgTable("qs_ranks", {
  id: serial("id").primaryKey(),
  peer: text("peer").notNull(),
  year: text("year").notNull(),
  indicator: text("indicator").notNull(),
  rank: integer("rank"),
  countryTerritory: text("country_territory"),
});

// ── QS Analytical: Scores ─────────────────────────────────────────────────────
// From wurt_ranks_scores.xlsx — WURT_Scores sheet
export const qsScores = pgTable("qs_scores", {
  id: serial("id").primaryKey(),
  peer: text("peer").notNull(),
  year: text("year").notNull(),
  indicator: text("indicator").notNull(),
  score: real("score"),
  avgCountryScore: real("avg_country_score"),
});

// ── QS Analytical: Underlying Ratios ─────────────────────────────────────────
// From underlying_ratios.xlsx
export const qsRatios = pgTable("qs_ratios", {
  id: serial("id").primaryKey(),
  peer: text("peer").notNull(),
  year: text("year").notNull(),
  indicator: text("indicator").notNull(),
  ratioValue: real("ratio_value"),
});

// ── QS Analytical: Sustainability ─────────────────────────────────────────────
// From sustainability_wurt.xlsx
export const qsSustainability = pgTable("qs_sustainability", {
  id: serial("id").primaryKey(),
  peer: text("peer").notNull(),
  year: text("year").notNull(),
  indicator: text("indicator").notNull(),
  score: real("score"),
  countryAvgScore: real("country_avg_score"),
  worldAvgScore: real("world_avg_score"),
});

// ── QS Analytical: Employment Outcomes ───────────────────────────────────────
// From underlying_scores_eo.xlsx
export const qsEmploymentOutcomes = pgTable("qs_employment_outcomes", {
  id: serial("id").primaryKey(),
  peer: text("peer").notNull(),
  year: text("year").notNull(),
  indicator: text("indicator").notNull(),
  value: real("value"),
});

// ── QS Analytical: Academic Reputation Scores ────────────────────────────────
// From reputation_academic_scores.xlsx
export const qsAcademicRep = pgTable("qs_academic_rep", {
  id: serial("id").primaryKey(),
  peer: text("peer").notNull(),
  year: text("year").notNull(),
  indicator: text("indicator").notNull(),
  value: real("value"),
});

// ── QS Analytical: Employer Reputation Scores ────────────────────────────────
// From reputation_employer_scores.xlsx
export const qsEmployerRep = pgTable("qs_employer_rep", {
  id: serial("id").primaryKey(),
  peer: text("peer").notNull(),
  year: text("year").notNull(),
  indicator: text("indicator").notNull(),
  value: real("value"),
});

// ── QS Analytical: IRN by Subject Area ───────────────────────────────────────
// From wurn_irn.xlsx
export const qsIrn = pgTable("qs_irn", {
  id: serial("id").primaryKey(),
  peer: text("peer").notNull(),
  year: text("year").notNull(),
  subjectArea: text("subject_area"),
  score: real("score"),
  rank: integer("rank"),
});

// ── QS Analytical: Faculty / Student Data ────────────────────────────────────
// From faculty_student_data.xlsx
export const qsFaculty = pgTable("qs_faculty", {
  id: serial("id").primaryKey(),
  peer: text("peer").notNull(),
  year: text("year").notNull(),
  indicator: text("indicator").notNull(),
  value: real("value"),
});

// ── QS HUB Submission Data ────────────────────────────────────────────────────
// From "all Qs data In HUB from cycle 2017.xlsx"
export const qsHub = pgTable("qs_hub", {
  id: serial("id").primaryKey(),
  year: text("year").notNull(),
  category: text("category").notNull(),
  valueFte: real("value_fte"),
});

// ── QS Analytical: Citations ──────────────────────────────────────────────────
// From citations_original_normalized.xlsx — stored as flexible JSON rows
export const qsCitations = pgTable("qs_citations", {
  id: serial("id").primaryKey(),
  peer: text("peer").notNull(),
  year: text("year").notNull(),
  rowData: jsonb("row_data").$type<Record<string, unknown>>().notNull().default({}),
});

// ── Sync Log ──────────────────────────────────────────────────────────────────
// Tracks when each data source was last synced
export const syncLog = pgTable("sync_log", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  rowsLoaded: integer("rows_loaded").notNull().default(0),
  errors: text("errors"),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
});
