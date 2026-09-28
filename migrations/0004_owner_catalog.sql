-- Rates, apartment names, policies, and facilities supplied by the hotel.
-- Nightly amounts are integer toman. Photographs live under /media.

alter table room_types add column if not exists image_url text;

create table if not exists hotel_offerings (
  id serial primary key,
  scope text not null,
  name_en text not null,
  name_fa text not null,
  offered boolean not null,
  highlight boolean not null default false,
  sort_order int not null
);

insert into room_types (
  code, name_en, name_fa, capacity, description_en, description_fa,
  base_rate_toman, rate_verification, capacity_verification, sort_order, image_url
) values
  ('SINGLE','Single room','اتاق یک‌تخته',2,
   'Single room. The nightly rate is the hotel tariff. One child may stay under the child rule.',
   'اتاق یک‌تخته. نرخ شبانه، تعرفه هتل است. یک کودک طبق قانون کودک می‌تواند همراه باشد.',
   6700000,'hotel_provided','hotel_provided',1,'/media/rooms/single.webp'),
  ('SMALL_SUITE','Small single suite','سوئیت کوچک یک‌تخته',2,
   'Small single suite. The nightly rate is the hotel tariff.',
   'سوئیت کوچک یک‌تخته. نرخ شبانه، تعرفه هتل است.',
   7300000,'hotel_provided','hotel_provided',2,'/media/rooms/small-suite.webp'),
  ('STANDARD_SUITE','Standard single suite','سوئیت معمولی یک‌تخته',2,
   'Standard single suite. The nightly rate is the hotel tariff.',
   'سوئیت معمولی یک‌تخته. نرخ شبانه، تعرفه هتل است.',
   8000000,'hotel_provided','hotel_provided',3,'/media/rooms/standard-suite.webp'),
  ('LARGE_SUITE_SINGLE','Large single suite','سوئیت بزرگ یک‌تخته',2,
   'Large single suite. The nightly rate is the hotel tariff.',
   'سوئیت بزرگ یک‌تخته. نرخ شبانه، تعرفه هتل است.',
   9000000,'hotel_provided','hotel_provided',4,'/media/rooms/large-single.webp'),
  ('APT_SINGLE','Two-bedroom apartment, single','آپارتمان دوخوابه یک‌تخته',2,
   'Two-bedroom apartment at the single rate. The nightly rate is the hotel tariff.',
   'آپارتمان دوخوابه یک‌تخته. نرخ شبانه، تعرفه هتل است.',
   10000000,'hotel_provided','hotel_provided',5,'/media/rooms/apt-single.webp'),
  ('LARGE_SUITE_DOUBLE','Large suite, double','سوئیت بزرگ دونفره',3,
   'Large suite at the double rate. One child may stay under the child rule.',
   'سوئیت بزرگ دونفره. یک کودک طبق قانون کودک می‌تواند همراه باشد.',
   10800000,'hotel_provided','hotel_provided',6,'/media/rooms/large-double.webp'),
  ('APT_DOUBLE','Two-bedroom apartment, double','آپارتمان دوخوابه دونفره',3,
   'Two-bedroom apartment at the double rate. The nightly rate is the hotel tariff.',
   'آپارتمان دوخوابه دونفره. نرخ شبانه، تعرفه هتل است.',
   11800000,'hotel_provided','hotel_provided',7,'/media/rooms/apt-double.webp')
on conflict (code) do update set
  name_en = excluded.name_en,
  name_fa = excluded.name_fa,
  capacity = excluded.capacity,
  description_en = excluded.description_en,
  description_fa = excluded.description_fa,
  base_rate_toman = excluded.base_rate_toman,
  rate_verification = excluded.rate_verification,
  capacity_verification = excluded.capacity_verification,
  sort_order = excluded.sort_order,
  image_url = excluded.image_url;

