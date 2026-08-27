<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib.php';

$body = json_body();
$serial = normalize_serial((string) ($body['serial_key'] ?? ''));
$deviceId = normalize_device_fingerprint($body);

if ($serial === '' || $deviceId === '') {
    respond(['status' => 'inactive', 'message' => 'Serial key and device fingerprint are required.'], 422);
}

if (!is_hardware_fingerprint($deviceId)) {
    respond(['status' => 'inactive', 'message' => 'A valid hardware fingerprint is required.'], 422);
}

$license = find_license($serial);
if (!$license || !license_is_active($license)) {
    respond(['status' => $license['status'] ?? 'inactive', 'message' => 'License is not active.'], 403);
}

$statement = db()->prepare('UPDATE activations SET last_verified_at = :last_verified_at, app_version = :app_version, platform = :platform WHERE license_id = :license_id AND device_id = :device_id');
$statement->execute(['license_id' => $license['id'], 'device_id' => $deviceId, 'last_verified_at' => gmdate('c'), 'app_version' => (string) ($body['app_version'] ?? ''), 'platform' => (string) ($body['platform'] ?? '')]);

if ($statement->rowCount() === 0) {
    respond(['status' => 'inactive', 'message' => 'This serial key is linked to another device.'], 403);
}

record_usage((int) $license['id'], 'verify', fingerprint_metadata($body));
respond(activation_payload($license, 'License verified.'));
