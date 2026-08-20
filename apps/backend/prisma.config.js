const { defineConfig } = require('@prisma/config');

// Load .env locally; Render injects env vars directly into the process
if (!process.env.DATABASE_URL) {
  try {
    const dotenv = require('dotenv');
    const path = require('path');
    dotenv.config({ path: path.resolve(__dirname, '.env') });
  } catch {}
}

module.exports = defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
