/**
 * Research Information Management (CRIS) schema.
 *
 * Entity model follows the euroCRIS CERIF / OpenAIRE CRIS guidelines:
 *   OrgUnit  -> org_units          (university / college / department / unit / centre)
 *   Person   -> people             (with ORCID, Scopus, WoS, OpenAlex identifiers)
 *   Role     -> positions + position_assignments (many people per position)
 *   Result   -> research_outputs + research_output_authors (COAR resource types, CRediT roles)
 *   Activity -> activities         (events, funding, awards, service, outreach)
 *
 * Nothing is written to research_outputs or activities until a direct manager
 * approves it. Every submission (manual entry, harvested record, edit request)
 * is staged in `submissions` and audited in `approval_events`.
 */
import {
  pgTable, text, serial, timestamp, integer, boolean, jsonb, index,
  uniqueIndex, numeric, date, primaryKey,
} from "drizzle-orm/pg-core";

// ── Vocabularies ────────────────────────────────────────────────────────────

export const ORG_UNIT_TYPES = ["university", "college", "department", "unit", "centre", "office"] as const;
export type OrgUnitType = (typeof ORG_UNIT_TYPES)[number];

export const SYSTEM_ROLES = ["admin", "staff"] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

/** Subset of the COAR Resource Types vocabulary (v3) used for research outputs. */
export const OUTPUT_TYPES = [
  "journal_article", "conference_paper", "book", "book_chapter", "review_article",
  "preprint", "dataset", "software", "patent", "thesis", "report", "editorial", "other",
] as const;
export type OutputType = (typeof OUTPUT_TYPES)[number];

export const OA_STATUSES = ["gold", "diamond", "green", "hybrid", "bronze", "closed", "unknown"] as const;
export type OaStatus = (typeof OA_STATUSES)[number];

