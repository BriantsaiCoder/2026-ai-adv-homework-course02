const app = require('./app');

const PORT = process.env.PORT || 3001;

if (require.main === module) {
  if (!process.env.JWT_SECRET) {
    console.error('Fatal: JWT_SECRET is not set');
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
