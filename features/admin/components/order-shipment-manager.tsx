"use client";

import { useState, useTransition } from "react";
import {
  Truck,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  Phone,
  User,
  PackageCheck,
  Send,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { priceFormatter } from "@/lib/currency";
import type { ShipmentStatus } from "@/features/shipping/types";
import { updateOrderShipmentAction } from "@/features/shipping/actions";

interface OrderShipmentManagerProps {
  orderId: string;
  orderNumber: string;
  shippingMethodName?: string;
  shippingFee?: number;
  recipientName?: string;
  recipientPhone?: string;
  initialShipmentStatus?: string;
  initialAssignedRiderName?: string;
  initialAssignedRiderPhone?: string;
  initialTrackingNumber?: string;
  initialTrackingUrl?: string;
  initialCourierProvider?: string;
}

const SHIPMENT_STATUSES: { value: ShipmentStatus; label: string; color: string }[] = [
  { value: "pending_assignment", label: "Pending Assignment", color: "text-amber-600 bg-amber-500/10" },
  { value: "assigned", label: "Rider / Courier Assigned", color: "text-blue-600 bg-blue-500/10" },
  { value: "dispatched", label: "Dispatched / Out for Delivery", color: "text-purple-600 bg-purple-500/10" },
  { value: "delivered", label: "Delivered", color: "text-emerald-600 bg-emerald-500/10" },
  { value: "failed", label: "Delivery Attempt Failed", color: "text-destructive bg-destructive/10" },
  { value: "cancelled", label: "Shipment Cancelled", color: "text-muted-foreground bg-muted" },
];

export function OrderShipmentManager({
  orderId,
  orderNumber,
  shippingMethodName,
  shippingFee = 0,
  recipientName,
  recipientPhone,
  initialShipmentStatus = "pending_assignment",
  initialAssignedRiderName = "",
  initialAssignedRiderPhone = "",
  initialTrackingNumber = "",
  initialTrackingUrl = "",
  initialCourierProvider = "",
}: OrderShipmentManagerProps) {
  const [shipmentStatus, setShipmentStatus] = useState<ShipmentStatus>(
    (initialShipmentStatus as ShipmentStatus) || "pending_assignment",
  );
  const [riderName, setRiderName] = useState(initialAssignedRiderName);
  const [riderPhone, setRiderPhone] = useState(initialAssignedRiderPhone);
  const [trackingNumber, setTrackingNumber] = useState(initialTrackingNumber);
  const [trackingUrl, setTrackingUrl] = useState(initialTrackingUrl);
  const [courierProvider, setCourierProvider] = useState(initialCourierProvider);
  const [dispatchNotes, setDispatchNotes] = useState("");

  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const isCourier = Boolean(trackingNumber || courierProvider || shippingMethodName?.toLowerCase().includes("courier"));

  function handleSaveShipment(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    startTransition(async () => {
      const res = await updateOrderShipmentAction({
        orderId,
        shipmentStatus,
        assignedRiderName: riderName.trim(),
        assignedRiderPhone: riderPhone.trim(),
        trackingNumber: trackingNumber.trim(),
        trackingUrl: trackingUrl.trim(),
        courierProvider: courierProvider.trim(),
        notes: dispatchNotes.trim() || undefined,
      });

      if (res.ok) {
        setFeedback({ type: "success", message: "Shipment information updated." });
        setDispatchNotes("");
        setTimeout(() => setFeedback(null), 3500);
      } else {
        setFeedback({ type: "error", message: res.message || "Failed to update shipment." });
      }
    });
  }

  const currentStatusObj = SHIPMENT_STATUSES.find((s) => s.value === shipmentStatus) || SHIPMENT_STATUSES[0];

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
            Shipment & Dispatch
          </h2>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider",
            currentStatusObj.color,
          )}
        >
          {currentStatusObj.label}
        </span>
      </div>

      {feedback && (
        <div
          className={cn(
            "rounded-lg p-2.5 text-xs font-medium flex items-center gap-2",
            feedback.type === "success"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Snapshot Summary */}
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/30 p-3 text-xs">
        <div>
          <span className="text-muted-foreground block text-[11px]">Selected Method</span>
          <span className="font-semibold text-foreground">{shippingMethodName || "Standard Delivery"}</span>
        </div>
        <div>
          <span className="text-muted-foreground block text-[11px]">Shipping Fee</span>
          <span className="font-mono font-bold text-foreground">
            {shippingFee === 0 ? "FREE" : priceFormatter.format(shippingFee)}
          </span>
        </div>
        {recipientName && (
          <div className="col-span-2 pt-2 border-t border-border/40">
            <span className="text-muted-foreground block text-[11px]">Recipient Contact</span>
            <span className="font-medium text-foreground">
              {recipientName} {recipientPhone ? `(${recipientPhone})` : ""}
            </span>
          </div>
        )}
      </div>

      <form onSubmit={handleSaveShipment} className="space-y-4 text-xs">
        {/* Status Dropdown */}
        <div>
          <Label className="text-xs font-medium">Update Shipment Lifecycle</Label>
          <select
            value={shipmentStatus}
            onChange={(e) => setShipmentStatus(e.target.value as ShipmentStatus)}
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-card px-3 text-xs shadow-sm"
          >
            {SHIPMENT_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>

        {/* Rider Assignment (Direct Dispatch) */}
        <div className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-3">
          <p className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
            <User className="h-3.5 w-3.5 text-primary" /> Dispatch Rider Assignment
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-[11px] text-muted-foreground">Rider Name</Label>
              <Input
                value={riderName}
                onChange={(e) => setRiderName(e.target.value)}
                placeholder="e.g. Ibrahim Musa"
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Rider Phone</Label>
              <Input
                value={riderPhone}
                onChange={(e) => setRiderPhone(e.target.value)}
                placeholder="080 0000 0000"
                className="mt-1 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Third-Party Courier Tracking */}
        <div className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-3">
          <p className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
            <PackageCheck className="h-3.5 w-3.5 text-blue-500" /> Third-Party Courier Integration
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <Label className="text-[11px] text-muted-foreground">Courier Provider</Label>
              <Input
                value={courierProvider}
                onChange={(e) => setCourierProvider(e.target.value)}
                placeholder="GIG, DHL, Speedaf…"
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Tracking Number / Waybill</Label>
              <Input
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="WAYBILL-12345"
                className="mt-1 text-xs font-mono"
              />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Tracking Link URL</Label>
              <Input
                value={trackingUrl}
                onChange={(e) => setTrackingUrl(e.target.value)}
                placeholder="https://..."
                className="mt-1 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Dispatch Notes / Waybill Remarks */}
        <div>
          <Label className="text-xs font-medium">Log Dispatch Note (Optional)</Label>
          <Input
            value={dispatchNotes}
            onChange={(e) => setDispatchNotes(e.target.value)}
            placeholder="e.g. Parcel picked up from warehouse, dispatched via van 2"
            className="mt-1 text-xs"
          />
        </div>

        <Button
          type="submit"
          size="sm"
          disabled={isPending}
          className="w-full gap-1.5 font-display text-xs font-bold uppercase tracking-wider"
        >
          <Save className="h-3.5 w-3.5" />
          {isPending ? "Updating Shipment…" : "Save Shipment Details"}
        </Button>
      </form>
    </section>
  );
}
