import { Link, useLocation } from "wouter";
import { useClerk } from "@clerk/react";
import { Clock, History, LayoutDashboard, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { signOut } = useClerk();

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 flex min-h-16 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-background/95 backdrop-blur px-4 py-3 sm:flex-nowrap sm:px-6 lg:px-10">
        <div className="flex items-center gap-2 sm:mr-6 text-primary">
          <Clock className="w-5 h-5" />
          <span className="font-semibold tracking-tight text-foreground">Ponto Digital</span>
        </div>

        <nav className="order-3 flex w-full items-center justify-center gap-6 text-sm font-medium sm:order-none sm:w-auto sm:flex-1 sm:justify-start">
          <Link
            href="/dashboard"
            className={cn(
              "transition-colors hover:text-foreground/80",
              location === "/dashboard" ? "text-foreground" : "text-muted-foreground"
            )}
          >
            <span className="flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4" />
              <span>Painel</span>
            </span>
          </Link>
          <Link
            href="/history"
            className={cn(
              "transition-colors hover:text-foreground/80",
              location === "/history" ? "text-foreground" : "text-muted-foreground"
            )}
          >
            <span className="flex items-center gap-2">
              <History className="w-4 h-4" />
              <span>Histórico</span>
            </span>
          </Link>
        </nav>

        <button
          type="button"
          onClick={() => signOut({ redirectUrl: import.meta.env.BASE_URL })}
          className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          aria-label="Sair da conta"
          title="Sair"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      <main className="flex-1 overflow-auto flex flex-col py-8 px-6 lg:px-10 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
