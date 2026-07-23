import { relations } from "drizzle-orm";
import {
  projects,
  experiments,
  experimentSamples,
  samples,
  storageLocations,
  stockTransactions,
} from "./schema";

export const projectsRelations = relations(projects, ({ many }) => ({
  experiments: many(experiments),
  samples: many(samples),
}));

export const experimentsRelations = relations(experiments, ({ one, many }) => ({
  project: one(projects, {
    fields: [experiments.projectId],
    references: [projects.id],
  }),
  usedSamples: many(experimentSamples),
}));

export const experimentSamplesRelations = relations(
  experimentSamples,
  ({ one }) => ({
    experiment: one(experiments, {
      fields: [experimentSamples.experimentId],
      references: [experiments.id],
    }),
    sample: one(samples, {
      fields: [experimentSamples.sampleId],
      references: [samples.id],
    }),
  }),
);

export const samplesRelations = relations(samples, ({ one, many }) => ({
  location: one(storageLocations, {
    fields: [samples.locationId],
    references: [storageLocations.id],
  }),
  project: one(projects, {
    fields: [samples.projectId],
    references: [projects.id],
  }),
  transactions: many(stockTransactions),
}));

export const storageLocationsRelations = relations(
  storageLocations,
  ({ one, many }) => ({
    parent: one(storageLocations, {
      fields: [storageLocations.parentId],
      references: [storageLocations.id],
      relationName: "locationTree",
    }),
    children: many(storageLocations, { relationName: "locationTree" }),
    samples: many(samples),
  }),
);

export const stockTransactionsRelations = relations(
  stockTransactions,
  ({ one }) => ({
    sample: one(samples, {
      fields: [stockTransactions.sampleId],
      references: [samples.id],
    }),
  }),
);
