export type IdeaMode = 'greenfield' | 'brownfield' | 'patch' | 'checkpoint' | 'research_spike';

export function classifyIdea(input: string): IdeaMode {
  const t = input.toLowerCase();
  if (t.includes('checkpoint') || t.includes('freeze')) return 'checkpoint';
  if (t.includes('bug') || t.includes('fix') || t.includes('patch')) return 'patch';
  if (t.includes('github.com') || t.includes('oss') || t.includes('research')) return 'research_spike';
  if (t.includes('integrate') || t.includes('existing') || t.includes('brownfield')) return 'brownfield';
  return 'greenfield';
}
