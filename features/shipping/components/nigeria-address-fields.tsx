"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { MapPin, Search, ChevronDown, Check, Building2, X } from "lucide-react";
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
  // Dropdown open states
  const [isStateOpen, setIsStateOpen] = useState(false);
  const [stateSearch, setStateSearch] = useState("");

  const [isLgaOpen, setIsLgaOpen] = useState(false);
  const [lgaSearch, setLgaSearch] = useState("");

  const [isZoneOpen, setIsZoneOpen] = useState(false);
  const [zoneSearch, setZoneSearch] = useState("");

  const [isManualCity, setIsManualCity] = useState(false);

  // Refs for outside click tracking
  const stateDropdownRef = useRef<HTMLDivElement>(null);
  const lgaDropdownRef = useRef<HTMLDivElement>(null);
  const zoneDropdownRef = useRef<HTMLDivElement>(null);

  // Click outside and escape key dismiss listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (stateDropdownRef.current && !stateDropdownRef.current.contains(target)) {
        setIsStateOpen(false);
      }
      if (lgaDropdownRef.current && !lgaDropdownRef.current.contains(target)) {
        setIsLgaOpen(false);
      }
      if (zoneDropdownRef.current && !zoneDropdownRef.current.contains(target)) {
        setIsZoneOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsStateOpen(false);
        setIsLgaOpen(false);
        setIsZoneOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

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
      if (
        value.stateId &&
        (l.state_id === value.stateId || l.state_id.endsWith(value.stateId.slice(-4)))
      ) {
        return true;
      }
      if (
        stateObj &&
        (l.state_id === stateObj.id || l.state_id.endsWith(stateObj.id.slice(-4)))
      ) {
        return true;
      }
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
      if (!z.lga_id) return false;
      return z.lga_id === value.lgaId || z.lga_id.endsWith(value.lgaId.slice(-4));
    });
  }, [deliveryZones, states, value.stateId, value.stateName, value.lgaId]);

  const filteredZones = useMemo(() => {
    if (!zoneSearch.trim()) return availableZones;
    const q = zoneSearch.toLowerCase();
    return availableZones.filter((z) => z.name.toLowerCase().includes(q));
  }, [availableZones, zoneSearch]);

  function handleStateSelect(selectedState: NigerianState) {
    setIsStateOpen(false);
    setStateSearch("");
    setIsLgaOpen(false);
    setIsZoneOpen(false);
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
    setIsZoneOpen(false);
    onChange({
      ...value,
      lgaId: selectedLga.id,
      lgaName: selectedLga.name,
      deliveryZoneId: null,
      cityName: isManualCity ? value.cityName : selectedLga.name,
    });
  }

  function handleZoneSelect(zone: DeliveryZone | "manual") {
    setIsZoneOpen(false);
    setZoneSearch("");
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

  const activeZoneObj = availableZones.find((z) => z.id === value.deliveryZoneId);

  return (
    <div className="space-y-4">
      {/* Country fixed badge - Boojy Sharp Architecture */}
      <div className="flex items-center justify-between border border-border bg-muted/30 px-3.5 py-2.5 text-xs rounded-none">
        <span className="flex items-center gap-2 font-display font-semibold uppercase tracking-wider text-foreground">
          <MapPin className="h-3.5 w-3.5 text-primary" /> Delivery Country
        </span>
        <span className="border border-border bg-background px-2.5 py-0.5 text-[11px] font-mono font-semibold uppercase tracking-wider text-foreground rounded-none">
          Nigeria 🇳🇬
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Recipient Full Name */}
        <div>
          <Label htmlFor="recipientName" className="font-display text-xs font-semibold uppercase tracking-wider text-foreground">
            Recipient Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="recipientName"
            value={value.recipientName}
            onChange={(e) => onChange({ ...value, recipientName: e.target.value })}
            placeholder="Full name for delivery parcel"
            className="mt-1.5 rounded-none border-border bg-background font-medium focus:border-foreground"
            aria-invalid={Boolean(errors.recipientName)}
          />
          {errors.recipientName && (
            <p className="mt-1 text-xs text-destructive">{errors.recipientName}</p>
          )}
        </div>

        {/* Recipient Phone */}
        <div>
          <Label htmlFor="recipientPhone" className="font-display text-xs font-semibold uppercase tracking-wider text-foreground">
            Delivery Phone Number <span className="text-destructive">*</span>
          </Label>
          <Input
            id="recipientPhone"
            type="tel"
            inputMode="tel"
            value={value.recipientPhone}
            onChange={(e) => {
              const numericOnly = e.target.value.replace(/[^0-9+\s\-()]/g, "");
              onChange({ ...value, recipientPhone: numericOnly });
            }}
            placeholder="080 1234 5678"
            className="mt-1.5 rounded-none border-border bg-background font-medium focus:border-foreground"
            aria-invalid={Boolean(errors.recipientPhone)}
          />
          {errors.recipientPhone && (
            <p className="mt-1 text-xs text-destructive">{errors.recipientPhone}</p>
          )}
        </div>
      </div>

      {/* State Selection Dropdown - UI Adapted with Outside-Click & Sharp Styling */}
      <div ref={stateDropdownRef} className="relative">
        <Label className="font-display text-xs font-semibold uppercase tracking-wider text-foreground">
          State / Territory <span className="text-destructive">*</span>
        </Label>
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => {
              setIsStateOpen((prev) => !prev);
              setIsLgaOpen(false);
              setIsZoneOpen(false);
            }}
            aria-haspopup="listbox"
            aria-expanded={isStateOpen}
            className={cn(
              "flex h-11 w-full items-center justify-between border border-border bg-background px-3.5 py-2.5 text-sm transition-colors rounded-none text-left",
              "hover:border-foreground/50 focus:border-foreground focus:outline-none",
              isStateOpen && "border-foreground bg-muted/20 ring-1 ring-foreground/20",
              !value.stateName && "text-muted-foreground",
              errors.stateId && "border-destructive",
            )}
          >
            <span className="truncate font-medium">
              {value.stateName ? value.stateName : "Select Nigerian State / FCT"}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 transition-transform duration-200 text-muted-foreground",
                isStateOpen && "rotate-180 text-foreground",
              )}
            />
          </button>
        </div>

        {/* Dropdown Popover */}
        {isStateOpen && (
          <div
            role="listbox"
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-hidden border border-border bg-background shadow-2xl rounded-none animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center border-b border-border bg-muted/30 px-3 py-2">
              <Search className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
              <input
                type="text"
                value={stateSearch}
                onChange={(e) => setStateSearch(e.target.value)}
                placeholder="Search state name or code…"
                className="w-full bg-transparent text-xs sm:text-sm outline-none placeholder:text-muted-foreground font-medium"
                autoFocus
              />
              {stateSearch && (
                <button
                  type="button"
                  onClick={() => setStateSearch("")}
                  className="text-muted-foreground hover:text-foreground p-0.5"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <ul className="max-h-52 overflow-y-auto divide-y divide-border/20 py-1 text-sm">
              {filteredStates.map((state) => {
                const isSelected = value.stateId === state.id;
                return (
                  <li key={state.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleStateSelect(state)}
                      className={cn(
                        "flex w-full items-center justify-between px-3.5 py-2.5 text-left transition-colors rounded-none font-medium",
                        isSelected
                          ? "bg-foreground text-background font-semibold hover:bg-foreground hover:text-background"
                          : "text-foreground hover:bg-muted/60",
                      )}
                    >
                      <span className="font-display tracking-tight">{state.name}</span>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "text-[10px] font-mono uppercase px-1.5 py-0.5 border",
                            isSelected
                              ? "border-background/30 text-background/90"
                              : "border-border text-muted-foreground bg-muted/40",
                          )}
                        >
                          {state.code}
                        </span>
                        {isSelected && <Check className="h-4 w-4 shrink-0" />}
                      </div>
                    </button>
                  </li>
                );
              })}
              {filteredStates.length === 0 && (
                <li className="px-3 py-6 text-center text-xs text-muted-foreground">
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

      {/* LGA Selection Dropdown - UI Adapted with Outside-Click & Sharp Styling */}
      <div ref={lgaDropdownRef} className="relative">
        <Label className="font-display text-xs font-semibold uppercase tracking-wider text-foreground">
          Local Government Area (LGA) <span className="text-destructive">*</span>
        </Label>
        <div className="mt-1.5">
          <button
            type="button"
            disabled={!value.stateId}
            onClick={() => {
              if (!value.stateId) return;
              setIsLgaOpen((prev) => !prev);
              setIsStateOpen(false);
              setIsZoneOpen(false);
            }}
            aria-haspopup="listbox"
            aria-expanded={isLgaOpen}
            className={cn(
              "flex h-11 w-full items-center justify-between border border-border bg-background px-3.5 py-2.5 text-sm transition-colors rounded-none text-left",
              "hover:border-foreground/50 focus:border-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
              isLgaOpen && "border-foreground bg-muted/20 ring-1 ring-foreground/20",
              !value.lgaName && "text-muted-foreground",
              errors.lgaId && "border-destructive",
            )}
          >
            <span className="truncate font-medium">
              {value.lgaName
                ? value.lgaName
                : value.stateId
                  ? "Select Local Government Area"
                  : "Select State first"}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 transition-transform duration-200 text-muted-foreground",
                isLgaOpen && "rotate-180 text-foreground",
              )}
            />
          </button>
        </div>

        {/* Dropdown Popover */}
        {isLgaOpen && value.stateId && (
          <div
            role="listbox"
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-hidden border border-border bg-background shadow-2xl rounded-none animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center border-b border-border bg-muted/30 px-3 py-2">
              <Search className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
              <input
                type="text"
                value={lgaSearch}
                onChange={(e) => setLgaSearch(e.target.value)}
                placeholder={`Search LGA in ${value.stateName || "State"}…`}
                className="w-full bg-transparent text-xs sm:text-sm outline-none placeholder:text-muted-foreground font-medium"
                autoFocus
              />
              {lgaSearch && (
                <button
                  type="button"
                  onClick={() => setLgaSearch("")}
                  className="text-muted-foreground hover:text-foreground p-0.5"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <ul className="max-h-52 overflow-y-auto divide-y divide-border/20 py-1 text-sm">
              {filteredLgas.map((lga) => {
                const isSelected = value.lgaId === lga.id;
                return (
                  <li key={lga.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleLgaSelect(lga)}
                      className={cn(
                        "flex w-full items-center justify-between px-3.5 py-2.5 text-left transition-colors rounded-none font-medium",
                        isSelected
                          ? "bg-foreground text-background font-semibold hover:bg-foreground hover:text-background"
                          : "text-foreground hover:bg-muted/60",
                      )}
                    >
                      <span className="font-display tracking-tight">{lga.name}</span>
                      {isSelected && <Check className="h-4 w-4 shrink-0" />}
                    </button>
                  </li>
                );
              })}
              {filteredLgas.length === 0 && (
                <li className="px-3 py-6 text-center text-xs text-muted-foreground">
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

      {/* Area / Neighborhood Selection - Dropdown adapted to Boojy UI */}
      {value.stateId && value.lgaId && (
        <div className="space-y-1.5">
          <Label className="font-display text-xs font-semibold uppercase tracking-wider text-foreground">
            Area / Neighborhood <span className="text-muted-foreground font-normal">(Optional)</span>
          </Label>

          {availableZones.length > 0 && !isManualCity ? (
            <div ref={zoneDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsZoneOpen((prev) => !prev);
                  setIsStateOpen(false);
                  setIsLgaOpen(false);
                }}
                aria-haspopup="listbox"
                aria-expanded={isZoneOpen}
                className={cn(
                  "flex h-11 w-full items-center justify-between border border-border bg-background px-3.5 py-2.5 text-sm transition-colors rounded-none text-left",
                  "hover:border-foreground/50 focus:border-foreground focus:outline-none",
                  isZoneOpen && "border-foreground bg-muted/20 ring-1 ring-foreground/20",
                  !value.deliveryZoneId && "text-muted-foreground",
                )}
              >
                <span className="truncate font-medium">
                  {activeZoneObj
                    ? `${activeZoneObj.name}${activeZoneObj.base_price_kobo ? ` (₦${(activeZoneObj.base_price_kobo / 100).toLocaleString()})` : ""}`
                    : `Select area in ${value.lgaName} (optional)`}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 transition-transform duration-200 text-muted-foreground",
                    isZoneOpen && "rotate-180 text-foreground",
                  )}
                />
              </button>

              {isZoneOpen && (
                <div
                  role="listbox"
                  className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-hidden border border-border bg-background shadow-2xl rounded-none animate-in fade-in zoom-in-95 duration-150"
                >
                  <div className="flex items-center border-b border-border bg-muted/30 px-3 py-2">
                    <Search className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
                    <input
                      type="text"
                      value={zoneSearch}
                      onChange={(e) => setZoneSearch(e.target.value)}
                      placeholder={`Search area in ${value.lgaName}…`}
                      className="w-full bg-transparent text-xs sm:text-sm outline-none placeholder:text-muted-foreground font-medium"
                      autoFocus
                    />
                    {zoneSearch && (
                      <button
                        type="button"
                        onClick={() => setZoneSearch("")}
                        className="text-muted-foreground hover:text-foreground p-0.5"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <ul className="max-h-52 overflow-y-auto divide-y divide-border/20 py-1 text-sm">
                    {filteredZones.map((z) => {
                      const isSelected = value.deliveryZoneId === z.id;
                      const feeStr = z.base_price_kobo ? `₦${(z.base_price_kobo / 100).toLocaleString()}` : null;
                      return (
                        <li key={z.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => handleZoneSelect(z)}
                            className={cn(
                              "flex w-full items-center justify-between px-3.5 py-2.5 text-left transition-colors rounded-none font-medium",
                              isSelected
                                ? "bg-foreground text-background font-semibold hover:bg-foreground hover:text-background"
                                : "text-foreground hover:bg-muted/60",
                            )}
                          >
                            <span className="font-display tracking-tight">{z.name}</span>
                            <div className="flex items-center gap-2">
                              {feeStr && (
                                <span className={cn("text-xs font-mono font-semibold", isSelected ? "text-background/90" : "text-muted-foreground")}>
                                  {feeStr}
                                </span>
                              )}
                              {isSelected && <Check className="h-4 w-4 shrink-0" />}
                            </div>
                          </button>
                        </li>
                      );
                    })}

                    {/* Manual option item */}
                    <li>
                      <button
                        type="button"
                        onClick={() => handleZoneSelect("manual")}
                        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left transition-colors text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground border-t border-border/40 font-mono uppercase tracking-wider"
                      >
                        <span>+ Enter neighborhood manually…</span>
                      </button>
                    </li>
                  </ul>
                </div>
              )}
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
                className="rounded-none border-border bg-background font-medium focus:border-foreground"
              />
              {availableZones.length > 0 && isManualCity && (
                <button
                  type="button"
                  onClick={() => setIsManualCity(false)}
                  className="mt-1.5 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground font-mono"
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
        <Label htmlFor="streetAddress" className="font-display text-xs font-semibold uppercase tracking-wider text-foreground">
          Street Address <span className="text-destructive">*</span>
        </Label>
        <textarea
          id="streetAddress"
          rows={2}
          value={value.streetAddress}
          onChange={(e) => onChange({ ...value, streetAddress: e.target.value })}
          placeholder="House / Apartment / Plot number, Street name"
          className="mt-1.5 flex w-full rounded-none border border-border bg-background px-3.5 py-2.5 text-sm font-medium transition-colors placeholder:text-muted-foreground focus:border-foreground focus:outline-none focus:ring-0"
          aria-invalid={Boolean(errors.streetAddress)}
        />
        {errors.streetAddress && (
          <p className="mt-1 text-xs text-destructive">{errors.streetAddress}</p>
        )}
      </div>

      {/* Landmark */}
      <div>
        <Label htmlFor="landmark" className="font-display text-xs font-semibold uppercase tracking-wider text-foreground">
          Landmark or Nearest Bus Stop <span className="text-destructive">*</span>
        </Label>
        <Input
          id="landmark"
          value={value.landmark || ""}
          onChange={(e) => onChange({ ...value, landmark: e.target.value })}
          placeholder="e.g. Near Total Filling Station, Opposite Central Mosque"
          className="mt-1.5 rounded-none border-border bg-background font-medium focus:border-foreground"
        />
      </div>

      {/* Delivery Instructions (optional) */}
      <div>
        <Label htmlFor="deliveryInstructions" className="font-display text-xs font-semibold uppercase tracking-wider text-foreground">
          Delivery Instructions <span className="text-muted-foreground font-normal">(Optional)</span>
        </Label>
        <textarea
          id="deliveryInstructions"
          rows={2}
          value={value.deliveryInstructions}
          onChange={(e) =>
            onChange({ ...value, deliveryInstructions: e.target.value })
          }
          placeholder="Landmark, security gate instructions, preferred drop-off time…"
          className="mt-1.5 flex w-full rounded-none border border-border bg-background px-3.5 py-2.5 text-sm font-medium transition-colors placeholder:text-muted-foreground focus:border-foreground focus:outline-none focus:ring-0"
        />
      </div>
    </div>
  );
}
