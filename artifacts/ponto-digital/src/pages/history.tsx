import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import {
  getGetDashboardQueryKey,
  getGetSummaryQueryKey,
  getListProjectsQueryKey,
  getListServicesQueryKey,
  PeriodParameter,
  useDeleteProject,
  useDeleteService,
  useGetSummary,
  useListProjects,
  useListServices,
  useUpdateService,
} from "@workspace/api-client-react";
import { formatStaticDuration, LiveTimer } from "@/components/live-timer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Calendar,
  Check,
  Clock,
  Filter,
  FolderGit2,
  Loader2,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function History() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<PeriodParameter>("all");
  const [projectId, setProjectId] = useState("all");
  const [customStartDate, setCustomStartDate] = useState(() =>
    format(new Date(), "yyyy-MM-01"),
  );
  const [customEndDate, setCustomEndDate] = useState(() =>
    format(new Date(), "yyyy-MM-dd"),
  );
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSubtitle, setEditSubtitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [feedback, setFeedback] = useState("");

  const projectsQuery = useListProjects();
  const { data: projects, isLoading: projectsLoading } = projectsQuery;
  const deleteProject = useDeleteProject();
  const deleteService = useDeleteService();
  const updateService = useUpdateService();

  const queryParams = useMemo(() => {
    const params: {
      period: PeriodParameter;
      projectId?: number;
      startDate?: string;
      endDate?: string;
    } = { period };
    if (projectId !== "all") params.projectId = Number(projectId);
    if (period === "custom") {
      params.startDate = customStartDate;
      params.endDate = customEndDate;
    }
    return params;
  }, [customEndDate, customStartDate, period, projectId]);

  const servicesQuery = useListServices(queryParams);
  const {
    data: services,
    dataUpdatedAt: servicesUpdatedAt,
    isLoading: servicesLoading,
  } = servicesQuery;
  const summaryQuery = useGetSummary(queryParams);
  const { data: summary, isLoading: summaryLoading } = summaryQuery;
  const isLoading = projectsLoading || servicesLoading || summaryLoading;
  const hasLoadError =
    projectsQuery.isError || servicesQuery.isError || summaryQuery.isError;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
  };

  const groupedServices = useMemo(() => {
    if (!services) return [];
    const groups: Record<string, typeof services> = {};
    services.forEach((service) => {
      const key = format(new Date(service.startedAt), "yyyy-MM-dd");
      if (!groups[key]) groups[key] = [];
      groups[key].push(service);
    });
    return Object.entries(groups)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => ({ date, items }));
  }, [services]);

  const selectedProject =
    projectId === "all"
      ? undefined
      : projects?.find((project) => project.id === Number(projectId));

  const beginEdit = (service: NonNullable<typeof services>[number]) => {
    setEditingId(service.id);
    setEditSubtitle(service.subtitle ?? "");
    setEditDescription(service.description ?? "");
    setFeedback("");
  };

  const saveEdit = (id: number) => {
    updateService.mutate(
      {
        id,
        data: {
          subtitle: editSubtitle,
          description: editDescription || null,
        },
      },
      {
        onSuccess: () => {
          setEditingId(null);
          invalidateAll();
        },
        onError: () =>
          setFeedback("Não foi possível salvar as alterações do período."),
      },
    );
  };

  const removeService = (id: number) => {
    if (
      !window.confirm(
        "Excluir este período de trabalho? Essa ação não pode ser desfeita.",
      )
    ) {
      return;
    }
    deleteService.mutate(
      { id },
      {
        onSuccess: invalidateAll,
        onError: () =>
          setFeedback("Não foi possível excluir o período de trabalho."),
      },
    );
  };

  const removeProject = (id: number, title: string) => {
    if (
      !window.confirm(
        `Excluir o projeto “${title}” e todos os períodos cadastrados dentro dele? Essa ação não pode ser desfeita.`,
      )
    ) {
      return;
    }
    deleteProject.mutate(
      { id },
      {
        onSuccess: () => {
          if (projectId === String(id)) setProjectId("all");
          invalidateAll();
        },
        onError: () => setFeedback("Não foi possível excluir o projeto."),
      },
    );
  };

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Projetos e períodos
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">Histórico</h1>
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-sm">
            <Filter className="ml-2 mr-1 h-4 w-4 text-muted-foreground" />
            <Select
              value={period}
              onValueChange={(value) => setPeriod(value as PeriodParameter)}
            >
              <SelectTrigger className="h-8 w-[140px] border-0 bg-transparent shadow-none focus:ring-0">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="week">Esta semana</SelectItem>
                <SelectItem value="month">Este mês</SelectItem>
                <SelectItem value="all">Todo período</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
            <div className="mx-1 h-4 w-px bg-border" />
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="h-8 w-[190px] border-0 bg-transparent shadow-none focus:ring-0">
                <SelectValue placeholder="Projeto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os projetos</SelectItem>
                {projects?.map((project) => (
                  <SelectItem key={project.id} value={String(project.id)}>
                    {project.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {period === "custom" && (
              <>
                <div className="mx-1 hidden h-4 w-px bg-border sm:block" />
                <label className="sr-only" htmlFor="history-start-date">
                  Data inicial
                </label>
                <Input
                  id="history-start-date"
                  type="date"
                  value={customStartDate}
                  max={customEndDate}
                  onChange={(event) => setCustomStartDate(event.target.value)}
                  className="h-8 w-[145px] border-0 bg-transparent shadow-none"
                />
                <span className="text-xs text-muted-foreground">até</span>
                <label className="sr-only" htmlFor="history-end-date">
                  Data final
                </label>
                <Input
                  id="history-end-date"
                  type="date"
                  value={customEndDate}
                  min={customStartDate}
                  onChange={(event) => setCustomEndDate(event.target.value)}
                  className="h-8 w-[145px] border-0 bg-transparent shadow-none"
                />
              </>
            )}
          </div>
        </div>

        {feedback && (
          <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {feedback}
          </p>
        )}

        {!hasLoadError && projects && projects.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-medium text-muted-foreground">
                Projetos
              </h2>
              <span className="text-xs text-muted-foreground">
                {projects.length} {projects.length === 1 ? "projeto" : "projetos"}
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setProjectId(String(project.id))}
                  className={`group rounded-xl border p-4 text-left transition-colors ${
                    projectId === String(project.id)
                      ? "border-primary/50 bg-primary/[0.07]"
                      : "border-border bg-card hover:border-primary/25"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{project.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {project.serviceCount} períodos · {project.dayCount} dias
                      </p>
                    </div>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeProject(project.id, project.title);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          removeProject(project.id, project.title);
                        }
                      }}
                      className="rounded-md p-2 text-muted-foreground opacity-70 transition-colors hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      aria-label={`Excluir projeto ${project.title}`}
                      title="Excluir projeto"
                    >
                      <Trash2 className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="mt-4 font-mono text-xl font-medium">
                    {formatStaticDuration(project.seconds)}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : hasLoadError ? (
          <div className="rounded-2xl border border-destructive/25 bg-destructive/10 px-6 py-12 text-center">
            <h2 className="text-lg font-medium text-destructive">
              Não foi possível carregar o histórico
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Verifique sua conexão e tente novamente.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-5"
              onClick={() => {
                void Promise.all([
                  projectsQuery.refetch(),
                  servicesQuery.refetch(),
                  summaryQuery.refetch(),
                ]);
              }}
            >
              Tentar novamente
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col justify-between gap-5 rounded-2xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center">
              <div>
                <p className="mb-1 text-sm font-medium text-muted-foreground">
                  {selectedProject
                    ? `${selectedProject.title} · total no período`
                    : "Todos os projetos · total no período"}
                </p>
                <span className="font-mono text-4xl font-medium tracking-tight">
                  {formatStaticDuration(summary?.filtered.seconds ?? 0)}
                </span>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {selectedProject && summary?.project && (
                  <>
                    <span className="flex items-center gap-2">
                      <FolderGit2 className="h-4 w-4" />
                      {summary.project.serviceCount} períodos
                    </span>
                    <span className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {summary.project.dayCount} dias
                    </span>
                  </>
                )}
              </div>
            </div>

            {groupedServices.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/50 py-20 text-center">
                <Clock className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                <h3 className="mb-1 text-lg font-medium">
                  Nenhum período encontrado
                </h3>
                <p className="text-sm text-muted-foreground">
                  Altere os filtros ou inicie um período no painel.
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {groupedServices.map((group) => {
                  return (
                    <section key={group.date} className="space-y-3">
                      <div className="flex items-center px-1">
                        <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          Iniciados em{" "}
                          {format(
                            new Date(`${group.date}T12:00:00`),
                            "EEEE, dd 'de' MMMM",
                            { locale: ptBR },
                          )}
                        </h3>
                      </div>

                      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                        {group.items.map((service) => {
                          const isEditing = editingId === service.id;
                          const isActive =
                            service.status === "running" ||
                            service.status === "paused";
                          return (
                            <div key={service.id} className="p-4 sm:p-5">
                              {isEditing ? (
                                <div className="grid items-end gap-3 md:grid-cols-[1fr_1.4fr_auto]">
                                  <div>
                                    <label className="mb-2 block text-xs font-medium text-muted-foreground">
                                      Subtítulo
                                    </label>
                                    <Input
                                      value={editSubtitle}
                                      onChange={(event) =>
                                        setEditSubtitle(event.target.value)
                                      }
                                      placeholder="Período de trabalho"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-2 block text-xs font-medium text-muted-foreground">
                                      Descrição
                                    </label>
                                    <Input
                                      value={editDescription}
                                      onChange={(event) =>
                                        setEditDescription(event.target.value)
                                      }
                                      placeholder="Descrição opcional"
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      type="button"
                                      size="icon"
                                      onClick={() => saveEdit(service.id)}
                                      disabled={updateService.isPending}
                                      aria-label="Salvar edição"
                                      title="Salvar"
                                    >
                                      {updateService.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Check className="h-4 w-4" />
                                      )}
                                    </Button>
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="outline"
                                      onClick={() => setEditingId(null)}
                                      aria-label="Cancelar edição"
                                      title="Cancelar"
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                                  <div className="min-w-0 flex-1">
                                    <div className="mb-1 flex flex-wrap items-center gap-2">
                                      <span className="text-xs font-medium uppercase tracking-wider text-primary">
                                        {service.projectTitle}
                                      </span>
                                      {isActive && (
                                        <span
                                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                            service.status === "paused"
                                              ? "bg-amber-400/10 text-amber-300"
                                              : "bg-primary/10 text-primary"
                                          }`}
                                        >
                                          {service.status === "paused"
                                            ? "Pausado"
                                            : "Ativo"}
                                        </span>
                                      )}
                                    </div>
                                    <p className="font-medium">
                                      {service.subtitle ||
                                        "Período de trabalho"}
                                    </p>
                                    {service.description && (
                                      <p className="mt-1 truncate text-sm text-muted-foreground">
                                        {service.description}
                                      </p>
                                    )}
                                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                                      <time dateTime={service.startedAt}>
                                        {format(
                                          new Date(service.startedAt),
                                          "HH:mm",
                                          { locale: ptBR },
                                        )}
                                      </time>
                                      {service.endedAt && (
                                        <>
                                          <span>→</span>
                                          <time dateTime={service.endedAt}>
                                            {format(
                                              new Date(service.endedAt),
                                              "HH:mm",
                                              { locale: ptBR },
                                            )}
                                          </time>
                                        </>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                                    <div className="min-w-28 text-right font-mono text-lg font-medium">
                                      {isActive ? (
                                        <LiveTimer
                                          elapsedSeconds={
                                            service.elapsedSeconds
                                          }
                                          receivedAt={servicesUpdatedAt}
                                          isPaused={
                                            service.status === "paused"
                                          }
                                          className={
                                            service.status === "paused"
                                              ? "text-amber-300"
                                              : "text-primary"
                                          }
                                        />
                                      ) : (
                                        formatStaticDuration(
                                          service.durationSeconds,
                                        )
                                      )}
                                    </div>
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => beginEdit(service)}
                                      aria-label="Editar período"
                                      title="Editar período"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                      onClick={() =>
                                        removeService(service.id)
                                      }
                                      disabled={deleteService.isPending}
                                      aria-label="Excluir período"
                                      title="Excluir período"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
