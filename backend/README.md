# Family Tree Studio Licensing Backend

This folder contains a compact PHP/SQLite backend for selling and managing Family Tree Studio serial keys.

## Setup

1. Copy `config.example.php` to `config.php`.
2. Generate a password hash:

   ```sh
   php -r "echo password_hash('choose-a-strong-password', PASSWORD_DEFAULT), PHP_EOL;"
   ```

3. Put that hash in `ADMIN_PASSWORD_HASH` and set a random `LICENSE_HMAC_SECRET`.
4. Initialize the database:

   ```sh
   php migrate.php
   ```

5. Serve the folder behind HTTPS in production. For local testing:

   ```sh
   php -S 127.0.0.1:8080
   ```

## Endpoints

- `POST /api/activate.php` validates a serial key, registers a device activation, and returns the full-license payload.
- `POST /api/verify.php` periodically checks that the device activation remains valid.
- `POST /api/download.php` returns the signed full-version artifact manifest for an activated device.
- `POST /api/heartbeat.php` records usage telemetry events.
- `/admin/` provides key generation, revocation, activation counts, usage monitoring, and support notes.

## Production Notes

- Run behind HTTPS only.
- Keep `config.php` outside public version control.
- Put `/admin/` behind additional server-level access controls for production.
- Back up the SQLite database or move to MySQL/PostgreSQL when sales volume grows.
- Treat the desktop app as an untrusted client. The server is the source of truth for serial-key state.