# Ishiki Task Priority Register

Last refreshed: **2026-09-09T05:33:47.345Z** from a task snapshot captured at **2026-09-09T05:33:47.345Z**.

Active tasks: **84** · Untriaged: **8** · Dependency-blocked: **3**

## Ranking policy

- Priority: **critical → high → medium → low → untriaged**.
- Size: **XS → S → M → L → XL → untriaged**.
- Ranking favours higher-impact, smaller, ready work; work already in progress receives a continuity boost.
- Manual overrides win over calculated suggestions and survive refreshes.
- Newly observed tasks enter as **untriaged / unassigned**. A maintainer must confirm their priority, size, and release.
- Versions are user-testing milestones, not automatic deployment approvals.

## Release plan

| Version | Status | Capacity | Fix reserve | Testing goal | Entry dependencies |
|---|---|---:|---:|---|---|
| R1 — Trust and recovery beta | testing-next | 16 | 4 | Let testers exercise Ishiki's highest-risk privacy, account, recovery, and release-safety paths before broader feature testing. | None |
| R2 — Everyday health and money beta | developing | 20 | 4 | Give testers coherent health, medication, money, work, and daily-planning workflows after the trust baseline is stable. | R1 |
| R3 — Connected life beta | planned | 20 | 4 | Expand testing to Calendar, feedback, household coordination, imports, recipes, study, and other connected workflows. | R1, R2 |

## R1 — Trust and recovery beta

**Testing goal:** Let testers exercise Ishiki's highest-risk privacy, account, recovery, and release-safety paths before broader feature testing.

**Release gate:** All assigned privacy and recovery acceptance checks pass on disposable data, with no critical or high-priority blocker open.

**Feedback focus:** Unexpected access, destructive outcomes, unclear recovery advice, and release checks that cannot be trusted.

**Tester brief:** [Open R1 tester brief](task-priority/briefs/R1.md)

**Planned load:** 10/16 active tasks. 4 places are reserved for tester-found fixes, with 2 additional planning places open.

| Rank | Task | State | Priority | Size | Dependencies | Rationale |
|---:|---|---|---|---|---|---|
| 1 | #135 Prove Calendar privacy on the real database path | IN_PROGRESS | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 2 | #178 Run the physical-device reminder privacy and recovery check | IN_PROGRESS | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 3 | #155 Make lint failures stand out clearly during release checks | IN_PROGRESS | critical | M | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears moderately scoped; grouped into R1 by its trust testing theme. |
| 4 | #193 Catch unsafe medication database targets before PostgreSQL runs | PENDING | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 5 | #196 Catch privacy leaks in medication release evidence | PENDING | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 6 | #197 Catch unsupported server isolation before the Google release check runs | PENDING | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 7 | #203 Catch stock-history warnings in the browser release checks | PENDING | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 8 | #209 Run deleted-account export privacy checks before release | PENDING | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 9 | #214 Keep invitation and medical-forwarding responses credential-free | PENDING | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 10 | #244 Catch bulk audit batches that hide an actor ownership mismatch | PROPOSED | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |

## R2 — Everyday health and money beta

**Testing goal:** Give testers coherent health, medication, money, work, and daily-planning workflows after the trust baseline is stable.

**Release gate:** R1 feedback is triaged; core health and money browser/mobile acceptance passes; no unresolved data-integrity blocker remains.

**Feedback focus:** Whether daily records are easy to create, correct, understand, and recover across desktop and mobile.

**Tester brief:** [Open R2 tester brief](task-priority/briefs/R2.md)

**Planned load:** 14/20 active tasks. 4 places are reserved for tester-found fixes, with 2 additional planning places open.

| Rank | Task | State | Priority | Size | Dependencies | Rationale |
|---:|---|---|---|---|---|---|
| 1 | #158 Confirm restored claim changes appear safely in the browser | IN_PROGRESS | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 2 | #188 Confirm pay cycles and work | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 3 | #181 Catch medication quiet-hour regressions across timezone and DST changes | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 4 | #182 Confirm recreated accounts see a clean health dashboard | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 5 | #206 Confirm income edits reject links owned by another account | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 6 | #226 Confirm claim imports reject immutable-field tampering on the real database path | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 7 | #241 Confirm upgrades preserve claims created by an earlier duplicate race | PROPOSED | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 8 | #245 Confirm cancelled health tests never leave private database fixtures behind | PROPOSED | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 9 | #233 Explain rejected medication captures without losing the offline action | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R2 by its daily testing theme. |
| 10 | #219 Show users when their HealthKit data last synced successfully | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; grouped into R2 by its daily testing theme. |
| 11 | #231 Let users record PRN or unscheduled medication doses on mobile | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; grouped into R2 by its daily testing theme. |
| 12 | #189 Build appointment care workflow | PENDING | medium | L | Ready | Adds a user-visible workflow improvement; appears to span a broad workflow; grouped into R2 by its daily testing theme. |
| 13 | #190 Track personal and shared debts | PENDING | medium | L | Ready | Adds a user-visible workflow improvement; appears to span a broad workflow; grouped into R2 by its daily testing theme. |
| 14 | #192 Track referral and Medicare validity | PENDING | medium | L | Ready | Adds a user-visible workflow improvement; appears to span a broad workflow; grouped into R2 by its daily testing theme. |

## R3 — Connected life beta

**Testing goal:** Expand testing to Calendar, feedback, household coordination, imports, recipes, study, and other connected workflows.

**Release gate:** Earlier release feedback is resolved or explicitly deferred; connection and sharing boundaries pass privacy review.

**Feedback focus:** Consent, sharing boundaries, reconnection, cross-device continuity, and whether connected workflows reduce manual effort.

**Tester brief:** [Open R3 tester brief](task-priority/briefs/R3.md)

**Planned load:** 10/20 active tasks. 4 places are reserved for tester-found fixes, with 6 additional planning places open.

| Rank | Task | State | Priority | Size | Dependencies | Rationale |
|---:|---|---|---|---|---|---|
| 1 | #157 Prevent duplicate Calendar connections after repeated Google callbacks | IN_PROGRESS | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R3 by its connected testing theme. |
| 2 | #220 Confirm one account cannot list or sync another account’s calendars | PROPOSED | high | S | Waiting: #135 | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R3 by its connected testing theme. |
| 3 | #232 Confirm offline mobile replays reach the dashboard for every capture type | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R3 by its connected testing theme. |
| 4 | #253 Confirm recipe imports stay private across households in the browser | PROPOSED | high | XL | Ready | Prevents or detects a concrete reliability regression; appears to span a broad workflow; grouped into R3 by its connected testing theme. |
| 5 | #180 Let users edit quiet hours from mobile settings | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; grouped into R3 by its connected testing theme. |
| 6 | #156 Keep saved Calendar sync settings after reconnecting | IN_PROGRESS | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; grouped into R3 by its connected testing theme. |
| 7 | #252 Keep imported recipe sources private and traceable | PROPOSED | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; grouped into R3 by its connected testing theme. |
| 8 | #222 Stop outdated pull-request checks from delaying current feedback | PROPOSED | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; grouped into R3 by its connected testing theme. |
| 9 | #184 Complete Study import review | PENDING | low | L | Ready | Has lower immediate user or release risk; appears to span a broad workflow; grouped into R3 by its connected testing theme. |
| 10 | #227 Let households manage and reprint active storage labels | PENDING | low | XL | Ready | Has lower immediate user or release risk; appears to span a broad workflow; grouped into R3 by its connected testing theme. |

## Unassigned backlog

| Rank | Task | State | Priority | Size | Dependencies | Rationale |
|---:|---|---|---|---|---|---|
| 1 | #186 Erase revoked Calendar credentials after Google rejects a sync | PENDING | critical | M | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 2 | #247 Sign mobile users out when a deleted account is detected | PROPOSED | critical | M | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 3 | #195 Catch stale medication evidence before release approval | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 4 | #198 Catch Calendar telemetry regressions before release approval | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 5 | #199 Confirm Calendar recovery diagnostics in staging | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 6 | #200 Catch recovery evidence freshness regressions before release approval | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 7 | #204 Keep oversized auth failures from overwhelming release reports | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 8 | #207 Catch missing accepted sign-in evidence before release approval | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 9 | #218 Confirm HealthKit recovery survives an app restart | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 10 | #230 Catch medication picker regressions before release | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 11 | #236 Catch scanned Medicare layout regressions before release | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 12 | #237 Keep local Medicare OCR failures easy to recover from | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 13 | #248 Prove deleted-account rejection through the real mobile API process | PROPOSED | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 14 | #240 Restore the health-claim release check so it can run end to end | PROPOSED | critical | XL | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears to span a broad workflow; kept in the unscheduled backlog pending product grouping. |
| 15 | #179 Let owners recover selected feedback rows with confirmation | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 16 | #194 Prevent a disposable label from masking the shared development database | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 17 | #201 Remind owners about expiring recovery evidence before a release | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 18 | #210 Prevent future health reports from bypassing deleted-data export rules | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 19 | #211 Make corrected stock warnings settle after recovery | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 20 | #213 Show operators how many alert failures occurred during an outage | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 21 | #243 Give every rejected statement the right recovery advice | PROPOSED | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 22 | #208 Catch broken automation across every release workflow | PENDING | high | XL | Ready | Prevents or detects a concrete reliability regression; appears to span a broad workflow; kept in the unscheduled backlog pending product grouping. |
| 23 | #183 Add manual price watch | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 24 | #185 Add goal progress history | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 25 | #234 Let users restore an accidentally deleted offline capture | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 26 | #235 Show users a clear history of offline edits and deletions | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 27 | #154 Keep Prisma generation future-proof before Prisma 7 | IN_PROGRESS | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; kept in the unscheduled backlog pending product grouping. |
| 28 | #187 Keep real Calendar acceptance evidence with each release | PENDING | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; kept in the unscheduled backlog pending product grouping. |
| 29 | #205 Keep valid income links when lookup lists are temporarily unavailable | PENDING | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 30 | #212 Prove stock diagnostics stay private across mobile accounts | PENDING | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 31 | #215 Keep travel-block details limited to the fields users need | PENDING | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; kept in the unscheduled backlog pending product grouping. |
| 32 | #225 Keep claim review forms aligned with fields the server accepts | PENDING | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 33 | #229 Keep the intended page when users switch to account creation | PENDING | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; kept in the unscheduled backlog pending product grouping. |
| 34 | #191 Plan pharmacy refills | PENDING | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 35 | #202 Let owners inspect the exact stock entries that need review | PENDING | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 36 | #216 Make the iOS HealthKit development target buildable | PENDING | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 37 | #217 Capture real-iPhone HealthKit permission and anchor evidence | PENDING | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 38 | #223 Restore reliable TypeScript checks after Next.js regenerates route types | PENDING | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 39 | #228 Fit storage labels to common printable label sheets | PENDING | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 40 | #251 Make the release browser gate fail on dialog console warnings | PROPOSED | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 41 | #255 Give testers a focused brief for each release version | IN_PROGRESS | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 42 | #249 Keep disposable database gates behind workflow lint | PROPOSED | low | L | Ready | Has lower immediate user or release risk; appears to span a broad workflow; kept in the unscheduled backlog pending product grouping. |
| 43 | #250 Audit all remaining dialogs for accessible descriptions | PROPOSED | low | XL | Ready | Has lower immediate user or release risk; appears to span a broad workflow; kept in the unscheduled backlog pending product grouping. |
| 44 | #256 Keep every disposable database check safe to share after failures | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 45 | #257 Show which safe database failure category is recurring across releases | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 46 | #258 Prevent an old feedback sheet link from flashing while status refreshes | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 47 | #259 Keep Money workspace shortcuts usable with enlarged text | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 48 | #262 Keep reminder handling stable during very long app sessions | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 49 | #263 Show release owners which ready outcomes are missing tester coverage | PROPOSED | untriaged | untriaged | Waiting: #255 | New task awaiting priority, size, and release triage. |
| 50 | #264 Catch broken iPhone preview handoffs before tester sessions | PROPOSED | untriaged | untriaged | Waiting: #255 | New task awaiting priority, size, and release triage. |

