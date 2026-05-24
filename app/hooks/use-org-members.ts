import { useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";

import { organization, useActiveOrganization } from "~/lib/auth-client";
import { queryKeys } from "~/lib/query-keys";

export type OrgMemberLite = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
};

/**
 * Indexa membros da organização ativa por userId — usado por features que
 * só conhecem o id do usuário (presença, atribuições) e precisam exibir
 * nome/avatar.
 */
export function useOrgMembersIndex() {
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;

  const query = useQuery({
    queryKey: queryKeys.organization.members(orgId ?? ""),
    queryFn: async () => {
      const { data, error } = await organization.listMembers({
        query: { organizationId: orgId, limit: 200 },
      });
      if (error) throw new Error(error.message ?? "members");
      return data as {
        members: Array<{
          userId: string;
          user: { id: string; name: string; email: string; image?: string | null };
        }>;
      };
    },
    enabled: !!orgId,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const index = useMemo(() => {
    const map = new Map<string, OrgMemberLite>();
    for (const m of query.data?.members ?? []) {
      map.set(m.userId, {
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image ?? null,
      });
    }
    return map;
  }, [query.data]);

  return { index, isPending: query.isPending };
}
