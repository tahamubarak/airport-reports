import sql from 'mssql';

let pool: sql.ConnectionPool | null = null;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) return pool;
  const connStr = process.env.SQL_CONNECTION_STRING;
  if (!connStr) throw new Error('SQL_CONNECTION_STRING not set');
  pool = await sql.connect(connStr);
  return pool;
}

/** Idempotent schema migrations — run once on startup */
export async function runMigrations(): Promise<void> {
  try {
    const p = await getPool();
    // Add fetch_timeout_seconds to sites if missing (default 60s)
    await p.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID('sites') AND name = 'fetch_timeout_seconds'
      )
      ALTER TABLE sites ADD fetch_timeout_seconds INT NOT NULL DEFAULT 60
    `);
    // Add visible_filters to saved_reports if missing
    await p.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID('saved_reports') AND name = 'visible_filters'
      )
      ALTER TABLE saved_reports ADD visible_filters NVARCHAR(MAX) DEFAULT '["adi","airlines","status"]'
    `);
    // Add sort_config to saved_reports if missing
    await p.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID('saved_reports') AND name = 'sort_config'
      )
      ALTER TABLE saved_reports ADD sort_config NVARCHAR(MAX) DEFAULT '[]'
    `);
    // Add field_expressions to saved_reports if missing
    await p.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID('saved_reports') AND name = 'field_expressions'
      )
      ALTER TABLE saved_reports ADD field_expressions NVARCHAR(MAX) DEFAULT '{}'
    `);
    // Add column_labels to saved_reports if missing
    await p.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID('saved_reports') AND name = 'column_labels'
      )
      ALTER TABLE saved_reports ADD column_labels NVARCHAR(MAX) DEFAULT '{}'
    `);
    // Add filter_description to saved_reports if missing
    await p.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID('saved_reports') AND name = 'filter_description'
      )
      ALTER TABLE saved_reports ADD filter_description NVARCHAR(MAX)
    `);
    // Add default_filter_values to saved_reports if missing
    await p.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID('saved_reports') AND name = 'default_filter_values'
      )
      ALTER TABLE saved_reports ADD default_filter_values NVARCHAR(MAX) DEFAULT '{}'
    `);
    // Add field_color_rules to saved_reports if missing
    await p.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID('saved_reports') AND name = 'field_color_rules'
      )
      ALTER TABLE saved_reports ADD field_color_rules NVARCHAR(MAX) DEFAULT '{}'
    `);
    // Add site_id to saved_reports (which site owns this report; NULL = app admin template)
    await p.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('saved_reports') AND name = 'site_id')
      ALTER TABLE saved_reports ADD site_id NVARCHAR(50) NULL
    `);
    // Add is_active (site admin can enable/disable their reports)
    await p.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('saved_reports') AND name = 'is_active')
      ALTER TABLE saved_reports ADD is_active BIT NOT NULL DEFAULT 1
    `);
    // Add parent_report_id (tracks which template a cloned report came from)
    await p.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('saved_reports') AND name = 'parent_report_id')
      ALTER TABLE saved_reports ADD parent_report_id NVARCHAR(50) NULL
    `);
    // Create report_audit_log table
    await p.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'report_audit_log')
      CREATE TABLE report_audit_log (
        id NVARCHAR(50) NOT NULL PRIMARY KEY,
        report_id NVARCHAR(50) NOT NULL,
        site_id NVARCHAR(50) NULL,
        changed_by NVARCHAR(100) NOT NULL,
        changed_at DATETIME2 DEFAULT GETUTCDATE(),
        action NVARCHAR(20) NOT NULL,
        summary NVARCHAR(MAX) NULL,
        snapshot_before NVARCHAR(MAX) NULL,
        snapshot_after NVARCHAR(MAX) NULL
      )
    `);
    await p.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_audit_report' AND object_id = OBJECT_ID('report_audit_log'))
      CREATE INDEX IX_audit_report ON report_audit_log(report_id)
    `);
    await p.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_audit_changed_at' AND object_id = OBJECT_ID('report_audit_log'))
      CREATE INDEX IX_audit_changed_at ON report_audit_log(changed_at DESC)
    `);
    // Create user_activity_log table (login + data-load audit trail for site users)
    await p.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'user_activity_log')
      CREATE TABLE user_activity_log (
        id              NVARCHAR(50)  NOT NULL PRIMARY KEY,
        site_id         NVARCHAR(50)  NOT NULL,
        username        NVARCHAR(100) NOT NULL,
        activity_type   NVARCHAR(20)  NOT NULL,
        log_time        DATETIME2     DEFAULT GETUTCDATE(),
        load_start_date DATE          NULL,
        load_end_date   DATE          NULL
      )
    `);
    await p.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_activity_site_time' AND object_id = OBJECT_ID('user_activity_log'))
      CREATE INDEX IX_activity_site_time ON user_activity_log(site_id, log_time DESC)
    `);
    // Create app_settings key/value table (e.g. activity log retention period)
    await p.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'app_settings')
      CREATE TABLE app_settings (
        setting_key   NVARCHAR(100) NOT NULL PRIMARY KEY,
        setting_value NVARCHAR(500) NOT NULL,
        updated_at    DATETIME2 DEFAULT GETUTCDATE()
      )
    `);
    await p.request().query(`
      IF NOT EXISTS (SELECT 1 FROM app_settings WHERE setting_key = 'activity_log_retention_days')
      INSERT INTO app_settings (setting_key, setting_value) VALUES ('activity_log_retention_days', '30')
    `);
    // Purge expired activity rows on startup, based on the configured retention period
    await p.request().query(`
      DELETE FROM user_activity_log
      WHERE log_time < DATEADD(
        day,
        -CAST((SELECT setting_value FROM app_settings WHERE setting_key = 'activity_log_retention_days') AS INT),
        GETUTCDATE()
      )
    `);
    console.log('[db] Migrations complete');
  } catch (err) {
    console.error('[db] Migration error:', err);
  }
}

export { sql };
