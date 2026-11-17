# Fashion Hunt: running the agents without the Workflow tool

Where the Workflow tool isn't available, start the agents of SKILL.md's step 4 yourself:

1. Start them all in a single message: in Claude Code, the Agent tool with the general-purpose
   type, `model: "sonnet"` for shop agents and the default model for brand agents. Set a
   15-minute background timer with them. The Agent tool runs at most 20 at once, and each agent
   wakes you when it reports.
2. If an agent fails or its report is unusable, start a fresh one for its shops once; if that
   fails too, report them as not searched.
3. When the timer fires, message each agent still running to stop, close its tab and report, and
   stop any that hasn't reported 3 minutes later. Agents save each listing as they verify it, so
   what a stopped agent saved is kept: list its shops as partly searched (timed out), or as not
   searched when it saved nothing.
4. An agent that lists unverified links that may be matches, because it ran out of time, gets a
   second round: one more agent for its shop with just those links, on its own 15-minute timer.
   Only what that one can't check either goes into the page's unverified list.

Then go on with SKILL.md's step 6.
