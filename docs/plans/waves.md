# Wave background

[한국어](waves.ko.md).

Each section holds the dependencies and the background of one wave of [the execution checklist](execution-checklist.md), whose wave heading links it.

## Wave 1

Depends on: none. `@crudui/generator-core/crudui.css` is the only stylesheet of the CRUDUI blocks, and it has no rule for a narrow viewport: no test opens a form, a list or a detail at the width of a phone. A page styled with Tailwind CSS cannot build the CRUDUI styles with its Tailwind build and theme. CRUDUI ships its own stylesheet and a Tailwind version, and an installation chooses one of them.

## Wave 2

Depends on: none. The rules of AGENTS ran the full suite when a feature was complete and let a long operation replace its timeout with step logs. CI jobs that run the suites carry a job timeout of 10 to 30 minutes over every test. The benchmark driver test compiles the Go and Rust drivers inside a test with a 600-second limit. The build readiness wait of the tree verification reads its state file every second, and its tests compare wall-clock time with limits. The PHPUnit mode of `scripts/run-tests.mjs` counts class and data provider suites as passed tests and drops every line that is not a TeamCity message.

## Wave 3

Depends on: none. Runs of different checkouts use the same resources: fixed directories under `/tmp`, the Playwright image of the Linux style check, the comparison deployment and the `dist` directories that the package builds empty and that other repositories pack. A run can replace or reset such a resource while another run uses it. A resource that one run can own gets a directory or name of that run; a resource that is single gets a holder lock: one holder at a time, a refusal that names the holder's checkout, pid and process start time, and a release by the holder.

## Wave 4

Depends on: none. The checklist wrote task state markers in its How to use legend and in the text of C2.1-2, so a tool that counted the markers of the file counted tasks in progress that do not exist. No check read the checklist outside the task states.
