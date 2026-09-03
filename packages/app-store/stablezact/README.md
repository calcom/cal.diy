# Stablezact Payment Integration

Accept cryptocurrency payments for your Cal.com bookings with Stablezact. Support for USDT and USDC stablecoins across 8 EVM blockchains.

## Features

- 🔐 **Direct to Wallet** - Payments go directly to your wallet via smart contracts, no intermediaries
- ⛓️ **Multi-Chain Support** - Ethereum, BSC, Polygon, Arbitrum, Optimism, Avalanche, Celo, Base
- 💰 **Stablecoins Only** - USDT and USDC supported across 8 EVM networks
- 🚀 **Instant Settlement** - Funds arrive after blockchain confirmation (typically 1-5 minutes)
- 💵 **Competitive Fees** - 1.5% per transaction with automatic smart contract splitting
- 🔄 **Non-Custodial** - You maintain full control of your funds
- 📊 **Real-time Monitoring** - Track transactions on blockchain explorers

## Installation

### 1. Get Stablezact Public Key

1. Sign up at [https://merchant.stablezact.com](https://merchant.stablezact.com)
2. Go to Settings page at [https://merchant.stablezact.com/settings](https://merchant.stablezact.com/settings)
3. Copy your public key (starts with `pk_`)
4. Your public key is safe to store in Cal.com as it's read-only

### 2. **IMPORTANT: Configure Merchant Wallets First**

⚠️ **Before installing in Cal.com**, you must configure your wallet addresses in the Stablezact dashboard:

1. Go to [https://merchant.stablezact.com/dashboard/wallets](https://merchant.stablezact.com/dashboard/wallets)
2. Add wallet addresses for each blockchain you want to support:
   - Ethereum (ETH)
   - BSC (Binance Smart Chain)
   - Polygon (MATIC)
   - Arbitrum, Optimism, Avalanche, Celo, Base
3. Ensure you control these wallet addresses (use MetaMask, Ledger, or hardware wallet)

**Note:** Wallet addresses are configured in your Stablezact merchant account, NOT during Cal.com installation. The Stablezact backend automatically uses the correct wallet based on the blockchain network selected by your customers.

### 3. Configure Environment Variables (Optional - Self-Hosting Only)

If self-hosting Cal.com and want to use a custom Stablezact API URL, add to your `.env.appStore`:

```bash
# Production (default)
STABLEZACT_API_URL=https://hub.stablezact.com
NEXT_PUBLIC_STABLEZACT_API_URL=https://hub.stablezact.com

# Staging environment (uncomment to use instead)
# STABLEZACT_API_URL=https://talented-mercy-production.up.railway.app
# NEXT_PUBLIC_STABLEZACT_API_URL=https://talented-mercy-production.up.railway.app
```

**Note:** The public key is entered during installation in Step 4, not in environment variables.

### 4. Install in Cal.com

1. Go to Cal.com App Store → Payment Apps
2. Find "Stablezact Crypto Payments"
3. Click "Install"
4. Enter your **Public Key** (from Step 1)
5. Click "Connect Stablezact"

The integration will automatically use the wallet addresses you configured in Step 2.

### 5. Configure on Event Types

1. Go to Event Types → Select an event
2. Scroll to "Apps" section
3. Enable Stablezact
4. Configure:
   - Price (in USD)
   - Preferred cryptocurrency (USDT, USDC, etc.)
   - Blockchain network
   - Allow customer network/currency selection
   - Payment timeout
   - Refund policy
   - No-show fee settings

## How It Works

### Payment Flow

1. **Customer Books Event**
   - Selects event type with Stablezact payment enabled
   - Fills booking details

2. **Payment Created**
   - Stablezact generates payment intent
   - Customer redirected to Stablezact payment page
   - Displays QR code and wallet address

3. **Customer Pays**
   - Scans QR code or sends from wallet
   - Transaction submitted to blockchain
   - Real-time confirmation tracking

4. **Payment Confirmed**
   - Blockchain confirms transaction (typically 1-5 minutes)
   - Webhook notifies Cal.com
   - Booking status updated to "Accepted"
   - Confirmation email sent

### Webhook Events

Stablezact sends webhooks for:

- `payment.pending` - Transaction submitted to blockchain
- `payment.confirmed` - Transaction confirmed (1+ blocks)
- `payment.failed` - Transaction failed or expired
- `payment.refunded` - Refund processed

### Refunds

Automated blockchain refunds when:

- Booking cancelled within refund window
- Event cancelled by organizer
- Manual refund initiated from dashboard

Refunds are sent back to the same wallet that made the original payment.

## Configuration Options

### Event Type Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Price | Amount to charge (USD equivalent) | Required |
| Currency | Stablecoin (USDT or USDC) | USDT |
| Network | Blockchain network | Ethereum |
| Allow Network Selection | Let customers choose blockchain | Yes |
| Allow Currency Selection | Let customers choose token | Yes |
| Payment Timeout | Minutes to complete payment | 30 |
| Fee Charged To | Customer or Merchant | Customer |
| Refund Days | Days after booking for refunds | 7 |
| No-show Fee | Auto-charge if cancelled late | No |

### Supported Networks

- **Ethereum** (ETH) - Most popular, higher gas fees
- **BSC** (Binance Smart Chain) - Low fees, fast
- **Polygon** (MATIC) - Very low fees, fast
- **Arbitrum** (ARB) - Low fees, Ethereum L2
- **Optimism** (OP) - Low fees, Ethereum L2
- **Avalanche** (AVAX) - Fast, low fees
- **Celo** (CELO) - Mobile-first, very low fees
- **Base** (BASE) - Coinbase L2, low fees

### Supported Currencies

- **USDT** (Tether) - Most widely used stablecoin, available on all 8 EVM networks
- **USDC** (USD Coin) - Circle-backed stablecoin, available on all 8 EVM networks

**Note:** Only stablecoins are supported to eliminate price volatility. Native tokens (ETH, BNB, MATIC) are not supported.

## Security

- ✅ API credentials stored encrypted in database
- ✅ Webhook signatures verified using HMAC-SHA256
- ✅ Payments sent directly to your wallet (non-custodial)
- ✅ No access to your private keys
- ✅ Read-only API integration

## Troubleshooting

### Webhook Not Received

1. Check webhook URL is publicly accessible
2. Verify `STABLEZACT_WEBHOOK_SECRET` matches dashboard setting
3. Check firewall allows incoming requests
4. Review webhook logs in Stablezact dashboard

### Payment Not Confirming

1. Check transaction hash on blockchain explorer
2. Verify sufficient confirmations (varies by network)
3. Ensure wallet address is correct
4. Check network congestion/gas prices

### Refund Failed

1. Verify sufficient balance in merchant wallet
2. Check gas fees available
3. Ensure refund wallet address is valid
4. Review refund transaction on blockchain

## Support

- **Documentation**: [https://docs.stablezact.com](https://docs.stablezact.com)
- **Support Email**: info@stablezact.com
- **Status Page**: [https://status.stablezact.com](https://status.stablezact.com)

## License

This integration is part of Cal.com and follows the Cal.com license.
Stablezact service is provided by Stablezact Labs, Inc.
