import type { ComponentType, ReactNode } from "react";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "sonner";

import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, SignedIn, SignedOut, useIdentityKey } from "@/lib/auth";
import { ServicesProvider, useService, useServices } from "@/lib/services";

import Home from "@/pages/home";
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import Dashboard from "@/pages/dashboard";
import Upload from "@/pages/upload";
import Ranking from "@/pages/ranking";
import ArabRanking from "@/pages/arab-ranking";
import WorldRanking from "@/pages/world-ranking";
import Portfolio from "@/pages/research/portfolio";
import Approvals from "@/pages/research/approvals";
import Repository from "@/pages/research/repository";
import Showcase from "@/pages/research/showcase";
import { PeopleDirectory, ProfilePage } from "@/pages/research/people";
import OrgAdmin from "@/pages/admin/org";
import PeopleAdmin from "@/pages/admin/people";
import HarvestAdmin from "@/pages/admin/harvest";
import ServicesAdmin from "@/pages/admin/services";
import AppLayout from "@/components/layout/AppLayout";
import PublicLayout from "@/components/layout/PublicLayout";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

function CacheInvalidator() {
  const qc = useQueryClient();
  useIdentityKey(() => qc.clear());
  return null;
}

function ServiceOff() {
  return (
    <div className="flex flex-1 items-center justify-center p-10 text-center">
      <div>
        <h1 className="text-xl font-semibold">This service is switched off</h1>
        <p className="mt-1 text-sm text-muted-foreground">An administrator can enable it under Administration → Services.</p>
      </div>
    </div>
  );
}

/** Signed-in page inside the application shell; optionally gated by a service flag. */
function Protected({ component: C, service }: { component: ComponentType; service?: string }) {
  const { loaded } = useServices();
  const on = useService(service ?? "");
  return (
    <>
      <SignedIn>
        <AppLayout>{service && loaded && !on ? <ServiceOff /> : <C />}</AppLayout>
      </SignedIn>
      <SignedOut><Redirect to="/sign-in" /></SignedOut>
    </>
  );
}

/** Public page: app shell for signed-in staff, public shell for visitors. */
function PublicPage({ children, service }: { children: ReactNode; service: string }) {
  const { loaded } = useServices();
  const on = useService(service);
  const body = loaded && !on ? <ServiceOff /> : children;
  return (
    <>
      <SignedIn><AppLayout>{body}</AppLayout></SignedIn>
      <SignedOut><PublicLayout>{body}</PublicLayout></SignedOut>
    </>
  );
}

function HomeRedirect() {
  return (
    <>
      <SignedIn><Redirect to="/portfolio" /></SignedIn>
      <SignedOut><PublicLayout><Home /></PublicLayout></SignedOut>
    </>
  );
}

function Routes() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in">
        <SignedIn><Redirect to="/portfolio" /></SignedIn>
        <SignedOut><SignInPage /></SignedOut>
      </Route>
      <Route path="/sign-in/:rest*" component={SignInPage} />
      <Route path="/sign-up" component={SignUpPage} />
      <Route path="/sign-up/:rest*" component={SignUpPage} />

      <Route path="/showcase"><PublicPage service="showcase"><Showcase /></PublicPage></Route>
      <Route path="/researchers"><PublicPage service="profiles"><PeopleDirectory /></PublicPage></Route>
      <Route path="/researchers/:slug"><PublicPage service="profiles"><ProfilePage /></PublicPage></Route>

      <Route path="/portfolio"><Protected component={Portfolio} /></Route>
      <Route path="/approvals"><Protected component={Approvals} /></Route>
      <Route path="/repository"><Protected component={Repository} service="research_repository" /></Route>
      <Route path="/admin/org"><Protected component={OrgAdmin} /></Route>
      <Route path="/admin/people"><Protected component={PeopleAdmin} /></Route>
      <Route path="/admin/harvest"><Protected component={HarvestAdmin} service="harvesting" /></Route>
      <Route path="/admin/services"><Protected component={ServicesAdmin} /></Route>

      <Route path="/dashboard"><Protected component={Dashboard} service="ranking" /></Route>
      <Route path="/ranking"><Protected component={Ranking} service="ranking" /></Route>
      <Route path="/arab-ranking"><Protected component={ArabRanking} service="ranking" /></Route>
      <Route path="/world-ranking"><Protected component={WorldRanking} service="ranking" /></Route>
      <Route path="/upload"><Protected component={Upload} service="qa" /></Route>

      <Route>
        <div className="flex h-screen items-center justify-center">
          <h1 className="text-2xl font-bold">404 - Not Found</h1>
        </div>
      </Route>
    </Switch>
  );
}

function Providers() {
  const [, setLocation] = useLocation();
  return (
    <AuthProvider navigate={(to, replace) => setLocation(stripBase(to), { replace })}>
      <QueryClientProvider client={queryClient}>
        <ServicesProvider>
          <TooltipProvider>
            <CacheInvalidator />
            <Routes />
            <Toaster richColors closeButton position="top-right" />
          </TooltipProvider>
        </ServicesProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <WouterRouter base={basePath}>
      <Providers />
    </WouterRouter>
  );
}