## Untriaged tasks

| Rank | Task | State | Priority | Size | Dependencies | Rationale |
|---:|---|---|---|---|---|---|
| 1 | #255 Give testers a focused brief for each release version | IN_PROGRESS | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 2 | #256 Keep every disposable database check safe to share after failures | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 3 | #257 Show which safe database failure category is recurring across releases | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 4 | #258 Prevent an old feedback sheet link from flashing while status refreshes | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 5 | #259 Keep Money workspace shortcuts usable with enlarged text | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 6 | #262 Keep reminder handling stable during very long app sessions | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 7 | #263 Show release owners which ready outcomes are missing tester coverage | PROPOSED | untriaged | untriaged | Waiting: #255 | New task awaiting priority, size, and release triage. |
| 8 | #264 Catch broken iPhone preview handoffs before tester sessions | PROPOSED | untriaged | untriaged | Waiting: #255 | New task awaiting priority, size, and release triage. |

## Dependency-blocked tasks

| Rank | Task | State | Priority | Size | Dependencies | Rationale |
|---:|---|---|---|---|---|---|
| 1 | #220 Confirm one account cannot list or sync another account’s calendars | PROPOSED | high | S | Waiting: #135 | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R3 by its connected testing theme. |
| 2 | #263 Show release owners which ready outcomes are missing tester coverage | PROPOSED | untriaged | untriaged | Waiting: #255 | New task awaiting priority, size, and release triage. |
| 3 | #264 Catch broken iPhone preview handoffs before tester sessions | PROPOSED | untriaged | untriaged | Waiting: #255 | New task awaiting priority, size, and release triage. |

## Recently completed or closed

| Task | State | Updated |
|---|---|---|
| #260 Recover priority updates safely after an interrupted process | CANCELLED | 2026-09-09T05:23:48.803Z |
| #261 Warn when task changes stop reaching the priority plan | CANCELLED | 2026-09-09T05:23:48.803Z |
| #177 Catch duplicate reminder taps before they create duplicate actions | IMPLEMENTED | 2026-09-09T04:54:44.720Z |
| #176 Show a clear feedback recovery state before the first sheet exists | MERGED | 2026-09-09T04:54:02.767Z |
| #175 Keep feedback submission usable when sheet lookup fails | MERGED | 2026-09-09T04:53:32.779Z |
| #254 Keep the priority register current when tasks change | MERGED | 2026-09-09T04:52:36.687Z |
| #174 Confirm Money workspace links work after sign-in on desktop and mobile | IMPLEMENTED | 2026-09-09T04:51:28.562Z |
| #173 Make failed database acceptance results diagnosable without exposing health data | IMPLEMENTED | 2026-09-09T04:51:21.252Z |
| #159 Remove remaining dialog accessibility warnings before release | MERGED | 2026-09-09T04:47:25.787Z |
| #146 Save recipes from links and photos | MERGED | 2026-09-09T04:46:21.119Z |
| #132 Run Syntropic’s safe release checks automatically on pull requests | MERGED | 2026-09-09T04:46:17.727Z |
| #172 Catch CI drift before the disposable database gate is skipped | MERGED | 2026-09-09T04:45:31.973Z |
| #239 Create a versioned task priority register | MERGED | 2026-09-09T04:45:06.761Z |
| #171 Prevent deleted accounts from using old mobile sessions | MERGED | 2026-09-09T04:34:38.655Z |
| #166 Keep privacy checks clean after a cancelled release run | MERGED | 2026-09-09T03:18:05.154Z |
| #165 Keep bulk health audit rejections visible when alert delivery fails | MERGED | 2026-09-09T03:07:09.247Z |
| #164 Confirm the upload screen gives clear recovery options for protected PDFs | MERGED | 2026-09-09T03:05:38.006Z |
| #161 Prevent duplicate claims when matching imports confirm at the same time | MERGED | 2026-09-09T02:53:32.029Z |
| #116 Confirm deleted imports stay hidden from replacement accounts | MERGED | 2026-09-09T02:48:02.500Z |
| #148 Let users import scanned Medicare statements without manual entry | MERGED | 2026-09-09T00:05:36.624Z |

## Data quality

- **Warning:** #255 is awaiting priority or size triage.
- **Warning:** #256 is awaiting priority or size triage.
- **Warning:** #257 is awaiting priority or size triage.
- **Warning:** #258 is awaiting priority or size triage.
- **Warning:** #259 is awaiting priority or size triage.
- **Warning:** #262 is awaiting priority or size triage.
- **Warning:** #263 is awaiting priority or size triage.
- **Warning:** #264 is awaiting priority or size triage.
- **Warning:** R1 has 35 unexplained ready outcomes missing tester coverage: #132 Run Syntropic’s safe release checks automatically on pull requests; #239 Create a versioned task priority register; #166 Keep privacy checks clean after a cancelled release run; #165 Keep bulk health audit rejections visible when alert delivery fails; #136 Keep Calendar event responses credential-free; #127 Stop spawned server workers from surviving a failed Google release check; #27 Make the dashboard release gate run on a migrated database; #54 Run health privacy checks automatically before releases; #72 Keep privacy-boundary alerts grouped across all running app instances; #18 Prove offline conflict recovery and HealthKit imports before release; #39 Keep other Auth.js recovery errors on the same Ishiki origin; #48 Keep successful Calendar responses credential-free; #38 Run the credential-free Google wrapper check automatically in CI; #37 Keep Google release failures diagnosable when readiness breaks; #98 Give users a safe recovery path for historical stock mismatches; #25 Prove worker alerts stay reliable during failure recovery; #24 Complete the first live recovery and alert handoff; #47 Prevent Calendar recovery leaks from unexpected provider crashes; #83 Catch imported-claim ownership regressions before release; #94 Catch medication stock and fill races before release; #71 Prevent ownership drift when imported claim rows are edited; #67 Confirm deleted-account claim tombstones retain no sensitive source metadata; #74 Restore health-claims tests so privacy checks can run; #63 Alert operators when database ownership guards reject writes; #70 Prove legacy ownership drift blocks a release; #64 Keep imported claim ownership intact when records are edited; #60 Prevent cross-owner audit records at the database boundary; #45 Catch Calendar recovery guidance regressions before release; #43 Show clearer recovery guidance when Calendar access expires; #35 Catch parallel Google OAuth release-check regressions before CI; #32 Keep local OAuth release checks safe for parallel runs; #29 Make the Google recovery check run automatically in the release gate; #23 Catch keyboard and mobile accessibility regressions before release; #22 Keep recovery and worker alerts proven after launch; #14 Security scan.
- **Warning:** R2 has 21 unexplained ready outcomes missing tester coverage: #173 Make failed database acceptance results diagnosable without exposing health data; #115 Prevent medication checks from touching a shared development database; #73 Prove alert delivery failures never hide rejected health writes; #69 Prevent imported claim rows from drifting when an import changes owners; #68 Prevent bulk edits from moving imported claims between users; #126 Prove alert receiver outages cannot stop sync workers; #99 Confirm income saves survive a real authenticated reload; #101 Clarify the combined Money workspace alongside direct finance pages; #93 Deliver medication reminders on users’ phones; #82 Keep account deletion working on freshly migrated databases; #88 Regroup navigation around Money and Health; #87 Restructure medications around variants and daily use; #90 Restore Medicare PDF import; #65 Detect older cross-owner claim rows before they are exposed; #62 Prevent cross-owner health claim rows at the database boundary; #57 Prove every claim review lifecycle event remains private and append-only; #56 Let reviewers see which fields changed without revealing claim values; #50 Prove health claims stay private across users and retries; #46 Import Medicare and private health claims; #10 Build mobile health companion; #8 Add pathology review import.
- **Warning:** R3 has 4 unexplained ready outcomes missing tester coverage: #175 Keep feedback submission usable when sheet lookup fails; #128 Keep server logs available when Google auth assertions fail; #44 Catch Calendar error leaks through real route handlers; #41 Keep Calendar connection errors sanitized by contract.

## Maintenance

1. Feed each project-task change event's complete state-partitioned export to `pnpm task-priority:ingest -- <export.json>`.
2. Add or amend explicit decisions in `task-priority/overrides.json`.
3. Use `pnpm task-priority:refresh` only to regenerate from the committed snapshot.
4. Run `pnpm task-priority:check` in release checks to catch missing tasks, invalid versions, or stale generated output.

# Ishiki Task Priority Register

Last refreshed: **2026-09-09T05:33:47.345Z** from a task snapshot captured at **2026-09-09T05:33:47.345Z**.

Active tasks: **84** · Untriaged: **8** · Dependency-blocked: **3**

