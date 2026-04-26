alter table public.profiles
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists location_updated_at timestamptz;

alter table public.profiles
  add constraint profiles_latitude_range
    check (latitude is null or (latitude >= -90 and latitude <= 90)) not valid,
  add constraint profiles_longitude_range
    check (longitude is null or (longitude >= -180 and longitude <= 180)) not valid;

create index if not exists profiles_discoverable_location_idx
  on public.profiles (latitude, longitude)
  where is_discoverable = true
    and latitude is not null
    and longitude is not null;
