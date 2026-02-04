import NflPageShell from "../_components/NflPageShell";
import NflPlaceholder from "../_components/NflPlaceholder";

export default function NflDefensiveMatchupsPage() {
  return (
    <NflPageShell title="NFL defensive matchups" description="Defense vs position breakdowns (shell).">
      <NflPlaceholder
        title="Defensive matchups view is not wired yet"
        items={[
          "Allowed points by defense and position.",
          "Pressure rates vs offensive line strength.",
          "Recent form and injury context.",
        ]}
      />
    </NflPageShell>
  );
}