## Ranking policy

- Priority: **critical → high → medium → low → untriaged**.
- Size: **XS → S → M → L → XL → untriaged**.
- Ranking favours higher-impact, smaller, ready work; work already in progress receives a continuity boost.
- Manual overrides win over calculated suggestions and survive refreshes.
- Newly observed tasks enter as **untriaged / unassigned**. A maintainer must confirm their priority, size, and release.
- Versions are user-testing milestones, not automatic deployment approvals.

## Release plan

| Version | Status | Capacity | Fix reserve | Testing goal | Entry dependencies |
|---|---|---:|---:|---|---|
| R1 — Trust and recovery beta | testing-next | 16 | 4 | Let testers exercise Ishiki's highest-risk privacy, account, recovery, and release-safety paths before broader feature testing. | None |
| R2 — Everyday health and money beta | developing | 20 | 4 | Give testers coherent health, medication, money, work, and daily-planning workflows after the trust baseline is stable. | R1 |
| R3 — Connected life beta | planned | 20 | 4 | Expand testing to Calendar, feedback, household coordination, imports, recipes, study, and other connected workflows. | R1, R2 |

## R1 — Trust and recovery beta

**Testing goal:** Let testers exercise Ishiki's highest-risk privacy, account, recovery, and release-safety paths before broader feature testing.

**Release gate:** All assigned privacy and recovery acceptance checks pass on disposable data, with no critical or high-priority blocker open.

**Feedback focus:** Unexpected access, destructive outcomes, unclear recovery advice, and release checks that cannot be trusted.

**Tester brief:** [Open R1 tester brief](task-priority/briefs/R1.md)

**Planned load:** 10/16 active tasks. 4 places are reserved for tester-found fixes, with 2 additional planning places open.

| Rank | Task | State | Priority | Size | Dependencies | Rationale |
|---:|---|---|---|---|---|---|
| 1 | #135 Prove Calendar privacy on the real database path | IN_PROGRESS | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 2 | #178 Run the physical-device reminder privacy and recovery check | IN_PROGRESS | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 3 | #155 Make lint failures stand out clearly during release checks | IN_PROGRESS | critical | M | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears moderately scoped; grouped into R1 by its trust testing theme. |
| 4 | #193 Catch unsafe medication database targets before PostgreSQL runs | PENDING | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 5 | #196 Catch privacy leaks in medication release evidence | PENDING | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 6 | #197 Catch unsupported server isolation before the Google release check runs | PENDING | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 7 | #203 Catch stock-history warnings in the browser release checks | PENDING | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 8 | #209 Run deleted-account export privacy checks before release | PENDING | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 9 | #214 Keep invitation and medical-forwarding responses credential-free | PENDING | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 10 | #244 Catch bulk audit batches that hide an actor ownership mismatch | PROPOSED | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |

## R2 — Everyday health and money beta

**Testing goal:** Give testers coherent health, medication, money, work, and daily-planning workflows after the trust baseline is stable.

**Release gate:** R1 feedback is triaged; core health and money browser/mobile acceptance passes; no unresolved data-integrity blocker remains.

**Feedback focus:** Whether daily records are easy to create, correct, understand, and recover across desktop and mobile.

**Tester brief:** [Open R2 tester brief](task-priority/briefs/R2.md)

**Planned load:** 14/20 active tasks. 4 places are reserved for tester-found fixes, with 2 additional planning places open.

| Rank | Task | State | Priority | Size | Dependencies | Rationale |
|---:|---|---|---|---|---|---|
| 1 | #158 Confirm restored claim changes appear safely in the browser | IN_PROGRESS | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 2 | #188 Confirm pay cycles and work | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 3 | #181 Catch medication quiet-hour regressions across timezone and DST changes | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 4 | #182 Confirm recreated accounts see a clean health dashboard | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 5 | #206 Confirm income edits reject links owned by another account | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 6 | #226 Confirm claim imports reject immutable-field tampering on the real database path | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 7 | #241 Confirm upgrades preserve claims created by an earlier duplicate race | PROPOSED | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 8 | #245 Confirm cancelled health tests never leave private database fixtures behind | PROPOSED | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 9 | #233 Explain rejected medication captures without losing the offline action | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R2 by its daily testing theme. |
| 10 | #219 Show users when their HealthKit data last synced successfully | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; grouped into R2 by its daily testing theme. |
| 11 | #231 Let users record PRN or unscheduled medication doses on mobile | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; grouped into R2 by its daily testing theme. |
| 12 | #189 Build appointment care workflow | PENDING | medium | L | Ready | Adds a user-visible workflow improvement; appears to span a broad workflow; grouped into R2 by its daily testing theme. |
| 13 | #190 Track personal and shared debts | PENDING | medium | L | Ready | Adds a user-visible workflow improvement; appears to span a broad workflow; grouped into R2 by its daily testing theme. |
| 14 | #192 Track referral and Medicare validity | PENDING | medium | L | Ready | Adds a user-visible workflow improvement; appears to span a broad workflow; grouped into R2 by its daily testing theme. |

## R3 — Connected life beta

**Testing goal:** Expand testing to Calendar, feedback, household coordination, imports, recipes, study, and other connected workflows.

**Release gate:** Earlier release feedback is resolved or explicitly deferred; connection and sharing boundaries pass privacy review.

**Feedback focus:** Consent, sharing boundaries, reconnection, cross-device continuity, and whether connected workflows reduce manual effort.

**Tester brief:** [Open R3 tester brief](task-priority/briefs/R3.md)

**Planned load:** 10/20 active tasks. 4 places are reserved for tester-found fixes, with 6 additional planning places open.

| Rank | Task | State | Priority | Size | Dependencies | Rationale |
|---:|---|---|---|---|---|---|
| 1 | #157 Prevent duplicate Calendar connections after repeated Google callbacks | IN_PROGRESS | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R3 by its connected testing theme. |
| 2 | #220 Confirm one account cannot list or sync another account’s calendars | PROPOSED | high | S | Waiting: #135 | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R3 by its connected testing theme. |
| 3 | #232 Confirm offline mobile replays reach the dashboard for every capture type | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R3 by its connected testing theme. |
| 4 | #253 Confirm recipe imports stay private across households in the browser | PROPOSED | high | XL | Ready | Prevents or detects a concrete reliability regression; appears to span a broad workflow; grouped into R3 by its connected testing theme. |
| 5 | #180 Let users edit quiet hours from mobile settings | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; grouped into R3 by its connected testing theme. |
| 6 | #156 Keep saved Calendar sync settings after reconnecting | IN_PROGRESS | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; grouped into R3 by its connected testing theme. |
| 7 | #252 Keep imported recipe sources private and traceable | PROPOSED | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; grouped into R3 by its connected testing theme. |
| 8 | #222 Stop outdated pull-request checks from delaying current feedback | PROPOSED | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; grouped into R3 by its connected testing theme. |
| 9 | #184 Complete Study import review | PENDING | low | L | Ready | Has lower immediate user or release risk; appears to span a broad workflow; grouped into R3 by its connected testing theme. |
| 10 | #227 Let households manage and reprint active storage labels | PENDING | low | XL | Ready | Has lower immediate user or release risk; appears to span a broad workflow; grouped into R3 by its connected testing theme. |

## Unassigned backlog

| Rank | Task | State | Priority | Size | Dependencies | Rationale |
|---:|---|---|---|---|---|---|
| 1 | #186 Erase revoked Calendar credentials after Google rejects a sync | PENDING | critical | M | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 2 | #247 Sign mobile users out when a deleted account is detected | PROPOSED | critical | M | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 3 | #195 Catch stale medication evidence before release approval | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 4 | #198 Catch Calendar telemetry regressions before release approval | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 5 | #199 Confirm Calendar recovery diagnostics in staging | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 6 | #200 Catch recovery evidence freshness regressions before release approval | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 7 | #204 Keep oversized auth failures from overwhelming release reports | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 8 | #207 Catch missing accepted sign-in evidence before release approval | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 9 | #218 Confirm HealthKit recovery survives an app restart | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 10 | #230 Catch medication picker regressions before release | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 11 | #236 Catch scanned Medicare layout regressions before release | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 12 | #237 Keep local Medicare OCR failures easy to recover from | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 13 | #248 Prove deleted-account rejection through the real mobile API process | PROPOSED | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 14 | #240 Restore the health-claim release check so it can run end to end | PROPOSED | critical | XL | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears to span a broad workflow; kept in the unscheduled backlog pending product grouping. |
| 15 | #179 Let owners recover selected feedback rows with confirmation | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 16 | #194 Prevent a disposable label from masking the shared development database | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 17 | #201 Remind owners about expiring recovery evidence before a release | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 18 | #210 Prevent future health reports from bypassing deleted-data export rules | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 19 | #211 Make corrected stock warnings settle after recovery | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 20 | #213 Show operators how many alert failures occurred during an outage | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 21 | #243 Give every rejected statement the right recovery advice | PROPOSED | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 22 | #208 Catch broken automation across every release workflow | PENDING | high | XL | Ready | Prevents or detects a concrete reliability regression; appears to span a broad workflow; kept in the unscheduled backlog pending product grouping. |
| 23 | #183 Add manual price watch | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 24 | #185 Add goal progress history | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 25 | #234 Let users restore an accidentally deleted offline capture | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 26 | #235 Show users a clear history of offline edits and deletions | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 27 | #154 Keep Prisma generation future-proof before Prisma 7 | IN_PROGRESS | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; kept in the unscheduled backlog pending product grouping. |
| 28 | #187 Keep real Calendar acceptance evidence with each release | PENDING | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; kept in the unscheduled backlog pending product grouping. |
| 29 | #205 Keep valid income links when lookup lists are temporarily unavailable | PENDING | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 30 | #212 Prove stock diagnostics stay private across mobile accounts | PENDING | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 31 | #215 Keep travel-block details limited to the fields users need | PENDING | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; kept in the unscheduled backlog pending product grouping. |
| 32 | #225 Keep claim review forms aligned with fields the server accepts | PENDING | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 33 | #229 Keep the intended page when users switch to account creation | PENDING | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; kept in the unscheduled backlog pending product grouping. |
| 34 | #191 Plan pharmacy refills | PENDING | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 35 | #202 Let owners inspect the exact stock entries that need review | PENDING | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 36 | #216 Make the iOS HealthKit development target buildable | PENDING | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 37 | #217 Capture real-iPhone HealthKit permission and anchor evidence | PENDING | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 38 | #223 Restore reliable TypeScript checks after Next.js regenerates route types | PENDING | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 39 | #228 Fit storage labels to common printable label sheets | PENDING | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 40 | #251 Make the release browser gate fail on dialog console warnings | PROPOSED | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 41 | #255 Give testers a focused brief for each release version | IN_PROGRESS | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 42 | #249 Keep disposable database gates behind workflow lint | PROPOSED | low | L | Ready | Has lower immediate user or release risk; appears to span a broad workflow; kept in the unscheduled backlog pending product grouping. |
| 43 | #250 Audit all remaining dialogs for accessible descriptions | PROPOSED | low | XL | Ready | Has lower immediate user or release risk; appears to span a broad workflow; kept in the unscheduled backlog pending product grouping. |
| 44 | #256 Keep every disposable database check safe to share after failures | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 45 | #257 Show which safe database failure category is recurring across releases | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 46 | #258 Prevent an old feedback sheet link from flashing while status refreshes | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 47 | #259 Keep Money workspace shortcuts usable with enlarged text | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 48 | #262 Keep reminder handling stable during very long app sessions | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 49 | #263 Show release owners which ready outcomes are missing tester coverage | PROPOSED | untriaged | untriaged | Waiting: #255 | New task awaiting priority, size, and release triage. |
| 50 | #264 Catch broken iPhone preview handoffs before tester sessions | PROPOSED | untriaged | untriaged | Waiting: #255 | New task awaiting priority, size, and release triage. |

