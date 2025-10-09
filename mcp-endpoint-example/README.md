# MCP Endpoint Example

A sample Model Context Protocol (MCP) compliant endpoint providing customer data services.

## Features

- MCP discovery endpoint (`/.well-known/mcp`)
- Full CRUD operations on customer data
- RESTful API design
- In-memory data storage (for demo purposes)

## Installation

```bash
npm install
```

## Running

```bash
npm start
```

Server runs on `http://localhost:3001`

## API Endpoints

### Discovery
- `GET /.well-known/mcp` - MCP service metadata

### Customers
- `GET /api/customers` - List all customers (READ)
- `GET /api/customers/:id` - Get customer by ID (READ)
- `POST /api/customers` - Create new customer (CREATE)
- `PUT /api/customers/:id` - Update customer (UPDATE)
- `DELETE /api/customers/:id` - Delete customer (DELETE)

## Security Warning

⚠️ **This endpoint should NEVER be exposed directly to AI agents.**

Always route requests through ArmorIQ's proxy layer to enforce:
- Authentication
- Authorization (CRUD permissions)
- Rate limiting
- Audit logging

## Example Request

```bash
curl http://localhost:3001/api/customers
```

## MCP Compliance

This endpoint follows the Model Context Protocol specification:
- Discovery metadata at `/.well-known/mcp`
- Declared capabilities with CRUD permissions
- Structured endpoint definitions
