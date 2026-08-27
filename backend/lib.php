<?php

declare(strict_types=1);

$config = __DIR__ . '/config.php';
if (!is_file($config)) {
    $config = __DIR__ . '/config.example.php';
}
require_once $config;

function load_env_file(string $path): void
{
    if (!is_file($path)) {
        return;
    }
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!$lines) {
        return;
    }
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = array_map('trim', explode('=', $line, 2));
        $value = trim($value, "\"'");
        if ($key !== '' && getenv($key) === false) {
            putenv($key . '=' . $value);
            $_ENV[$key] = $value;
        }
    }
}

load_env_file(dirname(__DIR__) . '/.env');

handle_api_preflight();

function is_api_request(): bool
{
    $path = parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH);
    return is_string($path) && str_starts_with($path, '/api/');
}

function send_api_cors_headers(): void
{
    if (!is_api_request()) {
        return;
    }
    $origin = trim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''));
    header('Access-Control-Allow-Origin: ' . ($origin !== '' ? $origin : '*'));
    header('Vary: Origin', false);
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Fts-Serial, X-Fts-Device');
    header('Access-Control-Max-Age: 86400');
}

function handle_api_preflight(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'OPTIONS' || !is_api_request()) {
        return;
    }
    send_api_cors_headers();
    http_response_code(204);
    exit;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $pdo = new PDO('sqlite:' . DB_PATH);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    return $pdo;
}

function json_body(): array
{
    $raw = file_get_contents('php://input') ?: '{}';
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function respond(array $payload, int $status = 200): never
{
    http_response_code($status);
    send_api_cors_headers();
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function require_admin(): void
{
    start_admin_session();
    if (($_SESSION['admin_authenticated'] ?? false) === true) {
        return;
    }
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'login') {
        $username = trim((string) ($_POST['username'] ?? ''));
        $password = (string) ($_POST['password'] ?? '');
        if (hash_equals(admin_username(), $username) && admin_password_is_valid($password)) {
            session_regenerate_id(true);
            $_SESSION['admin_authenticated'] = true;
            $_SESSION['admin_username'] = $username;
            header('Location: /admin/');
            exit;
        }
        render_admin_login('The username or password is incorrect.');
        exit;
    }
    render_admin_login();
    exit;
}

function start_admin_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_name('fts_admin');
    session_set_cookie_params([
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => !empty($_SERVER['HTTPS']),
    ]);
    session_start();
}

function admin_username(): string
{
    $username = getenv('ADMIN_USERNAME');
    return $username !== false && $username !== '' ? $username : ADMIN_USERNAME;
}

function admin_password_is_valid(string $password): bool
{
    $plainPassword = getenv('ADMIN_PASSWORD');
    if ($plainPassword !== false && $plainPassword !== '') {
        return hash_equals($plainPassword, $password);
    }
    return password_verify($password, ADMIN_PASSWORD_HASH);
}

