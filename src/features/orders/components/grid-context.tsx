"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

import { listDraftChoicesAction } from "@/app/(app)/orders/actions";
import { ORDER_FIELDS_DEFAULT, type OrderFields } from "@/domain/order-fields";
import type { WireChoices } from "@/features/orders/draft-wire";

// What every row of the drafts grid shares (plan of 2.5b): the person's branches with whether a
// draft may be added there (decide() on the server page, the server's own check), and the
// choices of a branch, loaded the first time a cell of that branch needs them (review of the
// plan, Should fix 7: no query per branch up front) and never for a branch without
// request.create (Should fix 1).

export type GridBranch = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  canCreate: boolean;
};

type ChoicesState = Record<string, WireChoices | undefined>;

export type GridContextValue = {
  branches: readonly GridBranch[];
  actorId: string;
  /**
   * Whether the product search offers "Add …" when nothing matches: actorMay("catalog.add") on
   * the server page (04 rule 8; plan of 1.12b, decided item 10); the action asks again.
   */
  canAddToCatalog: boolean;
  /** The fields the Head sets (05 Fields the Head sets): which cells stand where, which are hidden. */
  fields: OrderFields;
  choices: ChoicesState;
  loadChoices(branchId: string): Promise<WireChoices | null>;
};

const GridContext = createContext<GridContextValue | null>(null);

export function useGrid(): GridContextValue {
  const value = useContext(GridContext);
  if (!value) throw new Error("useGrid() is used outside the drafts grid.");
  return value;
}

export function GridProvider({
  branches,
  actorId,
  canAddToCatalog = false,
  fields = ORDER_FIELDS_DEFAULT,
  children,
}: {
  branches: readonly GridBranch[];
  actorId: string;
  canAddToCatalog?: boolean;
  fields?: OrderFields;
  children: React.ReactNode;
}) {
  const [choices, setChoices] = useState<ChoicesState>({});
  const asked = useRef(new Map<string, Promise<WireChoices | null>>());

  const loadChoices = useCallback(
    (branchId: string) => {
      const branch = branches.find((one) => one.id === branchId);
      if (!branch?.canCreate) return Promise.resolve(null);
      const known = asked.current.get(branchId);
      if (known) return known;
      const loading = listDraftChoicesAction({ branchId }).then((result) => {
        if (!result.ok) {
          asked.current.delete(branchId);
          return null;
        }
        setChoices((current) => ({ ...current, [branchId]: result.data }));
        return result.data;
      });
      asked.current.set(branchId, loading);
      return loading;
    },
    [branches],
  );

  return (
    <GridContext.Provider
      value={{ branches, actorId, canAddToCatalog, fields, choices, loadChoices }}
    >
      {children}
    </GridContext.Provider>
  );
}
