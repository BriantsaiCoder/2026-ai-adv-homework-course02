const swaggerOptions = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'E-Commerce Demo API',
      version: '1.0.0',
      description: '花卉電商網站 REST API'
    },
    servers: [{ url: 'http://localhost:3001' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        },
        sessionId: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Session-Id'
        }
      }
    }
  },
  apis: ['./src/routes/*.js']
};

module.exports = swaggerOptions;
