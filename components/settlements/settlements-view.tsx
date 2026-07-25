"use client";

import { Check, Clock, Shuffle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { DebtFlowRow } from "./debt-flow-row";
import { EmptyState } from "@/components/common/empty-state";
import { PageSkeleton } from "@/components/common/loading";
import { computeDebtFlows } from "@/lib/balances";
import { formatCurrency } from "@/lib/format";
import { balancesWithOthers, suggestedTransfers, usersById } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import {
  useCurrentUser,
  useExpenses,
  useGroups,
  useResolveSettlement,
  useSettlements,
  useUsers,
} from "@/hooks/use-fintrack-data";
import { useUiStore } from "@/stores/ui-store";

export function SettlementsView() {
  const { data: currentUser } = useCurrentUser();
  const { data: users = [] } = useUsers();
  const { data: groups = [] } = useGroups();
  const { data: expenses = [] } = useExpenses();
  const { data: settlements = [] } = useSettlements();
  const resolve = useResolveSettlement();

  const simplify = useUiStore((s) => s.simplifyDebts);
  const toggleSimplify = useUiStore((s) => s.toggleSimplify);
  const openModal = useUiStore((s) => s.openModal);
  const showToast = useUiStore((s) => s.showToast);

  if (!currentUser) return <PageSkeleton />;

  const byId = usersById(users);
  const myBalances = balancesWithOthers(currentUser.id, expenses, settlements);
  const rawFlows = computeDebtFlows(expenses, settlements);
  const simplified = suggestedTransfers(groups, expenses, settlements).flatMap((s) => s.flows);
  const flows = simplify ? simplified : rawFlows;

  const pending = settlements.filter((s) => s.status === "pending");
  const history = settlements.filter((s) => s.status === "confirmed");
  const suggestions = simplified.filter((f) => f.fromUserId === currentUser.id);

  return (
    <div className="mx-auto max-w-[1120px] animate-ft-slide">
      <h2 className="mb-3 text-[15px] font-bold">Your balances</h2>
      {myBalances.length === 0 ? (
        <div className="mb-7">
          <EmptyState
            icon={Check}
            title="All settled up!"
            description="You don't owe anyone, and nobody owes you."
          />
        </div>
      ) : (
        <div className="mb-7 grid gap-4 sm:grid-cols-2">
          {myBalances.map((balance) => {
            const person = byId[balance.userId];
            if (!person) return null;
            const theyOweYou = balance.amount > 0;
            return (
              <div
                key={balance.userId}
                className={cn(
                  "flex items-center gap-4 rounded-xl border-[2.5px] border-ft-ink px-5 py-4.5 shadow-neo",
                  theyOweYou ? "bg-ft-green" : "bg-ft-red"
                )}
              >
                <Avatar user={person} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold">{person.name}</p>
                  <p className="text-[12.5px] font-semibold">
                    {theyOweYou ? "owes you" : "you owe"} · {formatCurrency(Math.abs(balance.amount))}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="bg-ft-bg"
                  onClick={() =>
                    theyOweYou
                      ? showToast(`Reminder sent to ${person.name.split(" ")[0]}`)
                      : openModal({ type: "settle-up", toUserId: person.id })
                  }
                >
                  {theyOweYou ? "Remind" : "Settle"}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {pending.length > 0 && (
        <div className="mb-7 rounded-xl border-[2.5px] border-ft-ink bg-ft-amber-bg px-4.5 py-4 shadow-neo">
          <div className="mb-1 flex items-center gap-2">
            <Clock size={18} strokeWidth={2.4} />
            <span className="text-[15px] font-bold">Pending confirmation</span>
          </div>
          <p className="mb-3.5 text-xs font-medium text-ft-muted">
            Logged payments stay in escrow until the person who received the money confirms it.
          </p>
          <div className="flex flex-col gap-3">
            {pending.map((settlement) => {
              const payer = byId[settlement.fromUserId];
              const payee = byId[settlement.toUserId];
              if (!payer || !payee) return null;
              const iAmPayee = settlement.toUserId === currentUser.id;
              const other = iAmPayee ? payer : payee;
              return (
                <div
                  key={settlement.id}
                  className="flex flex-wrap items-center gap-3 rounded-[9px] border-2 border-ft-ink bg-white px-3.5 py-3"
                >
                  <Avatar user={other} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      {iAmPayee
                        ? `${payer.name.split(" ")[0]} paid you`
                        : `You paid ${payee.name.split(" ")[0]}`}{" "}
                      · {formatCurrency(settlement.amount)}
                    </p>
                    <p className="text-xs font-medium text-ft-muted">
                      {settlement.method} ·{" "}
                      {groups.find((g) => g.id === settlement.groupId)?.name ?? "Group"}
                    </p>
                  </div>
                  {iAmPayee ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="border-2 bg-ft-green"
                        disabled={resolve.isPending}
                        onClick={() =>
                          resolve.mutate(
                            { id: settlement.id, status: "confirmed" },
                            { onSuccess: () => showToast("Payment confirmed") }
                          )
                        }
                      >
                        <Check size={14} strokeWidth={3} />
                        Confirm received
                      </Button>
                      <Button
                        size="icon"
                        variant="secondary"
                        aria-label="Dispute payment"
                        className="h-[34px] w-[34px] border-2"
                        disabled={resolve.isPending}
                        onClick={() =>
                          resolve.mutate(
                            { id: settlement.id, status: "declined" },
                            { onSuccess: () => showToast("Payment disputed") }
                          )
                        }
                      >
                        <X size={15} strokeWidth={2.6} className="text-[#c62828]" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1.5 rounded-full border-2 border-ft-ink bg-ft-amber-chip px-3 py-1.5 text-xs font-bold text-ft-amber-ink">
                        <Clock size={13} strokeWidth={2.6} />
                        Waiting for {payee.name.split(" ")[0]}
                      </span>
                      <Button
                        size="icon"
                        variant="secondary"
                        aria-label="Cancel this logged payment"
                        className="h-[34px] w-[34px] border-2"
                        disabled={resolve.isPending}
                        onClick={() =>
                          resolve.mutate(
                            { id: settlement.id, status: "declined" },
                            { onSuccess: () => showToast("Logged payment cancelled") }
                          )
                        }
                      >
                        <X size={15} strokeWidth={2.6} className="text-[#c62828]" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between gap-2.5">
            <h2 className="text-[15px] font-bold">Debt map</h2>
            <Button
              variant="purple"
              size="sm"
              className="rounded-[20px] border-2"
              onClick={toggleSimplify}
            >
              <Shuffle size={14} strokeWidth={2.6} />
              {simplify ? "Show all debts" : "Simplify debts"}
            </Button>
          </div>
          {simplify && (
            <p className="mb-3 rounded-[10px] border-[2.5px] border-ft-ink bg-ft-lime px-3.5 py-3 text-[13px] font-bold shadow-neo-sm">
              Simplified {rawFlows.length} debts down to {simplified.length} payments.
            </p>
          )}
          <div className="flex flex-col gap-3">
            {flows.length === 0 ? (
              <EmptyState
                icon={Check}
                title="Nothing outstanding"
                description="Every group is fully settled."
              />
            ) : (
              flows.map((flow, i) => (
                <DebtFlowRow
                  key={`${flow.fromUserId}-${flow.toUserId}-${i}`}
                  flow={flow}
                  from={byId[flow.fromUserId]}
                  to={byId[flow.toUserId]}
                />
              ))
            )}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-[15px] font-bold">Suggested settlements</h2>
          {suggestions.length === 0 ? (
            <p className="mb-6 rounded-[10px] border-2 border-ft-ink bg-white px-4 py-4 text-[13px] font-semibold text-ft-muted">
              You have nothing to pay right now.
            </p>
          ) : (
            <div className="mb-6 flex flex-col gap-3">
              {suggestions.map((flow, i) => {
                const person = byId[flow.toUserId];
                if (!person) return null;
                return (
                  <div
                    key={`${flow.toUserId}-${i}`}
                    className="flex items-center gap-3.5 rounded-[10px] border-[2.5px] border-ft-ink bg-ft-lime px-4 py-3.5 shadow-neo-sm"
                  >
                    <Avatar user={person} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold">
                        Pay {person.name.split(" ")[0]} {formatCurrency(flow.amount)}
                      </p>
                      <p className="text-xs font-semibold">clears your balance with them</p>
                    </div>
                    <Button
                      variant="ink"
                      size="sm"
                      onClick={() => openModal({ type: "settle-up", toUserId: person.id })}
                    >
                      Settle
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          <h2 className="mb-3 text-[15px] font-bold">History</h2>
          <div className="flex flex-col gap-2.5">
            {history.length === 0 ? (
              <p className="rounded-[10px] border-2 border-ft-ink bg-white px-4 py-4 text-[13px] font-semibold text-ft-muted">
                No confirmed settlements yet.
              </p>
            ) : (
              history.map((settlement) => {
                const payer = byId[settlement.fromUserId];
                const payee = byId[settlement.toUserId];
                if (!payer || !payee) return null;
                return (
                  <div
                    key={settlement.id}
                    className="flex items-center gap-3 rounded-[9px] border-2 border-ft-ink bg-white px-3.5 py-3"
                  >
                    <Avatar user={payer} size="xs" />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                      {payer.id === currentUser.id ? "You" : payer.name.split(" ")[0]} paid{" "}
                      {payee.id === currentUser.id ? "you" : payee.name.split(" ")[0]}
                    </span>
                    <span className="rounded-full border-2 border-ft-ink bg-ft-green px-2 py-0.5 text-[10px] font-bold">
                      PAID
                    </span>
                    <span className="text-[13.5px] font-bold">
                      {formatCurrency(settlement.amount)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
