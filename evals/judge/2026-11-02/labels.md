# Judge eval: labels (2026-11-02)

Open each link and decide: would you want this in the digest? Use the same bar as the judge,
the teaching-moment test in config/themes.md: a concrete technique a working engineer could copy this week.

Write `pass` or `fail` after `label:`. `why:` is optional; fill it in when you're unsure or think the judge will disagree.
Don't look at the answer key (sample.jsonl) or the logs until you've finished. Then run `pnpm eval:judge score <this folder>`.

## 01. How to Keep AI-Generated Code Quality High Without Adding Reviewers

https://www.aviator.co/blog/how-to-keep-ai-generated-code-quality-high-without-adding-reviewers/

- label: Fail
- why: Only just imo. I tis promoting a product which is why it fails, but there are some good things in here such as codifying regular code comments - I think this is a bit light and could be better but the idea is solid. Also regarding intent, running in environments etc is solid but pretty basic

## 02. Claude Reviewing Claude: Anthropic's Code Review Process Has No Second Model

https://paddo.dev/blog/claude-reviewing-claude/

- label: Pass
- why: again only just imo. the thing is this is super short, but it has some very solid advice. Brining in another model is essential in my experience to catch bigs and blind spots. Scoring reviews, evals like we are doing here work, this + caps are very solid choices from anthropic workflow (3 Nov: walked back "only just". It's strong; being short shouldn't count against a strong piece.)

## 03. PrivacyLib: Privacy Controls at the Data Access Boundary

https://engineering.fb.com/2026/10/27/security/privacylib/

- label: PASS
- why: another close one imo, this is definitely vendor pitch and tightly scoped to privacylab. But it is well formatted, has tables and infographics and code snippets, so it is reasonable to implement your own thing that uses the patterns, but completely rebuilding it would be tough ofc

## 04. Why Agents Love Supabase

https://latent.space/p/supabase/

- label: Fail
- why: This idea has potential, but this is just an add for supabase being agent friendly, nothing to do or try or experiment with just a use this tool post

## 05. How Anthropic ships Claude with Claude: Separating the Brain from the Hands

https://latent.space/p/opus55/

- label: Fail
- why: Honestly I didn't read all this a podcast transcript is not really digestible, so even if gold is in here not something we really want to see, early signs are latent space might not be the best source

## 06. Why are good developers so wary of agentic development?

https://martinfowler.com/rachels-ramblings/good-devs-wary.html

- label: Fail
- why: Thought provoking, somewhat accurate and some nuggets, but not really anything ocncret here, mostly an opinion piece

## 07. How Anthropic ships the #1 LLM in the World safely: Separating the Brain from the Hands

https://latent.space/p/how_anthropic_ships_the_1_llm_in_the_world_safely_separating_the_brain_from_the_hands/

- label: fail
- why: fail as the link has 0 context other than podcast link. However need to decide if long form podcasts will get listened to or we just get the harness to reject them or list them as bonus content or something when time allows

## 08. Skills & Progressive Disclosure

https://learn.agentpatterns.ai/harness-engineering/skills-and-progressive-disclosure/

- label: Pass
- why: Super short and digestible, close to being too short, but in terms of signal it is good. Tells about small skills loaded when we need them, skills do one thing and do it corrctly. Quiz to test knowledge

## 09. Elegance and intelligence are anticorrelated

https://seangoedecke.com/elegance-and-intelligence-are-anticorrelated/

- label: fail
- why: I guess the other side of number 24, same author, same too low level, even though reasonable not really enough practical akeaway so another reason not to loosen the eval on these

## 10. Fragments: October 28

https://martinfowler.com/fragments/2026-10-28.html

- label: fail
- why: seems to me another opinon piece more than anything with nothing really actionable

## 11. An agent PR that only says 'fixed' makes the reviewer redo the diagnosis

https://dev.to/jeff_pdc/an-agent-pr-that-only-says-fixed-makes-the-reviewer-redo-the-diagnosis-32jo

- label: pass
- why: we have seena  few of these exact posts now, not sure this is the best but in isolation still a pass. It talks about providing enough context, talks about clear acceptance criteria for the agents and gives examples of how to get there

## 12. AI Is Getting Good at Math. Here's Why.

https://latent.space/p/ai-is-getting-good-at-math/

- label: Fail
- why: Interesting and informative, btu I don't really see a clear takeaway or try this in your next session here.

## 13. Building Conversational Commerce with Multi-Agent Swarms on GCP: A Working Prototype

https://developers.googleblog.com/building-conversational-commerce-with-multi-agent-swarms-on-gcp-a-working-prototype/

- label: pass
- why: infogrpaphics, mental models, inroduces agent swarms, feel liek stuff can be gleaned from thi

## 14. Announcing New vLLM and SGLang Inference Engines on TPU

https://developers.googleblog.com/announcing-new-vllm-and-sglang-inference-engines-on-tpu/

- label: fail
- why: didn't read tbh, the title is enough to know

## 15. Architecting Governed, Self-Evolving AI Agents on Google Cloud

