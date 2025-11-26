# Microservices Monorepo – Distributed Architecture

## 🧩 Descripción general
Este proyecto implementa un ecosistema **basado en microservicios**, compuesto por tres APIs independientes que se comunican vía HTTP y utilizan **JWT** y **Service Tokens** para autenticación interna.  
Cada servicio es totalmente autónomo, containerizado con **Docker**, documentado con **OpenAPI** y preparado para despliegue local o en la nube.

---

## 🏗️ Microservicios

| Servicio | Puerto | Descripción |
|-----------|---------|-------------|
| **customers-api** | `3001` | CRUD de clientes con protección mediante `SERVICE_TOKEN`. |
| **orders-api** | `3002` | Gestión de productos, órdenes e idempotencia. |
| **lambda-orchestrator** | `3003` | Orquestador que coordina todo el flujo de creación y confirmación de órdenes. |

---

## ⚙️ Arquitectura general

```
monorepo/
├── customers-api/
├── orders-api/
├── lambda-orchestrator/
├── db/
└── docker-compose.yml
```

Cada microservicio incluye:
- src/  
- Dockerfile  
- openapi.yaml  
- README.md  

---

## 🚀 Requisitos previos

- Node.js 20+
- Docker / Docker Compose
- NPM 10+
- (Opcional) Ngrok para exponer servicios

---

## ▶️ Ejecución con Docker Compose

```bash
docker compose up -d --build
```

### Accesos

| Servicio | URL | Swagger |
|-----------|------|---------|
| Customers API | http://localhost:3001 | http://localhost:3001/docs |
| Orders API | http://localhost:3002 | http://localhost:3002/docs |
| Lambda Orchestrator | http://localhost:3003 | http://localhost:3003/docs |

---

## 🧠 Flujo principal – Lambda Orchestrator

### Endpoint:
`POST /orchestrator/create-and-confirm-order`

### Flujo:
1. Valida cliente (`customers-api`)
2. Crea la orden (`orders-api`)
3. Confirma la orden (idempotente)
4. Devuelve un payload unificado

### Ejemplo:
```json
{
  "customer_id": 1,
  "items": [{ "product_id": 1, "qty": 3 }],
  "idempotency_key": "abc-001",
  "correlation_id": "req-001"
}
```

---

## 🔐 Autenticación

### JWT
```
Authorization: Bearer <jwt_token>
```

### Service Token (entre microservicios)
```
Authorization: Bearer service-secret
```

.env:
```
SERVICE_TOKEN=service-secret
```

---

## 🧾 Idempotencia (Orders API)

Header obligatorio:
```
X-Idempotency-Key: abc-001
```

La misma key devuelve la misma respuesta sin duplicar acciones.

### Tabla asociada
```sql
CREATE TABLE idempotency_keys (
  `key` VARCHAR(128) PRIMARY KEY,
  target_type ENUM('order_confirm') NOT NULL,
  target_id BIGINT NOT NULL,
  status ENUM('SUCCEEDED','FAILED') NOT NULL,
  response_body JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL
);
```

---

## 🧰 Comandos útiles

| Acción | Comando |
|--------|----------|
| Build | `npm run build` |
| Tests | `npm test` |
| Levantar documentación | `npm run docs:serve` |
| Lint OpenAPI | `npm run docs:lint` |
| Detener todo | `docker compose down` |
| Limpiar | `docker system prune -af` |

---

## 📚 Stack técnico

| Área | Tecnología |
|------|-------------|
| Backend | Node.js 20 + Express |
| Infra | Docker + Compose |
| Orquestador | Serverless Framework 4 |
| DB | MySQL 8 |
| Docs | OpenAPI + Swagger UI |
| Validación | Zod |
| Auth | JWT + Service Token |
| Idempotencia | MySQL TTL (1 día) |

---

## 🧪 Pruebas rápidas

### Crear cliente
```json
POST /customers
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "999888777"
}
```

### Crear producto
```json
POST /products
{
  "name": "Laptop HP",
  "price_cents": 129900,
  "stock": 10
}
```

### Orquestar orden
```json
POST /orchestrator/create-and-confirm-order
{
  "customer_id": 1,
  "items": [{ "product_id": 1, "qty": 3 }],
  "idempotency_key": "abc-001",
  "correlation_id": "req-001"
}
```

---

## 🌐 Serverless Offline + Ngrok

1. Copiar `.env.example` → `.env`
2. Levantar servicios:
```bash
docker compose up -d --build
```
3. Iniciar orchestrator:
```bash
cd lambda-orchestrator
npm run dev
```
4. (Opcional)
```bash
ngrok http 3003
```

---

## 🧭 Licencia
MIT © 2025  
Desarrollado por **Segundo Manuel Díaz Calua**
