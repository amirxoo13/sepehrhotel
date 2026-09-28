-- Sepehr Apartment Hotel operational schema.
-- Seeded facts are tagged with verification_status. Provisional room-type
-- assignment is NOT a verified floor plan. Nightly rates are unpublished.

create table if not exists roles (
  code text primary key,
  name_en text not null,
  name_fa text not null
);

create table if not exists permissions (
  code text primary key
);

create table if not exists role_permissions (
  role_code text not null references roles(code) on delete cascade,
  permission_code text not null references permissions(code) on delete cascade,
  primary key (role_code, permission_code)
);

create table if not exists user_roles (
  user_id text not null references "user"(id) on delete cascade,
  role_code text not null references roles(code),
  primary key (user_id, role_code)
);

create table if not exists profiles (
  user_id text primary key references "user"(id) on delete cascade,
  full_name text not null,
  phone text,
  nationality text,
  date_of_birth date,
  id_doc_type text,
  id_doc_last4 text,
  locale text not null default 'fa',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists hotel_facts (
  key text primary key,
  value_en text not null,
  value_fa text not null,
  source text,
  source_url text,
  retrieved_at date,
  verification_status text not null,
  notes text
);

create table if not exists hotel_settings (
  key text primary key,
  value text not null,
  verification_status text not null,
  notes text
);

create table if not exists hotel_policies (
  code text primary key,
  title_en text not null,
  title_fa text not null,
  body_en text not null,
  body_fa text not null,
  verification_status text not null,
  source_url text
);

create table if not exists hotel_media (
  id serial primary key,
  category text not null,
  title_en text not null,
  title_fa text not null,
  url text,
  source text,
  source_url text,
  verification_status text not null,
  sort_order int not null default 0,
  active boolean not null default true
);

create table if not exists departments (
  code text primary key,
  name_en text not null,
  name_fa text not null
);

create table if not exists room_types (
  code text primary key,
  name_en text not null,
  name_fa text not null,
  capacity int not null check (capacity > 0),
  description_en text not null,
  description_fa text not null,
  base_rate_toman int,
  rate_verification text not null,
  capacity_verification text not null,
  sort_order int not null
);

create table if not exists rooms (
  id serial primary key,
  number int not null unique check (number between 1 and 9999),
  floor int not null check (floor > 0),
  room_type_code text not null references room_types(code),
  type_assignment text not null,
  status text not null check (status in (
    'AVAILABLE','RESERVED','OCCUPIED','CHECKOUT_PENDING','CLEANING','MAINTENANCE','OUT_OF_SERVICE','BLOCKED'
  )),
  description_en text,
  description_fa text,
  qr_code text not null unique,
  capacity int not null check (capacity > 0),
  created_at timestamptz not null default now()
);

create table if not exists room_status_history (
  id serial primary key,
  room_id int not null references rooms(id),
  from_status text,
  to_status text not null,
  actor_user_id text,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists amenities (
  code text primary key,
  name_en text not null,
  name_fa text not null,
  verification_status text not null
);

create table if not exists room_type_amenities (
  room_type_code text not null references room_types(code) on delete cascade,
  amenity_code text not null references amenities(code),
  primary key (room_type_code, amenity_code)
);

create table if not exists reservations (
  id serial primary key,
  code text not null unique,
  user_id text not null references "user"(id),
  room_id int references rooms(id),
  room_type_code text not null references room_types(code),
  check_in date not null,
  check_out date not null,
  adults int not null check (adults > 0),
  children int not null default 0 check (children >= 0),
  status text not null check (status in (
    'PENDING','CONFIRMED','CHECKED_IN','CHECKED_OUT','CANCELLED','NO_SHOW','EXPIRED'
  )),
  nightly_rate_toman int,
  currency text not null default 'IRT',
  source text not null default 'DIRECT',
  guest_name text not null,
  guest_phone text,
  notes text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out > check_in),
  unique (user_id, idempotency_key)
);

create table if not exists room_nights (
  room_id int not null references rooms(id),
  night date not null,
  reservation_id int not null references reservations(id) on delete cascade,
  primary key (room_id, night)
);

create index if not exists room_nights_res_idx on room_nights (reservation_id);
create index if not exists reservations_user_idx on reservations (user_id);
create index if not exists reservations_status_idx on reservations (status, check_in);

create table if not exists stays (
  id serial primary key,
  reservation_id int not null unique references reservations(id),
  room_id int not null references rooms(id),
  user_id text not null references "user"(id),
  status text not null check (status in ('ACTIVE','CHECKOUT_PENDING','CLOSED')),
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  checked_in_by text,
  checked_out_by text
);

create index if not exists stays_user_idx on stays (user_id, status);

create table if not exists service_categories (
  code text primary key,
  department_code text not null references departments(code),
  name_en text not null,
  name_fa text not null,
  verification_status text not null
);

create table if not exists services (
  id serial primary key,
  category_code text not null references service_categories(code),
  code text not null unique,
  name_en text not null,
  name_fa text not null,
  description_en text,
  description_fa text,
  price_toman int,
  complimentary boolean not null default false,
  active boolean not null default true,
  bill_on_status text not null default 'DELIVERED',
  verification_status text not null,
  requires_note boolean not null default false
);

create table if not exists orders (
  id serial primary key,
  code text not null unique,
  stay_id int not null references stays(id),
  room_id int not null references rooms(id),
  user_id text not null references "user"(id),
  department_code text not null references departments(code),
  status text not null check (status in (
    'PENDING','ACCEPTED','PREPARING','READY','DELIVERING','DELIVERED','COMPLETED','CANCELLED','REJECTED'
  )),
  priority text not null default 'NORMAL',
  notes text,
  service_date date,
  service_time text,
  guest_count int,
  idempotency_key text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  delivering_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  unique (user_id, idempotency_key)
);

create index if not exists orders_dept_idx on orders (department_code, status, created_at desc);
create index if not exists orders_user_idx on orders (user_id, created_at desc);

create table if not exists order_items (
  id serial primary key,
  order_id int not null references orders(id) on delete cascade,
  service_id int not null references services(id),
  quantity int not null check (quantity > 0 and quantity <= 50),
  unit_price_toman int,
  complimentary boolean not null default false,
  name_en text not null,
  name_fa text not null
);

create table if not exists order_status_history (
  id serial primary key,
  order_id int not null references orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_user_id text,
  created_at timestamptz not null default now()
);

create table if not exists folios (
  id serial primary key,
  stay_id int not null unique references stays(id),
  reservation_id int not null references reservations(id),
  user_id text not null references "user"(id),
  status text not null default 'OPEN' check (status in ('OPEN','SETTLED')),
  currency text not null default 'IRT'
);

create table if not exists folio_items (
  id serial primary key,
  folio_id int not null references folios(id),
  source_type text not null,
  source_id text not null,
  description_en text not null,
  description_fa text not null,
  amount_toman int not null,
  quantity int not null default 1,
  voided boolean not null default false,
  created_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create table if not exists payments (
  id serial primary key,
  folio_id int not null references folios(id),
  amount_toman int not null check (amount_toman > 0),
  method text not null check (method in ('CASH','CARD','TRANSFER','GATEWAY')),
  status text not null check (status in ('RECORDED','PENDING_GATEWAY','FAILED')),
  reference text,
  recorded_by text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id serial primary key,
  recipient_user_id text,
  recipient_role text,
  department_code text,
  type text not null,
  title_en text not null,
  title_fa text not null,
  body_en text not null,
  body_fa text not null,
  entity_type text,
  entity_id text,
  created_at timestamptz not null default now()
);

create index if not exists notifications_created_idx on notifications (id desc);

create table if not exists notification_receipts (
  notification_id int not null references notifications(id) on delete cascade,
  user_id text not null,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create table if not exists housekeeping_tasks (
  id serial primary key,
  room_id int not null references rooms(id),
  stay_id int references stays(id),
  order_id int references orders(id),
  kind text not null,
  priority text not null default 'NORMAL',
  status text not null check (status in ('OPEN','ASSIGNED','IN_PROGRESS','DONE','CANCELLED')),
  assigned_user_id text,
  notes text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists laundry_details (
  id serial primary key,
  order_id int not null references orders(id) on delete cascade,
  item_label text not null,
  quantity int not null check (quantity > 0),
  service_kind text not null
);

create table if not exists parking_requests (
  id serial primary key,
  order_id int unique references orders(id) on delete cascade,
  stay_id int not null references stays(id),
  room_id int not null references rooms(id),
  plate text not null,
  vehicle_type text,
  status text not null,
  slot_label text,
  created_at timestamptz not null default now()
);

create table if not exists maintenance_tickets (
  id serial primary key,
  order_id int unique references orders(id) on delete cascade,
  room_id int not null references rooms(id),
  stay_id int references stays(id),
  issue_code text not null,
  description text,
  priority text not null,
  status text not null,
  assigned_user_id text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists extension_requests (
  id serial primary key,
  stay_id int not null references stays(id),
  reservation_id int not null references reservations(id),
  requested_check_out date not null,
  status text not null check (status in ('PENDING','APPROVED','REJECTED')),
  quoted_amount_toman int,
  reason text,
  decided_by text,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id serial primary key,
  actor_user_id text,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on audit_logs (created_at desc);

insert into roles (code, name_en, name_fa) values
  ('SUPER_ADMIN','Super admin','مدیر ارشد'),
  ('HOTEL_ADMIN','Hotel admin','مدیر هتل'),
  ('RECEPTION','Reception','پذیرش'),
  ('HOUSEKEEPING','Housekeeping','خانه‌داری'),
  ('LAUNDRY','Laundry','لاندری'),
  ('KITCHEN','Kitchen','آشپزخانه'),
  ('COFFEE_SHOP','Coffee shop','کافی‌شاپ'),
  ('PARKING','Parking','پارکینگ'),
  ('MAINTENANCE','Maintenance','تعمیرات'),
  ('ACCOUNTING','Accounting','حسابداری'),
  ('GUEST','Guest','مهمان')
on conflict (code) do nothing;

insert into permissions (code) values
  ('reservation.read'),('reservation.create'),('reservation.update'),('reservation.cancel'),
  ('reservation.checkin'),('reservation.checkout'),('reservation.checkout_override'),
  ('guest.read'),('guest.update'),
  ('order.queue'),('order.accept'),('order.reject'),('order.prepare'),('order.deliver'),('order.complete'),
  ('order.price'),
  ('billing.read'),('billing.create'),('payment.record'),
  ('room.read'),('room.update'),('room.block'),('room.maintenance'),
  ('housekeeping.update'),('parking.update'),('maintenance.update'),
  ('staff.assign'),('content.update'),('settings.update'),('audit.read'),
  ('announcement.create'),('extension.decide')
on conflict (code) do nothing;

insert into role_permissions (role_code, permission_code)
select 'HOTEL_ADMIN', code from permissions
on conflict do nothing;

insert into role_permissions (role_code, permission_code)
select 'SUPER_ADMIN', code from permissions
on conflict do nothing;

insert into role_permissions (role_code, permission_code) values
  ('RECEPTION','reservation.read'),('RECEPTION','reservation.create'),('RECEPTION','reservation.update'),
  ('RECEPTION','reservation.cancel'),('RECEPTION','reservation.checkin'),('RECEPTION','reservation.checkout'),
  ('RECEPTION','guest.read'),('RECEPTION','guest.update'),('RECEPTION','order.queue'),
  ('RECEPTION','billing.read'),('RECEPTION','billing.create'),('RECEPTION','payment.record'),
  ('RECEPTION','room.read'),('RECEPTION','room.update'),('RECEPTION','announcement.create'),
  ('RECEPTION','extension.decide'),
  ('HOUSEKEEPING','order.queue'),('HOUSEKEEPING','order.accept'),('HOUSEKEEPING','order.reject'),
  ('HOUSEKEEPING','order.prepare'),('HOUSEKEEPING','order.deliver'),('HOUSEKEEPING','order.complete'),
  ('HOUSEKEEPING','housekeeping.update'),('HOUSEKEEPING','room.read'),
  ('LAUNDRY','order.queue'),('LAUNDRY','order.accept'),('LAUNDRY','order.reject'),
  ('LAUNDRY','order.prepare'),('LAUNDRY','order.deliver'),('LAUNDRY','order.complete'),('LAUNDRY','order.price'),
  ('LAUNDRY','room.read'),
  ('KITCHEN','order.queue'),('KITCHEN','order.accept'),('KITCHEN','order.reject'),
  ('KITCHEN','order.prepare'),('KITCHEN','order.deliver'),('KITCHEN','order.complete'),('KITCHEN','order.price'),
  ('KITCHEN','room.read'),
  ('COFFEE_SHOP','order.queue'),('COFFEE_SHOP','order.accept'),('COFFEE_SHOP','order.reject'),
  ('COFFEE_SHOP','order.prepare'),('COFFEE_SHOP','order.deliver'),('COFFEE_SHOP','order.complete'),
  ('COFFEE_SHOP','order.price'),('COFFEE_SHOP','room.read'),
  ('PARKING','order.queue'),('PARKING','order.accept'),('PARKING','order.reject'),
  ('PARKING','order.prepare'),('PARKING','order.deliver'),('PARKING','order.complete'),
  ('PARKING','parking.update'),('PARKING','order.price'),('PARKING','room.read'),
  ('MAINTENANCE','order.queue'),('MAINTENANCE','order.accept'),('MAINTENANCE','order.reject'),
  ('MAINTENANCE','order.prepare'),('MAINTENANCE','order.deliver'),('MAINTENANCE','order.complete'),
  ('MAINTENANCE','maintenance.update'),('MAINTENANCE','room.read'),('MAINTENANCE','room.maintenance'),
  ('ACCOUNTING','billing.read'),('ACCOUNTING','billing.create'),('ACCOUNTING','payment.record'),
  ('ACCOUNTING','reservation.read'),('ACCOUNTING','guest.read'),('ACCOUNTING','audit.read'),
  ('ACCOUNTING','order.queue')
on conflict do nothing;

insert into departments (code, name_en, name_fa) values
  ('RECEPTION','Reception','پذیرش'),
  ('HOUSEKEEPING','Housekeeping','خانه‌داری'),
  ('LAUNDRY','Laundry','لاندری'),
  ('KITCHEN','Kitchen','آشپزخانه'),
  ('COFFEE_SHOP','Coffee shop','کافی‌شاپ'),
  ('PARKING','Parking','پارکینگ'),
  ('MAINTENANCE','Maintenance','تعمیرات')
on conflict (code) do nothing;

insert into room_types (
  code, name_en, name_fa, capacity, description_en, description_fa,
  base_rate_toman, rate_verification, capacity_verification, sort_order
) values
  ('STUDIO','Studio Sepehr','استودیو سپهر',1,
   'Named on the Melal Group page as Studio Sepehr. Capacity is an operational default (one guest) because listings disagree.',
   'در صفحه گروه ملل با نام استودیو سپهر آمده است. ظرفیت، پیش‌فرض عملیاتی است چون منابع در تعداد نفر اختلاف دارند.',
   null,'unpublished','provisional',1),
  ('SUITE','Suite Sepehr','سوئیت سپهر',2,
   'Named on the Melal Group page as Suite Sepehr. Capacity 2 is an operational default, not a verified per-room fact.',
   'در صفحه گروه ملل با نام سوئیت سپهر آمده است. ظرفیت دو نفر پیش‌فرض عملیاتی است.',
   null,'unpublished','provisional',2),
  ('MEDIUM_SUITE','Medium suite Sepehr','سوئیت متوسط سپهر',2,
   'Named on the Melal Group page as Medium-Suite Sepehr.',
   'در صفحه گروه ملل با نام سوئیت متوسط آمده است.',
   null,'unpublished','provisional',3),
  ('LARGE_SUITE','Large suite Sepehr','سوئیت بزرگ سپهر',2,
   'Named on the Melal Group page as Large-Suite Sepehr. Some booking sites describe a large double suite.',
   'در صفحه گروه ملل با نام سوئیت بزرگ آمده است. برخی سایت‌های رزرو از سوئیت بزرگ دو نفره نام برده‌اند.',
   null,'unpublished','provisional',4),
  ('TWO_BEDROOM','Two-bedroom Sepehr','آپارتمان دوخوابه سپهر',4,
   'Named on the Melal Group page as 2-Bedroom Sepehr. Third-party listings describe a two-bedroom apartment for up to four guests. Capacity is provisional.',
   'در صفحه گروه ملل با نام دوخوابه آمده است. ظرفیت چهار نفر از آگهی‌های ثالث است و قطعی هر واحد نیست.',
   null,'unpublished','provisional',5)
on conflict (code) do nothing;

insert into amenities (code, name_en, name_fa, verification_status) values
  ('WIFI','Wireless internet','اینترنت بی‌سیم','group_site'),
  ('SAT_TV','Satellite television','تلویزیون ماهواره‌ای','group_site'),
  ('DVD','DVD player','دستگاه دی‌وی‌دی','group_site'),
  ('DESK','Working desk','میز کار','group_site'),
  ('FURNITURE','Custom furniture','مبلمان','group_site'),
  ('BATH','Bath with shower','حمام با دوش','group_site'),
  ('KITCHENETTE','Kitchenette','آشپزخانه کوچک','partial_not_all_units'),
  ('AC','Heating and cooling','سرمایش و گرمایش','third_party'),
  ('TEA','Tea maker','چای‌ساز','third_party'),
  ('FRIDGE','Refrigerator','یخچال','third_party')
on conflict (code) do nothing;

insert into room_type_amenities (room_type_code, amenity_code)
select t.code, a.code
  from room_types t
  join amenities a on a.code in ('WIFI','SAT_TV','DVD','DESK','FURNITURE','BATH')
on conflict do nothing;

insert into room_type_amenities (room_type_code, amenity_code) values
  ('TWO_BEDROOM','KITCHENETTE'),
  ('LARGE_SUITE','KITCHENETTE'),
  ('MEDIUM_SUITE','KITCHENETTE'),
  ('STUDIO','AC'),('SUITE','AC'),('MEDIUM_SUITE','AC'),('LARGE_SUITE','AC'),('TWO_BEDROOM','AC'),
  ('STUDIO','TEA'),('SUITE','TEA'),('MEDIUM_SUITE','TEA'),('LARGE_SUITE','TEA'),('TWO_BEDROOM','TEA'),
  ('STUDIO','FRIDGE'),('SUITE','FRIDGE'),('MEDIUM_SUITE','FRIDGE'),('LARGE_SUITE','FRIDGE'),('TWO_BEDROOM','FRIDGE')
on conflict do nothing;

insert into rooms (number, floor, room_type_code, type_assignment, status, qr_code, capacity, description_en, description_fa)
select
  n,
  ((n - 1) / 8) + 1,
  case
    when n <= 8 then 'STUDIO'
    when n <= 16 then 'SUITE'
    when n <= 24 then 'MEDIUM_SUITE'
    when n <= 32 then 'LARGE_SUITE'
    else 'TWO_BEDROOM'
  end,
  'provisional_not_a_floor_plan',
  'AVAILABLE',
  'sp-' || lpad(n::text, 2, '0'),
  case
    when n <= 8 then 1
    when n <= 32 then 2
    else 4
  end,
  'Type and floor grouping are operational defaults so the 40 published units can be managed. They are not a verified floor plan.',
  'نوع و طبقه‌بندی برای مدیریت ۴۰ واحد منتشرشده است و نقشه تأییدشده هتل نیست.'
from generate_series(1, 40) as n
on conflict (number) do nothing;

insert into service_categories (code, department_code, name_en, name_fa, verification_status) values
  ('HOUSEKEEPING','HOUSEKEEPING','Housekeeping','خانه‌داری','third_party'),
  ('LAUNDRY','LAUNDRY','Laundry','لاندری','third_party'),
  ('BREAKFAST','KITCHEN','Breakfast','صبحانه','group_site'),
  ('COFFEE','COFFEE_SHOP','Coffee shop','کافی‌شاپ','group_site'),
  ('PARKING','PARKING','Parking','پارکینگ','conflict'),
  ('MAINTENANCE','MAINTENANCE','Maintenance','تعمیرات','operational'),
  ('FRONT','RECEPTION','Front desk','پذیرش','group_site')
on conflict (code) do nothing;

insert into services (
  category_code, code, name_en, name_fa, description_en, description_fa,
  price_toman, complimentary, active, verification_status, requires_note
) values
  ('HOUSEKEEPING','extra_water','Drinking water','آب آشامیدنی',
   'Listings mention complimentary drinking water in the room. Extra delivery is configurable.',
   'آگهی‌ها از آب رایگان در اتاق نام برده‌اند. درخواست اضافه قابل تنظیم است.',
   null, true, true, 'third_party', false),
  ('HOUSEKEEPING','extra_towels','Extra towels','حوله اضافه',
   'Housekeeping amenity request. A public price was not found.',
   'درخواست امکانات خانه‌داری. قیمت عمومی پیدا نشد.',
   null, false, true, 'operational', false),
  ('HOUSEKEEPING','room_cleaning','Room cleaning','نظافت اتاق',
   'Professional housekeeping is described by the hotel group. Same-day extra cleaning is configurable.',
   'خانه‌داری حرفه‌ای در سایت گروه هتل ذکر شده است. نظافت اضافه همان روز قابل تنظیم است.',
   null, false, true, 'group_site', false),
  ('HOUSEKEEPING','toiletries','Toiletries','لوازم بهداشتی',
   'Listings mention bathroom amenities. Replenishment price was not published.',
   'آگهی‌ها از لوازم بهداشتی نام برده‌اند. قیمت شارژ مجدد منتشر نشده است.',
   null, false, true, 'third_party', false),
  ('LAUNDRY','laundry_wash','Laundry','لاندری',
   'Laundry service is listed by multiple sources. Item price is unpublished — the department sets it before delivery.',
   'خدمات لاندری در چند منبع آمده است. قیمت هر قلم منتشر نشده و واحد پیش از تحویل آن را ثبت می‌کند.',
   null, false, true, 'third_party', true),
  ('BREAKFAST','breakfast_buffet','Breakfast','صبحانه',
   'The group site describes a complimentary international buffet breakfast. Hours were not published.',
   'سایت گروه از بوفه صبحانه رایگان با غذای بین‌المللی نام برده است. ساعت سرو منتشر نشده است.',
   null, true, true, 'group_site', false),
  ('BREAKFAST','breakfast_in_room','In-room breakfast','صبحانه در اتاق',
   'Room service is mentioned by booking sites. Whether in-room breakfast is included was not verified — price stays unset until the hotel confirms it.',
   'روم‌سرویس در سایت‌های رزرو آمده است. شمول صبحانه داخل اتاق تأیید نشده و تا تأیید هتل بدون قیمت می‌ماند.',
   null, false, true, 'third_party', true),
  ('COFFEE','tea','Tea','چای',
   'Coffee shop serving hot drinks is described by the group site and a facility listing. Menu price was not published.',
   'کافی‌شاپ و نوشیدنی گرم در سایت گروه و فهرست امکانات آمده است. قیمت منو منتشر نشده است.',
   null, false, true, 'group_site', false),
  ('COFFEE','coffee','Coffee','قهوه',
   'Coffee shop item. Price unpublished.',
   'قلم کافی‌شاپ. قیمت منتشر نشده است.',
   null, false, true, 'group_site', false),
  ('COFFEE','juice','Juice','آبمیوه',
   'A facility listing describes cold drinks. Treated as a configurable coffee-shop item, not an official menu.',
   'یک فهرست امکانات از نوشیدنی سرد نام برده است. به‌عنوان قلم قابل تنظیم کافی‌شاپ ثبت شده، نه منوی رسمی.',
   null, false, true, 'third_party', false),
  ('COFFEE','soft_drink','Soft drink','نوشابه',
   'Configurable cold drink. Not an official published menu item.',
   'نوشیدنی سرد قابل تنظیم. قلم منوی رسمی منتشرشده نیست.',
   null, false, true, 'operational', false),
  ('COFFEE','snack','Snack','اسنک',
   'A facility listing mentions light snacks. Price unpublished.',
   'یک فهرست امکانات از میان‌وعده سبک نام برده است. قیمت منتشر نشده است.',
   null, false, true, 'third_party', false),
  ('PARKING','parking_request','Parking request','درخواست پارکینگ',
   'Parking is listed, but sources conflict: one says a free lot for about four cars, another says paid, reserve ahead, subject to capacity. No capacity is asserted here.',
   'پارکینگ در منابع آمده، اما اختلاف دارند: یکی پارکینگ رایگان حدود چهار خودرو، دیگری پارکینگ پولی و مشروط به رزرو قبلی. ظرفیت قطعی ثبت نشده است.',
   null, false, true, 'conflict', true),
  ('MAINTENANCE','issue_ac','Air conditioning','کولر / سرمایش',
   'In-stay fault report. Not a sold extra.',
   'گزارش خرابی در طول اقامت. خدمت فروشی نیست.',
   null, true, true, 'operational', true),
  ('MAINTENANCE','issue_plumbing','Plumbing','لوله‌کشی',
   'In-stay fault report.',
   'گزارش خرابی در طول اقامت.',
   null, true, true, 'operational', true),
  ('MAINTENANCE','issue_electrical','Electrical','برق',
   'In-stay fault report.',
   'گزارش خرابی در طول اقامت.',
   null, true, true, 'operational', true),
  ('MAINTENANCE','issue_tv','Television','تلویزیون',
   'In-stay fault report.',
   'گزارش خرابی در طول اقامت.',
   null, true, true, 'operational', true),
  ('MAINTENANCE','issue_internet','Internet','اینترنت',
   'In-stay fault report.',
   'گزارش خرابی در طول اقامت.',
   null, true, true, 'operational', true),
  ('MAINTENANCE','issue_other','Other issue','مشکل دیگر',
   'In-stay fault report.',
   'گزارش خرابی در طول اقامت.',
   null, true, true, 'operational', true),
  ('FRONT','wakeup','Wake-up call','تماس بیدارباش',
   'Listed among services on a tourism platform. Time is required in the note.',
   'در یک سکوی گردشگری جزو خدمات آمده است. ساعت را در یادداشت بنویسید.',
   null, true, true, 'third_party', true),
  ('FRONT','taxi','Taxi request','درخواست تاکسی',
   'Taxi service is listed by several sources. Fare is not a published hotel tariff.',
   'تاکسی‌سرویس در چند منبع آمده است. کرایه تعرفه منتشرشده هتل نیست.',
   null, false, true, 'third_party', true),
  ('FRONT','special_request','Special request','درخواست خاص',
   'Configurable front-desk request.',
   'درخواست قابل تنظیم پذیرش.',
   null, false, true, 'operational', true)
on conflict (code) do nothing;

insert into hotel_facts (key, value_en, value_fa, source, source_url, retrieved_at, verification_status, notes) values
  ('name','Sepehr Apartment Hotel','هتل آپارتمان سپهر','Melal Group','http://melalgroup.com/index.php/sepehr-apartment-hotel/','2026-09-28','group_site',null),
  ('phone','+98 21 2224 5050','+۹۸ ۲۱ ۲۲۲۴ ۵۰۵۰','Melal Group and Booking.ir','http://melalgroup.com/index.php/sepehr-apartment-hotel/','2026-09-28','group_site','Also printed by booking.ir as +982122245050.'),
  ('units','40','۴۰','Melal Group','http://melalgroup.com/index.php/sepehr-apartment-hotel/','2026-09-28','group_site','Repeated by Eghamat24, Booking.ir, Iran Hotel Online, FlyToday, Hotelyaban.'),
  ('floors','5','۵','Eghamat24 / Booking.ir / Iran Hotel Online','https://www.eghamat24.com/TehranHotels/SepehrHotel.html','2026-09-28','third_party','Not stated on the Melal Group page retrieved the same day.'),
  ('opened','2006 (1385)','۱۳۸۵','Melal Group narrative via Iranian listings; group page does not print the year','https://www.booking.ir/hotel/tehran-sepehr-2117855/','2026-09-28','third_party','Renovated 2017 (1396) according to the same listings. Not on the group page excerpt.'),
  ('group','Described as part of Melal hotels','جزو گروه هتل‌های ملل توصیف شده','Iran Hotel Online','https://www.iranhotelonline.com/tehran-hotels/%D9%87%D8%AA%D9%84-%D8%A2%D9%BE%D8%A7%D8%B1%D8%AA%D9%85%D8%A7%D9%86-%D8%B3%D9%BE%D9%87%D8%B1/','2026-09-28','third_party','The group site itself hosts a Sepehr page.')
on conflict (key) do nothing;

insert into hotel_settings (key, value, verification_status, notes) values
  ('check_in_time','14:00','third_party','Hotelyaban and Eghamat24. Not on the Melal Group page.'),
  ('check_out_time','12:00','third_party','Hotelyaban and Eghamat24. Not on the Melal Group page.'),
  ('timezone','Asia/Tehran','operational',null),
  ('currency','IRT','operational','Amounts are integer toman (IRT), the unit used on Iranian listings. 1 toman = 10 rials. Official tariff was not published.'),
  ('tax_bps','0','operational','No hotel tax rate was verified. Accounting can set basis points. 100 bps = 1 percent.'),
  ('pending_hold_minutes','30','operational','Unconfirmed requests hold inventory only until this lazy expiry.'),
  ('extension_auto_approve','false','operational','Hotel approval rule was not published. Default requires reception.'),
  ('breakfast_hours','','unverified','Complimentary buffet is described. Hours were not published. Do not invent them.'),
  ('coffee_hours','','unverified','Coffee shop exists on the group page. Hours were not published.'),
  ('announcement_en','','operational',null),
  ('announcement_fa','','operational',null),
  ('bootstrap_admin','','operational','Set to the first user id that claims hotel admin. Empty until then.'),
  ('address_en','No. 11, Salour Alley, after Dr. Hesabi intersection, Fereshteh Street, Tehran, Iran','group_site','Melal Group: No.11, Saloor St. After Hasabi Intersection. Fereshteh St. Bosnia-Herzegovina street is used by Iran Hotel Online and matches the neighbourhood. Some listings say Valiasr / Shahid Fayyazi (the renamed Fereshteh street) and one directory says Salour 2.'),
  ('address_fa','تهران، خیابان فرشته، خیابان بوسنی و هرزگوین، چهارراه دکتر حسابی، کوچه سالور، پلاک ۱۱','conflict_documented','See address_en notes. Not silently reduced to one unofficial variant.'),
  ('star_rating','','conflict','Several booking sites say 2-star. Behtarino calls it four-star and the group page uses luxury boutique language. No rating is shown as fact.')
on conflict (key) do nothing;

insert into hotel_policies (code, title_en, title_fa, body_en, body_fa, verification_status, source_url) values
  ('checkin','Check-in and check-out','ورود و خروج',
   'Third-party listings state check-in 14:00 and check-out 12:00. These times are configurable settings, not a rule copied from an official policy page. The group site did not print them.',
   'سایت‌های رزرو ساعت ورود ۱۴:۰۰ و خروج ۱۲:۰۰ را نوشته‌اند. این ساعت‌ها تنظیم عملیاتی‌اند، نه متن یک صفحه رسمی سیاست. در صفحه گروه هتل دیده نشدند.',
   'third_party','https://www.eghamat24.com/TehranHotels/SepehrHotel.html'),
  ('breakfast','Breakfast','صبحانه',
   'The Melal Group page says complimentary international cuisine buffet breakfast is provided. Hours were not published, so none are shown.',
   'صفحه گروه ملل می‌گوید صبحانه بوفه بین‌المللی رایگان ارائه می‌شود. ساعت سرو منتشر نشده و بنابراین نمایش داده نمی‌شود.',
   'group_site','http://melalgroup.com/index.php/sepehr-apartment-hotel/'),
  ('parking','Parking','پارکینگ',
   'Sources disagree. Eghamat24 says parking must be reserved before arrival, is paid, and depends on capacity. 1stQuest says a free lot of about four vehicles. This system does not assert a capacity. Guests can request parking; staff record the decision.',
   'منابع هم‌خوان نیستند. اقامت۲۴ می‌گوید پارکینگ باید قبل از ورود رزرو شود، پولی است و به ظرفیت بستگی دارد. فرست‌کوئست از پارکینگ رایگان حدود چهار خودرو نوشته است. این سامانه ظرفیتی را قطعی اعلام نمی‌کند.',
   'conflict','https://www.eghamat24.com/TehranHotels/SepehrHotel.html'),
  ('rates','Rates','نرخ‌ها',
   'No official tariff was published on the group page. Third-party prices change and conflict, so they are not loaded as the rate charged. A request stays pending until reception confirms a nightly rate.',
   'تعرفه رسمی در صفحه گروه منتشر نشده است. قیمت سایت‌های واسط تغییر می‌کند و متعارض است و به‌عنوان نرخ قابل‌وصول بارگذاری نشده. درخواست تا تأیید نرخ شبانه توسط پذیرش در وضعیت در انتظار می‌ماند.',
   'unpublished',null),
  ('photos','Photographs','تصاویر',
   'Public listing photographs were not copied into this system. Image licences were not verified. Staff can attach a URL only when the hotel has the right to use it. Empty categories are not stock photos of another property.',
   'عکس آگهی‌های عمومی در این سامانه کپی نشده است. مجوز تصاویر تأیید نشده. کارکنان فقط وقتی نشانی تصویر را ثبت کنند که هتل حق استفاده داشته باشد. دسته خالی با عکس آماده هتل دیگر پر نمی‌شود.',
   'operational',null),
  ('privacy','Guest data','اطلاعات مهمان',
   'Identity document numbers are not stored in full. Optional document type and last four characters can be kept for the stay. Staff outside the guest’s own account cannot read another guest’s folio.',
   'شماره کامل مدرک هویتی ذخیره نمی‌شود. نوع مدرک و چهار رقم آخر در صورت نیاز اقامت قابل ثبت است. کارکنان خارج از حساب خود مهمان به صورتحساب مهمان دیگر دسترسی ندارند.',
   'operational',null)
on conflict (code) do nothing;

insert into hotel_media (category, title_en, title_fa, url, verification_status, sort_order)
select c.category, c.title_en, c.title_fa, null, 'missing_license_not_copied', c.sort_order
from (values
  ('exterior','Exterior','نمای بیرونی',1),
  ('lobby','Lobby','لابی',2),
  ('rooms','Rooms','اتاق‌ها',3),
  ('apartments','Apartments','آپارتمان‌ها',4),
  ('suites','Suites','سوئیت‌ها',5),
  ('bathroom','Bathroom','سرویس بهداشتی',6),
  ('breakfast','Breakfast','صبحانه',7),
  ('coffee','Coffee shop','کافی‌شاپ',8),
  ('facilities','Facilities','امکانات',9),
  ('gallery','Gallery','گالری',10)
) as c(category, title_en, title_fa, sort_order)
where not exists (select 1 from hotel_media m where m.category = c.category);
