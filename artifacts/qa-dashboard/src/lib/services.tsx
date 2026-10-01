import { createContext, useContext, type ReactNode } from "react";
import { useApi } from "./api";

type Svc = { key: string; name: string; group: string; enabled: boolean };
type Ctx = { loaded: boolean; services: Svc[]; authMode: string };
const ServicesContext = createContext<Ctx>({ loaded: false, services: [], authMode: "clerk" });

export function ServicesProvider({ children }: { children: ReactNode }) {
  const q = useApi<{ services: Svc[]; authMode: string }>("/services", { staleTime: 30_000 });
  return (
    <ServicesContext.Provider value={{ loaded: q.isSuccess, services: q.data?.services ?? [], authMode: q.data?.authMode ?? "clerk" }}>
      {children}
    </ServicesContext.Provider>
  );
}

export function useServices() {
  return useContext(ServicesContext);
}

export function useService(key: string): boolean {
  return Boolean(useContext(ServicesContext).services.find((s) => s.key === key)?.enabled);
}
