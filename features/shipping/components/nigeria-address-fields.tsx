"use client";

import { useEffect, useState, useMemo } from "react";
import { MapPin, Search, ChevronDown, Check, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { NigerianState, NigerianLga, DeliveryZone } from "../types";
import { BUILTIN_STATES } from "../lib/defaults";

export interface AddressData {
  country: string;
  stateId: string;
  stateName: string;
  lgaId: string;
  lgaName: string;
  deliveryZoneId?: string | null;
  cityName: string;
  streetAddress: string;
  landmark?: string;
  recipientName: string;
  recipientPhone: string;
  deliveryInstructions: string;
}

interface NigeriaAddressFieldsProps {
  states: NigerianState[];
  lgas: NigerianLga[];
  deliveryZones: DeliveryZone[];
  value: AddressData;
  onChange: (data: AddressData) => void;
  errors?: Partial<Record<keyof AddressData, string>>;
}

export function NigeriaAddressFields({
  states,
  lgas,
  deliveryZones,
  value,
  onChange,
  errors = {},
}: NigeriaAddressFieldsProps) {
  // Search filter states for dropdowns
  const [stateSearch, setStateSearch] = useState("");
  const [isStateOpen, setIsStateOpen] = useState(false);

  const [lgaSearch, setLgaSearch] = useState("");
  const [isLgaOpen, setIsLgaOpen] = useState(false);

  const [isManualCity, setIsManualCity] = useState(false);

  // Filtered states
  const filteredStates = useMemo(() => {
    if (!stateSearch.trim()) return states;
    const q = stateSearch.toLowerCase();
    return states.filter((s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q));
  }, [states, stateSearch]);

  // Filtered LGAs for selected state
  const availableLgas = useMemo(() => {
    if (!value.stateId && !value.stateName) return [];

    const stateObj = states.find(
      (s) =>
        s.id === value.stateId ||
        (value.stateName && s.name.toLowerCase() === value.stateName.toLowerCase()),
    );
    const stateName = (value.stateName || stateObj?.name || "").toLowerCase();
    const builtinState = stateName
      ? BUILTIN_STATES.find((s) => s.name.toLowerCase() === stateName)
      : null;

    return lgas.filter((l) => {
      // Direct match
      if (
        value.stateId &&
        (l.state_id === value.stateId || l.state_id.endsWith(value.stateId.slice(-4)))
      ) {
        return true;
      }
      // Match via stateObj
      if (
        stateObj &&
        (l.state_id === stateObj.id || l.state_id.endsWith(stateObj.id.slice(-4)))
      ) {
        return true;
      }
      // Bridge match between DB state and builtin LGA dataset
      if (
        builtinState &&
        (l.state_id === builtinState.id || l.state_id.endsWith(builtinState.id.slice(-4)))
      ) {
        return true;
      }
      return false;
    });
  }, [lgas, states, value.stateId, value.stateName]);

  const filteredLgas = useMemo(() => {
    if (!lgaSearch.trim()) return availableLgas;
    const q = lgaSearch.toLowerCase();
    return availableLgas.filter((l) => l.name.toLowerCase().includes(q));
  }, [availableLgas, lgaSearch]);

  // Available Delivery Zones for selected State and LGA
  const availableZones = useMemo(() => {
    if (!value.stateId && !value.stateName) return [];
    if (!value.lgaId) return [];

    const stateObj = states.find(
      (s) =>
        s.id === value.stateId ||
        (value.stateName && s.name.toLowerCase() === value.stateName.toLowerCase()),
    );
    const stateName = (value.stateName || stateObj?.name || "").toLowerCase();
    const builtinState = stateName
      ? BUILTIN_STATES.find((s) => s.name.toLowerCase() === stateName)
      : null;

    return deliveryZones.filter((z) => {
      const matchState =
        (value.stateId &&
          (z.state_id === value.stateId || z.state_id.endsWith(value.stateId.slice(-4)))) ||
        (stateObj &&
          (z.state_id === stateObj.id || z.state_id.endsWith(stateObj.id.slice(-4)))) ||
        (builtinState &&
          (z.state_id === builtinState.id || z.state_id.endsWith(builtinState.id.slice(-4))));

      if (!matchState) return false;
      // Must match selected LGA
      if (!z.lga_id) return false;
      return z.lga_id === value.lgaId || z.lga_id.endsWith(value.lgaId.slice(-4));
    });
  }, [deliveryZones, states, value.stateId, value.stateName, value.lgaId]);

  function handleStateSelect(selectedState: NigerianState) {
    setIsStateOpen(false);
    setStateSearch("");
    // Changing state clears LGA, delivery zone, and city
    onChange({
      ...value,
      stateId: selectedState.id,
      stateName: selectedState.name,
      lgaId: "",
      lgaName: "",
      deliveryZoneId: null,
      cityName: "",
    });
    setIsManualCity(false);
  }

  function handleLgaSelect(selectedLga: NigerianLga) {
    setIsLgaOpen(false);
    setLgaSearch("");
    // Changing LGA clears previously selected zone if not valid
    onChange({
      ...value,
      lgaId: selectedLga.id,
      lgaName: selectedLga.name,
      deliveryZoneId: null,
      cityName: isManualCity ? value.cityName : selectedLga.name,
    });
  }

  function handleZoneSelect(zone: DeliveryZone | "manual") {
    if (zone === "manual") {
      setIsManualCity(true);
      onChange({
        ...value,
        deliveryZoneId: null,
        cityName: "",
      });
    } else {
      setIsManualCity(false);
      const matchedLga = zone.lga_id ? lgas.find((l) => l.id === zone.lga_id) : null;
      onChange({
        ...value,
        deliveryZoneId: zone.id,
        cityName: zone.name,
        ...(matchedLga ? { lgaId: matchedLga.id, lgaName: matchedLga.name } : {}),
      });
    }
  }

  return (
    <div className="space-y-4">
      {/* Country fixed badge */}
      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3.5 py-2.5 text-xs">
        <span className="flex items-center gap-2 font-medium text-foreground">
          <MapPin className="h-4 w-4 text-primary" /> Delivery Country
        </span>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-semibold text-primary">
          Nigeria 🇳🇬
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Recipient Full Name */}
        <div>
          <Label htmlFor="recipientName" className="text-xs font-medium">
            Recipient Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="recipientName"
            value={value.recipientName}
            onChange={(e) => onChange({ ...value, recipientName: e.target.value })}
            placeholder="Full name for delivery parcel"
            className="mt-1.5"
            aria-invalid={Boolean(errors.recipientName)}
          />
          {errors.recipientName && (
            <p className="mt-1 text-xs text-destructive">{errors.recipientName}</p>
          )}
        </div>

        {/* Recipient Phone */}
        <div>
          <Label htmlFor="recipientPhone" className="text-xs font-medium">
            Delivery Phone Number <span className="text-destructive">*</span>
          </Label>
          <Input
            id="recipientPhone"
            type="tel"
            inputMode="tel"
            value={value.recipientPhone}
            onChange={(e) => {
              // Only allow digits and phone formatting symbols (+, spaces, hyphens) - strip all letters immediately
              const numericOnly = e.target.value.replace(/[^0-9+\s\-()]/g, "");
              onChange({ ...value, recipientPhone: numericOnly });
            }}
            placeholder="080 1234 5678"
            className="mt-1.5"
            aria-invalid={Boolean(errors.recipientPhone)}
          />
          {errors.recipientPhone && (
            <p className="mt-1 text-xs text-destructive">{errors.recipientPhone}</p>
          )}
        </div>
      </div>

      {/* State Selection Dropdown */}
      <div className="relative">
        <Label className="text-xs font-medium">
          State / Territory <span className="text-destructive">*</span>
        </Label>
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => setIsStateOpen(!isStateOpen)}
            className={cn(
              "flex h-10 w-full items-center justify-between rounded-md border border-input bg-card/10 px-3 py-2 text-sm shadow-sm transition-colors hover:border-primary/50 text-left",
              !value.stateName && "text-muted-foreground",
              errors.stateId && "border-destructive",
            )}
          >
            <span>{value.stateName || "Select Nigerian State / FCT"}</span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </button>
        </div>

        {isStateOpen && (
          <div className="absolute z-50 mt-1 max-h-60 w-full overflow-hidden rounded-md border border-border bg-popover shadow-xl animate-in fade-in-50 zoom-in-95">
            <div className="flex items-center border-b border-border/80 px-3 py-2">
              <Search className="mr-2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={stateSearch}
                onChange={(e) => setStateSearch(e.target.value)}
                placeholder="Search state…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                autoFocus
              />
            </div>
            <ul className="max-h-48 overflow-y-auto p-1 text-sm">
              {filteredStates.map((state) => {
                const isSelected = value.stateId === state.id;
                return (
                  <li key={state.id}>
                    <button
                      type="button"
                      onClick={() => handleStateSelect(state)}
                      className={cn(
                        "flex w-full items-center justify-between rounded px-3 py-2 text-left transition-colors hover:bg-accent",
                        isSelected && "bg-primary/10 font-semibold text-primary",
                      )}
                    >
                      <span>{state.name}</span>
                      <span className="text-xs text-muted-foreground">{state.code}</span>
                    </button>
                  </li>
                );
              })}
              {filteredStates.length === 0 && (
                <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No states found matching &quot;{stateSearch}&quot;
                </li>
              )}
            </ul>
          </div>
        )}
        {errors.stateId && (
          <p className="mt-1 text-xs text-destructive">{errors.stateId}</p>
        )}
      </div>

      {/* LGA Selection Dropdown */}
      <div className="relative">
        <Label className="text-xs font-medium">
          Local Government Area (LGA) <span className="text-destructive">*</span>
        </Label>
        <div className="mt-1.5">
          <button
            type="button"
            disabled={!value.stateId}
            onClick={() => setIsLgaOpen(!isLgaOpen)}
            className={cn(
              "flex h-10 w-full items-center justify-between rounded-md border border-input bg-card/10 px-3 py-2 text-sm shadow-sm transition-colors hover:border-primary/50 text-left disabled:cursor-not-allowed disabled:opacity-50",
              !value.lgaName && "text-muted-foreground",
              errors.lgaId && "border-destructive",
            )}
          >
            <span>
              {value.lgaName || (value.stateId ? "Select LGA" : "Select State first")}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </button>
        </div>

        {isLgaOpen && value.stateId && (
          <div className="absolute z-50 mt-1 max-h-60 w-full overflow-hidden rounded-md border border-border bg-popover shadow-xl animate-in fade-in-50 zoom-in-95">
            <div className="flex items-center border-b border-border/80 px-3 py-2">
              <Search className="mr-2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={lgaSearch}
                onChange={(e) => setLgaSearch(e.target.value)}
                placeholder="Search LGA…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                autoFocus
              />
            </div>
            <ul className="max-h-48 overflow-y-auto p-1 text-sm">
              {filteredLgas.map((lga) => {
                const isSelected = value.lgaId === lga.id;
                return (
                  <li key={lga.id}>
                    <button
                      type="button"
                      onClick={() => handleLgaSelect(lga)}
                      className={cn(
                        "flex w-full items-center justify-between rounded px-3 py-2 text-left transition-colors hover:bg-accent",
                        isSelected && "bg-primary/10 font-semibold text-primary",
                      )}
                    >
                      <span>{lga.name}</span>
                      {isSelected && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  </li>
                );
              })}
              {filteredLgas.length === 0 && (
                <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No LGAs found matching &quot;{lgaSearch}&quot;
                </li>
              )}
            </ul>
          </div>
        )}
        {errors.lgaId && (
          <p className="mt-1 text-xs text-destructive">{errors.lgaId}</p>
        )}
      </div>

      {/* Area / Neighborhood Selection - only shown after LGA is selected */}
      {value.stateId && value.lgaId && (
        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-black dark:text-white">
            Area / Neighborhood <span className="text-muted-foreground font-normal">(Optional)</span>
          </Label>
          {availableZones.length > 0 && !isManualCity ? (
            <div className="space-y-1.5">
              <select
                value={value.deliveryZoneId || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "manual") {
                    handleZoneSelect("manual");
                  } else {
                    const zone = availableZones.find((z) => z.id === val);
                    if (zone) handleZoneSelect(zone);
                  }
                }}
                className="flex h-10 w-full rounded-md border border-input bg-card/10 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-medium"
              >
                <option value="">Select area in {value.lgaName} (optional)</option>
                {availableZones.map((z) => {
                  const feeStr = z.base_price_kobo ? ` — ₦${(z.base_price_kobo / 100).toLocaleString()}` : "";
                  return (
                    <option key={z.id} value={z.id}>
                      {z.name}{feeStr}
                    </option>
                  );
                })}
                <option value="manual">Enter neighborhood/street manually…</option>
              </select>
            </div>
          ) : (
            <div>
              <Input
                value={value.cityName}
                onChange={(e) => onChange({ ...value, cityName: e.target.value, deliveryZoneId: null })}
                placeholder={
                  availableZones.length > 0
                    ? `Specific area or landmark in ${value.lgaName}`
                    : `Area, town or neighborhood in ${value.lgaName}`
                }
              />
              {availableZones.length > 0 && isManualCity && (
                <button
                  type="button"
                  onClick={() => setIsManualCity(false)}
                  className="mt-1 text-xs text-primary underline underline-offset-4"
                >
                  ← Choose from listed areas in {value.lgaName}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Full Street Address */}
      <div>
        <Label htmlFor="streetAddress" className="text-xs font-bold text-black dark:text-white">
          Street Address <span className="text-destructive">*</span>
        </Label>
        <textarea
          id="streetAddress"
          rows={2}
          value={value.streetAddress}
          onChange={(e) => onChange({ ...value, streetAddress: e.target.value })}
          placeholder="House / Apartment / Plot number, Street name"
          className="mt-1.5 flex w-full rounded-md border border-input/60 bg-card/10 px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-invalid={Boolean(errors.streetAddress)}
        />
        {errors.streetAddress && (
          <p className="mt-1 text-xs text-destructive">{errors.streetAddress}</p>
        )}
      </div>

      {/* Landmark */}
      <div>
        <Label htmlFor="landmark" className="text-xs font-bold text-black dark:text-white">
          Landmark or Nearest Bus Stop <span className="text-destructive">*</span>
        </Label>
        <Input
          id="landmark"
          value={value.landmark || ""}
          onChange={(e) => onChange({ ...value, landmark: e.target.value })}
          placeholder="e.g. Near Total Filling Station, Opposite Central Mosque"
          className="mt-1.5 font-medium"
        />
      </div>

      {/* Delivery Instructions (optional) */}
      <div>
        <Label htmlFor="deliveryInstructions" className="text-xs font-medium">
          Delivery Instructions (optional)
        </Label>
        <textarea
          id="deliveryInstructions"
          rows={2}
          value={value.deliveryInstructions}
          onChange={(e) =>
            onChange({ ...value, deliveryInstructions: e.target.value })
          }
          placeholder="Landmark, security gate instructions, preferred drop-off time…"
          className="mt-1.5 flex w-full rounded-md border border-input/60 bg-card/10 px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
    </div>
  );
}
