<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib.php';

try {
    $body = json_body();
    $license = create_license_from_payment(
        (string) ($body['email'] ?? ''),
        (string) ($body['name'] ?? ''),
        (string) ($body['tx_hash'] ?? ''),
        (string) ($body['payer_address'] ?? ''),
        (string) ($body['token'] ?? 'USDT'),
    );
    respond([
        'status' => 'active',
        'serial_key' => implode('-', str_split((string) $license['serial_key'], 4)),
        'license' => activation_payload($license, 'Purchase verified. License generated.'),
    ]);
} catch (Throwable $error) {
    respond(['status' => 'error', 'message' => $error->getMessage()], 422);
}