import { Router, type Request, type Response } from "express";
import { db, researchOutputs } from "@workspace/db";
import { and, asc, eq, gte, lte, type SQL } from "drizzle-orm";
import { requireService } from "../../lib/services";
import { asyncHandler } from "../../lib/util";

/**
 * Minimal OAI-PMH 2.0 data provider (oai_dc) for public research outputs,
 * so aggregators (OpenAIRE, BASE, CORE, Google Scholar) can harvest the repository.
 */
const router = Router();
const PAGE = 100;

const x = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const repoId = (req: Request) => process.env["OAI_REPOSITORY_IDENTIFIER"] || req.hostname || "localhost";
const iso = (d: Date | null | undefined) => (d ?? new Date(0)).toISOString().replace(/\.\d{3}Z$/, "Z");

const COAR: Record<string, string> = {
  journal_article: "http://purl.org/coar/resource_type/c_6501", conference_paper: "http://purl.org/coar/resource_type/c_5794",
  book: "http://purl.org/coar/resource_type/c_2f33", book_chapter: "http://purl.org/coar/resource_type/c_3248",
  review_article: "http://purl.org/coar/resource_type/c_dcae04bc", preprint: "http://purl.org/coar/resource_type/c_816b",
  dataset: "http://purl.org/coar/resource_type/c_ddb1", software: "http://purl.org/coar/resource_type/c_5ce6",
  patent: "http://purl.org/coar/resource_type/c_15cd", thesis: "http://purl.org/coar/resource_type/c_46ec",
  report: "http://purl.org/coar/resource_type/c_93fc", editorial: "http://purl.org/coar/resource_type/c_b239",
  other: "http://purl.org/coar/resource_type/c_1843",
};

