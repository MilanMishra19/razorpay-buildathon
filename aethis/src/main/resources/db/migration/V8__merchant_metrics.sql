ALTER TABLE cart_mandates
    ADD COLUMN is_demo boolean NOT NULL DEFAULT false,
    ADD COLUMN replay_count integer NOT NULL DEFAULT 0;

ALTER TABLE payment_mandates
    ADD COLUMN is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX idx_cart_mandates_is_demo ON cart_mandates (is_demo);
CREATE INDEX idx_payment_mandates_is_demo ON payment_mandates (is_demo);

COMMENT ON COLUMN cart_mandates.is_demo IS
    'Seeded merchant-analytics history. Never mixed into a real buyer''s screens, and badged wherever it is counted.';
COMMENT ON COLUMN cart_mandates.replay_count IS
    'How many times an idempotency key replayed this cart instead of creating a duplicate.';