function render_admin_login(string $error = ''): void
{
    http_response_code($error === '' ? 200 : 401);
    $safeError = htmlspecialchars($error, ENT_QUOTES, 'UTF-8');
    echo <<<HTML
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Family Tree Studio Admin</title>
    <style>
        :root { color-scheme: dark; --bg: #101214; --panel: #171b1f; --field: #1f262b; --border: #35414a; --text: #edf3f2; --muted: #9fafaa; --accent: #3ecfb2; --rose: #ff6b8a; }
        * { box-sizing: border-box; }
        body { display: grid; min-height: 100vh; margin: 0; place-items: center; padding: 22px; background: radial-gradient(circle at 30% 12%, rgba(62, 207, 178, .14), transparent 28%), var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        main { width: min(430px, 100%); border: 1px solid var(--border); border-radius: 8px; padding: 24px; background: var(--panel); box-shadow: 0 22px 70px rgba(0, 0, 0, .28); }
        h1 { margin: 0 0 8px; font-size: 1.45rem; }
        p { margin: 0 0 18px; color: var(--muted); line-height: 1.6; }
        form, label { display: grid; gap: 10px; }
        label { color: var(--muted); font-size: .86rem; font-weight: 700; }
        input, button { min-height: 42px; border: 1px solid var(--border); border-radius: 8px; padding: 8px 11px; color: var(--text); background: var(--field); font: inherit; }
        button { border-color: var(--accent); color: #071613; background: var(--accent); cursor: pointer; font-weight: 760; }
        .error { border: 1px solid var(--rose); border-radius: 8px; margin-bottom: 14px; padding: 10px; color: var(--rose); background: rgba(255, 107, 138, .08); }
    </style>
</head>
<body>
<main>
    <h1>Admin Login</h1>
    <p>Sign in to manage Family Tree Studio licenses, customers, activations, and support notes.</p>
HTML;
    if ($error !== '') {
        echo '<div class="error">' . $safeError . '</div>';
    }
    echo <<<HTML
    <form method="post">
        <input type="hidden" name="action" value="login">
        <label>Username<input name="username" autocomplete="username" required autofocus></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
        <button type="submit">Sign in</button>
    </form>
</main>
</body>
</html>
HTML;
}

function normalize_serial(string $serial): string
{
    return strtoupper(preg_replace('/[^A-Z0-9]/i', '', $serial) ?? '');
}

function normalize_device_fingerprint(array $body): string
{
    return strtolower(trim((string) ($body['device_fingerprint'] ?? $body['device_id'] ?? '')));
}

function is_hardware_fingerprint(string $deviceId): bool
{
    return preg_match('/^[a-f0-9]{64}$/', $deviceId) === 1;
}

function fingerprint_metadata(array $body): array
{
    $macs = array_values(array_filter(array_map('trim', explode(',', (string) ($body['fingerprint_macs'] ?? '')))));
    return [
        'device_fingerprint' => normalize_device_fingerprint($body),
        'fingerprint_cpu' => trim((string) ($body['fingerprint_cpu'] ?? '')),
        'fingerprint_motherboard' => trim((string) ($body['fingerprint_motherboard'] ?? '')),
        'fingerprint_macs' => $macs,
        'fingerprint_sources' => array_values(array_filter(array_map('trim', explode(',', (string) ($body['fingerprint_sources'] ?? ''))))),
    ];
}

function update_request_header(string $name): string
{
    $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    return trim((string) ($_SERVER[$serverKey] ?? ''));
}

function authorized_update_license(): array
{
    $serial = normalize_serial(update_request_header('X-Fts-Serial'));
    $deviceId = strtolower(update_request_header('X-Fts-Device'));
    if ($serial === '' || $deviceId === '' || !is_hardware_fingerprint($deviceId)) {
        respond(['status' => 'inactive', 'message' => 'Activated license headers are required.'], 401);
    }

    $license = find_license($serial);
    if (!$license || !license_is_active($license)) {
        respond(['status' => $license['status'] ?? 'inactive', 'message' => 'License is not active.'], 403);
    }

    $statement = db()->prepare('SELECT id FROM activations WHERE license_id = :license_id AND device_id = :device_id');
    $statement->execute(['license_id' => $license['id'], 'device_id' => $deviceId]);
    if (!$statement->fetchColumn()) {
        respond(['status' => 'inactive', 'message' => 'This license is not activated on this device.'], 403);
    }

    return $license;
}

function respond_no_update(): never
{
    send_api_cors_headers();
    http_response_code(204);
    exit;
}

function make_serial_key(): string
{
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $body = '';
    for ($index = 0; $index < 20; $index++) {
        $body .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    }
    $checksum = substr(strtoupper(hash_hmac('sha256', $body, LICENSE_HMAC_SECRET)), 0, 4);
    return implode('-', str_split($body . $checksum, 4));
}

function find_license(string $serial): ?array
{
    $statement = db()->prepare('SELECT * FROM licenses WHERE serial_key = :serial_key');
    $statement->execute(['serial_key' => normalize_serial($serial)]);
    $license = $statement->fetch();
    return $license ?: null;
}

function license_is_active(array $license): bool
{
    if (($license['status'] ?? '') !== 'active') {
        return false;
    }
    if (!empty($license['expires_at']) && strtotime((string) $license['expires_at']) < time()) {
        return false;
    }
    return true;
}

function record_usage(int $licenseId, string $event, array $metadata = []): void
{
    $statement = db()->prepare('INSERT INTO usage_events (license_id, event, metadata, created_at) VALUES (:license_id, :event, :metadata, :created_at)');
    $statement->execute([
        'license_id' => $licenseId,
        'event' => $event,
        'metadata' => json_encode($metadata, JSON_UNESCAPED_SLASHES),
        'created_at' => gmdate('c'),
    ]);
}

function activation_payload(array $license, string $message = 'License active.'): array
{
    return [
        'status' => 'active',
        'tier' => $license['tier'] ?? 'full',
        'serial_key' => $license['serial_key'],
        'customer_email' => $license['customer_email'] ?? null,
        'expires_at' => $license['expires_at'] ?? null,
        'message' => $message,
        'artifact_sha256' => FULL_UPDATE_SHA256,
        'signature' => hash_hmac('sha256', $license['serial_key'] . '|' . ($license['expires_at'] ?? ''), LICENSE_HMAC_SECRET),
    ];
}

function stablecoin_contracts(): array
{
    return [
        'USDT' => USDT_CONTRACT_ADDRESS,
        'USDC' => USDC_CONTRACT_ADDRESS,
    ];
}

function required_payment_units(): int
{
    return (int) round(((float) LICENSE_PRICE_USD) * 1_000_000);
}

function verify_stablecoin_transfer(string $txHash, string $payerAddress, string $coin): array
{
    $coin = strtoupper(trim($coin));
    $contracts = stablecoin_contracts();
    if (!isset($contracts[$coin])) {
        throw new RuntimeException('Unsupported token. Choose USDT or USDC.');
    }
    $apiKey = getenv('ETHERSCAN_API_KEY') ?: '';
    if ($apiKey === '') {
        throw new RuntimeException('ETHERSCAN_API_KEY is missing from .env.');
    }
    $normalizedHash = strtolower(trim($txHash));
    $normalizedPayer = strtolower(trim($payerAddress));
    if ($normalizedHash === '' && $normalizedPayer === '') {
        throw new RuntimeException('Enter the wallet address you paid from, or paste the transaction hash.');
    }
    if ($normalizedHash !== '' && !preg_match('/^0x[a-f0-9]{64}$/', $normalizedHash)) {
        throw new RuntimeException('Enter a valid Ethereum transaction hash.');
    }
    if ($normalizedPayer !== '' && !preg_match('/^0x[a-f0-9]{40}$/', $normalizedPayer)) {
        throw new RuntimeException('Enter a valid Ethereum wallet address.');
    }

    $url = 'https://api.etherscan.io/v2/api?' . http_build_query([
        'chainid' => 1,
        'module' => 'account',
        'action' => 'tokentx',
        'contractaddress' => $contracts[$coin],
        'address' => PAYMENT_WALLET_ADDRESS,
        'page' => 1,
        'offset' => 100,
        'sort' => 'desc',
        'apikey' => $apiKey,
    ]);
    $raw = @file_get_contents($url);
    if ($raw === false) {
        throw new RuntimeException('Could not reach Etherscan. Try again shortly.');
    }
    $payload = json_decode($raw, true);
    if (!is_array($payload) || !array_key_exists('result', $payload)) {
        throw new RuntimeException('Unexpected Etherscan response.');
    }
    $result = $payload['result'];
    if (!is_array($result)) {
        $message = is_string($result) ? $result : 'Etherscan did not return token transfers.';
        throw new RuntimeException($message);
    }

    $requiredUnits = required_payment_units();
    foreach ($result as $transfer) {
        if (!is_array($transfer)) {
            continue;
        }
        $hash = strtolower((string) ($transfer['hash'] ?? ''));
        $from = strtolower((string) ($transfer['from'] ?? ''));
        $hashMatches = $normalizedHash === '' || $hash === $normalizedHash;
        $payerMatches = $normalizedPayer === '' || $from === $normalizedPayer;
        $toMatches = strtolower((string) ($transfer['to'] ?? '')) === strtolower(PAYMENT_WALLET_ADDRESS);
        $contractMatches = strtolower((string) ($transfer['contractAddress'] ?? '')) === strtolower($contracts[$coin]);
        $value = (int) ($transfer['value'] ?? 0);
        if ($hashMatches && $payerMatches && $toMatches && $contractMatches && $value >= $requiredUnits) {
            return $transfer;
        }
    }

    throw new RuntimeException('Payment not found yet. Confirm the token, sender wallet, destination wallet, amount, and network.');
}

function create_license_from_payment(string $email, string $name, string $txHash, string $payerAddress, string $coin): array
{
    $email = strtolower(trim($email));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('A valid email address is required.');
    }
    $coin = strtoupper(trim($coin));
    $transfer = verify_stablecoin_transfer($txHash, $payerAddress, $coin);
    $txHash = strtolower((string) ($transfer['hash'] ?? trim($txHash)));
    $pdo = db();

    $existing = $pdo->prepare('SELECT l.* FROM payments p JOIN licenses l ON l.id = p.license_id WHERE p.tx_hash = :tx_hash');
    $existing->execute(['tx_hash' => $txHash]);
    $license = $existing->fetch();
    if ($license) {
        return $license;
    }

    $serial = normalize_serial(make_serial_key());
    $pdo->beginTransaction();
    try {
        $customer = $pdo->prepare('INSERT INTO customers (email, name, created_at) VALUES (:email, :name, :created_at) ON CONFLICT(email) DO UPDATE SET name = excluded.name');
        $customer->execute(['email' => $email, 'name' => trim($name), 'created_at' => gmdate('c')]);

        $insertLicense = $pdo->prepare('INSERT INTO licenses (customer_email, serial_key, tier, status, max_activations, expires_at, created_at) VALUES (:customer_email, :serial_key, :tier, :status, :max_activations, :expires_at, :created_at)');
        $insertLicense->execute([
            'customer_email' => $email,
            'serial_key' => $serial,
            'tier' => 'full',
            'status' => 'active',
            'max_activations' => 1,
            'expires_at' => null,
            'created_at' => gmdate('c'),
        ]);
        $licenseId = (int) $pdo->lastInsertId();

        $insertPayment = $pdo->prepare('INSERT INTO payments (license_id, customer_email, tx_hash, token_symbol, token_value, expected_value, created_at) VALUES (:license_id, :customer_email, :tx_hash, :token_symbol, :token_value, :expected_value, :created_at)');
        $insertPayment->execute([
            'license_id' => $licenseId,
            'customer_email' => $email,
            'tx_hash' => $txHash,
            'token_symbol' => $coin,
            'token_value' => (string) ($transfer['value'] ?? ''),
            'expected_value' => (string) required_payment_units(),
            'created_at' => gmdate('c'),
        ]);
        record_usage($licenseId, 'purchase', ['tx_hash' => $txHash, 'token' => $coin]);
        $pdo->commit();
    } catch (Throwable $error) {
        $pdo->rollBack();
        throw $error;
    }

    $statement = $pdo->prepare('SELECT * FROM licenses WHERE id = :id');
    $statement->execute(['id' => $licenseId]);
    $license = $statement->fetch();
    if (!$license) {
        throw new RuntimeException('License was created but could not be loaded.');
    }
    return $license;
}
