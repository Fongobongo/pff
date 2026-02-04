import NflPageShell from "../_components/NflPageShell";
import NflPlaceholder from "../_components/NflPlaceholder";

export default function NflAdvancedStatsPage() {
  return (
    <NflPageShell title="NFL advanced stats" description="Efficiency and derived metrics (shell).">
      <NflPlaceholder
        title="Advanced stats view is not wired yet"
        items={[
          "Efficiency splits and per-play rates.",
          "Bonus triggers and threshold checks.",
          "Team context and opponent strength.",
        ]}
      />
    </NflPageShell>
  );
}
