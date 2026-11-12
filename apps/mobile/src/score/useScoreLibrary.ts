import { useQuery } from "@tanstack/react-query";
import { ApiError, api } from "../api/client";
import { isConversionProgressActive, shouldPollConversionScore } from "./conversionProgressPresentation";
import { readScoreLibrary, writeScoreLibrary } from "./scoreLibraryStorage";

export function useScoreLibrary(token: string | null, userId: string | undefined, pollConversions = false) {
  const enabled = Boolean(token && userId);
  const saved = useQuery({
    queryKey: ["saved-score-library", userId ?? null],
    queryFn: () => readScoreLibrary(userId!).then((library) => library ?? null),
    enabled,
    networkMode: "always",
    staleTime: Infinity
  });
  const library = useQuery({
    queryKey: ["scores", userId ?? null],
    queryFn: async ({ signal, client }) => {
      const fresh = await api.scores(token!, signal);
      if (!signal.aborted) {
        client.setQueryData(["saved-score-library", userId], fresh);
        void writeScoreLibrary(userId!, fresh).catch(() => undefined);
      }
      return fresh;
    },
    enabled,
    retry: (failures, error) => !(error instanceof ApiError && error.status === 401) && failures < 2,
    refetchInterval: pollConversions ? (query) => {
      const scores = query.state.data?.scores ?? [];
      if (scores.some((score) => isConversionProgressActive(score.conversionProgress))) return 10_000;
      return scores.some((score) => shouldPollConversionScore(score) || score.reviewStatus === "needs_review") ? 60_000 : false;
    } : false
  });

  return { library, scores: enabled ? (library.data ?? saved.data)?.scores : undefined, loadingSaved: enabled && saved.isPending };
}
