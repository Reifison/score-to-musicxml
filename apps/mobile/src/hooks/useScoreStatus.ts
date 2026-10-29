import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { shouldPollConversionScore } from "../score/conversionProgressPresentation";

export function useScoreStatus(token: string | null | undefined, scoreId: string | null | undefined) {
  return useQuery({
    queryKey: ["score", scoreId],
    queryFn: () => api.score(token!, scoreId!),
    enabled: Boolean(token && scoreId),
    refetchInterval: (query) => {
      const score = query.state.data?.score;
      return shouldPollConversionScore(score) || score?.reviewStatus === "needs_review" ? 3000 : false;
    }
  });
}
