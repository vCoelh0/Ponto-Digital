import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const servicesTable = pgTable(
  "services",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    projectId: integer("project_id").references(() => projectsTable.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    description: text("description"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    pausedDurationSeconds: integer("paused_duration_seconds")
      .notNull()
      .default(0),
    pauseStartedAt: timestamp("pause_started_at", { withTimezone: true }),
    status: text("status", { enum: ["running", "paused", "completed"] })
      .notNull()
      .default("running"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("services_one_running_per_user")
      .on(table.userId)
      .where(sql`${table.status} in ('running', 'paused')`),
  ],
);

export const insertServiceSchema = createInsertSchema(servicesTable).omit({
  id: true,
  startedAt: true,
  endedAt: true,
  durationSeconds: true,
  pausedDurationSeconds: true,
  pauseStartedAt: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertService = z.infer<typeof insertServiceSchema>;
export type Service = typeof servicesTable.$inferSelect;