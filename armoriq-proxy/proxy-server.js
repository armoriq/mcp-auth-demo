/**
 * ArmorIQ Proxy Server
 * 
 * Zero-trust proxy layer that sits between AI agents and MCP endpoints.
 * Enforces authentication, authorization, and comprehensive audit logging.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.set('json spaces', 2);

// Configuration
const MCP_ENDPOINT_URL = process.env.MCP_ENDPOINT_URL || 'http://localhost:3001';

function prettyPrint(title, payload) {
  console.log(`\n${title}`);
  console.log(JSON.stringify(payload, null, 2));
}

// In-memory storage (in production, use PostgreSQL)
const registeredEndpoints = new Map();
const agentPolicies = new Map();
const auditLogs = [];

function serializeEndpoint(endpoint) {
  return {
    id: endpoint.id,
    name: endpoint.name,
    url: endpoint.url
  };
}

function serializePolicy(policy) {
  return {
    agentId: policy.agentId,
    endpointId: policy.endpointId,
    permissions: { ...policy.permissions }
  };
}

function buildPermissions(newPermissions = {}, existingPermissions = {}) {
  const keys = ['read', 'create', 'update', 'delete'];
  const merged = { ...existingPermissions };
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(newPermissions, key)) {
      merged[key] = Boolean(newPermissions[key]);
    } else if (merged[key] === undefined) {
      merged[key] = false;
    }
  }
  return merged;
}

// Initialize with sample data
async function initializeSampleData() {
  // Register MCP endpoint
  const endpointId = 'customer-data-service';
  const apiKey = 'demo-key-12345678901234567890'; // In production: generate secure random key
  const hashedKey = await bcrypt.hash(apiKey, 10);
  
  registeredEndpoints.set(endpointId, {
    id: endpointId,
    name: 'Customer Data Service',
    url: MCP_ENDPOINT_URL,
    hashedApiKey: hashedKey,
    plainApiKey: apiKey // Only for demo purposes - NEVER store in production
  });
  
  // Sample agent policy
  agentPolicies.set('agent-123', {
    agentId: 'agent-123',
    endpointId: endpointId,
    permissions: {
      read: true,
      create: true,
      update: true,
      delete: false // Agent NOT allowed to delete
    }
  });
  
  prettyPrint('📋 Sample Configuration Loaded', {
    endpoint: { id: endpointId, url: MCP_ENDPOINT_URL },
    credentials: { apiKey },
    agentPolicy: agentPolicies.get('agent-123')
  });
}

// Middleware: Verify API Key
async function verifyApiKey(req, res, next) {
  const apiKey = req.headers['x-armoriq-api-key'];
  const { endpointId } = req.params;
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }
  
  const endpoint = registeredEndpoints.get(endpointId);
  if (!endpoint) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  
  // Verify hashed API key
  const isValid = await bcrypt.compare(apiKey, endpoint.hashedApiKey);
  if (!isValid) {
    auditLog(endpointId, req, 'DENIED', 'Invalid API key');
    return res.status(403).json({ error: 'Invalid API key' });
  }
  
  req.endpoint = endpoint;
  next();
}

// Middleware: Check CRUD Permissions
function checkPermissions(req, res, next) {
  const agentId = req.headers['x-armoriq-agent-id'];
  const { endpointId } = req.params;
  
  if (!agentId) {
    return res.status(401).json({ error: 'Agent ID required' });
  }
  
  const policy = agentPolicies.get(agentId);
  if (!policy || policy.endpointId !== endpointId) {
    auditLog(endpointId, req, 'DENIED', 'No policy found for agent');
    return res.status(403).json({ error: 'No access policy for this endpoint' });
  }
  
  // Determine required permission based on HTTP method
  const method = req.method.toUpperCase();
  let requiredPermission;
  
  switch (method) {
    case 'GET':
      requiredPermission = 'read';
      break;
    case 'POST':
      requiredPermission = 'create';
      break;
    case 'PUT':
    case 'PATCH':
      requiredPermission = 'update';
      break;
    case 'DELETE':
      requiredPermission = 'delete';
      break;
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
  
  if (!policy.permissions[requiredPermission]) {
    auditLog(endpointId, req, 'DENIED', `Missing ${requiredPermission} permission`);
    return res.status(403).json({ 
      error: `Agent does not have ${requiredPermission} permission`,
      required: requiredPermission,
      granted: Object.keys(policy.permissions).filter(p => policy.permissions[p])
    });
  }
  
  req.agentId = agentId;
  req.requiredPermission = requiredPermission;
  next();
}

// Proxy handler
async function proxyRequest(req, res) {
  const { endpointId } = req.params;
  const path = req.params[0] || '';
  
  try {
    // Forward request to MCP endpoint
    const baseUrl = req.endpoint.url.replace(/\/$/, '');
    const forwardedPath = path.startsWith('/') ? path : `/${path}`;
    const targetUrl = `${baseUrl}${forwardedPath}`;
    
    console.log(`\n⚙️  [ArmorIQ Proxy] ${req.method} ${targetUrl}`);
    console.log(`   Agent: ${req.agentId} | Permission: ${req.requiredPermission}`);
    
    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: req.body,
      headers: {
        'Content-Type': 'application/json',
        // Filter out ArmorIQ-specific headers
      },
      validateStatus: () => true // Accept any status code
    });
    
    // Log successful access
    auditLog(endpointId, req, 'GRANTED', `${req.requiredPermission} permission allowed`);
    
    // Return response
    res.status(response.status).json(response.data);
    
  } catch (error) {
    console.error('[ArmorIQ Proxy] Error forwarding request:', error.message);
    auditLog(endpointId, req, 'ERROR', error.message);
    res.status(500).json({ error: 'Proxy error', details: error.message });
  }
}

// Audit logging
function auditLog(endpointId, req, status, message) {
  const log = {
    timestamp: new Date().toISOString(),
    endpointId,
    agentId: req.agentId || req.headers['x-armoriq-agent-id'] || 'unknown',
    method: req.method,
    path: req.path,
    status,
    message,
    ip: req.ip
  };
  
  auditLogs.push(log);
  prettyPrint(`🧾 [AUDIT] ${status} — ${message}`, log);
}

// Routes

// Admin helpers for UI integrations
app.get('/api/endpoints', (req, res) => {
  const endpoints = Array.from(registeredEndpoints.values()).map(serializeEndpoint);
  res.json({ endpoints });
});

app.get('/api/policies', (req, res) => {
  const policies = Array.from(agentPolicies.values()).map(serializePolicy);
  res.json({ policies });
});

app.get('/api/policies/:agentId', (req, res) => {
  const policy = agentPolicies.get(req.params.agentId);
  if (!policy) {
    return res.status(404).json({ error: 'Policy not found' });
  }
  res.json(serializePolicy(policy));
});

app.post('/api/policies', (req, res) => {
  const { agentId, endpointId, permissions = {} } = req.body || {};

  if (!agentId || !endpointId) {
    return res.status(400).json({ error: 'agentId and endpointId are required' });
  }

  if (!registeredEndpoints.has(endpointId)) {
    return res.status(404).json({ error: `Endpoint ${endpointId} not registered` });
  }

  if (agentPolicies.has(agentId)) {
    return res.status(409).json({ error: `Policy already exists for agent ${agentId}` });
  }

  const policy = {
    agentId,
    endpointId,
    permissions: buildPermissions(permissions)
  };

  agentPolicies.set(agentId, policy);
  prettyPrint('🆕 Policy created', serializePolicy(policy));
  res.status(201).json(serializePolicy(policy));
});

app.put('/api/policies/:agentId', (req, res) => {
  const agentId = req.params.agentId;
  const existing = agentPolicies.get(agentId);

  if (!existing) {
    return res.status(404).json({ error: 'Policy not found' });
  }

  const { permissions = {} } = req.body || {};
  const updatedPolicy = {
    ...existing,
    permissions: buildPermissions(permissions, existing.permissions)
  };

  agentPolicies.set(agentId, updatedPolicy);
  prettyPrint('✏️ Policy updated', serializePolicy(updatedPolicy));
  res.json(serializePolicy(updatedPolicy));
});

app.delete('/api/policies/:agentId', (req, res) => {
  const agentId = req.params.agentId;
  if (!agentPolicies.has(agentId)) {
    return res.status(404).json({ error: 'Policy not found' });
  }

  const removed = agentPolicies.get(agentId);
  agentPolicies.delete(agentId);
  prettyPrint('🗑️ Policy removed', serializePolicy(removed));
  res.status(204).send();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    endpoints: registeredEndpoints.size,
    policies: agentPolicies.size,
    auditLogs: auditLogs.length
  });
});

// Get audit logs
app.get('/api/audit-logs', (req, res) => {
  res.json({ 
    logs: auditLogs.slice(-100), // Last 100 logs
    total: auditLogs.length 
  });
});

// Proxy route - all requests go through security middleware
app.all('/proxy/:endpointId/*', verifyApiKey, checkPermissions, proxyRequest);

// Start server
const PORT = process.env.PORT || 5001;

initializeSampleData().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🛡️  ArmorIQ Proxy Server running on http://localhost:${PORT}`);
    console.log(`📊 Health: http://localhost:${PORT}/health`);
    console.log(`📜 Audit Logs: http://localhost:${PORT}/api/audit-logs`);
    console.log(`\n🔐 Proxy Pattern:`);
    console.log(`   http://localhost:${PORT}/proxy/{endpointId}/{path}`);
    console.log(`   Headers: X-ArmorIQ-API-Key, X-ArmorIQ-Agent-ID\n`);
  });
});
