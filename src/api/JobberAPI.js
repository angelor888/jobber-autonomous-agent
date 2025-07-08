const axios = require('axios');
const logger = require('../utils/logger');

class JobberAPI {
  constructor() {
    this.baseURL = 'https://api.getjobber.com/api';
    this.graphqlURL = 'https://api.getjobber.com/api/graphql';
    this.accessToken = null;
    this.tokenExpiry = null;
    this.rateLimiter = {
      requests: 0,
      resetTime: Date.now() + 60000,
      maxRequests: 120 // Jobber's rate limit
    };
  }

  async initialize() {
    try {
      await this.refreshAccessToken();
      logger.info('JobberAPI initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize JobberAPI:', error);
      throw error;
    }
  }

  async refreshAccessToken() {
    try {
      const response = await axios.post(`${this.baseURL}/oauth/token`, {
        grant_type: 'client_credentials',
        client_id: process.env.JOBBER_CLIENT_ID,
        client_secret: process.env.JOBBER_CLIENT_SECRET,
        scope: 'read write'
      });

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
      
      logger.info('Access token refreshed successfully');
    } catch (error) {
      logger.error('Failed to refresh access token:', error);
      throw error;
    }
  }

  async ensureValidToken() {
    if (!this.accessToken || Date.now() >= this.tokenExpiry - 60000) {
      await this.refreshAccessToken();
    }
  }

