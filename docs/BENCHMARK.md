# Benchmark: research information platforms for universities

This document benchmarks the E-Research platform against established research information management systems (also called CRIS, current research information systems) and the international standards they follow. It explains which design choices come from which standard, and lists what is still missing.

## 1. Reference platforms

| Platform | Type | What it is known for | What we adopted |
|---|---|---|---|
| **Elsevier Pure** | Commercial CRIS | CERIF-based data model; public "Pure Portal" with researcher and unit pages; Scopus integration; validation workflow before records go public | Unit-aware data model; public portal (Showcase + researcher pages); validation before publication |
| **Symplectic Elements** (Digital Science) | Commercial research information system | Automatic harvesting from Scopus, Web of Science, Crossref, PubMed, ORCID, Dimensions and others. The researcher **claims or rejects** suggested publications | Harvest → *To confirm* (claim / not mine) → approval pipeline; multi-source merge by DOI |
| **Clarivate Converis** | Commercial CRIS | Configurable workflows; Web of Science / InCites integration; grants lifecycle | Configurable services; grants and awards as activities |
| **Ex Libris Esploro** | Commercial research services platform | Library-run repository and researcher profiles; automatic capture of outputs | Repository + profiles in one system; open-access status tracking |
| **DSpace-CRIS** (4Science, open source) | Open-source CRIS / repository | OpenAIRE-compliant; ORCID integration; OAI-PMH | OAI-PMH (Dublin Core) endpoint; COAR vocabularies |
| **VIVO** (Lyrasis, open source) | Open-source researcher profiles | Semantic (linked-data) profiles, VIVO ontology | Researcher profile structure (identity, affiliations, outputs, activities) |
| **SciVal / InCites / Dimensions** | Analytics tools | Snowball Metrics (SciVal), normalised citation metrics, collaboration maps | Showcase metric definitions; collaboration and open-access shares |

**Main lesson from the commercial systems:** researchers do not keep records up to date by hand. Data quality comes from (1) automatic harvesting by persistent identifiers, (2) a quick confirm step for the researcher, and (3) validation by someone accountable. The E-Research workflow implements all three.

## 2. Standards and how they are applied

### 2.1 Data model and interoperability

| Standard | Body | How the platform applies it |
|---|---|---|
| **CERIF**: Common European Research Information Format | euroCRIS | Core entities map to CERIF: OrgUnit → `org_units`, Person → `people`, person–org roles → `positions` / `position_assignments`, Result Publication → `research_outputs`, Project / Funding / Event → `activities` |
| **OpenAIRE Guidelines for CRIS Managers** | OpenAIRE | Target for a future CERIF-XML export (see roadmap). OAI-PMH is already in place. |
| **OAI-PMH 2.0** with **Dublin Core** (`oai_dc`) | Open Archives Initiative | `GET /api/oai` (the `oai_pmh` service). Lets aggregators such as OpenAIRE, BASE, CORE and Google Scholar harvest public outputs. |
| **COAR Resource Types** vocabulary | COAR | Output types (`journal_article`, `conference_paper`, `book_chapter`, …) map to COAR URIs in OAI-PMH. |
| **COAR / info:eu-repo access rights** | COAR / OpenAIRE | Open-access status is exposed as `info:eu-repo/semantics/openAccess` or `restrictedAccess`. |
| **CRediT**: Contributor Roles Taxonomy (ANSI/NISO Z39.104-2022) | NISO | Staff record their contribution roles on each output. |
| **UN Sustainable Development Goals** | United Nations | SDG tagging per output (taken from OpenAlex or added by the author); SDG grid on the Showcase. |
| **BibTeX / RIS / CSV / JSON** | De-facto exchange formats | Exports for EndNote, Zotero, Mendeley and Excel. |

### 2.2 Persistent identifiers (PIDs)

