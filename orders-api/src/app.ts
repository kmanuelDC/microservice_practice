// app.ts
import express from 'express';
import routerOrders from './interfaces/http/routers/orders.router.js';
import routerProducts from './interfaces/http/routers/products.router.js';
import { mountDocs } from './docs.js';

const app = express();
app.use(express.json());
app.use(routerOrders);
app.use(routerProducts);
mountDocs(app);

export default app;
