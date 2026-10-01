import { MapPin } from "lucide-react";
import { RankingBrowser } from "@/components/ranking/RankingBrowser";

export default function ArabRanking() {
  return (
    <RankingBrowser
      type="arab"
      title="QS Arab University Rankings — Data Explorer"
      icon={<MapPin className="w-5 h-5" />}
      color="#8b5cf6"
    />
  );
}
