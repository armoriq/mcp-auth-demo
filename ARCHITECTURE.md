# ArmorIQ Architecture

## System Overview

ArmorIQ provides a zero-trust security layer between AI agents and Model Context Protocol (MCP) endpoints.

## Component Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          User/Application                         │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            │ Natural Language Query
                            │
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                         AI Agent Layer                           │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  OpenAI GPT-4 / Claude / Gemini                        │    │
│  │  - Function calling                                     │    │
│  │  - Tool use                                             │    │
│  │  - Context management                                   │    │
│  └────────────────────────┬───────────────────────────────┘    │
└────────────────────────────┼────────────────────────────────────┘
                             │
                             │ HTTP Request
                             │ Headers: X-ArmorIQ-API-Key
                             │          X-ArmorIQ-Agent-ID
                             │
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                    ArmorIQ Proxy Layer                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  1. API Key Verification (bcrypt)                        │  │
│  │     ┌─────────────────────────────┐                      │  │
│  │     │ bcrypt.compare(key, hash)   │                      │  │
│  │     └──────────┬──────────────────┘                      │  │
│  │                │                                          │  │
│  │                ↓ ✅ Valid                                 │  │
│  │  ┌─────────────────────────────────────────────────┐    │  │
│  │  │  2. Policy Evaluation Engine                    │    │  │
│  │  │     ┌──────────────────────────────────┐        │    │  │
│  │  │     │ HTTP Method → CRUD Permission    │        │    │  │
│  │  │     │ GET     → read                   │        │    │  │
│  │  │     │ POST    → create                 │        │    │  │
│  │  │     │ PUT     → update                 │        │    │  │
│  │  │     │ DELETE  → delete                 │        │    │  │
│  │  │     └──────────┬───────────────────────┘        │    │  │
│  │  │                │                                 │    │  │
│  │  │                ↓ Check agent policy              │    │  │
│  │  │     ┌──────────────────────────────────┐        │    │  │
│  │  │     │ agentPolicies.get(agentId)       │        │    │  │
│  │  │     │ {                                 │        │    │  │
│  │  │     │   read: true,                     │        │    │  │
│  │  │     │   create: true,                   │        │    │  │
│  │  │     │   update: true,                   │        │    │  │
│  │  │     │   delete: false  ❌              │        │    │  │
│  │  │     │ }                                 │        │    │  │
│  │  │     └──────────┬───────────────────────┘        │    │  │
│  │  └────────────────┼──────────────────────────────┬─┘    │  │
│  │                   │                              │      │  │
│  │                   ↓ ✅ Authorized               ↓ ❌    │  │
│  │  ┌────────────────────────────┐    ┌──────────────────┐│  │
│  │  │  3. Audit Logger           │    │  Access Denied   ││  │
│  │  │  {                          │    │  403 Forbidden   ││  │
│  │  │    timestamp,               │    └──────────────────┘│  │
│  │  │    agentId,                 │                        │  │
│  │  │    method,                  │                        │  │
│  │  │    path,                    │                        │  │
│  │  │    status: "GRANTED"        │                        │  │
│  │  │  }                          │                        │  │
│  │  └────────────┬────────────────┘                        │  │
│  │               │                                          │  │
│  │               ↓ Forward request                          │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │  4. Request Forwarder                            │  │  │
│  │  │     - Strips security headers                    │  │  │
│  │  │     - Proxies to MCP endpoint                    │  │  │
│  │  │     - Returns response                           │  │  │
│  │  └──────────────┬───────────────────────────────────┘  │  │
│  └─────────────────┼──────────────────────────────────────┘  │
└──────────────────┼──────────────────────────────────────────┘
                   │
                   │ Authorized HTTP Request
                   │
                   ↓
┌─────────────────────────────────────────────────────────────────┐
│                      MCP Endpoint Layer                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Customer Data Service (Example)                         │  │
│  │  - GET /api/customers          (READ)                    │  │
│  │  - GET /api/customers/:id      (READ)                    │  │
│  │  - POST /api/customers         (CREATE)                  │  │
│  │  - PUT /api/customers/:id      (UPDATE)                  │  │
│  │  - DELETE /api/customers/:id   (DELETE)                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  MCP Discovery                                           │  │
│  │  GET /.well-known/mcp                                    │  │
│  │  {                                                        │  │
│  │    "@context": "...",                                    │  │
│  │    "type": "Service",                                    │  │
│  │    "capabilities": { "customers": { ... } }              │  │
│  │  }                                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Security Flow

