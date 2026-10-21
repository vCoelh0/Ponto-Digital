import { getAuth } from "@clerk/express";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
} from "drizzle-orm";
import { Router, type IRouter, type RequestHandler } from "express";
import {
  db,
  projectsTable,
  servicesTable,
  type Service as DbService,
} from "@workspace/db";
import {
  CreateProjectBody,
  CreateProjectResponse,
  CreateServiceBody,
  CreateServiceResponse,
  DeleteProjectParams,
  DeleteServiceParams,
  FinishServiceParams,
  FinishServiceResponse,
  GetDashboardResponse,
  GetSummaryQueryParams,
  GetSummaryResponse,
  ListProjectsResponse,
  ListServicesQueryParams,
  ListServicesResponse,
  ToggleServicePauseParams,
  ToggleServicePauseResponse,
  UpdateServiceBody,
  UpdateServiceParams,
  UpdateServiceResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const timeZone = "America/Sao_Paulo";

type AuthenticatedRequest = Parameters<RequestHandler>[0] & {
  authUserId?: string;
};

type JoinedService = {
  service: DbService;
  projectTitle: string | null;
};

const requireAuth: RequestHandler = (req, res, next) => {
  const auth = getAuth(req);
  const userId =
    (auth.sessionClaims?.userId as string | undefined) ?? auth.userId;
  if (!userId) {
    res.status(401).json({ error: "Faça login para continuar." });
    return;
  }
  (req as AuthenticatedRequest).authUserId = userId;
  next();
};

// All durations shown to the user are based on the server clock. In
// particular, the browser clock must not be compared to startedAt.
const secondsSinceStart = (service: DbService, at: Date) =>
  Math.max(
    0,
    Math.floor((at.getTime() - service.startedAt.getTime()) / 1000),
  );

const pausedSecondsInCurrentPause = (service: DbService, at: Date) =>
  service.pauseStartedAt
    ? Math.max(
        0,
        secondsSinceStart(service, at) -
          secondsSinceStart(service, service.pauseStartedAt),
      )
    : 0;

const elapsedSeconds = (service: DbService, now: Date) => {
  if (service.status === "completed") return service.durationSeconds;
  const effectiveEnd =
    service.status === "paused" && service.pauseStartedAt
      ? service.pauseStartedAt
      : now;
  return Math.max(
    0,
    secondsSinceStart(service, effectiveEnd) -
      service.pausedDurationSeconds,
  );
};

const toApiService = ({ service, projectTitle }: JoinedService) => {
  const resolvedProjectTitle = projectTitle ?? service.title;
  return {
    id: service.id,
    title: service.subtitle?.trim() || resolvedProjectTitle,
    projectId: service.projectId,
    projectTitle: resolvedProjectTitle,
    subtitle: service.subtitle,
    description: service.description,
    startedAt: service.startedAt,
    endedAt: service.endedAt,
    durationSeconds: service.durationSeconds,
    elapsedSeconds: elapsedSeconds(service, new Date()),
    pausedDurationSeconds: service.pausedDurationSeconds,
    pauseStartedAt: service.pauseStartedAt,
    status: service.status,
    createdAt: service.createdAt,
  };
};

const dateKey = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const periodKeys = () => {
  const now = new Date();
  const today = dateKey(now);
  const localNoon = new Date(`${today}T12:00:00-03:00`);
  const day = localNoon.getDay();
  const monday = new Date(localNoon);
  monday.setDate(localNoon.getDate() - ((day + 6) % 7));
  return {
    today,
    week: dateKey(monday),
    month: `${today.slice(0, 7)}-01`,
  };
};

const durationLabel = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}min`;
  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}min`;
};

const selectJoinedServices = async (
  userId: string,
  options?: {
    projectId?: number;
    statuses?: Array<"running" | "paused" | "completed">;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  },
) => {
  const query = db
    .select({
      service: servicesTable,
      projectTitle: projectsTable.title,
    })
    .from(servicesTable)
    .leftJoin(projectsTable, eq(servicesTable.projectId, projectsTable.id))
    .where(
      and(
        eq(servicesTable.userId, userId),
        options?.projectId
          ? eq(servicesTable.projectId, options.projectId)
          : undefined,
        options?.statuses
          ? inArray(servicesTable.status, options.statuses)
          : undefined,
        options?.startDate
          ? gte(servicesTable.startedAt, options.startDate)
          : undefined,
        options?.endDate
          ? lte(servicesTable.startedAt, options.endDate)
          : undefined,
      ),
    )
    .orderBy(desc(servicesTable.startedAt));

  return options?.limit ? query.limit(options.limit) : query;
};

