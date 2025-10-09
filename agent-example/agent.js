/**
 * AI Agent Example
 * 
 * This agent uses OpenAI GPT-4 to interact with MCP endpoints
 * through ArmorIQ's secure proxy layer.
 */

require('dotenv').config();
const OpenAI = require('openai');
const axios = require('axios');

// Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ARMORIQ_PROXY_URL = process.env.ARMORIQ_PROXY_URL || 'http://localhost:5001';
const ARMORIQ_API_KEY = process.env.ARMORIQ_API_KEY || 'demo-key-12345678901234567890';
const AGENT_ID = process.env.AGENT_ID || 'agent-123';
const ENDPOINT_ID = process.env.ENDPOINT_ID || 'customer-data-service';

if (!OPENAI_API_KEY) {
  console.error('❌ Error: OPENAI_API_KEY not set in environment');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Tool definitions for OpenAI function calling
const tools = [
  {
    type: 'function',
    function: {
      name: 'get_customers',
      description: 'Retrieve a list of all customers from the customer database',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_by_id',
      description: 'Get details of a specific customer by their ID',
      parameters: {
        type: 'object',
        properties: {
          customer_id: {
            type: 'string',
            description: 'The unique identifier of the customer'
          }
        },
        required: ['customer_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_customer',
      description: 'Create a new customer record',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Customer full name'
          },
          email: {
            type: 'string',
            description: 'Customer email address'
          },
          plan: {
            type: 'string',
            description: 'Subscription plan (Starter, Professional, Enterprise)'
          }
        },
        required: ['name', 'email', 'plan']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_customer',
      description: 'Update an existing customer record',
      parameters: {
        type: 'object',
        properties: {
          customer_id: {
            type: 'string',
            description: 'The unique identifier of the customer'
          },
          name: {
            type: 'string',
            description: 'Updated customer name'
          },
          email: {
            type: 'string',
            description: 'Updated email address'
          },
          plan: {
            type: 'string',
            description: 'Updated subscription plan'
          },
          status: {
            type: 'string',
            description: 'Updated status (active/inactive)'
          }
        },
        required: ['customer_id']
      }
    }
  }
];

// MCP Access Functions - All go through ArmorIQ proxy

async function callMCPEndpoint(method, path, data = null) {
  const url = `${ARMORIQ_PROXY_URL}/proxy/${ENDPOINT_ID}${path}`;
  
  console.log(`\n🔐 [Agent → ArmorIQ Proxy] ${method} ${path}`);
  
  try {
    const response = await axios({
      method,
      url,
      data,
      headers: {
        'X-ArmorIQ-API-Key': ARMORIQ_API_KEY,
        'X-ArmorIQ-Agent-ID': AGENT_ID,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`✅ [ArmorIQ → Agent] Success: ${response.status}`);
    return response.data;
    
  } catch (error) {
    if (error.response) {
      console.log(`❌ [ArmorIQ → Agent] Denied: ${error.response.status}`);
      console.log(`   Reason: ${JSON.stringify(error.response.data)}`);
      return { error: error.response.data };
    }
    throw error;
  }
}

async function getCustomers() {
  return await callMCPEndpoint('GET', '/api/customers');
}

async function getCustomerById(customerId) {
  return await callMCPEndpoint('GET', `/api/customers/${customerId}`);
}

async function createCustomer(name, email, plan) {
  return await callMCPEndpoint('POST', '/api/customers', { name, email, plan });
}

async function updateCustomer(customerId, updates) {
  return await callMCPEndpoint('PUT', `/api/customers/${customerId}`, updates);
}

// Function call handler
async function handleFunctionCall(functionName, args) {
  console.log(`\n🤖 [Agent] Executing: ${functionName}(${JSON.stringify(args)})`);
  
  switch (functionName) {
    case 'get_customers':
      return await getCustomers();
    
    case 'get_customer_by_id':
      return await getCustomerById(args.customer_id);
    
    case 'create_customer':
      return await createCustomer(args.name, args.email, args.plan);
    
    case 'update_customer':
      const { customer_id, ...updates } = args;
      return await updateCustomer(customer_id, updates);
    
    default:
      return { error: 'Unknown function' };
  }
}

// Main agent conversation loop
async function runAgent(userMessage) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`👤 User: ${userMessage}`);
  console.log('='.repeat(80));
  
  const messages = [
    {
      role: 'system',
      content: 'You are a helpful customer service AI agent with access to a customer database. You can view, create, and update customer records. When asked about customers, use the available functions to access the data.'
    },
    {
      role: 'user',
      content: userMessage
    }
  ];
  
  let continueLoop = true;
  
  while (continueLoop) {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: messages,
      tools: tools,
      tool_choice: 'auto'
    });
    
    const message = response.choices[0].message;
    messages.push(message);
    
    // Check if agent wants to call functions
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
        
        // Execute the function
        const functionResult = await handleFunctionCall(functionName, functionArgs);
        
        // Add function result to conversation
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(functionResult)
        });
      }
    } else {
      // Agent has finished and provided final response
      console.log(`\n🤖 Agent: ${message.content}\n`);
      continueLoop = false;
    }
  }
}

// Demo scenarios
async function runDemoScenarios() {
  console.log('\n🚀 ArmorIQ Agent Demo - Starting...\n');
  console.log(`Agent ID: ${AGENT_ID}`);
  console.log(`ArmorIQ Proxy: ${ARMORIQ_PROXY_URL}`);
  console.log(`MCP Endpoint: ${ENDPOINT_ID}`);
  
  // Scenario 1: Get customer list (READ permission - should succeed)
  await runAgent('Show me all our customers');
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Scenario 2: Get specific customer (READ permission - should succeed)
  await runAgent('Tell me about customer with ID 1');
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Scenario 3: Create new customer (CREATE permission - should succeed)
  await runAgent('Create a new customer: David Brown, david@example.com, Professional plan');
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Scenario 4: Update customer (UPDATE permission - should succeed)
  await runAgent('Update customer ID 2 to Enterprise plan');
  
  console.log(`\n${'='.repeat(80)}`);
  console.log('✅ Demo Complete!');
  console.log('='.repeat(80));
  console.log('\n💡 Try DELETE operation (will be denied):');
  console.log('   Agent does not have DELETE permission in ArmorIQ policy\n');
}

// Run demo
runDemoScenarios().catch(console.error);
