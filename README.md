# ArmorIQ Demo Package

This package contains example implementations demonstrating how ArmorIQ secures AI agent communication with MCP endpoints.

## Components

### 1. MCP Endpoint Example (`/mcp-endpoint-example`)
A sample Model Context Protocol (MCP) server that provides data services. This represents any MCP-compliant service that agents want to access.

### 2. Agent Example (`/agent-example`)
A sample AI agent (using OpenAI GPT-4) that accesses MCP endpoints through ArmorIQ's secure proxy layer.

### 3. ArmorIQ Proxy (`/armoriq-proxy`)
The zero-trust proxy layer that sits between agents and MCP endpoints, enforcing:
- API key verification (bcrypt-hashed)
- CRUD permission authorization
- Policy-based access control
- Comprehensive audit logging

### 4. Admin API (`/admin-api`)
FastAPI service that surfaces proxy health, audit logs, and policy management endpoints for UI integrations.

## Architecture

```
[AI Agent] ---(requests)---> [ArmorIQ Proxy] ---(authorized)---> [MCP Endpoint]
                                    |
                              [Policy Engine]
                              [Audit Logger]
```

## Quick Start

1. **Set up the MCP Endpoint:**
   ```bash
   cd mcp-endpoint-example
   npm install
   npm start
   ```

2. **Configure ArmorIQ Proxy:**
   ```bash
   cd armoriq-proxy
   npm install
   # Set environment variables (see .env.example)
   npm start
   ```

3. **Run the Agent:**
   ```bash
   cd agent-example
   npm install
   # Configure OPENAI_API_KEY and ARMORIQ_ENDPOINT
   npm start
   ```

4. **Launch the Admin API UI:**
   ```bash
   ADMIN_API_HOST_PORT=8000 ARMORIQ_PROXY_HOST_PORT=5001 \
   docker compose up --build armoriq-proxy admin-api
   ```
   When the containers are running, open `http://localhost:8000/docs` to view the FastAPI Swagger UI. From there you can:
   - Check proxy health via `GET /status`
   - Review audit trails with `GET /logs`
   - Enumerate registered endpoints (`GET /endpoints`)
   - Manage agent policies (`GET/POST/PUT/DELETE /policies`)

## Key Features Demonstrated

- **Zero-Trust Access:** All agent requests go through ArmorIQ proxy
- **Policy Enforcement:** CRUD permissions enforced at proxy layer
- **Cryptographic Binding:** API keys securely hashed with bcrypt
- **Audit Logging:** Complete request/response logging
- **MCP Compliance:** Standard MCP protocol implementation

## Environment Variables

See individual component directories for specific configuration requirements.

## Security Notes

- Never expose MCP endpoints directly to agents
- Always route through ArmorIQ proxy
- Use strong API keys (minimum 32 characters)
- Regularly rotate credentials
- Monitor audit logs for suspicious activity

## License

MIT License - For demonstration purposes only
