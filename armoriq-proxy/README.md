# ArmorIQ Proxy

Zero-trust proxy layer for securing AI agent access to MCP endpoints.

## Features

- **API Key Verification:** Bcrypt-hashed key validation
- **CRUD Authorization:** Method-based permission checking
- **Audit Logging:** Comprehensive request/response logging
- **Zero-Trust:** All requests must pass authentication AND authorization
- **Forbidden Headers:** Filters security-sensitive headers

## Architecture

```
Agent → [API Key Auth] → [Policy Check] → [Audit Log] → MCP Endpoint
                ↓              ↓              ↓
             bcrypt        CRUD perms    persistent log
```

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```env
PORT=5001
MCP_ENDPOINT_URL=http://localhost:3001
```

## Running

```bash
npm start
```

## Usage

### Proxy Request Pattern

```
http://localhost:5001/proxy/{endpointId}/{path}
```

**Required Headers:**
- `X-ArmorIQ-API-Key`: Endpoint API key
- `X-ArmorIQ-Agent-ID`: Agent identifier

### Example: Agent Reading Customers

```bash
curl http://localhost:5001/proxy/customer-data-service/api/customers \
  -H "X-ArmorIQ-API-Key: demo-key-12345678901234567890" \
  -H "X-ArmorIQ-Agent-ID: agent-123"
```

### Example: Agent Attempting Delete (Denied)

```bash
curl -X DELETE http://localhost:5001/proxy/customer-data-service/api/customers/1 \
  -H "X-ArmorIQ-API-Key: demo-key-12345678901234567890" \
  -H "X-ArmorIQ-Agent-ID: agent-123"
```

Response:
```json
{
  "error": "Agent does not have delete permission",
  "required": "delete",
  "granted": ["read", "create", "update"]
}
```

## Sample Configuration

The demo initializes with:

- **Endpoint ID:** `customer-data-service`
- **API Key:** `demo-key-12345678901234567890`
- **Agent ID:** `agent-123`
- **Permissions:** READ, CREATE, UPDATE (DELETE denied)

## Security Features

### 1. API Key Hashing
```javascript
const hashedKey = await bcrypt.hash(apiKey, 10);
const isValid = await bcrypt.compare(providedKey, hashedKey);
```

### 2. CRUD Permission Matrix
```javascript
const policy = {
  read: true,
  create: true,
  update: true,
  delete: false
};
```

### 3. Audit Trail
```javascript
{
  timestamp: "2025-01-09T12:00:00.000Z",
  endpointId: "customer-data-service",
  agentId: "agent-123",
  method: "DELETE",
  path: "/api/customers/1",
  status: "DENIED",
  message: "Missing delete permission"
}
```

## API Endpoints

- `GET /health` - Health check and stats
- `GET /api/audit-logs` - View audit trail (last 100 entries)
- `ALL /proxy/:endpointId/*` - Secure proxy route

## Production Considerations

1. **Database Storage:** Replace in-memory Maps with PostgreSQL
2. **Secret Management:** Use proper secret management (Vault, AWS Secrets Manager)
3. **Rate Limiting:** Add rate limiting per agent
4. **TLS:** Enable HTTPS
5. **Monitoring:** Add Prometheus metrics
6. **Key Rotation:** Implement automatic API key rotation

## Testing

Test permission enforcement:

```bash
# Should succeed (READ allowed)
curl http://localhost:5001/proxy/customer-data-service/api/customers \
  -H "X-ArmorIQ-API-Key: demo-key-12345678901234567890" \
  -H "X-ArmorIQ-Agent-ID: agent-123"

# Should fail (DELETE not allowed)
curl -X DELETE http://localhost:5001/proxy/customer-data-service/api/customers/1 \
  -H "X-ArmorIQ-API-Key: demo-key-12345678901234567890" \
  -H "X-ArmorIQ-Agent-ID: agent-123"
```