const buildSummary = async (userId: string, projectId?: number) => {
  const completed = await selectJoinedServices(userId, {
    projectId,
    statuses: ["completed"],
  });
  const keys = periodKeys();
  const sum = (from?: string) =>
    completed.reduce(
      (total, row) =>
        !from || dateKey(row.service.startedAt) >= from
          ? total + row.service.durationSeconds
          : total,
      0,
    );

  const today = sum(keys.today);
  const week = sum(keys.week);
  const month = sum(keys.month);
  const all = sum();

  let project;
  if (projectId) {
    const [record] = await db
      .select()
      .from(projectsTable)
      .where(
        and(
          eq(projectsTable.id, projectId),
          eq(projectsTable.userId, userId),
        ),
      )
      .limit(1);
    if (record) {
      project = {
        id: record.id,
        title: record.title,
        description: record.description,
        seconds: all,
        serviceCount: completed.length,
        dayCount: new Set(
          completed.map((item) => dateKey(item.service.startedAt)),
        ).size,
        services: completed.map(toApiService),
      };
    }
  }

  return {
    today: { seconds: today, label: durationLabel(today) },
    week: { seconds: week, label: durationLabel(week) },
    month: { seconds: month, label: durationLabel(month) },
    all: { seconds: all, label: durationLabel(all) },
    ...(project ? { project } : {}),
  };
};

const getOwnedProject = async (userId: string, projectId: number) => {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(
      and(
        eq(projectsTable.id, projectId),
        eq(projectsTable.userId, userId),
      ),
    )
    .limit(1);
  return project;
};

router.use(requireAuth);

router.get("/services", async (req, res): Promise<void> => {
  const parsed = ListServicesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Filtros inválidos." });
    return;
  }

  const userId = (req as AuthenticatedRequest).authUserId!;
  const { period, projectId, startDate, endDate } = parsed.data;
  const keys = periodKeys();
  const periodStart =
    period === "today"
      ? keys.today
      : period === "week"
        ? keys.week
        : period === "month"
          ? keys.month
          : undefined;
  const rows = await selectJoinedServices(userId, {
    projectId,
    startDate,
    endDate,
  });
  const filtered = periodStart
    ? rows.filter((row) => dateKey(row.service.startedAt) >= periodStart)
    : rows;
  res.json(ListServicesResponse.parse(filtered.map(toApiService)));
});

router.post("/services", async (req, res): Promise<void> => {
  const parsed = CreateServiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Selecione um projeto válido." });
    return;
  }

  const userId = (req as AuthenticatedRequest).authUserId!;
  const project = await getOwnedProject(userId, parsed.data.projectId);
  if (!project) {
    res.status(404).json({ error: "Projeto não encontrado." });
    return;
  }

  const [active] = await db
    .select({ id: servicesTable.id })
    .from(servicesTable)
    .where(
      and(
        eq(servicesTable.userId, userId),
        inArray(servicesTable.status, ["running", "paused"]),
      ),
    )
    .limit(1);
  if (active) {
    res.status(409).json({ error: "Já existe um período em andamento." });
    return;
  }

  const [created] = await db
    .insert(servicesTable)
    .values({
      userId,
      projectId: project.id,
      title: project.title,
      subtitle: parsed.data.subtitle?.trim() || null,
      description: parsed.data.description?.trim() || null,
    })
    .returning();

  res.status(201).json(
    CreateServiceResponse.parse(
      toApiService({ service: created!, projectTitle: project.title }),
    ),
  );
});

router.patch("/services/:id", async (req, res): Promise<void> => {
  const params = UpdateServiceParams.safeParse(req.params);
  const body = UpdateServiceBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Dados de edição inválidos." });
    return;
  }

  const userId = (req as AuthenticatedRequest).authUserId!;
  const changes: { subtitle?: string | null; description?: string | null } = {};
  if (body.data.subtitle !== undefined) {
    changes.subtitle = body.data.subtitle.trim() || null;
  }
  if (body.data.description !== undefined) {
    changes.description = body.data.description?.trim() || null;
  }
  if (Object.keys(changes).length === 0) {
    res.status(400).json({ error: "Nenhuma alteração informada." });
    return;
  }

  const [updated] = await db
    .update(servicesTable)
    .set(changes)
    .where(
      and(
        eq(servicesTable.id, params.data.id),
        eq(servicesTable.userId, userId),
      ),
    )
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Período não encontrado." });
    return;
  }

  const project = updated.projectId
    ? await getOwnedProject(userId, updated.projectId)
    : undefined;
  res.json(
    UpdateServiceResponse.parse(
      toApiService({
        service: updated,
        projectTitle: project?.title ?? null,
      }),
    ),
  );
});

router.delete("/services/:id", async (req, res): Promise<void> => {
  const params = DeleteServiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Período inválido." });
    return;
  }

  const userId = (req as AuthenticatedRequest).authUserId!;
  const [deleted] = await db
    .delete(servicesTable)
    .where(
      and(
        eq(servicesTable.id, params.data.id),
        eq(servicesTable.userId, userId),
      ),
    )
    .returning({ id: servicesTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Período não encontrado." });
    return;
  }
  res.sendStatus(204);
});

