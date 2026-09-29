# هتل آپارتمان سپهر — Sepehr Apartment Hotel

سایت رزرو، خدمات مهمان و پنل عملیات هتل. یک برنامه TanStack Start (React 19) با Postgres (Neon روی Vercel، PGLite درون‌حافظه‌ای برای توسعه محلی و تست) و Better Auth (حساب ایمیل و رمز عبور).

## اجرای محلی

```
npm install
npm run dev
```

سایت روی `http://localhost:8080` بالا می‌آید. بدون هیچ متغیر محیطی کار می‌کند: دیتابیس درون حافظه است و با هر بار اجرا از نو ساخته می‌شود (migrationها خودکار اعمال می‌شوند).

## تست و بررسی

```
npm run typecheck   # بررسی نوع‌ها
npm test            # تست‌های واحد و یکپارچگی (روی PGLite واقعی)
npm run build       # بیلد تولیدی (خروجی Vercel)
```

## استقرار روی Vercel

متغیرهای محیطی لازم در `docs/OPERATIONS.md` (بخش «Deployment environment») توضیح داده شده‌اند: `DATABASE_URL`، `BETTER_AUTH_URL`، `BETTER_AUTH_SECRET` و `BOOTSTRAP_ADMIN_EMAIL`. migrationها فقط در بیلد Production روی دیتابیس اعمال می‌شوند.

## صفحه‌ی اصلی (کپی سایت قدیمی)

صفحه‌ی اصلی (`/`) همان صفحه‌ی قبلی هتل در سایت گروه ملل است: نشانه‌گذاری، شیوه‌نامه‌های قالب (BeTheme) و عکس‌ها از نسخه‌ی ذخیره‌شده در `old-site/` می‌آیند.

- `old-site/index.html` و `old-site/files/`: نسخه‌ی ذخیره‌شده‌ی صفحه (منبع)، `old-site/print.pdf` چاپ همان صفحه.
- `scripts/legacy-home.mjs` از آن `src/legacy/home.html` را می‌سازد (فقط مسیر عکس‌ها، لینک‌ها و آیکون‌ها عوض می‌شود). بعد از هر تغییر در `old-site/` دوباره اجرا کنید: `npm run legacy:build`.
- `public/legacy/`: شیوه‌نامه‌ها و عکس‌ها، عیناً.
- بقیه‌ی صفحات هم روی همین شیوه‌نامه‌ها و داخل هدر، نوار عنوان و پاورقی همان صفحه رندر می‌شوند (`src/components/hotel/shell.tsx`)؛ اجزای خود اپ در `src/styles.css` با پالت همان صفحه استایل شده‌اند.
- `npm run legacy:compare` (با سرور dev بالا) صفحه‌ی جدید و قدیمی را در سه عرض اسکرین‌شات و پیکسل‌به‌پیکسل مقایسه می‌کند؛ تفاوت مجاز فقط آیکون‌هاست (فونت آیکون قالب در نسخه‌ی ذخیره‌شده نبود و آیکون‌ها SVG هستند).

## ساختار

- `src/routes/` صفحات و مسیرهای API (`/api/auth/*`, `/api/live`, `/api/health`)؛ `index.tsx` صفحه‌ی اصلی قدیمی، `search.tsx` هدف جعبه‌ی جستجوی آن
- `src/lib/hotel/` منطق تجاری (`service.server.ts`)، SQL تراکنشی (`statements.ts`)، قواعد خالص (`domain.ts`)
- `src/lib/auth/` پیکربندی Better Auth، میان‌افزار احراز هویت، تشخیص نشست
- `migrations/` اسکیمای دیتابیس (منبع واحد حقیقت)، به ترتیب شماره
- `scripts/` اجرای migration در بیلد و کپی PGLite برای بیلدهای بدون دیتابیس
