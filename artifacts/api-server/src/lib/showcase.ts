import { db } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";
import { descendants, orgSnapshot } from "./approval";
import { OPEN_OA, searchActivities, withInternalAuthors } from "./repository";

const HOME = () => (process.env["INSTITUTION_COUNTRY"] || "OM").toUpperCase();

async function rows<T = any>(q: SQL): Promise<T[]> {
  const r = await db.execute(q);
  return r.rows as T[];
}

const TYPE_GROUP = sql`case
  when o.type in ('journal_article','review_article','editorial') then 'Journal articles'
  when o.type = 'conference_paper' then 'Conference papers'
  when o.type in ('book','book_chapter') then 'Books & chapters'
  else 'Other outputs' end`;

/**
 * Aggregates for the public university showcase. Only public records count.
 * Metric definitions follow Snowball Metrics conventions (scholarly output,
 * citation count, open-access share, international collaboration share).
 */
export async function showcaseStats(unitId: number | null) {
  const snap = await orgSnapshot();
  const scope = unitId ? descendants(snap, unitId) : null;
  const unitArr = scope ? sql`array[${sql.join(scope.map((i) => sql`${i}`), sql`, `)}]::int[]` : null;
  const outScope = unitArr
    ? sql`o.visibility = 'public' and exists (select 1 from research_output_authors r where r.output_id = o.id and r.org_unit_id = any(${unitArr}))`
    : sql`o.visibility = 'public'`;
  const actScope = unitArr ? sql`a.visibility = 'public' and a.org_unit_id = any(${unitArr})` : sql`a.visibility = 'public'`;
  const peopleScope = unitArr ? sql`p.active and p.org_unit_id = any(${unitArr})` : sql`p.active`;
  const thisYear = new Date().getFullYear();
  const openArr = sql`array[${sql.join(OPEN_OA.map((s) => sql`${s}`), sql`, `)}]`;

  const [totals] = await rows(sql`
    select count(*)::int as outputs,
      coalesce(sum(o.citation_count),0)::int as citations,
      count(*) filter (where o.publication_year >= ${thisYear - 4})::int as outputs5y,
      count(*) filter (where o.oa_status = any(${openArr}))::int as open_access,
      count(*) filter (where o.oa_status <> 'unknown')::int as oa_known,
      count(*) filter (where exists (select 1 from unnest(o.collab_countries) c where c <> ${HOME()}))::int as intl,
      count(*) filter (where cardinality(o.collab_countries) > 0)::int as countries_known
    from research_outputs o where ${outScope}`);
  const [staff] = await rows(sql`
    select count(*)::int as staff,
      count(*) filter (where exists (select 1 from research_output_authors r join research_outputs o on o.id = r.output_id
        where r.person_id = p.id and o.publication_year >= ${thisYear - 4}))::int as active_researchers
    from people p where ${peopleScope}`);

  const byYear = await rows(sql`
    select o.publication_year as year, ${TYPE_GROUP} as grp, count(*)::int as n
    from research_outputs o
    where ${outScope} and o.publication_year between ${thisYear - 9} and ${thisYear}
    group by 1, 2 order by 1`);

  // Breakdown by the next organisational level below the selected scope.
  const parentId = unitId ?? null;
  const childUnits = [...snap.units.values()].filter((u) => (parentId ? u.parentId === parentId : (u.parentId === null && u.type !== "university") || (u.parentId !== null && snap.units.get(u.parentId)?.type === "university")));
  const byUnit = [] as { unitId: number; name: string; type: string; outputs: number; citations: number }[];
  for (const u of childUnits) {
    const ids = descendants(snap, u.id);
    const [r] = await rows(sql`
      select count(*)::int as outputs, coalesce(sum(o.citation_count),0)::int as citations from research_outputs o
      where o.visibility = 'public' and exists (select 1 from research_output_authors r where r.output_id = o.id
        and r.org_unit_id = any(array[${sql.join(ids.map((i) => sql`${i}`), sql`, `)}]::int[]))`);
    byUnit.push({ unitId: u.id, name: u.name, type: u.type, outputs: r?.outputs ?? 0, citations: r?.citations ?? 0 });
  }
  byUnit.sort((a, b) => b.outputs - a.outputs);

  const oa = await rows(sql`select o.oa_status as status, count(*)::int as n from research_outputs o where ${outScope} group by 1`);
  const sdgs = await rows(sql`select s as sdg, count(*)::int as n from research_outputs o, unnest(o.sdgs) s where ${outScope} group by 1 order by 1`);
  const countries = await rows(sql`
    select c as country, count(*)::int as n from research_outputs o, unnest(o.collab_countries) c
    where ${outScope} and c <> ${HOME()} group by 1 order by 2 desc limit 15`);
  const keywords = await rows(sql`
    select lower(k) as keyword, count(*)::int as n from research_outputs o, unnest(o.keywords) k
    where ${outScope} group by 1 order by 2 desc limit 30`);
  const activityCounts = await rows(sql`
    select a.type, count(*)::int as n from activities a join people p on p.id = a.person_id
    where ${actScope} group by 1`);
  const funding = await rows(sql`
    select coalesce(a.currency, 'OMR') as currency, coalesce(sum(a.amount),0)::float as total, count(*)::int as n
    from activities a where ${actScope} and a.type = 'grant' group by 1 order by 2 desc`);

  const [{ n: featuredCount }] = await rows(sql`select count(*)::int as n from research_outputs o where ${outScope} and o.featured`);
  const highlightIds = await rows<{ id: number }>(featuredCount
    ? sql`select o.id from research_outputs o where ${outScope} and o.featured order by o.publication_year desc nulls last limit 6`
    : sql`select o.id from research_outputs o where ${outScope} and o.publication_year >= ${thisYear - 3}
        order by o.citation_count desc, o.publication_year desc limit 6`);
  const highlightRows = highlightIds.length
    ? await rows(sql`select o.* from research_outputs o where o.id = any(array[${sql.join(highlightIds.map((h) => sql`${h.id}`), sql`, `)}]::int[])`)
    : [];
  const highlights = await withInternalAuthors(
    highlightIds.map((h) => {
      const r: any = highlightRows.find((x: any) => x.id === h.id);
      return { id: r.id, title: r.title, type: r.type, venue: r.venue, publicationYear: r.publication_year, doi: r.doi,
        url: r.url, citationCount: r.citation_count, oaStatus: r.oa_status, sdgs: r.sdgs };
    }),
    true,
  );

  const act = (type: string) => searchActivities({ type, unitId, publicOnly: true, limit: 6 });
  const [awards, grants, events] = await Promise.all([
    act("award"),
    act("grant"),
    act("keynote_invited_talk,conference_presentation,conference_organisation,seminar_given,workshop"),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    scope: unitId ? { unitId, name: snap.units.get(unitId)?.name ?? "" } : null,
    homeCountry: HOME(),
    kpis: {
      outputs: totals.outputs, outputs5y: totals.outputs5y, citations: totals.citations,
      openAccessShare: totals.oa_known ? totals.open_access / totals.oa_known : null,
      intlCollabShare: totals.countries_known ? totals.intl / totals.countries_known : null,
      staff: staff.staff, activeResearchers: staff.active_researchers,
      grants: funding.reduce((a: number, f: any) => a + f.n, 0),
      funding,
      awards: activityCounts.find((a: any) => a.type === "award")?.n ?? 0,
    },
    byYear, byUnit, oa, sdgs, countries, keywords, activityCounts,
    highlights, awards, grants, events,
  };
}
