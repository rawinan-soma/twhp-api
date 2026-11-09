---------------------------- MODULE ReviewFlow ----------------------------
(***************************************************************************)
(* One Cover of one fiscal year, its Answers, the factory's writes, the    *)
(* reviewers' verdicts and finalize. Every action names the code it        *)
(* models; .claude/skills/review-flow/SKILL.md holds the coverage record.  *)
(*                                                                         *)
(* Abstractions: reviewers act as ODPC (the only level that can finalize,  *)
(* and the only one that can write a closed year), so level and authorship *)
(* rules are out of scope. Standard certificates and their collateral      *)
(* reset are out of scope. `files` means "this Answer still has evidence". *)
(***************************************************************************)
EXTENDS FiniteSets

CONSTANT Answers

VARIABLES
    phase,               \* "open": the Cover's own fiscal year; "eval": the evaluation period after the rollover; "closed": after it
    cover,               \* latest CoverLogs status (greatest id, ADR-0010)
    ans,                 \* per Answer: latest AnswerLogs status, verdict_choice IS NOT NULL, evidence present
    award,               \* an Awards row exists for this Cover
    submitted,           \* the factory submitted since the Cover last went to in_progress
    bouncedEval,         \* history: finalize sent the Cover back during the evaluation period
    bouncedClosed,       \* history: finalize sent the Cover back after the evaluation period
    finishedUnsubmitted  \* history: finalize finished the Cover without a submission

vars == <<phase, cover, ans, award, submitted, bouncedEval, bouncedClosed, finishedUnsubmitted>>

Status == {"none", "in_review", "recommended", "rejected", "finished"}
Reviewable == {"in_review", "recommended", "rejected"}

TypeOK ==
    /\ phase \in {"open", "eval", "closed"}
    /\ cover \in {"in_progress", "in_review", "finished"}
    /\ ans \in [Answers -> [st : Status, vc : BOOLEAN, files : BOOLEAN]]
    /\ award \in BOOLEAN
    /\ submitted \in BOOLEAN
    /\ bouncedEval \in BOOLEAN
    /\ bouncedClosed \in BOOLEAN
    /\ finishedUnsubmitted \in BOOLEAN

Init ==
    /\ phase = "open"
    /\ cover = "in_progress"
    /\ ans = [a \in Answers |-> [st |-> "none", vc |-> FALSE, files |-> FALSE]]
    /\ award = FALSE
    /\ submitted = FALSE
    /\ bouncedEval = FALSE
    /\ bouncedClosed = FALSE
    /\ finishedUnsubmitted = FALSE

\* The 1 Oct rollover, then the end of the evaluation period (evaluationPeriodApplies, src/utils.ts).
Rollover == phase = "open" /\ phase' = "eval" /\ UNCHANGED <<cover, ans, award, submitted, bouncedEval, bouncedClosed, finishedUnsubmitted>>
EvalEnds == phase = "eval" /\ phase' = "closed" /\ UNCHANGED <<cover, ans, award, submitted, bouncedEval, bouncedClosed, finishedUnsubmitted>>

\* Factories may write only their current fiscal year (resolveWritableYear, src/service/answer.ts).
FactoryWritable == phase = "open"

\* answerService.saveAnswer: first answer to a question; no Cover-status check.
Answer(a) ==
    /\ FactoryWritable
    /\ ans[a].st = "none"
    /\ ans' = [ans EXCEPT ![a] = [st |-> "in_review", vc |-> FALSE, files |-> TRUE]]
    /\ UNCHANGED <<phase, cover, award, submitted, bouncedEval, bouncedClosed, finishedUnsubmitted>>

\* answerService.update and the negotiate "redo" path: latest log in_review or rejected,
\* new evidence, new in_review log with verdict_choice NULL.
Edit(a) ==
    /\ FactoryWritable
    /\ ans[a].st \in {"in_review", "rejected"}
    /\ ans' = [ans EXCEPT ![a] = [st |-> "in_review", vc |-> FALSE, files |-> TRUE]]
    /\ UNCHANGED <<phase, cover, award, submitted, bouncedEval, bouncedClosed, finishedUnsubmitted>>

\* answerService.submit: Cover in_progress, every question answered, none rejected.
Submit ==
    /\ FactoryWritable
    /\ cover = "in_progress"
    /\ \A a \in Answers : ans[a].st \notin {"none", "rejected"}
    /\ cover' = "in_review"
    /\ submitted' = TRUE
    /\ UNCHANGED <<phase, ans, award, bouncedEval, bouncedClosed, finishedUnsubmitted>>

\* evaluatorReviewService.saveAnswerVerdict, approve or change_score: writes recommended.
\* No Cover-status check; finished Answers are refused.
Verdict(a, changeScore) ==
    /\ ans[a].st \in Reviewable
    /\ ans' = [ans EXCEPT ![a].st = "recommended", ![a].vc = changeScore]
    /\ UNCHANGED <<phase, cover, award, submitted, bouncedEval, bouncedClosed, finishedUnsubmitted>>

\* saveAnswerVerdict, reject: refused during the evaluation period (assertHardRejectAllowed).
HardReject(a) ==
    /\ phase # "eval"
    /\ ans[a].st \in Reviewable
    /\ ans' = [ans EXCEPT ![a].st = "rejected", ![a].vc = FALSE]
    /\ UNCHANGED <<phase, cover, award, submitted, bouncedEval, bouncedClosed, finishedUnsubmitted>>

\* evaluatorReviewService.finalize. Reads only existing Answer rows; no Cover-status check.
Finalize ==
    LET present == {a \in Answers : ans[a].st # "none"}
        open    == {a \in present : ans[a].st # "finished"}
        hr      == {a \in open : ans[a].st = "rejected" /\ ~ans[a].vc}
    IN  /\ \A a \in present : ans[a].st # "in_review"
        /\ (hr # {}) => (phase # "eval")
        /\ ans' = [a \in Answers |->
                     IF a \in hr THEN [ans[a] EXCEPT !.files = FALSE]
                     ELSE IF a \in open THEN [ans[a] EXCEPT !.st = "finished"]
                     ELSE ans[a]]
        /\ cover' = IF hr # {} THEN "in_progress" ELSE "finished"
        /\ award' = (award \/ hr = {})
        /\ submitted' = IF hr # {} THEN FALSE ELSE submitted
        /\ bouncedEval' = (bouncedEval \/ (hr # {} /\ phase = "eval"))
        /\ bouncedClosed' = (bouncedClosed \/ (hr # {} /\ phase = "closed"))
        /\ finishedUnsubmitted' = (finishedUnsubmitted \/ (hr = {} /\ ~submitted))
        /\ UNCHANGED phase

Next ==
    \/ Rollover \/ EvalEnds \/ Submit \/ Finalize
    \/ \E a \in Answers :
         \/ Answer(a) \/ Edit(a) \/ HardReject(a)
         \/ \E cs \in BOOLEAN : Verdict(a, cs)

Spec == Init /\ [][Next]_vars

---------------------------------------------------------------------------
\* Rules the code must keep. ReviewFlow.cfg checks these.

\* A finished Cover always has its Award (finalize writes both in one transaction).
FinishedCoverHasAward == cover = "finished" => award

\* Evidence is deleted only for a hard reject, never for a score change (ADR-0012).
OnlyHardRejectDeletesEvidence ==
    [][\A a \in Answers : (ans[a].files /\ ~ans'[a].files) => (ans[a].st = "rejected" /\ ~ans[a].vc)]_vars

\* No Cover goes back to the factory during the evaluation period, when it can no longer edit.
NoBounceDuringEvaluation == ~bouncedEval

\* A finished Answer never changes status again.
FinishedIsFinal == [][\A a \in Answers : ans[a].st = "finished" => ans'[a].st = "finished"]_vars

---------------------------------------------------------------------------
\* Suspected findings. Each has its own .cfg and is expected to FAIL today.

\* A Cover is never sent back to the factory after the evaluation period ends.
NoBounceAfterEvaluation == ~bouncedClosed

\* A Cover finishes only after the factory submitted it.
FinishOnlyAfterSubmission == ~finishedUnsubmitted
=============================================================================
