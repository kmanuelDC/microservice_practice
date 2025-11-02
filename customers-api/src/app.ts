import express from 'express';
import router from './interfaces/http/routers/customersRouter.js';
import bodyParser from 'body-parser';
import { mountDocs } from './docs.js';

const app = express();
app.use(bodyParser.json());
app.use(router);
mountDocs(app);
export default app;