# ArmorIQ Proxy

Zero-trust proxy layer for securing AI agent access to MCP endpoints.

## Features

- **API Key Verification:** Bcrypt-hashed key validation
- **CRUD Authorization:** Method-based permission checking
- **Audit Logging:** Comprehensive request/response logging
- **Zero-Trust:** All requests must pass authentication AND authorization
- **Forbidden Headers:** Filters security-sensitive headers
- **mTLS (optional):** Validate client certificates with a provided CA bundle
- **JWT Access Tokens:** Signed, expiring grants convey per-endpoint permissions and resource scopes
- **MCP Metadata Mirror:** Serve MCP resources/prompts/tools for web backends

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

## Containerized Deployment

The Docker image includes an entrypoint that accepts runtime arguments so it can be orchestrated from backends:

```bash
docker run armoriq-proxy:local \
  --mcp-endpoint https://mcp.example.com \
  --client-ca /certs/client-ca.pem \
  --server-cert /certs/proxy.crt \
  --server-key /certs/proxy.key \
  --mcp-definition /config/mcp-definition.yaml \
  --token-jwks /config/token-signers.jwks \
  --token-audience armoriq-proxy
```

Available options:

- `--mcp-endpoint` *(URL)* – overrides `MCP_ENDPOINT_URL`
- `--client-ca` / `--client-ca-inline` / `--client-ca-b64` – supply a CA certificate for mutual TLS validation
- `--server-cert`, `--server-key` *(and inline/b64 variants)* – TLS identity for the proxy
- `--mcp-definition` *(JSON/YAML)* – resources, prompts, tools, policies, and endpoint details to preload
- `--token-public-key` / `--token-jwks` *(PEM or JWKS)* – verification material for JWT access tokens
- `--token-issuer`, `--token-audience`, `--token-alg` – optional claim/algorithm constraints for JWT validation

Environment variables (`MCP_ENDPOINT_URL`, `CLIENT_CA_CERT_PATH`, `PROXY_TLS_CERT_PATH`, `PROXY_TLS_KEY_PATH`, `MCP_DEFINITION_PATH`, `MCP_DEFINITION_JSON`) provide the same controls when running without the helper script.
Supply `ARMORIQ_TOKEN_PUBLIC_KEY_PATH` or `ARMORIQ_TOKEN_JWKS_PATH` (and optional issuer/audience overrides) when running without Docker arguments.

## Access Tokens

ArmorIQ no longer stores policies locally. Instead, every request must present a signed JWT (JSON Web Token) conveying the caller's permissions. Tokens are expected in either the `Authorization: Bearer <token>` header or `X-ArmorIQ-Access-Token` header.

Minimum JWT claims:

- `iss`, `aud`, `exp` – standard security claims, validated against the configured expectations.
- `sub` – agent identifier (recorded in audit logs).
- `policies` – array of policy objects describing endpoint access.

Example payload:

```json
{
  "iss": "https://auth.armoriq.local",
  "aud": "armoriq-proxy",
  "sub": "agent-123",
  "exp": 1737072000,
  "policies": [
    {
      "endpoint": "customer-data-service",
      "permissions": {
        "read": ["/api/customers", "/api/customers/*"],
        "update": ["/api/customers/*"]
      }
    }
  ]
}
```

- `permissions.<verb>` accepts `true`, an array of allowed resource paths, or objects with a `paths` field. Wildcards (`*`) may suffix a path.
- Alternatively, `scopes` can embed strings like `"customer-data-service:read:/api/customers/*"` or `"read:/api/summary"`.

Tokens must be signed by a key advertised via the configured PEM public key or JWKS. The proxy enforces signature validity, expiration, audience/issuer, and that the requested endpoint/resource/method fits one of the token's grants.

## Usage

### Proxy Request Pattern

```
http://localhost:5001/proxy/{endpointId}/{path}
```

**Required Headers:**
- `X-ArmorIQ-API-Key`: Endpoint API key
- `Authorization: Bearer <JWT>` (or `X-ArmorIQ-Access-Token`)

### Example: Agent Reading Customers

```bash
curl http://localhost:5001/proxy/customer-data-service/api/customers \
  -H "X-ArmorIQ-API-Key: demo-key-12345678901234567890" \
  -H "Authorization: Bearer <SIGNED_TOKEN>"
```

### Example: Agent Attempting Delete (Denied)

```bash
curl -X DELETE http://localhost:5001/proxy/customer-data-service/api/customers/1 \
  -H "X-ArmorIQ-API-Key: demo-key-12345678901234567890" \
  -H "Authorization: Bearer <SIGNED_TOKEN>"
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
- **Token subject:** Expect tokens with `sub: agent-123`
- **Permissions:** Grant READ/CREATE/UPDATE scopes via the JWT (DELETE denied)

## Security Features

### 1. API Key Hashing
```javascript
const hashedKey = await bcrypt.hash(apiKey, 10);
const isValid = await bcrypt.compare(providedKey, hashedKey);
```

### 2. Token-Based Permission Matrix
```json
{
  "policies": [
    {
      "endpoint": "customer-data-service",
      "permissions": {
        "read": ["/api/customers", "/api/customers/*"],
        "create": true,
        "update": ["/api/customers/*"],
        "delete": false
      }
    }
  ]
}
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

- `GET /health` - Health check and stats (includes token verifier mode)
- `GET /api/audit-logs` - View audit trail (last 100 entries)
- `GET /api/mcp` - Full MCP metadata payload (endpoint/resources/prompts/tools)
- `GET /api/mcp/resources` - Resources advertised by the MCP endpoint
- `GET /api/mcp/prompts` - Prompt templates advertised by the MCP endpoint
- `GET /api/mcp/tools` - Tool definitions advertised by the MCP endpoint
- `ALL /proxy/:endpointId/*` - Secure proxy route (JWT + API key required)

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
  -H "Authorization: Bearer <SIGNED_TOKEN_WITH_READ_SCOPE>"

# Should fail (DELETE not allowed)
curl -X DELETE http://localhost:5001/proxy/customer-data-service/api/customers/1 \
  -H "X-ArmorIQ-API-Key: demo-key-12345678901234567890" \
  -H "Authorization: Bearer <SIGNED_TOKEN_WITHOUT_DELETE>"
```

## Token Demo Script

Run `scripts/run_token_demo.sh` to generate demo assets (self-signed TLS certs, JWKS, and a signed JWT), launch the sample MCP endpoint locally, and start the proxy container with HTTPS + token enforcement enabled. The script finishes by issuing a few `curl` calls that show anonymous access being denied, an authorized `GET` succeeding, and a denied `DELETE`. When done exploring, shut everything down with `docker compose down`.
