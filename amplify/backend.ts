import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';

const backend = defineBackend({ auth, data });

// Admins create users; nobody can sign themselves up.
backend.auth.resources.cfnResources.cfnUserPool.adminCreateUserConfig = {
  allowAdminCreateUserOnly: true,
};
