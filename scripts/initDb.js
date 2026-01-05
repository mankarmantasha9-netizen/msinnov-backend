require("dotenv").config();
const { Client } = require("pg");

async function main() {
  // 1) Connect to the default "postgres" DB as superuser
  const rootClient = new Client({
    connectionString: process.env.POSTGRES_ROOT_URL,
  });

  try {
    await rootClient.connect();
    console.log("Connected to postgres database as root");

    // 2) Create msinnov database if it doesn't exist
    try {
      await rootClient.query('CREATE DATABASE msinnov;');
      console.log("Database 'msinnov' created");
    } catch (err) {
      if (err.code === "42P04") {
        console.log("Database 'msinnov' already exists, skipping create");
      } else {
        throw err;
      }
    }
  } finally {
    await rootClient.end();
  }

  // 3) Connect to msinnov database
  const appClient = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await appClient.connect();
    console.log("Connected to msinnov database");

    // 4) Create enquiries table if not exists
    await appClient.query(`
      CREATE TABLE IF NOT EXISTS enquiries (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("Table 'enquiries' is ready");
  } finally {
    await appClient.end();
  }

  console.log("✅ Database + table setup complete");
}

main()
  .catch(err => {
    console.error("Init error:", err);
  })
  .finally(() => process.exit());
