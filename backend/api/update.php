<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib.php';

$license = authorized_update_license();
$target = strtolower(trim((string) ($_GET['target'] ?? '')));
$arch = strtolower(trim((string) ($_GET['arch'] ?? '')));
$current = ltrim(trim((string) ($_GET['current'] ?? '0.0.0')), 'vV');

if ($target !== 'darwin' || $arch !== 'aarch64') {
    respond_no_update();
}

if (version_compare($current, FULL_UPDATE_VERSION, '>=')) {
    respond_no_update();
}

if (!is_file(FULL_UPDATE_ARTIFACT_PATH) || FULL_UPDATE_SIGNATURE === '' || FULL_UPDATE_SHA256 === '') {
    respond(['status' => 'inactive', 'message' => 'Full-version update artifact is not published yet.'], 503);
}

record_usage((int) $license['id'], 'update_check', ['target' => $target, 'arch' => $arch, 'current' => $current]);
respond([
    'version' => FULL_UPDATE_VERSION,
    'pub_date' => gmdate('c', (int) filemtime(FULL_UPDATE_ARTIFACT_PATH)),
    'url' => FULL_UPDATE_DOWNLOAD_URL,
    'signature' => FULL_UPDATE_SIGNATURE,
    'notes' => 'Installs the licensed full editor over the activation shell.',
]);