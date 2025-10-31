/**
 * ArmorIQ Proxy Server
 * 
 * Zero-trust proxy layer that sits between AI agents and MCP endpoints.
 * Enforces authentication, authorization, and comprehensive audit logging.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const express = require('express');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const cors = require('cors');
const yaml = require('js-yaml');

const app = express();
app.use(cors());
app.use(express.json());
app.set('json spaces', 2);

app.use((req, res, next) => {
  if (req.socket && typeof req.socket.getPeerCertificate === 'function') {
    const certificate = req.socket.getPeerCertificate();
    if (certificate && Object.keys(certificate).length > 0) {
      req.clientCertificate = {
        subject: certificate.subject,
        issuer: certificate.issuer,
        validFrom: certificate.valid_from,
        validTo: certificate.valid_to,
        serialNumber: certificate.serialNumber,
        fingerprint: certificate.fingerprint
      };
    }
    req.isMutualTlsVerified = Boolean(req.socket.authorized);
  }
  next();
});

// Configuration
const MCP_ENDPOINT_URL = process.env.MCP_ENDPOINT_URL || 'http://localhost:3001';
const MCP_DEFINITION_PATH = process.env.MCP_DEFINITION_PATH;
const MCP_DEFINITION_JSON = process.env.MCP_DEFINITION_JSON;
const CLIENT_CA_CERT_PATH = process.env.CLIENT_CA_CERT_PATH;
const CLIENT_CA_CERT_INLINE = process.env.CLIENT_CA_CERT;
const TLS_CERT_PATH = process.env.PROXY_TLS_CERT_PATH;
const TLS_KEY_PATH = process.env.PROXY_TLS_KEY_PATH;
const TOKEN_PUBLIC_KEY_PATH = process.env.ARMORIQ_TOKEN_PUBLIC_KEY_PATH;
const TOKEN_PUBLIC_KEY = process.env.ARMORIQ_TOKEN_PUBLIC_KEY;
const TOKEN_JWKS_PATH = process.env.ARMORIQ_TOKEN_JWKS_PATH;
const TOKEN_JWKS = process.env.ARMORIQ_TOKEN_JWKS;
const TOKEN_ISSUER = process.env.ARMORIQ_TOKEN_ISSUER;
const TOKEN_AUDIENCE = process.env.ARMORIQ_TOKEN_AUDIENCE || 'armoriq-proxy';
const TOKEN_ALGORITHM = process.env.ARMORIQ_TOKEN_ALG || 'RS256';
const TOKEN_CLOCK_TOLERANCE = Number.parseInt(process.env.ARMORIQ_TOKEN_CLOCK_TOLERANCE || '5', 10);

function prettyPrint(title, payload) {
  console.log(`\n${title}`);
  console.log(JSON.stringify(payload, null, 2));
}

function parseStructuredPayload(raw, label) {
  if (!raw || !raw.trim()) {
    throw new Error('metadata payload is empty');
  }

  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch (jsonError) {
    try {
      return yaml.load(trimmed);
    } catch (yamlError) {
      throw new Error(
        `unable to parse metadata "${label}" as JSON (${jsonError.message}) or YAML (${yamlError.message})`
      );
    }
  }
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function loadMcpDefinition() {
  const fallback = {
    definition: null,
    endpoint: {},
    resources: [],
    prompts: [],
    tools: [],
    policies: []
  };

  const sources = [];
  if (MCP_DEFINITION_PATH) {
    sources.push({
      label: `file:${path.resolve(MCP_DEFINITION_PATH)}`,
      load: () => fs.readFileSync(MCP_DEFINITION_PATH, 'utf8')
    });
  }

  if (MCP_DEFINITION_JSON) {
    sources.push({
      label: 'env:MCP_DEFINITION_JSON',
      load: () => MCP_DEFINITION_JSON
    });
  }

  for (const source of sources) {
    try {
      const parsed = parseStructuredPayload(source.load(), source.label) || {};
      const endpoint = typeof parsed.endpoint === 'object' && parsed.endpoint ? parsed.endpoint : {};
      const definition = {
        definition: parsed,
        endpoint,
        resources: ensureArray(parsed.resources),
        prompts: ensureArray(parsed.prompts),
        tools: ensureArray(parsed.tools),
        policies: ensureArray(parsed.policies)
      };

      prettyPrint('📦 MCP Metadata Loaded', {
        source: source.label,
        endpoint: endpoint.id || endpoint.url || 'unspecified',
        resources: definition.resources.length,
        prompts: definition.prompts.length,
        tools: definition.tools.length,
        policies: definition.policies.length
      });

      return definition;
    } catch (error) {
      console.error(`[ArmorIQ Proxy] Failed to load MCP metadata from ${source.label}: ${error.message}`);
    }
  }

  if (sources.length > 0) {
    console.warn('[ArmorIQ Proxy] Falling back to built-in sample metadata.');
  }

  return fallback;
}

const MCP_METADATA = loadMcpDefinition();

function readPem(label, filePath, inlineValue) {
  if (filePath) {
    return fs.readFileSync(filePath);
  }

  if (!inlineValue) {
    return null;
  }

  const trimmed = inlineValue.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('-----BEGIN')) {
    return Buffer.from(trimmed);
  }

  return Buffer.from(trimmed, 'base64');
}

function buildTlsOptions() {
  if (!TLS_CERT_PATH || !TLS_KEY_PATH) {
    if ((CLIENT_CA_CERT_PATH || CLIENT_CA_CERT_INLINE) && (!TLS_CERT_PATH || !TLS_KEY_PATH)) {
      console.warn('[ArmorIQ Proxy] Client CA certificate provided, but TLS key/cert are missing. Falling back to HTTP without mTLS.');
    }
    return null;
  }

  try {
    const cert = readPem('server certificate', TLS_CERT_PATH);
    const key = readPem('server key', TLS_KEY_PATH);
    const ca = readPem('client CA', CLIENT_CA_CERT_PATH, CLIENT_CA_CERT_INLINE);

    const options = { cert, key };
    if (ca) {
      options.ca = Array.isArray(ca) ? ca : [ca];
      options.requestCert = true;
      options.rejectUnauthorized = true;
    }
    return options;
  } catch (error) {
    console.error(`[ArmorIQ Proxy] Failed to load TLS materials: ${error.message}`);
    process.exit(1);
  }
}

function readTextFileIfExists(filePath) {
  if (!filePath) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf8');
}

function normalizeArrayOfStrings(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string');
  }
  if (typeof value === 'string') {
    return [value];
  }
  if (typeof value === 'object' && value !== null && Array.isArray(value.paths)) {
    return value.paths.filter((item) => typeof item === 'string');
  }
  return [];
}

function normalizePathPattern(pattern) {
  if (pattern === null || pattern === undefined) {
    return null;
  }
  if (pattern === '*' || pattern === '/*') {
    return '*';
  }
  let normalized = String(pattern).trim();
  if (!normalized) {
    return null;
  }
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }
  return normalized;
}

function matchResourcePattern(pattern, resourcePath) {
  if (!pattern) {
    return false;
  }
  if (pattern === '*') {
    return true;
  }
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return resourcePath.startsWith(prefix);
  }
  return resourcePath === pattern;
}

function determineRequiredPermission(method) {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'read';
    case 'POST':
      return 'create';
    case 'PUT':
    case 'PATCH':
      return 'update';
    case 'DELETE':
      return 'delete';
    default:
      return null;
  }
}

let joseModule = null;
let tokenVerifier = null;
let tokenVerifierInfo = { mode: 'unconfigured' };
const tokenVerifyOptions = {};

if (TOKEN_ISSUER) {
  tokenVerifyOptions.issuer = TOKEN_ISSUER;
}

if (TOKEN_AUDIENCE) {
  tokenVerifyOptions.audience = TOKEN_AUDIENCE;
}

if (Number.isFinite(TOKEN_CLOCK_TOLERANCE) && TOKEN_CLOCK_TOLERANCE > 0) {
  tokenVerifyOptions.clockTolerance = TOKEN_CLOCK_TOLERANCE;
}

async function loadTokenVerifier() {
  if (!joseModule) {
    joseModule = await import('jose');
  }

  const { createLocalJWKSet, jwtVerify, importSPKI } = joseModule;

  const jwksSource = TOKEN_JWKS || (TOKEN_JWKS_PATH && readTextFileIfExists(TOKEN_JWKS_PATH));
  if (jwksSource) {
    try {
      const jwks = typeof jwksSource === 'string' ? JSON.parse(jwksSource) : jwksSource;
      const jwkSet = createLocalJWKSet(jwks);
      tokenVerifier = async (token) => jwtVerify(token, jwkSet, tokenVerifyOptions);
      tokenVerifierInfo = { mode: 'jwks', keys: Array.isArray(jwks.keys) ? jwks.keys.length : 0 };
      return;
    } catch (error) {
      throw new Error(`Failed to parse JWKS for access-token verification: ${error.message}`);
    }
  }

  const publicKeySource = TOKEN_PUBLIC_KEY || (TOKEN_PUBLIC_KEY_PATH && readTextFileIfExists(TOKEN_PUBLIC_KEY_PATH));
  if (publicKeySource) {
    try {
      const publicKey = await importSPKI(publicKeySource, TOKEN_ALGORITHM);
      tokenVerifier = async (token) => jwtVerify(token, publicKey, tokenVerifyOptions);
      tokenVerifierInfo = { mode: 'public-key', algorithm: TOKEN_ALGORITHM };
      return;
    } catch (error) {
      throw new Error(`Failed to import access-token public key: ${error.message}`);
    }
  }

  throw new Error('Access-token verification material not provided. Supply ARMORIQ_TOKEN_PUBLIC_KEY_PATH or ARMORIQ_TOKEN_JWKS_PATH.');
}

function resolvePolicyPermissionEntry(policy, permission) {
  if (!policy || !permission) {
    return { granted: false };
  }

  const policyEndpointId = policy.endpoint || policy.endpointId;
  const permissions = policy.permissions || {};
  const hasDirectPermission = Object.prototype.hasOwnProperty.call(permissions, permission);

  if (!hasDirectPermission) {
    const scopes = Array.isArray(policy.scopes) ? policy.scopes : [];
    const scopePatterns = [];

    for (const scope of scopes) {
      if (typeof scope !== 'string' || !scope.trim()) {
        continue;
      }
      const parts = scope.trim().split(':');
      if (parts.length === 3) {
        const [scopeEndpoint, scopePermission, scopeResource] = parts;
        if (scopeEndpoint && scopeEndpoint !== policyEndpointId) {
          continue;
        }
        if (scopePermission !== permission) {
          continue;
        }
        scopePatterns.push(scopeResource);
      } else if (parts.length === 2) {
        const [scopePermission, scopeResource] = parts;
        if (scopePermission !== permission) {
          continue;
        }
        scopePatterns.push(scopeResource);
      } else if (parts.length === 1 && parts[0] === permission) {
        return { granted: true, anyResource: true };
      }
    }

    if (scopePatterns.length > 0) {
      return {
        granted: true,
        paths: scopePatterns.map(normalizePathPattern).filter(Boolean)
      };
    }

    return { granted: false };
  }

  const entry = permissions[permission];

  if (entry === false || entry === null) {
    return { granted: false };
  }

  if (entry === true || entry === '*' || entry === 'all') {
    return { granted: true, anyResource: true };
  }

  const paths = normalizeArrayOfStrings(entry);
  if (paths.length > 0) {
    return {
      granted: true,
      paths: paths.map(normalizePathPattern).filter(Boolean)
    };
  }

  if (!hasDirectPermission) {
    const fallback = normalizeArrayOfStrings(policy.resources || policy.paths);
    if (fallback.length > 0) {
      return {
        granted: true,
        paths: fallback.map(normalizePathPattern).filter(Boolean)
      };
    }
  }

  return { granted: false };
}

function findPolicyForEndpoint(policies, endpointId) {
  if (!Array.isArray(policies)) {
    return null;
  }

  return policies.find((policy) => {
    if (!policy || typeof policy !== 'object') {
      return false;
    }
    const candidate = policy.endpoint || policy.endpointId;
    return candidate === endpointId;
  }) || null;
}

function isResourceAuthorized(permissionEntry, resourcePath) {
  if (!permissionEntry || !permissionEntry.granted) {
    return false;
  }

  if (permissionEntry.anyResource) {
    return true;
  }

  if (!permissionEntry.paths || permissionEntry.paths.length === 0) {
    return false;
  }

  return permissionEntry.paths.some((pattern) => matchResourcePattern(pattern, resourcePath));
}

// In-memory storage (in production, use PostgreSQL)
const registeredEndpoints = new Map();
const auditLogs = [];

function serializeEndpoint(endpoint) {
  return {
    id: endpoint.id,
    name: endpoint.name,
    url: endpoint.url
  };
}

// Initialize with sample data
async function initializeSampleData() {
  const metadataEndpoint = MCP_METADATA.endpoint || {};
  const endpointId = metadataEndpoint.id || 'customer-data-service';
  const endpointName = metadataEndpoint.name || 'Customer Data Service';
  const endpointUrl = metadataEndpoint.url || MCP_ENDPOINT_URL;

  let apiKey = metadataEndpoint.apiKey || process.env.ARMORIQ_API_KEY;
  if (!apiKey && !metadataEndpoint.hashedApiKey) {
    apiKey = 'demo-key-12345678901234567890';
  }

  let hashedKey = metadataEndpoint.hashedApiKey;
  if (!hashedKey && apiKey) {
    hashedKey = await bcrypt.hash(apiKey, 10);
  }

  if (!hashedKey) {
    throw new Error('ArmorIQ proxy requires either an MCP API key or hashed API key to initialize.');
  }

  const endpointRecord = {
    id: endpointId,
    name: endpointName,
    url: endpointUrl,
    hashedApiKey: hashedKey
  };

  if (apiKey && metadataEndpoint.exposePlainApiKey !== false) {
    endpointRecord.plainApiKey = apiKey;
  }

  registeredEndpoints.set(endpointId, endpointRecord);

  prettyPrint('📋 Configuration Loaded', {
    endpoint: { id: endpointId, url: endpointUrl },
    resources: MCP_METADATA.resources.length,
    prompts: MCP_METADATA.prompts.length,
    tools: MCP_METADATA.tools.length,
    metadataPolicies: Array.isArray(MCP_METADATA.policies) ? MCP_METADATA.policies.length : 0,
    credentials: endpointRecord.plainApiKey ? { apiKey: endpointRecord.plainApiKey } : undefined
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

// Middleware: Verify Access Token
async function verifyAccessToken(req, res, next) {
  if (!tokenVerifier) {
    console.error('[ArmorIQ Proxy] Access-token verifier unavailable.');
    return res.status(503).json({ error: 'Access-token verifier unavailable' });
  }

  const { endpointId } = req.params;
  const authHeader = req.headers.authorization;
  const tokenFromHeader = typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : null;
  const explicitToken = req.headers['x-armoriq-access-token'];
  const accessToken = tokenFromHeader || explicitToken;

  if (!accessToken) {
    auditLog(endpointId, req, 'DENIED', 'Access token missing');
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const verification = await tokenVerifier(accessToken);
    const payload = verification.payload || {};

    req.accessToken = accessToken;
    req.tokenClaims = payload;
    req.tokenHeader = verification.protectedHeader || {};
    req.tokenPolicies = Array.isArray(payload.policies) ? payload.policies : [];
    req.agentId = payload.sub || payload.agentId || payload.client_id || payload.azp || 'unknown';
    next();
  } catch (error) {
    console.warn(`[ArmorIQ Proxy] Access-token verification failed: ${error.message}`);
    auditLog(endpointId, req, 'DENIED', `Invalid access token: ${error.message}`);
    res.status(401).json({ error: 'Invalid or expired access token' });
  }
}

// Middleware: Authorize request via token policy
function authorizeRequest(req, res, next) {
  const { endpointId } = req.params;
  const policy = findPolicyForEndpoint(req.tokenPolicies, endpointId);

  if (!policy) {
    auditLog(endpointId, req, 'DENIED', 'Token grants no policy for this endpoint');
    return res.status(403).json({ error: 'Token does not grant access to this endpoint' });
  }

  const requiredPermission = determineRequiredPermission(req.method);
  if (!requiredPermission) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const relativePath = req.params[0] || '';
  const resourcePath = `/${relativePath}`.replace(/\/{2,}/g, '/');
  const permissionEntry = resolvePolicyPermissionEntry(policy, requiredPermission);

  if (!permissionEntry.granted) {
    auditLog(endpointId, req, 'DENIED', `Token missing ${requiredPermission} permission`);
    return res.status(403).json({
      error: `Token does not grant ${requiredPermission} permission for this endpoint`,
      required: requiredPermission
    });
  }

  if (!isResourceAuthorized(permissionEntry, resourcePath)) {
    auditLog(endpointId, req, 'DENIED', `Token policy forbids resource ${resourcePath}`);
    return res.status(403).json({
      error: 'Token policy does not allow access to this resource',
      resource: resourcePath,
      required: requiredPermission
    });
  }

  req.requiredPermission = requiredPermission;
  req.authorizationDecision = {
    endpointId,
    resourcePath,
    permission: requiredPermission,
    policy
  };
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
    if (req.authorizationDecision) {
      console.log(`   Resource: ${req.authorizationDecision.resourcePath}`);
    }
    
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
    agentId: req.agentId || (req.tokenClaims && (req.tokenClaims.sub || req.tokenClaims.client_id)) || 'unknown',
    method: req.method,
    path: req.path,
    status,
    message,
    ip: req.ip,
    mtlsAuthorized: Boolean(req.isMutualTlsVerified)
  };

  if (req.clientCertificate) {
    log.clientCertificate = {
      subject: req.clientCertificate.subject,
      issuer: req.clientCertificate.issuer,
      validFrom: req.clientCertificate.validFrom,
      validTo: req.clientCertificate.validTo,
      serialNumber: req.clientCertificate.serialNumber,
      fingerprint: req.clientCertificate.fingerprint
    };
  }

  if (req.tokenClaims) {
    log.token = {
      sub: req.tokenClaims.sub,
      iss: req.tokenClaims.iss,
      aud: req.tokenClaims.aud,
      exp: req.tokenClaims.exp,
      jti: req.tokenClaims.jti,
      policies: Array.isArray(req.tokenPolicies) ? req.tokenPolicies.length : 0,
      permission: req.requiredPermission,
      resource: req.authorizationDecision ? req.authorizationDecision.resourcePath : undefined
    };
  }
  
  auditLogs.push(log);
  prettyPrint(`🧾 [AUDIT] ${status} — ${message}`, log);
}

// Routes

// Admin helpers for UI integrations
app.get('/api/mcp', (req, res) => {
  res.json({
    endpoint: MCP_METADATA.endpoint,
    resources: MCP_METADATA.resources,
    prompts: MCP_METADATA.prompts,
    tools: MCP_METADATA.tools,
    definition: MCP_METADATA.definition
  });
});

app.get('/api/mcp/resources', (req, res) => {
  res.json({ resources: MCP_METADATA.resources });
});

app.get('/api/mcp/prompts', (req, res) => {
  res.json({ prompts: MCP_METADATA.prompts });
});

app.get('/api/mcp/tools', (req, res) => {
  res.json({ tools: MCP_METADATA.tools });
});

app.get('/api/endpoints', (req, res) => {
  const endpoints = Array.from(registeredEndpoints.values()).map(serializeEndpoint);
  res.json({ endpoints });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    endpoints: registeredEndpoints.size,
    auditLogs: auditLogs.length,
    tokenVerification: tokenVerifierInfo
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
app.all('/proxy/:endpointId/*', verifyApiKey, verifyAccessToken, authorizeRequest, proxyRequest);

// Start server
const PORT = process.env.PORT || 5001;

(async () => {
  try {
    await initializeSampleData();
    await loadTokenVerifier();

    const tlsOptions = buildTlsOptions();
    const scheme = tlsOptions ? 'https' : 'http';
    const onReady = () => {
      console.log(`\n🛡️  ArmorIQ Proxy Server ${tlsOptions ? '(mTLS) ' : ''}running on ${scheme}://localhost:${PORT}`);
      console.log(`📊 Health: ${scheme}://localhost:${PORT}/health`);
      console.log(`📜 Audit Logs: ${scheme}://localhost:${PORT}/api/audit-logs`);
      console.log(`📚 MCP Metadata: ${scheme}://localhost:${PORT}/api/mcp`);
      console.log(`🔑 Token verification mode: ${tokenVerifierInfo.mode}`);
      console.log(`\n🔐 Proxy Pattern:`);
      console.log(`   ${scheme}://localhost:${PORT}/proxy/{endpointId}/{path}`);
      console.log(`   Headers: X-ArmorIQ-API-Key, Authorization: Bearer <access-token>\n`);
    };

    if (tlsOptions) {
      const server = https.createServer(tlsOptions, app);
      server.listen(PORT, onReady);
      server.on('tlsClientError', (err) => {
        console.warn(`[ArmorIQ Proxy] TLS client error: ${err.message}`);
      });
    } else {
      app.listen(PORT, onReady);
    }
  } catch (error) {
    console.error(`[ArmorIQ Proxy] Failed to start: ${error.message}`);
    process.exit(1);
  }
})();
