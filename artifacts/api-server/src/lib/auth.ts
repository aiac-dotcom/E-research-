import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db, people } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { slugify } from "./util";

export type Person = typeof people.$inferSelect;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      person?: Person | null;
    }
  }
}

/**
 * AUTH_MODE=clerk (default) authenticates with Clerk.
 * AUTH_MODE=dev trusts an `x-dev-user` email header; it exists for local
 * evaluation without a Clerk account and is refused in production.
 */
export const AUTH_MODE = process.env["AUTH_MODE"] === "dev" ? "dev" : "clerk";

if (AUTH_MODE === "dev" && process.env["NODE_ENV"] === "production") {
  throw new Error("AUTH_MODE=dev must never be used with NODE_ENV=production.");
}

const adminEmails = new Set(
  (process.env["ADMIN_EMAILS"] ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
);
const allowedDomains = (process.env["ALLOWED_EMAIL_DOMAINS"] ?? "")
  .split(",").map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);

function mayAutoProvision(email: string): boolean {
  if (adminEmails.has(email)) return true;
  const domain = email.split("@")[1] ?? "";
  return allowedDomains.includes(domain);
}

async function findByEmail(email: string): Promise<Person | undefined> {
  const [p] = await db.select().from(people).where(sql`lower(${people.email}) = ${email}`).limit(1);
  return p;
}

async function provision(email: string, name: string, authUserId: string | null): Promise<Person> {
  const base = slugify(name || email.split("@")[0] || "person");
  let slug = base;
  for (let i = 2; ; i++) {
    const [taken] = await db.select({ id: people.id }).from(people).where(eq(people.slug, slug)).limit(1);
    if (!taken) break;
    slug = `${base}-${i}`;
  }
  const [created] = await db.insert(people).values({
    email,
    fullName: name || email,
    slug,
    authUserId,
    systemRole: adminEmails.has(email) ? "admin" : "staff",
  }).returning();
  return created;
}

async function ensureAdminFlag(p: Person): Promise<Person> {
  if (adminEmails.has(p.email.toLowerCase()) && p.systemRole !== "admin") {
    const [u] = await db.update(people).set({ systemRole: "admin" }).where(eq(people.id, p.id)).returning();
    return u;
  }
  return p;
}

async function resolveDev(req: Request): Promise<Person | null> {
  const email = String(req.header("x-dev-user") ?? "").trim().toLowerCase();
  if (!email) return null;
  const existing = await findByEmail(email);
  if (existing) return ensureAdminFlag(existing);
  if (!mayAutoProvision(email)) return null;
  return provision(email, "", null);
}

async function resolveClerk(req: Request): Promise<Person | null> {
  const { userId } = getAuth(req);
  if (!userId) return null;
  const [linked] = await db.select().from(people).where(eq(people.authUserId, userId)).limit(1);
  if (linked) return ensureAdminFlag(linked);

  const user = await clerkClient.users.getUser(userId);
  const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) ?? user.emailAddresses[0];
  // Only verified addresses may claim an existing staff record.
  if (!primary || primary.verification?.status !== "verified") return null;
  const email = primary.emailAddress.toLowerCase();
  const existing = await findByEmail(email);
  if (existing) {
    if (existing.authUserId && existing.authUserId !== userId) return null;
    const [u] = await db.update(people).set({ authUserId: userId }).where(eq(people.id, existing.id)).returning();
    return ensureAdminFlag(u);
  }
  if (!mayAutoProvision(email)) return null;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return provision(email, name, userId);
}

/** Resolves (and caches on req) the signed-in person; null for anonymous or unregistered users. */
export async function currentPerson(req: Request): Promise<Person | null> {
  if (req.person !== undefined) return req.person;
  req.person = AUTH_MODE === "dev" ? await resolveDev(req) : await resolveClerk(req);
  if (req.person && !req.person.active) req.person = null;
  return req.person;
}

/** True when the request carries a valid login, even if no staff record is linked. */
export function isAuthenticated(req: Request): boolean {
  if (AUTH_MODE === "dev") return Boolean(req.header("x-dev-user"));
  return Boolean(getAuth(req).userId);
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  try {
    const p = await currentPerson(req);
    if (!p) {
      res.status(isAuthenticated(req) ? 403 : 401).json({
        error: isAuthenticated(req)
          ? "Your account is not registered as a staff member. Ask an administrator to add your email."
          : "Unauthorized",
      });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const p = await currentPerson(req);
    if (!p) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (p.systemRole !== "admin") {
      res.status(403).json({ error: "Administrator role required" });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}

/** Login check only (no staff record needed) — used by the ranking dashboard. */
export function requireLogin(req: Request, res: Response, next: NextFunction) {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

/** Opaque login id for audit fields (Clerk user id, or the dev email). */
export function authUserId(req: Request): string | null {
  if (AUTH_MODE === "dev") return req.header("x-dev-user") ?? null;
  return getAuth(req).userId ?? null;
}