function envelope(req: Request, verb: string, body: string, params: Record<string, string>) {
  const attrs = Object.entries(params).filter(([k]) => ["verb", "identifier", "metadataPrefix", "from", "until", "set", "resumptionToken"].includes(k))
    .map(([k, v]) => ` ${k}="${x(v)}"`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/ http://www.openarchives.org/OAI/2.0/OAI-PMH.xsd">
<responseDate>${iso(new Date())}</responseDate>
<request${attrs}>${x(`${req.protocol}://${req.get("host")}${req.baseUrl}${req.path}`)}</request>
${body}
</OAI-PMH>`;
}

const err = (code: string, msg: string) => `<error code="${code}">${x(msg)}</error>`;

function header(req: Request, o: typeof researchOutputs.$inferSelect) {
  return `<header><identifier>oai:${x(repoId(req))}:output/${o.id}</identifier><datestamp>${iso(o.updatedAt)}</datestamp></header>`;
}

function dc(o: typeof researchOutputs.$inferSelect) {
  const f = (tag: string, v: unknown) => (v ? `<dc:${tag}>${x(v)}</dc:${tag}>` : "");
  return `<metadata><oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" xmlns:dc="http://purl.org/dc/elements/1.1/"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/oai_dc/ http://www.openarchives.org/OAI/2.0/oai_dc.xsd">
${f("title", o.title)}${o.authors.map((a) => f("creator", a.name)).join("")}${o.keywords.map((k) => f("subject", k)).join("")}
${f("description", o.abstract)}${f("publisher", o.publisher)}${f("date", o.publicationDate ?? o.publicationYear)}
${f("type", COAR[o.type] ?? COAR.other)}${f("identifier", o.doi ? `https://doi.org/${o.doi}` : o.url)}${f("source", o.venue)}
${f("language", o.language)}${f("rights", ["gold", "diamond", "green", "hybrid", "bronze"].includes(o.oaStatus) ? "info:eu-repo/semantics/openAccess" : "info:eu-repo/semantics/restrictedAccess")}
</oai_dc:dc></metadata>`;
}

router.get("/oai", requireService("oai_pmh"), asyncHandler(async (req: Request, res: Response) => {
  const params = Object.fromEntries(Object.entries(req.query).map(([k, v]) => [k, String(v)]));
  const verb = params.verb;
  res.type("text/xml");
  const send = (body: string) => res.send(envelope(req, verb ?? "", body, params));

  if (verb === "Identify") {
    const [first] = await db.select({ d: researchOutputs.updatedAt }).from(researchOutputs).orderBy(asc(researchOutputs.updatedAt)).limit(1);
    return send(`<Identify><repositoryName>${x(process.env["INSTITUTION_NAME"] || "Institutional Research Repository")}</repositoryName>
<baseURL>${x(`${req.protocol}://${req.get("host")}${req.baseUrl}/oai`)}</baseURL><protocolVersion>2.0</protocolVersion>
<adminEmail>${x(process.env["HARVEST_CONTACT_EMAIL"] || "admin@example.org")}</adminEmail>
<earliestDatestamp>${iso(first?.d)}</earliestDatestamp><deletedRecord>no</deletedRecord><granularity>YYYY-MM-DDThh:mm:ssZ</granularity></Identify>`);
  }
  if (verb === "ListMetadataFormats") {
    return send(`<ListMetadataFormats><metadataFormat><metadataPrefix>oai_dc</metadataPrefix>
<schema>http://www.openarchives.org/OAI/2.0/oai_dc.xsd</schema><metadataNamespace>http://www.openarchives.org/OAI/2.0/oai_dc/</metadataNamespace></metadataFormat></ListMetadataFormats>`);
  }
  if (verb === "ListSets") return send(err("noSetHierarchy", "This repository does not support sets"));
  if (verb === "GetRecord") {
    if (params.metadataPrefix !== "oai_dc") return send(err("cannotDisseminateFormat", "Only oai_dc is supported"));
    const id = Number(params.identifier?.split("/").pop());
    const [o] = Number.isInteger(id)
      ? await db.select().from(researchOutputs).where(and(eq(researchOutputs.id, id), eq(researchOutputs.visibility, "public")))
      : [];
    if (!o) return send(err("idDoesNotExist", "Unknown identifier"));
    return send(`<GetRecord><record>${header(req, o)}${dc(o)}</record></GetRecord>`);
  }
  if (verb === "ListRecords" || verb === "ListIdentifiers") {
    let offset = 0;
    let from = params.from;
    let until = params.until;
    if (params.resumptionToken) {
      try {
        const t = JSON.parse(Buffer.from(params.resumptionToken, "base64url").toString());
        offset = Number(t.o) || 0;
        from = t.f;
        until = t.u;
      } catch {
        return send(err("badResumptionToken", "Invalid token"));
      }
    } else if (params.metadataPrefix !== "oai_dc") {
      return send(err("cannotDisseminateFormat", "Only oai_dc is supported"));
    }
    const conds: SQL[] = [eq(researchOutputs.visibility, "public")];
    if (from) conds.push(gte(researchOutputs.updatedAt, new Date(from)));
    if (until) conds.push(lte(researchOutputs.updatedAt, new Date(until.length === 10 ? `${until}T23:59:59Z` : until)));
    const rows = await db.select().from(researchOutputs).where(and(...conds)).orderBy(asc(researchOutputs.id)).limit(PAGE + 1).offset(offset);
    if (!rows.length) return send(err("noRecordsMatch", "No records match"));
    const more = rows.length > PAGE;
    const items = rows.slice(0, PAGE).map((o) => (verb === "ListRecords" ? `<record>${header(req, o)}${dc(o)}</record>` : header(req, o))).join("\n");
    const token = more ? Buffer.from(JSON.stringify({ o: offset + PAGE, f: from, u: until })).toString("base64url") : "";
    return send(`<${verb}>${items}<resumptionToken cursor="${offset}">${token}</resumptionToken></${verb}>`);
  }
  return send(err("badVerb", "Illegal OAI verb"));
}));

export default router;
