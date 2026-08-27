<?php

declare(strict_types=1);

require_once __DIR__ . '/lib.php';

$supportedLanguages = ['en', 'ar'];
$requestedLanguage = strtolower((string) ($_GET['lang'] ?? $_COOKIE['fts_lang'] ?? 'en'));
$language = in_array($requestedLanguage, $supportedLanguages, true) ? $requestedLanguage : 'en';
$isRtl = $language === 'ar';
setcookie('fts_lang', $language, ['expires' => time() + 31536000, 'path' => '/', 'samesite' => 'Lax']);

$copy = [
    'en' => [
        'html_lang' => 'en',
        'brand' => 'Family Tree Studio',
        'nav_download' => 'Download',
        'nav_features' => 'Features',
        'nav_purchase' => 'Purchase',
        'language_label' => 'العربية',
        'language_url' => '?lang=ar',
        'kicker' => 'Private desktop genealogy workspace',
        'headline' => 'Family Tree Studio',
        'hero_copy' => 'Create structured family records, map relationships clearly, and export polished trees from a locked desktop app that activates per device.',
        'download_cta' => 'Download the app',
        'purchase_cta' => 'Buy a license',
        'fact_files_title' => '.ftree files',
        'fact_files_body' => 'Private local project files',
        'fact_export_title' => 'PNG, SVG, PDF',
        'fact_export_body' => 'Export finished trees',
        'fact_payment_title' => 'USDT or USDC',
        'fact_payment_body' => 'License key after verification',
        'download_title' => 'Download Family Tree Studio',
        'download_intro' => 'Download the activation shell first. After a valid serial key is accepted, the shell installs a signed full-version update into itself for that licensed device.',
        'mac_detail' => 'Apple Silicon activation shell. The editor is installed in-place only after license activation.',
        'windows_detail' => 'Windows x64 installer package',
        'linux_detail' => 'Linux x86_64 AppImage package',
        'download_macos' => 'Download for macOS',
        'download_windows' => 'Download for Windows',
        'download_linux' => 'Download for Linux',
        'ready' => 'Ready',
        'pending' => 'Pending',
        'coming_soon' => 'coming soon',
        'mac_note_title' => 'macOS local build note',
        'mac_note_body' => 'This test build is ad-hoc signed, not Apple-notarized. If macOS blocks it after you move it to Applications, run this once in Terminal:',
        'ios_title' => 'iOS',
        'ios_body' => 'Mobile support is planned. This placeholder opens Apple\'s official App Store page.',
        'android_title' => 'Android',
        'android_body' => 'Mobile support is planned. This placeholder opens Google Play.',
        'app_store_small' => 'Download on the',
        'app_store_big' => 'App Store',
        'play_store_small' => 'Get it on',
        'play_store_big' => 'Google Play',
        'features_title' => 'Built for real family records',
        'features_intro' => 'Fast enough for everyday editing, structured enough for serious genealogy projects.',
        'profiles_title' => 'Profiles',
        'profiles_body' => 'Photos, names, dates, places, notes, occupations, and tags.',
        'relationships_title' => 'Relationships',
        'relationships_body' => 'Parents, spouses, children, and automatic tree layout.',
        'timeline_title' => 'Timeline',
        'timeline_body' => 'Births, deaths, marriages, and dated milestones in order.',
        'export_title' => 'Export',
        'export_body' => 'Save projects and export PNG, SVG, or PDF layouts.',
        'purchase_title' => 'Buy a license with USDT or USDC',
        'purchase_intro' => 'Pay directly to the wallet below. You can verify with the sender wallet address, and the transaction hash remains available as a fallback.',
        'payment_steps_title' => 'Payment steps',
        'step_send' => 'Send exactly',
        'step_token' => 'in ERC-20 USDT or USDC on Ethereum mainnet.',
        'step_wallet' => 'Use the recipient wallet below.',
        'step_sender' => 'Enter your email and the wallet address you paid from.',
        'step_verify' => 'Click verify to generate your serial key.',
        'recipient_wallet' => 'Recipient wallet',
        'copy_wallet' => 'Copy wallet address',
        'copied' => 'Copied',
        'copy_failed' => 'Select and copy the wallet above',
        'network_warning' => 'Payments sent on another network cannot be detected by this verifier. Use Ethereum mainnet ERC-20 transfers only.',
        'serial_title' => 'Get your serial key',
        'email' => 'Email',
        'name' => 'Name',
        'token' => 'Token',
        'sender_wallet' => 'Sender wallet address',
        'tx_fallback' => 'Use a transaction hash instead',
        'tx_hash' => 'Transaction hash',
        'tx_meta' => 'MetaMask: open Activity, choose the payment, then copy the transaction ID or open it on Etherscan and copy the hash.',
        'tx_wallet' => 'Trust Wallet or Coinbase Wallet: open the transaction details and copy the transaction hash.',
        'tx_exchange' => 'Centralized exchange: open withdrawal history, choose the withdrawal, and copy the transaction hash or TxID.',
        'verify_button' => 'Verify payment and generate key',
        'checking_payment' => 'Checking the payment on Etherscan...',
        'payment_failed' => 'Payment could not be verified yet.',
        'payment_verified' => 'Payment verified. Your serial key is',
        'footer' => 'Family Tree Studio. Private family records, clean exports, and simple desktop editing.',
    ],
    'ar' => [
        'html_lang' => 'ar',
        'brand' => 'Family Tree Studio',
        'nav_download' => 'التنزيل',
        'nav_features' => 'المزايا',
        'nav_purchase' => 'الشراء',
        'language_label' => 'English',
        'language_url' => '?lang=en',
        'kicker' => 'مساحة مكتبية خاصة لتوثيق العائلة',
        'headline' => 'Family Tree Studio',
        'hero_copy' => 'أنشئ سجلات عائلية منظمة، وارسم العلاقات بوضوح، وصدّر شجرات أنيقة من تطبيق سطح مكتب لا يعمل إلا بعد تفعيل الجهاز.',
        'download_cta' => 'تنزيل التطبيق',
        'purchase_cta' => 'شراء ترخيص',
        'fact_files_title' => 'ملفات .ftree',
        'fact_files_body' => 'ملفات مشاريع محلية وخاصة',
        'fact_export_title' => 'PNG وSVG وPDF',
        'fact_export_body' => 'صدّر الشجرات النهائية',
        'fact_payment_title' => 'USDT أو USDC',
        'fact_payment_body' => 'مفتاح ترخيص بعد التحقق',
        'download_title' => 'تنزيل Family Tree Studio',
        'download_intro' => 'نزّل غلاف التفعيل أولا. بعد قبول مفتاح صالح، يثبّت الغلاف تحديث النسخة الكاملة داخله للجهاز المرخص فقط.',
        'mac_detail' => 'غلاف تفعيل لأجهزة Apple Silicon. يتم تثبيت المحرر داخله بعد تفعيل الترخيص فقط.',
        'windows_detail' => 'حزمة تثبيت Windows x64',
        'linux_detail' => 'حزمة Linux x86_64 AppImage',
        'download_macos' => 'تنزيل macOS',
        'download_windows' => 'تنزيل Windows',
        'download_linux' => 'تنزيل Linux',
        'ready' => 'جاهز',
        'pending' => 'قريبا',
        'coming_soon' => 'قريبا',
        'mac_note_title' => 'ملاحظة بناء macOS المحلي',
        'mac_note_body' => 'هذا بناء اختباري بتوقيع محلي وليس موثقا من Apple. إذا منعه macOS بعد نقله إلى Applications، شغل هذا الأمر مرة واحدة في Terminal:',
        'ios_title' => 'iOS',
        'ios_body' => 'دعم الهاتف مخطط له. هذا الزر يفتح صفحة App Store الرسمية كعنصر نائب.',
        'android_title' => 'Android',
        'android_body' => 'دعم الهاتف مخطط له. هذا الزر يفتح Google Play كعنصر نائب.',
        'app_store_small' => 'تنزيل من',
        'app_store_big' => 'App Store',
        'play_store_small' => 'احصل عليه من',
        'play_store_big' => 'Google Play',
        'features_title' => 'مصمم لسجلات عائلية حقيقية',
        'features_intro' => 'سريع للتحرير اليومي، ومنظم بما يكفي لمشاريع الأنساب الجادة.',
        'profiles_title' => 'الملفات',
        'profiles_body' => 'صور وأسماء وتواريخ وأماكن وملاحظات ومهن ووسوم.',
        'relationships_title' => 'العلاقات',
        'relationships_body' => 'والدان وأزواج وأبناء وتخطيط تلقائي للشجرة.',
        'timeline_title' => 'الخط الزمني',
        'timeline_body' => 'ميلاد ووفاة وزواج ومحطات مؤرخة مرتبة زمنيا.',
        'export_title' => 'التصدير',
        'export_body' => 'احفظ المشاريع وصدّر التخطيطات بصيغ PNG أو SVG أو PDF.',
        'purchase_title' => 'شراء ترخيص باستخدام USDT أو USDC',
        'purchase_intro' => 'ادفع مباشرة إلى المحفظة أدناه. يمكنك التحقق بعنوان المحفظة المرسلة، ويبقى رقم المعاملة خيارا بديلا.',
        'payment_steps_title' => 'خطوات الدفع',
        'step_send' => 'أرسل بالضبط',
        'step_token' => 'من USDT أو USDC بصيغة ERC-20 على Ethereum mainnet.',
        'step_wallet' => 'استخدم محفظة الاستقبال أدناه.',
        'step_sender' => 'أدخل بريدك الإلكتروني وعنوان المحفظة التي دفعت منها.',
        'step_verify' => 'اضغط تحقق لإنشاء مفتاح التفعيل.',
        'recipient_wallet' => 'محفظة الاستقبال',
        'copy_wallet' => 'نسخ عنوان المحفظة',
        'copied' => 'تم النسخ',
        'copy_failed' => 'حدد المحفظة أعلاه وانسخها',
        'network_warning' => 'لا يمكن لهذا المدقق اكتشاف المدفوعات على شبكة أخرى. استخدم تحويلات ERC-20 على Ethereum mainnet فقط.',
        'serial_title' => 'الحصول على مفتاح التفعيل',
        'email' => 'البريد الإلكتروني',
        'name' => 'الاسم',
        'token' => 'العملة',
        'sender_wallet' => 'عنوان المحفظة المرسلة',
        'tx_fallback' => 'استخدام رقم المعاملة بدلا من ذلك',
        'tx_hash' => 'رقم المعاملة',
        'tx_meta' => 'MetaMask: افتح Activity، اختر عملية الدفع، ثم انسخ transaction ID أو افتحها على Etherscan وانسخ hash.',
        'tx_wallet' => 'Trust Wallet أو Coinbase Wallet: افتح تفاصيل العملية وانسخ transaction hash.',
        'tx_exchange' => 'منصة تداول مركزية: افتح سجل السحب، اختر عملية السحب، ثم انسخ transaction hash أو TxID.',
        'verify_button' => 'التحقق من الدفع وإنشاء المفتاح',
        'checking_payment' => 'جار التحقق من الدفع على Etherscan...',
        'payment_failed' => 'لم يمكن التحقق من الدفع بعد.',
        'payment_verified' => 'تم التحقق من الدفع. مفتاح التفعيل هو',
        'footer' => 'Family Tree Studio. سجلات عائلية خاصة، وتصدير نظيف، وتحرير مكتبي بسيط.',
    ],
];

