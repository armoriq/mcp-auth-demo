/**
 * MCP Endpoint Example - Customer Data Service
 * 
 * This is a sample MCP-compliant endpoint that provides customer data.
 * In production, this would be protected by ArmorIQ's proxy layer.
 */

const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.set('json spaces', 2);

// Sample in-memory customer database
const customers = [
  { id: '1', name: 'Alice Johnson', email: 'alice@example.com', plan: 'Enterprise', status: 'active' },
  { id: '2', name: 'Bob Smith', email: 'bob@example.com', plan: 'Professional', status: 'active' },
  { id: '3', name: 'Carol Davis', email: 'carol@example.com', plan: 'Starter', status: 'inactive' },
];

// MCP Discovery Endpoint
app.get('/.well-known/mcp', (req, res) => {
  res.json({
    '@context': 'https://modelcontextprotocol.org/ns',
    'type': 'Service',
    'name': 'Customer Data Service',
    'description': 'Provides customer information and management',
    'version': '1.0.0',
    'capabilities': {
      'customers': {
        'read': true,
        'create': true,
        'update': true,
        'delete': true
      }
    },
    'endpoints': {
      'customers': '/api/customers',
      'customer_by_id': '/api/customers/:id'
    }
  });
});

// READ - Get all customers
app.get('/api/customers', (req, res) => {
  console.log('\n📡 [MCP Endpoint] READ request for all customers');
  console.table(customers.map(({ id, name, plan, status }) => ({ id, name, plan, status })));
  res.json({
    success: true,
    data: customers,
    count: customers.length
  });
});

// READ - Get customer by ID
app.get('/api/customers/:id', (req, res) => {
  const { id } = req.params;
  console.log(`\n📡 [MCP Endpoint] READ request for customer ${id}`);
  
  const customer = customers.find(c => c.id === id);
  if (!customer) {
    return res.status(404).json({ success: false, error: 'Customer not found' });
  }
  
  console.table([{ id: customer.id, name: customer.name, plan: customer.plan, status: customer.status }]);
  res.json({ success: true, data: customer });
});

// CREATE - Add new customer
app.post('/api/customers', (req, res) => {
  console.log('\n🛠️  [MCP Endpoint] CREATE request for new customer');
  
  const newCustomer = {
    id: String(customers.length + 1),
    ...req.body,
    status: 'active'
  };
  
  customers.push(newCustomer);
  console.table([{ id: newCustomer.id, name: newCustomer.name, plan: newCustomer.plan, status: newCustomer.status }]);
  res.status(201).json({ success: true, data: newCustomer });
});

// UPDATE - Update existing customer
app.put('/api/customers/:id', (req, res) => {
  const { id } = req.params;
  console.log(`\n🛠️  [MCP Endpoint] UPDATE request for customer ${id}`);
  
  const customerIndex = customers.findIndex(c => c.id === id);
  if (customerIndex === -1) {
    return res.status(404).json({ success: false, error: 'Customer not found' });
  }
  
  customers[customerIndex] = { ...customers[customerIndex], ...req.body };
  const updated = customers[customerIndex];
  console.table([{ id: updated.id, name: updated.name, plan: updated.plan, status: updated.status }]);
  res.json({ success: true, data: customers[customerIndex] });
});

// DELETE - Remove customer
app.delete('/api/customers/:id', (req, res) => {
  const { id } = req.params;
  console.log(`\n🛠️  [MCP Endpoint] DELETE request for customer ${id}`);
  
  const customerIndex = customers.findIndex(c => c.id === id);
  if (customerIndex === -1) {
    return res.status(404).json({ success: false, error: 'Customer not found' });
  }
  
  const deletedCustomer = customers.splice(customerIndex, 1)[0];
  console.table([{ id: deletedCustomer.id, name: deletedCustomer.name, plan: deletedCustomer.plan, status: deletedCustomer.status }]);
  res.json({ success: true, data: deletedCustomer });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ MCP Endpoint running on http://localhost:${PORT}`);
  console.log(`📋 Discovery: http://localhost:${PORT}/.well-known/mcp`);
  console.log(`👥 Customers API: http://localhost:${PORT}/api/customers`);
  console.log('\n⚠️  WARNING: This endpoint should NOT be exposed directly to agents.');
  console.log('   Route all requests through ArmorIQ proxy for security.\n');
});
