import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

const activeStatuses = new Set(["queued", "processing"]);

export function useScoreStatus(token: string | null | undefined, scoreId: string | null | undefined) {
  return useQuery({
    queryKey: ["score", scoreId],
    queryFn: () => api.score(token!, scoreId!),
    enabled: Boolean(token && scoreId),
    refetchInterval: (query) => {
      const score = query.state.data?.score;
      const status = score?.conversionStatus;
      return (status && activeStatuses.has(status)) || score?.reviewStatus === "needs_review" ? 3000 : false;
    }
  });
}
