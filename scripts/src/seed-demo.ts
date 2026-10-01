/**
 * Loads FICTIONAL demo data through the real API (so every record passes the
 * approval workflow). For evaluation only — run against an empty database with
 * the API started in AUTH_MODE=dev and ADMIN_EMAILS containing ADMIN below.
 *
 *   API_URL=http://localhost:3000 ADMIN=admin@demo.edu pnpm --filter @workspace/scripts run seed-demo
 */
const API = (process.env.API_URL ?? "http://localhost:3000") + "/api";
const ADMIN = process.env.ADMIN ?? "admin@demo.edu";
const DOMAIN = ADMIN.split("@")[1];

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T>(a: T[]): T => a[Math.floor(rand() * a.length)];
const some = <T>(a: T[], n: number): T[] => [...a].sort(() => rand() - 0.5).slice(0, n);

async function call(who: string, method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", "x-dev-user": who },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(data)}`);
  return data;
}

const unit = (type: string, name: string, code: string, parentId?: number) =>
  call(ADMIN, "POST", "/admin/org/units", { type, name, code, parentId });

const STAFF: [string, string, string][] = [
  // name, unit code, rank
  ["Layla Demo-Harthy", "CS", "Professor"], ["Omar Demo-Rashdi", "CS", "Associate Professor"],
  ["Huda Demo-Balushi", "CS", "Assistant Professor"], ["Samir Demo-Khalil", "CS", "Assistant Professor"],
  ["Mariam Demo-Saidi", "MATH", "Associate Professor"], ["Yusuf Demo-Amri", "MATH", "Lecturer"],
  ["Aisha Demo-Kindi", "CHEM", "Professor"], ["Khalid Demo-Hinai", "CHEM", "Assistant Professor"],
  ["Noor Demo-Farsi", "PHARM", "Associate Professor"], ["Salim Demo-Maskari", "PHARM", "Assistant Professor"],
  ["Fatma Demo-Riyami", "ENG", "Professor"], ["Hamed Demo-Shukaili", "ENG", "Assistant Professor"],
  ["Zainab Demo-Abri", "EDU", "Associate Professor"], ["Rashid Demo-Ghaithi", "EDU", "Lecturer"],
  ["Mona Demo-Lawati", "DARIS", "Research Fellow"], ["Tariq Demo-Busaidi", "DARIS", "Research Fellow"],
];

const TOPICS: Record<string, { words: string[]; venues: string[]; sdgs: number[] }> = {
  CS: { words: ["Arabic NLP", "deep learning", "cybersecurity", "federated learning", "IoT", "computer vision"], venues: ["IEEE Access", "Applied Sciences", "Expert Systems with Applications", "Proc. ICCA"], sdgs: [4, 9] },
  MATH: { words: ["fractional calculus", "graph theory", "numerical methods", "optimisation"], venues: ["Mathematics", "Journal of Applied Mathematics", "AIMS Mathematics"], sdgs: [4] },
  CHEM: { words: ["frankincense", "green chemistry", "water treatment", "natural products"], venues: ["Molecules", "Journal of Cleaner Production", "RSC Advances"], sdgs: [6, 12, 3] },
  PHARM: { words: ["antimicrobial resistance", "drug delivery", "medicinal plants", "pharmacology"], venues: ["Pharmaceuticals", "Frontiers in Pharmacology", "Saudi Pharmaceutical Journal"], sdgs: [3] },
  ENG: { words: ["solar energy", "desalination", "smart grid", "concrete durability"], venues: ["Energies", "Renewable Energy", "Desalination"], sdgs: [7, 6, 11, 13] },
  EDU: { words: ["e-learning", "teacher education", "higher education quality", "assessment"], venues: ["Education Sciences", "Sustainability", "Int. J. of Instruction"], sdgs: [4, 5] },
  DARIS: { words: ["date palm", "aflaj irrigation", "arid-land ecology", "soil microbiome"], venues: ["Scientific Reports", "Plants", "Journal of Arid Environments"], sdgs: [2, 15, 6, 13] },
};
const COUNTRIES = ["GB", "US", "DE", "SA", "AE", "IN", "MY", "EG", "AU", "FR", "QA", "PK"];
const OA = ["gold", "gold", "green", "hybrid", "bronze", "closed", "diamond"];
const TYPES = ["journal_article", "journal_article", "journal_article", "conference_paper", "conference_paper", "book_chapter", "review_article", "book"];

