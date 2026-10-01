export const OUTPUT_TYPES: Record<string, string> = {
  journal_article: "Journal article", conference_paper: "Conference paper", book: "Book", book_chapter: "Book chapter",
  review_article: "Review article", preprint: "Preprint", dataset: "Dataset", software: "Software", patent: "Patent",
  thesis: "Thesis", report: "Report", editorial: "Editorial", other: "Other",
};

export const ACTIVITY_GROUPS: { label: string; types: Record<string, string> }[] = [
  { label: "Events", types: {
    seminar_given: "Seminar given", seminar_attended: "Seminar attended", conference_presentation: "Conference presentation",
    conference_attendance: "Conference attendance", conference_organisation: "Conference organisation", workshop: "Workshop",
    keynote_invited_talk: "Keynote / invited talk",
  } },
  { label: "Funding & recognition", types: { grant: "Research grant", award: "Award / honour", patent_filed: "Patent filed" } },
  { label: "Academic service", types: {
    editorial_role: "Editorial role", peer_review: "Peer review", thesis_supervision: "Thesis supervision",
    external_examiner: "External examiner", professional_membership: "Professional membership", visiting_position: "Visiting position",
  } },
  { label: "Engagement", types: {
    consultancy: "Consultancy", training_course: "Training / course", community_engagement: "Community engagement",
    media_appearance: "Media appearance", other: "Other",
  } },
];

export const ACTIVITY_TYPES: Record<string, string> = Object.assign({}, ...ACTIVITY_GROUPS.map((g) => g.types));

export const OA_LABELS: Record<string, string> = {
  gold: "Gold", diamond: "Diamond", green: "Green", hybrid: "Hybrid", bronze: "Bronze", closed: "Closed", unknown: "Unknown",
};

export const CREDIT_ROLES: Record<string, string> = {
  conceptualization: "Conceptualization", data_curation: "Data curation", formal_analysis: "Formal analysis",
  funding_acquisition: "Funding acquisition", investigation: "Investigation", methodology: "Methodology",
  project_administration: "Project administration", resources: "Resources", software: "Software", supervision: "Supervision",
  validation: "Validation", visualization: "Visualization", writing_original_draft: "Writing – original draft",
  writing_review_editing: "Writing – review & editing",
};

export const UNIT_TYPES: Record<string, string> = {
  university: "University", college: "College", department: "Department", unit: "Unit", centre: "Centre", office: "Office",
};

export const STATUS_LABELS: Record<string, string> = {
  candidate: "To confirm", pending: "Awaiting approval", returned: "Returned for changes", approved: "Approved",
  rejected: "Rejected", dismissed: "Dismissed",
};

/** UN Sustainable Development Goals (official short titles and colours). */
export const SDGS: { n: number; title: string; color: string }[] = [
  { n: 1, title: "No poverty", color: "#E5243B" }, { n: 2, title: "Zero hunger", color: "#DDA63A" },
  { n: 3, title: "Good health and well-being", color: "#4C9F38" }, { n: 4, title: "Quality education", color: "#C5192D" },
  { n: 5, title: "Gender equality", color: "#FF3A21" }, { n: 6, title: "Clean water and sanitation", color: "#26BDE2" },
  { n: 7, title: "Affordable and clean energy", color: "#FCC30B" }, { n: 8, title: "Decent work and economic growth", color: "#A21942" },
  { n: 9, title: "Industry, innovation and infrastructure", color: "#FD6925" }, { n: 10, title: "Reduced inequalities", color: "#DD1367" },
  { n: 11, title: "Sustainable cities and communities", color: "#FD9D24" }, { n: 12, title: "Responsible consumption and production", color: "#BF8B2E" },
  { n: 13, title: "Climate action", color: "#3F7E44" }, { n: 14, title: "Life below water", color: "#0A97D9" },
  { n: 15, title: "Life on land", color: "#56C02B" }, { n: 16, title: "Peace, justice and strong institutions", color: "#00689D" },
  { n: 17, title: "Partnerships for the goals", color: "#19486A" },
];

export const fmt = (n: number | null | undefined) =>
  n === null || n === undefined ? "–" : new Intl.NumberFormat("en", { notation: n >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);

export const pct = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `${Math.round(n * 100)}%`);