router.post("/services/:id/finish", async (req, res): Promise<void> => {
  const parsed = FinishServiceParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Período inválido." });
    return;
  }

  const userId = (req as AuthenticatedRequest).authUserId!;
  const [row] = await selectJoinedServices(userId, {
    statuses: ["running", "paused"],
  });
  if (!row || row.service.id !== parsed.data.id) {
    res.status(404).json({ error: "Período em andamento não encontrado." });
    return;
  }

  const endedAt = new Date();
  const currentPausedSeconds = pausedSecondsInCurrentPause(
    row.service,
    endedAt,
  );
  const durationSeconds = Math.max(
    0,
    secondsSinceStart(row.service, endedAt) -
      row.service.pausedDurationSeconds -
      currentPausedSeconds,
  );
  const [finished] = await db
    .update(servicesTable)
    .set({
      endedAt,
      durationSeconds,
      pausedDurationSeconds:
        row.service.pausedDurationSeconds + currentPausedSeconds,
      status: "completed",
      pauseStartedAt: null,
    })
    .where(
      and(
        eq(servicesTable.id, row.service.id),
        eq(servicesTable.userId, userId),
      ),
    )
    .returning();

  res.json(
    FinishServiceResponse.parse(
      toApiService({
        service: finished!,
        projectTitle: row.projectTitle,
      }),
    ),
  );
});

router.post("/services/:id/pause", async (req, res): Promise<void> => {
  const parsed = ToggleServicePauseParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Período inválido." });
    return;
  }

  const userId = (req as AuthenticatedRequest).authUserId!;
  const [row] = await selectJoinedServices(userId, {
    statuses: ["running", "paused"],
  });
  if (!row || row.service.id !== parsed.data.id) {
    res.status(404).json({ error: "Período em andamento não encontrado." });
    return;
  }

  const now = new Date();
  const resuming = row.service.status === "paused";
  const pauseElapsed =
    resuming && row.service.pauseStartedAt
      ? pausedSecondsInCurrentPause(row.service, now)
      : 0;
  const [updated] = await db
    .update(servicesTable)
    .set(
      resuming
        ? {
            status: "running",
            pauseStartedAt: null,
            pausedDurationSeconds:
              row.service.pausedDurationSeconds + pauseElapsed,
          }
        : {
            status: "paused",
            pauseStartedAt: now,
          },
    )
    .where(
      and(
        eq(servicesTable.id, row.service.id),
        eq(servicesTable.userId, userId),
      ),
    )
    .returning();

  res.json(
    ToggleServicePauseResponse.parse(
      toApiService({
        service: updated!,
        projectTitle: row.projectTitle,
      }),
    ),
  );
});

router.get("/dashboard", async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).authUserId!;
  const [active] = await selectJoinedServices(userId, {
    statuses: ["running", "paused"],
    limit: 1,
  });
  const recent = await selectJoinedServices(userId, {
    statuses: ["completed"],
    limit: 3,
  });
  const summary = await buildSummary(userId);

  res.json(
    GetDashboardResponse.parse({
      ...(active ? { active: toApiService(active) } : {}),
      recent: recent.map(toApiService),
      summary,
    }),
  );
});

router.get("/summary", async (req, res): Promise<void> => {
  const parsed = GetSummaryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Filtros inválidos." });
    return;
  }
  const userId = (req as AuthenticatedRequest).authUserId!;
  res.json(
    GetSummaryResponse.parse(
      await buildSummary(userId, parsed.data.projectId),
    ),
  );
});

router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.title.trim()) {
    res.status(400).json({ error: "Digite um nome para o projeto." });
    return;
  }

  const userId = (req as AuthenticatedRequest).authUserId!;
  const title = parsed.data.title.trim();
  const [duplicate] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(
      and(eq(projectsTable.userId, userId), ilike(projectsTable.title, title)),
    )
    .limit(1);
  if (duplicate) {
    res.status(409).json({ error: "Já existe um projeto com esse nome." });
    return;
  }

  const [created] = await db
    .insert(projectsTable)
    .values({
      userId,
      title,
      description: parsed.data.description?.trim() || null,
    })
    .returning();
  res.status(201).json(
    CreateProjectResponse.parse({
      id: created!.id,
      title: created!.title,
      description: created!.description,
      seconds: 0,
      serviceCount: 0,
      dayCount: 0,
    }),
  );
});

router.delete("/projects/:id", async (req, res): Promise<void> => {
  const parsed = DeleteProjectParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Projeto inválido." });
    return;
  }

  const userId = (req as AuthenticatedRequest).authUserId!;
  const [deleted] = await db
    .delete(projectsTable)
    .where(
      and(
        eq(projectsTable.id, parsed.data.id),
        eq(projectsTable.userId, userId),
      ),
    )
    .returning({ id: projectsTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Projeto não encontrado." });
    return;
  }
  res.sendStatus(204);
});

router.get("/projects", async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).authUserId!;
  const projects = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.userId, userId))
    .orderBy(asc(projectsTable.title));
  const completed = await selectJoinedServices(userId, {
    statuses: ["completed"],
  });

  const response = projects.map((project) => {
    const services = completed.filter(
      (item) => item.service.projectId === project.id,
    );
    return {
      id: project.id,
      title: project.title,
      description: project.description,
      seconds: services.reduce(
        (total, item) => total + item.service.durationSeconds,
        0,
      ),
      serviceCount: services.length,
      dayCount: new Set(
        services.map((item) => dateKey(item.service.startedAt)),
      ).size,
    };
  });
  res.json(ListProjectsResponse.parse(response));
});

export default router;