## Untriaged tasks

| Rank | Task | State | Priority | Size | Dependencies | Rationale |
|---:|---|---|---|---|---|---|
| 1 | #255 Give testers a focused brief for each release version | IN_PROGRESS | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 2 | #256 Keep every disposable database check safe to share after failures | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 3 | #257 Show which safe database failure category is recurring across releases | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 4 | #258 Prevent an old feedback sheet link from flashing while status refreshes | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 5 | #259 Keep Money workspace shortcuts usable with enlarged text | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 6 | #262 Keep reminder handling stable during very long app sessions | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 7 | #263 Show release owners which ready outcomes are missing tester coverage | PROPOSED | untriaged | untriaged | Waiting: #255 | New task awaiting priority, size, and release triage. |
| 8 | #264 Catch broken iPhone preview handoffs before tester sessions | PROPOSED | untriaged | untriaged | Waiting: #255 | New task awaiting priority, size, and release triage. |

## Dependency-blocked tasks

| Rank | Task | State | Priority | Size | Dependencies | Rationale |
|---:|---|---|---|---|---|---|
| 1 | #220 Confirm one account cannot list or sync another account’s calendars | PROPOSED | high | S | Waiting: #135 | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R3 by its connected testing theme. |
| 2 | #263 Show release owners which ready outcomes are missing tester coverage | PROPOSED | untriaged | untriaged | Waiting: #255 | New task awaiting priority, size, and release triage. |
| 3 | #264 Catch broken iPhone preview handoffs before tester sessions | PROPOSED | untriaged | untriaged | Waiting: #255 | New task awaiting priority, size, and release triage. |

## Recently completed or closed

| Task | State | Updated |
|---|---|---|
| #260 Recover priority updates safely after an interrupted process | CANCELLED | 2026-09-09T05:23:48.803Z |
| #261 Warn when task changes stop reaching the priority plan | CANCELLED | 2026-09-09T05:23:48.803Z |
| #177 Catch duplicate reminder taps before they create duplicate actions | IMPLEMENTED | 2026-09-09T04:54:44.720Z |
| #176 Show a clear feedback recovery state before the first sheet exists | MERGED | 2026-09-09T04:54:02.767Z |
| #175 Keep feedback submission usable when sheet lookup fails | MERGED | 2026-09-09T04:53:32.779Z |
| #254 Keep the priority register current when tasks change | MERGED | 2026-09-09T04:52:36.687Z |
| #174 Confirm Money workspace links work after sign-in on desktop and mobile | IMPLEMENTED | 2026-09-09T04:51:28.562Z |
| #173 Make failed database acceptance results diagnosable without exposing health data | IMPLEMENTED | 2026-09-09T04:51:21.252Z |
| #159 Remove remaining dialog accessibility warnings before release | MERGED | 2026-09-09T04:47:25.787Z |
| #146 Save recipes from links and photos | MERGED | 2026-09-09T04:46:21.119Z |
| #132 Run Syntropic’s safe release checks automatically on pull requests | MERGED | 2026-09-09T04:46:17.727Z |
| #172 Catch CI drift before the disposable database gate is skipped | MERGED | 2026-09-09T04:45:31.973Z |
| #239 Create a versioned task priority register | MERGED | 2026-09-09T04:45:06.761Z |
| #171 Prevent deleted accounts from using old mobile sessions | MERGED | 2026-09-09T04:34:38.655Z |
| #166 Keep privacy checks clean after a cancelled release run | MERGED | 2026-09-09T03:18:05.154Z |
| #165 Keep bulk health audit rejections visible when alert delivery fails | MERGED | 2026-09-09T03:07:09.247Z |
| #164 Confirm the upload screen gives clear recovery options for protected PDFs | MERGED | 2026-09-09T03:05:38.006Z |
| #161 Prevent duplicate claims when matching imports confirm at the same time | MERGED | 2026-09-09T02:53:32.029Z |
| #116 Confirm deleted imports stay hidden from replacement accounts | MERGED | 2026-09-09T02:48:02.500Z |
| #148 Let users import scanned Medicare statements without manual entry | MERGED | 2026-09-09T00:05:36.624Z |

## Data quality

- **Warning:** #255 is awaiting priority or size triage.
- **Warning:** #256 is awaiting priority or size triage.
- **Warning:** #257 is awaiting priority or size triage.
- **Warning:** #258 is awaiting priority or size triage.
- **Warning:** #259 is awaiting priority or size triage.
- **Warning:** #262 is awaiting priority or size triage.
- **Warning:** #263 is awaiting priority or size triage.
- **Warning:** #264 is awaiting priority or size triage.
- **Warning:** R1 has 35 unexplained ready outcomes missing tester coverage: #132 Run Syntropic’s safe release checks automatically on pull requests; #239 Create a versioned task priority register; #166 Keep privacy checks clean after a cancelled release run; #165 Keep bulk health audit rejections visible when alert delivery fails; #136 Keep Calendar event responses credential-free; #127 Stop spawned server workers from surviving a failed Google release check; #27 Make the dashboard release gate run on a migrated database; #54 Run health privacy checks automatically before releases; #72 Keep privacy-boundary alerts grouped across all running app instances; #18 Prove offline conflict recovery and HealthKit imports before release; #39 Keep other Auth.js recovery errors on the same Ishiki origin; #48 Keep successful Calendar responses credential-free; #38 Run the credential-free Google wrapper check automatically in CI; #37 Keep Google release failures diagnosable when readiness breaks; #98 Give users a safe recovery path for historical stock mismatches; #25 Prove worker alerts stay reliable during failure recovery; #24 Complete the first live recovery and alert handoff; #47 Prevent Calendar recovery leaks from unexpected provider crashes; #83 Catch imported-claim ownership regressions before release; #94 Catch medication stock and fill races before release; #71 Prevent ownership drift when imported claim rows are edited; #67 Confirm deleted-account claim tombstones retain no sensitive source metadata; #74 Restore health-claims tests so privacy checks can run; #63 Alert operators when database ownership guards reject writes; #70 Prove legacy ownership drift blocks a release; #64 Keep imported claim ownership intact when records are edited; #60 Prevent cross-owner audit records at the database boundary; #45 Catch Calendar recovery guidance regressions before release; #43 Show clearer recovery guidance when Calendar access expires; #35 Catch parallel Google OAuth release-check regressions before CI; #32 Keep local OAuth release checks safe for parallel runs; #29 Make the Google recovery check run automatically in the release gate; #23 Catch keyboard and mobile accessibility regressions before release; #22 Keep recovery and worker alerts proven after launch; #14 Security scan.
- **Warning:** R2 has 21 unexplained ready outcomes missing tester coverage: #173 Make failed database acceptance results diagnosable without exposing health data; #115 Prevent medication checks from touching a shared development database; #73 Prove alert delivery failures never hide rejected health writes; #69 Prevent imported claim rows from drifting when an import changes owners; #68 Prevent bulk edits from moving imported claims between users; #126 Prove alert receiver outages cannot stop sync workers; #99 Confirm income saves survive a real authenticated reload; #101 Clarify the combined Money workspace alongside direct finance pages; #93 Deliver medication reminders on users’ phones; #82 Keep account deletion working on freshly migrated databases; #88 Regroup navigation around Money and Health; #87 Restructure medications around variants and daily use; #90 Restore Medicare PDF import; #65 Detect older cross-owner claim rows before they are exposed; #62 Prevent cross-owner health claim rows at the database boundary; #57 Prove every claim review lifecycle event remains private and append-only; #56 Let reviewers see which fields changed without revealing claim values; #50 Prove health claims stay private across users and retries; #46 Import Medicare and private health claims; #10 Build mobile health companion; #8 Add pathology review import.
- **Warning:** R3 has 4 unexplained ready outcomes missing tester coverage: #175 Keep feedback submission usable when sheet lookup fails; #128 Keep server logs available when Google auth assertions fail; #44 Catch Calendar error leaks through real route handlers; #41 Keep Calendar connection errors sanitized by contract.

## Maintenance

1. Feed each project-task change event's complete state-partitioned export to `pnpm task-priority:ingest -- <export.json>`.
2. Add or amend explicit decisions in `task-priority/overrides.json`.
3. Use `pnpm task-priority:refresh` only to regenerate from the committed snapshot.
4. Run `pnpm task-priority:check` in release checks to catch missing tasks, invalid versions, or stale generated output.

# Ishiki Task Priority Register

Last refreshed: **2026-09-09T05:33:47.345Z** from a task snapshot captured at **2026-09-09T05:33:47.345Z**.

Active tasks: **84** · Untriaged: **8** · Dependency-blocked: **3**

## Ranking policy

