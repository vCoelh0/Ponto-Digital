import { getAuth } from "@clerk/express";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  or,
  sql,
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
  ToggleServicePauseBody,
  ToggleServicePauseResponse,
  UpdateServiceBody,
  UpdateServiceParams,
  UpdateServiceResponse,
} from "@workspace/api-zod";
import {
  addDaysToDateKey,
  dateKey,
  effectiveEnd,
  overlapsRange,
  productiveSeconds,
  productiveSecondsInRange,
  rangeForPeriod,
  startOfDateKey,
  type Period,
  type TimeRange,
} from "../lib/time-tracking";

const router: IRouter = Router();

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

const toApiService = ({ service, projectTitle }: JoinedService, now = new Date()) => {
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
    elapsedSeconds: productiveSeconds(service, now),
    pausedDurationSeconds: service.pausedDurationSeconds,
    pauseStartedAt: service.pauseStartedAt,
    status: service.status,
    createdAt: service.createdAt,
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
    range?: TimeRange;
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
        options?.range?.start
          ? or(
              isNull(servicesTable.endedAt),
              gt(servicesTable.endedAt, options.range.start),
            )
          : undefined,
        options?.range?.end
          ? lt(servicesTable.startedAt, options.range.end)
          : undefined,
      ),
    )
    .orderBy(desc(servicesTable.startedAt));

  return options?.limit ? query.limit(options.limit) : query;
};

const daysWorked = (
  rows: JoinedService[],
  range: TimeRange,
  now: Date,
) => {
  const days = new Set<string>();
  for (const { service } of rows) {
    const end = effectiveEnd(service, now);
    const overlapStart = new Date(
      Math.max(service.startedAt.getTime(), range.start?.getTime() ?? -Infinity),
    );
    const overlapEnd = new Date(
      Math.min(end.getTime(), range.end?.getTime() ?? Infinity),
    );
    if (overlapEnd <= overlapStart) continue;
    const lastKey = dateKey(new Date(overlapEnd.getTime() - 1));
    for (
      let key = dateKey(overlapStart);
      key <= lastKey;
      key = addDaysToDateKey(key, 1)
    ) {
      const dayRange = {
        start: startOfDateKey(key),
        end: startOfDateKey(addDaysToDateKey(key, 1)),
      };
      if (productiveSecondsInRange(service, dayRange, now) > 0) days.add(key);
    }
  }
  return days.size;
};

const buildSummary = async (
  userId: string,
  filters: {
    projectId?: number;
    period?: Period;
    startDate?: string;
    endDate?: string;
  } = {},
) => {
  const now = new Date();
  const rows = await selectJoinedServices(userId, {
    projectId: filters.projectId,
    statuses: ["running", "paused", "completed"],
  });
  const selectedRange = rangeForPeriod(
    filters.period ?? "all",
    now,
    filters.startDate,
    filters.endDate,
  );
  if (!selectedRange) return null;

  const ranges = {
    today: rangeForPeriod("today", now)!,
    week: rangeForPeriod("week", now)!,
    month: rangeForPeriod("month", now)!,
    all: rangeForPeriod("all", now)!,
    filtered: selectedRange,
  };
  const sum = (range: TimeRange) =>
    rows.reduce(
      (total, row) =>
        total + productiveSecondsInRange(row.service, range, now),
      0,
    );
  const totals = Object.fromEntries(
    Object.entries(ranges).map(([key, range]) => [key, sum(range)]),
  ) as Record<keyof typeof ranges, number>;
  const filteredRows = rows.filter((row) =>
    productiveSecondsInRange(row.service, selectedRange, now) > 0,
  );

  let project;
  if (filters.projectId) {
    const [record] = await db
      .select()
      .from(projectsTable)
      .where(
        and(
          eq(projectsTable.id, filters.projectId),
          eq(projectsTable.userId, userId),
        ),
      )
      .limit(1);
    if (record) {
      project = {
        id: record.id,
        title: record.title,
        description: record.description,
        seconds: totals.filtered,
        serviceCount: filteredRows.length,
        dayCount: daysWorked(filteredRows, selectedRange, now),
        services: filteredRows.map((row) => toApiService(row, now)),
      };
    }
  }

  return {
    today: { seconds: totals.today, label: durationLabel(totals.today) },
    week: { seconds: totals.week, label: durationLabel(totals.week) },
    month: { seconds: totals.month, label: durationLabel(totals.month) },
    all: { seconds: totals.all, label: durationLabel(totals.all) },
    filtered: {
      seconds: totals.filtered,
      label: durationLabel(totals.filtered),
    },
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

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "23505";

router.use(requireAuth);

router.get("/services", async (req, res): Promise<void> => {
  const parsed = ListServicesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Filtros inválidos." });
    return;
  }

  const userId = (req as AuthenticatedRequest).authUserId!;
  const { period, projectId, startDate, endDate } = parsed.data;
  const range = rangeForPeriod(period, new Date(), startDate, endDate);
  if (!range) {
    res.status(400).json({
      error: "Informe datas válidas, com a data inicial anterior à final.",
    });
    return;
  }
  const now = new Date();
  const rows = await selectJoinedServices(userId, {
    projectId,
    range,
  });
  const overlapping = rows.filter((row) =>
    overlapsRange(row.service, range, now),
  );
  res.json(
    ListServicesResponse.parse(
      overlapping.map((row) => toApiService(row, now)),
    ),
  );
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

  let created: DbService | undefined;
  try {
    [created] = await db
      .insert(servicesTable)
      .values({
        userId,
        projectId: project.id,
        title: project.title,
        subtitle: parsed.data.subtitle?.trim() || null,
        description: parsed.data.description?.trim() || null,
      })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Já existe um período em andamento." });
      return;
    }
    throw error;
  }

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
  const finished = await db.transaction(async (tx) => {
    const [service] = await tx
      .select()
      .from(servicesTable)
      .where(
        and(
          eq(servicesTable.id, parsed.data.id),
          eq(servicesTable.userId, userId),
          inArray(servicesTable.status, ["running", "paused"]),
        ),
      )
      .for("update")
      .limit(1);
    if (!service) return undefined;

    const endedAt = new Date();
    const currentPausedSeconds = pausedSecondsInCurrentPause(service, endedAt);
    const durationSeconds = Math.max(
      0,
      secondsSinceStart(service, endedAt) -
        service.pausedDurationSeconds -
        currentPausedSeconds,
    );
    const [updated] = await tx
      .update(servicesTable)
      .set({
        endedAt,
        durationSeconds,
        pausedDurationSeconds:
          service.pausedDurationSeconds + currentPausedSeconds,
        status: "completed",
        pauseStartedAt: null,
      })
      .where(
        and(
          eq(servicesTable.id, service.id),
          eq(servicesTable.userId, userId),
          eq(servicesTable.status, service.status),
        ),
      )
      .returning();
    return updated;
  });
  if (!finished) {
    res.status(404).json({ error: "Período em andamento não encontrado." });
    return;
  }

  const project = finished.projectId
    ? await getOwnedProject(userId, finished.projectId)
    : undefined;

  res.json(
    FinishServiceResponse.parse(
      toApiService({
        service: finished,
        projectTitle: project?.title ?? null,
      }),
    ),
  );
});

