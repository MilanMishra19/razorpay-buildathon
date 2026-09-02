import type { PaymentMandate } from './types';

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

export interface CheckoutResult {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (response: unknown) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error('Could not load Razorpay Checkout — check the network.'));
    };
    document.body.appendChild(script);
  });
  return loading;
}

export class CheckoutDismissed extends Error {
  constructor() {
    super('Checkout was closed before the payment completed.');
  }
}

export async function openCheckout(payment: PaymentMandate, email: string): Promise<CheckoutResult> {
  if (!payment.razorpay_key_id || !payment.razorpay_order_id) {
    throw new Error('This payment has no Razorpay order to complete.');
  }

  await loadScript();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error('Razorpay Checkout is unavailable.');

  return new Promise<CheckoutResult>((resolve, reject) => {
    let settled = false;

    const checkout = new Razorpay({
      key: payment.razorpay_key_id,
      order_id: payment.razorpay_order_id,
      amount: Math.round(payment.amount * 100),
      currency: 'INR',
      name: 'Aethis',
      description: `Cart #${payment.cart_mandate_id}`,
      prefill: { email },
      theme: { color: '#4a2d8c' },
      handler: (response: CheckoutResult) => {
        settled = true;
        resolve(response);
      },
      modal: {
        ondismiss: () => {
          if (!settled) reject(new CheckoutDismissed());
        },
      },
    } as Record<string, unknown>);

    checkout.on('payment.failed', (response) => {
      settled = true;
      const description = (response as { error?: { description?: string } })?.error?.description;
      reject(new Error(description ?? 'Razorpay reported the payment failed.'));
    });

    checkout.open();
  });
}
