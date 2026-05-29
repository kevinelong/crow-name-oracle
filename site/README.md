# The Crow Name Oracle

A single-file party tool that forges grand, mock-heroic "crow names" from a
person's name, hobbies, favorite foods, and one unexpected detail — titles in
the spirit of *"Nina of the rice pudding clan, rider of trains, conqueror of
poodle hair."* Built to make name tags that spark introductions.

**Live page:** `https://<your-username>.github.io/crow-name-oracle/`

## Modes

Pick one at the top of the page:

- **Auto** — consults the Oracle (AI) first; if it's unavailable, errors, or
  returns nothing, it silently falls back to the Scribe.
- **Oracle** — AI only. Fails loudly if the API can't be reached (useful for testing).
- **Scribe** — local template engine only. No AI consulted (useful for testing).

The **Scribe** uses curated word banks and several sentence structures, so every
reroll varies. The **Oracle** prompts an LLM to compose a fresh title with a
variation seed for re-rolls.

### Grammar in the Scribe (template mode)

The template engine routes each input by part of speech so the output stays
coherent regardless of what someone types:

- **Single words** (e.g. *trains*, *baking*) go into forgiving object frames —
  "circler of trains," "scavenger of baking."
- **Finite verb phrases** (e.g. *can tame poodle hair*, *never forgets a face*)
  are kept verbatim in a "who …" clause, preserving meaning — "who can tame
  poodle hair," "who never forgets a face."
- **Bare-verb phrases** (e.g. *juggle flaming torches*) are reshaped into an
  infinitive/gerund clause — "who would juggle flaming torches for sport."

It loads [`compromise`](https://github.com/spencermountain/compromise) from a CDN
for the nicer transforms (singularizing a plural food noun, detecting verbs,
infinitive/gerund conversion). **If the CDN fails to load, the Scribe falls back
to pure heuristics** — slightly rougher on un-cued verb phrases, but never
broken. This mirrors the Oracle→Scribe fallback: try the smart path, degrade
gracefully.

### Crow intensity

A **Light / Heavy** dial controls the flourish. Light keeps three tight clauses;
Heavy adds a fourth corvid closer drawn from crow lore (remembering faces,
leaving bright gifts, hoarding shiny things). Both engines respect it.

## Heads up about AI mode on GitHub Pages

The Oracle's AI call targets the Anthropic Messages API and relies on a hosting
environment that supplies the API key and proxies the request (e.g. the Claude
artifact sandbox it was authored in). A static GitHub Pages site has **no key
and no proxy**, so on the public page:

- **Auto** mode works — it gracefully falls back to the **Scribe**.
- **Oracle** mode will report that the Oracle can't be reached.

So the published page is effectively **Scribe-powered**, which is fully
self-contained and needs no network. To enable real AI on the public site,
front the call with your own small backend (or serverless function) that holds
the key and adds CORS, then point the `oracle()` fetch in `index.html` at it.

## Features

- Heraldic name-tag rendering ("Known in the murder as …")
- Keep tags in a **roster** and **Print Name Tags** as a two-up badge sheet
- Reroll for fresh titles; comma-separated hobbies/foods get varied picks
- No build step, no dependencies — one HTML file

## Run locally

Just open `index.html` in a browser, or serve it:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Enabling GitHub Pages

Settings → Pages → Source: **Deploy from a branch** → Branch: **main** / **/ (root)**.
The site publishes at the URL shown at the top of this README.

## License

MIT — see [LICENSE](LICENSE).
