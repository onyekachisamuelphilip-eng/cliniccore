#!/usr/bin/env node

/**
 * Data migration script from MySQL to PostgreSQL
 * This script helps convert MySQL data export to PostgreSQL-compatible format
 */

import fs from "node:fs";

const MYSQL_DUMP_FILE = "mysql_data.sql";
const POSTGRES_DUMP_FILE = "postgres_data.sql";

function convertMySQLToPostgreSQL(mysqlDump) {
  let postgresDump = mysqlDump;

  // Convert boolean values (MySQL uses 1/0, PostgreSQL uses true/false)
  postgresDump = postgresDump.replace(/,1,/g, ",true,");
  postgresDump = postgresDump.replace(/,0,/g, ",false,");
  postgresDump = postgresDump.replace(/\(1,/g, "(true,");
  postgresDump = postgresDump.replace(/\(0,/g, "(false,");
  postgresDump = postgresDump.replace(/,1\)/g, ",true)");
  postgresDump = postgresDump.replace(/,0\)/g, ",false)");

  // Convert MySQL INSERT statements to PostgreSQL format
  postgresDump = postgresDump.replace(
    /INSERT INTO `([^`]+)`/g,
    'INSERT INTO "$1"'
  );

  // Convert backticks to double quotes for identifiers
  postgresDump = postgresDump.replace(/`([^`]+)`/g, '"$1"');

  // Convert MySQL date format if needed
  // MySQL and PostgreSQL both use ISO format, so this might not be necessary

  // Handle AUTO_INCREMENT values - PostgreSQL will handle this automatically
  // Remove any explicit ID insertions if they conflict with SERIAL

  // Convert MySQL specific functions if any
  postgresDump = postgresDump.replace(/NOW\(\)/g, "CURRENT_TIMESTAMP");

  // Add ON CONFLICT clauses for unique constraints if needed
  // This is more complex and might need manual handling per table

  return postgresDump;
}

function generatePostgreSQLInserts() {
  console.log("🔄 Converting MySQL data to PostgreSQL format...");

  if (!fs.existsSync(MYSQL_DUMP_FILE)) {
    console.error(`❌ MySQL dump file '${MYSQL_DUMP_FILE}' not found.`);
    console.log("Please create a MySQL dump first:");
    console.log(
      "mysqldump -u your_user -p --no-create-info --complete-insert --single-transaction cliniccore > mysql_data.sql"
    );
    process.exit(1);
  }

  try {
    const mysqlDump = fs.readFileSync(MYSQL_DUMP_FILE, "utf8");
    const postgresDump = convertMySQLToPostgreSQL(mysqlDump);

    // Add PostgreSQL-specific headers
    const postgresHeader = `
-- PostgreSQL data migration from MySQL
-- Generated on: ${new Date().toISOString()}
-- 
-- Note: This script assumes the PostgreSQL schema is already created
-- Run 'pnpm db:push' before executing this script

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

-- Disable triggers during data import for better performance
SET session_replication_role = replica;

`;

    const postgresFooter = `
-- Re-enable triggers
SET session_replication_role = DEFAULT;

-- Update sequences to match the imported data
SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE(MAX(id), 1)) FROM users;
SELECT setval(pg_get_serial_sequence('doctors', 'id'), COALESCE(MAX(id), 1)) FROM doctors;
SELECT setval(pg_get_serial_sequence('patients', 'id'), COALESCE(MAX(id), 1)) FROM patients;
SELECT setval(pg_get_serial_sequence('appointments', 'id'), COALESCE(MAX(id), 1)) FROM appointments;
SELECT setval(pg_get_serial_sequence('visit_notes', 'id'), COALESCE(MAX(id), 1)) FROM visit_notes;
SELECT setval(pg_get_serial_sequence('logs', 'id'), COALESCE(MAX(id), 1)) FROM logs;
SELECT setval(pg_get_serial_sequence('patient_accounts', 'id'), COALESCE(MAX(id), 1)) FROM patient_accounts;

-- Verify data counts
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'doctors', COUNT(*) FROM doctors
UNION ALL
SELECT 'patients', COUNT(*) FROM patients
UNION ALL
SELECT 'appointments', COUNT(*) FROM appointments
UNION ALL
SELECT 'visit_notes', COUNT(*) FROM visit_notes
UNION ALL
SELECT 'logs', COUNT(*) FROM logs
UNION ALL
SELECT 'patient_accounts', COUNT(*) FROM patient_accounts;

COMMIT;
`;

    const finalDump = postgresHeader + postgresDump + postgresFooter;

    fs.writeFileSync(POSTGRES_DUMP_FILE, finalDump);

    console.log("✅ PostgreSQL data file generated successfully!");
    console.log(`📁 Output file: ${POSTGRES_DUMP_FILE}`);
    console.log("");
    console.log("Next steps:");
    console.log(
      "1. Ensure PostgreSQL is running and schema is created (pnpm db:push)"
    );
    console.log(
      `2. Import the data: psql -U cliniccore_user -d cliniccore -f ${POSTGRES_DUMP_FILE}`
    );
    console.log(
      "3. Or using Docker: docker-compose exec database psql -U cliniccore_user -d cliniccore -f /tmp/postgres_data.sql"
    );
  } catch (error) {
    console.error("❌ Error converting data:", error.message);
    process.exit(1);
  }
}

// Manual data conversion helpers
function generateManualConversionSQL() {
  const manualSQL = `
-- Manual data conversion queries
-- Run these after importing the basic data

-- Convert any remaining boolean values in patient_accounts
UPDATE patient_accounts SET is_active = true WHERE is_active::text = '1';
UPDATE patient_accounts SET is_active = false WHERE is_active::text = '0';

-- Verify enum values are correct
SELECT DISTINCT role FROM users;
SELECT DISTINCT gender FROM patients;
SELECT DISTINCT status FROM appointments;

-- Check for any data inconsistencies
SELECT * FROM users WHERE role NOT IN ('admin', 'receptionist', 'doctor', 'patient');
SELECT * FROM patients WHERE gender NOT IN ('male', 'female', 'other');
SELECT * FROM appointments WHERE status NOT IN ('scheduled', 'completed', 'cancelled', 'no_show');
`;

  fs.writeFileSync("manual_conversion.sql", manualSQL);
  console.log("📝 Manual conversion SQL generated: manual_conversion.sql");
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  generatePostgreSQLInserts();
  generateManualConversionSQL();
}
