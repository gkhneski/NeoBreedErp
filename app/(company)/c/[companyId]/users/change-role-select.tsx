"use client";

import { useActionState, useRef } from "react";

import { COMPANY_ROLE_LABELS, COMPANY_ROLE_VALUES, type CompanyRole } from "@/types/roles";

import { changeUserRole, type ChangeRoleState } from "./actions";

interface Props {
  companyId: string;
  userId: string;
  currentRole: CompanyRole;
}

const initialState: ChangeRoleState = {};

export function ChangeRoleSelect({ companyId, userId, currentRole }: Props) {
  const boundAction = changeUserRole.bind(null, companyId, userId);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="space-y-0.5">
      <form ref={formRef} action={formAction}>
        <select
          name="role"
          defaultValue={currentRole}
          disabled={isPending}
          onChange={() => formRef.current?.requestSubmit()}
          className="flex h-7 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {COMPANY_ROLE_VALUES.filter((r) => r !== "company_user").map((r) => (
            <option key={r} value={r}>
              {COMPANY_ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </form>
      {state.error && (
        <p className="text-xs text-destructive">{state.error}</p>
      )}
    </div>
  );
}