update rooms set room_type_code = 'SINGLE', capacity = 2, type_assignment = 'owner_catalog' where number between 1 and 6;
update rooms set room_type_code = 'SMALL_SUITE', capacity = 2, type_assignment = 'owner_catalog' where number between 7 and 12;
update rooms set room_type_code = 'STANDARD_SUITE', capacity = 2, type_assignment = 'owner_catalog' where number between 13 and 18;
update rooms set room_type_code = 'LARGE_SUITE_SINGLE', capacity = 2, type_assignment = 'owner_catalog' where number between 19 and 24;
update rooms set room_type_code = 'APT_SINGLE', capacity = 2, type_assignment = 'owner_catalog' where number between 25 and 30;
update rooms set room_type_code = 'LARGE_SUITE_DOUBLE', capacity = 3, type_assignment = 'owner_catalog' where number between 31 and 35;
update rooms set room_type_code = 'APT_DOUBLE', capacity = 3, type_assignment = 'owner_catalog' where number between 36 and 40;

update reservations r
   set room_type_code = rm.room_type_code
  from rooms rm
 where r.room_id = rm.id
   and r.room_type_code is distinct from rm.room_type_code;

update reservations
   set room_type_code = case room_type_code
     when 'STUDIO' then 'SINGLE'
     when 'SUITE' then 'SMALL_SUITE'
     when 'MEDIUM_SUITE' then 'STANDARD_SUITE'
     when 'LARGE_SUITE' then 'LARGE_SUITE_SINGLE'
     when 'TWO_BEDROOM' then 'APT_DOUBLE'
     else room_type_code
   end
 where room_type_code in ('STUDIO','SUITE','MEDIUM_SUITE','LARGE_SUITE','TWO_BEDROOM');

delete from room_type_amenities
 where room_type_code in ('STUDIO','SUITE','MEDIUM_SUITE','LARGE_SUITE','TWO_BEDROOM');

delete from room_types
 where code in ('STUDIO','SUITE','MEDIUM_SUITE','LARGE_SUITE','TWO_BEDROOM');

update hotel_settings set value = '14:00', verification_status = 'hotel_provided', notes = 'Set by the hotel.'
 where key = 'check_in_time';
update hotel_settings set value = '12:00', verification_status = 'hotel_provided', notes = 'Set by the hotel.'
 where key = 'check_out_time';

update hotel_policies set
  title_en = 'Check-in and check-out',
  title_fa = 'ورود و خروج',
  body_en = 'Check-in is 14:00. Check-out is 12:00.',
  body_fa = 'ساعت تحویل اتاق ۱۴:۰۰ و ساعت تخلیه ۱۲:۰۰ است.',
  verification_status = 'hotel_provided'
 where code = 'checkin';

update hotel_policies set
  title_en = 'Rates',
  title_fa = 'نرخ‌ها',
  body_en = 'Nightly rates are the hotel tariff, in toman: single room 6,700,000; small single suite 7,300,000; standard single suite 8,000,000; large single suite 9,000,000; two-bedroom apartment single 10,000,000; large double suite 10,800,000; two-bedroom apartment double 11,800,000.',
  body_fa = 'نرخ‌ها شبانه و به تومان است: اتاق یک‌تخته ۶٫۷۰۰٫۰۰۰، سوئیت کوچک یک‌تخته ۷٫۳۰۰٫۰۰۰، سوئیت معمولی یک‌تخته ۸٫۰۰۰٫۰۰۰، سوئیت بزرگ یک‌تخته ۹٫۰۰۰٫۰۰۰، آپارتمان دوخوابه یک‌تخته ۱۰٫۰۰۰٫۰۰۰، سوئیت بزرگ دونفره ۱۰٫۸۰۰٫۰۰۰، آپارتمان دوخوابه دونفره ۱۱٫۸۰۰٫۰۰۰.',
  verification_status = 'hotel_provided'
 where code = 'rates';

update hotel_policies set
  title_en = 'Parking',
  title_fa = 'پارکینگ',
  body_en = 'Parking is offered. A capacity and a fee were not stated with this list.',
  body_fa = 'پارکینگ ارائه می‌شود. ظرفیت و هزینه در این فهرست نیامده است.',
  verification_status = 'hotel_provided'
 where code = 'parking';

update hotel_policies set
  body_en = 'The photographs on this site are the files supplied by the hotel.',
  body_fa = 'عکس‌های این سایت همان فایل‌هایی است که هتل داده است.',
  verification_status = 'hotel_provided'
 where code = 'photos';