https://developers.googleblog.com/architecting-governed-self-evolving-ai-agents-on-gemini-agent-platform/

- label:pass
- why:I think this is not bad, it doesn't give concrete things todo, but if you read it a few times and sit wiht it I think we ca connect the dots ourselves and inadvertantly does actual give a roadmap to delf improvment loops (3 Nov, after seeing the judge's reason: I agree with it. High-level gates and no code is a fail; it was close.)

## 16. Build Generative UI Apps with A2UI & CopilotKit Agents

https://developers.googleblog.com/build-generative-ui-apps-with-a2ui-copilotkit-agents/

- label: fail
- why: again a bit too salesy/promotion of gooles own products rather than presenting ideas

## 17. Powering the Agent Development Lifecycle with any framework, from ADK to LangChain and beyond

https://developers.googleblog.com/powering-the-agent-development-lifecycle-with-any-framework-from-adk-to-langchain-and-beyond/

- label: fail
- why: a bit salesy even for google

## 18. Context Engineering Starts with Retrieval

https://www.langchain.com/blog/context-engineering-starts-with-retrieval

- label: PASS
- why: Another very strong one from langchain. good visuals, great examples that are easy to build on and customise, tackles one of the most difficult topics -- context

## 19. Streaming comes to API Gateway: real-time and AI-ready APIs, without changing your spec

https://developers.googleblog.com/streaming-comes-to-api-gateway-real-time-and-ai-ready-apis-without-changing-your-spec/

- label: Fail
- why: This is the vendor post we can safely vut imo, doesn't really feel liek anything is liftable as a process or way of working

## 20. Build a Voice Agent That Never Goes Silent using ADK

https://developers.googleblog.com/step-by-step-guide-build-a-voice-agent-that-never-goes-silent-using-adk/

- label: pass
- why: I guess a vendor promotion piece but when it's google it is kinda allowed I guess. Essentially an old school tutorial for the ai age so walks you through things plus presents ideas in such a way they can be adapted for other use cases

## 21. Give a coding-agent delivery enough evidence to review

https://dev.to/patilrb/give-a-coding-agent-delivery-enough-evidence-to-review-46kj

- label: pass
- why: thin pass here, so interesting you said everything from the agent is clear pass/fail. My gut tells me everything or most things so far are just about pass or fail. This again talks about evidence, almost agreeing on a contract, has examples that can help piec it together

## 22. How We Built Our Design Agent

https://www.langchain.com/blog/design-agent

- label: pass
- why: this is another strong one imo. detailed, teaches key things liek self improvment loops + remembering to remove rules once the model catches up with what they were there for. Does a nice job of going deep while remaining readable

## 23. Your AI Agent Says “Done.” What Did It Actually Verify?

https://dev.to/robertadam987_/your-ai-agent-says-done-what-did-it-actually-verify-16jd

- label: Pass
- why: This is solid. Irrefutable proof, define done up front so things can't drift. A propmpt to get started, decent enough imo

## 24. You can just ask AI to do things

https://seangoedecke.com/you-can-just-ask-ai-to-do-things/

- label: Pass
- why: Just about, this is probably too low level for me, but the me 12 months ago would have liked this, straigh talking, gives ideas and thoughts I can explore and tinker with. Worth noting I guess that I am not always looking for a pattern I can lift and sometimes just nudging me in the way of things to think about is helpful, but I guess a slipper slope this one

## 25. Why AI Compute Comes in Rectangles — Erik Bernhardsson, Modal CEO

https://latent.space/p/modal-d/

- label: Fail
- why: DIdn't read - another ranscript article. Aain this would fall tot he if it is 8/10 or better move to the bonus content

## 26. The Programmable Data Center — Evan Conrad, SF Compute

https://www.latent.space/p/sfcompute2

- label: Fail
- why: same as 25

## 27. How Numan Built an Eval-First AI Health Coach with LangGraph and LangSmith

https://www.langchain.com/blog/how-numan-built-an-eval-first-ai-health-coach-with-langgraph-and-langsmith

- label:Pass
- why: One of the weaker lanchain ones but again langchain is great overall. Well writtem, the last section on building an ai coach is great

## 28. mattpocock/skills

https://github.com/mattpocock/skills

- label: Pass
- why: I have noticed harness digest already leans heavily on repos, which is great. This is a fantastic resource, well thought out, well explained, accompanying videos for lots of his skills too. Top tier

## 29. 90% of my coding agent's rework came from my own work orders

https://dev.to/lizhuojunx86/90-of-my-coding-agents-rework-came-from-my-own-work-orders-51n4

- label: pass
- why: a little ai sloppy in the writing, but talks about real stuff, token cost optimisation, using different models for different use cases and shares ideas on how to get things working in harmony, this isn't the best execution but is good content on topics I want to read about

## 30. Managed Deep Agents v0.10: Browser Use and Async Subagents

https://www.langchain.com/blog/managed-deep-agents-browser-use-and-asynchronous-subagents

- label: Fail
- why: First langchain fail. this is pitchy, and too scoped to the specific product/tool
