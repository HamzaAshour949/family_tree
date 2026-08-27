<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib.php';

$body = json_body();
$license = find_license((string) ($body['serial_key'] ?? ''));
if (!$license || !license_is_active($license)) {
    respond(['status' => 'inactive'], 403);
}

record_usage((int) $license['id'], 'heartbeat', ['device_id' => (string) ($body['device_id'] ?? ''), 'metrics' => $body['metrics'] ?? []]);
respond(['status' => 'ok']);