export const ACTIVITY_TYPES = [
  "seminar_given", "seminar_attended", "conference_presentation", "conference_attendance",
  "conference_organisation", "workshop", "keynote_invited_talk", "grant", "award",
  "patent_filed", "editorial_role", "peer_review", "thesis_supervision", "external_examiner",
  "professional_membership", "consultancy", "training_course", "community_engagement",
  "media_appearance", "visiting_position", "other",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** CRediT – Contributor Roles Taxonomy (ANSI/NISO Z39.104-2022). */
export const CREDIT_ROLES = [
  "conceptualization", "data_curation", "formal_analysis", "funding_acquisition",
  "investigation", "methodology", "project_administration", "resources", "software",
  "supervision", "validation", "visualization", "writing_original_draft", "writing_review_editing",
] as const;

export const SUBMISSION_KINDS = ["output", "activity"] as const;
export type SubmissionKind = (typeof SUBMISSION_KINDS)[number];

/**
 * candidate: harvested, waiting for the person to confirm "this is mine"
 * pending:   waiting for the direct manager
 * returned:  manager asked for changes
 * approved:  materialised into the permanent tables
 * rejected:  manager rejected
 * dismissed: person said "not mine"
 */
export const SUBMISSION_STATUSES = ["candidate", "pending", "returned", "approved", "rejected", "dismissed"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const SUBMISSION_SOURCES = [
  "manual", "doi_lookup", "openalex", "crossref", "orcid", "semantic_scholar", "scopus", "wos", "import",
] as const;
export type SubmissionSource = (typeof SUBMISSION_SOURCES)[number];

export type AuthorEntry = {
  name: string;
  orcid?: string | null;
  position: number;
  personId?: number | null;
  institutions?: string[];
  countries?: string[];
};

// ── Platform services (feature flags) ───────────────────────────────────────

export const platformServices = pgTable("platform_services", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  updatedBy: integer("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── Organisation ────────────────────────────────────────────────────────────

export const orgUnits = pgTable("org_units", {
  id: serial("id").primaryKey(),
  type: text("type").$type<OrgUnitType>().notNull(),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  code: text("code"),
  parentId: integer("parent_id"),
  rorId: text("ror_id"),
  description: text("description"),
  website: text("website"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("org_units_parent_idx").on(t.parentId),
  uniqueIndex("org_units_code_uq").on(t.code),
]);

export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull(),
  authUserId: text("auth_user_id"),
  email: text("email").notNull(),
  fullName: text("full_name").notNull(),
  fullNameAr: text("full_name_ar"),
  nameVariants: text("name_variants").array().notNull().default([]),
  honorific: text("honorific"),
  academicRank: text("academic_rank"),
  jobTitle: text("job_title"),
  staffNumber: text("staff_number"),
  orgUnitId: integer("org_unit_id"),
  systemRole: text("system_role").$type<SystemRole>().notNull().default("staff"),
  orcid: text("orcid"),
  scopusAuthorId: text("scopus_author_id"),
  wosResearcherId: text("wos_researcher_id"),
  openalexAuthorId: text("openalex_author_id"),
  semanticScholarId: text("semantic_scholar_id"),
  googleScholarId: text("google_scholar_id"),
  bio: text("bio"),
  researchInterests: text("research_interests").array().notNull().default([]),
  photoUrl: text("photo_url"),
  website: text("website"),
  profilePublic: boolean("profile_public").notNull().default(true),
  active: boolean("active").notNull().default(true),
  lastHarvestedAt: timestamp("last_harvested_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  uniqueIndex("people_email_uq").on(t.email),
  uniqueIndex("people_slug_uq").on(t.slug),
  uniqueIndex("people_auth_uq").on(t.authUserId),
  index("people_org_idx").on(t.orgUnitId),
]);

/** A position (e.g. "Head of Department") inside an org unit. Several people may hold it at once. */
export const positions = pgTable("positions", {
  id: serial("id").primaryKey(),
  orgUnitId: integer("org_unit_id").notNull(),
  title: text("title").notNull(),
  isApprover: boolean("is_approver").notNull().default(true),
  /** "unit": approves for this unit only; "subtree": also for all descendant units. */
  approvalScope: text("approval_scope").$type<"unit" | "subtree">().notNull().default("unit"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [index("positions_org_idx").on(t.orgUnitId)]);

export const positionAssignments = pgTable("position_assignments", {
  id: serial("id").primaryKey(),
  positionId: integer("position_id").notNull(),
  personId: integer("person_id").notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("pa_position_idx").on(t.positionId),
  index("pa_person_idx").on(t.personId),
]);

// ── Staging & workflow ──────────────────────────────────────────────────────

export const submissions = pgTable("submissions", {
  id: serial("id").primaryKey(),
  kind: text("kind").$type<SubmissionKind>().notNull(),
  status: text("status").$type<SubmissionStatus>().notNull(),
  source: text("source").$type<SubmissionSource>().notNull().default("manual"),
  /** Whose portfolio the item belongs to. */
  personId: integer("person_id").notNull(),
  /** Org unit of the person at submission time; drives approver routing. */
  orgUnitId: integer("org_unit_id"),
  /** When editing an already-approved record: id of research_outputs / activities row. */
  targetId: integer("target_id"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  title: text("title").notNull(),
  doi: text("doi"),
  dedupeKey: text("dedupe_key"),
  submittedBy: integer("submitted_by"),
  submittedAt: timestamp("submitted_at"),
  reviewedBy: integer("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewComment: text("review_comment"),
  resultId: integer("result_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("submissions_status_idx").on(t.status),
  index("submissions_person_idx").on(t.personId),
  index("submissions_dedupe_idx").on(t.personId, t.dedupeKey),
]);

export const approvalEvents = pgTable("approval_events", {
  id: serial("id").primaryKey(),
  submissionId: integer("submission_id").notNull(),
  actorId: integer("actor_id"),
  action: text("action").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [index("approval_events_sub_idx").on(t.submissionId)]);

// ── Permanent records (approved only) ───────────────────────────────────────

export const researchOutputs = pgTable("research_outputs", {
  id: serial("id").primaryKey(),
  type: text("type").$type<OutputType>().notNull(),
  title: text("title").notNull(),
  abstract: text("abstract"),
  publicationYear: integer("publication_year"),
  publicationDate: date("publication_date"),
  venue: text("venue"),
  publisher: text("publisher"),
  volume: text("volume"),
  issue: text("issue"),
  pages: text("pages"),
  doi: text("doi"),
  isbn: text("isbn"),
  issn: text("issn"),
  url: text("url"),
  language: text("language"),
  oaStatus: text("oa_status").$type<OaStatus>().notNull().default("unknown"),
  keywords: text("keywords").array().notNull().default([]),
  sdgs: integer("sdgs").array().notNull().default([]),
  authors: jsonb("authors").$type<AuthorEntry[]>().notNull().default([]),
  collabCountries: text("collab_countries").array().notNull().default([]),
  citationCount: integer("citation_count").notNull().default(0),
  citationSource: text("citation_source"),
  citationsUpdatedAt: timestamp("citations_updated_at"),
  externalIds: jsonb("external_ids").$type<Record<string, string>>().notNull().default({}),
  source: text("source").$type<SubmissionSource>().notNull().default("manual"),
  featured: boolean("featured").notNull().default(false),
  visibility: text("visibility").$type<"public" | "internal">().notNull().default("public"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  uniqueIndex("research_outputs_doi_uq").on(t.doi),
  index("research_outputs_year_idx").on(t.publicationYear),
  index("research_outputs_type_idx").on(t.type),
]);

export const researchOutputAuthors = pgTable("research_output_authors", {
  outputId: integer("output_id").notNull(),
  personId: integer("person_id").notNull(),
  authorPosition: integer("author_position"),
  isCorresponding: boolean("is_corresponding").notNull().default(false),
  creditRoles: text("credit_roles").array().notNull().default([]),
  /** Org unit credited for this output (person's unit at approval time). */
  orgUnitId: integer("org_unit_id"),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at").defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.outputId, t.personId] }),
  index("roa_person_idx").on(t.personId),
]);

export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  personId: integer("person_id").notNull(),
  orgUnitId: integer("org_unit_id"),
  type: text("type").$type<ActivityType>().notNull(),
  title: text("title").notNull(),
  role: text("role"),
  description: text("description"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  location: text("location"),
  country: text("country"),
  organisation: text("organisation"),
  url: text("url"),
  /** Grants: funder, amount, currency, reference, status. Awards: awarding body. */
  funder: text("funder"),
  amount: numeric("amount", { precision: 14, scale: 2 }),
  currency: text("currency"),
  reference: text("reference"),
  scope: text("scope").$type<"internal" | "national" | "regional" | "international">(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  featured: boolean("featured").notNull().default(false),
  visibility: text("visibility").$type<"public" | "internal">().notNull().default("public"),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("activities_person_idx").on(t.personId),
  index("activities_type_idx").on(t.type),
  index("activities_start_idx").on(t.startDate),
]);

export const harvestRuns = pgTable("harvest_runs", {
  id: serial("id").primaryKey(),
  personId: integer("person_id"),
  providers: text("providers").array().notNull().default([]),
  trigger: text("trigger").$type<"manual" | "scheduled">().notNull().default("manual"),
  found: integer("found").notNull().default(0),
  created: integer("created").notNull().default(0),
  duplicates: integer("duplicates").notNull().default(0),
  errors: jsonb("errors").$type<string[]>().notNull().default([]),
  startedBy: integer("started_by"),
  startedAt: timestamp("started_at").defaultNow(),
  finishedAt: timestamp("finished_at"),
});