insert into hotel_policies (code, title_en, title_fa, body_en, body_fa, verification_status) values
  ('women','Single women','پذیرش خانم مجرد',
   'A single woman is accepted with valid identification.',
   'پذیرش خانم مجرد با مدارک شناسایی معتبر انجام می‌شود.',
   'hotel_provided'),
  ('sigheh','Temporary marriage certificate','صیغه‌نامه',
   'A temporary-marriage certificate is accepted when it carries the raised seal of the notary.',
   'صیغه‌نامه با مهر برجسته محضر پذیرفته می‌شود.',
   'hotel_provided'),
  ('children','Children','کودک',
   'One child under 6 stays free if no hotel service is used. One child from 6 to 12 is half price if no hotel service is used. The free or half-price stay applies to one child only.',
   'یک کودک زیر ۶ سال، اگر از سرویس استفاده نکند، رایگان است. یک کودک ۶ تا ۱۲ سال، اگر از سرویس استفاده نکند، نیم‌بها است. اقامت رایگان یا نیم‌بها فقط برای یک کودک حساب می‌شود.',
   'hotel_provided'),
  ('cancel','Cancellation','کنسلی',
   'The cancellation amount in peak and off-peak dates is confirmed with the hotel. It is not a single published percentage.',
   'مبلغ کنسلی در ایام پیک و غیرپیک پس از استعلام از هتل مشخص می‌شود و درصد ثابتی برای همه تاریخ‌ها اعلام نشده است.',
   'hotel_provided')
on conflict (code) do update set
  title_en = excluded.title_en,
  title_fa = excluded.title_fa,
  body_en = excluded.body_en,
  body_fa = excluded.body_fa,
  verification_status = excluded.verification_status;

delete from hotel_offerings;

