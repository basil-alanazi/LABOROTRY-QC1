-- Lets staff be displayed in a custom order (e.g. the order from your
-- original paper schedule) instead of always sorting alphabetically.
alter table staff_members add column if not exists sort_order integer;

-- Give existing rows a starting order based on their current alphabetical
-- position, so nothing breaks for people who don't reorder anything.
with ordered as (
  select id, row_number() over (order by full_name) as rn
  from staff_members
)
update staff_members
set sort_order = ordered.rn
from ordered
where staff_members.id = ordered.id and staff_members.sort_order is null;
