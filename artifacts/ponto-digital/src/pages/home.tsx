import { Link } from "wouter";
import { Clock, Play, ArrowRight, Activity, ShieldCheck } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground font-sans">
      <header className="px-6 lg:px-10 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary">
          <Clock className="w-6 h-6" />
          <span className="font-semibold text-lg tracking-tight text-foreground">Ponto Digital</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/sign-in" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Entrar
          </Link>
          <Link href="/sign-up" className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90">
            Começar
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center max-w-3xl mx-auto py-12 lg:py-24">
        <div className="inline-flex items-center rounded-full border border-border px-3 py-1 text-sm text-muted-foreground mb-8">
          <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse"></span>
          Foque no que importa
        </div>
        
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-semibold tracking-tight mb-6">
          Seu tempo, <br className="hidden sm:block" />
          <span className="text-muted-foreground">registrado em segundos.</span>
        </h1>
        
        <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl">
          Um rastreador de tempo pessoal rápido, calmo e seguro. 
          Sem complexidade corporativa, apenas o controle que você precisa para suas sessões de trabalho.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Link href="/sign-up" className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-base font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90">
            Criar conta grátis
            <ArrowRight className="ml-2 w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mt-24 text-left border-t border-border pt-12">
          <div>
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-primary mb-4">
              <Play className="w-5 h-5 ml-0.5" />
            </div>
            <h3 className="font-medium text-lg mb-2">Um clique</h3>
            <p className="text-sm text-muted-foreground">Inicie e encerre suas sessões de trabalho instantaneamente, sem preencher formulários longos.</p>
          </div>
          <div>
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-primary mb-4">
              <Activity className="w-5 h-5" />
            </div>
            <h3 className="font-medium text-lg mb-2">Visão Clara</h3>
            <p className="text-sm text-muted-foreground">Acompanhe seus totais diários, semanais e mensais em um painel sem distrações.</p>
          </div>
          <div>
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-primary mb-4">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="font-medium text-lg mb-2">Confiável e Pessoal</h3>
            <p className="text-sm text-muted-foreground">Seus dados pertencem a você. Uma interface calma desenhada para indivíduos, não para RH corporativo.</p>
          </div>
        </div>
      </main>

      <footer className="py-6 text-center text-sm text-muted-foreground border-t border-border">
        &copy; {new Date().getFullYear()} Ponto Digital. Uma ferramenta de produtividade.
      </footer>
    </div>
  );
}
