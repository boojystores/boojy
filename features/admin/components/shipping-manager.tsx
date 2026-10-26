"use client";

import { useState, useMemo, useTransition } from "react";
import {
  Truck,
  Plus,
  Search,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  MapPin,
  Store,
  AlertCircle,
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
  PickupLocation,
  ShippingMethod,
  ShippingRate,
  PricingScope,
} from "@/features/shipping/types";
import {
  createShippingRateAction,
  updateShippingRateAction,
  deleteShippingRateAction,
  createPickupLocationAction,
  updatePickupLocationAction,
  deletePickupLocationAction,
} from "@/features/shipping/actions";
import { BUILTIN_STATES } from "@/features/shipping/lib/defaults";

interface ShippingManagerProps {
  initialRates: ShippingRate[];
  methods: ShippingMethod[];
  states: NigerianState[];
  lgas: NigerianLga[];
  deliveryZones: DeliveryZone[];
  initialPickupLocations?: PickupLocation[];
}

export function ShippingManager({
  initialRates,
  methods,
  states,
  lgas,
  deliveryZones: initialDeliveryZones,
  initialPickupLocations = [],
}: ShippingManagerProps) {
  const [rates, setRates] = useState<ShippingRate[]>(initialRates);
  const [zones, setZones] = useState<DeliveryZone[]>(initialDeliveryZones);
  const [stores, setStores] = useState<PickupLocation[]>(initialPickupLocations);

  // Simple tabs: Delivery or Pickup
  const [activeTab, setActiveTab] = useState<"delivery" | "pickup">("delivery");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterState, setFilterState] = useState<string>("all");

  // Modals
  const [isAddRateOpen, setIsAddRateOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<ShippingRate | null>(null);
  const [deletingRateId, setDeletingRateId] = useState<string | null>(null);

  const [isAddStoreOpen, setIsAddStoreOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<PickupLocation | null>(null);
  const [deletingStoreId, setDeletingStoreId] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  // Filtered delivery rates (excluding pickup-only rate rows if any)
  const deliveryRates = useMemo(() => {
    return rates.filter((r) => r.shipping_method_id !== "pickup");
  }, [rates]);

  const filteredRates = useMemo(() => {
    return deliveryRates.filter((r) => {
      if (filterState !== "all" && r.state_id !== filterState) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const stateName = states.find((s) => s.id === r.state_id)?.name.toLowerCase() || "";
        const lgaName = lgas.find((l) => l.id === r.lga_id)?.name.toLowerCase() || "";
        const zoneName = zones.find((z) => z.id === r.delivery_zone_id)?.name.toLowerCase() || "";
        return stateName.includes(q) || lgaName.includes(q) || zoneName.includes(q);
      }
      return true;
    });
  }, [deliveryRates, filterState, searchQuery, states, lgas, zones]);

  // Statistics
  const stats = useMemo(() => {
    const activeRatesCount = deliveryRates.filter((r) => r.is_active).length;
    const statesWithRates = new Set(deliveryRates.filter((r) => r.is_active).map((r) => r.state_id)).size;
    const activeStoresCount = stores.filter((s) => s.is_active).length;
    return {
      activeRatesCount,
      statesWithRates,
      activeStoresCount,
    };
  }, [deliveryRates, stores]);

  // Toggle rate active status
  const handleToggleRateActive = (rate: ShippingRate) => {
    const nextState = !rate.is_active;
    setRates((prev) =>
      prev.map((r) => (r.id === rate.id ? { ...r, is_active: nextState } : r)),
    );

    startTransition(async () => {
      const res = await updateShippingRateAction(rate.id, { isActive: nextState });
      if (!res.ok) {
        setRates((prev) =>
          prev.map((r) => (r.id === rate.id ? { ...r, is_active: !nextState } : r)),
        );
        showToast("error", "Failed to update rate status.");
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
        showToast("success", "Delivery rate removed.");
      } else {
        showToast("error", res.message || "Failed to delete rate.");
      }
    });
  };

  // Toggle store active status
  const handleToggleStoreActive = (store: PickupLocation) => {
    const nextState = !store.is_active;
    setStores((prev) =>
      prev.map((s) => (s.id === store.id ? { ...s, is_active: nextState } : s)),
    );

    startTransition(async () => {
      const res = await updatePickupLocationAction(store.id, { is_active: nextState });
      if (!res.ok) {
        setStores((prev) =>
          prev.map((s) => (s.id === store.id ? { ...s, is_active: !nextState } : s)),
        );
        showToast("error", "Failed to update store status.");
      } else {
        showToast("success", `Store marked as ${nextState ? "Active" : "Inactive"}.`);
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

      {/* Clean Metrics Summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Delivery Rates</span>
            <Truck className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
            {stats.activeRatesCount}
          </p>
          <p className="text-xs text-muted-foreground">Active delivery locations</p>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">States Covered</span>
            <MapPin className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
            {stats.statesWithRates} / 37
          </p>
          <p className="text-xs text-muted-foreground">States configured for delivery</p>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Pickup Locations</span>
            <Store className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
            {stats.activeStoresCount}
          </p>
          <p className="text-xs text-muted-foreground">Active collection stores</p>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("delivery")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
              activeTab === "delivery"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Truck className="h-4 w-4" />
            <span>Delivery ({deliveryRates.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("pickup")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
              activeTab === "pickup"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Store className="h-4 w-4" />
            <span>Pickup ({stores.length})</span>
          </button>
        </div>

        {activeTab === "delivery" ? (
          <Button
            onClick={() => setIsAddRateOpen(true)}
            size="sm"
            className="gap-1.5 font-display text-xs font-bold uppercase tracking-wider"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Delivery Rate
          </Button>
        ) : (
          <Button
            onClick={() => setIsAddStoreOpen(true)}
            size="sm"
            className="gap-1.5 font-display text-xs font-bold uppercase tracking-wider"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Pickup Location
          </Button>
        )}
      </div>

      {/* TAB 1: DELIVERY RATES */}
      {activeTab === "delivery" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search state, LGA, or neighborhood…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>

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
                    <th className="px-4 py-3">Destination</th>
                    <th className="px-4 py-3">Coverage</th>
                    <th className="px-4 py-3">Delivery Fee</th>
                    <th className="px-4 py-3">Estimated Time</th>
                    <th className="px-4 py-3">Free Over</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filteredRates.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        No delivery rates configured yet. Click &quot;Add Delivery Rate&quot; to add one.
                      </td>
                    </tr>
                  ) : (
                    filteredRates.map((rate) => {
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
                          <td className="px-4 py-3">
                            <div className="font-semibold text-foreground">
                              {scope === "zone"
                                ? zone?.name || "Custom Zone"
                                : scope === "lga"
                                  ? lga?.name || "LGA"
                                  : state?.name || "State"}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {scope === "zone"
                                ? `${lga?.name ? lga.name + ", " : ""}${state?.name || ""}`
                                : scope === "lga"
                                  ? `${state?.name || ""}`
                                  : "All LGAs in State"}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {scope === "zone" ? (
                              <span className="inline-flex items-center rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-600 dark:text-purple-400">
                                Neighborhood
                              </span>
                            ) : scope === "lga" ? (
                              <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                                Single LGA
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                State-Wide
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono font-bold tabular-nums text-foreground">
                            {priceNaira === 0 ? "FREE" : priceFormatter.format(priceNaira)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {rate.estimated_min_days != null && rate.estimated_max_days != null
                              ? `${rate.estimated_min_days}–${rate.estimated_max_days} days`
                              : "1–3 days"}
                          </td>
                          <td className="px-4 py-3 font-mono tabular-nums text-muted-foreground">
                            {freeNaira ? priceFormatter.format(freeNaira) : "—"}
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

      {/* TAB 2: PICKUP STORES */}
      {activeTab === "pickup" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border/60 bg-muted/40 font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Store Name</th>
                    <th className="px-4 py-3">Address & Landmark</th>
                    <th className="px-4 py-3">City / State</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Hours</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {stores.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        No pickup locations configured. Click &quot;Add Pickup Location&quot; to add one.
                      </td>
                    </tr>
                  ) : (
                    stores.map((store) => {
                      const state = states.find((s) => s.id === store.state_id);
                      return (
                        <tr key={store.id} className="transition-colors hover:bg-muted/30">
                          <td className="px-4 py-3 font-semibold text-foreground">
                            {store.name}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            <div>{store.address}</div>
                            {store.landmark && (
                              <div className="text-[11px] font-medium text-foreground">
                                Landmark: {store.landmark}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {store.city}{state ? `, ${state.name}` : ""}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground font-mono">
                            {store.phone || "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {store.operating_hours || "—"}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => handleToggleStoreActive(store)}
                              className="focus:outline-none"
                            >
                              {store.is_active ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                  <CheckCircle2 className="h-3 w-3" /> Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                  <XCircle className="h-3 w-3" /> Inactive
                                </span>
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setEditingStore(store)}
                                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                title="Edit Store"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingStoreId(store.id)}
                                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                title="Delete Store"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
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

      {/* MODAL: ADD DELIVERY RATE */}
      {isAddRateOpen && (
        <AddRateModal
          states={states}
          lgas={lgas}
          zones={zones}
          onClose={() => setIsAddRateOpen(false)}
          onCreated={(newRate) => {
            setRates((prev) => [newRate, ...prev]);
            setIsAddRateOpen(false);
            showToast("success", "Delivery rate added.");
          }}
        />
      )}

      {/* MODAL: EDIT DELIVERY RATE */}
      {editingRate && (
        <EditRateModal
          rate={editingRate}
          states={states}
          lgas={lgas}
          zones={zones}
          onClose={() => setEditingRate(null)}
          onUpdated={(updatedFields) => {
            setRates((prev) =>
              prev.map((r) => (r.id === editingRate.id ? { ...r, ...updatedFields } : r)),
            );
            setEditingRate(null);
            showToast("success", "Delivery rate updated.");
          }}
        />
      )}

      {/* MODAL: ADD PICKUP STORE */}
      {isAddStoreOpen && (
        <AddStoreModal
          states={states}
          onClose={() => setIsAddStoreOpen(false)}
          onCreated={(newStore) => {
            setStores((prev) => [...prev, newStore]);
            setIsAddStoreOpen(false);
            showToast("success", "Pickup location added.");
          }}
        />
      )}

      {/* MODAL: EDIT PICKUP STORE */}
      {editingStore && (
        <EditStoreModal
          store={editingStore}
          states={states}
          onClose={() => setEditingStore(null)}
          onUpdated={(updatedStore) => {
            setStores((prev) =>
              prev.map((s) => (s.id === updatedStore.id ? updatedStore : s)),
            );
            setEditingStore(null);
            showToast("success", "Pickup location updated.");
          }}
        />
      )}

      {/* CONFIRM DELETE DELIVERY RATE MODAL */}
      {deletingRateId && (
        <ConfirmModal
          title="Delete Delivery Rate?"
          message="Are you sure you want to delete this delivery rate? Orders to this area may become unavailable if no other rate covers it."
          confirmLabel="Delete Rate"
          confirmIcon={Trash2}
          busy={isPending}
          onConfirm={handleDeleteRate}
          onCancel={() => setDeletingRateId(null)}
        />
      )}

      {/* CONFIRM DELETE PICKUP STORE MODAL */}
      {deletingStoreId && (
        <ConfirmModal
          title="Delete Pickup Location?"
          message="Are you sure you want to remove this pickup location? Customers will no longer be able to select it at checkout."
          confirmLabel="Delete Store"
          confirmIcon={Trash2}
          busy={isPending}
          onConfirm={() => {
            startTransition(async () => {
              const res = await deletePickupLocationAction(deletingStoreId);
              if (res.ok) {
                setStores((prev) => prev.filter((s) => s.id !== deletingStoreId));
                showToast("success", "Pickup location deleted.");
              } else {
                showToast("error", res.message || "Failed to delete location.");
              }
              setDeletingStoreId(null);
            });
          }}
          onCancel={() => setDeletingStoreId(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ADD DELIVERY RATE MODAL
// ---------------------------------------------------------------------------

function AddRateModal({
  states,
  lgas,
  zones,
  onClose,
  onCreated,
}: {
  states: NigerianState[];
  lgas: NigerianLga[];
  zones: DeliveryZone[];
  onClose: () => void;
  onCreated: (rate: ShippingRate) => void;
}) {
  const [pricingScope, setPricingScope] = useState<PricingScope>("state");
  const [stateId, setStateId] = useState(states[0]?.id || "");
  const [lgaId, setLgaId] = useState<string>("");
  const [deliveryZoneId, setDeliveryZoneId] = useState<string>("");
  const [customZoneName, setCustomZoneName] = useState<string>("");
  const [priceNaira, setPriceNaira] = useState("");
  const [freeShippingThresholdNaira, setFreeShippingThresholdNaira] = useState("");
  const [minDays, setMinDays] = useState("1");
  const [maxDays, setMaxDays] = useState("3");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableLgas = useMemo(() => {
    if (!stateId) return [];
    const stateObj = states.find((s) => s.id === stateId);
    const stateName = (stateObj?.name || "").toLowerCase();
    const builtinState = stateName ? BUILTIN_STATES.find((s) => s.name.toLowerCase() === stateName) : null;

    return lgas.filter((l) => {
      if (l.state_id === stateId || l.state_id.endsWith(stateId.slice(-4))) return true;
      if (stateObj && (l.state_id === stateObj.id || l.state_id.endsWith(stateObj.id.slice(-4)))) return true;
      if (builtinState && (l.state_id === builtinState.id || l.state_id.endsWith(builtinState.id.slice(-4)))) return true;
      return false;
    });
  }, [lgas, stateId, states]);

  const availableZones = useMemo(() => {
    if (!stateId || !lgaId) return [];
    return zones.filter((z) => {
      const matchState = z.state_id === stateId || z.state_id.endsWith(stateId.slice(-4));
      if (!matchState) return false;
      if (!z.lga_id) return false;
      return z.lga_id === lgaId || z.lga_id.endsWith(lgaId.slice(-4));
    });
  }, [zones, stateId, lgaId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const parsedPrice = parseFloat(priceNaira);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setError("Please enter a valid delivery fee in Naira.");
      return;
    }

    if ((pricingScope === "lga" || pricingScope === "zone") && !lgaId) {
      setError("Please select a Local Government Area (LGA).");
      return;
    }

    if (pricingScope === "zone" && !deliveryZoneId && !customZoneName.trim()) {
      setError("Please enter or select a neighborhood / city name.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const res = await createShippingRateAction({
      shippingMethodId: "standard",
      stateId,
      lgaId: pricingScope !== "state" ? lgaId || null : null,
      deliveryZoneId: pricingScope === "zone" ? deliveryZoneId || null : null,
      customZoneName: pricingScope === "zone" && customZoneName.trim() ? customZoneName.trim() : null,
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
      setError(res.message || "Could not save delivery rate.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl space-y-5 animate-in fade-in-50 zoom-in-95 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
            Add Delivery Rate
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground text-lg leading-none"
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
          {/* Coverage Scope */}
          <div>
            <Label className="text-xs font-semibold text-foreground">Coverage Area</Label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPricingScope("state")}
                className={cn(
                  "rounded-lg border p-2.5 text-center transition-colors flex flex-col items-center justify-center gap-0.5",
                  pricingScope === "state"
                    ? "border-primary bg-primary/10 text-primary font-bold ring-1 ring-primary"
                    : "border-border/60 bg-muted/20 text-muted-foreground hover:border-primary/40",
                )}
              >
                <span className="text-xs">All LGAs</span>
                <span className="text-[10px] font-normal opacity-80">(State-wide)</span>
              </button>
              <button
                type="button"
                onClick={() => setPricingScope("lga")}
                className={cn(
                  "rounded-lg border p-2.5 text-center transition-colors flex flex-col items-center justify-center gap-0.5",
                  pricingScope === "lga"
                    ? "border-primary bg-primary/10 text-primary font-bold ring-1 ring-primary"
                    : "border-border/60 bg-muted/20 text-muted-foreground hover:border-primary/40",
                )}
              >
                <span className="text-xs">Single LGA</span>
                <span className="text-[10px] font-normal opacity-80">(Specific LGA)</span>
              </button>
              <button
                type="button"
                onClick={() => setPricingScope("zone")}
                className={cn(
                  "rounded-lg border p-2.5 text-center transition-colors flex flex-col items-center justify-center gap-0.5",
                  pricingScope === "zone"
                    ? "border-primary bg-primary/10 text-primary font-bold ring-1 ring-primary"
                    : "border-border/60 bg-muted/20 text-muted-foreground hover:border-primary/40",
                )}
              >
                <span className="text-xs">Neighborhood</span>
                <span className="text-[10px] font-normal opacity-80">(Linked to LGA)</span>
              </button>
            </div>
          </div>

          {/* State */}
          <div>
            <Label className="text-xs font-semibold text-foreground">State</Label>
            <select
              value={stateId}
              onChange={(e) => {
                setStateId(e.target.value);
                setLgaId("");
                setDeliveryZoneId("");
                setCustomZoneName("");
              }}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-card px-3 text-xs shadow-sm font-medium"
            >
              {states.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* LGA (if not state-wide) */}
          {pricingScope !== "state" && (
            <div>
              <Label className="text-xs font-semibold text-foreground">
                Local Government Area (LGA) <span className="text-destructive">*</span>
              </Label>
              <select
                value={lgaId}
                onChange={(e) => {
                  setLgaId(e.target.value);
                  setDeliveryZoneId("");
                }}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-card px-3 text-xs shadow-sm font-medium"
                required
              >
                <option value="">Select Local Government Area (LGA)</option>
                {availableLgas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Neighborhood Name */}
          {pricingScope === "zone" && (
            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
              {!lgaId ? (
                <p className="text-xs text-muted-foreground italic">
                  Please select an LGA above first to view or add neighborhoods in that LGA.
                </p>
              ) : (
                <>
                  <div>
                    <Label className="text-xs font-bold text-foreground">
                      Neighborhood or City Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={customZoneName}
                      onChange={(e) => {
                        setCustomZoneName(e.target.value);
                        if (e.target.value) setDeliveryZoneId("");
                      }}
                      placeholder={`e.g. Specific area in ${lgas.find((l) => l.id === lgaId)?.name || "LGA"}`}
                      className="mt-1 font-medium bg-background text-xs"
                    />
                  </div>

                  {availableZones.length > 0 && (
                    <div className="border-t border-border/40 pt-2">
                      <Label className="text-[11px] font-medium text-muted-foreground">Or pick existing:</Label>
                      <select
                        value={deliveryZoneId}
                        onChange={(e) => {
                          setDeliveryZoneId(e.target.value);
                          if (e.target.value) setCustomZoneName("");
                        }}
                        className="mt-1 flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
                      >
                        <option value="">Select existing neighborhood</option>
                        {availableZones.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Price & Free Over */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-foreground">Delivery Fee in ₦ (Naira) *</Label>
              <Input
                type="number"
                min="0"
                step="50"
                value={priceNaira}
                onChange={(e) => setPriceNaira(e.target.value)}
                placeholder="e.g. 2500"
                className="mt-1 text-xs font-mono font-medium"
                required
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-foreground">Free Delivery Over (₦, Optional)</Label>
              <Input
                type="number"
                min="0"
                step="500"
                value={freeShippingThresholdNaira}
                onChange={(e) => setFreeShippingThresholdNaira(e.target.value)}
                placeholder="e.g. 50000"
                className="mt-1 text-xs font-mono"
              />
            </div>
          </div>

          {/* Delivery Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-foreground">Min Days</Label>
              <Input
                type="number"
                min="0"
                value={minDays}
                onChange={(e) => setMinDays(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-foreground">Max Days</Label>
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
              {submitting ? "Saving…" : "Save Delivery Rate"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EDIT DELIVERY RATE MODAL
// ---------------------------------------------------------------------------

function EditRateModal({
  rate,
  states,
  lgas,
  zones,
  onClose,
  onUpdated,
}: {
  rate: ShippingRate;
  states: NigerianState[];
  lgas: NigerianLga[];
  zones: DeliveryZone[];
  onClose: () => void;
  onUpdated: (fields: Partial<ShippingRate>) => void;
}) {
  const state = states.find((s) => s.id === rate.state_id);
  const lga = lgas.find((l) => l.id === rate.lga_id);
  const zone = zones.find((z) => z.id === rate.delivery_zone_id);

  const destinationLabel = zone?.name
    ? `${zone.name} (${lga?.name ? lga.name + ", " : ""}${state?.name || ""})`
    : lga?.name
      ? `${lga.name}, ${state?.name || ""}`
      : `${state?.name || "State"} (All LGAs)`;

  const [priceNaira, setPriceNaira] = useState(String(Math.round(rate.price_kobo / 100)));
  const [freeShippingThresholdNaira, setFreeShippingThresholdNaira] = useState(
    rate.free_shipping_threshold_kobo
      ? String(Math.round(rate.free_shipping_threshold_kobo / 100))
      : "",
  );
  const [minDays, setMinDays] = useState(String(rate.estimated_min_days ?? "1"));
  const [maxDays, setMaxDays] = useState(String(rate.estimated_max_days ?? "3"));
  const [isActive, setIsActive] = useState(rate.is_active);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const parsedPrice = parseFloat(priceNaira);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setError("Please enter a valid delivery fee in Naira.");
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
      setError(res.message || "Failed to update delivery rate.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4 animate-in fade-in-50 zoom-in-95">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div>
            <h2 className="font-display text-base font-bold tracking-tight text-foreground">
              Edit Delivery Rate
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{destinationLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground text-lg leading-none"
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
              <Label className="text-xs font-semibold text-foreground">Delivery Fee in ₦ *</Label>
              <Input
                type="number"
                min="0"
                step="50"
                value={priceNaira}
                onChange={(e) => setPriceNaira(e.target.value)}
                className="mt-1 text-xs font-mono font-medium"
                required
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-foreground">Free Over (₦)</Label>
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
              <Label className="text-xs font-medium text-foreground">Min Days</Label>
              <Input
                type="number"
                min="0"
                value={minDays}
                onChange={(e) => setMinDays(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-foreground">Max Days</Label>
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
            <span className="text-xs font-medium text-foreground">Active for Customer Checkout</span>
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
// ADD PICKUP LOCATION MODAL
// ---------------------------------------------------------------------------

function AddStoreModal({
  states,
  onClose,
  onCreated,
}: {
  states: NigerianState[];
  onClose: () => void;
  onCreated: (store: PickupLocation) => void;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [city, setCity] = useState("");
  const [stateId, setStateId] = useState(states[0]?.id || "");
  const [phone, setPhone] = useState("");
  const [hours, setHours] = useState("Mon–Sat 9:00 AM – 7:00 PM");
  const [instructions, setInstructions] = useState(
    "Ready for collection within 24 hours of payment. Please bring your Order ID.",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    if (!name.trim()) {
      setError("Please enter a store name.");
      return;
    }
    if (!address.trim()) {
      setError("Please enter a street address.");
      return;
    }
    if (!city.trim()) {
      setError("Please enter the city or area.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const res = await createPickupLocationAction({
      name: name.trim(),
      address: address.trim(),
      landmark: landmark.trim() || null,
      city: city.trim(),
      stateId: stateId || null,
      phone: phone.trim() || null,
      operatingHours: hours.trim() || null,
      instructions: instructions.trim() || null,
      isActive: true,
    });

    setSubmitting(false);

    if (res.ok && res.location) {
      onCreated(res.location);
    } else {
      setError(res.message || "Failed to create pickup location.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4 animate-in fade-in-50 zoom-in-95 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
            Add Pickup Location
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <Label className="text-xs font-semibold text-foreground">Store Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lekki Store"
              className="mt-1"
              required
            />
          </div>

          <div>
            <Label className="text-xs font-semibold text-foreground">Street Address *</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Plot 14, Admiralty Way"
              className="mt-1"
              required
            />
          </div>

          <div>
            <Label className="text-xs font-bold text-foreground">Landmark *</Label>
            <Input
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
              placeholder="e.g. Opposite Zenith Bank, Near Filmhouse Cinema"
              className="mt-1 font-medium bg-background"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-foreground">City / Town *</Label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Lekki Phase 1"
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-foreground">State</Label>
              <select
                value={stateId}
                onChange={(e) => setStateId(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-card px-3 text-xs shadow-sm font-medium"
              >
                {states.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-foreground">Contact Phone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="080 1234 5678"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-foreground">Opening Hours</Label>
              <Input
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="Mon–Sat 9:00 AM – 7:00 PM"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium text-foreground">Collection Instructions (Optional)</Label>
            <textarea
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="mt-1 flex w-full rounded-md border border-input bg-card px-3 py-2 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border/60">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Saving…" : "Save Location"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EDIT PICKUP LOCATION MODAL
// ---------------------------------------------------------------------------

function EditStoreModal({
  store,
  states,
  onClose,
  onUpdated,
}: {
  store: PickupLocation;
  states: NigerianState[];
  onClose: () => void;
  onUpdated: (store: PickupLocation) => void;
}) {
  const [name, setName] = useState(store.name);
  const [address, setAddress] = useState(store.address);
  const [landmark, setLandmark] = useState(store.landmark || "");
  const [city, setCity] = useState(store.city);
  const [stateId, setStateId] = useState(store.state_id || states[0]?.id || "");
  const [phone, setPhone] = useState(store.phone || "");
  const [hours, setHours] = useState(store.operating_hours || "");
  const [instructions, setInstructions] = useState(store.instructions || "");
  const [isActive, setIsActive] = useState(store.is_active);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    if (!name.trim()) {
      setError("Please enter a store name.");
      return;
    }
    if (!address.trim()) {
      setError("Please enter a street address.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const res = await updatePickupLocationAction(store.id, {
      name: name.trim(),
      address: address.trim(),
      landmark: landmark.trim() || null,
      city: city.trim(),
      state_id: stateId || null,
      phone: phone.trim() || null,
      operating_hours: hours.trim() || null,
      instructions: instructions.trim() || null,
      is_active: isActive,
    });

    setSubmitting(false);

    if (res.ok) {
      onUpdated({
        ...store,
        name: name.trim(),
        address: address.trim(),
        landmark: landmark.trim() || null,
        city: city.trim(),
        state_id: stateId || null,
        phone: phone.trim() || null,
        operating_hours: hours.trim() || null,
        instructions: instructions.trim() || null,
        is_active: isActive,
      });
    } else {
      setError(res.message || "Failed to update pickup location.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4 animate-in fade-in-50 zoom-in-95 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
            Edit Pickup Location
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <Label className="text-xs font-semibold text-foreground">Store Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
              required
            />
          </div>

          <div>
            <Label className="text-xs font-semibold text-foreground">Street Address *</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1"
              required
            />
          </div>

          <div>
            <Label className="text-xs font-bold text-foreground">Landmark *</Label>
            <Input
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
              className="mt-1 font-medium bg-background"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-foreground">City / Town *</Label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-foreground">State</Label>
              <select
                value={stateId}
                onChange={(e) => setStateId(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-card px-3 text-xs shadow-sm font-medium"
              >
                {states.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-foreground">Contact Phone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-foreground">Opening Hours</Label>
              <Input
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium text-foreground">Collection Instructions (Optional)</Label>
            <textarea
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="mt-1 flex w-full rounded-md border border-input bg-card px-3 py-2 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
            />
            <span className="text-xs font-medium text-foreground">Active for Customer Checkout</span>
          </label>

          <div className="flex justify-end gap-2 pt-3 border-t border-border/60">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Updating…" : "Update Location"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
