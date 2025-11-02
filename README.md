#  B2B Technical Challenge – Monorepo Architecture

##  Descripción general
Este proyecto implementa un ecosistema **B2B distribuido basado en microservicios**, compuesto por tres APIs independientes, comunicadas entre sí mediante HTTP y autenticadas con **JWT** y **Service Tokens**.  
Cada servicio está containerizado con **Docker**, documentado con **OpenAPI (Swagger)** y listo para despliegue local o en la nube.

---

##  Microservicios

| Servicio | Puerto | Descripción |
|-----------|---------|-------------|
| **customers-api** | `3001` | CRUD de clientes, validación interna con `SERVICE_TOKEN`. |
| **orders-api** | `3002` | Gestión de productos, órdenes e idempotencia. |
| **lambda-orchestrator** | `3003` | Simulación de Lambda AWS que orquesta los flujos completos de creación y confirmación de órdenes. |

---

## ⚙️ Arquitectura general

```
b2b_t3nich4l/
├── customers-api/
│   ├── src/
│   ├── Dockerfile
│   ├── openapi.yaml
│   └── README.md
├── orders-api/
│   ├── src/
│   ├── Dockerfile
│   ├── openapi.yaml
│   └── README.md
├── lambda-orchestrator/
│   ├── src/
│   ├── serverless.yml
│   ├── Dockerfile (opcional)
│   ├── openapi.yaml
│   └── README.md
├── db/
│   ├── schema.sql
│   └── seed.sql
└── docker-compose.yml
```

Cada servicio es autónomo, expone su propio Swagger `/docs` y puede ser levantado independientemente.

---

##  Requisitos previos

- Node.js 20+
- Docker y Docker Compose
- NPM 10 o superior
- (Opcional) Ngrok para exponer el orchestrator públicamente

---

##  Ejecución con Docker Compose

Desde la raíz del monorepo:

```bash
docker compose up -d --build
```

Esto levanta los tres servicios:

| Servicio | URL | Documentación |
|-----------|------|----------------|
| Customers API | http://localhost:3001 | http://localhost:3001/docs |
| Orders API | http://localhost:3002 | http://localhost:3002/docs |
| Lambda Orchestrator | http://localhost:3003 | http://localhost:3003/docs |

Verifica su estado:
```bash
docker ps
```

---

## 🧠 Flujo principal: Lambda Orchestrator

### Endpoint
`POST /orchestrator/create-and-confirm-order`

### Descripción
Este endpoint orquesta el flujo completo:

1. **Valida el cliente** en `customers-api` vía `/internal/customers/:id`.
2. **Crea la orden** en `orders-api` vía `POST /orders`.
3. **Confirma la orden** (idempotente) vía `POST /orders/:id/confirm` con header `X-Idempotency-Key`.
4. **Devuelve** un JSON consolidado con los datos del cliente, la orden confirmada y sus items.

### Ejemplo de request
```json
POST http://localhost:3003/orchestrator/create-and-confirm-order
Content-Type: application/json

{
  "customer_id": 1,
  "items": [
    { "product_id": 1, "qty": 3 }
  ],
  "idempotency_key": "abc-001",
  "correlation_id": "req-001"
}
```

### Ejemplo de respuesta (201)
```json
{
  "customer": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com"
  },
  "order": {
    "id": 1,
    "status": "CONFIRMED",
    "total_cents": 389700,
    "items": [
      { "product_id": 1, "qty": 3, "unit_price_cents": 129900 }
    ]
  }
}
```

Si se reenvía el mismo `idempotency_key`, devuelve el mismo resultado garantizando **idempotencia**.

---

## 🔐 Autenticación y seguridad

### JWT (para endpoints protegidos)
Cada servicio requiere un **token de acceso JWT** firmado con `JWT_SECRET`.  
Ejemplo:
```bash
Authorization: Bearer <jwt_token>
```

### Service Token (entre microservicios)
El orchestrator y Orders validan internamente las llamadas usando:
```bash
Authorization: Bearer service-secret
```

Variable controlada por:
```env
SERVICE_TOKEN=service-secret
```

---

## 🧾 Idempotencia (Orders API)

El endpoint `POST /orders/:id/confirm` usa un header obligatorio:

```bash
X-Idempotency-Key: abc-001
```

Si se reenvía la misma key:
- Devuelve la **misma respuesta** sin duplicar la acción.
- Si cambia el target (`order_id` diferente), responde `400 Idempotency key used for different target`.

### Tabla MySQL asociada
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

## 🌐 Pruebas locales con Serverless Offline + Ngrok

1. Iniciar docker-compose

    ```bash
    docker compose up -d --build
    ```
    
2. Ve al directorio del orchestrator:
   ```bash
   cd lambda-orchestrator
   npm run dev
   ```
   Esto inicia el entorno simulado Lambda en `http://localhost:3003`.

3. (Opcional) Exponer públicamente:
   ```bash
   ngrok http 3003
   ```
   Copia la URL HTTPS que genera Ngrok y úsala para probar desde Postman.

---

## 🧰 Comandos útiles

| Acción | Comando |
|--------|----------|
| Compilar todos los servicios | `npm run build` |
| Correr tests unitarios | `npm test` |
| Levantar documentación | `npm run docs:serve` |
| Lint OpenAPI specs | `npm run docs:lint` |
| Detener los servicios | `docker compose down` |
| Limpiar todo | `docker system prune -af` |

---

## 📚 Stack técnico

| Capa | Tecnología |
|------|-------------|
| **Runtime** | Node.js 20 |
| **Framework** | Express.js |
| **Infraestructura local** | Docker + Compose |
| **Orquestación Lambda** | Serverless Framework 4 + serverless-offline |
| **Base de datos** | MySQL 8 (Docker) |
| **Documentación** | OpenAPI 3.0 + Swagger UI |
| **Validación de datos** | Zod |
| **Autenticación** | JWT + Bearer Service Token |
| **Control de Idempotencia** | MySQL con TTL (1 día) |

---

## 🧪 Pruebas recomendadas

### 1️⃣ Crear un cliente
```bash
POST http://localhost:3001/customers
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "999888777"
}
```

### 2️⃣ Crear un producto
```bash
POST http://localhost:3002/products
{
  "name": "Laptop HP",
  "price_cents": 129900,
  "stock": 10
}
```

### 3️⃣ Orquestar orden
```bash
POST http://localhost:3003/orchestrator/create-and-confirm-order
{
  "customer_id": 1,
  "items": [{ "product_id": 1, "qty": 3 }],
  "idempotency_key": "abc-001",
  "correlation_id": "req-001"
}
```

---

## 🧭 Licencia

MIT License © 2025  
Desarrollado por **Segundo Manuel Díaz Calua**
