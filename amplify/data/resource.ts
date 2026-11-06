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
    })
    .authorization((allow) => [allow.authenticated()]),

  Relation: a
    .model({
      sourceId: a.id().required(),
      targetId: a.id().required(),
      kind: a.string().required(), // uses | references (list in src/client.ts)
    })
    .authorization((allow) => [allow.authenticated()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: 'userPool' },
});
