# Family Tree Studio

## نبذة عن المشروع

Family Tree Studio هو تطبيق مكتبي مبني باستخدام Tauri 2 لإنشاء أشجار العائلة وتعديلها وحفظها وفتحها وتصديرها بصيغة `.ftree` قابلة للمشاركة. يعتمد التطبيق على React وTypeScript وTailwindCSS وReact Flow وELK للتخطيط، كما يتضمن بنية أولية لخادم تراخيص مبني باستخدام PHP وSQLite.

## التشغيل أثناء التطوير

```sh
npm install
npm run tauri dev
```

## إنشاء نسخة الإنتاج

```sh
npm run tauri build
```

في نظام macOS يتم إنشاء حزمة التطبيق داخل `src-tauri/target/release/bundle/macos/Family Tree Studio.app`. يمكن نسخها إلى `~/Applications` لتجربتها بسرعة:

```sh
mkdir -p ~/Applications
rm -rf ~/Applications/Family\ Tree\ Studio.app
cp -R "src-tauri/target/release/bundle/macos/Family Tree Studio.app" ~/Applications/
```

تنتج إصدارات Windows ملفات التثبيت داخل `src-tauri/target/release/bundle/msi` أو `nsis`. أما إصدارات Linux فتنتج حزمًا داخل `src-tauri/target/release/bundle/deb` أو `rpm` أو `appimage` وفقًا لإعدادات النظام.

## الميزات المتوفرة

- ملفات شخصية للأفراد تتضمن الصور والتواريخ والأماكن والملاحظات والوسوم والجنس والمهنة.
- تعديل العلاقات بين الوالدين والأزواج والأبناء.
- تخطيط تلقائي للشجرة يعتمد على التواريخ، مع ترتيب مساعد من ELK.
- البحث والتصفية حسب الجنس، بالإضافة إلى عرض الشجرة والعرض الزمني.
- فتح وحفظ مشاريع `.ftree` باستخدام نوافذ Tauri الأصلية.
- تصدير مساحة الشجرة الحالية بصيغ PNG وSVG وPDF.
- مظهر داكن افتراضي مع مظهر فاتح متناسق.
- لوحة لتفعيل التراخيص متصلة بنقاط نهاية PHP.
- بنية لوحة إدارة PHP داخل `backend/` لإدارة المفاتيح والعملاء والتفعيلات والاستخدام والإلغاء وملاحظات الدعم.

## خادم التراخيص

انسخ الملف `backend/config.example.php` إلى `backend/config.php`، ثم أدخل بيانات مسؤول الإدارة والمفتاح السري، وبعد ذلك هيئ قاعدة بيانات SQLite:

```sh
cd backend
php migrate.php
php -S 127.0.0.1:8080
```

افتح `http://127.0.0.1:8080/admin/` للوصول إلى لوحة الإدارة. وأثناء الاختبار المحلي، اضبط عنوان خادم التراخيص في تطبيق سطح المكتب على `http://127.0.0.1:8080/api`.