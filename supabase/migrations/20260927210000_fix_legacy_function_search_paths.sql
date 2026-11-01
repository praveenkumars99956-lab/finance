alter function public.apply_daily_payment_to_schedule(bigint, numeric, date)
  set search_path = public;
alter function public.generate_daily_schedule(bigint)
  set search_path = public;
alter function public.generate_monthly_schedule(bigint)
  set search_path = public;
alter function public.generate_weekly_schedule(bigint)
  set search_path = public;
alter function public.record_daily_payment(bigint, numeric, date)
  set search_path = public;
alter function public.record_monthly_payment(bigint, numeric, date)
  set search_path = public;
alter function public.record_weekly_payment(bigint, numeric, date)
  set search_path = public;