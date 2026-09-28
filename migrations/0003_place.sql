-- Place, group-page description, and photo policy.
-- Coordinates are the OpenStreetMap node named هتل سپهر, not a hotel survey.
-- Listing photographs are not copied: licence was not established.

insert into hotel_settings (key, value, verification_status, notes) values
  ('geo_lat','35.8001485','osm','OpenStreetMap node 4351254589, tourism=hotel, name هتل سپهر. Retrieved 2026-09-28 via Overpass. Not an official hotel survey.'),
  ('geo_lng','51.4254512','osm','Same node. The way named سالور (382276312) is centred within a few metres. Dr Hesabi house-museum is OSM node about 130 m south.'),
  ('osm_node','4351254589','osm','https://www.openstreetmap.org/node/4351254589')
on conflict (key) do update set value = excluded.value, verification_status = excluded.verification_status, notes = excluded.notes;

insert into hotel_facts (key, value_en, value_fa, source, source_url, retrieved_at, verification_status, notes) values
  ('about',
   'The Melal Group page describes 40 guestrooms, custom furniture, an LCD television with satellite news, a DVD player, a desk, and wireless internet. Rooms with a kitchen or kitchenette include appliances and utensils. Bathrooms are described with a bath, shower, and heated towel rack. Marketing lines on that page (“finest boutique”, “luxury”) are the group’s wording, not an independent classification.',
   'صفحه گروه ملل از ۴۰ واحد، مبلمان سفارشی، تلویزیون LCD با اخبار ماهواره‌ای، دستگاه DVD، میز کار و اینترنت بی‌سیم نوشته است. واحدهایی که آشپزخانه یا کیتچن دارند لوازم و ظروف دارند. سرویس‌ها را با وان، دوش و حوله گرم‌کن توصیف کرده است. عبارت‌های تبلیغاتی همان صفحه («بوتیک لوکس») طبقه‌بندی مستقل نیست.',
   'Melal Group','http://melalgroup.com/index.php/sepehr-apartment-hotel/','2026-09-28','group_site',
   'Page retrieved 2026-09-28. A later direct download from this environment timed out; the text matches the retrieved group page.'),
  ('lobby',
   'The group page says the lobby is intimate, with columns decorated with ancient Persian cuneiform.',
   'صفحه گروه می‌گوید لابی جمع‌وجور است و ستون‌هایی با خط میخی پارسی باستان دارد.',
   'Melal Group','http://melalgroup.com/index.php/sepehr-apartment-hotel/','2026-09-28','group_site',null),
  ('confirmed_facilities',
   'On the group page: 24-hour reception with concierge, complimentary international buffet breakfast, free wireless internet, coffee shop, meeting room, and business center. The same sentence says “complete recreational facilities” without naming a pool, sauna, or gym.',
   'در صفحه گروه: پذیرش ۲۴ساعته با کنسیرج، صبحانه بوفه بین‌المللی رایگان، اینترنت بی‌سیم رایگان، کافی‌شاپ، اتاق جلسه و مرکز تجاری. همان جمله «امکانات تفریحی کامل» را بدون نام استخر، سونا یا باشگاه آورده است.',
   'Melal Group','http://melalgroup.com/index.php/sepehr-apartment-hotel/','2026-09-28','group_site',
   'Breakfast hours were not published.'),
  ('unconfirmed_facilities',
   'Some booking pages list a gym, jacuzzi, dry sauna, or steam. Others disagree about parking. None of those details appear on the Melal Group page retrieved the same day, so they are not shown as hotel facilities.',
   'بعضی سایت‌های رزرو باشگاه، جکوزی، سونای خشک یا بخار نوشته‌اند و درباره پارکینگ اختلاف دارند. هیچ‌کدام در صفحه گروه ملل که همان روز خوانده شد نیامده و بنابراین به‌عنوان امکانات قطعی هتل نشان داده نمی‌شود.',
   'Iran Hotel Online and other listings','https://www.iranhotelonline.com/tehran-hotels/%D9%87%D8%AA%D9%84-%D8%A2%D9%BE%D8%A7%D8%B1%D8%AA%D9%85%D8%A7%D9%86-%D8%B3%D9%BE%D9%87%D8%B1/','2026-09-28','conflict',
   'Do not treat a directory checklist as an official facility.'),
  ('osm_pin',
   '35.8001485, 51.4254512 — OpenStreetMap node 4351254589 named هتل سپهر, on the street mapped as سالور, near the Dr Hesabi crossroad.',
   '۳۵٫۸۰۰۱۴۸۵ و ۵۱٫۴۲۵۴۵۱۲ — گره اوپن‌استریت‌مپ ۴۳۵۱۲۵۴۵۸۹ با نام هتل سپهر، روی معبری که سالور نقشه‌برداری شده، نزدیک چهارراه دکتر حسابی.',
   'OpenStreetMap','https://www.openstreetmap.org/node/4351254589','2026-09-28','osm',
   'Community map data, ODbL. Not a coordinate printed by the hotel.'),
  ('nearby_hesabi',
   'Eghamat24 says the Dr Hesabi Museum is about a 2-minute walk (173 m). The OSM house-museum node is about 130 m in a straight line from the hotel node.',
   'اقامت۲۴ موزه دکتر حسابی را حدود ۲ دقیقه پیاده (۱۷۳ متر) نوشته است. گره خانه موزه در اوپن‌استریت‌مپ حدود ۱۳۰ متر خط مستقیم از گره هتل فاصله دارد.',
   'Eghamat24 and OpenStreetMap','https://www.eghamat24.com/TehranHotels/SepehrHotel.html','2026-09-28','third_party',
   'Walking time is the listing’s figure, not measured here.'),
  ('email',
   'No email address is printed on the Melal Group Sepehr page. A directory once showed info@melal.com together with a conflicting star claim, so it is not displayed as the hotel’s address.',
   'در صفحه سپهر گروه ملل ایمیلی چاپ نشده است. یک فهرست info@melal.com را همراه با ادعای ستاره متعارض نشان داده، پس به‌عنوان نشانی هتل نمایش داده نمی‌شود.',
   'Melal Group','http://melalgroup.com/index.php/sepehr-apartment-hotel/','2026-09-28','unverified',null)
on conflict (key) do update set
  value_en = excluded.value_en,
  value_fa = excluded.value_fa,
  source = excluded.source,
  source_url = excluded.source_url,
  retrieved_at = excluded.retrieved_at,
  verification_status = excluded.verification_status,
  notes = excluded.notes;

update hotel_policies
   set body_en = 'Public photographs on booking sites were not copied. Their licence was not established, and this environment could not download the official page images on a later attempt. Empty frames are intentional. Staff can attach a URL only when the hotel has the right to display that file. Nothing here is a stock photo of another building.',
       body_fa = 'عکس‌های عمومی سایت‌های رزرو کپی نشده‌اند. مجوزشان مشخص نیست و در تلاش بعدی، تصویر صفحه رسمی از این محیط دانلود نشد. قاب خالی عمدی است. کارکنان فقط وقتی نشانی تصویر را بگذارند که هتل حق نمایش آن فایل را داشته باشد. اینجا عکس آماده ساختمان دیگری نیست.',
       verification_status = 'operational',
       source_url = 'http://melalgroup.com/index.php/sepehr-apartment-hotel/'
 where code = 'photos';

update hotel_media
   set source = 'Eghamat24 gallery (not copied)',
       source_url = 'https://www.eghamat24.com/TehranHotels/SepehrHotel.html',
       verification_status = 'third_party_gallery_not_copied'
 where url is null;
