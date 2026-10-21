import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import {
  getGetDashboardQueryKey,
  getGetSummaryQueryKey,
  getListProjectsQueryKey,
  getListServicesQueryKey,
  useCreateProject,
  useCreateService,
  useFinishService,
  useGetDashboard,
  useListProjects,
  useToggleServicePause,
} from "@workspace/api-client-react";
import { LiveTimer, formatStaticDuration } from "@/components/live-timer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays,
  CalendarRange,
  Clock,
  FolderPlus,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Square,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Dashboard() {
  const {
    data: dashboard,
    dataUpdatedAt: dashboardUpdatedAt,
    isLoading,
    error,
  } = useGetDashboard();
  const { data: projects, isLoading: projectsLoading } = useListProjects();
  const createProject = useCreateProject();
  const createService = useCreateService();
  const finishService = useFinishService();
  const togglePause = useToggleServicePause();
  const queryClient = useQueryClient();

  const [projectId, setProjectId] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [description, setDescription] = useState("");
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!projectId && projects?.length) {
      setProjectId(String(projects[0].id));
    }
  }, [projectId, projects]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
  };

  const handleCreateProject = (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectTitle.trim()) return;
    setFeedback("");
    createProject.mutate(
      {
        data: {
          title: projectTitle.trim(),
          description: projectDescription.trim(),
        },
      },
      {
        onSuccess: (project) => {
          setProjectId(String(project.id));
          setProjectTitle("");
          setProjectDescription("");
          setShowProjectForm(false);
          invalidateAll();
        },
        onError: () =>
          setFeedback(
            "Não foi possível criar o projeto. Verifique se esse nome já existe.",
          ),
      },
    );
  };

  const handleStart = (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectId) return;
    setFeedback("");
    createService.mutate(
      {
        data: {
          projectId: Number(projectId),
          subtitle: subtitle.trim(),
          description: description.trim(),
        },
      },
      {
        onSuccess: () => {
          setSubtitle("");
          setDescription("");
          invalidateAll();
        },
        onError: () =>
          setFeedback("Não foi possível iniciar o período. Tente novamente."),
      },
    );
  };

  const handleStop = (id: number) => {
    finishService.mutate(
      { id },
      {
        onSuccess: invalidateAll,
        onError: () =>
          setFeedback("Não foi possível finalizar o período. Tente novamente."),
      },
    );
  };

  const handlePause = (id: number, action: "pause" | "resume") => {
    togglePause.mutate(
      { id, data: { action } },
      {
        onSuccess: invalidateAll,
        onError: () =>
          setFeedback("Não foi possível alterar a pausa. Tente novamente."),
      },
    );
  };

  if (isLoading || projectsLoading) {
    return (
      <Layout>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (error || !dashboard) {
    return (
      <Layout>
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-destructive">
          Erro ao carregar o painel.
        </div>
      </Layout>
    );
  }

  const active = dashboard.active;
  const isPaused = active?.status === "paused";

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Controle pessoal
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Seu ponto de trabalho
            </h1>
          </div>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => setShowProjectForm((value) => !value)}
          >
            {showProjectForm ? (
              <X className="h-4 w-4" />
            ) : (
              <FolderPlus className="h-4 w-4" />
            )}
            {showProjectForm ? "Cancelar" : "Novo projeto"}
          </Button>
        </div>

        {showProjectForm && (
          <form
            onSubmit={handleCreateProject}
            className="grid gap-4 rounded-2xl border border-primary/25 bg-primary/[0.04] p-5 md:grid-cols-[1fr_1.4fr_auto]"
          >
            <div>
              <label
                htmlFor="project-title"
                className="mb-2 block text-sm font-medium"
              >
                Nome do projeto
              </label>
              <Input
                id="project-title"
                value={projectTitle}
                onChange={(event) => setProjectTitle(event.target.value)}
                placeholder="Ex.: Projeto 1"
                required
              />
            </div>
            <div>
              <label
                htmlFor="project-description"
                className="mb-2 block text-sm font-medium"
              >
                Descrição
                <span className="ml-1 text-muted-foreground">(opcional)</span>
              </label>
              <Input
                id="project-description"
                value={projectDescription}
                onChange={(event) => setProjectDescription(event.target.value)}
                placeholder="Contexto ou objetivo do projeto"
              />
            </div>
            <Button
              type="submit"
              className="self-end"
              disabled={!projectTitle.trim() || createProject.isPending}
            >
              {createProject.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Criar projeto
            </Button>
          </form>
        )}

        {feedback && (
          <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {feedback}
          </p>
        )}

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm lg:p-9">
          {active ? (
            <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto_auto]">
              <div className="min-w-0">
                <div
                  className={`mb-3 flex items-center gap-2 text-sm font-medium ${
                    isPaused ? "text-amber-400" : "text-primary"
                  }`}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      isPaused
                        ? "bg-amber-400"
                        : "animate-pulse bg-primary"
                    }`}
                  />
                  {isPaused ? "Período pausado" : "Período em andamento"}
                </div>
                <p className="mb-1 text-sm text-muted-foreground">
                  {active.projectTitle}
                </p>
                <h2 className="truncate text-2xl font-semibold">
                  {active.subtitle || "Período de trabalho"}
                </h2>
                {active.description && (
                  <p className="mt-2 text-muted-foreground">
                    {active.description}
                  </p>
                )}
              </div>

              <LiveTimer
                elapsedSeconds={active.elapsedSeconds}
                receivedAt={dashboardUpdatedAt}
                isPaused={isPaused}
                className={`text-center font-mono text-5xl font-medium tracking-tight md:text-6xl ${
                  isPaused ? "text-amber-300" : "text-foreground"
                }`}
              />

              <div className="grid w-full grid-cols-2 gap-3 lg:w-72">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 gap-2 rounded-xl"
                  onClick={() =>
                    handlePause(active.id, isPaused ? "resume" : "pause")
                  }
                  disabled={togglePause.isPending || finishService.isPending}
                >
                  {togglePause.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : isPaused ? (
                    <>
                      <RotateCcw className="h-5 w-5" />
                      Retomar
                    </>
                  ) : (
                    <>
                      <Pause className="h-5 w-5 fill-current" />
                      Pausar
                    </>
                  )}
                </Button>
                <Button
                  size="lg"
                  variant="destructive"
                  className="h-14 gap-2 rounded-xl"
                  onClick={() => handleStop(active.id)}
                  disabled={finishService.isPending || togglePause.isPending}
                >
                  {finishService.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Square className="h-5 w-5 fill-current" />
                      Finalizar
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : projects?.length ? (
            <form
              onSubmit={handleStart}
              className="grid items-end gap-4 md:grid-cols-[1fr_1fr_1.2fr_auto]"
            >
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Projeto
                </label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger className="h-12 rounded-xl bg-input/50">
                    <SelectValue placeholder="Selecione um projeto" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem
                        key={project.id}
                        value={String(project.id)}
                      >
                        {project.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label
                  htmlFor="subtitle"
                  className="mb-2 block text-sm font-medium"
                >
                  Subtítulo
                  <span className="ml-1 text-muted-foreground">(opcional)</span>
                </label>
                <Input
                  id="subtitle"
                  value={subtitle}
                  onChange={(event) => setSubtitle(event.target.value)}
                  placeholder="Ex.: Revisão da proposta"
                  className="h-12 rounded-xl bg-input/50"
                />
              </div>
              <div>
                <label
                  htmlFor="period-description"
                  className="mb-2 block text-sm font-medium"
                >
                  Descrição
                  <span className="ml-1 text-muted-foreground">(opcional)</span>
                </label>
                <Input
                  id="period-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Detalhes do período"
                  className="h-12 rounded-xl bg-input/50"
                />
              </div>
              <Button
                type="submit"
                size="lg"
                className="h-12 gap-2 rounded-xl px-7"
                disabled={!projectId || createService.isPending}
              >
                {createService.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Play className="h-5 w-5 fill-current" />
                )}
                Iniciar
              </Button>
            </form>
          ) : (
            <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-xl font-semibold">
                  Crie seu primeiro projeto
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Os períodos de trabalho ficarão organizados dentro dele.
                </p>
              </div>
              <Button
                type="button"
                className="gap-2"
                onClick={() => setShowProjectForm(true)}
              >
                <FolderPlus className="h-4 w-4" />
                Criar projeto
              </Button>
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[
            {
              label: "Hoje",
              icon: Clock,
              seconds: dashboard.summary.today.seconds,
            },
            {
              label: "Esta semana",
              icon: CalendarDays,
              seconds: dashboard.summary.week.seconds,
            },
            {
              label: "Este mês",
              icon: CalendarRange,
              seconds: dashboard.summary.month.seconds,
            },
            {
              label: "Total geral",
              icon: FolderPlus,
              seconds: dashboard.summary.all.seconds,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-border bg-card p-5"
            >
              <div className="mb-4 flex items-center gap-2 text-muted-foreground">
                <item.icon className="h-4 w-4" />
                <span className="text-sm font-medium">{item.label}</span>
              </div>
              <div className="font-mono text-2xl font-medium tracking-tight">
                {formatStaticDuration(item.seconds)}
              </div>
            </div>
          ))}
        </section>

        {dashboard.recent.length > 0 && (
          <section className="space-y-4">
            <h3 className="px-1 text-lg font-medium">Períodos recentes</h3>
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {dashboard.recent.map((service) => (
                <div
                  key={service.id}
                  className="flex flex-col justify-between gap-4 p-4 transition-colors hover:bg-secondary/20 sm:flex-row sm:items-center sm:p-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wider text-primary">
                      {service.projectTitle}
                    </p>
                    <span className="font-medium">
                      {service.subtitle || "Período de trabalho"}
                    </span>
                    {service.description && (
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {service.description}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <time dateTime={service.startedAt}>
                        {format(
                          new Date(service.startedAt),
                          "dd 'de' MMM, HH:mm",
                          { locale: ptBR },
                        )}
                      </time>
                      {service.endedAt && (
                        <>
                          <span>→</span>
                          <time dateTime={service.endedAt}>
                            {format(new Date(service.endedAt), "HH:mm", {
                              locale: ptBR,
                            })}
                          </time>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 font-mono text-lg font-medium">
                    {formatStaticDuration(service.durationSeconds)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
}
