import { useApi } from "./api";

export type Person = {
  id: number; slug: string; email: string; fullName: string; fullNameAr: string | null; nameVariants: string[];
  honorific: string | null; academicRank: string | null; jobTitle: string | null; staffNumber: string | null;
  orgUnitId: number | null; systemRole: "admin" | "staff"; orcid: string | null; scopusAuthorId: string | null;
  wosResearcherId: string | null; openalexAuthorId: string | null; semanticScholarId: string | null;
  googleScholarId: string | null; bio: string | null; researchInterests: string[]; photoUrl: string | null;
  website: string | null; profilePublic: boolean; active: boolean; lastHarvestedAt: string | null;
};

export type Me = {
  person: Person;
  unit: { id: number; name: string; type: string } | null;
  approverPositions: { positionId: number; title: string; unitName: string; scope: string }[];
  isApprover: boolean;
  toReview: number;
  mySubmissionCounts: Record<string, number>;
  myApprovers: { level: string; people: { id: number; fullName: string }[] };
};

export function useMe() {
  return useApi<Me>("/me", { retry: false, staleTime: 15_000 });
}
