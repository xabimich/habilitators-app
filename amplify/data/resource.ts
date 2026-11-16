import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  Habilitator: a
    .model({
      name: a.string().required(), // full name, shown in the side panel
      shortName: a.string(), // optional, shown on the graph card (falls back to name)
      contacts: a.string().array(),
      type: a.string(),
      // Fixed lifecycle stages; labels (Catalan) live in src/client.ts.
      status: a.enum(['conceptualization', 'development', 'pre', 'pro']),
      description: a.string(),
      attributes: a.json(),
      updatedBy: a.string(), // name (or email) of the last user who created or saved it; set by the app
    })
    .authorization((allow) => [allow.authenticated()]),

  Relation: a
    .model({
      sourceId: a.id().required(),
      targetId: a.id().required(),
      kind: a.string().required(), // uses | references (list in src/client.ts)
    })
    .authorization((allow) => [allow.authenticated()]),

  // ---------- Standard work process (read-only for the app) ----------
  // Loaded from process/*.yaml by process/seed.ts, which writes straight to DynamoDB with
  // deterministic ids (`<process>#<key>`). The API exposes no mutations for these models.

  Process: a
    .model({
      key: a.string().required(),
      name: a.string().required(),
      description: a.string(),
    })
    .authorization((allow) => [allow.authenticated().to(['read'])]),

  Phase: a
    .model({
      processId: a.id().required(),
      key: a.string().required(),
      name: a.string().required(),
      order: a.integer().required(),
      description: a.string(),
    })
    .authorization((allow) => [allow.authenticated().to(['read'])]),

  // Aim, deliverables, actors, referent and time are fields of the step, not separate models.
  Step: a
    .model({
      processId: a.id().required(),
      phaseId: a.id().required(),
      key: a.string().required(),
      name: a.string().required(),
      order: a.integer().required(), // position in the process; for a sub-step, position within its parent
      optional: a.boolean(),
      // A step can be a repeated cycle of sub-steps (e.g. sprints): sub-steps point to it with parentStepId,
      // and iterations is how many repetitions the screen shows.
      parentStepId: a.id(),
      iterations: a.integer(),
      aim: a.string(),
      deliverables: a.string().array(),
      actors: a.string().array(),
      referent: a.string(),
      time: a.string(),
    })
    .authorization((allow) => [allow.authenticated().to(['read'])]),

  // Entry (dor) or exit (dod) gate of a phase.
  Gate: a
    .model({
      processId: a.id().required(),
      phaseId: a.id().required(),
      kind: a.enum(['dor', 'dod']),
      name: a.string(),
      criteria: a.string().array(),
    })
    .authorization((allow) => [allow.authenticated().to(['read'])]),

  // Only non-linear transitions are stored; the forward flow follows Step.order.
  Transition: a
    .model({
      processId: a.id().required(),
      fromStepId: a.id().required(),
      toStepId: a.id().required(),
      kind: a.enum(['return', 'loop']),
      label: a.string(),
    })
    .authorization((allow) => [allow.authenticated().to(['read'])]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: 'userPool' },
});
