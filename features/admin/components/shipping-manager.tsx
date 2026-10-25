"use client";

import { useState, useMemo, useTransition } from "react";
import {
  Truck,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  MapPin,
  Building2,
  Clock,
  Sparkles,
  Layers,
  Check,
  AlertCircle,
  Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { priceFormatter } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type {
  NigerianState,
  NigerianLga,
  DeliveryZone,
  ShippingMethod,
  ShippingRate,
  PricingScope,
} from "@/features/shipping/types";
import {
  createShippingRateAction,
  updateShippingRateAction,
  deleteShippingRateAction,
  createDeliveryZoneAction,
} from "@/features/shipping/actions";

interface ShippingManagerProps {
  initialRates: ShippingRate[];
  methods: ShippingMethod[];
  states: NigerianState[];
  lgas: NigerianLga[];
  deliveryZones: DeliveryZone[];
}

export function ShippingManager({
  initialRates,
  methods,
  states,
  lgas,
  deliveryZones: initialDeliveryZones,
}: ShippingManagerProps) {
  const [rates, setRates] = useState<ShippingRate[]>(initialRates);
  const [zones, setZones] = useState<DeliveryZone[]>(initialDeliveryZones);

  // Tab: "rates" | "zones" | "methods"
  const [activeTab, setActiveTab] = useState<"rates" | "zones" | "methods">("rates");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterState, setFilterState] = useState<string>("all");
  const [filterMethod, setFilterMethod] = useState<string>("all");
  const [filterScope, setFilterScope] = useState<string>("all");

  // Modals
  const [isAddRateOpen, setIsAddRateOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<ShippingRate | null>(null);
  const [deletingRateId, setDeletingRateId] = useState<string | null>(null);
  const [isAddZoneOpen, setIsAddZoneOpen] = useState(false);

  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  // Filtered rates
  const filteredRates = useMemo(() => {
    return rates.filter((r) => {
      // Method filter
      if (filterMethod !== "all" && r.shipping_method_id !== filterMethod) {
        return false;
      }
      // State filter
      if (filterState !== "all" && r.state_id !== filterState) {
        return false;
      }
      // Scope filter
      const scope: PricingScope = r.delivery_zone_id ? "zone" : r.lga_id ? "lga" : "state";
      if (filterScope !== "all" && scope !== filterScope) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const stateName = states.find((s) => s.id === r.state_id)?.name.toLowerCase() || "";
        const lgaName = lgas.find((l) => l.id === r.lga_id)?.name.toLowerCase() || "";
        const zoneName = zones.find((z) => z.id === r.delivery_zone_id)?.name.toLowerCase() || "";
        const methodName = methods.find((m) => m.id === r.shipping_method_id)?.name.toLowerCase() || "";
        return (
          stateName.includes(q) ||
          lgaName.includes(q) ||
          zoneName.includes(q) ||
          methodName.includes(q)
        );
      }
      return true;
    });
  }, [rates, filterMethod, filterState, filterScope, searchQuery, states, lgas, zones, methods]);

  // Coverage statistics
  const stats = useMemo(() => {
    const activeRatesCount = rates.filter((r) => r.is_active).length;
    const statesWithRates = new Set(rates.filter((r) => r.is_active).map((r) => r.state_id)).size;
    return {
      activeRatesCount,
      statesWithRates,
      totalZones: zones.length,
      activeMethods: methods.filter((m) => m.is_active).length,
    };
  }, [rates, zones, methods]);

  // Toggle active inline
  const handleToggleRateActive = (rate: ShippingRate) => {
    const nextState = !rate.is_active;
    setRates((prev) =>
      prev.map((r) => (r.id === rate.id ? { ...r, is_active: nextState } : r)),
    );

    startTransition(async () => {
      const res = await updateShippingRateAction(rate.id, { isActive: nextState });
      if (!res.ok) {
        // Revert
        setRates((prev) =>
          prev.map((r) => (r.id === rate.id ? { ...r, is_active: !nextState } : r)),
        );
        showToast("error", "Failed to update shipping rate status.");
      } else {
        showToast("success", `Rate marked as ${nextState ? "Active" : "Inactive"}.`);
      }
    });
  };

  // Delete rate
  const handleDeleteRate = () => {
    if (!deletingRateId) return;
    const idToDelete = deletingRateId;
    setDeletingRateId(null);

    startTransition(async () => {
      const res = await deleteShippingRateAction(idToDelete);
      if (res.ok) {
        setRates((prev) => prev.filter((r) => r.id !== idToDelete));
        showToast("success", "Shipping rate deleted.");
      } else {
        showToast("error", res.message || "Failed to delete rate.");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {feedback && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-2xl transition-all animate-in fade-in slide-in-from-bottom-5",
            feedback.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-destructive text-destructive-foreground",
          )}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Metrics Header */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Rates</span>
            <Truck className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
            {stats.activeRatesCount}
          </p>
          <p className="text-xs text-muted-foreground">Across all delivery scopes</p>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">State Coverage</span>
            <MapPin className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
            {stats.statesWithRates} / 37
          </p>
          <p className="text-xs text-muted-foreground">Nigerian states & FCT covered</p>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Custom Zones</span>
            <Building2 className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
            {stats.totalZones}
          </p>
          <p className="text-xs text-muted-foreground">High-density cities & districts</p>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Delivery Methods</span>
            <Store className="h-4 w-4 text-blue-500" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
            {stats.activeMethods} Active
          </p>
          <p className="text-xs text-muted-foreground">Own dispatch, courier & pickup</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("rates")}
            className={cn(
              "rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors",
              activeTab === "rates"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            Shipping Rates ({rates.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("zones")}
            className={cn(
              "rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors",
              activeTab === "zones"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            Delivery Zones ({zones.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("methods")}
            className={cn(
              "rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors",
              activeTab === "methods"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            Methods ({methods.length})
          </button>
        </div>

        {activeTab === "rates" && (
          <Button
            onClick={() => setIsAddRateOpen(true)}
            size="sm"
            className="gap-1.5 font-display text-xs font-bold uppercase tracking-wider"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Shipping Rate
          </Button>
        )}

        {activeTab === "zones" && (
          <Button
            onClick={() => setIsAddZoneOpen(true)}
            size="sm"
            className="gap-1.5 font-display text-xs font-bold uppercase tracking-wider"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Delivery Zone
          </Button>
        )}
      </div>

      {/* TAB 1: SHIPPING RATES TABLE */}
      {activeTab === "rates" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search state, LGA, or zone…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>

            {/* Method Filter */}
            <select
              value={filterMethod}
              onChange={(e) => setFilterMethod(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1.5 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="all">All Shipping Methods</option>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>

            {/* Scope Filter */}
            <select
              value={filterScope}
              onChange={(e) => setFilterScope(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1.5 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="all">All Pricing Tiers</option>
              <option value="state">1. State-Wide Coverage</option>
              <option value="lga">2. Local Government Area (LGA)</option>
              <option value="zone">3. Specific City / Delivery Zone</option>
            </select>

            {/* State Filter */}
            <select
              value={filterState}
              onChange={(e) => setFilterState(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1.5 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="all">All States</option>
              {states.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Rates Table */}
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border/60 bg-muted/40 font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Pricing Tier</th>
                    <th className="px-4 py-3">Destination</th>
                    <th className="px-4 py-3">Price (₦)</th>
                    <th className="px-4 py-3">Free Delivery Over</th>
                    <th className="px-4 py-3">Delivery Est.</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filteredRates.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-muted-foreground">
                        No shipping rates found matching your search and filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredRates.map((rate) => {
                      const method = methods.find((m) => m.id === rate.shipping_method_id);
                      const state = states.find((s) => s.id === rate.state_id);
                      const lga = lgas.find((l) => l.id === rate.lga_id);
                      const zone = zones.find((z) => z.id === rate.delivery_zone_id);

                      const scope: PricingScope = rate.delivery_zone_id
                        ? "zone"
                        : rate.lga_id
                          ? "lga"
                          : "state";

                      const priceNaira = Math.round(rate.price_kobo / 100);
                      const freeNaira = rate.free_shipping_threshold_kobo
                        ? Math.round(rate.free_shipping_threshold_kobo / 100)
                        : null;

                      return (
                        <tr
                          key={rate.id}
                          className="transition-colors hover:bg-muted/30"
                        >
                          <td className="px-4 py-3 font-medium text-foreground">
                            {method?.name || rate.shipping_method_id}
                          </td>
                          <td className="px-4 py-3">
                            {scope === "zone" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-600 dark:text-purple-400">
                                City / Zone
                              </span>
                            ) : scope === "lga" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                                LGA Level
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                State-Wide
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-foreground">
                              {scope === "zone"
                                ? zone?.name || rate.delivery_zone_id
                                : scope === "lga"
                                  ? lga?.name || rate.lga_id
                                  : state?.name || rate.state_id}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {scope === "zone"
                                ? `${lga?.name ? lga.name + ", " : ""}${state?.name || ""}`
                                : scope === "lga"
                                  ? `${state?.name || ""}`
                                  : "All LGAs in State"}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono font-bold tabular-nums text-foreground">
                            {priceNaira === 0 ? "FREE" : priceFormatter.format(priceNaira)}
                          </td>
                          <td className="px-4 py-3 font-mono tabular-nums text-muted-foreground">
                            {freeNaira ? priceFormatter.format(freeNaira) : "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {rate.estimated_min_days != null && rate.estimated_max_days != null
                              ? `${rate.estimated_min_days}–${rate.estimated_max_days} days`
                              : "Standard"}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => handleToggleRateActive(rate)}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors",
                                rate.is_active
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
                                  : "bg-muted text-muted-foreground hover:bg-muted/80",
                              )}
                            >
                              {rate.is_active ? (
                                <>
                                  <CheckCircle2 className="h-3 w-3" /> Active
                                </>
                              ) : (
                                <>
                                  <XCircle className="h-3 w-3" /> Disabled
                                </>
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => setEditingRate(rate)}
                                title="Edit Rate"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => setDeletingRateId(rate.id)}
                                title="Delete Rate"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DELIVERY ZONES & CITIES */}
      {activeTab === "zones" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">
              Micro-Location & Neighborhood Delivery Zones
            </h3>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              Delivery zones represent specific neighborhoods, business districts, or cities within a Nigerian State.
              Rates defined for a Delivery Zone take the highest precedence (Tier 1) over LGA and State rates.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border/60 bg-muted/40 font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Zone / Neighborhood Name</th>
                    <th className="px-4 py-3">State</th>
                    <th className="px-4 py-3">Local Government Area (LGA)</th>
                    <th className="px-4 py-3">Aliases / Search Keywords</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {zones.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">
                        No delivery zones configured. Click "Add Delivery Zone" above to create one.
                      </td>
                    </tr>
                  ) : (
                    zones.map((zone) => {
                      const state = states.find((s) => s.id === zone.state_id);
                      const lga = lgas.find((l) => l.id === zone.lga_id);
                      return (
                        <tr key={zone.id} className="transition-colors hover:bg-muted/30">
                          <td className="px-4 py-3 font-semibold text-foreground">
                            {zone.name}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {state?.name || zone.state_id}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {lga?.name || "All LGAs"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {zone.aliases && zone.aliases.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {zone.aliases.map((a, i) => (
                                  <span
                                    key={i}
                                    className="rounded bg-muted px-1.5 py-0.5 text-[10px]"
                                  >
                                    {a}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" /> Active
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SHIPPING METHODS */}
      {activeTab === "methods" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {methods.map((method) => (
            <div
              key={method.id}
              className="rounded-xl border border-border/60 bg-card p-5 shadow-sm space-y-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-sm text-foreground">{method.name}</h3>
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wide">
                    {method.method_type.replace("_", " ")}
                  </span>
                </div>
                <Truck className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {method.description || "Delivery option available for checkout."}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border/40">
                <Clock className="h-3.5 w-3.5" />
                <span>
                  Estimated duration: {method.estimated_min_days}–{method.estimated_max_days} business days
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: ADD SHIPPING RATE */}
      {isAddRateOpen && (
        <AddRateModal
          methods={methods}
          states={states}
          lgas={lgas}
          zones={zones}
          onClose={() => setIsAddRateOpen(false)}
          onCreated={(newRate) => {
            setRates((prev) => [newRate, ...prev]);
            setIsAddRateOpen(false);
            showToast("success", "New shipping rate successfully configured.");
          }}
        />
      )}

      {/* MODAL: EDIT SHIPPING RATE */}
      {editingRate && (
        <EditRateModal
          rate={editingRate}
          onClose={() => setEditingRate(null)}
          onUpdated={(updatedFields) => {
            setRates((prev) =>
              prev.map((r) => (r.id === editingRate.id ? { ...r, ...updatedFields } : r)),
            );
            setEditingRate(null);
            showToast("success", "Shipping rate successfully updated.");
          }}
        />
      )}

      {/* MODAL: ADD DELIVERY ZONE */}
      {isAddZoneOpen && (
        <AddZoneModal
          states={states}
          lgas={lgas}
          onClose={() => setIsAddZoneOpen(false)}
          onCreated={(newZone) => {
            setZones((prev) => [...prev, newZone]);
            setIsAddZoneOpen(false);
            showToast("success", "New delivery zone added.");
          }}
        />
      )}

      {/* CONFIRM DELETE MODAL */}
      {deletingRateId && (
        <ConfirmModal
          title="Delete Shipping Rate?"
          message="Are you sure you want to delete this shipping rate? Customers in this area will fall back to higher-level LGA or State rates, or delivery may become unavailable."
          confirmLabel="Delete Rate"
          confirmIcon={Trash2}
          busy={isPending}
          onConfirm={handleDeleteRate}
          onCancel={() => setDeletingRateId(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ADD SHIPPING RATE MODAL
// ---------------------------------------------------------------------------

function AddRateModal({
  methods,
  states,
  lgas,
  zones,
  onClose,
  onCreated,
}: {
  methods: ShippingMethod[];
  states: NigerianState[];
  lgas: NigerianLga[];
  zones: DeliveryZone[];
  onClose: () => void;
  onCreated: (rate: ShippingRate) => void;
}) {
  const [shippingMethodId, setShippingMethodId] = useState(methods[0]?.id || "standard");
  const [pricingScope, setPricingScope] = useState<PricingScope>("state");
  const [stateId, setStateId] = useState(states[0]?.id || "");
  const [lgaId, setLgaId] = useState<string>("");
  const [deliveryZoneId, setDeliveryZoneId] = useState<string>("");
  const [priceNaira, setPriceNaira] = useState("2500");
  const [freeShippingThresholdNaira, setFreeShippingThresholdNaira] = useState("");
  const [minDays, setMinDays] = useState("2");
  const [maxDays, setMaxDays] = useState("4");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Available LGAs for selected state
  const availableLgas = useMemo(() => {
    if (!stateId) return [];
    return lgas.filter((l) => l.state_id === stateId || l.state_id.endsWith(stateId.slice(-4)));
  }, [lgas, stateId]);

  // Available Zones for selected state & LGA
  const availableZones = useMemo(() => {
    if (!stateId) return [];
    return zones.filter((z) => {
      const matchState = z.state_id === stateId || z.state_id.endsWith(stateId.slice(-4));
      if (!matchState) return false;
      if (lgaId && z.lga_id) {
        return z.lga_id === lgaId || z.lga_id.endsWith(lgaId.slice(-4));
      }
      return true;
    });
  }, [zones, stateId, lgaId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const parsedPrice = parseFloat(priceNaira);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setError("Please enter a valid price in Naira.");
      return;
    }

    if (pricingScope === "lga" && !lgaId) {
      setError("Please select a Local Government Area.");
      return;
    }

    if (pricingScope === "zone" && !deliveryZoneId) {
      setError("Please select a Delivery Zone.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const res = await createShippingRateAction({
      shippingMethodId,
      stateId,
      lgaId: pricingScope !== "state" ? lgaId || null : null,
      deliveryZoneId: pricingScope === "zone" ? deliveryZoneId || null : null,
      priceNaira: parsedPrice,
      freeShippingThresholdNaira: freeShippingThresholdNaira ? parseFloat(freeShippingThresholdNaira) : null,
      estimatedMinDays: minDays ? parseInt(minDays, 10) : null,
      estimatedMaxDays: maxDays ? parseInt(maxDays, 10) : null,
      isActive: true,
    });

    setSubmitting(false);

    if (res.ok && res.rate) {
      onCreated(res.rate);
    } else {
      setError(res.message || "Could not save shipping rate.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl space-y-5 animate-in fade-in-50 zoom-in-95">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
            Configure New Shipping Rate
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            &times;
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Method */}
          <div>
            <Label className="text-xs font-medium">Shipping Method</Label>
            <select
              value={shippingMethodId}
              onChange={(e) => setShippingMethodId(e.target.value)}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-card px-3 text-xs shadow-sm"
            >
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.method_type})
                </option>
              ))}
            </select>
          </div>

          {/* Pricing Scope */}
          <div>
            <Label className="text-xs font-medium">Geographic Pricing Tier</Label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPricingScope("state")}
                className={cn(
                  "rounded-lg border p-2 text-center transition-colors",
                  pricingScope === "state"
                    ? "border-primary bg-primary/10 text-primary font-semibold"
                    : "border-border/60 bg-muted/20 text-muted-foreground hover:border-primary/40",
                )}
              >
                1. State-Wide
              </button>
              <button
                type="button"
                onClick={() => setPricingScope("lga")}
                className={cn(
                  "rounded-lg border p-2 text-center transition-colors",
                  pricingScope === "lga"
                    ? "border-primary bg-primary/10 text-primary font-semibold"
                    : "border-border/60 bg-muted/20 text-muted-foreground hover:border-primary/40",
                )}
              >
                2. Specific LGA
              </button>
              <button
                type="button"
                onClick={() => setPricingScope("zone")}
                className={cn(
                  "rounded-lg border p-2 text-center transition-colors",
                  pricingScope === "zone"
                    ? "border-primary bg-primary/10 text-primary font-semibold"
                    : "border-border/60 bg-muted/20 text-muted-foreground hover:border-primary/40",
                )}
              >
                3. City / Zone
              </button>
            </div>
          </div>

          {/* State Select */}
          <div>
            <Label className="text-xs font-medium">Nigerian State</Label>
            <select
              value={stateId}
              onChange={(e) => {
                setStateId(e.target.value);
                setLgaId("");
                setDeliveryZoneId("");
              }}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-card px-3 text-xs shadow-sm"
            >
              {states.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          {/* LGA Select (if lga or zone scope) */}
          {pricingScope !== "state" && (
            <div>
              <Label className="text-xs font-medium">Local Government Area (LGA)</Label>
              <select
                value={lgaId}
                onChange={(e) => {
                  setLgaId(e.target.value);
                  setDeliveryZoneId("");
                }}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-card px-3 text-xs shadow-sm"
              >
                <option value="">Select LGA</option>
                {availableLgas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Zone Select (if zone scope) */}
          {pricingScope === "zone" && (
            <div>
              <Label className="text-xs font-medium">Delivery Zone / Neighborhood</Label>
              <select
                value={deliveryZoneId}
                onChange={(e) => setDeliveryZoneId(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-card px-3 text-xs shadow-sm"
              >
                <option value="">Select Delivery Zone</option>
                {availableZones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Price & Free Threshold */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium">Price in ₦ (Naira)</Label>
              <Input
                type="number"
                min="0"
                step="50"
                value={priceNaira}
                onChange={(e) => setPriceNaira(e.target.value)}
                placeholder="2500"
                className="mt-1 text-xs font-mono"
                required
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Free Delivery Over (₦, Optional)</Label>
              <Input
                type="number"
                min="0"
                step="500"
                value={freeShippingThresholdNaira}
                onChange={(e) => setFreeShippingThresholdNaira(e.target.value)}
                placeholder="50000"
                className="mt-1 text-xs font-mono"
              />
            </div>
          </div>

          {/* Estimated Days */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium">Min Days</Label>
              <Input
                type="number"
                min="0"
                value={minDays}
                onChange={(e) => setMinDays(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Max Days</Label>
              <Input
                type="number"
                min="0"
                value={maxDays}
                onChange={(e) => setMaxDays(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border/60">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Saving Rate…" : "Save Rate"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EDIT SHIPPING RATE MODAL
// ---------------------------------------------------------------------------

function EditRateModal({
  rate,
  onClose,
  onUpdated,
}: {
  rate: ShippingRate;
  onClose: () => void;
  onUpdated: (fields: Partial<ShippingRate>) => void;
}) {
  const [priceNaira, setPriceNaira] = useState(String(Math.round(rate.price_kobo / 100)));
  const [freeShippingThresholdNaira, setFreeShippingThresholdNaira] = useState(
    rate.free_shipping_threshold_kobo
      ? String(Math.round(rate.free_shipping_threshold_kobo / 100))
      : "",
  );
  const [minDays, setMinDays] = useState(String(rate.estimated_min_days ?? "2"));
  const [maxDays, setMaxDays] = useState(String(rate.estimated_max_days ?? "4"));
  const [isActive, setIsActive] = useState(rate.is_active);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const parsedPrice = parseFloat(priceNaira);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setError("Please enter a valid price in Naira.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const res = await updateShippingRateAction(rate.id, {
      priceNaira: parsedPrice,
      freeShippingThresholdNaira: freeShippingThresholdNaira ? parseFloat(freeShippingThresholdNaira) : null,
      estimatedMinDays: minDays ? parseInt(minDays, 10) : null,
      estimatedMaxDays: maxDays ? parseInt(maxDays, 10) : null,
      isActive,
    });

    setSubmitting(false);

    if (res.ok) {
      onUpdated({
        price_kobo: Math.round(parsedPrice * 100),
        free_shipping_threshold_kobo: freeShippingThresholdNaira
          ? Math.round(parseFloat(freeShippingThresholdNaira) * 100)
          : null,
        estimated_min_days: minDays ? parseInt(minDays, 10) : null,
        estimated_max_days: maxDays ? parseInt(maxDays, 10) : null,
        is_active: isActive,
      });
    } else {
      setError(res.message || "Failed to update shipping rate.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4 animate-in fade-in-50 zoom-in-95">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
            Edit Shipping Rate
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            &times;
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium">Price in ₦ (Naira)</Label>
              <Input
                type="number"
                min="0"
                step="50"
                value={priceNaira}
                onChange={(e) => setPriceNaira(e.target.value)}
                className="mt-1 text-xs font-mono"
                required
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Free Delivery Over (₦)</Label>
              <Input
                type="number"
                min="0"
                step="500"
                value={freeShippingThresholdNaira}
                onChange={(e) => setFreeShippingThresholdNaira(e.target.value)}
                placeholder="Optional"
                className="mt-1 text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium">Min Days</Label>
              <Input
                type="number"
                min="0"
                value={minDays}
                onChange={(e) => setMinDays(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Max Days</Label>
              <Input
                type="number"
                min="0"
                value={maxDays}
                onChange={(e) => setMaxDays(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer pt-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
            />
            <span className="text-xs font-medium text-foreground">Rate is Active for Customers</span>
          </label>

          <div className="flex justify-end gap-2 pt-3 border-t border-border/60">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Updating…" : "Update Rate"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ADD DELIVERY ZONE MODAL
// ---------------------------------------------------------------------------

function AddZoneModal({
  states,
  lgas,
  onClose,
  onCreated,
}: {
  states: NigerianState[];
  lgas: NigerianLga[];
  onClose: () => void;
  onCreated: (zone: DeliveryZone) => void;
}) {
  const [stateId, setStateId] = useState(states[0]?.id || "");
  const [lgaId, setLgaId] = useState("");
  const [name, setName] = useState("");
  const [aliasesInput, setAliasesInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableLgas = useMemo(() => {
    if (!stateId) return [];
    return lgas.filter((l) => l.state_id === stateId || l.state_id.endsWith(stateId.slice(-4)));
  }, [lgas, stateId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    if (!name.trim()) {
      setError("Please provide a name for this delivery zone.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const aliases = aliasesInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const res = await createDeliveryZoneAction({
      stateId,
      lgaId: lgaId || null,
      name: name.trim(),
      aliases,
    });

    setSubmitting(false);

    if (res.ok && res.zone) {
      onCreated(res.zone);
    } else {
      setError(res.message || "Could not create delivery zone.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4 animate-in fade-in-50 zoom-in-95">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
            Create Delivery Zone
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            &times;
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <Label className="text-xs font-medium">State</Label>
            <select
              value={stateId}
              onChange={(e) => {
                setStateId(e.target.value);
                setLgaId("");
              }}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-card px-3 text-xs shadow-sm"
            >
              {states.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label className="text-xs font-medium">LGA (Optional)</Label>
            <select
              value={lgaId}
              onChange={(e) => setLgaId(e.target.value)}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-card px-3 text-xs shadow-sm"
            >
              <option value="">All LGAs in state</option>
              {availableLgas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label className="text-xs font-medium">Zone / Neighborhood Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lekki Phase 1, Victoria Island, Wuse 2"
              className="mt-1 text-xs"
              required
            />
          </div>

          <div>
            <Label className="text-xs font-medium">Aliases / Keywords (comma separated)</Label>
            <Input
              value={aliasesInput}
              onChange={(e) => setAliasesInput(e.target.value)}
              placeholder="e.g. Lekki 1, Admiralty Way, VI"
              className="mt-1 text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border/60">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Saving Zone…" : "Save Zone"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