async function main() {
  console.log(`Seeding fictional demo data via ${API} as ${ADMIN}`);
  await call(ADMIN, "GET", "/me");
  const uni = await unit("university", "Demo University", "UNI");
  const cas = await unit("college", "College of Arts and Sciences", "CAS", uni.id);
  const cph = await unit("college", "College of Pharmacy and Nursing", "CPN", uni.id);
  const cea = await unit("college", "College of Engineering and Architecture", "CEA", uni.id);
  const ced = await unit("college", "College of Education", "CED", uni.id);
  const units: Record<string, any> = {
    CS: await unit("department", "Department of Computer Science", "CS", cas.id),
    MATH: await unit("department", "Department of Mathematics", "MATH", cas.id),
    CHEM: await unit("department", "Department of Chemistry", "CHEM", cas.id),
    PHARM: await unit("department", "Department of Pharmacy", "PHARM", cph.id),
    ENG: await unit("department", "Department of Civil and Environmental Engineering", "ENG", cea.id),
    EDU: await unit("department", "Department of Curriculum and Instruction", "EDU", ced.id),
    DARIS: await unit("centre", "Natural and Medical Sciences Research Centre", "DARIS", uni.id),
  };

  const emails: Record<string, string> = {};
  const rows = STAFF.map(([name, code, rank]) => {
    const email = `${name.split(" ")[0].toLowerCase()}@${DOMAIN}`;
    emails[name] = email;
    return { fullName: name, email, unitCode: code, academicRank: rank, honorific: rank.includes("Professor") ? "Dr." : "" };
  });
  console.log("people:", await call(ADMIN, "POST", "/admin/people/import", { rows }));
  const people: any[] = await call(ADMIN, "GET", "/people");
  const byName = (n: string) => people.find((p) => p.fullName === n);

  // Positions: two co-heads in CS (either may approve), heads elsewhere, deans with subtree scope.
  const assign = async (unitId: number, title: string, names: string[], approvalScope = "unit") => {
    const pos = await call(ADMIN, "POST", `/admin/org/units/${unitId}/positions`, { title, approvalScope });
    await call(ADMIN, "POST", `/admin/positions/${pos.id}/assignments`, { personIds: names.map((n) => byName(n).id) });
  };
  await assign(units.CS.id, "Head of Department", ["Layla Demo-Harthy", "Omar Demo-Rashdi"]);
  await assign(units.MATH.id, "Head of Department", ["Mariam Demo-Saidi"]);
  await assign(units.CHEM.id, "Head of Department", ["Aisha Demo-Kindi"]);
  await assign(units.PHARM.id, "Head of Department", ["Noor Demo-Farsi"]);
  await assign(units.ENG.id, "Head of Department", ["Fatma Demo-Riyami"]);
  await assign(units.EDU.id, "Head of Department", ["Zainab Demo-Abri"]);
  await assign(units.DARIS.id, "Centre Director", ["Mona Demo-Lawati"]);
  await assign(cas.id, "Dean", ["Aisha Demo-Kindi"], "subtree");

  let outputs = 0;
  let acts = 0;
  for (const [name, code] of STAFF) {
    const who = emails[name];
    const t = TOPICS[code];
    const n = 3 + Math.floor(rand() * 5);
    for (let i = 0; i < n; i++) {
      const year = 2016 + Math.floor(rand() * 11);
      const type = pick(TYPES);
      const kw = some(t.words, 2);
      const co = some(COUNTRIES, Math.floor(rand() * 3));
      const coauthors = Array.from({ length: 1 + Math.floor(rand() * 4) }, (_, k) => ({ name: `Co Author ${String.fromCharCode(65 + k)}${i}`, countries: co.length ? [pick(co)] : ["OM"] }));
      const authors = [{ name, countries: ["OM"] }, ...coauthors].sort(() => rand() - 0.5);
      const s = await call(who, "POST", "/submissions", {
        kind: "output",
        payload: {
          type, title: `${kw[0][0].toUpperCase()}${kw[0].slice(1)} and ${kw[1]}: a study from Oman (demo ${code}-${i + 1})`,
          publicationYear: Math.min(year, 2026), venue: pick(t.venues), oaStatus: pick(OA), keywords: kw,
          sdgs: some(t.sdgs, 1 + Math.floor(rand() * 2)), authors, collabCountries: ["OM", ...co],
          citationCount: Math.floor(rand() * rand() * 120 * Math.max(1, 2026 - year) / 4),
          authorPosition: authors.findIndex((a) => a.name === name) + 1,
          creditRoles: some(["conceptualization", "methodology", "investigation", "writing_original_draft", "supervision"], 2),
        },
      });
      outputs++;
      const r = rand();
      if (r < 0.82) await approve(s.id, "approve");
      else if (r < 0.9) await approve(s.id, "return", "Please add the DOI and page numbers.");
    }
    const a = [
      { type: "conference_presentation", title: `Talk on ${pick(t.words)} at the Gulf Research Forum (demo)`, role: "Speaker", organisation: "Gulf Research Forum", location: pick(["Muscat", "Doha", "Dubai", "London"]), startDate: `${2022 + Math.floor(rand() * 4)}-0${1 + Math.floor(rand() * 9)}-12`, scope: "international" },
      rand() < 0.5 && { type: "grant", title: `${pick(t.words)} research project (demo)`, role: "Principal investigator", funder: pick(["MoHERI Block Funding", "Demo University Internal Grant", "Industry partner"]), amount: String(5000 + Math.floor(rand() * 60) * 1000), currency: "OMR", startDate: `${2021 + Math.floor(rand() * 5)}-01-01`, scope: "national" },
      rand() < 0.35 && { type: "award", title: pick(["Best Paper Award", "Excellence in Research Award", "Distinguished Teaching Award"]) + " (demo)", organisation: pick(["IEEE Oman Section", "Demo University", "Ministry of Higher Education"]), startDate: `${2023 + Math.floor(rand() * 3)}-05-20`, scope: pick(["national", "international"]) },
      rand() < 0.5 && { type: "seminar_given", title: `Departmental seminar: ${pick(t.words)} (demo)`, role: "Presenter", organisation: "Demo University", startDate: `2025-${String(1 + Math.floor(rand() * 9)).padStart(2, "0")}-15`, scope: "internal" },
      rand() < 0.4 && { type: "editorial_role", title: `Editorial board member, ${pick(t.venues)} (demo)`, role: "Associate editor", startDate: "2024-01-01", scope: "international" },
    ].filter(Boolean);
    for (const payload of a) {
      const s = await call(who, "POST", "/submissions", { kind: "activity", payload });
      acts++;
      if (rand() < 0.85) await approve(s.id, "approve");
    }
  }

  async function approve(id: number, decision: string, comment?: string) {
    const queue: any[] = await call(ADMIN, "GET", "/approvals");
    if (queue.some((q) => q.id === id)) await call(ADMIN, "POST", `/approvals/${id}`, { decision, comment });
  }

  // Feature a few outputs on the showcase.
  const top = await call(ADMIN, "GET", "/outputs?sort=citations&pageSize=3");
  for (const o of top.items) await call(ADMIN, "PATCH", `/admin/outputs/${o.id}`, { featured: true });
  console.log(`Done: ${outputs} outputs and ${acts} activities submitted (most approved, some pending/returned).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
