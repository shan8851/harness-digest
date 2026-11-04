# Themes and rubric

The judge reads this file. Edit it to change what counts.

## The topic

Agentic engineering: how people shape AI agents to produce solid, verified output every time. Not which model is best, not launch news. The craft of the harness around the model.

## Themes

1. **Harness design:** skills and instruction files, context and memory, tool design, subagents, hooks, how the loop is structured.
2. **Verification and proof of work:** tests, evals, self-checks, screenshots, CI gates, agents that show evidence their work is right.
3. **Lighter code review:** writing specs first, small diffs, review agents, guardrails that make agent output cheaper for a human to check.
4. **Harnesses for non-engineers:** agent workflows for marketing, design, ops and other teams, with constraints and specific outputs.
5. **Real setups:** someone walking through their actual working harness: their files, their loop, what broke and what they changed.

## The teaching-moment test

Pass only if the item contains a **concrete, transferable technique** that a working engineer could copy this week. Ask: after reading this, what exactly would I do differently? If there's no clear answer, it fails.

## Automatic fails

- Launch announcements, funding news, benchmarks, leaderboards
- "AI will replace X" takes and other opinion without a technique
- Listicles and tool round-ups
- Vendor marketing where the technique only works with their product
- Rehashes of something better covered elsewhere
- Paywalled content

**Vendor posts:** judge the portable technique, whoever is selling. A vendor's post that teaches something you could build without their product is judged like any other post; one whose technique only works inside the product fails. Don't mark a post up or down for who published it.

## Scoring (1–10)

- **9–10:** a technique I'd want to try immediately, explained with real evidence (code, a repo, a before and after).
- **7–8:** a clear, useful technique; less evidence or narrower use.
- **5–6:** passes the test, but thin. Fine for a week with little else.
- **Below 5:** fail.

Score the technique only. Readability is a separate field (below), and code combines the two.

## Readability (−1, 0 or +1)

The reader skims, so a piece that's easy to skim is worth more. This is a small nudge to the ranking, not a quality judgement: it never changes whether an item passes.

- **+1:** clearly structured and quick to take in: headings, short sections, diagrams, tables or code that carry the idea. Short is fine if it's strong.
- **0:** an ordinary readable article. Most items are 0.
- **−1:** a wall of text, a raw transcript, or padding that buries the technique.

## Podcasts

Set the card's content type to `podcast` for a podcast or interview episode, or its transcript. Judge it on the same teaching-moment test. Podcasts never go in the main list; only one scoring 8 or more appears, in a separate "bonus listen" section, so be as strict as usual. A podcast's readability is always 0, since it's meant to be listened to.

## Calibration examples

From a reader's hand-labelled set (November 2026; the judge agreed on 26 of 30). Use them to calibrate borderline calls, not as a list of sources to favour or avoid.

| Item | Call | Why |
|---|---|---|
| Claude Reviewing Claude: Anthropic's code review process | pass, strong | Short but solid: a second model reviewing the first, scored reviews, caps. Short is fine when it's strong. |
| mattpocock/skills (repo) | pass, strong | Well thought out and well explained, with videos for many skills. Top tier. |
| How We Built Our Design Agent (LangChain) | pass, strong | Detailed but readable: self-improvement loops, and removing rules once the model no longer needs them. |
| Context Engineering Starts with Retrieval (LangChain) | pass, strong | Good visuals, examples easy to adapt, on one of the hardest topics. |
| Skills & Progressive Disclosure | pass | Short and digestible, high signal: small single-purpose skills loaded when needed. |
| Your AI Agent Says "Done." What Did It Actually Verify? | pass | Define done up front, demand proof, with a prompt to start from. |
| 90% of my coding agent's rework came from my own work orders | pass | Writing is a bit sloppy, but the content is real: token costs, different models for different jobs. |
| How Numan Built an Eval-First AI Health Coach (LangChain) | pass | A case study that teaches transferable eval techniques. Well written. |
| Build a Voice Agent That Never Goes Silent using ADK (Google) | pass | A vendor tutorial, but the ideas adapt to other stacks. |
| Building Conversational Commerce with Multi-Agent Swarms (Google) | pass, thin | Mental models and diagrams you can learn from. |
| PrivacyLib: privacy controls at the data access boundary (Meta) | pass, borderline | Tightly scoped to one company's system, but well structured with code, and the patterns can be rebuilt elsewhere. |
| You can just ask AI to do things | pass, thin | Introductory, but plain and full of ideas to try. |
| An agent PR that only says 'fixed'... | pass, thin | Context and acceptance criteria for agents, with examples. One of several near-identical posts; fine alone, not in the same issue. |
| Give a coding-agent delivery enough evidence to review | pass, thin | Evidence as a contract between agent and reviewer, with examples. |
| How to Keep AI-Generated Code Quality High Without Adding Reviewers (Aviator) | fail, borderline | Some good ideas (turning review comments into rules) but light and basic, ending in a product pitch. |
| Architecting Governed, Self-Evolving AI Agents (Google Cloud) | fail, borderline | The gate idea is only high level, with no code, around product marketing. |
| AI Is Getting Good at Math. Here's Why. | fail, borderline | Interesting analysis, but no clear thing to try next session. A reconstruction of how someone might have done it isn't a demonstrated technique. |
| Why are good developers so wary of agentic development? (Martin Fowler) | fail | Thought-provoking opinion, nothing concrete. |
| Fragments: October 28 (Martin Fowler) | fail | Opinion, nothing actionable. |
| Elegance and intelligence are anticorrelated | fail | Reasonable, but no practical takeaway. |
| Why Agents Love Supabase | fail | An ad for a tool: nothing to do or try. |
| Build Generative UI Apps with A2UI & CopilotKit (Google) | fail | Promotes products rather than presenting ideas. |
| Powering the Agent Development Lifecycle with any framework (Google) | fail | Salesy. |
| Streaming comes to API Gateway (Google) | fail | A launch; nothing liftable as a way of working. |
| Managed Deep Agents v0.10 (LangChain) | fail | A release post; the techniques only work inside the product. |
| Announcing new inference engines on TPU (Google) | fail | Launch news. |
| How Anthropic ships Claude with Claude (podcast transcript) | fail | A transcript is hard to read; would need to be top tier to earn a listen. |
| How Anthropic ships the #1 LLM safely (podcast) | fail | A podcast link with no written context. |
| Why AI Compute Comes in Rectangles (podcast) | fail | A business interview with no agent technique. |
| The Programmable Data Center (podcast) | fail | Same: no agent technique. |

## Writing rules

Each card has four parts. Together they should let a reader decide in under a minute whether to click through, and give them enough to start trying the idea without clicking.

- **Idea:** one sentence. The problem and the answer, plainly. No hype words.
- **How it works:** 3 to 5 short bullets, about 12–15 words each, on the concrete mechanics: what to set up, what runs when, what gets checked. Not a summary of the article's structure.
- **Steal this:** see below.
- **Go deeper if:** one short line saying who should read the full piece ("you're the bottleneck on reviewing agent output").

- **Write for any reader.** Assume the issue may be forwarded to strangers. Never refer to a specific reader, their family, employer or projects.
- **"Steal this"** is one sentence: the specific technique from the item, plus a concrete moment to try it ("before your next…", "the next time you…"). Name the actual skill, prompt or pattern, not a vague category, and keep the moment generic (work, a team, a side project, home), never a specific person or project.
- Summaries are in your own words. At most one short quote (25 words or fewer) per item.
