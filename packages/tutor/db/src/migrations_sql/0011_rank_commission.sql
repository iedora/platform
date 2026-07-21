-- Generated from 0011_rank_commission.ts — faithful SQL capture. Do not edit by hand.

alter table "rank" rename column "multiplier" to "commission_rate";

update "rank" set "commission_rate" = 0.2 where "tier" = 'bronze';

update "rank" set "commission_rate" = 0.18 where "tier" = 'silver';

update "rank" set "commission_rate" = 0.16 where "tier" = 'gold';

update "rank" set "commission_rate" = 0.14 where "tier" = 'platinum';

update "rank" set "commission_rate" = 0.12 where "tier" = 'elite';
