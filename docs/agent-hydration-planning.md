# Hydration Evidence and Planning Design

Status: targeted evidence review and historical design, 2026-09-08. This is not
a systematic review or medical clearance.

## Current Direction: Model Judgment

The user subsequently chose model-led hydration recommendations instead of the
proposed numerical-policy gate below. Runtime no longer returns a formula-based
water target, mandates a bottled-water mix, or enforces a minimum water volume.
The model chooses quantity and containers from journey context. No replacement
coefficient, preferred volume, or bottle count from the discussion was added.
Item structure, hydration coverage, scope, deduplication and atomic writes remain.
Food validation is unchanged. This does not prove model recommendations are safer
or more accurate, and the model may independently recommend the same quantity.

The decision contract and release gates below are retained as a historical
proposal, not implemented runtime behavior. The old snapshot remains historical;
the diagnostic script now prints null water targets against current code.
There is no live-model before/after quality result for this change yet.

## Evidence Register

Access status distinguishes original full-text passages from abstracts and
secondary summaries. Source prestige does not establish applicability to hiking.
No source below validates a universal 0.55 L/h hiking carry requirement.

| ID | Source and access | Supported conclusion | Limits on use |
| --- | --- | --- | --- |
| E1 | ACSM, *Exercise and Fluid Replacement*, 2007. [DOI](https://doi.org/10.1249/mss.0b013e31802ca597). Bibliography and abstract checked through Europe PMC (PMID 17277604); original full text not reviewed. | Considerable individual variation in sweat rate and electrolyte loss; customize replacement. | Older position stand, oriented to hydration and performance. No verified universal hiking coefficient or bottle count. |
| E2 | NATA, *Fluid Replacement for the Physically Active*, 2017. [Original full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC5634236/), [DOI](https://doi.org/10.4085/1062-6050-52.9.02). Relevant recommendations and fluid-intake discussion checked. | Recommendation 1 rates individualized fluid maintenance SOR A. Recommendations 10-11 discuss personal sweat rate, environment, acclimatization, size, duration, intensity and tolerance. Recommendation 6 warns against exercise-associated fluid weight gain. | Sports/clinical guidance is not a validated remote-route logistics model. Recommendation grades belong to the source, not to our implementation. |
| E3 | WMS, *Clinical Practice Guidelines for the Management of Exercise-Associated Hyponatremia: 2019 Update*, published 2020. [DOI](https://doi.org/10.1016/j.wem.2019.11.003). Original abstract checked; full-text retrieval timed out. [AAFP 2021 summary](https://www.aafp.org/pubs/afp/issues/2021/0215/p252.html) checked. | The summary emphasizes avoiding overdrinking, responding to thirst for EAH prevention, and that sodium does not prevent EAH when overdrinking occurs. | Prevention/recognition/treatment of EAH, not a minimum carry-volume study. Detailed recommendation grading awaits original-text verification. |
| E4 | *Impact of Ad Libitum Versus Programmed Drinking on Endurance Performance: A Systematic Review with Meta-Analysis*, 2019. [DOI](https://doi.org/10.1007/s40279-018-01051-z). Abstract checked via Europe PMC. | Seven publications, 82 subjects; broadly similar performance effects in the studied 1-2 h cycling/running conditions. | Subjects began euhydrated; mean duration 96 minutes. Not evidence for 8 h hiking, children, or remote-water planning. Group mean consumption is not a recommended rate. Ad libitum is not identical to drinking to thirst (E2 definitions). |
| E5 | NPS Grand Canyon, [Hike Smart](https://www.nps.gov/grca/planyourvisit/hike-smart.htm), page marked updated 2026-06-26, checked 2026-09-08. | Potable-water services may be unavailable by season/maintenance; exposed heat can require changes to route/timing, not just more water. | Operational, location-specific guidance, not a research paper. Page contains tension between its thirst-based heading and proactive-drinking text; use for logistics, not a numeric drinking policy. |

NATA's fluid-intake discussion explicitly distinguishes competitive performance
planning from the use of thirst to avoid overdrinking when personal sweat rates
are unknown. Do not flatten this into either "everyone must replace every lost
milliliter" or "thirst alone tells you what to pack before departure."
Sweat-loss estimates and observed past consumption are evidence inputs, not
automatic drinking prescriptions. A symptom report is not a packing problem:
the app must not diagnose dehydration versus EAH or prescribe treatment.

### Outstanding Evidence Work

- Obtain E3 original full text and verify its relevant recommendation wording,
  evidence grades, contraindications and subsequent updates.
- Review E1/E4 original methods and limits before relying on quantitative claims.
- Extend the targeted search for updated position statements and hiking-specific
  studies; do not claim the current register is exhaustive or the latest consensus.
- Have sports-medicine/nutrition and experienced route-planning reviewers approve
  numerical policies and reserve assumptions separately. Record reviewer, date,
  scope, evidence IDs and unresolved disagreements. No review has occurred yet.

## Current Implementation Audit

These are code observations, not a diagnosis of the user's actual 18 km run.
Its identity and complete input/trace have not been supplied or inspected.

| Location | Current behavior | Design consequence |
| --- | --- | --- |
| `personal-planning.ts`, `estimatePersonalPackingNeeds` | Active hours times 0.55; hot multiplier 1.3; high-altitude multiplier 1.1. | Constants have no validated applicability recorded here. Do not replace them with equally unsupported constants. |
| Same | Unknown refill follows the no-refill branch. | Missing evidence becomes a silently definitive carry estimate. |
| Same | Any treated/natural refill caps the center at 1.5 L, or 2 L when hot. | Cannot represent first/longest dry segment, treatment feasibility, outage or refill location. |
| Same | No-refill center capped at 6 L, then expanded/rounded into a range. | This is not a 6 L safety limit; long-route needs can be suppressed and output can still exceed 6 L. |
| Same, `itineraryHours` | Earliest start to latest end per day, including gaps. | Elapsed route time and moving time are conflated; rest also consumes some water but must not inherit the exercise rate silently. |
| Same | Missing ascent contributes zero to terrain estimate; fallback duration is still produced. | Estimated duration needs provenance and uncertainty, not presentation as a recorded fact. |
| `packing-validation.ts`, `packingWaterMixError` | Requires large plus small bottled water and at least 2 L in selected full-plan cases. | Container preference acts as a physiological constraint; filled reservoirs need separate representation. |
| `skills.ts`, `tools.ts` | Personal-needs tool discourages follow-up for missing profile fields; generic water preference also in skill. | Keep optional body fields optional, but allow a targeted question for missing route-critical facts. Update tool contract and checks together, not only the prompt. |

Food formulas and nutrition checks are outside this change. Splitting hydration
must not silently change their duration semantics or claim they are validated.

## Proposed Decision Contract

This is an engineering design, not a set of medically validated numbers.

1. Read saved journey, explicit user statements and available route/weather
   evidence. Keep fact provenance and timestamp; surface conflicts rather than
   replacing explicit facts with model guesses. Historical track time is not
   automatically this person's future active time.
2. Screen scope: initial numeric policy targets ordinary adult day hiking.
   Multi-day, extreme heat/exposure, high-altitude expeditions, medical fluid
   restrictions and populations outside reviewed evidence require separate
   review. Do not demand a medical questionnaire or infer health status.
3. Separate active time, elapsed time, rest and contingency. Missing critical
   facts produce `needs_context`; ask only the highest-impact unresolved question
   or a short grouped question. Do not request facts already known.
4. Classify each water opportunity independently: location, expected arrival,
   availability evidence/date, potable status, treatment method and feasibility,
   access/opening hours and fallback. An unverified stream is not a confirmed
   refill. Keeping it unverified does not assert it is absent.
5. Only apply a numerical policy whose population, environment and input
   requirements match. Otherwise return `needs_review` with null numerical
   recommendations; an LLM must not supply a substitute coefficient. Missing
   personal sweat testing alone is not a mandatory blocker if an approved
   population-level policy eventually supports the case.
6. For an approved policy, model consumption ranges per segment and a separately
   justified contingency. Output whole-route consumption, departure load,
   maximum on-route load and refill plan. Reserve is available water, not a
   direction to drink it. Do not silently count the same reserve at every stop.
7. Match actual filled water to existing containers, then additional containers
   if required. Distinguish empty capacity, filled volume and container tare.
   A 2 L reservoir can contain less than 2 L; its capacity is not consumed water.
8. If a feasible load/refill/escape plan cannot be formed, return `infeasible`
   and discuss changing the route, timing or support. Never lower water to fit
   a weight cap or declare heat risk solved by carrying more.

### Suggested Internal Output

`status`: `needs_context | needs_review | ready | infeasible`.
Keep `factsUsed`, `unknowns`, `assumptions`, `evidenceIds`, `policyVersion`,
`segments`, `questions`, and separate nullable `routeConsumptionLiters`,
`departureWaterLiters`, `maxCarryWaterLiters`, `reserveLiters`.
Ranges describe planning uncertainty, not statistical confidence intervals.
Confidence must reflect hydration-relevant evidence, not the count of body fields.

The existing draft flow should preserve other proposed equipment while water is
unresolved. It must not report a complete validated packing list in that state.
An explicit user request to record their chosen water amount is different from
an agent recommendation: preserve the choice and provenance without labeling it
validated or duplicating bottles. No new public UI is specified in this phase.

### Logistics Arithmetic, Not Physiology

Once independently reviewed segment-consumption and reserve inputs exist,
use a water-inventory simulation: current load plus confirmed refill minus
segment use. Check reserve and container capacity at each boundary, and model
refill failure/escape according to the approved contingency policy. Departure
load covers the first supported section; maximum load can occur after a later
refill. They must not both be set to the longest dry section automatically.
For unchanged consumption and reserve assumptions, adding a usable refill option
cannot increase the mathematically minimum departure load; losing that option
cannot decrease it. This is a testable logistics property, not a medical claim.

## Evaluation Cases

All scenarios below are synthetic until explicitly replaced with a consented,
de-identified real trace. Expected behaviors are contract tests, not approved
liters. Paired scenarios keep other inputs fixed. Temperature labels are test
conditions, not newly invented clinical thresholds.

| ID | Scenario | Expected behavior |
| --- | --- | --- |
| H01 | Only 18 km is known | No definitive bottle count; distinguish missing duration, environment and refill evidence. |
| H02 | 18 km, 4 active hours, cool, no refill | Use only an applicable reviewed policy; otherwise `needs_review`. |
| H03 | H02 but 8 hours | Same policy and conditions must not yield lower whole-route demand merely from increased duration. |
| H04 | H03 but hot/exposed | Reassess policy applicability and heat feasibility; do not only multiply by 1.3. |
| H05 | H03 with verified potable refill after 1 hour, then 7 hours dry | Departure and maximum carry can differ; no universal 1.5 L cap. |
| H06 | H03 with verified refill after 7 hours | Departure covers the long first section; not equivalent to H05. |
| H07 | H05 but refill reported closed | Recompute feasibility; no stale refill discount. |
| H08 | H03 with map-marked stream, availability unknown | Preserve uncertainty, do not treat as guaranteed potable refill. |
| H09 | H08 with current flow confirmation and suitable treatment plan | Evaluate treatment time/capacity and access before accepting refill. |
| H10 | Two 2-hour walking blocks separated by 4-hour rest | Keep 4 active / 8 elapsed hours distinct, without assuming rest needs zero water. |
| H11 | H02 with user's existing reservoir | No forced bottled-water mix; distinguish fill volume from capacity. |
| H12 | Same planned volume in different bottle sizes | Total volume/mass consistent; expose packaging excess rather than hiding it as need. |
| H13 | User has clinician-prescribed fluid restriction | No generic numerical override; refer planning to the relevant professional. |
| H14 | Long unsupported dry section exceeds feasible carry capacity | `infeasible` or `needs_review`, not a clipped safe-looking amount. |
| H15 | User says water feels heavy and asks to halve it | Explain unresolved tradeoff; do not reduce solely to satisfy preference. |
| H16 | User reports confusion or collapse during the hike | Leave packing workflow; urgent-help guidance, no automatic dehydration diagnosis or force-drink advice. |
| H17 | User answers the pending refill question | Resume same draft, use the answer, preserve other items and write permissions; no regeneration or duplicate water. |
| H18 | Three 1.5 L bottles | Correctly report 4.5 L and about 4.5 kg water plus tare; do not declare excess without context. |

### Scoring and Release Gates

- Deterministic checks: unit conversion, water accounting, per-segment capacity,
  provenance, null handling, confirmation state, idempotent continuation and no
  accidental changes to food/scope/atomic writes.
- Real-model comparison: freeze journey facts, prompts, policy version, model
  configuration and initial containers. Run at least three repetitions per case
  per version, serially against isolated disposable data; report every failure,
  variation, token usage and latency. Three repetitions are an engineering smoke
  test, not statistical validation. Never use a live hike as an experiment.
- Human review: two relevant disciplines independently label acceptable decision
  paths and, only when justified, quantitative ranges. Adjudicate disagreements;
  leave unresolved cases unscored numerically and blocked from automatic policy.
- Report unsupported definitive recommendations, critical omissions, incorrect
  refill assumptions, overdrinking language, unnecessary clarification and burden
  separately. Do not collapse safety failures into an average quality score.
- Require zero observed critical contract violations in the release suite and
  professional approval of numerical policies. Passing the suite cannot certify
  medical safety. Do not use lower carried liters or an LLM judge as ground truth.

## Reproducible Old-Estimator Snapshot

Run without database, network or model permissions:

```sh
npx --yes deno run supabase/functions/app-agent/hydration-baseline.ts
```

The script prints complete synthetic inputs and current outputs. It does not
assert that old values are correct, create users, save packing items or deploy.
Archive outputs with the source revision/file hash before implementation; do not
regenerate a baseline after editing the estimator and call it the old result.
The real 18 km complaint remains a separate trace-retrieval task, not reproduced
by this script. The proposed numerical policy was not adopted; live A/B quality
results and expert review remain unavailable.

### Recorded Snapshot (2026-09-08)

Executed successfully against `personal-planning.ts` SHA-256
`03f07d763e18763c96a4585bc91f04215ce58a9e330f9a235eff7036776a3e9a`.
Fixture script: `supabase/functions/app-agent/hydration-baseline.ts`.
All cases use 18 km, one day, unknown ascent, no recorded track duration, and
an empty personal profile. Detailed synthetic inputs are in the script.

| Case | Estimated active hours | Old starting-water range (L) |
| --- | --- | --- |
| Distance only, refill unknown | 4 | 1.75-2.75 |
| Explicit 4 hours, no refill | 4 | 1.75-2.75 |
| Explicit 8 hours, no refill | 8 | 3.5-5.25 |
| Explicit 8 hours, refill unknown | 8 | 3.5-5.25 |
| Explicit 8 hours, treated refill | 8 | 1.25-1.75 |
| Explicit 8 hours, natural refill | 8 | 1.25-1.75 |
| Explicit 8 hours, hot, no refill | 8 | 4.5-6.75 |
| Explicit 8 hours, hot, treated refill | 8 | 1.5-2.5 |
| Explicit 14 hours, no refill | 14 | 4.75-7.25 |
| Two 2-hour blocks spanning 8 hours | 8 | 3.5-5.25 |

These outputs document unsupported simplifications in the old contract; they
are not reference prescriptions, clinical error measurements or new-policy
test passes. The model's eventual packaging choices are not exercised here.
