import { db, orgUnits, positions, positionAssignments, people } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import type { Person } from "./auth";

type Unit = { id: number; parentId: number | null; name: string; type: string };
type Holder = { personId: number; positionId: number; orgUnitId: number; scope: "unit" | "subtree"; title: string };

export type OrgSnapshot = { units: Map<number, Unit>; holders: Holder[]; adminIds: number[] };

export async function orgSnapshot(): Promise<OrgSnapshot> {
  const [unitRows, holderRows, adminRows] = await Promise.all([
    db.select({ id: orgUnits.id, parentId: orgUnits.parentId, name: orgUnits.name, type: orgUnits.type }).from(orgUnits),
    db.select({
      personId: positionAssignments.personId,
      positionId: positions.id,
      orgUnitId: positions.orgUnitId,
      scope: positions.approvalScope,
      title: positions.title,
    })
      .from(positionAssignments)
      .innerJoin(positions, eq(positions.id, positionAssignments.positionId))
      .innerJoin(people, eq(people.id, positionAssignments.personId))
      .where(and(
        eq(positionAssignments.active, true),
        eq(positions.isApprover, true),
        eq(people.active, true),
        sql`(${positionAssignments.endDate} is null or ${positionAssignments.endDate} >= current_date)`,
        sql`(${positionAssignments.startDate} is null or ${positionAssignments.startDate} <= current_date)`,
      )),
    db.select({ id: people.id }).from(people).where(and(eq(people.systemRole, "admin"), eq(people.active, true))),
  ]);
  return {
    units: new Map(unitRows.map((u) => [u.id, u])),
    holders: holderRows,
    adminIds: adminRows.map((a) => a.id),
  };
}

/** [unit, parent, grandparent, ...] guarding against cycles. */
export function ancestry(snap: OrgSnapshot, unitId: number | null | undefined): number[] {
  const chain: number[] = [];
  let cur = unitId ?? null;
  while (cur !== null && !chain.includes(cur)) {
    chain.push(cur);
    cur = snap.units.get(cur)?.parentId ?? null;
  }
  return chain;
}

export function descendants(snap: OrgSnapshot, unitId: number): number[] {
  const out = [unitId];
  for (let i = 0; i < out.length; i++) {
    for (const u of snap.units.values()) if (u.parentId === out[i] && !out.includes(u.id)) out.push(u.id);
  }
  return out;
}

export type Routing = { level: "unit" | "escalated" | "admin"; unitId: number | null; approverIds: number[] };

/**
 * Direct-manager routing. Approvers for a unit are everyone holding an approver
 * position in that unit plus holders of "subtree" positions in any ancestor.
 * If nobody (other than the submitter) qualifies, the item escalates to the
 * parent unit, and finally to system administrators.
 */
export function routeApproval(snap: OrgSnapshot, unitId: number | null, submitterId: number): Routing {
  const chain = ancestry(snap, unitId);
  for (let i = 0; i < chain.length; i++) {
    const u = chain[i];
    const above = chain.slice(i + 1);
    const ids = new Set<number>();
    for (const h of snap.holders) {
      if (h.orgUnitId === u || (h.scope === "subtree" && above.includes(h.orgUnitId))) ids.add(h.personId);
    }
    ids.delete(submitterId);
    if (ids.size) return { level: i === 0 ? "unit" : "escalated", unitId: u, approverIds: [...ids] };
  }
  return { level: "admin", unitId: null, approverIds: snap.adminIds.filter((id) => id !== submitterId) };
}

export function canApprove(snap: OrgSnapshot, actor: Person, sub: { orgUnitId: number | null; personId: number }): boolean {
  if (actor.systemRole === "admin") return true;
  if (actor.id === sub.personId) return false;
  return routeApproval(snap, sub.orgUnitId, sub.personId).approverIds.includes(actor.id);
}

/** Positions the actor holds that grant approval rights (for UI display). */
export function heldApproverPositions(snap: OrgSnapshot, personId: number) {
  return snap.holders.filter((h) => h.personId === personId).map((h) => ({
    ...h,
    unitName: snap.units.get(h.orgUnitId)?.name ?? "",
  }));
}