insert into hotel_offerings (scope, name_en, name_fa, offered, highlight, sort_order) values
  ('hotel','Room service','روم سرویس',true,true,1),
  ('hotel','Parking','پارکینگ',true,true,2),
  ('hotel','Lobby','لابی',true,false,3),
  ('hotel','Elevator','آسانسور',true,false,4),
  ('hotel','Fire alarm','سیستم اعلام حریق',true,false,5),
  ('hotel','24-hour reception','پذیرش ۲۴ ساعته',true,true,6),
  ('hotel','Coffee shop','کافی‌شاپ',true,true,7),
  ('hotel','Internet in the lobby','اینترنت در لابی',true,false,8),
  ('hotel','Housekeeping','خدمات خانه‌داری',true,true,9),
  ('hotel','Laundry','لاندری',true,false,10),
  ('hotel','Internet café','کافی‌نت',true,false,11),
  ('hotel','Porter','خدمات باربری',true,false,12),
  ('hotel','Breakfast','صبحانه',true,true,13),
  ('hotel','Western toilet in the lobby','سرویس بهداشتی فرنگی در لابی',true,false,14),
  ('hotel','Iranian toilet in the lobby','سرویس بهداشتی ایرانی در لابی',true,false,15),
  ('hotel','Prayer room','نمازخانه',true,false,16),
  ('hotel','Air conditioning','سیستم تهویه مطبوع',true,false,17),
  ('hotel','Telephone in the lobby','تلفن در لابی',true,false,18),
  ('hotel','Emergency stairs','پله اضطراری',true,false,19),
  ('hotel','Film network','شبکه پخش فیلم',true,false,20),
  ('hotel','Garden','فضای سبز',false,false,21),
  ('hotel','Television in the lobby','تلویزیون در لابی',false,false,22),
  ('hotel','Paid minibar in public areas','مینی‌بار با هزینه در فضاهای عمومی',false,false,23),
  ('hotel','Western toilet on the floors','سرویس بهداشتی فرنگی در طبقات',false,false,24),
  ('hotel','ATM','خودپرداز',false,false,25),
  ('hotel','Iranian toilet on the floors','سرویس بهداشتی ایرانی در طبقات',false,false,26),
  ('room','Door lock','قفل در اتاق',true,false,1),
  ('room','Heating and cooling','سرمایش و گرمایش',true,true,2),
  ('room','Refrigerator','یخچال',true,false,3),
  ('room','Slippers','دمپایی',true,false,4),
  ('room','Tea maker','چای‌ساز',true,false,5),
  ('room','Complimentary water','آب رایگان',true,false,6),
  ('room','Western toilet','سرویس بهداشتی فرنگی',true,false,7),
  ('room','Internet','اینترنت در اتاق',true,true,8),
  ('room','In-room safe','صندوق امانات داخل اتاق',true,false,9),
  ('room','Television','تلویزیون',true,false,10),
  ('room','Furniture','مبلمان',true,false,11),
  ('room','Dresser','دراور',true,false,12),
  ('room','Writing desk','میز تحریر',true,false,13),
  ('room','Minibar, charged','مینی‌بار با هزینه',true,false,14),
  ('room','Air conditioning','تهویه مطبوع',true,false,15),
  ('room','Wardrobe','کمد لباس',true,false,16),
  ('room','Hangers','رخت‌آویز',true,false,17),
  ('room','Film network','شبکه پخش فیلم',true,false,18),
  ('room','Fire alarm','اعلام حریق',true,false,19),
  ('room','Power switch','پاورسوئیچ',true,false,20),
  ('room','Wake-up call','بیدارباش',true,false,21),
  ('room','Fire suppression','اطفاء حریق',true,false,22),
  ('room','Alarm bell','زنگ هشدار',true,false,23),
  ('room','IPTV','IPTV',true,false,24),
  ('room','Balcony','بالکن',true,false,25),
  ('room','Table lamp','آباژور',true,false,26),
  ('room','Toiletries','لوازم بهداشتی',true,false,27),
  ('room','Telephone','تلفن',true,false,28),
  ('room','Bath','حمام',true,false,29),
  ('room','Iranian toilet','سرویس بهداشتی ایرانی',false,false,30),
  ('room','Cooking','امکان پخت‌وپز',false,false,31),
  ('room','Charging electronics','شارژ وسایل الکترونیکی',false,false,32),
  ('exclusive','Ticket arrangement','تهیه بلیط',true,false,1),
  ('exclusive','Safe deposit','صندوق امانات',true,false,2),
  ('exclusive','Visa and Mastercard','پرداخت ویزا و مسترکارت',true,false,3),
  ('exclusive','Traditional tea house','چایخانه سنتی',false,false,4),
  ('exclusive','Hair salon','آرایشگاه',false,false,5),
  ('exclusive','Travel agency','آژانس مسافرتی',false,false,6),
  ('exclusive','Currency exchange','صرافی',false,false,7),
  ('exclusive','Library','کتابخانه',false,false,8),
  ('exclusive','Photo studio','آتلیه',false,false,9),
  ('comfort','Arrival transfer, charged','ترانسفر رفت با هزینه',true,false,1),
  ('comfort','Departure transfer, charged','ترانسفر برگشت با هزینه',true,false,2),
  ('comfort','Luggage room','اتاق چمدان',true,false,3),
  ('comfort','Newspaper','روزنامه',true,false,4),
  ('comfort','Fire extinguisher','کپسول آتش‌نشانی',true,false,5),
  ('comfort','Photocopy','فتوکپی',true,false,6),
  ('comfort','Printer','پرینتر',true,false,7),
  ('comfort','Taxi','تاکسی‌سرویس',true,false,8),
  ('comfort','Fax','فکس',true,false,9),
  ('comfort','Accessible services','خدمات برای معلولین',false,false,10),
  ('comfort','Shopping centre','مرکز خرید',false,false,11),
  ('comfort','Shoe shine','دستگاه واکس کفش',false,false,12),
  ('comfort','Shop','فروشگاه',false,false,13),
  ('comfort','Smoking room','اتاق سیگار',false,false,14),
  ('comfort','Operator telephone room','اتاق تلفن اپراتور',false,false,15),
  ('sport','Pool','استخر',true,true,1),
  ('sport','Jacuzzi','جکوزی',true,true,2),
  ('sport','Fitness equipment','وسایل بدنسازی',true,false,3),
  ('sport','Sauna','سونا',true,true,4),
  ('sport','Gym','سالن ورزشی',true,false,5),
  ('sport','Playroom','اتاق بازی',false,false,6),
  ('sport','Massage','ماساژ',false,false,7),
  ('sport','Game net','گیم‌نت',false,false,8),
  ('sport','Children park','پارک کودک',false,false,9),
  ('sport','Video games','بازی ویدئویی',false,false,10),
  ('sport','Tennis','زمین تنیس',false,false,11),
  ('sport','Billiards','سالن بیلیارد',false,false,12),
  ('sport','Sports field','زمین ورزشی',false,false,13),
  ('special','CIP','خدمات CIP',true,false,1),
  ('special','Tours','خدمات تور',true,false,2);
