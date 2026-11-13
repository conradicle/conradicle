// Public endpoints only. Never send a token or request private repository data.
import { mkdir, writeFile } from 'node:fs/promises';

const owner = 'conradicle';
const root = new URL('../', import.meta.url);
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'conradicle-profile' };
async function api(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers, signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Public GitHub API: ${response.status} for ${path}`);
  return response.json();
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
}[c]));
const user = await api(`/users/${owner}`);
const all = [];
for (let page = 1; ; page++) {
  const batch = await api(`/users/${owner}/repos?type=owner&per_page=100&page=${page}`);
  all.push(...batch);
  if (batch.length < 100) break;
  if (page === 20) throw new Error('Repository pagination limit reached; refusing partial statistics.');
}
const repos = all.filter(r => r.visibility === 'public' && !r.private && !r.fork);
const languages = {};
// Sequential requests keep the public API load modest.
for (const repo of repos) {
  for (const [language, bytes] of Object.entries(await api(`/repos/${owner}/${encodeURIComponent(repo.name)}/languages`))) {
    languages[language] = (languages[language] || 0) + bytes;
  }
}
const ranked = Object.entries(languages).sort((a, b) => b[1] - a[1]);
const totalBytes = ranked.reduce((sum, [, bytes]) => sum + bytes, 0);
const visible = ranked.slice(0, 3);
const other = ranked.slice(3).reduce((sum, [, bytes]) => sum + bytes, 0);
if (other) visible.push(['Other', other]);
const date = new Date().toISOString().slice(0, 10);
const stars = repos.reduce((sum, r) => sum + r.stargazers_count, 0);
const palette = ['#9bd2d6', '#6c9da8', '#48717e', '#2c4655'];
let x = 36;
const bars = visible.map(([language, bytes], i) => {
  const width = bytes / totalBytes * 828;
  const part = `<rect x="${x.toFixed(2)}" y="211" width="${width.toFixed(2)}" height="9" fill="${palette[i]}"/>`;
  x += width;
  return part;
}).join('');
const labels = visible.map(([language, bytes], i) => {
  const lx = 36 + i * 207;
  return `<circle cx="${lx + 4}" cy="249" r="4" fill="${palette[i]}"/><text x="${lx + 16}" y="254" class="small">${escape(language)} ${(bytes / totalBytes * 100).toFixed(1)}%</text>`;
}).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300" viewBox="0 0 900 300" role="img" aria-labelledby="title desc">
<title id="title">Conradicle public GitHub snapshot</title>
<desc id="desc">${repos.length} original public repositories, ${stars} stars, ${user.followers} followers. Updated ${date} UTC. Language distribution by bytes across original public repositories.</desc>
<style>text{font-family:Consolas,'Liberation Mono',monospace;fill:#eaf0f2}.label{font-size:11px;letter-spacing:2px;fill:#b6c5cc}.value{font-size:42px}.small{font-size:12px;fill:#b6c5cc}</style>
<rect x=".5" y=".5" width="899" height="299" rx="12" fill="#0c141c" stroke="#35464f"/>
<text x="36" y="35" class="label">PUBLIC SIGNAL / @CONRADICLE</text><text x="864" y="35" text-anchor="end" class="small">${date} UTC</text>
<text x="36" y="102" class="value">${repos.length}</text><text x="36" y="130" class="label">PUBLIC REPOS</text>
<text x="340" y="102" class="value">${stars}</text><text x="340" y="130" class="label">REPOSITORY STARS</text>
<text x="650" y="102" class="value">${user.followers}</text><text x="650" y="130" class="label">FOLLOWERS</text>
<path d="M36 160H864" stroke="#35464f"/><text x="36" y="190" class="label">LANGUAGES / CODE VOLUME</text>
${bars}${labels}<text x="36" y="282" class="small">Original public repositories only · forks excluded · not a skill ranking</text></svg>`;
await mkdir(new URL('assets/', root), { recursive: true });
await writeFile(new URL('assets/stats.svg', root), svg);
console.log(`Updated public snapshot: ${repos.length} repositories, ${stars} stars, ${user.followers} followers (${date} UTC).`);