  async checkRateLimit() {
    if (Date.now() > this.rateLimiter.resetTime) {
      this.rateLimiter.requests = 0;
      this.rateLimiter.resetTime = Date.now() + 60000;
    }

    if (this.rateLimiter.requests >= this.rateLimiter.maxRequests) {
      const waitTime = this.rateLimiter.resetTime - Date.now();
      logger.warn(`Rate limit reached. Waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.rateLimiter.requests = 0;
    }

    this.rateLimiter.requests++;
  }

  async graphqlRequest(query, variables = {}) {
    await this.ensureValidToken();
    await this.checkRateLimit();

    try {
      const response = await axios.post(
        this.graphqlURL,
        { query, variables },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            'X-Api-Version': '2023-11-15'
          },
          timeout: 30000
        }
      );

      if (response.data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
      }

      return response.data.data;
    } catch (error) {
      logger.error('GraphQL request failed:', error);
      throw error;
    }
  }

  // Job Operations
  async getJob(jobId) {
    const query = `
      query GetJob($id: ID!) {
        job(id: $id) {
          id
          title
          description
          status
          startAt
          endAt
          createdAt
          updatedAt
          client {
            id
            name
            email
            phone
          }
          assignedTo {
            id
            name
            email
          }
          property {
            id
            address {
              street1
              street2
              city
              province
              postalCode
              country
            }
          }
          total
          notes {
            id
            message
            createdAt
            createdBy {
              id
              name
            }
          }
        }
      }
    `;

    const data = await this.graphqlRequest(query, { id: jobId });
    return data.job;
  }

  async updateJob(jobId, updates) {
    const mutation = `
      mutation UpdateJob($id: ID!, $input: JobUpdateInput!) {
        jobUpdate(id: $id, input: $input) {
          job {
            id
            title
            status
            updatedAt
          }
          success
          errors
        }
      }
    `;

    const data = await this.graphqlRequest(mutation, { id: jobId, input: updates });
    
    if (!data.jobUpdate.success) {
      throw new Error(`Failed to update job: ${data.jobUpdate.errors}`);
    }

    return data.jobUpdate.job;
  }

  async assignJob(jobId, userId) {
    const mutation = `
      mutation AssignJob($jobId: ID!, $userId: ID!) {
        jobAssign(jobId: $jobId, userId: $userId) {
          job {
            id
            assignedTo {
              id
              name
            }
          }
          success
          errors
        }
      }
    `;

    const data = await this.graphqlRequest(mutation, { jobId, userId });
    
    if (!data.jobAssign.success) {
      throw new Error(`Failed to assign job: ${data.jobAssign.errors}`);
    }

    return data.jobAssign.job;
  }

  // Client Operations
  async getClient(clientId) {
    const query = `
      query GetClient($id: ID!) {
        client(id: $id) {
          id
          name
          email
          phone
          companyName
          isCompany
          tags
          createdAt
          properties {
            nodes {
              id
              address {
                street1
                city
                province
              }
            }
          }
          totalRevenue
          jobCount
        }
      }
    `;

    const data = await this.graphqlRequest(query, { id: clientId });
    return data.client;
  }

  async searchClients(searchTerm) {
    const query = `
      query SearchClients($searchTerm: String!) {
        clients(searchTerm: $searchTerm, first: 10) {
          nodes {
            id
            name
            email
            phone
            companyName
          }
        }
      }
    `;

    const data = await this.graphqlRequest(query, { searchTerm });
    return data.clients.nodes;
  }

  // User Operations (for multi-user support)
  async getUsers() {
    const query = `
      query GetUsers {
        users(first: 100) {
          nodes {
            id
            name
            email
            role
            isActive
          }
        }
      }
    `;

    const data = await this.graphqlRequest(query);
    return data.users.nodes;
  }

  async getUserById(userId) {
    const query = `
      query GetUser($id: ID!) {
        user(id: $id) {
          id
          name
          email
          role
          isActive
          permissions
        }
      }
    `;

    const data = await this.graphqlRequest(query, { id: userId });
    return data.user;
  }

  // Schedule Operations
  async getSchedule(startDate, endDate) {
    const query = `
      query GetSchedule($start: DateTime!, $end: DateTime!) {
        schedule(start: $start, end: $end) {
          jobs {
            id
            title
            startAt
            endAt
            assignedTo {
              id
              name
            }
          }
          visits {
            id
            title
            startAt
            endAt
            assignedTo {
              id
              name
            }
          }
        }
      }
    `;

    const data = await this.graphqlRequest(query, { start: startDate, end: endDate });
    return data.schedule;
  }

  // Webhook Event Processing
  async processWebhookEvent(event) {
    const { topic, itemId } = event;
    
    logger.info(`Processing webhook event: ${topic} for item ${itemId}`);

    switch (topic) {
      case 'JOB_CREATE':
      case 'JOB_UPDATE':
        return await this.getJob(itemId);
      
      case 'CLIENT_CREATE':
      case 'CLIENT_UPDATE':
        return await this.getClient(itemId);
      
      case 'QUOTE_CREATE':
      case 'QUOTE_UPDATE':
        return await this.getQuote(itemId);
      
      case 'INVOICE_CREATE':
      case 'INVOICE_UPDATE':
        return await this.getInvoice(itemId);
      
      default:
        logger.warn(`Unhandled webhook topic: ${topic}`);
        return null;
    }
  }

  // Quote Operations
  async getQuote(quoteId) {
    const query = `
      query GetQuote($id: ID!) {
        quote(id: $id) {
          id
          number
          status
          total
          createdAt
          expiresAt
          client {
            id
            name
            email
          }
          lineItems {
            id
            name
            description
            quantity
            unitPrice
            total
          }
        }
      }
    `;

    const data = await this.graphqlRequest(query, { id: quoteId });
    return data.quote;
  }

  // Invoice Operations
  async getInvoice(invoiceId) {
    const query = `
      query GetInvoice($id: ID!) {
        invoice(id: $id) {
          id
          number
          status
          total
          balance
          createdAt
          dueAt
          client {
            id
            name
            email
          }
          job {
            id
            title
          }
        }
      }
    `;

    const data = await this.graphqlRequest(query, { id: invoiceId });
    return data.invoice;
  }

  // Batch Operations
  async batchGetJobs(jobIds) {
    const query = `
      query BatchGetJobs($ids: [ID!]!) {
        jobs(ids: $ids) {
          nodes {
            id
            title
            status
            client {
              id
              name
            }
            assignedTo {
              id
              name
            }
          }
        }
      }
    `;

    const data = await this.graphqlRequest(query, { ids: jobIds });
    return data.jobs.nodes;
  }

  // Health Check
  async healthCheck() {
    try {
      await this.ensureValidToken();
      
      // Simple query to test API connection
      const query = `
        query HealthCheck {
          users(first: 1) {
            nodes {
              id
            }
          }
        }
      `;

      await this.graphqlRequest(query);
      return { status: 'healthy', api: 'connected' };
    } catch (error) {
      return { status: 'unhealthy', api: 'disconnected', error: error.message };
    }
  }
}

module.exports = new JobberAPI();