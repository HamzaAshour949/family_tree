<?php

declare(strict_types=1);

require_once __DIR__ . '/lib.php';

$schema = <<<SQL
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    customer_email TEXT,
    serial_key TEXT NOT NULL UNIQUE,
    tier TEXT NOT NULL DEFAULT 'full',
    status TEXT NOT NULL DEFAULT 'active',
    max_activations INTEGER NOT NULL DEFAULT 1,
    expires_at TEXT,
    created_at TEXT NOT NULL,
    revoked_at TEXT,
    FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS activations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_id INTEGER NOT NULL,
    device_id TEXT NOT NULL,
    app_version TEXT,
    platform TEXT,
    activated_at TEXT NOT NULL,
    last_verified_at TEXT,
    UNIQUE(license_id, device_id),
    FOREIGN KEY(license_id) REFERENCES licenses(id)
);

CREATE TABLE IF NOT EXISTS usage_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_id INTEGER NOT NULL,
    event TEXT NOT NULL,
    metadata TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(license_id) REFERENCES licenses(id)
);

CREATE TABLE IF NOT EXISTS support_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_id INTEGER NOT NULL,
    note TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(license_id) REFERENCES licenses(id)
);

CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_id INTEGER NOT NULL,
    customer_email TEXT NOT NULL,
    tx_hash TEXT NOT NULL UNIQUE,
    token_symbol TEXT NOT NULL,
    token_value TEXT NOT NULL,
    expected_value TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(license_id) REFERENCES licenses(id)
);
SQL;

db()->exec($schema);
db()->exec('UPDATE licenses SET max_activations = 1 WHERE max_activations <> 1');
echo "Database ready at " . DB_PATH . PHP_EOL;