- Priority: **critical → high → medium → low → untriaged**.
- Size: **XS → S → M → L → XL → untriaged**.
- Ranking favours higher-impact, smaller, ready work; work already in progress receives a continuity boost.
- Manual overrides win over calculated suggestions and survive refreshes.
- Newly observed tasks enter as **untriaged / unassigned**. A maintainer must confirm their priority, size, and release.
- Versions are user-testing milestones, not automatic deployment approvals.

## Release plan

| Version | Status | Capacity | Fix reserve | Testing goal | Entry dependencies |
|---|---|---:|---:|---|---|
| R1 — Trust and recovery beta | testing-next | 16 | 4 | Let testers exercise Ishiki's highest-risk privacy, account, recovery, and release-safety paths before broader feature testing. | None |
| R2 — Everyday health and money beta | developing | 20 | 4 | Give testers coherent health, medication, money, work, and daily-planning workflows after the trust baseline is stable. | R1 |
| R3 — Connected life beta | planned | 20 | 4 | Expand testing to Calendar, feedback, household coordination, imports, recipes, study, and other connected workflows. | R1, R2 |

## R1 — Trust and recovery beta

**Testing goal:** Let testers exercise Ishiki's highest-risk privacy, account, recovery, and release-safety paths before broader feature testing.

**Release gate:** All assigned privacy and recovery acceptance checks pass on disposable data, with no critical or high-priority blocker open.

**Feedback focus:** Unexpected access, destructive outcomes, unclear recovery advice, and release checks that cannot be trusted.

**Tester brief:** [Open R1 tester brief](task-priority/briefs/R1.md)

**Planned load:** 10/16 active tasks. 4 places are reserved for tester-found fixes, with 2 additional planning places open.

| Rank | Task | State | Priority | Size | Dependencies | Rationale |
|---:|---|---|---|---|---|---|
| 1 | #135 Prove Calendar privacy on the real database path | IN_PROGRESS | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 2 | #178 Run the physical-device reminder privacy and recovery check | IN_PROGRESS | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 3 | #155 Make lint failures stand out clearly during release checks | IN_PROGRESS | critical | M | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears moderately scoped; grouped into R1 by its trust testing theme. |
| 4 | #193 Catch unsafe medication database targets before PostgreSQL runs | PENDING | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 5 | #196 Catch privacy leaks in medication release evidence | PENDING | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 6 | #197 Catch unsupported server isolation before the Google release check runs | PENDING | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 7 | #203 Catch stock-history warnings in the browser release checks | PENDING | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 8 | #209 Run deleted-account export privacy checks before release | PENDING | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 9 | #214 Keep invitation and medical-forwarding responses credential-free | PENDING | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 10 | #244 Catch bulk audit batches that hide an actor ownership mismatch | PROPOSED | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |

## R2 — Everyday health and money beta

**Testing goal:** Give testers coherent health, medication, money, work, and daily-planning workflows after the trust baseline is stable.

**Release gate:** R1 feedback is triaged; core health and money browser/mobile acceptance passes; no unresolved data-integrity blocker remains.

**Feedback focus:** Whether daily records are easy to create, correct, understand, and recover across desktop and mobile.

**Tester brief:** [Open R2 tester brief](task-priority/briefs/R2.md)

**Planned load:** 14/20 active tasks. 4 places are reserved for tester-found fixes, with 2 additional planning places open.

| Rank | Task | State | Priority | Size | Dependencies | Rationale |
|---:|---|---|---|---|---|---|
| 1 | #158 Confirm restored claim changes appear safely in the browser | IN_PROGRESS | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 2 | #188 Confirm pay cycles and work | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 3 | #181 Catch medication quiet-hour regressions across timezone and DST changes | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 4 | #182 Confirm recreated accounts see a clean health dashboard | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 5 | #206 Confirm income edits reject links owned by another account | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 6 | #226 Confirm claim imports reject immutable-field tampering on the real database path | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 7 | #241 Confirm upgrades preserve claims created by an earlier duplicate race | PROPOSED | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 8 | #245 Confirm cancelled health tests never leave private database fixtures behind | PROPOSED | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 9 | #233 Explain rejected medication captures without losing the offline action | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R2 by its daily testing theme. |
| 10 | #219 Show users when their HealthKit data last synced successfully | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; grouped into R2 by its daily testing theme. |
| 11 | #231 Let users record PRN or unscheduled medication doses on mobile | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; grouped into R2 by its daily testing theme. |
| 12 | #189 Build appointment care workflow | PENDING | medium | L | Ready | Adds a user-visible workflow improvement; appears to span a broad workflow; grouped into R2 by its daily testing theme. |
| 13 | #190 Track personal and shared debts | PENDING | medium | L | Ready | Adds a user-visible workflow improvement; appears to span a broad workflow; grouped into R2 by its daily testing theme. |
| 14 | #192 Track referral and Medicare validity | PENDING | medium | L | Ready | Adds a user-visible workflow improvement; appears to span a broad workflow; grouped into R2 by its daily testing theme. |

## R3 — Connected life beta

**Testing goal:** Expand testing to Calendar, feedback, household coordination, imports, recipes, study, and other connected workflows.

**Release gate:** Earlier release feedback is resolved or explicitly deferred; connection and sharing boundaries pass privacy review.

**Feedback focus:** Consent, sharing boundaries, reconnection, cross-device continuity, and whether connected workflows reduce manual effort.

**Tester brief:** [Open R3 tester brief](task-priority/briefs/R3.md)

**Planned load:** 10/20 active tasks. 4 places are reserved for tester-found fixes, with 6 additional planning places open.

| Rank | Task | State | Priority | Size | Dependencies | Rationale |
|---:|---|---|---|---|---|---|
| 1 | #157 Prevent duplicate Calendar connections after repeated Google callbacks | IN_PROGRESS | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R3 by its connected testing theme. |
| 2 | #220 Confirm one account cannot list or sync another account’s calendars | PROPOSED | high | S | Waiting: #135 | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R3 by its connected testing theme. |
| 3 | #232 Confirm offline mobile replays reach the dashboard for every capture type | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R3 by its connected testing theme. |
| 4 | #253 Confirm recipe imports stay private across households in the browser | PROPOSED | high | XL | Ready | Prevents or detects a concrete reliability regression; appears to span a broad workflow; grouped into R3 by its connected testing theme. |
| 5 | #180 Let users edit quiet hours from mobile settings | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; grouped into R3 by its connected testing theme. |
| 6 | #156 Keep saved Calendar sync settings after reconnecting | IN_PROGRESS | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; grouped into R3 by its connected testing theme. |
| 7 | #252 Keep imported recipe sources private and traceable | PROPOSED | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; grouped into R3 by its connected testing theme. |
| 8 | #222 Stop outdated pull-request checks from delaying current feedback | PROPOSED | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; grouped into R3 by its connected testing theme. |
| 9 | #184 Complete Study import review | PENDING | low | L | Ready | Has lower immediate user or release risk; appears to span a broad workflow; grouped into R3 by its connected testing theme. |
| 10 | #227 Let households manage and reprint active storage labels | PENDING | low | XL | Ready | Has lower immediate user or release risk; appears to span a broad workflow; grouped into R3 by its connected testing theme. |

## Unassigned backlog

| Rank | Task | State | Priority | Size | Dependencies | Rationale |
|---:|---|---|---|---|---|---|
| 1 | #186 Erase revoked Calendar credentials after Google rejects a sync | PENDING | critical | M | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 2 | #247 Sign mobile users out when a deleted account is detected | PROPOSED | critical | M | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 3 | #195 Catch stale medication evidence before release approval | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 4 | #198 Catch Calendar telemetry regressions before release approval | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 5 | #199 Confirm Calendar recovery diagnostics in staging | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 6 | #200 Catch recovery evidence freshness regressions before release approval | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 7 | #204 Keep oversized auth failures from overwhelming release reports | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 8 | #207 Catch missing accepted sign-in evidence before release approval | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 9 | #218 Confirm HealthKit recovery survives an app restart | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 10 | #230 Catch medication picker regressions before release | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 11 | #236 Catch scanned Medicare layout regressions before release | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 12 | #237 Keep local Medicare OCR failures easy to recover from | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 13 | #248 Prove deleted-account rejection through the real mobile API process | PROPOSED | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 14 | #240 Restore the health-claim release check so it can run end to end | PROPOSED | critical | XL | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears to span a broad workflow; kept in the unscheduled backlog pending product grouping. |
| 15 | #179 Let owners recover selected feedback rows with confirmation | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 16 | #194 Prevent a disposable label from masking the shared development database | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 17 | #201 Remind owners about expiring recovery evidence before a release | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 18 | #210 Prevent future health reports from bypassing deleted-data export rules | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 19 | #211 Make corrected stock warnings settle after recovery | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 20 | #213 Show operators how many alert failures occurred during an outage | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 21 | #243 Give every rejected statement the right recovery advice | PROPOSED | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 22 | #208 Catch broken automation across every release workflow | PENDING | high | XL | Ready | Prevents or detects a concrete reliability regression; appears to span a broad workflow; kept in the unscheduled backlog pending product grouping. |
| 23 | #183 Add manual price watch | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 24 | #185 Add goal progress history | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 25 | #234 Let users restore an accidentally deleted offline capture | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 26 | #235 Show users a clear history of offline edits and deletions | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 27 | #154 Keep Prisma generation future-proof before Prisma 7 | IN_PROGRESS | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; kept in the unscheduled backlog pending product grouping. |
| 28 | #187 Keep real Calendar acceptance evidence with each release | PENDING | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; kept in the unscheduled backlog pending product grouping. |
| 29 | #205 Keep valid income links when lookup lists are temporarily unavailable | PENDING | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 30 | #212 Prove stock diagnostics stay private across mobile accounts | PENDING | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 31 | #215 Keep travel-block details limited to the fields users need | PENDING | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; kept in the unscheduled backlog pending product grouping. |
| 32 | #225 Keep claim review forms aligned with fields the server accepts | PENDING | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 33 | #229 Keep the intended page when users switch to account creation | PENDING | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; kept in the unscheduled backlog pending product grouping. |
| 34 | #191 Plan pharmacy refills | PENDING | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 35 | #202 Let owners inspect the exact stock entries that need review | PENDING | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 36 | #216 Make the iOS HealthKit development target buildable | PENDING | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 37 | #217 Capture real-iPhone HealthKit permission and anchor evidence | PENDING | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 38 | #223 Restore reliable TypeScript checks after Next.js regenerates route types | PENDING | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 39 | #228 Fit storage labels to common printable label sheets | PENDING | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 40 | #251 Make the release browser gate fail on dialog console warnings | PROPOSED | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 41 | #255 Give testers a focused brief for each release version | IN_PROGRESS | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 42 | #249 Keep disposable database gates behind workflow lint | PROPOSED | low | L | Ready | Has lower immediate user or release risk; appears to span a broad workflow; kept in the unscheduled backlog pending product grouping. |
| 43 | #250 Audit all remaining dialogs for accessible descriptions | PROPOSED | low | XL | Ready | Has lower immediate user or release risk; appears to span a broad workflow; kept in the unscheduled backlog pending product grouping. |
| 44 | #256 Keep every disposable database check safe to share after failures | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 45 | #257 Show which safe database failure category is recurring across releases | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 46 | #258 Prevent an old feedback sheet link from flashing while status refreshes | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 47 | #259 Keep Money workspace shortcuts usable with enlarged text | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 48 | #262 Keep reminder handling stable during very long app sessions | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 49 | #263 Show release owners which ready outcomes are missing tester coverage | PROPOSED | untriaged | untriaged | Waiting: #255 | New task awaiting priority, size, and release triage. |
| 50 | #264 Catch broken iPhone preview handoffs before tester sessions | PROPOSED | untriaged | untriaged | Waiting: #255 | New task awaiting priority, size, and release triage. |

