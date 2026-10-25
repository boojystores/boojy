"use client";

import { useState, useTransition } from "react";
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  CreditCard,
  Edit2,
  Eye,
  EyeOff,
  Plus,
  Radio,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import {
  type PaymentMethodConfig,
  type PaymentMethodId,
} from "@/features/checkout/lib/payment-methods";
import {
  addPaymentMethodAction,
  deletePaymentMethodAction,
  togglePaymentMethodAction,
  updatePaymentMethodAction,
} from "@/features/admin/actions/payments";
import { Toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type PaymentsManagerProps = {
  initialMethods: PaymentMethodConfig[];
};

export function PaymentsManager({ initialMethods }: PaymentsManagerProps) {
  const [methods, setMethods] = useState<PaymentMethodConfig[]>(initialMethods);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  // Edit Modal State
  const [editingMethod, setEditingMethod] = useState<PaymentMethodConfig | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editHint, setEditHint] = useState("");
  const [editBadge, setEditBadge] = useState("");
  const [editInstructions, setEditInstructions] = useState("");

  // Add Method Modal State
  const [isAdding, setIsAdding] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newHint, setNewHint] = useState("");
  const [newBadge, setNewBadge] = useState("");
  const [newEnabled, setNewEnabled] = useState(true);

  const activeCount = methods.filter((m) => m.enabled).length;
  const disabledCount = methods.length - activeCount;

  function getMethodIcon(id: string) {
    if (id === "bachs") return <CreditCard className="h-5 w-5 text-indigo-500" />;
    if (id === "ewallet") return <Smartphone className="h-5 w-5 text-emerald-500" />;
    if (id === "bank_transfer") return <Building2 className="h-5 w-5 text-amber-500" />;
    return <Wallet className="h-5 w-5 text-sky-500" />;
  }

  function handleToggle(method: PaymentMethodConfig) {
    const nextState = !method.enabled;

    // Optimistic UI update
    setMethods((prev) =>
      prev.map((m) => (m.id === method.id ? { ...m, enabled: nextState } : m)),
    );

    startTransition(async () => {
      try {
        const res = await togglePaymentMethodAction(method.id, nextState);
        if (res.ok) {
          setMethods(res.methods);
          setToast({
            message: nextState
              ? `"${method.name}" is now live on storefront checkout`
              : `"${method.name}" is now disabled and hidden from checkout`,
            tone: "success",
          });
        } else {
          // Revert
          setMethods((prev) =>
            prev.map((m) => (m.id === method.id ? { ...m, enabled: !nextState } : m)),
          );
          setToast({ message: res.message || "Failed to update payment method", tone: "error" });
        }
      } catch {
        // Revert
        setMethods((prev) =>
          prev.map((m) => (m.id === method.id ? { ...m, enabled: !nextState } : m)),
        );
        setToast({ message: "Network error while updating payment method", tone: "error" });
      }
    });
  }

  function openEditModal(method: PaymentMethodConfig) {
    setEditingMethod(method);
    setEditName(method.name);
    setEditDescription(method.description);
    setEditHint(method.hint);
    setEditBadge(method.badge || "");
    setEditInstructions(method.instructions || "");
  }

  function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingMethod) return;

    startTransition(async () => {
      const res = await updatePaymentMethodAction(editingMethod.id, {
        name: editName.trim() || editingMethod.name,
        description: editDescription.trim(),
        hint: editHint.trim() || editingMethod.hint,
        badge: editBadge.trim() || undefined,
        instructions: editInstructions.trim() || undefined,
      });

      if (res.ok) {
        setMethods(res.methods);
        setToast({ message: `Updated "${editName}" settings`, tone: "success" });
        setEditingMethod(null);
      } else {
        setToast({ message: res.message || "Failed to save changes", tone: "error" });
      }
    });
  }

  function handleAddMethod(e: React.FormEvent) {
    e.preventDefault();
    const cleanId = newId.trim().toLowerCase().replace(/\s+/g, "_");
    if (!cleanId || !newName.trim()) {
      setToast({ message: "ID and Display Name are required", tone: "error" });
      return;
    }

    startTransition(async () => {
      const res = await addPaymentMethodAction({
        id: cleanId,
        name: newName.trim(),
        description: newDescription.trim() || "Custom payment method",
        hint: newHint.trim() || "Select to pay with " + newName.trim(),
        badge: newBadge.trim() || "Custom",
        enabled: newEnabled,
        supportedCurrencies: ["NGN"],
      });

      if (res.ok) {
        setMethods(res.methods);
        setToast({ message: `Added new payment method "${newName}"`, tone: "success" });
        setIsAdding(false);
        setNewId("");
        setNewName("");
        setNewDescription("");
        setNewHint("");
        setNewBadge("");
        setNewEnabled(true);
      } else {
        setToast({ message: res.message || "Failed to add payment method", tone: "error" });
      }
    });
  }

  function handleDeleteCustom(id: string, name: string) {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;

    startTransition(async () => {
      const res = await deletePaymentMethodAction(id);
      if (res.ok) {
        setMethods(res.methods);
        setToast({ message: `Deleted "${name}"`, tone: "success" });
      } else {
        setToast({ message: res.message || "Failed to delete payment method", tone: "error" });
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* Overview Metric Banner */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-card p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Total Gateways
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight">{methods.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">Configured in store</p>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Active on Checkout
            </p>
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
            {activeCount}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Available to shoppers right now</p>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Disabled / Hidden
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-muted-foreground">
            {disabledCount}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Hidden from storefront</p>
        </div>
      </div>

      {/* Warning if all methods are disabled */}
      {activeCount === 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-700 dark:text-amber-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm">
            <strong>Warning:</strong> All payment methods are currently turned OFF. Customers will not
            be able to complete checkout on the storefront until at least one payment method is enabled.
          </p>
        </div>
      )}

      {/* Payment Methods List */}
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Active Payment Options</h2>
            <p className="text-sm text-muted-foreground">
              Toggle any gateway on or off. Changes reflect immediately on the storefront checkout page.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Plus className="h-4 w-4" />
            Add Payment Option
          </button>
        </div>

        <div className="grid gap-4">
          {methods.map((method) => {
            const isCore = ["bachs", "ewallet", "bank_transfer"].includes(method.id);
            return (
              <div
                key={method.id}
                className={cn(
                  "flex flex-col gap-5 rounded-xl border p-5 transition-all sm:flex-row sm:items-start sm:justify-between",
                  method.enabled
                    ? "border-border/80 bg-card shadow-sm hover:border-primary/40"
                    : "border-border/40 bg-muted/20 opacity-80",
                )}
              >
                {/* Left: Info & Live Preview */}
                <div className="flex flex-1 items-start gap-4">
                  <div
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border",
                      method.enabled
                        ? "border-border/80 bg-muted/40 shadow-sm"
                        : "border-border/40 bg-muted/20 grayscale",
                    )}
                  >
                    {getMethodIcon(method.id)}
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-base tracking-tight">{method.name}</h3>
                      {method.badge && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                          {method.badge}
                        </span>
                      )}
                      {method.enabled ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Live on Checkout
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          <EyeOff className="h-3 w-3" />
                          Off (Hidden)
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {method.description}
                    </p>

                    {/* Customer Checkout Preview Box */}
                    <div className="mt-3 rounded-lg border border-border/40 bg-background/50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        Customer Checkout Preview:
                      </p>
                      <div className="flex items-start gap-2.5 rounded-md border border-border/60 bg-card/60 p-2 text-xs">
                        <div
                          className={cn(
                            "mt-0.5 h-3.5 w-3.5 rounded-full border flex items-center justify-center",
                            method.enabled ? "border-primary" : "border-muted-foreground/40",
                          )}
                        >
                          {method.enabled && <div className="h-1.5 w-1.5 rounded-full bg-primary" />}
                        </div>
                        <div>
                          <p className="font-medium">{method.name}</p>
                          <p className="text-[11px] text-muted-foreground">{method.hint}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Actions & Large Toggle Switch */}
                <div className="flex flex-row items-center justify-between sm:flex-col sm:items-end sm:justify-start gap-4 shrink-0 pt-2 sm:pt-0 border-t border-border/40 sm:border-t-0">
                  {/* Toggle Switch */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-muted-foreground">
                      {method.enabled ? "Enabled" : "Disabled"}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={method.enabled}
                      disabled={isPending}
                      onClick={() => handleToggle(method)}
                      className={cn(
                        "relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
                        method.enabled ? "bg-emerald-600" : "bg-neutral-300 dark:bg-neutral-700",
                      )}
                    >
                      <span
                        className={cn(
                          "pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                          method.enabled ? "translate-x-6" : "translate-x-0",
                        )}
                      />
                    </button>
                  </div>

                  {/* Buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(method)}
                      className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Edit2 className="h-3 w-3" />
                      Edit
                    </button>

                    {!isCore && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCustom(method.id, method.name)}
                        className="inline-flex items-center gap-1 rounded-md border border-destructive/20 text-destructive bg-destructive/5 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-destructive hover:text-destructive-foreground"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit Method Modal */}
      {editingMethod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl animate-in fade-in-0 zoom-in-95">
            <div className="flex items-center justify-between border-b border-border/40 pb-4">
              <div>
                <h3 className="font-semibold text-lg">Edit Payment Method</h3>
                <p className="text-xs text-muted-foreground">
                  Identifier: <code className="font-mono">{editingMethod.id}</code>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingMethod(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-foreground">Display Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">Badge (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Instant, Popular, Fast"
                  value={editBadge}
                  onChange={(e) => setEditBadge(e.target.value)}
                  className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">Checkout Hint / Subtitle</label>
                <input
                  type="text"
                  value={editHint}
                  onChange={(e) => setEditHint(e.target.value)}
                  placeholder="Short line shown directly under method on checkout"
                  required
                  className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">Admin Description</label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">Payment Instructions (optional)</label>
                <textarea
                  rows={2}
                  value={editInstructions}
                  onChange={(e) => setEditInstructions(e.target.value)}
                  placeholder="e.g. Bank Account details or Wallet ID to display"
                  className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border/40">
                <button
                  type="button"
                  onClick={() => setEditingMethod(null)}
                  className="rounded-md border border-input bg-background px-4 py-2 text-xs font-medium hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add New Method Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl animate-in fade-in-0 zoom-in-95">
            <div className="flex items-center justify-between border-b border-border/40 pb-4">
              <div>
                <h3 className="font-semibold text-lg">Add New Payment Option</h3>
                <p className="text-xs text-muted-foreground">
                  Integrate any custom payment gateway or wallet method
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddMethod} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-foreground">Unique ID</label>
                  <input
                    type="text"
                    placeholder="e.g. paystack"
                    value={newId}
                    onChange={(e) => setNewId(e.target.value)}
                    required
                    className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground">Badge</label>
                  <input
                    type="text"
                    placeholder="e.g. Instant, USSD, New"
                    value={newBadge}
                    onChange={(e) => setNewBadge(e.target.value)}
                    className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">Display Name</label>
                <input
                  type="text"
                  placeholder="e.g. Paystack Gateway (Card & Apple Pay)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">Checkout Hint</label>
                <input
                  type="text"
                  placeholder="e.g. Pay securely with card, bank, or USSD"
                  value={newHint}
                  onChange={(e) => setNewHint(e.target.value)}
                  required
                  className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">Description</label>
                <textarea
                  rows={2}
                  placeholder="Internal description for your dashboard"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="new-enabled-check"
                  checked={newEnabled}
                  onChange={(e) => setNewEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <label htmlFor="new-enabled-check" className="text-xs font-medium text-foreground cursor-pointer">
                  Activate immediately on checkout
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border/40">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="rounded-md border border-input bg-background px-4 py-2 text-xs font-medium hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  Add Method
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          tone={toast.tone}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
