-- Run this against your Azure SQL database after creation

CREATE TABLE app_admins (
  id NVARCHAR(50) NOT NULL PRIMARY KEY,
  username NVARCHAR(100) NOT NULL,
  password_hash NVARCHAR(255) NOT NULL,
  created_at DATETIME2 DEFAULT GETUTCDATE(),
  CONSTRAINT UQ_admin_username UNIQUE (username)
);

-- Default admin: username=admin, password=Apv3@Airport!
INSERT INTO app_admins (id, username, password_hash)
VALUES ('default-admin', 'admin', '$2a$10$v/G1l.kk/uclblwCGZjMJeCAH.CPat6rvKjFeHmbCGrAKrUEsT3h.');

CREATE TABLE sites (
  id NVARCHAR(50) NOT NULL PRIMARY KEY,
  name NVARCHAR(200) NOT NULL,
  iata_code NVARCHAR(10) NOT NULL,
  site_id NVARCHAR(50) NOT NULL,
  base_url NVARCHAR(500) NOT NULL,
  description NVARCHAR(1000),
  admin_users NVARCHAR(MAX) DEFAULT '[]',
  enabled BIT DEFAULT 1,
  service_api_key NVARCHAR(200),
  fetch_timeout_seconds INT NOT NULL DEFAULT 60,
  created_at DATETIME2 DEFAULT GETUTCDATE(),
  updated_at DATETIME2 DEFAULT GETUTCDATE(),
  CONSTRAINT UQ_site_iata UNIQUE (iata_code)
);

CREATE TABLE site_field_definitions (
  id NVARCHAR(50) NOT NULL PRIMARY KEY,
  site_id NVARCHAR(50) NOT NULL,
  name NVARCHAR(100) NOT NULL,
  label NVARCHAR(200) NOT NULL,
  type NVARCHAR(20) NOT NULL,
  date_format NVARCHAR(50),
  enabled BIT DEFAULT 1,
  is_built_in BIT DEFAULT 0,
  sort_order INT DEFAULT 0,
  expression NVARCHAR(MAX),
  color_rules NVARCHAR(MAX) DEFAULT '[]',
  created_at DATETIME2 DEFAULT GETUTCDATE(),
  updated_at DATETIME2 DEFAULT GETUTCDATE(),
  CONSTRAINT FK_field_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE TABLE saved_reports (
  id NVARCHAR(50) NOT NULL PRIMARY KEY,
  name NVARCHAR(200) NOT NULL,
  description NVARCHAR(1000),
  is_base_report BIT DEFAULT 0,
  created_by NVARCHAR(100),
  fields NVARCHAR(MAX) NOT NULL DEFAULT '[]',
  chart_type NVARCHAR(20) NOT NULL DEFAULT 'table',
  group_by NVARCHAR(50) DEFAULT 'linecode',
  aggregation NVARCHAR(20) DEFAULT 'count',
  field_date_formats NVARCHAR(MAX) DEFAULT '{}',
  created_at DATETIME2 DEFAULT GETUTCDATE(),
  updated_at DATETIME2 DEFAULT GETUTCDATE()
);

CREATE TABLE report_site_assignments (
  report_id NVARCHAR(50) NOT NULL,
  site_id NVARCHAR(50) NOT NULL,
  PRIMARY KEY (report_id, site_id),
  CONSTRAINT FK_rsa_report FOREIGN KEY (report_id) REFERENCES saved_reports(id) ON DELETE CASCADE,
  CONSTRAINT FK_rsa_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

-- ─── v2 migrations (applied automatically by runMigrations() on startup) ─────
-- These columns are added via idempotent ALTER TABLE in db.ts:

-- ALTER TABLE saved_reports ADD site_id NVARCHAR(50) NULL;
--   → Which site owns this report. NULL = app-admin-owned template.

-- ALTER TABLE saved_reports ADD is_active BIT NOT NULL DEFAULT 1;
--   → Site admins can deactivate a report to hide it from regular users.

-- ALTER TABLE saved_reports ADD parent_report_id NVARCHAR(50) NULL;
--   → Tracks lineage when a report is cloned from a template.

-- New table for full audit trail:
-- CREATE TABLE report_audit_log (
--   id             NVARCHAR(50)  NOT NULL PRIMARY KEY,
--   report_id      NVARCHAR(50)  NOT NULL,           -- report this entry belongs to
--   site_id        NVARCHAR(50)  NULL,               -- site context
--   changed_by     NVARCHAR(100) NOT NULL,           -- username
--   changed_at     DATETIME2     DEFAULT GETUTCDATE(),
--   action         NVARCHAR(20)  NOT NULL,           -- created|updated|cloned|deleted|activated|deactivated
--   summary        NVARCHAR(MAX) NULL,               -- human-readable change description
--   snapshot_before NVARCHAR(MAX) NULL,              -- full report JSON before change
--   snapshot_after  NVARCHAR(MAX) NULL               -- full report JSON after change
-- );
