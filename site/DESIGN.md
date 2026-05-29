# Design Notes

Background context for anyone (you in three months, a collaborator, a fresh
Claude session) who wants to modify this project without re-deriving choices
from scratch.

## The two engines

The app generates a crow name two ways:

- **Oracle** — an LLM (Claude). Higher quality, varied phrasing, costs a
  network call.
- **Scribe** — a pure-JavaScript template engine in `index.html`. No network,
  deterministic enough to be reliable, fully offline.

A third mode, **Auto**, calls the Oracle and falls back silently to the Scribe
on any failure (network, API error, empty response). The tag shows which
engine answered so it's never a mystery.

**Why the fallback exists.** Party use is bursty (twenty guests in five
minutes) and an outage shouldn't kill the activity. The Oracle/Scribe split
also lets the visual design be tested offline without burning API calls.

## The Scribe's part-of-speech routing

Naïve templates produce nonsense when user input doesn't match the slot's
expected shape. Example: a frame like `"thief of {x}"` assumes a noun, but
a user types *can tame poodle hair* (a verb phrase) → "thief of can tame
poodle hair."

The Scribe classifies each input into one of three shapes and picks a frame
family that stays grammatical:

1. **Single words** (*trains*, *baking*) → object frames:
   "circler of trains," "scavenger of baking." (Preserves the original
   Nina-style cadence.)
2. **Finite verb phrases** signalled by a leading modal / adverb / pronoun
   (*can tame poodle hair*, *never forgets a face*) → raw `who` frames that
   keep wording verbatim: "who can tame poodle hair," "who never forgets a
   face." This avoids fragile morphology that flips meaning — an earlier
   attempt to drop "never" and rebuild the verb turned *never forgets* into
   *can forget*, which was wrong.
3. **Clean bare-verb phrases** (*juggle flaming torches*) → infinitive /
   gerund frames via the `compromise` library: "who would juggle flaming
   torches for sport."

## Compromise as progressive enhancement

The Scribe loads `compromise` from a CDN for verb detection, food-noun
singularizing (*dumplings* → *dumpling*), and infinitive/gerund conversion.
If the CDN fails to load, the Scribe falls back to pure heuristics — slightly
rougher on un-cued verb phrases, but never broken. This mirrors the
Oracle→Scribe fallback at a finer grain.

Specifically:
- `compromise` is used for: `nlp(x).has("#Verb")`, `nlp(x).has("#Modal")`,
  `nlp(x).has("#Plural")`, `.nouns().toSingular()`, `.verbs().toInfinitive()`.
- Heuristics handle: lead-word classification (modal/pronoun/adverb lists),
  manual gerund construction with the standard +ing rules
  (drop-e: *bake → baking*, double-consonant: *run → running*, -ie → -ying:
  *lie → lying*).
- The food singularizer is guarded against false plurals (*hummus*, *cactus*,
  *iris* don't get cut).

## Intensity dial

Light / Heavy controls flourish, not theme. Both engines respect it:

- The Scribe swaps structure banks (3-clause LIGHT vs 4-clause HEAVY with a
  corvid-lore closer).
- The Oracle's prompt changes its clause count and adds an instruction for
  the corvid closer.

A single dial controls both for consistency — the user shouldn't see
different output structures depending on which engine answered.

## Name highlighting

The first name plus the immediately-following corvid byname are rendered
in gold on the tag. The renderer matches the leading name and an adjacent
capitalized word. This works for both engines because the Oracle prompt
explicitly instructs Claude to begin with "{name} {Byname}", and the Scribe
constructs the same shape.

## Prompt lives in two places — be careful

The Oracle prompt is constructed in `index.html`'s `buildPrompt()` for the
direct-API / artifact-mode path. The same prompt is also documented in
`prompts/oracle.md` (canonical) and reconstructed in `server/server.js` if
the backend ever builds it server-side. Today the server forwards the
client-built prompt unchanged, so the two stay in sync by construction.
If you split them, copy this paragraph as a warning into both files.

## Things considered and rejected

- **Cloudflare Workers AI** for the Oracle backend. Free, edge-local, but
  the available open-source models (Llama 3.1 8B, Mistral 7B) underperform
  Claude on prompt adherence for this kind of stylized creative writing.
  Quality > free here. Cloudflare still useful as the front-of-VPS proxy.
- **A SQL database for the roster.** A party has at most a few hundred
  entries across a handful of rooms. A JSON file with atomic writes is
  smaller, easier to debug, and zero ops. Swap in better-sqlite3 if queries
  ever matter.
- **Authentication on rooms.** Explicitly out of scope. The party tool
  trades security for zero-friction sharing; room codes provide URL
  obscurity, not access control.

## Open questions / future work

- The byname is generated independently by each engine and isn't stable
  across re-rolls. If users want a "lock the byname" option, surface it in
  the UI and pass it as an additional input to both engines.
- The print layout is two-up letter-size; A4 users will want a toggle.
- Heavy mode occasionally goes one clause too far when the user fills all
  four fields generously. Worth A/B-testing a tighter heavy prompt.
