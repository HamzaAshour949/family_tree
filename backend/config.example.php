<?php

declare(strict_types=1);

const DB_PATH = __DIR__ . '/family_tree_licenses.sqlite';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD_HASH = '$2y$10$replace_this_hash_with_password_hash_output';
const LICENSE_HMAC_SECRET = 'replace-with-a-32-byte-random-secret';
const DEFAULT_MAX_ACTIVATIONS = 1;
const FULL_VERSION_DOWNLOAD_URL = '';
const FULL_VERSION_SHA256 = '';
const FULL_UPDATE_VERSION = '0.1.1';
const FULL_UPDATE_ARTIFACT_NAME = 'FamilyTreeStudio-0.1.1-full-aarch64.app.tar.gz';
const FULL_UPDATE_ARTIFACT_PATH = __DIR__ . '/../release-updates/FamilyTreeStudio-0.1.1-full-aarch64.app.tar.gz';
const FULL_UPDATE_DOWNLOAD_URL = 'https://your-domain.example/api/update-download.php';
const FULL_UPDATE_SHA256 = 'replace-with-update-artifact-sha256';
const FULL_UPDATE_SIGNATURE = 'replace-with-update-artifact-signature';
const PAYMENT_WALLET_ADDRESS = '0x7d9160e5072da36684d1064415ad9ec58c4b5b49';
const PAYMENT_CHAIN_NAME = 'Ethereum mainnet';
const LICENSE_PRICE_USD = '19.00';
const USDT_CONTRACT_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const USDC_CONTRACT_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
