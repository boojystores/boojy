"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  ChevronLeft,
  Download,
  Loader2,
  MapPin,
  Package,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Store,
  Truck,
  X,
} from "lucide-react";
import { cartCount, cartSubtotal, useCartStore, type CartItem } from "@/features/cart/lib/cart";
import { useCartReconcile } from "@/features/cart/lib/use-cart-reconcile";
import { type PaymentMethod } from "@/features/checkout/lib/checkout";
import { type PaymentMethodConfig } from "@/features/checkout/lib/payment-methods";
import { submitCheckout, type CheckoutActionResponse } from "@/features/checkout/actions";
import { navigateToPaymentGateway } from "@/features/checkout/lib/navigation";
import { downloadReceipt } from "@/features/tracking/lib/download-receipt";
import { NigeriaAddressFields, type AddressData } from "@/features/shipping/components/nigeria-address-fields";
import { calculateShippingOptionsServer } from "@/features/shipping/actions";
import type { NigerianState, NigerianLga, DeliveryZone, ShippingOption, PickupLocation } from "@/features/shipping/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BoojyPreloader } from "@/components/boojy-preloader";
import { cn } from "@/lib/utils";
import { priceFormatter } from "@/lib/currency";

import { isValidEmail, isValidPhoneNumber, sanitizePhoneInput } from "@/features/checkout/lib/validation";

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; hint: string }[] = [
  { value: "bachs", label: "Card & Bank Transfer", hint: "Pay securely with Debit Card or Bank Transfer." },
  { value: "ewallet", label: "Instant Transfer / E-Wallet", hint: "Pay with OPay, PalmPay, or mobile wallet." },
  { value: "bank_transfer", label: "Direct Bank Transfer", hint: "Transfer directly to store account — details sent via email." },
];

type FormFields = {
  fullName: string;
  email: string;
  contactNumber: string;
  notes: string;
  paymentMethod: PaymentMethod;
};

const EMPTY_FORM: FormFields = {
  fullName: "",
  email: "",
  contactNumber: "",
  notes: "",
  paymentMethod: "bachs",
};

const EMPTY_ADDRESS: AddressData = {
  country: "Nigeria",
  stateId: "",
  stateName: "",
  lgaId: "",
  lgaName: "",
  deliveryZoneId: null,
  cityName: "",
  streetAddress: "",
  landmark: "",
  recipientName: "",
  recipientPhone: "",
  deliveryInstructions: "",
};

