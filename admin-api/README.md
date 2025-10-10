# ArmorIQ Admin API

FastAPI service that exposes administrative endpoints for the ArmorIQ proxy so UI clients can manage policies, inspect service status, and review audit logs.

## Endpoints

- `GET /status` – Proxy health and inventory (proxy `/health`)
- `GET /logs` – Last 100 audit log entries (proxy `/api/audit-logs`)
- `GET /endpoints` – Registered MCP endpoints
- `GET /policies` – List all agent policies
- `GET /policies/{agentId}` – Retrieve a specific policy
- `POST /policies` – Create a new agent policy
- `PUT /policies/{agentId}` – Update an existing agent policy
- `DELETE /policies/{agentId}` – Remove an agent policy

## Running locally

```bash
pip install -r requirements.txt
ARMORIQ_PROXY_URL=http://localhost:5001 uvicorn main:app --reload --port 8000
```

The service proxies all requests to the ArmorIQ proxy URL provided via `ARMORIQ_PROXY_URL` (defaults to `http://localhost:5001`).
