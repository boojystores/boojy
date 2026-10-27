# Deduct stock only on payment confirmation

Supersedes: [ADR-0002](0002-immediate-stock-deduction.md)

## Context
Under the initial record-only order flow (ADR-0002), stock was deducted at `pending` order creation. With online payment gateways (Bachs.io), customers initiate checkout to open the payment gateway. If a customer abandons the gateway, closes the tab, or payment fails, stock was already decremented and lost until manual administrative intervention.

## Decision
1. Stock availability is re-validated at checkout creation to prevent ordering out-of-stock items, but **stock is NOT deducted** upon creating a `pending` order.
2. Orders maintain a `stock_deducted` boolean flag (defaults to `false`).
3. Stock is deducted atomically inside the transaction only when payment is verified and confirmed (`confirm_bachs_payment`) or when an administrator moves the order to `confirmed`.
4. Cancelling an order only restores stock if `stock_deducted` was true. Abandoned or failed unpaid checkouts leave store inventory completely untouched.
