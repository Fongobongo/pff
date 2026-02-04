import Image from "next/image";
import { getBaseUrl } from "@/lib/serverBaseUrl";
import NflPageShell from "../_components/NflPageShell";

type TeamsResponse = {
  rows: Array<{
    teamAbbr: string;
    teamName: string;
    conference?: string;
    division?: string;
    logoEspn?: string;
    logoSquared?: string;
  }>;
};

export default async function NflTeamsPage() {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/stats/nfl/teams`, { next: { revalidate: 86400 } });
  const data = (await res.json()) as TeamsResponse;

  return (
    <NflPageShell title="NFL teams" description="Team reference from nflverse data.">
      <section className="mt-8">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Abbr</th>
                <th className="px-3 py-2">Conference</th>
                <th className="px-3 py-2">Division</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((team) => (
                <tr key={team.teamAbbr} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      {team.logoEspn || team.logoSquared ? (
                        <Image
                          src={team.logoEspn ?? team.logoSquared ?? ""}
                          alt={team.teamName}
                          width={24}
                          height={24}
                          className="h-6 w-6 rounded-sm object-contain"
                          unoptimized
                        />
                      ) : (
                        <div className="h-6 w-6 rounded-sm bg-black/10 dark:bg-white/10" />
                      )}
                      <span className="text-black dark:text-white">{team.teamName}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{team.teamAbbr}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{team.conference ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{team.division ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </NflPageShell>
  );
}
