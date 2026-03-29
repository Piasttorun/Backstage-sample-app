/**
 * metricsPlugin — Phase 1 stub
 *
 * Exposes POST /api/metrics/webhook
 *
 * GitLab CI pipelines should POST a JSON body here after each run:
 * {
 *   "entityRef": "component:default/java-sample-service",
 *   "pipelineId": "12345",
 *   "branch": "main",
 *   "metrics": {
 *     "testsPassed": 10,
 *     "testsFailed": 0,
 *     "testsSkipped": 0,
 *     "coveragePercent": 85.0,
 *     "duration": 42,
 *     "lintErrors": 0,
 *     "sastFindings": { "critical": 0, "high": 0, "medium": 0 }
 *   }
 * }
 *
 * Phase 1: logs the payload and returns 202.
 * Phase 2: writes to PostgreSQL metrics table and updates catalog entity annotations.
 */

import {
  createBackendPlugin,
  coreServices,
} from '@backstage/backend-plugin-api';
import type { JsonObject } from '@backstage/types';
import { Router } from 'express';

export const metricsPlugin = createBackendPlugin({
  pluginId: 'metrics',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        logger: coreServices.logger,
      },
      async init({ httpRouter, logger }) {
        const router = Router();

        // Allow unauthenticated access so GitLab CI can post without a Backstage token.
        // In Phase 2: validate a shared webhook secret via X-Gitlab-Token header.
        httpRouter.addAuthPolicy({
          path: '/webhook',
          allow: 'unauthenticated',
        });

        router.post('/webhook', (req, res) => {
          const payload = req.body as {
            entityRef?: string;
            pipelineId?: string;
            branch?: string;
            metrics?: JsonObject;
          };

          if (!payload.entityRef || !payload.metrics) {
            res
              .status(400)
              .json({ error: 'Missing required fields: entityRef, metrics' });
            return;
          }

          logger.info(
            `[metrics] Received pipeline result for ${payload.entityRef} ` +
              `(pipeline ${payload.pipelineId}, branch ${payload.branch})`,
            { metrics: payload.metrics },
          );

          // TODO (Phase 2): persist to metrics DB and update catalog annotations
          // await metricsStore.insert(payload);
          // await catalogClient.addOrUpdateAnnotations(payload.entityRef, { ... });

          res.status(202).json({ status: 'accepted' });
        });

        httpRouter.use(router);
      },
    });
  },
});
