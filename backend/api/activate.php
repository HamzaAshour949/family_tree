<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib.php';

$body = json_body();
$serial = normalize_serial((string) ($body['serial_key'] ?? ''));
$deviceId = normalize_device_fingerprint($body);
$customerEmail = strtolower(trim((string) ($body['customer_email'] ?? '')));

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

$pdo = db();
$countStatement = $pdo->prepare('SELECT COUNT(*) FROM activations WHERE license_id = :license_id');
$countStatement->execute(['license_id' => $license['id']]);
$activationCount = (int) $countStatement->fetchColumn();

$existingStatement = $pdo->prepare('SELECT id FROM activations WHERE license_id = :license_id AND device_id = :device_id');
$existingStatement->execute(['license_id' => $license['id'], 'device_id' => $deviceId]);
$existingActivation = $existingStatement->fetchColumn();

if (!$existingActivation && $activationCount >= 1) {
    $legacyStatement = $pdo->prepare('SELECT id, device_id FROM activations WHERE license_id = :license_id ORDER BY activated_at ASC LIMIT 1');
    $legacyStatement->execute(['license_id' => $license['id']]);
    $legacyActivation = $legacyStatement->fetch();
    if ($activationCount === 1 && $legacyActivation && !is_hardware_fingerprint((string) $legacyActivation['device_id'])) {
        $migrate = $pdo->prepare('UPDATE activations SET device_id = :device_id, app_version = :app_version, platform = :platform, last_verified_at = :last_verified_at WHERE id = :id');
        $migrate->execute(['id' => $legacyActivation['id'], 'device_id' => $deviceId, 'app_version' => (string) ($body['app_version'] ?? ''), 'platform' => (string) ($body['platform'] ?? ''), 'last_verified_at' => gmdate('c')]);
        $existingActivation = $legacyActivation['id'];
    } else {
        respond(['status' => 'inactive', 'message' => 'This serial key is already linked to another device.'], 403);
    }
}

if (!$existingActivation) {
    $insert = $pdo->prepare('INSERT INTO activations (license_id, device_id, app_version, platform, activated_at, last_verified_at) VALUES (:license_id, :device_id, :app_version, :platform, :activated_at, :last_verified_at)');
    $insert->execute(['license_id' => $license['id'], 'device_id' => $deviceId, 'app_version' => (string) ($body['app_version'] ?? ''), 'platform' => (string) ($body['platform'] ?? ''), 'activated_at' => gmdate('c'), 'last_verified_at' => gmdate('c')]);
} else {
    $update = $pdo->prepare('UPDATE activations SET last_verified_at = :last_verified_at, app_version = :app_version, platform = :platform WHERE id = :id');
    $update->execute(['id' => $existingActivation, 'last_verified_at' => gmdate('c'), 'app_version' => (string) ($body['app_version'] ?? ''), 'platform' => (string) ($body['platform'] ?? '')]);
}

if ($customerEmail !== '' && empty($license['customer_email'])) {
    $updateLicense = $pdo->prepare('UPDATE licenses SET customer_email = :customer_email WHERE id = :id');
    $updateLicense->execute(['customer_email' => $customerEmail, 'id' => $license['id']]);
    $license['customer_email'] = $customerEmail;
}

record_usage((int) $license['id'], 'activate', fingerprint_metadata($body));
respond(activation_payload($license, 'License activated.'));
