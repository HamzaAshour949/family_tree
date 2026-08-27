<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib.php';

$body = json_body();
$license = find_license((string) ($body['serial_key'] ?? ''));
$deviceId = normalize_device_fingerprint($body);

if (!$license || !license_is_active($license) || $deviceId === '') {
    respond(['status' => 'inactive', 'message' => 'Valid license and device fingerprint are required.'], 403);
}

if (!is_hardware_fingerprint($deviceId)) {
    respond(['status' => 'inactive', 'message' => 'A valid hardware fingerprint is required.'], 422);
}

$statement = db()->prepare('SELECT id FROM activations WHERE license_id = :license_id AND device_id = :device_id');
$statement->execute(['license_id' => $license['id'], 'device_id' => $deviceId]);
if (!$statement->fetchColumn()) {
    respond(['status' => 'inactive', 'message' => 'This serial key is linked to another device.'], 403);
}

record_usage((int) $license['id'], 'download_manifest', fingerprint_metadata($body));
respond([
    'status' => 'active',
    'update_url' => 'http://127.0.0.1:8080/api/update.php',
    'sha256' => FULL_UPDATE_SHA256,
    'signature' => hash_hmac('sha256', FULL_UPDATE_DOWNLOAD_URL . '|' . FULL_UPDATE_SHA256, LICENSE_HMAC_SECRET),
]);