## Untriaged tasks

| Rank | Task | State | Priority | Size | Dependencies | Rationale |
|---:|---|---|---|---|---|---|
| 1 | #255 Give testers a focused brief for each release version | IN_PROGRESS | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 2 | #256 Keep every disposable database check safe to share after failures | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 3 | #257 Show which safe database failure category is recurring across releases | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 4 | #258 Prevent an old feedback sheet link from flashing while status refreshes | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 5 | #259 Keep Money workspace shortcuts usable with enlarged text | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 6 | #262 Keep reminder handling stable during very long app sessions | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 7 | #263 Show release owners which ready outcomes are missing tester coverage | PROPOSED | untriaged | untriaged | Waiting: #255 | New task awaiting priority, size, and release triage. |
| 8 | #264 Catch broken iPhone preview handoffs before tester sessions | PROPOSED | untriaged | untriaged | Waiting: #255 | New task awaiting priority, size, and release triage. |

## Dependency-blocked tasks

| Rank | Task | State | Priority | Size | Dependencies | Rationale |
|---:|---|---|---|---|---|---|
| 1 | #220 Confirm one account cannot list or sync another account’s calendars | PROPOSED | high | S | Waiting: #135 | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R3 by its connected testing theme. |
| 2 | #263 Show release owners which ready outcomes are missing tester coverage | PROPOSED | untriaged | untriaged | Waiting: #255 | New task awaiting priority, size, and release triage. |
| 3 | #264 Catch broken iPhone preview handoffs before tester sessions | PROPOSED | untriaged | untriaged | Waiting: #255 | New task awaiting priority, size, and release triage. |

## Recently completed or closed

| Task | State | Updated |
|---|---|---|
| #260 Recover priority updates safely after an interrupted process | CANCELLED | 2026-09-09T05:23:48.803Z |
| #261 Warn when task changes stop reaching the priority plan | CANCELLED | 2026-09-09T05:23:48.803Z |
| #177 Catch duplicate reminder taps before they create duplicate actions | IMPLEMENTED | 2026-09-09T04:54:44.720Z |
| #176 Show a clear feedback recovery state before the first sheet exists | MERGED | 2026-09-09T04:54:02.767Z |
| #175 Keep feedback submission usable when sheet lookup fails | MERGED | 2026-09-09T04:53:32.779Z |
| #254 Keep the priority register current when tasks change | MERGED | 2026-09-09T04:52:36.687Z |
| #174 Confirm Money workspace links work after sign-in on desktop and mobile | IMPLEMENTED | 2026-09-09T04:51:28.562Z |
| #173 Make failed database acceptance results diagnosable without exposing health data | IMPLEMENTED | 2026-09-09T04:51:21.252Z |
| #159 Remove remaining dialog accessibility warnings before release | MERGED | 2026-09-09T04:47:25.787Z |
| #146 Save recipes from links and photos | MERGED | 2026-09-09T04:46:21.119Z |
| #132 Run Syntropic’s safe release checks automatically on pull requests | MERGED | 2026-09-09T04:46:17.727Z |
| #172 Catch CI drift before the disposable database gate is skipped | MERGED | 2026-09-09T04:45:31.973Z |
| #239 Create a versioned task priority register | MERGED | 2026-09-09T04:45:06.761Z |
| #171 Prevent deleted accounts from using old mobile sessions | MERGED | 2026-09-09T04:34:38.655Z |
| #166 Keep privacy checks clean after a cancelled release run | MERGED | 2026-09-09T03:18:05.154Z |
| #165 Keep bulk health audit rejections visible when alert delivery fails | MERGED | 2026-09-09T03:07:09.247Z |
| #164 Confirm the upload screen gives clear recovery options for protected PDFs | MERGED | 2026-09-09T03:05:38.006Z |
| #161 Prevent duplicate claims when matching imports confirm at the same time | MERGED | 2026-09-09T02:53:32.029Z |
| #116 Confirm deleted imports stay hidden from replacement accounts | MERGED | 2026-09-09T02:48:02.500Z |
| #148 Let users import scanned Medicare statements without manual entry | MERGED | 2026-09-09T00:05:36.624Z |

## Data quality

- **Warning:** #255 is awaiting priority or size triage.
- **Warning:** #256 is awaiting priority or size triage.
- **Warning:** #257 is awaiting priority or size triage.
- **Warning:** #258 is awaiting priority or size triage.
- **Warning:** #259 is awaiting priority or size triage.
- **Warning:** #262 is awaiting priority or size triage.
- **Warning:** #263 is awaiting priority or size triage.
- **Warning:** #264 is awaiting priority or size triage.
- **Warning:** R1 has 35 unexplained ready outcomes missing tester coverage: #132 Run Syntropic’s safe release checks automatically on pull requests; #239 Create a versioned task priority register; #166 Keep privacy checks clean after a cancelled release run; #165 Keep bulk health audit rejections visible when alert delivery fails; #136 Keep Calendar event responses credential-free; #127 Stop spawned server workers from surviving a failed Google release check; #27 Make the dashboard release gate run on a migrated database; #54 Run health privacy checks automatically before releases; #72 Keep privacy-boundary alerts grouped across all running app instances; #18 Prove offline conflict recovery and HealthKit imports before release; #39 Keep other Auth.js recovery errors on the same Ishiki origin; #48 Keep successful Calendar responses credential-free; #38 Run the credential-free Google wrapper check automatically in CI; #37 Keep Google release failures diagnosable when readiness breaks; #98 Give users a safe recovery path for historical stock mismatches; #25 Prove worker alerts stay reliable during failure recovery; #24 Complete the first live recovery and alert handoff; #47 Prevent Calendar recovery leaks from unexpected provider crashes; #83 Catch imported-claim ownership regressions before release; #94 Catch medication stock and fill races before release; #71 Prevent ownership drift when imported claim rows are edited; #67 Confirm deleted-account claim tombstones retain no sensitive source metadata; #74 Restore health-claims tests so privacy checks can run; #63 Alert operators when database ownership guards reject writes; #70 Prove legacy ownership drift blocks a release; #64 Keep imported claim ownership intact when records are edited; #60 Prevent cross-owner audit records at the database boundary; #45 Catch Calendar recovery guidance regressions before release; #43 Show clearer recovery guidance when Calendar access expires; #35 Catch parallel Google OAuth release-check regressions before CI; #32 Keep local OAuth release checks safe for parallel runs; #29 Make the Google recovery check run automatically in the release gate; #23 Catch keyboard and mobile accessibility regressions before release; #22 Keep recovery and worker alerts proven after launch; #14 Security scan.
- **Warning:** R2 has 21 unexplained ready outcomes missing tester coverage: #173 Make failed database acceptance results diagnosable without exposing health data; #115 Prevent medication checks from touching a shared development database; #73 Prove alert delivery failures never hide rejected health writes; #69 Prevent imported claim rows from drifting when an import changes owners; #68 Prevent bulk edits from moving imported claims between users; #126 Prove alert receiver outages cannot stop sync workers; #99 Confirm income saves survive a real authenticated reload; #101 Clarify the combined Money workspace alongside direct finance pages; #93 Deliver medication reminders on users’ phones; #82 Keep account deletion working on freshly migrated databases; #88 Regroup navigation around Money and Health; #87 Restructure medications around variants and daily use; #90 Restore Medicare PDF import; #65 Detect older cross-owner claim rows before they are exposed; #62 Prevent cross-owner health claim rows at the database boundary; #57 Prove every claim review lifecycle event remains private and append-only; #56 Let reviewers see which fields changed without revealing claim values; #50 Prove health claims stay private across users and retries; #46 Import Medicare and private health claims; #10 Build mobile health companion; #8 Add pathology review import.
- **Warning:** R3 has 4 unexplained ready outcomes missing tester coverage: #175 Keep feedback submission usable when sheet lookup fails; #128 Keep server logs available when Google auth assertions fail; #44 Catch Calendar error leaks through real route handlers; #41 Keep Calendar connection errors sanitized by contract.

## Maintenance

1. Feed each project-task change event's complete state-partitioned export to `pnpm task-priority:ingest -- <export.json>`.
2. Add or amend explicit decisions in `task-priority/overrides.json`.
3. Use `pnpm task-priority:refresh` only to regenerate from the committed snapshot.
4. Run `pnpm task-priority:check` in release checks to catch missing tasks, invalid versions, or stale generated output.

# Ishiki Task Priority Register

Last refreshed: **2026-09-09T05:33:47.345Z** from a task snapshot captured at **2026-09-09T05:33:47.345Z**.

Active tasks: **84** · Untriaged: **8** · Dependency-blocked: **3**

## Ranking policy

- Priority: **critical → high → medium → low → untriaged**.
- Size: **XS → S → M → L → XL → untriaged**.
- Ranking favours higher-impact, smaller, ready work; work already in progress receives a continuity boost.
- Manual overrides win over calculated suggestions and survive refreshes.
- Newly observed tasks enter as **untriaged / unassigned**. A maintainer must confirm their priority, size, and release.
- Versions are user-testing milestones, not automatic deployment approvals.

