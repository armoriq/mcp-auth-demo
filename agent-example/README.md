# AI Agent Example

Sample AI agent using OpenAI GPT-4 to access MCP endpoints through ArmorIQ's secure proxy.

## Features

- OpenAI GPT-4 integration
- Function calling for MCP endpoint access
- All requests routed through ArmorIQ proxy
- Demonstrates policy enforcement (READ, CREATE, UPDATE allowed; DELETE denied)

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```env
OPENAI_API_KEY=your_openai_api_key_here
ARMORIQ_PROXY_URL=http://localhost:5001
ARMORIQ_API_KEY=demo-key-12345678901234567890
AGENT_ID=agent-123
ENDPOINT_ID=customer-data-service
```

## Running

Make sure the MCP endpoint and ArmorIQ proxy are running first:

```bash
# Terminal 1: Start MCP endpoint
cd ../mcp-endpoint-example
npm start

# Terminal 2: Start ArmorIQ proxy
cd ../armoriq-proxy
npm start

# Terminal 3: Run agent
cd ../agent-example
npm start
```

## How It Works

1. **User Query:** User asks a question about customers
2. **LLM Decision:** GPT-4 decides which function to call
3. **ArmorIQ Routing:** Agent sends request through ArmorIQ proxy with:
   - `X-ArmorIQ-API-Key`: Endpoint authentication
   - `X-ArmorIQ-Agent-ID`: Agent identification
4. **Policy Check:** ArmorIQ enforces CRUD permissions
5. **MCP Access:** If authorized, request forwarded to MCP endpoint
6. **Response:** Data returned to agent → LLM → User

## Demo Scenarios

The agent demonstrates:

1. **List Customers** (READ) ✅
   - Permission: Granted
   - Action: Retrieves all customers

2. **Get Customer by ID** (READ) ✅
   - Permission: Granted
   - Action: Gets specific customer details

3. **Create Customer** (CREATE) ✅
   - Permission: Granted
   - Action: Adds new customer to database

4. **Update Customer** (UPDATE) ✅
   - Permission: Granted
   - Action: Modifies existing customer

5. **Delete Customer** (DELETE) ❌
   - Permission: DENIED
   - Reason: Agent policy does not include delete permission

## Example Output

```
👤 User: Show me all our customers

🔐 [Agent → ArmorIQ Proxy] GET /api/customers
✅ [ArmorIQ → Agent] Success: 200

🤖 Agent: I found 3 customers in our database:
1. Alice Johnson (alice@example.com) - Enterprise plan, Active
2. Bob Smith (bob@example.com) - Professional plan, Active
3. Carol Davis (carol@example.com) - Starter plan, Inactive
```

## OpenAI Function Calling

The agent uses OpenAI's function calling feature:

```javascript
const tools = [
  {
    type: 'function',
    function: {
      name: 'get_customers',
      description: 'Retrieve a list of all customers',
      parameters: { /* ... */ }
    }
  },
  // ... more functions
];
```

When GPT-4 needs customer data, it calls the appropriate function, which routes through ArmorIQ for security.

## Security Architecture

```
User Question
    ↓
GPT-4 (decides function)
    ↓
Agent Function Call
    ↓
ArmorIQ Proxy (auth + policy check)
    ↓
MCP Endpoint
    ↓
Response back through chain
```

## Customization

Modify `agent.js` to:
- Add more functions/capabilities
- Change system prompt
- Implement different LLM providers (Anthropic, etc.)
- Add conversation memory

## Error Handling

The agent handles ArmorIQ denials gracefully:

```javascript
if (error.response) {
  console.log(`❌ Denied: ${error.response.status}`);
  return { error: error.response.data };
}
```

GPT-4 can then explain to the user why the action was denied.
