# Judge eval: report (2026-11-02)

**Agreement:** 26/30 (87%)

| | Judge passed | Judge failed |
|---|---|---|
| **I passed** | 13 | 2 (judge too strict) |
| **I failed** | 2 (judge too lenient) | 13 |

## Disagreements

**01. How to Keep AI-Generated Code Quality High Without Adding Reviewers** (https://www.aviator.co/blog/how-to-keep-ai-generated-code-quality-high-without-adding-reviewers/)
- Me: fail: Only just imo. I tis promoting a product which is why it fails, but there are some good things in here such as codifying regular code comments - I think this is a bit light and could be better but the idea is solid. Also regarding intent, running in environments etc is solid but pretty basic
- Judge: pass, 6/10: Despite the vendor pitch at the end, the first half teaches product-independent techniques the card reports accurately: sorting the last 100 review comments into rule-checkable, testable and judgment buckets, negative acceptance criteria, and diffing tests for weakened assertions. It stays at 6 because evidence is thin, with no code or before-and-after.

**03. PrivacyLib: Privacy Controls at the Data Access Boundary** (https://engineering.fb.com/2026/10/27/security/privacylib/)
- Me: pass: another close one imo, this is definitely vendor pitch and tightly scoped to privacylab. But it is well formatted, has tables and infographics and code snippets, so it is reasonable to implement your own thing that uses the patterns, but completely rebuilding it would be tough ofc
- Judge: fail, 4/10: This is mainly a Meta-scale privacy-infrastructure deep dive, with only a few paragraphs on agents. The card wrongly frames PrivacyLib as built for agents, and its 'steal this' carries the simulation-replay and percentage-rollout patterns over to agent tool permissions, which the page never applies them to, leaving nothing an engineer could realistically copy this week without comparable infrastructure.

**12. AI Is Getting Good at Math. Here's Why.** (https://latent.space/p/ai-is-getting-good-at-math/)
- Me: fail: Interesting and informative, btu I don't really see a clear takeaway or try this in your next session here.
- Judge: pass, 6/10: The essay is mostly analysis of why models succeed at math, but it does teach a transferable drafter/solver/verifier loop: fold each failed attempt back into the next prompt as a negative hint and promote known failure modes to standing adversarial checks, backed by the quoted CDC prompt. The setup is the author's reconstruction of what OpenAI likely did, not a demonstrated harness, so the technique is thin.

**15. Architecting Governed, Self-Evolving AI Agents on Google Cloud** (https://developers.googleblog.com/architecting-governed-self-evolving-ai-agents-on-gemini-agent-platform/)
- Me: pass: I think this is not bad, it doesn't give concrete things todo, but if you read it a few times and sit wiht it I think we ca connect the dots ourselves and inadvertantly does actual give a roadmap to delf improvment loops (3 Nov, after seeing the judge's reason: I agree with it. High-level gates and no code is a fail; it was close.)
- Judge: fail, 4/10: The portable idea is a gate on agent-written code: an AST check, an OPA threshold check and human sign-off for structural changes. But the page is mostly Google Cloud product marketing (Model Armor, KMS, Binary Authorization) around a simulated demo, and it explains the gates only at a high level with no code on the page.