## Release plan

| Version | Status | Capacity | Fix reserve | Testing goal | Entry dependencies |
|---|---|---:|---:|---|---|
| R1 — Trust and recovery beta | testing-next | 16 | 4 | Let testers exercise Ishiki's highest-risk privacy, account, recovery, and release-safety paths before broader feature testing. | None |
| R2 — Everyday health and money beta | developing | 20 | 4 | Give testers coherent health, medication, money, work, and daily-planning workflows after the trust baseline is stable. | R1 |
| R3 — Connected life beta | planned | 20 | 4 | Expand testing to Calendar, feedback, household coordination, imports, recipes, study, and other connected workflows. | R1, R2 |

## R1 — Trust and recovery beta

**Testing goal:** Let testers exercise Ishiki's highest-risk privacy, account, recovery, and release-safety paths before broader feature testing.

**Release gate:** All assigned privacy and recovery acceptance checks pass on disposable data, with no critical or high-priority blocker open.

**Feedback focus:** Unexpected access, destructive outcomes, unclear recovery advice, and release checks that cannot be trusted.

**Tester brief:** [Open R1 tester brief](task-priority/briefs/R1.md)

**Planned load:** 10/16 active tasks. 4 places are reserved for tester-found fixes, with 2 additional planning places open.

| Rank | Task | State | Priority | Size | Dependencies | Rationale |
|---:|---|---|---|---|---|---|
| 1 | #135 Prove Calendar privacy on the real database path | IN_PROGRESS | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 2 | #178 Run the physical-device reminder privacy and recovery check | IN_PROGRESS | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 3 | #155 Make lint failures stand out clearly during release checks | IN_PROGRESS | critical | M | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears moderately scoped; grouped into R1 by its trust testing theme. |
| 4 | #193 Catch unsafe medication database targets before PostgreSQL runs | PENDING | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 5 | #196 Catch privacy leaks in medication release evidence | PENDING | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 6 | #197 Catch unsupported server isolation before the Google release check runs | PENDING | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 7 | #203 Catch stock-history warnings in the browser release checks | PENDING | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 8 | #209 Run deleted-account export privacy checks before release | PENDING | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 9 | #214 Keep invitation and medical-forwarding responses credential-free | PENDING | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |
| 10 | #244 Catch bulk audit batches that hide an actor ownership mismatch | PROPOSED | critical | S | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears narrowly scoped; grouped into R1 by its trust testing theme. |

## R2 — Everyday health and money beta

**Testing goal:** Give testers coherent health, medication, money, work, and daily-planning workflows after the trust baseline is stable.

**Release gate:** R1 feedback is triaged; core health and money browser/mobile acceptance passes; no unresolved data-integrity blocker remains.

**Feedback focus:** Whether daily records are easy to create, correct, understand, and recover across desktop and mobile.

**Tester brief:** [Open R2 tester brief](task-priority/briefs/R2.md)

**Planned load:** 14/20 active tasks. 4 places are reserved for tester-found fixes, with 2 additional planning places open.

| Rank | Task | State | Priority | Size | Dependencies | Rationale |
|---:|---|---|---|---|---|---|
| 1 | #158 Confirm restored claim changes appear safely in the browser | IN_PROGRESS | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 2 | #188 Confirm pay cycles and work | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 3 | #181 Catch medication quiet-hour regressions across timezone and DST changes | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 4 | #182 Confirm recreated accounts see a clean health dashboard | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 5 | #206 Confirm income edits reject links owned by another account | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 6 | #226 Confirm claim imports reject immutable-field tampering on the real database path | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 7 | #241 Confirm upgrades preserve claims created by an earlier duplicate race | PROPOSED | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 8 | #245 Confirm cancelled health tests never leave private database fixtures behind | PROPOSED | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R2 by its daily testing theme. |
| 9 | #233 Explain rejected medication captures without losing the offline action | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R2 by its daily testing theme. |
| 10 | #219 Show users when their HealthKit data last synced successfully | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; grouped into R2 by its daily testing theme. |
| 11 | #231 Let users record PRN or unscheduled medication doses on mobile | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; grouped into R2 by its daily testing theme. |
| 12 | #189 Build appointment care workflow | PENDING | medium | L | Ready | Adds a user-visible workflow improvement; appears to span a broad workflow; grouped into R2 by its daily testing theme. |
| 13 | #190 Track personal and shared debts | PENDING | medium | L | Ready | Adds a user-visible workflow improvement; appears to span a broad workflow; grouped into R2 by its daily testing theme. |
| 14 | #192 Track referral and Medicare validity | PENDING | medium | L | Ready | Adds a user-visible workflow improvement; appears to span a broad workflow; grouped into R2 by its daily testing theme. |

## R3 — Connected life beta

**Testing goal:** Expand testing to Calendar, feedback, household coordination, imports, recipes, study, and other connected workflows.

**Release gate:** Earlier release feedback is resolved or explicitly deferred; connection and sharing boundaries pass privacy review.

**Feedback focus:** Consent, sharing boundaries, reconnection, cross-device continuity, and whether connected workflows reduce manual effort.

**Tester brief:** [Open R3 tester brief](task-priority/briefs/R3.md)

**Planned load:** 10/20 active tasks. 4 places are reserved for tester-found fixes, with 6 additional planning places open.

| Rank | Task | State | Priority | Size | Dependencies | Rationale |
|---:|---|---|---|---|---|---|
| 1 | #157 Prevent duplicate Calendar connections after repeated Google callbacks | IN_PROGRESS | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R3 by its connected testing theme. |
| 2 | #220 Confirm one account cannot list or sync another account’s calendars | PROPOSED | high | S | Waiting: #135 | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R3 by its connected testing theme. |
| 3 | #232 Confirm offline mobile replays reach the dashboard for every capture type | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R3 by its connected testing theme. |
| 4 | #253 Confirm recipe imports stay private across households in the browser | PROPOSED | high | XL | Ready | Prevents or detects a concrete reliability regression; appears to span a broad workflow; grouped into R3 by its connected testing theme. |
| 5 | #180 Let users edit quiet hours from mobile settings | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; grouped into R3 by its connected testing theme. |
| 6 | #156 Keep saved Calendar sync settings after reconnecting | IN_PROGRESS | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; grouped into R3 by its connected testing theme. |
| 7 | #252 Keep imported recipe sources private and traceable | PROPOSED | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; grouped into R3 by its connected testing theme. |
| 8 | #222 Stop outdated pull-request checks from delaying current feedback | PROPOSED | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; grouped into R3 by its connected testing theme. |
| 9 | #184 Complete Study import review | PENDING | low | L | Ready | Has lower immediate user or release risk; appears to span a broad workflow; grouped into R3 by its connected testing theme. |
| 10 | #227 Let households manage and reprint active storage labels | PENDING | low | XL | Ready | Has lower immediate user or release risk; appears to span a broad workflow; grouped into R3 by its connected testing theme. |

## Unassigned backlog

| Rank | Task | State | Priority | Size | Dependencies | Rationale |
|---:|---|---|---|---|---|---|
| 1 | #186 Erase revoked Calendar credentials after Google rejects a sync | PENDING | critical | M | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 2 | #247 Sign mobile users out when a deleted account is detected | PROPOSED | critical | M | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 3 | #195 Catch stale medication evidence before release approval | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 4 | #198 Catch Calendar telemetry regressions before release approval | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 5 | #199 Confirm Calendar recovery diagnostics in staging | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 6 | #200 Catch recovery evidence freshness regressions before release approval | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 7 | #204 Keep oversized auth failures from overwhelming release reports | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 8 | #207 Catch missing accepted sign-in evidence before release approval | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 9 | #218 Confirm HealthKit recovery survives an app restart | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 10 | #230 Catch medication picker regressions before release | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 11 | #236 Catch scanned Medicare layout regressions before release | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 12 | #237 Keep local Medicare OCR failures easy to recover from | PENDING | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 13 | #248 Prove deleted-account rejection through the real mobile API process | PROPOSED | high | S | Ready | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 14 | #240 Restore the health-claim release check so it can run end to end | PROPOSED | critical | XL | Ready | Protects a high-risk privacy, account, or release-safety boundary; appears to span a broad workflow; kept in the unscheduled backlog pending product grouping. |
| 15 | #179 Let owners recover selected feedback rows with confirmation | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 16 | #194 Prevent a disposable label from masking the shared development database | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 17 | #201 Remind owners about expiring recovery evidence before a release | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 18 | #210 Prevent future health reports from bypassing deleted-data export rules | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 19 | #211 Make corrected stock warnings settle after recovery | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 20 | #213 Show operators how many alert failures occurred during an outage | PENDING | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 21 | #243 Give every rejected statement the right recovery advice | PROPOSED | high | M | Ready | Prevents or detects a concrete reliability regression; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 22 | #208 Catch broken automation across every release workflow | PENDING | high | XL | Ready | Prevents or detects a concrete reliability regression; appears to span a broad workflow; kept in the unscheduled backlog pending product grouping. |
| 23 | #183 Add manual price watch | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 24 | #185 Add goal progress history | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 25 | #234 Let users restore an accidentally deleted offline capture | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; grouped into R1 by its trust testing theme; deferred from R1 to keep the release within its testing capacity. |
| 26 | #235 Show users a clear history of offline edits and deletions | PENDING | medium | M | Ready | Adds a user-visible workflow improvement; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 27 | #154 Keep Prisma generation future-proof before Prisma 7 | IN_PROGRESS | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; kept in the unscheduled backlog pending product grouping. |
| 28 | #187 Keep real Calendar acceptance evidence with each release | PENDING | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; kept in the unscheduled backlog pending product grouping. |
| 29 | #205 Keep valid income links when lookup lists are temporarily unavailable | PENDING | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 30 | #212 Prove stock diagnostics stay private across mobile accounts | PENDING | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 31 | #215 Keep travel-block details limited to the fields users need | PENDING | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; kept in the unscheduled backlog pending product grouping. |
| 32 | #225 Keep claim review forms aligned with fields the server accepts | PENDING | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 33 | #229 Keep the intended page when users switch to account creation | PENDING | low | S | Ready | Has lower immediate user or release risk; appears narrowly scoped; kept in the unscheduled backlog pending product grouping. |
| 34 | #191 Plan pharmacy refills | PENDING | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 35 | #202 Let owners inspect the exact stock entries that need review | PENDING | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 36 | #216 Make the iOS HealthKit development target buildable | PENDING | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 37 | #217 Capture real-iPhone HealthKit permission and anchor evidence | PENDING | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; grouped into R2 by its daily testing theme; deferred from R2 to keep the release within its testing capacity. |
| 38 | #223 Restore reliable TypeScript checks after Next.js regenerates route types | PENDING | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 39 | #228 Fit storage labels to common printable label sheets | PENDING | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 40 | #251 Make the release browser gate fail on dialog console warnings | PROPOSED | low | M | Ready | Has lower immediate user or release risk; appears moderately scoped; kept in the unscheduled backlog pending product grouping. |
| 41 | #255 Give testers a focused brief for each release version | IN_PROGRESS | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 42 | #249 Keep disposable database gates behind workflow lint | PROPOSED | low | L | Ready | Has lower immediate user or release risk; appears to span a broad workflow; kept in the unscheduled backlog pending product grouping. |
| 43 | #250 Audit all remaining dialogs for accessible descriptions | PROPOSED | low | XL | Ready | Has lower immediate user or release risk; appears to span a broad workflow; kept in the unscheduled backlog pending product grouping. |
| 44 | #256 Keep every disposable database check safe to share after failures | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 45 | #257 Show which safe database failure category is recurring across releases | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 46 | #258 Prevent an old feedback sheet link from flashing while status refreshes | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 47 | #259 Keep Money workspace shortcuts usable with enlarged text | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 48 | #262 Keep reminder handling stable during very long app sessions | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 49 | #263 Show release owners which ready outcomes are missing tester coverage | PROPOSED | untriaged | untriaged | Waiting: #255 | New task awaiting priority, size, and release triage. |
| 50 | #264 Catch broken iPhone preview handoffs before tester sessions | PROPOSED | untriaged | untriaged | Waiting: #255 | New task awaiting priority, size, and release triage. |

