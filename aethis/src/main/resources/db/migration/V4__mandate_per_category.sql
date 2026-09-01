drop index one_active_mandate_per_user;

create unique index one_active_mandate_per_category
    on intent_mandates (user_id, category)
    where status = 'ACTIVE';
