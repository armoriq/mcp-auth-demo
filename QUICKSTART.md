# ArmorIQ Demo - Quick Start Guide

Get the complete demo running in 5 minutes!

## Prerequisites

- Node.js 18+ installed
- OpenAI API key (for agent example)

## Step-by-Step Setup

### 1. Start the MCP Endpoint (Terminal 1)

```bash
cd mcp-endpoint-example
npm install
npm start
```

**Expected output:**
```
✅ MCP Endpoint running on http://localhost:3001
📋 Discovery: http://localhost:3001/.well-known/mcp
👥 Customers API: http://localhost:3001/api/customers

⚠️  WARNING: This endpoint should NOT be exposed directly to agents.
   Route all requests through ArmorIQ proxy for security.
```

**Test it:**
```bash
curl http://localhost:3001/api/customers
```

---

### 2. Start ArmorIQ Proxy (Terminal 2)

```bash
cd armoriq-proxy
npm install
npm start
```

**Expected output:**
```
📋 Sample Configuration Loaded:
   Endpoint ID: customer-data-service
   API Key: demo-key-12345678901234567890
   Agent ID: agent-123 (permissions: CRUD without Delete)

🛡️  ArmorIQ Proxy Server running on http://localhost:5001
📊 Health: http://localhost:5001/health
📜 Audit Logs: http://localhost:5001/api/audit-logs

🔐 Proxy Pattern:
   http://localhost:5001/proxy/{endpointId}/{path}
   Headers: X-ArmorIQ-API-Key, X-ArmorIQ-Agent-ID
```

**Test it:**
```bash
# This should succeed (READ allowed)
curl http://localhost:5001/proxy/customer-data-service/api/customers \
  -H "X-ArmorIQ-API-Key: demo-key-12345678901234567890" \
  -H "X-ArmorIQ-Agent-ID: agent-123"

# This should fail (DELETE not allowed)
curl -X DELETE http://localhost:5001/proxy/customer-data-service/api/customers/1 \
  -H "X-ArmorIQ-API-Key: demo-key-12345678901234567890" \
  -H "X-ArmorIQ-Agent-ID: agent-123"
```

---

### 3. Configure and Run AI Agent (Terminal 3)

```bash
cd agent-example
npm install
cp .env.example .env
```

**Edit `.env` and add your OpenAI API key:**
```env
OPENAI_API_KEY=sk-your-actual-openai-key-here
ARMORIQ_PROXY_URL=http://localhost:5001
ARMORIQ_API_KEY=demo-key-12345678901234567890
AGENT_ID=agent-123
ENDPOINT_ID=customer-data-service
```

**Run the agent:**
```bash
npm start
```

**Expected output:**
```
🚀 ArmorIQ Agent Demo - Starting...

Agent ID: agent-123
ArmorIQ Proxy: http://localhost:5001
MCP Endpoint: customer-data-service

================================================================================
👤 User: Show me all our customers
================================================================================

🔐 [Agent → ArmorIQ Proxy] GET /api/customers
✅ [ArmorIQ → Agent] Success: 200

🤖 Agent: I found 3 customers in our database:
1. Alice Johnson (alice@example.com) - Enterprise plan, Active
2. Bob Smith (bob@example.com) - Professional plan, Active
3. Carol Davis (carol@example.com) - Starter plan, Inactive
```

---

## What Just Happened?

1. **MCP Endpoint** provides customer data via REST API
2. **ArmorIQ Proxy** enforces security:
   - Verifies API key (bcrypt hashed)
   - Checks CRUD permissions
   - Logs all requests
3. **AI Agent** (GPT-4) uses function calling to:
   - Ask natural language questions
   - Call MCP functions through ArmorIQ
   - Get secure, policy-enforced access

## Security Demonstration

The agent has these permissions:
- ✅ READ - Can view customers
- ✅ CREATE - Can add customers
- ✅ UPDATE - Can modify customers
- ❌ DELETE - **Cannot delete** (denied by policy)

Try asking the agent to delete a customer - ArmorIQ will block it!

## View Audit Logs

Check what the agent accessed:

```bash
curl http://localhost:5001/api/audit-logs
```

## Architecture Diagram

```
┌─────────────┐
│   User      │
└──────┬──────┘
       │ "Show me customers"
       ↓
┌─────────────┐
│  AI Agent   │ (GPT-4 function calling)
│  (OpenAI)   │
└──────┬──────┘
       │ GET /api/customers
       │ + API Key
       │ + Agent ID
       ↓
┌─────────────────────┐
│  ArmorIQ Proxy      │
│  ┌───────────────┐  │
│  │ API Key Auth  │  │ ✅ Valid
│  └───────┬───────┘  │
│  ┌───────▼───────┐  │
│  │ Policy Check  │  │ ✅ READ allowed
│  └───────┬───────┘  │
│  ┌───────▼───────┐  │
│  │ Audit Log     │  │ 📝 Logged
│  └───────┬───────┘  │
└──────────┼──────────┘
           │
           ↓
    ┌─────────────┐
    │ MCP Endpoint│
    │  (Port 3001)│
    └─────────────┘
```

## Next Steps

1. **Modify Policies:** Edit `armoriq-proxy/proxy-server.js` to change permissions
2. **Add Endpoints:** Create new MCP endpoints and register them
3. **Customize Agent:** Modify agent prompts and capabilities
4. **Production Setup:** See individual README files for deployment guidance

## Troubleshooting

**Agent can't connect to proxy:**
- Check ARMORIQ_PROXY_URL in `.env`
- Ensure proxy is running on port 5001

**API key invalid:**
- Verify ARMORIQ_API_KEY matches in both proxy and agent
- Check for extra spaces in `.env`

**OpenAI errors:**
- Confirm OPENAI_API_KEY is valid
- Check your OpenAI account has credits

## Clean Shutdown

Press `Ctrl+C` in each terminal to stop the services.

---

🎉 **Congratulations!** You've successfully run the ArmorIQ demo with secure AI agent access to MCP endpoints!
