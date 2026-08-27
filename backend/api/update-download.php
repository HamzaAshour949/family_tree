<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib.php';

$license = authorized_update_license();

if (!is_file(FULL_UPDATE_ARTIFACT_PATH)) {
    respond(['status' => 'inactive', 'message' => 'Full-version update artifact is not published yet.'], 404);
}

record_usage((int) $license['id'], 'update_download', ['artifact' => FULL_UPDATE_ARTIFACT_NAME]);
send_api_cors_headers();
header('Content-Type: application/gzip');
header('Content-Length: ' . filesize(FULL_UPDATE_ARTIFACT_PATH));
header('Content-Disposition: attachment; filename="' . FULL_UPDATE_ARTIFACT_NAME . '"');
readfile(FULL_UPDATE_ARTIFACT_PATH);