router.post("/services/:id/pause", async (req, res): Promise<void> => {
  const params = ToggleServicePauseParams.safeParse(req.params);
  const body = ToggleServicePauseBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Transição de pausa inválida." });
    return;
  }

  const userId = (req as AuthenticatedRequest).authUserId!;
  const updated = await db.transaction(async (tx) => {
    const [service] = await tx
      .select()
      .from(servicesTable)
      .where(
        and(
          eq(servicesTable.id, params.data.id),
          eq(servicesTable.userId, userId),
          inArray(servicesTable.status, ["running", "paused"]),
        ),
      )
      .for("update")
      .limit(1);
    if (!service) return undefined;

    const requestedStatus = body.data.action === "pause" ? "paused" : "running";
    if (service.status === requestedStatus) return service;

    const now = new Date();
    const pauseElapsed =
      body.data.action === "resume" && service.pauseStartedAt
        ? pausedSecondsInCurrentPause(service, now)
        : 0;
    const [result] = await tx
      .update(servicesTable)
      .set(
        body.data.action === "resume"
          ? {
              status: "running",
              pauseStartedAt: null,
              pausedDurationSeconds:
                service.pausedDurationSeconds + pauseElapsed,
            }
          : {
              status: "paused",
              pauseStartedAt: now,
            },
      )
      .where(
        and(
          eq(servicesTable.id, service.id),
          eq(servicesTable.userId, userId),
          eq(servicesTable.status, service.status),
        ),
      )
      .returning();
    return result;
  });
  if (!updated) {
    res.status(404).json({ error: "Período em andamento não encontrado." });
    return;
  }

  const project = updated.projectId
    ? await getOwnedProject(userId, updated.projectId)
    : undefined;

  res.json(
    ToggleServicePauseResponse.parse(
      toApiService({
        service: updated,
        projectTitle: project?.title ?? null,
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
      recent: recent.map((row) => toApiService(row)),
      summary: summary!,
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
  const summary = await buildSummary(userId, parsed.data);
  if (!summary) {
    res.status(400).json({
      error: "Informe datas válidas, com a data inicial anterior à final.",
    });
    return;
  }
  res.json(GetSummaryResponse.parse(summary));
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
      and(
        eq(projectsTable.userId, userId),
        sql<boolean>`lower(trim(${projectsTable.title})) = lower(${title})`,
      ),
    )
    .limit(1);
  if (duplicate) {
    res.status(409).json({ error: "Já existe um projeto com esse nome." });
    return;
  }

  let created: typeof projectsTable.$inferSelect | undefined;
  try {
    [created] = await db
      .insert(projectsTable)
      .values({
        userId,
        title,
        description: parsed.data.description?.trim() || null,
      })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Já existe um projeto com esse nome." });
      return;
    }
    throw error;
  }
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
  const services = await selectJoinedServices(userId, {
    statuses: ["running", "paused", "completed"],
  });
  const now = new Date();
  const allTime: TimeRange = {};

  const response = projects.map((project) => {
    const projectServices = services.filter(
      (item) => item.service.projectId === project.id,
    );
    return {
      id: project.id,
      title: project.title,
      description: project.description,
      seconds: projectServices.reduce(
        (total, item) =>
          total + productiveSecondsInRange(item.service, allTime, now),
        0,
      ),
      serviceCount: projectServices.length,
      dayCount: daysWorked(projectServices, allTime, now),
    };
  });
  res.json(ListProjectsResponse.parse(response));
});

export default router;
