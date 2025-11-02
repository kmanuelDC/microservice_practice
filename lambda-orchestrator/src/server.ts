import express from 'express';
import { handler } from './handler.js';
import { mountDocs } from './docs.js';

const app = express();
app.use(express.json());
mountDocs(app);

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/orchestrator/create-and-confirm-order', async (req, res) => {
    try {
        const result = await handler({ body: req.body });
        res.status(result.statusCode || 200).send(result.body);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

const port = Number(process.env.PORT ?? 3003);
app.listen(port, () => console.log(`Orchestrator on :${port}`));
