-- "The Onion Skin Journal" was mistakenly created as a brand-new client
-- during the lifetime invoice load; it's actually Vanessa Root's business
-- (same pattern as Alek Anuzis -> Seven Figure Agency and Josh Nelson/
-- Justin Simmons -> Seven Figure Agency) — her client record already has
-- "Onion Skin Journal" as its business name. This moves her 2 invoices and
-- 2 payments ($1,319 invoiced / ₹1,20,597 collected) onto her real client
-- record, then deletes the duplicate. Confirmed before running: the
-- duplicate has no team assignments, projects, or payout splits to migrate.

update invoices
set client_id = 'ad7f6fe5-61d2-4f46-b1ae-bee0c90d6005'
where client_id = '7171c807-ce9f-4c6b-8861-280efbd60503';

update payments
set client_id = 'ad7f6fe5-61d2-4f46-b1ae-bee0c90d6005'
where client_id = '7171c807-ce9f-4c6b-8861-280efbd60503';

delete from clients
where id = '7171c807-ce9f-4c6b-8861-280efbd60503';
