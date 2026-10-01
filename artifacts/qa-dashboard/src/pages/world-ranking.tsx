import { Globe } from "lucide-react";
import { RankingBrowser } from "@/components/ranking/RankingBrowser";

export default function WorldRanking() {
  return (
    <RankingBrowser
      type="world"
      title="QS World University Rankings — Data Explorer"
      icon={<Globe className="w-5 h-5" />}
      color="#3b82f6"
    />
  );
}