| PID | For | Use in the platform |
|---|---|---|
| **ORCID iD** | People | The most reliable way to harvest. Stored on the profile, used to match the author in a harvested record, and used to suggest the work to **co-authors** at the university. |
| **DOI** (Crossref, DataCite) | Outputs | Primary de-duplication key. Also used for DOI look-up when adding a publication manually. |
| **ROR ID** | Organisations | Stored on org units. `INSTITUTION_ROR` puts local authors first in OpenAlex search results. |
| **Scopus Author ID, WoS ResearcherID, OpenAlex ID, Semantic Scholar ID, Google Scholar ID** | People | Stored on the profile and used by the matching harvester. |

**Why this matters for rankings:** QS bibliometric indicators (citations per faculty, International Research Network) are computed from **Scopus**. Correct Scopus Author IDs and affiliation profiles, and a complete DOI-based publication list, directly affect the ranking indicators shown in the ranking dashboard service.

### 2.3 Harvesting sources

| Source | Cost | Strength | Configuration |
|---|---|---|---|
| **OpenAlex** | Free (free API key recommended) | Broad coverage, open data (CC0), SDG and open-access classification, author disambiguation, institution (ROR) data | `OPENALEX_API_KEY`, `INSTITUTION_ROR` |
| **ORCID** public API | Free | Researcher-curated works list | Optional `ORCID_CLIENT_ID` / `ORCID_CLIENT_SECRET` |
| **Crossref** | Free | Authoritative DOI metadata; name + affiliation search | `HARVEST_CONTACT_EMAIL` (polite pool) |
| **Semantic Scholar** | Free (key recommended) | Strong for computer science and biomedicine | `SEMANTIC_SCHOLAR_API_KEY` |
| **Scopus** (Elsevier) | Subscription | Data source of QS and THE bibliometrics | `SCOPUS_API_KEY`, `SCOPUS_INSTTOKEN`, `SCOPUS_AFFILIATION_ID` |
| **Web of Science Starter API** (Clarivate) | Subscription / key | Curated citation index | `WOS_API_KEY` |
| Google Scholar | No official API | Not harvested. Third-party scrapers break Google's terms. The profile stores the Scholar ID as a link only. | — |

The **Barcelona Declaration on Open Research Information (2024)** recommends open sources. Following it, the defaults are open: OpenAlex for harvesting and citation refresh. Paid sources plug in when the university holds a subscription.

### 2.4 Responsible research assessment

| Framework | Implication for design |
|---|---|
| **DORA** (San Francisco Declaration on Research Assessment, 2012) | Journal impact factors are not shown as a measure of individual quality. |
| **Leiden Manifesto** (2015) | Metrics are transparent: definitions appear on the Showcase, and the underlying data can be exported. Quantitative data supports judgement and does not replace it. |
| **CoARA**: Agreement on Reforming Research Assessment (2022) | Activities that are not publications (supervision, peer review, editorial work, outreach, grants, awards) are recorded as first-class items. |
| **Snowball Metrics** | Showcase definitions for scholarly output, citation count, open-access share and international collaboration share. |

The profile shows an h-index labelled "in this repository". It is useful for self-monitoring but should not be used to compare people across fields. Consider hiding it if the university adopts a CoARA action plan.

### 2.5 Governance, security and privacy

| Area | Standard / practice | Implementation |
|---|---|---|
| Data validation | CRIS "validator" role (Pure, Converis) | Nothing reaches the permanent tables until a direct manager approves it. Every transition is written to `approval_events`. |
| Separation of duties | Four-eyes principle | Staff cannot approve their own submissions. If the only approver in a unit is the submitter, the item **escalates** to the parent unit. |
| Shared approval duty | Role-based approval | Several people can hold the same position. All of them see the queue, and the first decision counts (optimistic locking prevents double decisions). |
| Authentication | SSO / OIDC | Clerk, which supports Google / Microsoft SAML and OIDC. A development-only mode is refused in production. |
| Personal data | **Oman Personal Data Protection Law** (Royal Decree 6/2022); GDPR principles | Public profiles are opt-out (`profilePublic`). Emails and staff numbers are never exposed publicly. Records can be marked internal. *Review with the university's legal office.* |
| Application security | OWASP ASVS | Parameterised SQL (Drizzle); input sanitisation; CSV formula-injection guard; API keys only in server environment variables; services can be switched off. |
| Accessibility | **WCAG 2.2 AA** | Semantic landmarks, labelled controls, keyboard-reachable actions, dark mode, and colour never used alone (see §3). |

