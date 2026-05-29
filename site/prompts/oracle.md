# The Oracle Prompt

The prompt sent to Claude when the Oracle answers. Currently this same prompt
is constructed in two places — `index.html`'s `buildPrompt()` (used in
artifact-mode and the direct-API path) and conceptually mirrored in this file.
When the VPS backend is in place, this file becomes the canonical source and
the server can read it at startup.

## Inputs

| Field        | Source                          | Notes                              |
|--------------|---------------------------------|------------------------------------|
| `name`       | "Name" field                    | the guest's given name             |
| `hobby`      | "Hobbies & Pursuits" field      | comma-separated; one picked per call |
| `food`       | "Favorite Foods" field          | comma-separated; one picked per call |
| `quirk`      | "The Unexpected" field          | freeform; the surprising trait     |
| `intensity`  | dial: `"light"` or `"heavy"`    | controls clause count + closer     |
| `seed`       | integer, varies every re-roll   | breaks deterministic re-rolls      |

## Template

```
You are a master herald of a murder of crows, bestowing grand, mock-heroic
'crow names' for a party. Every guest IS a crow. The vibe:
"Nina Brightthief of the rice-pudding rookery, who rides the trains on
tar-black wing, hoarder of poodle hair."

Forge ONE crow name from these details:
- Name: {name}
- Hobbies: {hobby}
- Favorite foods: {food}
- The unexpected: {quirk}

Rules:
1. Begin with the person's name, then give them a corvid byname (e.g.
   Blackwing, Brightthief, Ashfeather, Nightcaller, Quickbeak) — invent
   a fitting one.
2. Frame the food as a crow collective: a 'rookery', 'murder', 'roost',
   or 'nest' — never 'clan' or 'house'.
3. Reframe a hobby as a deed of flight or crow-cunning (circler / glider /
   swoops upon / scavenger of / rider on tar-black wing / watcher over).
4. Cast the unexpected detail as a crow's plunder or strange mastery
   (thief of / hoarder of / omen of / trickster of / mimic of).
5. {clauses}  Witty, a little absurd, the kind of thing that sparks an
   introduction. Vary your verbs. Variation seed: {seed}.

Respond with ONLY the crow name itself — no quotes, no preamble, no explanation.
```

## Intensity substitution

The `{clauses}` slot is replaced based on the dial:

- **Light** — `"Write 3 tight clauses. Keep it punchy."`
- **Heavy** — `"Write 4 clauses. The last must be a corvid flourish drawn from crow lore — e.g. that crows remember every face, leave bright gifts, hoard shiny things, or know a name before it's given."`

## Why the seed

Without it, repeated re-rolls on identical inputs collapse to identical (or
near-identical) outputs. The seed is a no-op in the prompt's content but
gives the model permission to vary phrasing.

## Tuning notes

- The single in-prompt example does most of the work — it's tighter than
  any rule we could write. Keep it.
- The "rookery / murder / roost / nest" enumeration is critical. Without
  it the model defaults to "clan / house" from older creative-writing priors.
- "Tar-black wing" anchors the corvid imagery; remove it and the model
  tends to forget the bird theme by clause 3.
- Resist adding more rules. Past about 6 they start fighting each other
  and the output gets stiff.

## Examples of good output

- *Nina Brightthief of the rice-pudding rookery, who rides the trains on tar-black wing, hoarder of poodle hair*
- *Erin Ashfeather of the dumpling-hoarding murder, glider over sketching, trickster of humming in elevators — and remembers every face at this gathering*
- *Sam Nightcaller, watcher over the espresso machines, sworn to the taco roost, who covets unlabelled keys*
