// HitPay serves the Drop-In iframe (/hitpay-iframe.html) from the base domain,
// while payment request URLs live on a checkout subdomain: `securecheckout.`
// for Checkout V1 and `checkout.` for Checkout V2 (including their
// `*.sandbox.hit-pay.com` equivalents). The subdomain must be stripped to
// build a valid iframe URL for either checkout version.
export function getCheckoutIframeDomain(paymentUrl: string): string | undefined {
  try {
    const { hostname } = new URL(paymentUrl);
    return hostname.replace(/^(securecheckout|checkout)\./, "");
  } catch {
    return undefined;
  }
}
