// src/docs.ts
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

export function mountDocs(app: express.Express, opts?: { route?: string; file?: string }) {
    const route = opts?.route ?? '/docs';
    const file = opts?.file ?? path.join(process.cwd(), 'openapi.yaml');

    const spec = parse(readFileSync(file, 'utf8')); // usa 'yaml'

    app.use(route, swaggerUi.serve, swaggerUi.setup(spec, { explorer: true }));
}
