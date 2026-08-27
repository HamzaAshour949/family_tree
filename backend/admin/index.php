<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib.php';
require_admin();

$pdo = db();
$notice = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    if ($action === 'logout') {
        start_admin_session();
        $_SESSION = [];
        session_destroy();
        header('Location: /admin/');
        exit;
    }
    if ($action === 'generate') {
        $email = strtolower(trim((string) ($_POST['email'] ?? '')));
        $name = trim((string) ($_POST['name'] ?? ''));
        $serial = normalize_serial(make_serial_key());
        $pdo->beginTransaction();
        if ($email !== '') {
            $customer = $pdo->prepare('INSERT INTO customers (email, name, created_at) VALUES (:email, :name, :created_at) ON CONFLICT(email) DO UPDATE SET name = excluded.name');
            $customer->execute(['email' => $email, 'name' => $name, 'created_at' => gmdate('c')]);
        }
        $license = $pdo->prepare('INSERT INTO licenses (customer_email, serial_key, tier, status, max_activations, expires_at, created_at) VALUES (:customer_email, :serial_key, :tier, :status, :max_activations, :expires_at, :created_at)');
        $license->execute(['customer_email' => $email ?: null, 'serial_key' => $serial, 'tier' => (string) ($_POST['tier'] ?? 'full'), 'status' => 'active', 'max_activations' => 1, 'expires_at' => trim((string) ($_POST['expires_at'] ?? '')) ?: null, 'created_at' => gmdate('c')]);
        $pdo->commit();
        $notice = 'Generated serial key: ' . implode('-', str_split($serial, 4));
    }
    if ($action === 'revoke') {
        $statement = $pdo->prepare('UPDATE licenses SET status = :status, revoked_at = :revoked_at WHERE id = :id');
        $statement->execute(['status' => 'revoked', 'revoked_at' => gmdate('c'), 'id' => (int) $_POST['license_id']]);
        $notice = 'License revoked.';
    }
    if ($action === 'restore') {
        $statement = $pdo->prepare('UPDATE licenses SET status = :status, revoked_at = NULL WHERE id = :id');
        $statement->execute(['status' => 'active', 'id' => (int) $_POST['license_id']]);
        $notice = 'License restored.';
    }
    if ($action === 'note') {
        $statement = $pdo->prepare('INSERT INTO support_notes (license_id, note, created_at) VALUES (:license_id, :note, :created_at)');
        $statement->execute(['license_id' => (int) $_POST['license_id'], 'note' => trim((string) $_POST['note']), 'created_at' => gmdate('c')]);
        $notice = 'Support note saved.';
    }
}

$licenses = $pdo->query('SELECT l.*, COUNT(a.id) AS activation_count FROM licenses l LEFT JOIN activations a ON a.license_id = l.id GROUP BY l.id ORDER BY l.created_at DESC LIMIT 100')->fetchAll();
$usage = $pdo->query('SELECT u.*, l.serial_key FROM usage_events u JOIN licenses l ON l.id = u.license_id ORDER BY u.created_at DESC LIMIT 30')->fetchAll();
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Family Tree Studio Admin</title>
    <style>
        body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #101214; color: #edf3f2; }
        main { max-width: 1180px; margin: 0 auto; padding: 28px; }
        section { margin-bottom: 22px; border: 1px solid #35414a; border-radius: 8px; padding: 18px; background: #171b1f; }
        h1, h2 { margin: 0 0 14px; }
        form { display: grid; gap: 10px; }
        input, select, textarea, button { min-height: 36px; border: 1px solid #35414a; border-radius: 8px; padding: 8px 10px; font: inherit; color: #edf3f2; background: #1e2429; }
        button { cursor: pointer; color: #071613; background: #3ecfb2; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border-bottom: 1px solid #35414a; padding: 10px; text-align: left; vertical-align: top; }
        .notice { border-color: #3ecfb2; color: #3ecfb2; }
        .inline { display: inline; }
        .danger { color: #fff; background: #c33c60; }
    </style>
</head>
<body>
<main>
    <h1>Family Tree Studio Admin</h1>
    <form method="post" style="display:flex;justify-content:flex-end;margin:-46px 0 18px;"><input type="hidden" name="action" value="logout"><button type="submit">Sign out</button></form>
    <?php if ($notice !== ''): ?><section class="notice"><?= htmlspecialchars($notice) ?></section><?php endif; ?>
    <section>
        <h2>Generate Serial Key</h2>
        <form method="post">
            <input type="hidden" name="action" value="generate">
            <input name="email" placeholder="Customer email">
            <input name="name" placeholder="Customer name">
            <select name="tier"><option value="full">Full</option><option value="trial">Trial</option></select>
            <input name="expires_at" placeholder="Expires at, optional ISO date">
            <button type="submit">Generate</button>
        </form>
    </section>
    <section>
        <h2>Licenses</h2>
        <table>
            <thead><tr><th>Serial</th><th>Customer</th><th>Status</th><th>Activations</th><th>Support</th><th>Actions</th></tr></thead>
            <tbody>
            <?php foreach ($licenses as $license): ?>
                <tr>
                    <td><?= htmlspecialchars(implode('-', str_split((string) $license['serial_key'], 4))) ?></td>
                    <td><?= htmlspecialchars((string) $license['customer_email']) ?></td>
                    <td><?= htmlspecialchars((string) $license['status']) ?></td>
                    <td><?= (int) $license['activation_count'] ?> / <?= (int) $license['max_activations'] ?></td>
                    <td><form method="post"><input type="hidden" name="action" value="note"><input type="hidden" name="license_id" value="<?= (int) $license['id'] ?>"><textarea name="note" placeholder="Support note"></textarea><button type="submit">Save note</button></form></td>
                    <td>
                        <?php if ($license['status'] === 'active'): ?>
                            <form class="inline" method="post"><input type="hidden" name="action" value="revoke"><input type="hidden" name="license_id" value="<?= (int) $license['id'] ?>"><button class="danger" type="submit">Revoke</button></form>
                        <?php else: ?>
                            <form class="inline" method="post"><input type="hidden" name="action" value="restore"><input type="hidden" name="license_id" value="<?= (int) $license['id'] ?>"><button type="submit">Restore</button></form>
                        <?php endif; ?>
                    </td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
    </section>
    <section>
        <h2>Recent Usage</h2>
        <table>
            <thead><tr><th>Time</th><th>Serial</th><th>Event</th><th>Metadata</th></tr></thead>
            <tbody>
            <?php foreach ($usage as $event): ?>
                <tr><td><?= htmlspecialchars((string) $event['created_at']) ?></td><td><?= htmlspecialchars((string) $event['serial_key']) ?></td><td><?= htmlspecialchars((string) $event['event']) ?></td><td><?= htmlspecialchars((string) $event['metadata']) ?></td></tr>
            <?php endforeach; ?>
            </tbody>
        </table>
    </section>
</main>
</body>
</html>