$text = $copy[$language];
$downloads = [
    ['platform' => 'macOS', 'detail' => $text['mac_detail'], 'file' => 'FamilyTreeStudio-0.1.0-aarch64.dmg', 'label' => $text['download_macos']],
    ['platform' => 'Windows', 'detail' => $text['windows_detail'], 'file' => 'FamilyTreeStudio-0.1.0-windows-x64-setup.exe', 'label' => $text['download_windows']],
    ['platform' => 'Linux', 'detail' => $text['linux_detail'], 'file' => 'FamilyTreeStudio-0.1.0-linux-x86_64.AppImage', 'label' => $text['download_linux']],
];

function e(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}
?>
<!doctype html>
<html lang="<?= e($text['html_lang']) ?>" dir="<?= $isRtl ? 'rtl' : 'ltr' ?>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= e($text['brand']) ?></title>
    <style>
        :root { color-scheme: light; --bg: #f4f2ea; --surface: #fffdf7; --surface-strong: #ffffff; --ink: #18211f; --muted: #5f6f69; --line: #d8ded6; --green: #28a57f; --green-dark: #0d5e4d; --coral: #df645c; --blue: #446fb1; --amber: #c98e2e; --violet: #7052a5; --shadow: 0 22px 60px rgba(54, 67, 59, .14); }
        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body { margin: 0; background: linear-gradient(180deg, #fbfaf5 0%, var(--bg) 42%, #eef5f1 100%); color: var(--ink); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        html[dir="rtl"] body { font-family: 'SF Arabic', 'Geeza Pro', 'Noto Naskh Arabic', 'Amiri', Inter, system-ui, sans-serif; }
        a { color: inherit; }
        .site-nav { position: fixed; top: 0; left: 0; right: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px clamp(18px, 4vw, 48px); background: rgba(255, 253, 247, .88); border-bottom: 1px solid rgba(216, 222, 214, .82); backdrop-filter: blur(16px); }
        .brand { display: flex; align-items: center; gap: 11px; font-weight: 840; }
        .brand-mark { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 8px; color: #ffffff; background: linear-gradient(135deg, var(--green-dark), var(--blue)); }
        .nav-links { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; color: var(--muted); font-size: .94rem; font-weight: 710; }
        .nav-links a { text-decoration: none; }
        .nav-links a:hover { color: var(--green-dark); }
        .language-link { border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; background: var(--surface-strong); }
        .hero { min-height: 82vh; display: grid; align-items: center; overflow: hidden; padding: 116px clamp(20px, 5vw, 70px) 62px; border-bottom: 1px solid var(--line); background: linear-gradient(135deg, #fff9ec 0%, #eef8f4 54%, #fffdf7 100%); }
        .hero-content { width: min(850px, 100%); }
        .kicker { margin: 0 0 14px; color: var(--green-dark); font-size: .92rem; font-weight: 840; text-transform: uppercase; letter-spacing: .08em; }
        html[dir="rtl"] .kicker { letter-spacing: 0; }
        h1 { margin: 0 0 18px; max-width: 650px; font-size: clamp(3rem, 8vw, 6.8rem); line-height: .92; letter-spacing: 0; }
        .hero p { max-width: 590px; margin: 0; color: #465851; font-size: clamp(1.06rem, 2vw, 1.28rem); line-height: 1.66; }
        .hero-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 26px; }
        .button, button { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; border: 1px solid var(--line); border-radius: 8px; padding: 0 16px; color: var(--ink); background: var(--surface-strong); text-decoration: none; font: inherit; cursor: pointer; font-weight: 780; box-shadow: 0 8px 22px rgba(50, 68, 60, .08); }
        .button.primary, button.primary { border-color: var(--green); color: #ffffff; background: var(--green-dark); }
        .button.secondary { border-color: #b9cbc3; background: rgba(255, 255, 255, .75); }
        .button.disabled { cursor: not-allowed; color: #76847e; background: #eef2ef; box-shadow: none; }
        .hero-facts { display: flex; flex-wrap: wrap; gap: 18px; margin-top: 28px; color: #52645d; }
        .fact { min-width: 130px; border-inline-start: 3px solid var(--coral); padding-inline-start: 12px; }
        .fact:nth-child(2) { border-color: var(--blue); }
        .fact:nth-child(3) { border-color: var(--amber); }
        .fact strong { display: block; color: var(--ink); }
        section { max-width: 1180px; margin: 0 auto; padding: 58px clamp(20px, 4vw, 40px); }
        .section-head { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 22px; }
        h2 { margin: 0; font-size: clamp(1.7rem, 3vw, 2.55rem); letter-spacing: 0; }
        h3 { margin: 0 0 8px; }
        p { color: var(--muted); line-height: 1.72; }
        .section-head p { max-width: 560px; margin: 0; }
        .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
        .card, .payment-panel { border: 1px solid var(--line); border-radius: 8px; padding: 18px; background: var(--surface); box-shadow: var(--shadow); }
        .card p { min-height: 48px; margin: 0 0 16px; }
        .platform { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
        .status { border-radius: 999px; padding: 4px 9px; color: var(--green-dark); background: #dff3ec; font-size: .78rem; font-weight: 820; }
        .status.pending { color: #6e4a0d; background: #f7ead0; }
        .mac-note { margin-top: 14px; border: 1px solid #d9c68d; border-radius: 8px; padding: 12px; background: #fff8e6; color: #61450e; }
        .mac-note summary { cursor: pointer; font-weight: 820; }
        .mac-note code { margin-top: 10px; color: #47320a; background: rgba(255, 255, 255, .7); }
        .store-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 14px; }
        .store-button { display: inline-grid; min-width: 190px; min-height: 54px; align-content: center; border: 1px solid #151b19; border-radius: 8px; padding: 8px 14px; color: #ffffff; background: #151b19; text-decoration: none; }
        .store-button span { font-size: .72rem; color: rgba(255, 255, 255, .72); }
        .store-button strong { font-size: 1.06rem; }
        .feature-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
        .feature { border-top: 3px solid var(--green); padding: 14px; background: var(--surface); border-radius: 8px; box-shadow: 0 12px 30px rgba(50, 68, 60, .08); }
        .feature:nth-child(2) { border-color: var(--coral); }
        .feature:nth-child(3) { border-color: var(--blue); }
        .feature:nth-child(4) { border-color: var(--amber); }
        .feature strong { display: block; margin-bottom: 6px; }
        .payment-layout { display: grid; grid-template-columns: minmax(0, .95fr) minmax(0, 1.05fr); gap: 18px; align-items: start; }
        .payment-steps { margin: 14px 0 18px; padding-inline-start: 22px; color: var(--muted); line-height: 1.65; }
        .payment-steps li { margin: 8px 0; }
        .wallet-box { display: grid; gap: 10px; border: 1px solid #b5ddcf; border-radius: 8px; padding: 14px; background: #edf8f4; }
        code { display: block; overflow-wrap: anywhere; direction: ltr; text-align: left; color: var(--green-dark); font-size: .95rem; }
        label { display: grid; gap: 6px; color: var(--muted); font-size: .86rem; font-weight: 740; }
        input, select { width: 100%; min-height: 42px; border: 1px solid var(--line); border-radius: 8px; padding: 9px 11px; color: var(--ink); background: #ffffff; font: inherit; outline: none; }
        html[dir="rtl"] input { text-align: right; }
        input:focus, select:focus { border-color: var(--green); box-shadow: 0 0 0 3px rgba(44, 168, 131, .16); }
        form { display: grid; gap: 12px; }
        details { border: 1px solid var(--line); border-radius: 8px; padding: 12px; background: #f7faf7; }
        summary { cursor: pointer; font-weight: 800; }
        .instructions { margin: 10px 0 0; padding-inline-start: 20px; color: var(--muted); line-height: 1.65; }
        .result { display: none; border: 1px solid var(--green); border-radius: 8px; padding: 12px; color: var(--green-dark); background: #edf8f4; }
        .result.error { border-color: var(--coral); color: #9e2e1e; background: #fff0ed; }
        .fine-print { font-size: .86rem; color: #73837d; }
        footer { border-top: 1px solid var(--line); padding: 28px; color: var(--muted); text-align: center; background: var(--surface); }
        @media (max-width: 900px) { .cards, .feature-grid, .payment-layout { grid-template-columns: 1fr; } .store-grid { grid-template-columns: 1fr; } .section-head { display: grid; } .nav-links a:not(.language-link) { display: none; } .site-nav { padding: 10px 18px; } .brand-mark { width: 32px; height: 32px; } .hero { min-height: auto; padding: 88px 20px 38px; } .kicker { margin-bottom: 10px; font-size: .76rem; } h1 { max-width: 340px; margin-bottom: 12px; font-size: clamp(2.15rem, 11vw, 3rem); line-height: .96; } .hero p { font-size: .98rem; line-height: 1.5; } .hero-actions { gap: 8px; margin-top: 18px; } .hero-actions .button { flex: 1 1 160px; min-width: 0; } .button, button { min-height: 40px; padding: 0 10px; font-size: .82rem; } .hero-facts { gap: 10px; margin-top: 18px; font-size: .86rem; } .fact { min-width: 0; flex: 1 1 120px; } section { padding-top: 42px; padding-bottom: 42px; } }
        @media (max-height: 520px) and (max-width: 900px) { .hero { padding-bottom: 28px; } .hero-facts { display: none; } }
    </style>
</head>
<body>
<nav class="site-nav" aria-label="Primary">
    <div class="brand"><span class="brand-mark">FT</span><span><?= e($text['brand']) ?></span></div>
    <div class="nav-links"><a href="#download"><?= e($text['nav_download']) ?></a><a href="#features"><?= e($text['nav_features']) ?></a><a href="#purchase"><?= e($text['nav_purchase']) ?></a><a class="language-link" href="<?= e($text['language_url']) ?>"><?= e($text['language_label']) ?></a></div>
</nav>

<header class="hero">
    <div class="hero-content">
        <p class="kicker"><?= e($text['kicker']) ?></p>
        <h1><?= e($text['headline']) ?></h1>
        <p><?= e($text['hero_copy']) ?></p>
        <div class="hero-actions">
            <a class="button primary" href="#download"><?= e($text['download_cta']) ?></a>
            <a class="button secondary" href="#purchase"><?= e($text['purchase_cta']) ?></a>
        </div>
        <div class="hero-facts" aria-label="Product highlights">
            <div class="fact"><strong><?= e($text['fact_files_title']) ?></strong><span><?= e($text['fact_files_body']) ?></span></div>
            <div class="fact"><strong><?= e($text['fact_export_title']) ?></strong><span><?= e($text['fact_export_body']) ?></span></div>
            <div class="fact"><strong><?= e($text['fact_payment_title']) ?></strong><span><?= e($text['fact_payment_body']) ?></span></div>
        </div>
    </div>
</header>

<section id="download">
    <div class="section-head"><div><h2><?= e($text['download_title']) ?></h2><p><?= e($text['download_intro']) ?></p></div></div>
    <div class="cards">
        <?php foreach ($downloads as $index => $download): ?>
            <?php $path = __DIR__ . '/downloads/' . $download['file']; $available = is_file($path); ?>
            <article class="card">
                <div class="platform"><h3><?= e($download['platform']) ?></h3><span class="status <?= $available ? '' : 'pending' ?>"><?= e($available ? $text['ready'] : $text['pending']) ?></span></div>
                <p><?= e($download['detail']) ?></p>
                <?php if ($available): ?>
                    <a class="button primary" href="/downloads/<?= rawurlencode($download['file']) ?>"><?= e($download['label']) ?></a>
                <?php else: ?>
                    <span class="button disabled"><?= e($download['label'] . ' ' . $text['coming_soon']) ?></span>
                <?php endif; ?>
                <?php if ($index === 0): ?>
                    <details class="mac-note"><summary><?= e($text['mac_note_title']) ?></summary><p><?= e($text['mac_note_body']) ?></p><code>xattr -dr com.apple.quarantine "$HOME/Applications/Family Tree Studio.app"</code></details>
                <?php endif; ?>
            </article>
        <?php endforeach; ?>
    </div>
    <div class="store-grid">
        <article class="card"><h3><?= e($text['ios_title']) ?></h3><p><?= e($text['ios_body']) ?></p><a class="store-button" href="https://www.apple.com/app-store/" rel="noopener noreferrer" target="_blank"><span><?= e($text['app_store_small']) ?></span><strong><?= e($text['app_store_big']) ?></strong></a></article>
        <article class="card"><h3><?= e($text['android_title']) ?></h3><p><?= e($text['android_body']) ?></p><a class="store-button" href="https://play.google.com/store" rel="noopener noreferrer" target="_blank"><span><?= e($text['play_store_small']) ?></span><strong><?= e($text['play_store_big']) ?></strong></a></article>
    </div>
</section>

<section id="features">
    <div class="section-head"><h2><?= e($text['features_title']) ?></h2><p><?= e($text['features_intro']) ?></p></div>
    <div class="feature-grid">
        <div class="feature"><strong><?= e($text['profiles_title']) ?></strong><span><?= e($text['profiles_body']) ?></span></div>
        <div class="feature"><strong><?= e($text['relationships_title']) ?></strong><span><?= e($text['relationships_body']) ?></span></div>
        <div class="feature"><strong><?= e($text['timeline_title']) ?></strong><span><?= e($text['timeline_body']) ?></span></div>
        <div class="feature"><strong><?= e($text['export_title']) ?></strong><span><?= e($text['export_body']) ?></span></div>
    </div>
</section>

<section id="purchase">
    <div class="section-head"><div><h2><?= e($text['purchase_title']) ?></h2><p><?= e($text['purchase_intro']) ?></p></div></div>
    <div class="payment-layout">
        <div class="payment-panel">
            <h3><?= e($text['payment_steps_title']) ?></h3>
            <ol class="payment-steps"><li><?= e($text['step_send']) ?> <strong>$<?= e(LICENSE_PRICE_USD) ?></strong> <?= e($text['step_token']) ?></li><li><?= e($text['step_wallet']) ?></li><li><?= e($text['step_sender']) ?></li><li><?= e($text['step_verify']) ?></li></ol>
            <div class="wallet-box"><span><?= e($text['recipient_wallet']) ?></span><code id="wallet-address"><?= e(PAYMENT_WALLET_ADDRESS) ?></code><button type="button" data-copy="wallet-address"><?= e($text['copy_wallet']) ?></button></div>
            <p class="fine-print"><?= e($text['network_warning']) ?></p>
        </div>
        <div class="payment-panel">
            <h3><?= e($text['serial_title']) ?></h3>
            <form id="purchase-form">
                <label><?= e($text['email']) ?><input name="email" type="email" required placeholder="you@example.com"></label>
                <label><?= e($text['name']) ?><input name="name" placeholder="<?= $isRtl ? 'اسمك' : 'Your name' ?>"></label>
                <label><?= e($text['token']) ?><select name="token"><option value="USDT">USDT</option><option value="USDC">USDC</option></select></label>
                <label><?= e($text['sender_wallet']) ?><input name="payer_address" placeholder="0x..." autocomplete="off"></label>
                <details><summary><?= e($text['tx_fallback']) ?></summary><label><?= e($text['tx_hash']) ?><input name="tx_hash" placeholder="0x..." autocomplete="off"></label><ol class="instructions"><li><?= e($text['tx_meta']) ?></li><li><?= e($text['tx_wallet']) ?></li><li><?= e($text['tx_exchange']) ?></li></ol></details>
                <button class="primary" type="submit"><?= e($text['verify_button']) ?></button>
            </form>
            <p id="purchase-result" class="result"></p>
        </div>
    </div>
</section>

<footer><?= e($text['footer']) ?></footer>

<script>
const pageText = <?= json_encode([
    'copyWallet' => $text['copy_wallet'],
    'copied' => $text['copied'],
    'copyFailed' => $text['copy_failed'],
    'checkingPayment' => $text['checking_payment'],
    'paymentFailed' => $text['payment_failed'],
    'paymentVerified' => $text['payment_verified'],
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?>;

document.querySelectorAll('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const target = document.getElementById(button.dataset.copy);
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target.textContent.trim());
      button.textContent = pageText.copied;
      setTimeout(() => { button.textContent = pageText.copyWallet; }, 1600);
    } catch {
      button.textContent = pageText.copyFailed;
    }
  });
});

const form = document.querySelector('#purchase-form');
const result = document.querySelector('#purchase-result');
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  result.className = 'result';
  result.style.display = 'block';
  result.textContent = pageText.checkingPayment;
  const body = Object.fromEntries(new FormData(form).entries());
  const response = await fetch('/api/purchase.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok || payload.status !== 'active') {
    result.className = 'result error';
    result.textContent = payload.message || pageText.paymentFailed;
    return;
  }
  result.textContent = `${pageText.paymentVerified} ${payload.serial_key}`;
});
</script>
</body>
</html>