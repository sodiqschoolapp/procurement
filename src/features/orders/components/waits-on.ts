import type { Role } from "@/domain/permissions";
import type { WireOrderGroup } from "@/features/orders/list-wire";

/**
 * Whether a row waits on this person, for the orange "your turn" mark (docs/design-system.md,
 * Colour: the one "needs you now" accent). A mark only: the actions are the server's, asked when
 * the row is ticked. The Manager's own sent-back orders, in a branch where the Manager may send
 * them again; the Head's, the Principal's and Finance's own approval step; Finance's settlements.
 */
export function waitsOn(
  group: Pick<WireOrderGroup, "status" | "branchId"> & { orders: readonly { ownerId: string }[] },
  role: Role,
  meId: string,
  turnBranchIds: readonly string[] | null,
): boolean {
  switch (role) {
    case "MANAGER":
      return (
        group.status === "RETURNED" &&
        group.orders.every((order) => order.ownerId === meId) &&
        (turnBranchIds?.includes(group.branchId) ?? false)
      );
    case "HEAD":
      return group.status === "PENDING_HEAD";
    case "PRINCIPAL":
      return group.status === "PENDING_PRINCIPAL";
    case "FINANCE":
      return group.status === "PENDING_FINANCE" || group.status === "SETTLEMENT";
  }
}