### Successful Request (READ allowed)

```
1. Agent calls: GET /proxy/customer-data-service/api/customers
   Headers: X-ArmorIQ-API-Key: demo-key-xxx
            X-ArmorIQ-Agent-ID: agent-123

2. ArmorIQ verifies API key:
   bcrypt.compare("demo-key-xxx", stored_hash) → ✅ Valid

3. ArmorIQ checks policy:
   Method: GET → Permission: read
   Agent policy: { read: true } → ✅ Allowed

4. ArmorIQ logs:
   { timestamp, agentId, method: "GET", status: "GRANTED" }

5. ArmorIQ forwards:
   GET http://localhost:3001/api/customers

6. MCP endpoint responds:
   { success: true, data: [...customers...] }

7. Response returned to agent → LLM → User
```

### Denied Request (DELETE not allowed)

```
1. Agent calls: DELETE /proxy/customer-data-service/api/customers/1
   Headers: X-ArmorIQ-API-Key: demo-key-xxx
            X-ArmorIQ-Agent-ID: agent-123

2. ArmorIQ verifies API key:
   bcrypt.compare("demo-key-xxx", stored_hash) → ✅ Valid

3. ArmorIQ checks policy:
   Method: DELETE → Permission: delete
   Agent policy: { delete: false } → ❌ DENIED

4. ArmorIQ logs:
   { timestamp, agentId, method: "DELETE", status: "DENIED" }

5. ArmorIQ responds:
   403 Forbidden
   {
     error: "Agent does not have delete permission",
     required: "delete",
     granted: ["read", "create", "update"]
   }

6. Agent receives denial → LLM explains to user
```

## Data Flow

### Request Path
```
User Query
  ↓
LLM (GPT-4) decides action
  ↓
Agent function call
  ↓
HTTP → ArmorIQ Proxy (security layer)
  ↓
MCP Endpoint (if authorized)
```

### Response Path
```
MCP Endpoint data
  ↓
ArmorIQ Proxy (logs & forwards)
  ↓
Agent receives response
  ↓
LLM formats for user
  ↓
User sees result
```

## Key Security Features

### 1. API Key Hashing (bcrypt)
- Keys hashed with bcrypt (cost factor 10)
- Comparison via `bcrypt.compare()`
- Never store plaintext keys

### 2. CRUD Permission Matrix
```javascript
{
  read: boolean,    // GET requests
  create: boolean,  // POST requests
  update: boolean,  // PUT/PATCH requests
  delete: boolean   // DELETE requests
}
```

### 3. Comprehensive Audit Trail
Every request logged with:
- Timestamp
- Agent ID
- HTTP method
- Path
- Status (GRANTED/DENIED/ERROR)
- Reason

### 4. Zero-Trust Principle
- Default deny all
- Explicit allow per permission
- No direct endpoint access
- All requests proxied

## Deployment Architecture

### Development
```
localhost:3001 - MCP Endpoint
localhost:5001 - ArmorIQ Proxy
Agent runs locally with OpenAI API
```

### Production
```
┌─────────────────────────────────────┐
│  Load Balancer (TLS termination)    │
└─────────────┬───────────────────────┘
              │
    ┌─────────┴─────────┐
    │                   │
    ↓                   ↓
┌─────────┐       ┌─────────┐
│ArmorIQ  │       │ArmorIQ  │  (Multiple instances)
│Proxy 1  │       │Proxy 2  │
└────┬────┘       └────┬────┘
     │                 │
     └────────┬────────┘
              │
    ┌─────────┴─────────┐
    │                   │
    ↓                   ↓
┌─────────┐       ┌─────────┐
│  MCP    │       │  MCP    │  (Isolated network)
│Endpoint1│       │Endpoint2│
└─────────┘       └─────────┘
```

## Technology Stack

- **Proxy:** Node.js, Express, bcryptjs
- **Agent:** OpenAI SDK, Axios
- **MCP Endpoint:** Express, RESTful API
- **Storage:** PostgreSQL (production), In-memory (demo)

## Scalability Considerations

1. **Horizontal Scaling:** Multiple proxy instances behind load balancer
2. **Caching:** Redis for policy lookups
3. **Database:** PostgreSQL for persistent storage
4. **Monitoring:** Prometheus metrics, Grafana dashboards
5. **Rate Limiting:** Per-agent request throttling
