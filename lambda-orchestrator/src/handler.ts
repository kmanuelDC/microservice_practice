// handler.ts — Cumple con la PT: valida cliente via /internal con SERVICE_TOKEN,
// crea y confirma orden en Orders usando un JWT de servicio corto.

import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ENV as env } from './config/env.js';


// -----------------------
// Tipos
// -----------------------
type Item = { product_id: number; qty: number };
type Body = {
    customer_id: number;
    items: Item[];
    idempotency_key: string;
    correlation_id?: string;
};

type ApiGwEvent = {
    body?: string | Body;
    headers?: Record<string, string | undefined>;
};

// -----------------------
// Utilidades
// -----------------------
const fetchJson = async (url: string, init: RequestInit & { timeoutMs?: number } = {}) => {
    console.log('fetchJson', url, init);
    const controller = new AbortController();
    const timeout = setTimeout(
        () => controller.abort(),
        init.timeoutMs ?? Number(process.env.REQUEST_TIMEOUT_MS ?? 5000),
    );
    try {
        const res = await fetch(url, { ...init, signal: controller.signal });
        const text = await res.text();
        let json: any;
        try { json = text ? JSON.parse(text) : undefined; } catch { json = { raw: text }; }
        return { ok: res.ok, status: res.status, json };
    } finally {
        clearTimeout(timeout);
    }
};

const jsonResponse = (statusCode: number, body: unknown, extraHeaders?: Record<string, string>) => ({
    statusCode,
    headers: {
        'Content-Type': 'application/json',
        ...(extraHeaders || {}),
    },
    body: JSON.stringify(body),
});

const isPositiveInt = (n: unknown) => Number.isInteger(n) && (n as number) > 0;

const validateBody = (b: any): { ok: true; data: Body } | { ok: false; error: string } => {
    //console.log('validateBody', b);
    if (!b || typeof b !== 'object') return { ok: false, error: 'Body must be a JSON object' };
    if (!isPositiveInt(b.customer_id)) return { ok: false, error: 'customer_id must be a positive integer' };
    if (!Array.isArray(b.items) || b.items.length === 0) return { ok: false, error: 'items must be a non-empty array' };
    for (const it of b.items) {
        if (!isPositiveInt(it?.product_id) || !isPositiveInt(it?.qty)) {
            return { ok: false, error: 'each item must have positive integer product_id and qty' };
        }
    }
    if (typeof b.idempotency_key !== 'string' || !b.idempotency_key.trim()) {
        return { ok: false, error: 'idempotency_key is required' };
    }
    return {
        ok: true,
        data: {
            customer_id: Number(b.customer_id),
            items: b.items.map((i: any) => ({ product_id: Number(i.product_id), qty: Number(i.qty) })),
            idempotency_key: String(b.idempotency_key),
            correlation_id: b.correlation_id ? String(b.correlation_id) : undefined,
        },
    };
};

// -----------------------
// Handler (S2S requerido por la PT)
// -----------------------
export async function handler(event: ApiGwEvent) {
    // 0) Parseo body
    let bodyRaw: any;
    try {
        bodyRaw = typeof event?.body === 'string' ? JSON.parse(event!.body as string) : event?.body;
    } catch {
        return jsonResponse(400, { error: 'Invalid JSON body' });
    }

    const validated = validateBody(bodyRaw);
    if (!validated.ok) return jsonResponse(400, { error: validated.error });
    const body = validated.data;

    // 1) Correlation Id
    const correlationId = body.correlation_id || randomUUID();
    const baseHeaders = {
        'Content-Type': 'application/json',
        'X-Correlation-Id': correlationId,
    };

    // 2) Env vars requeridas
    const CUSTOMERS_BASE = env.CUSTOMERS_BASE;
    const ORDERS_BASE = env.ORDERS_BASE;
    const SERVICE_TOKEN = env.SERVICE_TOKEN;
    const JWT_SECRET = env.JWT_SECRET;
    //console.log('SERVICE_TOKEN', SERVICE_TOKEN);
    if (!CUSTOMERS_BASE || !ORDERS_BASE || !SERVICE_TOKEN || !JWT_SECRET) {
        return jsonResponse(500, {
            error: 'Missing required env variables',
            missing: {
                CUSTOMERS_API_BASE: !CUSTOMERS_BASE,
                ORDERS_API_BASE: !ORDERS_BASE,
                SERVICE_TOKEN: !SERVICE_TOKEN,
                JWT_SECRET: !JWT_SECRET,
            },
            correlation_id: correlationId,
        });
    }

    // 3) Valida cliente via endpoint interno (requisito explícito de la PT)
    {
        const url = `${CUSTOMERS_BASE}/internal/customers/${body.customer_id}`;
        console.log('url', url);

        const r = await fetchJson(url, {
            method: 'GET',
            headers: { ...baseHeaders, Authorization: `Bearer ${SERVICE_TOKEN}` },
        });

        if (!r.ok) {
            return jsonResponse(400, {
                error: 'Invalid customer (internal check failed)',
                correlation_id: correlationId,
                upstream_status: r.status,
                details: r.json,
            });
        }
    }

    //console.log('JWT_SECRET', JWT_SECRET);
    // 4) Token s2s corto para Orders (JWT simple)
    const ordersToken = jwt.sign(
        { sub: 'lambda-orchestrator', role: 'service', aud: 'orders-api' },
        JWT_SECRET,
        { expiresIn: '5m' },
    );

    // 5) Crear orden (CREATED) en Orders
    const createOrder = await fetchJson(`${ORDERS_BASE}/orders`, {
        method: 'POST',
        headers: { ...baseHeaders, Authorization: `Bearer ${ordersToken}` },
        body: JSON.stringify({ customer_id: body.customer_id, items: body.items }),
    });
    console.log('llega a  createOrder', createOrder);

    if (!createOrder.ok) {
        return jsonResponse(502, {
            error: 'Failed to create order',
            correlation_id: correlationId,
            upstream_status: createOrder.status,
            details: createOrder.json,
        });
    }

    const orderCreated = createOrder.json;

    const confirm = await fetchJson(`${ORDERS_BASE}/orders/${orderCreated.id}/confirm`, {
        method: 'POST',
        headers: {
            ...baseHeaders,
            Authorization: `Bearer ${ordersToken}`,
            'X-Idempotency-Key': body.idempotency_key,
        },
    });

    if (!confirm.ok) {
        return jsonResponse(502, {
            error: 'Failed to confirm order',
            correlation_id: correlationId,
            upstream_status: confirm.status,
            details: confirm.json,
        });
    }

    const confirmed = confirm.json; 
    const customerResp = await fetchJson(`${CUSTOMERS_BASE}/internal/customers/${body.customer_id}`, {
        method: 'GET',
        headers: { ...baseHeaders, Authorization: `Bearer ${SERVICE_TOKEN}` },
    });
    console.log('customerResp', customerResp);

    return jsonResponse(201, {
        success: true,
        correlationId: correlationId,
        data: {
            customer: customerResp.ok ? customerResp.json : undefined,
            order: confirmed,
        },
    });
}
