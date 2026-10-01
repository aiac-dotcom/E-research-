import { Link } from "wouter";
import { BookOpen, CheckSquare, Sparkles, DownloadCloud, Building2, GraduationCap } from "lucide-react";
import { useService } from "@/lib/services";

export default function Home() {
  const showcase = useService("showcase");
  const profiles = useService("profiles");
  const name = import.meta.env.VITE_INSTITUTION_NAME || "the University";
  const features = [
    { icon: BookOpen, title: "One research repository", text: "Publications, grants, awards, seminars and conferences for every staff member in one database." },
    { icon: DownloadCloud, title: "Automatic discovery", text: "Records are harvested from OpenAlex, ORCID, Crossref, Semantic Scholar, Scopus and Web of Science." },
    { icon: CheckSquare, title: "Manager approval", text: "Nothing is stored permanently or published until the direct manager approves it." },
    { icon: Building2, title: "Organisation aware", text: "Colleges, departments and units, with shared positions so several people can approve." },
    { icon: Sparkles, title: "University showcase", text: "Public statistics, SDG contribution, collaboration and highlights for the whole university." },
    { icon: GraduationCap, title: "Ranking intelligence", text: "QS World and Arab ranking analytics, peer comparison and what-if simulation." },
  ];
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="max-w-3xl space-y-6">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">Research information platform</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Research at {name}, in one trusted place.</h1>
        <p className="text-lg leading-relaxed text-muted-foreground">
          Staff record and discover their research and academic activities; managers approve; the university presents verified
          results to the world.
        </p>
        <div className="flex flex-wrap gap-3">
          {showcase && <Link href="/showcase" className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">Explore the showcase</Link>}
          {profiles && <Link href="/researchers" className="rounded-md border px-5 py-2.5 text-sm font-medium hover:bg-muted">Find a researcher</Link>}
          <Link href="/sign-in" className="rounded-md border px-5 py-2.5 text-sm font-medium hover:bg-muted">Staff sign in</Link>
        </div>
      </div>
      <ul className="mt-16 grid gap-6 border-t pt-10 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <li key={f.title} className="space-y-2">
            <f.icon className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="font-semibold">{f.title}</h2>
            <p className="text-sm text-muted-foreground">{f.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