export function CheckoutView({
  initialPaymentMethods,
  initialStates = [],
  initialLgas = [],
  initialDeliveryZones = [],
  initialPickupLocations = [],
}: {
  initialPaymentMethods?: PaymentMethodConfig[];
  initialStates?: NigerianState[];
  initialLgas?: NigerianLga[];
  initialDeliveryZones?: DeliveryZone[];
  initialPickupLocations?: PickupLocation[];
} = {}) {
  const items = useCartStore((state) => state.items);
  const hasHydrated = useCartStore((state) => state.hasHydrated);
  const clearCart = useCartStore((state) => state.clearCart);
  useCartReconcile();
  const unavailableCount = items.filter((item) => item.unavailable).length;

  // iOS Safari / WebKit Private Browsing hydration failsafe
  // Ensures the checkout page NEVER hangs indefinitely on the loading preloader
  useEffect(() => {
    if (!hasHydrated) {
      if (typeof useCartStore.persist?.hasHydrated === "function" && useCartStore.persist.hasHydrated()) {
        useCartStore.getState().setHasHydrated(true);
      } else {
        const timer = setTimeout(() => {
          useCartStore.getState().setHasHydrated(true);
        }, 350);
        return () => clearTimeout(timer);
      }
    }
  }, [hasHydrated]);

  const availablePaymentMethods = useMemo(() => {
    if (initialPaymentMethods && initialPaymentMethods.length > 0) {
      return initialPaymentMethods.filter((m) => m.enabled);
    }
    return PAYMENT_OPTIONS.map((opt) => ({
      id: opt.value,
      name: opt.label,
      hint: opt.hint,
      badge: undefined as string | undefined,
      enabled: true,
    }));
  }, [initialPaymentMethods]);

  const [fields, setFields] = useState<FormFields>(() => ({
    ...EMPTY_FORM,
    paymentMethod: (availablePaymentMethods[0]?.id as PaymentMethod) || "bachs",
  }));

  const [address, setAddress] = useState<AddressData>(EMPTY_ADDRESS);
  const [addressErrors, setAddressErrors] = useState<Partial<Record<keyof AddressData, string>>>({});

  // Ensure active payment method is selected if default or previous was disabled
  useEffect(() => {
    if (availablePaymentMethods.length > 0) {
      const isValid = availablePaymentMethods.some((m) => m.id === fields.paymentMethod);
      if (!isValid) {
        setFields((prev) => ({
          ...prev,
          paymentMethod: availablePaymentMethods[0].id as PaymentMethod,
        }));
      }
    }
  }, [availablePaymentMethods, fields.paymentMethod]);

  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormFields, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CheckoutActionResponse | null>(null);

  // Delivery mode: "ship" (delivery) | "pickup" (store pickup)
  const [deliveryMode, setDeliveryMode] = useState<"ship" | "pickup">("ship");

  const PICKUP_OPTION: ShippingOption = useMemo(
    () => ({
      methodId: "pickup",
      methodName: "Store Pickup",
      methodType: "pickup",
      rateId: "rate-pickup",
      scope: "state",
      priceKobo: 0,
      priceNaira: 0,
      isFree: true,
      estimatedMinDays: 0,
      estimatedMaxDays: 1,
      description: "Collect in person from our designated pickup hub at zero shipping fee.",
    }),
    [],
  );

  // Selected Pickup Store (purely dynamic from admin/database)
  const [selectedStoreId, setSelectedStoreId] = useState<string>(
    initialPickupLocations[0]?.id || "",
  );
  const activePickupStore = useMemo(() => {
    return (
      initialPickupLocations.find((s) => s.id === selectedStoreId) ||
      initialPickupLocations[0] ||
      null
    );
  }, [initialPickupLocations, selectedStoreId]);

  // Dynamic Shipping Calculations
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<ShippingOption | null>(null);
  const [isLoadingShipping, setIsLoadingShipping] = useState(false);

  const [redirectSession, setRedirectSession] = useState<{
    orderId: string;
    checkoutUrl: string;
    orderNumber: string;
    totalAmount: number;
  } | null>(null);

  // Snapshot of what was ordered, captured before the cart is cleared.
  const [confirmation, setConfirmation] = useState<{
    orderNumber: string;
    totalAmount: number;
    count: number;
    lines: CartItem[];
    fullName: string;
    deliveryAddress: string;
    paymentMethod: PaymentMethod;
    shippingFee: number;
    shippingMethodName?: string;
  } | null>(null);

  const subtotal = cartSubtotal(items);
  const count = cartCount(items);

  // Real-time Shipping Calculation on destination change (for Ship mode)
  useEffect(() => {
    if (deliveryMode === "pickup") {
      setShippingOptions([]);
      setSelectedOption(PICKUP_OPTION);
      return;
    }

    if (!address.stateId) {
      setShippingOptions([]);
      setSelectedOption(null);
      return;
    }

    let active = true;
    setIsLoadingShipping(true);

    calculateShippingOptionsServer({
      stateId: address.stateId,
      lgaId: address.lgaId || undefined,
      deliveryZoneId: address.deliveryZoneId || undefined,
      subtotalKobo: Math.round(subtotal * 100),
    })
      .then((res) => {
        if (!active) return;
        const nonPickupOptions = res.options.filter((o) => o.methodType !== "pickup");
        if (!res.available || nonPickupOptions.length === 0) {
          setShippingOptions([]);
          setSelectedOption(null);
        } else {
          setShippingOptions(nonPickupOptions);
          // Preserve selection or select first delivery option
          setSelectedOption((prev) => {
            if (prev && nonPickupOptions.some((o) => o.methodId === prev.methodId)) {
              return nonPickupOptions.find((o) => o.methodId === prev.methodId)!;
            }
            return nonPickupOptions[0];
          });
        }
      })
      .catch((err) => {
        if (!active) return;
        console.error("Error calculating shipping:", err);
        setShippingOptions([]);
        setSelectedOption(null);
      })
      .finally(() => {
        if (active) setIsLoadingShipping(false);
      });

    return () => {
      active = false;
    };
  }, [address.stateId, address.lgaId, address.deliveryZoneId, subtotal, deliveryMode, PICKUP_OPTION]);

  const shippingFee = deliveryMode === "pickup" ? 0 : (selectedOption ? selectedOption.priceNaira : 0);
  const orderTotal = subtotal + shippingFee;

  const set = (key: keyof FormFields) => (value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    // Client-side pass
    const errors: Partial<Record<keyof FormFields, string>> = {};
    const addrErrors: Partial<Record<keyof AddressData, string>> = {};

    const effectiveName = (address.recipientName.trim() || fields.fullName.trim());
    const effectivePhone = (address.recipientPhone.trim() || fields.contactNumber.trim());

    if (!effectiveName) {
      addrErrors.recipientName = "Recipient full name is required.";
      errors.fullName = "Full name is required.";
    }
    if (!fields.email.trim()) {
      errors.email = "Email address is required.";
    } else if (!isValidEmail(fields.email)) {
      errors.email = "Enter a valid email address with a domain (e.g. name@example.com).";
    }
    if (!effectivePhone) {
      addrErrors.recipientPhone = "Contact phone number is required.";
      errors.contactNumber = "Contact number is required.";
    } else if (!isValidPhoneNumber(effectivePhone)) {
      addrErrors.recipientPhone = "Phone number must be numeric (e.g. 08012345678). Letters are not allowed.";
      errors.contactNumber = "Phone number must be numeric (e.g. 08012345678). Letters are not allowed.";
    }

    if (deliveryMode === "ship") {
      if (!address.stateId) {
        addrErrors.stateId = "Please select your state.";
      }
      if (!address.lgaId) {
        addrErrors.lgaId = "Please select your Local Government Area.";
      }
      if (!address.streetAddress.trim()) {
        addrErrors.streetAddress = "Street address is required.";
      }
    }

    if (Object.keys(errors).length > 0 || Object.keys(addrErrors).length > 0) {
      setFieldErrors(errors);
      setAddressErrors(addrErrors);
      return;
    }

    const chosenOption = deliveryMode === "pickup" ? PICKUP_OPTION : selectedOption;

    if (!chosenOption) {
      setResult({
        ok: false,
        code: "SHIPPING_UNAVAILABLE",
        message: "Delivery is currently unavailable for your selected location. Please contact support or select Pickup.",
      });
      return;
    }

    const lines = items.map((item) => ({
      productId: item.productId ?? item.id.split("::")[0],
      quantity: item.quantity,
      selectedSize: item.selected_size,
      productName: item.name,
    }));

    const sizeLines = items
      .filter((i) => i.selected_size)
      .map((i) => `${i.name} [Size: ${i.selected_size}] x${i.quantity}`)
      .join(", ");
    const userNotes = (address.deliveryInstructions || fields.notes).trim();
    const combinedNotes = sizeLines
      ? userNotes
        ? `${userNotes} | Sizes: ${sizeLines}`
        : `Sizes: ${sizeLines}`
      : userNotes || undefined;

    const streetWithLandmark = address.landmark?.trim()
      ? `${address.streetAddress.trim()} (Landmark: ${address.landmark.trim()})`
      : address.streetAddress.trim();

    const pickupName = activePickupStore?.name || "Store Pickup Hub";
    const pickupAddr = activePickupStore?.address || "Store Address";
    const pickupCity = activePickupStore?.city || "Store City";
    const pickupPhone = activePickupStore?.phone ? ` · Tel: ${activePickupStore.phone}` : "";
    const pickupLandmark = activePickupStore?.landmark ? ` (Landmark: ${activePickupStore.landmark})` : "";

    const formattedDeliveryAddress =
      deliveryMode === "pickup"
        ? `Store Pickup — ${pickupName}, ${pickupAddr}${pickupLandmark}, ${pickupCity}${pickupPhone}`
        : `${streetWithLandmark}, ${
            address.cityName ? address.cityName.trim() + ", " : ""
          }${address.lgaName ? address.lgaName + ", " : ""}${address.stateName || address.stateId}`;

    setSubmitting(true);
    setResult(null);
    try {
      const response = await submitCheckout({
        details: {
          fullName: effectiveName,
          email: fields.email.trim(),
          contactNumber: effectivePhone,
          deliveryAddress: formattedDeliveryAddress,
          paymentMethod: fields.paymentMethod,
          notes: combinedNotes,
          recipientName: effectiveName,
          recipientPhone: effectivePhone,
          stateId: deliveryMode === "pickup" ? undefined : address.stateId,
          stateName: deliveryMode === "pickup" ? "Store Pickup" : address.stateName,
          lgaId: deliveryMode === "pickup" ? undefined : address.lgaId,
          lgaName: deliveryMode === "pickup" ? pickupCity : address.lgaName,
          deliveryZoneId: deliveryMode === "pickup" ? undefined : address.deliveryZoneId,
          cityName: deliveryMode === "pickup" ? pickupCity : address.cityName,
          streetAddress:
            deliveryMode === "pickup"
              ? `${pickupName} — ${pickupAddr}`
              : address.streetAddress.trim(),
          landmark:
            deliveryMode === "pickup"
              ? activePickupStore?.landmark || undefined
              : address.landmark?.trim() || undefined,
          shippingMethodId: chosenOption.methodId,
          deliveryInstructions: userNotes || undefined,
        },
        items: lines,
      });

      if (response.ok) {
        if (response.checkoutUrl) {
          const targetUrl = response.checkoutUrl;
          const orderId = response.orderId;

          // Clear cart now that order is placed
          clearCart();

          // Persist order metadata in sessionStorage for seamless return or history recovery
          try {
            sessionStorage.setItem(
              "boojy_pending_order",
              JSON.stringify({
                orderNumber: response.orderNumber,
                orderId,
                totalAmount: response.totalAmount,
                checkoutUrl: targetUrl,
              }),
            );
          } catch {}

          // Display redirecting state immediately so user gets clear visual feedback
          setRedirectSession({
            orderId,
            checkoutUrl: targetUrl,
            orderNumber: response.orderNumber,
            totalAmount: response.totalAmount,
          });

          // Perform robust, same-origin server redirect bridge navigation
          navigateToPaymentGateway(targetUrl, orderId);
          return;
        }

        const snapshot = [...items];
        setConfirmation({
          orderNumber: response.orderNumber,
          totalAmount: response.totalAmount,
          count,
          lines: snapshot,
          fullName: effectiveName,
          deliveryAddress: formattedDeliveryAddress,
          paymentMethod: fields.paymentMethod,
          shippingFee: deliveryMode === "pickup" ? 0 : shippingFee,
          shippingMethodName: deliveryMode === "pickup" ? "Store Pickup" : chosenOption.methodName,
        });
        clearCart();
        return;
      }

      if (response.code === "VALIDATION" && response.field) {
        setFieldErrors((prev) => ({ ...prev, [response.field!]: response.message }));
      }
      setResult(response);
    } finally {
      setSubmitting(false);
    }
  }

  if (!hasHydrated) {
    return (
      <div className="flex min-h-[60vh] w-full items-center justify-center">
        <BoojyPreloader size="md" message="Loading checkout…" />
      </div>
    );
  }

  if (redirectSession) {
    return <PaymentGatewayHandoffView session={redirectSession} />;
  }

  return (
    <div className="site-container py-10 relative">
      {submitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-md">
          <BoojyPreloader size="lg" message="Connecting to secure payment…" />
        </div>
      )}
      <Link
        href="/cart"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to cart
      </Link>

      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-black dark:text-white">Checkout</h1>

      {items.length === 0 ? (
        <EmptyCheckout />
      ) : (
        <div className="mt-8 grid gap-6 sm:gap-8 lg:grid-cols-[1fr_380px]">
          {/* Left: guest details form */}
          <form onSubmit={handleSubmit} noValidate className="min-w-0 space-y-6">
            {/* 1. Contact / Email */}
            <section className="rounded-xl border border-border/50 bg-card/10 backdrop-blur-sm p-4 sm:p-5">
              <h2 className="text-base font-bold uppercase tracking-wider text-black dark:text-white">
                1. Contact Information
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                We will send your order confirmation and digital delivery tracking updates here.
              </p>
              <div className="mt-4">
                <Field label="Email Address" htmlFor="checkout-email" error={fieldErrors.email}>
                  <Input
                    id="checkout-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={fields.email}
                    onChange={(e) => set("email")(e.target.value)}
                    aria-invalid={Boolean(fieldErrors.email)}
                  />
                </Field>
              </div>
            </section>

            {/* 2. Delivery — Ship or Pickup */}
            <section className="rounded-xl border border-border/50 bg-card/10 backdrop-blur-sm p-4 sm:p-5 space-y-4">
              <div>
                <h2 className="text-base font-bold uppercase tracking-wider text-black dark:text-white">
                  2. Delivery
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choose how you would like to receive your order.
                </p>
              </div>

              {/* Segmented Pill Toggle - Matching User Reference */}
              <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-border/60 bg-muted/40 p-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setDeliveryMode("ship");
                    const shipOpt = shippingOptions.find((o) => o.methodType !== "pickup");
                    if (shipOpt) setSelectedOption(shipOpt);
                  }}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg py-2.5 px-4 text-sm font-semibold transition-all duration-200",
                    deliveryMode === "ship"
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/40",
                  )}
                >
                  <Package className="h-4 w-4" />
                  <span>Ship</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeliveryMode("pickup");
                    setSelectedOption(PICKUP_OPTION);
                    setAddressErrors({});
                  }}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg py-2.5 px-4 text-sm font-semibold transition-all duration-200",
                    deliveryMode === "pickup"
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/40",
                  )}
                >
                  <MapPin className="h-4 w-4" />
                  <span>Pickup</span>
                </button>
              </div>

              {/* IF DELIVERY (SHIP) IS CHOSEN */}
              {deliveryMode === "ship" && (
                <div className="space-y-4 pt-1">
                  <NigeriaAddressFields
                    states={initialStates}
                    lgas={initialLgas}
                    deliveryZones={initialDeliveryZones}
                    value={address}
                    onChange={(newAddress) => {
                      setAddress(newAddress);
                      if (newAddress.recipientName) {
                        set("fullName")(newAddress.recipientName);
                      }
                      if (newAddress.recipientPhone) {
                        set("contactNumber")(newAddress.recipientPhone);
                      }
                      setAddressErrors({});
                    }}
                    errors={addressErrors}
                  />
                </div>
              )}

              {/* IF STORE PICKUP IS CHOSEN */}
              {deliveryMode === "pickup" && (
                <div className="space-y-4 pt-1 animate-in fade-in-50 duration-200">
                  {/* Multiple or Single Store Location Display */}
                  {initialPickupLocations.length === 0 ? (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs sm:text-sm text-amber-700 dark:text-amber-400">
                      <p className="font-semibold">No Pickup Stores Currently Configured</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        In-store collection is not currently set up. Please select &quot;Ship&quot; above to have your order delivered to your address.
                      </p>
                    </div>
                  ) : initialPickupLocations.length > 1 ? (
                    <div className="space-y-2.5">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Select Collection Store ({initialPickupLocations.length} locations available)
                      </Label>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {initialPickupLocations.map((store) => {
                          const isSelected = activePickupStore?.id === store.id;
                          return (
                            <div
                              key={store.id}
                              onClick={() => setSelectedStoreId(store.id)}
                              className={cn(
                                "relative cursor-pointer rounded-xl border p-3.5 transition-all text-left",
                                isSelected
                                  ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm"
                                  : "border-border/60 bg-card/40 hover:border-primary/40 hover:bg-card/60",
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2.5">
                                  <div
                                    className={cn(
                                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                                      isSelected
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted text-muted-foreground",
                                    )}
                                  >
                                    <Store className="h-4 w-4" />
                                  </div>
                                  <div>
                                    <h4 className="text-sm font-semibold text-foreground">
                                      {store.name}
                                    </h4>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {store.address}
                                      {store.landmark && ` · Near ${store.landmark}`}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                      {store.city}
                                      {store.phone && ` · Tel: ${store.phone}`}
                                    </p>
                                    {store.operating_hours && (
                                      <p className="text-[10px] text-muted-foreground/80 mt-1">
                                        {store.operating_hours}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                  FREE
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : activePickupStore ? (
                    /* Single Store Card */
                    <div className="rounded-xl border border-border/60 bg-card/40 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Store className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-foreground">
                              {activePickupStore.name}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {activePickupStore.address}
                              {activePickupStore.landmark && ` · Near ${activePickupStore.landmark}`}
                              , {activePickupStore.city}
                            </p>
                            {activePickupStore.phone && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Phone: {activePickupStore.phone}
                              </p>
                            )}
                            {activePickupStore.operating_hours && (
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                Hours: {activePickupStore.operating_hours}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          FREE
                        </span>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground/90 border-t border-border/40 pt-2.5">
                        {activePickupStore.instructions ||
                          "Usually ready for pickup within 24 hours. We will notify you via SMS and email when your items are ready for collection."}
                      </p>
                    </div>
                  ) : null}

                  {/* Person Collecting */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="pickup-collector-name" className="text-xs font-medium">
                        Collector Full Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="pickup-collector-name"
                        value={address.recipientName || fields.fullName}
                        onChange={(e) => {
                          setAddress((prev) => ({ ...prev, recipientName: e.target.value }));
                          set("fullName")(e.target.value);
                        }}
                        placeholder="Name of person picking up"
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="pickup-collector-phone" className="text-xs font-medium">
                        Pickup Contact Phone <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="pickup-collector-phone"
                        type="tel"
                        inputMode="tel"
                        value={address.recipientPhone || fields.contactNumber}
                        onChange={(e) => {
                          const numeric = e.target.value.replace(/[^0-9+\s\-()]/g, "");
                          setAddress((prev) => ({ ...prev, recipientPhone: numeric }));
                          set("contactNumber")(numeric);
                        }}
                        placeholder="080 1234 5678"
                        className="mt-1.5"
                      />
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* 3. Payment Method */}
            <section className="rounded-xl border border-border/50 bg-card/10 backdrop-blur-sm p-4 sm:p-5">
              <h2 className="text-base font-bold uppercase tracking-wider text-black dark:text-white">
                3. Payment Method
              </h2>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                Secure & verified payment processing.
              </p>

              {availablePaymentMethods.length === 0 ? (
                <div className="mt-4 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-xs sm:text-sm text-amber-700 dark:text-amber-400">
                  <ShieldAlert className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-semibold">Checkout Temporarily Unavailable</p>
                    <p className="mt-0.5 text-xs">
                      All payment methods are currently turned off for maintenance. Please check back shortly.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Payment method">
                  {availablePaymentMethods.map((option) => {
                    const active = fields.paymentMethod === option.id;
                    return (
                      <label
                        key={option.id}
                        className={cn(
                          "flex cursor-pointer flex-col gap-1 rounded-lg border p-2.5 transition-colors sm:p-3",
                          active
                            ? "border-primary bg-primary/5"
                            : "border-border/50 bg-card/10 hover:border-primary/40",
                        )}
                      >
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <input
                            type="radio"
                            name="paymentMethod"
                            value={option.id}
                            checked={active}
                            onChange={() => set("paymentMethod")(option.id as PaymentMethod)}
                            className="h-3.5 w-3.5 accent-primary"
                          />
                          <span className="flex-1">{option.name}</span>
                          {option.badge && (
                            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                              {option.badge}
                            </span>
                          )}
                        </span>
                        <span className="pl-6 text-xs text-muted-foreground">{option.hint}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </section>

            <ErrorBanner result={result} onDismiss={() => setResult(null)} />

            <Button
              type="submit"
              size="lg"
              disabled={
                submitting ||
                unavailableCount > 0 ||
                availablePaymentMethods.length === 0 ||
                isLoadingShipping
              }
              className="w-full sm:w-auto font-display text-sm font-bold uppercase tracking-wider"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {fields.paymentMethod === "bachs" ? "Connecting to Payment…" : "Placing order…"}
                </>
              ) : fields.paymentMethod === "bachs" ? (
                `Proceed to Payment · ${priceFormatter.format(orderTotal)}`
              ) : (
                `Place order · ${priceFormatter.format(orderTotal)}`
              )}
            </Button>
            {unavailableCount > 0 && (
              <p className="mt-3 text-sm font-medium text-destructive">
                Some items are no longer available —{" "}
                <Link
                  href="/cart"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  review your cart
                </Link>{" "}
                to remove them.
              </p>
            )}
          </form>

          {/* Right: order summary */}
          <aside className="h-fit min-w-0 overflow-hidden rounded-xl border border-border/50 bg-card/10 backdrop-blur-sm p-4 sm:p-5 lg:sticky lg:top-24">
            <h2 className="text-base font-bold uppercase tracking-wider text-black dark:text-white">
              Order summary
            </h2>
            <ul className="mt-4 space-y-3">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-3">
                  <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md border border-border bg-muted sm:h-14 sm:w-14">
                    {/* eslint-disable-next-line @next/next/no-img-element -- remote images from seed/Storage */}
                    <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                    <span className="absolute bottom-0 right-0 rounded-tl-md bg-background/90 px-1 text-[10px] font-semibold tabular-nums">
                      ×{item.quantity}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    {item.selected_size && (
                      <p className="text-[11px] font-medium text-muted-foreground">
                        Size: <span className="font-semibold text-foreground font-mono">{item.selected_size}</span>
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {priceFormatter.format(item.price)} each
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">
                    {priceFormatter.format(item.price * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Items ({count})</dt>
                <dd className="font-medium tabular-nums">{priceFormatter.format(subtotal)}</dd>
              </div>
              <div className="flex justify-between items-center">
                <dt className="text-muted-foreground">Delivery</dt>
                <dd className="font-medium">
                  {deliveryMode === "pickup" ? (
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">FREE (Pickup)</span>
                  ) : !address.stateId ? (
                    <span className="text-xs text-muted-foreground">Enter address</span>
                  ) : isLoadingShipping ? (
                    <span className="text-xs text-muted-foreground animate-pulse">Calculating…</span>
                  ) : selectedOption ? (
                    selectedOption.isFree || selectedOption.priceNaira === 0 ? (
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">FREE</span>
                    ) : (
                      <span className="tabular-nums">{priceFormatter.format(selectedOption.priceNaira)}</span>
                    )
                  ) : (
                    <span className="text-xs text-destructive">Unavailable</span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between border-t border-border pt-3 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums font-bold text-foreground">
                  {priceFormatter.format(orderTotal)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Stock is reserved immediately when you place your order.
            </p>
          </aside>
        </div>
      )}

      {confirmation && (
        <ConfirmationModal
          confirmation={confirmation}
          onClose={() => setConfirmation(null)}
        />
      )}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      <div className="mt-1.5">{children}</div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function ErrorBanner({
  result,
  onDismiss,
}: {
  result: CheckoutActionResponse | null;
  onDismiss: () => void;
}) {
  if (!result || result.ok) return null;

  if (result.code === "INSUFFICIENT_STOCK") {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm" role="alert">
        <div className="flex items-start justify-between gap-3">
          <p className="font-semibold text-destructive">Not enough stock</p>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="rounded p-1 text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="mt-2 space-y-1">
          {result.items.map((issue) => (
            <li key={issue.productId} className="text-muted-foreground">
              <span className="font-medium text-foreground">{issue.name}</span> — only{" "}
              {issue.available ?? 0} left, you asked for {issue.requested}.
            </li>
          ))}
        </ul>
        <Link href="/cart" className="mt-3 inline-flex h-9 items-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent">
          Adjust quantities in cart
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm" role="alert">
      <p className="font-medium text-destructive">
        {result.message}
        {result.code === "PRODUCT_UNAVAILABLE" && (
          <span className="mt-1 block font-normal text-muted-foreground">
            A product in your cart was removed or retired. Review your cart and try again.
          </span>
        )}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="rounded p-1 text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function ConfirmationModal({
  confirmation,
  onClose,
}: {
  confirmation: {
    orderNumber: string;
    totalAmount: number;
    count: number;
    lines: CartItem[];
    fullName: string;
    deliveryAddress: string;
    paymentMethod: PaymentMethod;
    shippingFee: number;
    shippingMethodName?: string;
  };
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  async function handleDownloadReceipt() {
    setDownloading(true);
    try {
      await downloadReceipt({
        orderNumber: confirmation.orderNumber,
        totalAmount: confirmation.totalAmount,
        paymentMethod: confirmation.paymentMethod,
        deliveryAddress: confirmation.deliveryAddress,
        customerName: confirmation.fullName,
        shippingFee: confirmation.shippingFee,
        shippingMethodName: confirmation.shippingMethodName,
        items: confirmation.lines.map((line) => ({
          name: line.selected_size ? `${line.name} (${line.selected_size})` : line.name,
          size: line.selected_size,
          quantity: line.quantity,
          unitPrice: line.price,
        })),
      });
    } finally {
      setDownloading(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close confirmation"
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-black/50 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
        tabIndex={-1}
        className="relative w-full max-w-md overflow-hidden rounded-xl border border-border bg-background shadow-2xl outline-none"
      >
        <div className="border-b border-border p-4 text-center sm:p-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 className="h-8 w-8 text-emerald-700 dark:text-emerald-400" />
          </div>
          <h2 id="confirmation-title" className="mt-4 text-xl font-bold tracking-tight">
            Order placed!
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Thanks — your pieces are on their way to being packed.
          </p>
        </div>

        <div className="p-4 sm:p-6">
          <div className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Order number
            </p>
            <p className="mt-0.5 break-all font-mono text-lg font-bold tracking-tight">
              {confirmation.orderNumber}
            </p>
          </div>

          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Items</dt>
              <dd className="font-medium tabular-nums">{confirmation.count}</dd>
            </div>
            {confirmation.shippingFee !== undefined && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  Shipping {confirmation.shippingMethodName ? `(${confirmation.shippingMethodName})` : ""}
                </dt>
                <dd className="font-medium tabular-nums">
                  {confirmation.shippingFee === 0 ? "FREE" : priceFormatter.format(confirmation.shippingFee)}
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Total</dt>
              <dd className="font-semibold tabular-nums text-foreground">
                {priceFormatter.format(confirmation.totalAmount)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Payment</dt>
              <dd className="font-medium">Recorded at checkout</dd>
            </div>
          </dl>

          <ul className="mt-4 max-h-40 space-y-2 overflow-y-auto border-t border-border pt-4">
            {confirmation.lines.map((line) => (
              <li key={line.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  {line.name}
                  {line.selected_size && (
                    <span className="font-semibold text-foreground font-mono ml-1">
                      ({line.selected_size})
                    </span>
                  )}{" "}
                  <span className="text-muted-foreground">× {line.quantity}</span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">
                  {priceFormatter.format(line.price * line.quantity)}
                </span>
              </li>
            ))}
          </ul>

          <Button asChild size="lg" className="mt-6 w-full">
            <Link href="/products">Continue shopping</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="mt-2 w-full"
            onClick={handleDownloadReceipt}
            disabled={downloading}
          >
            <Download className="h-4 w-4" />
            {downloading ? "Generating receipt…" : "Download receipt"}
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full text-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function EmptyCheckout() {
  return (
    <div className="mt-8 rounded-xl border border-dashed border-border p-12 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <ShoppingBag className="h-7 w-7 text-muted-foreground stroke-[1.6]" />
      </div>
      <p className="mt-4 text-sm font-medium">Nothing to check out</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Your shopping bag is empty. Add a few items from the collection first.
      </p>
      <Button asChild className="mt-6">
        <Link href="/products">Browse collection</Link>
      </Button>
    </div>
  );
}

function PaymentGatewayHandoffView({
  session,
}: {
  session: { orderId: string; checkoutUrl: string; orderNumber: string; totalAmount: number };
}) {
  const payUrl = `/api/checkout/pay?order_id=${encodeURIComponent(session.orderId)}`;

  useEffect(() => {
    // Navigate via the same-origin server redirect bridge immediately on mount
    navigateToPaymentGateway(session.checkoutUrl, session.orderId);
  }, [session.checkoutUrl, session.orderId]);

  return (
    <div className="site-container py-16 sm:py-24">
      <div className="mx-auto max-w-md rounded-2xl border border-border/80 bg-card p-6 text-center shadow-2xl sm:p-8 backdrop-blur-sm animate-in fade-in-50 zoom-in-95">
        <div className="mb-6 flex justify-center">
          <BoojyPreloader size="lg" message="Connecting to secure payment…" />
        </div>

        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          Order Created · {session.orderNumber}
        </span>

        <h2 className="mt-4 font-display text-2xl font-bold uppercase tracking-tight sm:text-3xl">
          Redirecting to Payment…
        </h2>

        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Connecting you securely to complete your payment of{" "}
          <span className="font-semibold text-foreground">
            {priceFormatter.format(session.totalAmount)}
          </span>.
        </p>

        <div className="mt-8 space-y-3">
          <a
            href={payUrl}
            target="_top"
            rel="noopener"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-black px-6 py-4 font-display text-sm font-bold uppercase tracking-wider text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <span>Proceed to Payment</span>
            <span aria-hidden="true">&rarr;</span>
          </a>
          <p className="text-xs text-muted-foreground">
            If your browser does not redirect automatically, tap the button above to proceed to the payment gateway.
          </p>
        </div>
      </div>
    </div>
  );
}
