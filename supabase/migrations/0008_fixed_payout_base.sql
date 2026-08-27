-- Per-client fixed monthly payout base + excess rule.
--
-- Some clients (e.g. weekly-billed retainers) have founder payout calculated
-- off a fixed monthly figure rather than the real invoiced total for that
-- month — whatever's actually billed above that fixed base goes 100% to the
-- client's Sales owner, bypassing the 10/50/32/8 split and ESQUE entirely.
-- This is a different, simpler mechanism than the existing Foundation
-- Account pairing rule (0006) — a client uses one or the other, not both.

alter table clients
  add column fixed_payout_base_usd_cents bigint
    check (fixed_payout_base_usd_cents is null or fixed_payout_base_usd_cents >= 0);

alter type payout_share_category add value 'client_excess';
