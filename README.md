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

## ساختار

- `src/routes/` صفحات و مسیرهای API (`/api/auth/*`, `/api/live`, `/api/health`)
- `src/lib/hotel/` منطق تجاری (`service.server.ts`)، SQL تراکنشی (`statements.ts`)، قواعد خالص (`domain.ts`)
- `src/lib/auth/` پیکربندی Better Auth، میان‌افزار احراز هویت، تشخیص نشست
- `migrations/` اسکیمای دیتابیس (منبع واحد حقیقت)، به ترتیب شماره
- `scripts/` اجرای migration در بیلد و کپی PGLite برای بیلدهای بدون دیتابیس