## Untriaged tasks

| Rank | Task | State | Priority | Size | Dependencies | Rationale |
|---:|---|---|---|---|---|---|
| 1 | #255 Give testers a focused brief for each release version | IN_PROGRESS | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 2 | #256 Keep every disposable database check safe to share after failures | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 3 | #257 Show which safe database failure category is recurring across releases | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 4 | #258 Prevent an old feedback sheet link from flashing while status refreshes | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 5 | #259 Keep Money workspace shortcuts usable with enlarged text | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 6 | #262 Keep reminder handling stable during very long app sessions | PROPOSED | untriaged | untriaged | Ready | New task awaiting priority, size, and release triage. |
| 7 | #263 Show release owners which ready outcomes are missing tester coverage | PROPOSED | untriaged | untriaged | Waiting: #255 | New task awaiting priority, size, and release triage. |
| 8 | #264 Catch broken iPhone preview handoffs before tester sessions | PROPOSED | untriaged | untriaged | Waiting: #255 | New task awaiting priority, size, and release triage. |

## Dependency-blocked tasks

| Rank | Task | State | Priority | Size | Dependencies | Rationale |
|---:|---|---|---|---|---|---|
| 1 | #220 Confirm one account cannot list or sync another account’s calendars | PROPOSED | high | S | Waiting: #135 | Prevents or detects a concrete reliability regression; appears narrowly scoped; grouped into R3 by its connected testing theme. |
| 2 | #263 Show release owners which ready outcomes are missing tester coverage | PROPOSED | untriaged | untriaged | Waiting: #255 | New task awaiting priority, size, and release triage. |
| 3 | #264 Catch broken iPhone preview handoffs before tester sessions | PROPOSED | untriaged | untriaged | Waiting: #255 | New task awaiting priority, size, and release triage. |

## Recently completed or closed

| Task | State | Updated |
|---|---|---|
| #260 Recover priority updates safely after an interrupted process | CANCELLED | 2026-09-09T05:23:48.803Z |
| #261 Warn when task changes stop reaching the priority plan | CANCELLED | 2026-09-09T05:23:48.803Z |
| #177 Catch duplicate reminder taps before they create duplicate actions | IMPLEMENTED | 2026-09-09T04:54:44.720Z |
| #176 Show a clear feedback recovery state before the first sheet exists | MERGED | 2026-09-09T04:54:02.767Z |
| #175 Keep feedback submission usable when sheet lookup fails | MERGED | 2026-09-09T04:53:32.779Z |
| #254 Keep the priority register current when tasks change | MERGED | 2026-09-09T04:52:36.687Z |
| #174 Confirm Money workspace links work after sign-in on desktop and mobile | IMPLEMENTED | 2026-09-09T04:51:28.562Z |
| #173 Make failed database acceptance results diagnosable without exposing health data | IMPLEMENTED | 2026-09-09T04:51:21.252Z |
| #159 Remove remaining dialog accessibility warnings before release | MERGED | 2026-09-09T04:47:25.787Z |
| #146 Save recipes from links and photos | MERGED | 2026-09-09T04:46:21.119Z |
| #132 Run Syntropic’s safe release checks automatically on pull requests | MERGED | 2026-09-09T04:46:17.727Z |
| #172 Catch CI drift before the disposable database gate is skipped | MERGED | 2026-09-09T04:45:31.973Z |
| #239 Create a versioned task priority register | MERGED | 2026-09-09T04:45:06.761Z |
| #171 Prevent deleted accounts from using old mobile sessions | MERGED | 2026-09-09T04:34:38.655Z |
| #166 Keep privacy checks clean after a cancelled release run | MERGED | 2026-09-09T03:18:05.154Z |
| #165 Keep bulk health audit rejections visible when alert delivery fails | MERGED | 2026-09-09T03:07:09.247Z |
| #164 Confirm the upload screen gives clear recovery options for protected PDFs | MERGED | 2026-09-09T03:05:38.006Z |
| #161 Prevent duplicate claims when matching imports confirm at the same time | MERGED | 2026-09-09T02:53:32.029Z |
| #116 Confirm deleted imports stay hidden from replacement accounts | MERGED | 2026-09-09T02:48:02.500Z |
| #148 Let users import scanned Medicare statements without manual entry | MERGED | 2026-09-09T00:05:36.624Z |

## Data quality

- **Warning:** #255 is awaiting priority or size triage.
- **Warning:** #256 is awaiting priority or size triage.
- **Warning:** #257 is awaiting priority or size triage.
- **Warning:** #258 is awaiting priority or size triage.
- **Warning:** #259 is awaiting priority or size triage.
- **Warning:** #262 is awaiting priority or size triage.
- **Warning:** #263 is awaiting priority or size triage.
- **Warning:** #264 is awaiting priority or size triage.
- **Warning:** R1 has 35 unexplained ready outcomes missing tester coverage: #132 Run Syntropic’s safe release checks automatically on pull requests; #239 Create a versioned task priority register; #166 Keep privacy checks clean after a cancelled release run; #165 Keep bulk health audit rejections visible when alert delivery fails; #136 Keep Calendar event responses credential-free; #127 Stop spawned server workers from surviving a failed Google release check; #27 Make the dashboard release gate run on a migrated database; #54 Run health privacy checks automatically before releases; #72 Keep privacy-boundary alerts grouped across all running app instances; #18 Prove offline conflict recovery and HealthKit imports before release; #39 Keep other Auth.js recovery errors on the same Ishiki origin; #48 Keep successful Calendar responses credential-free; #38 Run the credential-free Google wrapper check automatically in CI; #37 Keep Google release failures diagnosable when readiness breaks; #98 Give users a safe recovery path for historical stock mismatches; #25 Prove worker alerts stay reliable during failure recovery; #24 Complete the first live recovery and alert handoff; #47 Prevent Calendar recovery leaks from unexpected provider crashes; #83 Catch imported-claim ownership regressions before release; #94 Catch medication stock and fill races before release; #71 Prevent ownership drift when imported claim rows are edited; #67 Confirm deleted-account claim tombstones retain no sensitive source metadata; #74 Restore health-claims tests so privacy checks can run; #63 Alert operators when database ownership guards reject writes; #70 Prove legacy ownership drift blocks a release; #64 Keep imported claim ownership intact when records are edited; #60 Prevent cross-owner audit records at the database boundary; #45 Catch Calendar recovery guidance regressions before release; #43 Show clearer recovery guidance when Calendar access expires; #35 Catch parallel Google OAuth release-check regressions before CI; #32 Keep local OAuth release checks safe for parallel runs; #29 Make the Google recovery check run automatically in the release gate; #23 Catch keyboard and mobile accessibility regressions before release; #22 Keep recovery and worker alerts proven after launch; #14 Security scan.
- **Warning:** R2 has 21 unexplained ready outcomes missing tester coverage: #173 Make failed database acceptance results diagnosable without exposing health data; #115 Prevent medication checks from touching a shared development database; #73 Prove alert delivery failures never hide rejected health writes; #69 Prevent imported claim rows from drifting when an import changes owners; #68 Prevent bulk edits from moving imported claims between users; #126 Prove alert receiver outages cannot stop sync workers; #99 Confirm income saves survive a real authenticated reload; #101 Clarify the combined Money workspace alongside direct finance pages; #93 Deliver medication reminders on users’ phones; #82 Keep account deletion working on freshly migrated databases; #88 Regroup navigation around Money and Health; #87 Restructure medications around variants and daily use; #90 Restore Medicare PDF import; #65 Detect older cross-owner claim rows before they are exposed; #62 Prevent cross-owner health claim rows at the database boundary; #57 Prove every claim review lifecycle event remains private and append-only; #56 Let reviewers see which fields changed without revealing claim values; #50 Prove health claims stay private across users and retries; #46 Import Medicare and private health claims; #10 Build mobile health companion; #8 Add pathology review import.
- **Warning:** R3 has 4 unexplained ready outcomes missing tester coverage: #175 Keep feedback submission usable when sheet lookup fails; #128 Keep server logs available when Google auth assertions fail; #44 Catch Calendar error leaks through real route handlers; #41 Keep Calendar connection errors sanitized by contract.

## Maintenance

1. Feed each project-task change event's complete state-partitioned export to `pnpm task-priority:ingest -- <export.json>`.
2. Add or amend explicit decisions in `task-priority/overrides.json`.
3. Use `pnpm task-priority:refresh` only to regenerate from the committed snapshot.
4. Run `pnpm task-priority:check` in release checks to catch missing tasks, invalid versions, or stale generated output.

