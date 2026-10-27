import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { PaymentMethod } from "@/features/checkout/lib/checkout";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cod: "Cash on delivery",
  ewallet: "Instant Transfer / E-Wallet",
  bank_transfer: "Direct Bank Transfer",
  bachs: "Card & Bank Transfer",
};

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 9.5,
    fontFamily: "Helvetica",
    color: "#1a1714",
    backgroundColor: "#ffffff",
  },
  header: {
    marginBottom: 20,
    borderBottomWidth: 1.5,
    borderBottomColor: "#1a1714",
    borderBottomStyle: "solid",
    paddingBottom: 14,
  },
  logo: {
    width: 120,
    height: 37,
    marginBottom: 6,
    objectFit: "contain",
  },
  tagline: {
    fontSize: 9,
    color: "#6b6560",
    letterSpacing: 0.3,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#9c9590",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  orderNumber: {
    fontSize: 13,
    fontWeight: "bold",
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 5,
    width: "100%",
  },
  label: {
    color: "#6b6560",
    fontSize: 9.5,
    width: "30%",
    paddingRight: 6,
  },
  value: {
    fontWeight: "bold",
    fontSize: 9.5,
    width: "70%",
    textAlign: "right",
    lineHeight: 1.35,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e8e4de",
    borderBottomStyle: "solid",
    paddingBottom: 6,
    marginBottom: 8,
    fontWeight: "bold",
    fontSize: 8,
    color: "#9c9590",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    width: "100%",
    alignItems: "center",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#f0ece6",
    borderBottomStyle: "solid",
    alignItems: "flex-start",
    width: "100%",
  },
  colName: {
    width: "46%",
    paddingRight: 8,
  },
  colNameText: {
    fontSize: 9.5,
    color: "#1a1714",
    lineHeight: 1.3,
  },
  colSizeText: {
    fontSize: 8,
    color: "#6b6560",
    marginTop: 2,
  },
  colQty: {
    width: "14%",
    textAlign: "center",
    fontSize: 9.5,
  },
  colPrice: {
    width: "20%",
    textAlign: "right",
    fontSize: 9.5,
    paddingRight: 4,
  },
  colTotal: {
    width: "20%",
    textAlign: "right",
    fontSize: 9.5,
    fontWeight: "bold",
  },
  shippingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 8,
    width: "100%",
  },
  shippingLabel: {
    color: "#6b6560",
    fontSize: 9.5,
    width: "70%",
    paddingRight: 8,
    lineHeight: 1.35,
  },
  shippingValue: {
    fontWeight: "bold",
    fontSize: 9.5,
    width: "30%",
    textAlign: "right",
  },
  totalSection: {
    marginTop: 14,
    borderTopWidth: 1.5,
    borderTopColor: "#1a1714",
    borderTopStyle: "solid",
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  totalValue: {
    fontSize: 13,
    fontWeight: "bold",
    textAlign: "right",
  },
  footer: {
    marginTop: 32,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f0ece6",
    borderTopStyle: "solid",
    textAlign: "center",
    color: "#9c9590",
    fontSize: 8.5,
    lineHeight: 1.4,
    width: "100%",
  },
});

export type ReceiptData = {
  orderNumber: string;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  deliveryAddress: string;
  customerName: string;
  createdAt?: string;
  items: { name: string; quantity: number; unitPrice: number; size?: string }[];
  logoUrl?: string;
  shippingFee?: number;
  shippingMethodName?: string;
};

const priceFmt = (n: number) =>
  `NGN ${new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)}`;

const dateFmt = (iso?: string) => {
  if (!iso)
    return new Date().toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

export function ReceiptDocument({ data }: { data: ReceiptData }) {
  const logoSrc =
    data.logoUrl ||
    (typeof window !== "undefined"
      ? `${window.location.origin}/boojy-dark.png`
      : "/boojy-dark.png");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image component for PDF document */}
          <Image src={logoSrc} style={styles.logo} />
          <Text style={styles.tagline}>
            ... the limitless lifestyle
          </Text>
        </View>

        {/* Order Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Details</Text>
          <Text style={styles.orderNumber}>{data.orderNumber}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Date</Text>
            <Text style={styles.value}>{dateFmt(data.createdAt)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Payment</Text>
            <Text style={styles.value}>
              {PAYMENT_LABELS[data.paymentMethod]}
            </Text>
          </View>
        </View>

        {/* Customer */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Name</Text>
            <Text style={styles.value}>{data.customerName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Delivery address</Text>
            <Text style={styles.value}>{data.deliveryAddress}</Text>
          </View>
        </View>

        {/* Items Table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items</Text>
          <View style={styles.tableHeader}>
            <Text style={styles.colName}>Product</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colPrice}>Unit Price</Text>
            <Text style={styles.colTotal}>Total</Text>
          </View>
          {data.items.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <View style={styles.colName}>
                <Text style={styles.colNameText}>{item.name}</Text>
                {item.size ? (
                  <Text style={styles.colSizeText}>
                    Size: {item.size}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.colQty}>{item.quantity}</Text>
              <Text style={styles.colPrice}>{priceFmt(item.unitPrice)}</Text>
              <Text style={styles.colTotal}>
                {priceFmt(item.unitPrice * item.quantity)}
              </Text>
            </View>
          ))}
        </View>

        {data.shippingFee !== undefined && (
          <View style={styles.shippingRow}>
            <Text style={styles.shippingLabel}>
              Delivery ({data.shippingMethodName || "Shipping"}):
            </Text>
            <Text style={styles.shippingValue}>
              {data.shippingFee === 0 ? "FREE" : priceFmt(data.shippingFee)}
            </Text>
          </View>
        )}

        {/* Total */}
        <View style={styles.totalSection}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{priceFmt(data.totalAmount)}</Text>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          Thank you for your purchase! If you have any questions, contact us at
          boojystores@gmail.com
        </Text>
      </Page>
    </Document>
  );
}
