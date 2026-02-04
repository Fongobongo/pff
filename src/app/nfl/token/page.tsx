import NflPageShell from "../_components/NflPageShell";
import NflPlaceholder from "../_components/NflPlaceholder";

export default function NflTokenPage() {
  return (
    <NflPageShell title="NFL token" description="Single athlete token detail (shell).">
      <NflPlaceholder
        title="Token view is not wired yet"
        items={[
          "On-chain trade history and price chart.",
          "Per-week scoring timeline for the athlete.",
          "Links to portfolio holders and activity.",
        ]}
      />
    </NflPageShell>
  );
}