## 3. Visualisation standard used for dashboards

The Showcase and profile charts follow a published data-visualisation method. The rules:

1. **Pick the form before the colour.** Single numbers become stat tiles with one hero figure. Change over time is a column chart. Rankings are horizontal bar lists sorted by value. Pie charts and dual-axis charts are not used.
2. **Categorical colour in a fixed, validated order.** The four output-type slots (blue, orange, aqua, yellow) were checked with a colour-vision-deficiency (CVD) validator. Worst adjacent pair: ΔE 9.1 in light mode and 8.4 in dark mode, against a target of at least 8. Dark mode uses its own validated steps.
3. **One series, one colour.** Unit, country and open-access lists use a single hue. The data does not get a rainbow.
4. **Identity is never colour-only.** Every multi-series chart has a legend and a **Table** toggle. Light-mode aqua and yellow fall below 3:1 contrast, so the table view is required, not optional.
5. **Thin marks, recessive axes.** Bars are at most 24 px wide with 4 px rounded data ends. Stacked segments are separated by the surface colour. Gridlines are hairlines. Labels use text colours, never series colours.
6. **Hover adds detail but is never needed.** Tooltips show the value first. Every value is also in the table view or in a direct label.
7. **Official palettes where they exist.** SDG tiles use the UN SDG colours, always together with the goal number and title.
8. **Scope filters sit in one row above everything they affect.** The college/unit selector re-scopes every tile and chart on the Showcase.

## 4. Requirements traceability

| Requirement | Where it is implemented |
|---|---|
| Benchmark for research platforms that store, retrieve and present university research | This document |
| Ranking dashboard as a service | `ranking` and `ranking_ai` services (`/dashboard`, `/ranking`, `/arab-ranking`, `/world-ranking`) |
| Search names, add their research to the repository and their page, free and paid methods | Harvest wizard (portfolio and admin) using OpenAlex, ORCID, Crossref, Semantic Scholar, Scopus and WoS; scheduled auto-harvest; DOI look-up |
| One database, one page per person | PostgreSQL `research_outputs` / `activities` plus `/researchers/:slug` profile pages |
| Seminars, conferences, grants, awards and other academic activities | 21 activity types in 4 groups (events, funding & recognition, academic service, engagement) |
| Direct-manager approval before permanent storage or profile display | `submissions` staging → `approve()` materialises the record; audit trail in `approval_events` |
| Colleges / departments / units created, managed and assigned | Organisation admin with a hierarchical tree, unit codes, ROR IDs and member assignment |
| Several people in the same position to ease approval | `positions` + `position_assignments` (many holders); subtree scope for deans |
| University showcase with statistics | `/showcase`: KPIs, output trend, units, open access, SDGs, collaboration, themes, highlights, awards, grants, talks |
| Everything as a service that can be enabled or disabled | `platform_services` table, Services admin page, `requireService()` API guard, UI hides disabled features |

## 5. Gaps and roadmap (prioritised)

1. **Email notifications.** Tell approvers about new items and staff about decisions. Add a weekly digest.
2. **Approver delegation and out-of-office.** Temporary hand-over of approval duties.
3. **Arabic interface (RTL)** for the whole UI. Arabic names and unit names are already stored.
4. **CERIF-XML / OpenAIRE CRIS export** and **schema.org JSON-LD** on public pages for search engines.
5. **Full-text deposit.** Upload accepted manuscripts, with embargo and licence (green open access), and COAR Notify.
6. **ORCID member API.** Write approved works back to staff ORCID records.
7. **Grant lifecycle (pre-award).** Proposals, budgets and reporting deadlines as a separate service.
8. **Duplicate-merge tool** for administrators, and **field-normalised metrics** (requires SciVal / InCites data).
9. **Scheduled PDF reports** per college for annual reviews and accreditation.
