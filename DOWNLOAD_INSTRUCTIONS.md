# How to Download and Use This Demo

## Download the Package

The demo package is available as a compressed archive: **`armoriq-demo.tar.gz`** (13 KB)

### Option 1: Download from Replit

If you're viewing this in Replit, you can download the archive directly:

1. Navigate to the `demo-download` folder in the file explorer
2. Right-click on `armoriq-demo.tar.gz`
3. Select "Download"

### Option 2: Extract in Replit

You can also run the demo directly in this Replit workspace:

```bash
cd demo-download
tar -xzf armoriq-demo.tar.gz
```

## Package Contents

```
armoriq-demo/
├── README.md                    # Overview and introduction
├── QUICKSTART.md               # 5-minute setup guide
├── ARCHITECTURE.md             # Detailed architecture documentation
│
├── mcp-endpoint-example/       # Sample MCP endpoint
│   ├── package.json
│   ├── server.js              # Customer data service
│   ├── .env.example
│   └── README.md
│
├── armoriq-proxy/             # ArmorIQ security proxy
│   ├── package.json
│   ├── proxy-server.js        # Zero-trust proxy with policy enforcement
│   ├── .env.example
│   └── README.md
│
└── agent-example/             # AI agent using OpenAI
    ├── package.json
    ├── agent.js               # GPT-4 agent with function calling
    ├── .env.example
    └── README.md
```

## What You Get

### 1. MCP Endpoint Example (`mcp-endpoint-example/`)
- Fully functional REST API providing customer data
- MCP discovery endpoint (`/.well-known/mcp`)
- CRUD operations (Create, Read, Update, Delete)
- In-memory database for easy testing

### 2. ArmorIQ Proxy (`armoriq-proxy/`)
- Complete zero-trust proxy implementation
- API key verification using bcrypt
- CRUD permission enforcement
- Comprehensive audit logging
- Sample configuration with demo credentials

### 3. AI Agent Example (`agent-example/`)
- OpenAI GPT-4 integration
- Function calling for MCP access
- Natural language to API translation
- Demonstrates policy enforcement (READ/CREATE/UPDATE allowed, DELETE denied)

## Quick Setup (5 minutes)

1. **Extract the archive:**
   ```bash
   tar -xzf armoriq-demo.tar.gz
   cd armoriq-demo
   ```

2. **Read the Quick Start Guide:**
   ```bash
   cat QUICKSTART.md
   ```

3. **Follow the 3-step setup:**
   - Terminal 1: Start MCP endpoint
   - Terminal 2: Start ArmorIQ proxy
   - Terminal 3: Run AI agent (requires OpenAI API key)

## Requirements

- **Node.js 18+**
- **npm** (comes with Node.js)
- **OpenAI API key** (for the agent example only)
  - Get one at: https://platform.openai.com/api-keys
  - Free tier includes $5 in credits

## What You'll Learn

1. **MCP Protocol:** How to build MCP-compliant endpoints
2. **Zero-Trust Security:** API key verification and policy enforcement
3. **AI Agent Integration:** Using OpenAI function calling with secure MCP access
4. **CRUD Authorization:** Fine-grained permission control
5. **Audit Logging:** Complete request/response tracking

## Live Demo Flow

When you run all three components:

```
User: "Show me all customers"
  ↓
GPT-4 decides to call get_customers()
  ↓
Agent sends GET request to ArmorIQ proxy
  ↓
ArmorIQ verifies API key ✅
ArmorIQ checks READ permission ✅
ArmorIQ logs the request
  ↓
Request forwarded to MCP endpoint
  ↓
Customer data returned
  ↓
GPT-4 formats response for user
  ↓
User sees: "I found 3 customers: Alice, Bob, Carol..."
```

## Security Demonstration

The demo shows ArmorIQ blocking unauthorized actions:

```
User: "Delete customer ID 1"
  ↓
GPT-4 decides to call delete_customer()
  ↓
Agent sends DELETE request to ArmorIQ
  ↓
ArmorIQ verifies API key ✅
ArmorIQ checks DELETE permission ❌ DENIED
  ↓
403 Forbidden returned to agent
  ↓
GPT-4 explains: "I don't have permission to delete customers"
```

## Next Steps After Download

1. **Run the demo** using `QUICKSTART.md`
2. **Explore the code** - All files are well-commented
3. **Modify policies** - Change permissions in `armoriq-proxy/proxy-server.js`
4. **Add endpoints** - Create new MCP services
5. **Customize the agent** - Modify prompts and capabilities

## Support & Documentation

- **Architecture Guide:** See `ARCHITECTURE.md` for detailed system design
- **Component READMEs:** Each folder has its own README with specific details
- **Inline Comments:** All code files are thoroughly documented

## License

MIT License - Free to use for demonstration, learning, and commercial purposes.

---

## Questions?

This is a complete, working demonstration of:
- Model Context Protocol (MCP) implementation
- Zero-trust security proxy
- AI agent integration with GPT-4
- Policy-based access control

Everything runs locally, no external services required (except OpenAI for the agent).

🎉 **Happy coding!**
