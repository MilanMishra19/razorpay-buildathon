import { useState } from 'react';
import { api, post } from '../api/client';
import { CheckoutDismissed, openCheckout } from '../api/razorpay';
import type { PaymentMandate } from '../api/types';
import { Button, Empty, Icon, Notice, Panel, money } from './ui';

interface Props {
  payments: PaymentMandate[];
  token: string;
  email: string;
  onSettled: () => void;
}

export function AwaitingCheckout({ payments, token, email, onSettled }: Props) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settled, setSettled] = useState<string | null>(null);

  async function complete(payment: PaymentMandate) {
    setBusy(payment.payment_mandate_id);
    setError(null);
    setSettled(null);
    try {
      const result = await openCheckout(payment, email);
      const confirmed = await api.checkout<PaymentMandate>(
        `/payment-mandates/${payment.payment_mandate_id}/confirm`,
        token,
        post({
          razorpay_order_id: result.razorpay_order_id,
          razorpay_payment_id: result.razorpay_payment_id,
          razorpay_signature: result.razorpay_signature,
        }),
      );
      if (confirmed.payment_status === 'paid') {
        setSettled(`Payment ${confirmed.razorpay_payment_id} verified and settled.`);
      } else {
        setError('Razorpay returned a signature the server could not verify. Nothing was settled.');
      }
      onSettled();
    } catch (err) {
      if (!(err instanceof CheckoutDismissed)) setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (payments.length === 0) return null;

  return (
    <Panel
      tone="warn"
      title="AWAITING CHECKOUT"
      actions={
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)' }}>
          {payments.length} order{payments.length === 1 ? '' : 's'} created, not yet paid
        </span>
      }
    >
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--ink-dim)' }}>
          The agent created a real Razorpay order, but an order is not a payment. Money only moves when checkout
          completes and the server verifies Razorpay&rsquo;s signature — until then this spend does not count against
          the budget.
        </p>

        {error && <Notice tone="bad">{error}</Notice>}
        {settled && <Notice tone="ok">{settled}</Notice>}

        {payments.length === 0 ? (
          <Empty>Nothing awaiting checkout.</Empty>
        ) : (
          payments.map((payment) => (
            <div
              key={payment.payment_mandate_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '12px 0',
                borderTop: '1px solid var(--line)',
              }}
            >
              <span className="mono" style={{ fontSize: 13, color: 'var(--ink-2)', width: 110 }}>
                {money(payment.amount)}
              </span>
              <span className="mono" style={{ flexGrow: 1, fontSize: 11, color: 'var(--ink-faint)' }}>
                cart #{payment.cart_mandate_id} · {payment.razorpay_order_id}
              </span>
              <Button
                variant="primary"
                onClick={() => complete(payment)}
                disabled={busy === payment.payment_mandate_id}
              >
                {Icon.shield('#fff')}
                {busy === payment.payment_mandate_id ? 'IN CHECKOUT…' : 'COMPLETE PAYMENT'}
              </Button>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
