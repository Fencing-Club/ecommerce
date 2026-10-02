# Script

The show as staged, scene by scene and moment by moment: who is on, what they carry, where they go and what happens
on each line. It's the detail behind the [storyboard](storyboard.md), and it matches the code: every time here is the
one the scenes use, measured from the current mix of the song.

## How to read it

- **Times** are minutes and seconds into the song. Lines are about 3.3 seconds each, eight beats at the song's 146
  beats a minute; the cut-outs hop and kick on the beat. A new mix moves the times, not the business:
  [src/timeline.ts](../src/timeline.ts) holds every line's start.
- **Left and right** are as the audience sees them. The front is the footlights, the back is the backcloth, the flies
  are above the stage, the wings either side, the pit below the front and the boxes in the side walls.
- **Moves.** Cut-outs move on twos, twelve drawings a second, and snap into poses; scenery, lights and the camera
  glide. Scenery flies in from above and lands with a bounce.
- **Walking.** Everyone with legs walks heel and toe: each foot stays where it lands while the knee bends to carry the
  other through, the hips rise over each step and dip as the feet meet the floor, and the arms swing against the legs.
  The Engineer turns his hips and toes the way he's going, backs away still facing whatever he's backing from, and
  sidesteps facing the audience for a short shuffle. The Colonel marches, the Guard runs with his pike held steady,
  Study Guide walks pigeon-toed, the Unicorn's two halves step out of time with each other, the badge toddles on tiny
  knees, and the Octocat scuttles, one diagonal pair of legs down while the other swings.
- **Singing.** The Engineer mouths every word of the lead vocal, a frame ahead of the sound as animators do, opening on
  each syllable and holding the long notes, even mid-gasp; the company and the choir mouth along in the choruses.
- **Quick changes.** The lights dip for a moment at each quick change, so the stage can be reset unseen.
- **Camera.** Wide is the whole stage from the stalls. A push goes in on the joke; a pull goes back far enough to see
  the boxes, the pit or the whole house.

## The Engineer

A black hoodie with the cyan React atom on the chest, a kangaroo pocket and white drawstrings; blue jeans with the
hems turned up; white trainers; round glasses; black over-ear headphones; the blue badge on a reel at the right hip.
And always the cane: bamboo, crook handle, rubber tip.

The cane does the talking. Its moves, as they're used below:

| Move      | How                                                                | Where                                                                 |
| --------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Poke      | the crook alone, out through the gap in the curtain                | the overture, tapping the playbill away                               |
| Point     | held out at arm's length at whatever matters                       | VENI, CODI, SHIPPI; the dancing bug; the 8 on the chalkboard          |
| Hook      | held by the tip, crook first, music-hall style                     | the Jenga block, the merge lever, the pager, the last door            |
| Twirl     | spun from the middle like a propeller                              | Rome, every fourth beat of every kick line, the walk-off              |
| Hang      | hooked on the hood behind the neck to free both hands              | the Colonel's telling-off, the crystal and the cubes, the lab         |
| Tap       | the tip on whatever needs pressing                                 | Log off; the steps down into the dungeon; the 2018 task               |
| Conduct   | waved in time                                                      | the Learning Activities' barbershop number                            |
| Parry     | held like a foil, en garde                                         | the meeting invite                                                    |
| Spyglass  | to the eye like a telescope                                        | the bridge of HMS Code                                             |
| Lean      | planted, weight on it                                              | waiting for the meeting, the bridge                                   |
| Question  | held up crook first, a token for the dot                           | "no one knows the how or why"                                         |

Costume changes: a toga and laurel wreath over the hoodie in Rome, a nightcap over the headset for Kusto, the headset
down round the neck from "something completely sincere" to the end of the bridge, and the hood up, headset over it,
for the epilogue.

## Properties

| Prop                    | Look                                                                                                    | Comes from                         | Ends up                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------- |
| The cane                | bamboo, crook handle, rubber tip                                                                        | the Engineer's hand, from the overture | twirled off into the iris                                  |
| The ten-year crystal    | cut-glass obelisk with a slanted top and a blue band, on an engraved base: The Engineer, Ten years      | the flies, on a shaft of light     | the hoodie pocket, the sunset, the leaving box                 |
| The five-year crystal   | the same, smaller, a green band                                                                         | the leaving box                    | the leaving box                                                |
| Patent cubes, three     | black marble, the gold seal in the top, gold engraving on the front                                     | the flies                          | into the flies, the wings and a cherub; the first comes back down at the curtain call |
| The badge               | the blue badge on its reel                                                                              | the Engineer's hip                 | walks out with a tiny suitcase; refused at the stage door       |
| The laptop              | silver, lid to the audience: React, SHIP IT, Copilot and "it works" stickers                            | the desk                           | Copilot's, from the cloud                                      |
| The desk and chair      | a pedestal desk with a banker's lamp; a buttoned leather chair                                          | the office                         | Copilot's, then up to the cloud and into Torus                 |
| Fill in the Blank's sign | "One final ______.", Loop badge                                                                        | the Learning Activities            | down the trap with them                                        |
| The DEPLOY cannon       | red circus cannon on spoked wheels                                                                      | the right wing                     | fires Clippy to Copilot                                        |
| The meeting invite      | "Quick sync, 2 hrs, 14 attendees, Recurring, forever", on bat wings                                      | the right wing                     | flattened by sixteen tons stamped DECLINED                     |
| The prompt engine       | a boiler with a PROMPT hopper and a token dial                                                          | the chorus                         | knocks the BUILD tower down                                    |
| The deprecation cart    | a handcart: Silverlight, IE, Skype, Cortana, Flip, and then Windows Phone                               | Clippy, pushing                    | off right                                                      |
| HMS Code                | a little steamer                                                                                         | the left                           | under, with the Kraken; back again in the finale, bandaged     |
| The MICROSLOP cauldron  | black, four coloured squares melting down its side                                                      | Act III                            | seventeen folders of slop                                      |
| The FEATURE vase        | white porcelain on a plinth                                                                             | built from flying pieces           | broken, then mended in gold                                    |
| The leaving box         | cardboard, OOF on the side: a plant, both crystals, the Rubber Duck                                     | the epilogue                       | carried off                                                    |
| The pager               | black, SEV 1                                                                                            | the floor of the epilogue          | Copilot                                                        |

## Running gags

- **Copilot takes over** a little more each time: the chair (logging off), the laptop (up to the cloud), and in the
  epilogue the pager.
- **The bent cherub.** The last patent cube in Act I hits the nearer cherub in the left box. It sees cubes for the rest
  of the act, then sings and bows the rest of the show slightly bent, with a plaster on, and is billed that way.
- **Sad Lady** pops up for every error: the prompt engine, the incident, the context windows, the broken feature, and
  the stage door. At the curtain call her bubble smiles.
- **Skilling stock** goes to the moon: one rocket in Rome, still in the moon's eye at Kusto time, and a whole volley in
  the finale.
- **The Token Meter** counts every token all evening, faster and faster until its wheels blur. On the final pull request
  it runs out of digits, strains, cracks and bursts, and stays a smoking wreck to the end.
- **The act card** names each act for a slogan of the decade; when the slogan changes, it's struck out and the new one
  pinned underneath: Cloud First, then Security First, then INCIDENT; AI First, graffitied AI Everything; Do Less, then
  Speed and Urgency.
- **The flypasts**, like _Those Magnificent Men in Their Flying Machines_: WORK FROM HOME IMPROVES PRODUCTIVITY in Act
  II, HYBRID: BEST OF BOTH WORLDS in Act III, RTO IS THE WAY TO GO in Act IV with the small print behind it.
- **The Learning Activities**, by Loop: Fill in the Blank in the pre-chorus, Quiz in Act IV, Flashcards in the bridge.
- **Windows Phone** goes on the deprecation cart protesting it isn't dead yet, and is back for the biggest kick line.

## Overture

0:00 to 0:13, the flourish and the choir's "Ahhh". The house curtain is down; the camera is back in the stalls.

- **0:00** Black. The footlights come up one after another, left to right, and the house fades in.
- **0:00.4** The Pink Octopus rises in the pit, baton up, and conducts on every beat.
- **0:00.9** The cherubs rise into the boxes, the right-hand pair a moment later, and sing, notes drifting up.
- **0:02.4** The playbill drops in on its lines and swings to rest: _The EDU Players present So Long, and Thanks for
  All the Tokens. A Farewell in Five Acts and One Incident._
- **0:07.6** The Lamp flickers its follow spot on at the right. **0:08.1** Clippy pops up through the trap into it.
  **0:08.8** His balloon: "It looks like you're writing a farewell. Would you like help?" Get help with leaving, or Just
  leave.
- **0:09.7** The cursor, a pixel hand pointing up, slides in from the corner. **0:10.45** It clicks Just leave.
  Clippy's brows knit; the balloon snaps shut and the cursor goes.
- **0:11.4** The crook of a cane pokes out through the gap in the curtain. **0:11.8** It taps the bottom of the playbill
  twice. **0:12.2** The playbill flies out; the cane flourishes and withdraws, and the camera settles on the stage.

## Act I: Hit Refresh

### The office

- **0:13** The band comes in and the house curtain flies out on the office: plum wallpaper, six gilt frames for a Teams
  call, the pedestal desk left of centre with its banker's lamp and the laptop, lid to us, and the leather chair. The
  Engineer at the desk, typing two taps a beat, in a pool of light.
- **0:14.4 "Ten years of Teams calls"** The portraits light up, one a beat, cameras on.
- **0:15.3 "Teams calls"** The Engineer looks up and talks, and a red pill pops up over the desk: You're on mute! It
  hangs there until the bugs arrive.
- **0:16.5 "bugs"** Three beetles scuttle across the desk; the Engineer jumps back, hands up.
- **0:17.1 "and builds"** A brick tower stamped BUILD stacks itself beside the desk.
- **0:18.1 "Of dashboards"** The portraits flip, one after another, into brass gauges: Uptime, Latency, Vibes, Errors,
  Coffee and MAU, needles twitching.
- **0:18.9 "flights"** Two little balloons, RING 0 and RING 1, rise from behind the desk. Ring 0 pops.
- **0:19.4 "and endless thrills"** An easel chart slides in from the right, _Monthly Active Thrills_, and Clippy rides
  its zig-zag line in a switchback car, losing his top hat over the peak.
- **0:21 "Of pull requests at half past five"** The chart goes; a cuckoo clock flies in over the right of the desk and
  the camera pushes in. It's half past five. **0:22.6** The doors fly open and up on the spring comes the Octocat
  instead of a bird, waving an envelope: Review requested. **0:23.2** The Engineer slumps face down on the desk.
- **0:24.5 "And pipelines somehow still alive"** The camera pulls back. School Data Sync runs on a hospital bed: a
  tangle of copper pipes with a face, taped up, and a heart monitor blipping on every beat. **0:26.3 "still"** The line
  goes flat; everyone freezes. **0:26.9 "alive"** It jumps back, the pipes sit up and puff steam, and School Data Sync
  waves its arms. The bed rolls off, School Data Sync running after it.

### Rome

- **0:27.5** A temple front flies in, VENI, CODI, SHIPPI across it, with the moon on a string at the left. A puff of
  smoke, and the Engineer is centre stage in a toga and laurel wreath, the atom peeking out, the cane planted like a
  staff.
- **0:28 "I came"** Left arm up; VENI lights. **0:28.9 "I coded"** The cane points at CODI. **0:29.7 "shipped some
  stuff"** The cane points at SHIPPI, and a rocket marked SKILLING blasts off from the right wing and lands in the
  moon's eye.
- **0:30.3** The Engineer twirls the cane. **0:30.8** Another puff: back in the hoodie.

### The tower of code

- **0:30.9 "Said, 'One more refactor'"** A tower of code blocks stands right of centre: // TODO, legacy, utils2, if (,
  helpers and the rest. The Engineer strolls over and on "refactor" hooks the fourth block out with the crook. The
  tower wobbles.
- **0:33 "that's enough"** It comes down. The Colonel marches in from the right: "Right! Stop that. It's far too
  silly." The Engineer hangs the cane on the hood and puts both hands up.

### Heaven: the crystal and the cubes

- **0:34** The camera pulls back far enough to see both boxes. Heaven flies in over Rome and its clouds draw apart on a
  sunburst of light; the cherubs sing.
- **0:34.4 "Got the crystal"** The ten-year crystal comes down a shaft of light from the flies, straight into the
  Engineer's raised hand. It glints. The Colonel gapes and marches off.
- **0:35.3** Into the hoodie pocket it goes, sticking out of the side.
- **0:35.8 "got the cube"** A patent cube drops into the right hand, another into the left, and a third, and the
  Engineer is juggling: a three-cube cascade, a throw every half-beat, hopping on the beat.
- **0:37.3** The first cube is flicked straight up into the flies, where it stays. **0:37.7** The second is batted off
  into the wings; from them, "Ow!"
- **0:38.1** The third is lobbed high to the left and the camera whips after it to the box. **0:38.6, on "off"** It
  hits the nearer cherub: an impact star, spiral eyes, halo knocked sideways and three tiny cubes going round its head.
  Its neighbour stares. The Engineer winces, and the camera swings back.

### Logging off

- **0:39 "for good"** A Log Off Windows dialog flies in: "Are you sure you want to log off?" The Engineer unhooks the
  cane and taps Log off with the tip; the button goes down.
- **0:39.5** The banker's lamp goes out and the stage dims. **0:39.7** Copilot slides into the empty chair from the
  left and bounces twice to get the height right.

### Pre-chorus

The office wall again, Copilot at the desk with the laptop.

- **0:40.7 "One final commit"** The Learning Activities pop up through a trap at the right, a barbershop quartet with
  Fill in the Blank's sign: "One final ______." The Engineer conducts them with the cane. **0:41.5** "commit" drops
  into the blank, and a red COMMITTED stamp slams across it.
- **0:42.3 "One final deploy"** A red circus cannon labelled DEPLOY rolls in from the right and Clippy drops into the
  barrel. **0:43.1** "deploy" drops into the blank. **0:43.4** Bang: Clippy flies across the stage in a long arc, and
  Copilot jumps up and catches him at the desk, then sets him down by the lamp.
- **0:44.4 "One final meeting"** The cannon rolls off; **0:45.2** "meeting" drops into the blank. A meeting invite on
  bat wings swoops in from the right: Quick sync, 2 hrs, 14 attendees, Recurring, forever. **0:45.5 "we all could
  avoid"** The quartet dives back down the trap.
- **0:45.3 to 0:48.7** The Engineer fences the invite with the cane, a parry every half-beat as it lunges on the beat.
- **0:48.7** The music builds and the invite rears up over the Engineer. **0:49.6** Sixteen tons stamped DECLINED drop
  from the flies and flatten it. Dust. The Engineer touches the headset, like tipping a hat.

### First chorus

- **0:50.1 "So long, and thanks for all the tokens"** The sunburst cloth and the SO LONG marquee, its bulbs chasing on
  the beat, tokens raining from the flies, and the company in a kick line. At the back the Unicorn, Math Coach, the
  quartet, Study Guide and School Data Sync; at the front Windows Phone, Reading Coach, the Engineer, Clippy and Copilot.
  They kick on every beat, legs alternating; every fourth beat the Engineer twirls the cane overhead.
- **0:53.6 "For every prompt and build we've broken"** The line clears for the prompt engine. The Engineer feeds it a
  long prompt; it shakes and smokes, its token dial spinning; **0:55.3** its piston arm swings and, on "broken", sends
  the BUILD tower flying. Sad Lady pops up at the right.
- **0:56.9 "For every bug that disappeared"** A giant keyboard lies on the stage, and on it a beetle in a top hat
  dances with a tiny cane of its own, keys going down under its feet. **0:58.1** The Engineer points it out to the
  Rubber Duck.
- **0:59.8 "As soon as someone else came near"** The duck waddles over. **1:00.2** The beetle freezes under a
  lampshade: just a little desk lamp. **1:01.3** The duck peers, "?", shrugs, and waddles back. **1:02.6** Off comes the
  shade and the beetle dances again; the Engineer facepalms.
- **1:03.3 "So long…"** The kick line again, shifted along, without the Unicorn: it gallops across the front, its two
  halves out of step.
- **1:06.8 "For acronyms best left unspoken"** Wooden blocks rain down: S360, SFI, IcM, DRI, OCE, OKR, MAU, RTO, OOF.
  Reading Coach sounds them out, "S… F… I…", then "I-c-M… O-K-R… M-A-U…". **1:08.4 "unspoken"** CENSORED slams across
  the balloon.
- **1:09.7 "Ten years went by, somehow that's true"** The camera pushes in on a tear-off calendar, a page every quarter
  of a second: 2016 Ninja Cat, 2017 Teams, 2018 GitHub, 2019 Update README, 2020 You're on mute, 2021 Windows 11, 2022
  Goodbye, IE, 2023 Copilot, 2024 the Copilot key, 2025 Goodbye, Skype, 2026 Agents.
- **1:13 "And now my badge is leaving too!"** The camera pulls back to the boxes, where the choir sobs into handkerchiefs,
  the bent one too. Windows Phone offers tissues; Reading Coach and Clippy weep. **1:13.6 "badge"** The badge pops off
  its reel, sprouts legs, picks up a tiny suitcase and marches off right, the reel's cord stretching after it until it
  snaps back. The Engineer waves it off with a hanky on the cane.

## Interval

1:16 to 1:23, jaunty brass and hand claps.

- **1:16** The house curtain drops with a bounce. The card: Interval (7 seconds). The camera eases back to take in the
  pit.
- **1:16.3** The Pink Octopus climbs up out of the pit with a trumpet, conducting with the baton and clapping on every
  other beat. **1:16.8** Clippy pops up through the curtain with a countdown sign: 7, 6, 5…
- The Engineer sits on the edge of the stage, legs dangling over the pit, eating an interval ice cream with a wooden
  spoon, the cane across the lap.
- **1:22** The house lights blink twice. The Engineer gobbles the rest and scrambles up through the curtain.

## Act II: Cloud First

- **1:23.2 "We moved to cloud"** The curtain flies out on a blue sky. School Data Sync hauls on a line, and the desk,
  the chair with Copilot in it (holding the laptop now) and a server rack rise on a painted cloud labelled THE CLOUD.
  Behind, a biplane on a wire tows WORK FROM HOME IMPROVES PRODUCTIVITY across the sky. The Engineer waves the cane.
- **1:24.7 "then moved again"** Torus rolls on from the right, a fortified iced doughnut, the SFI Guard running on
  ahead to its gate. The cloud comes down and everything goes in under the portcullis. The Guard: "Approve the sign-in
  on your phone." Cloud First is struck off the act card and Security First pinned under it. Torus rolls off, the Guard
  running after it.
- **1:26.5 "Migrated frameworks now and then"** Clippy pushes the deprecation cart across: "Bring out your
  deprecated!" Aboard, Silverlight, IE, Skype, Cortana and Flip. The atom on the hoodie spins like a fruit machine
  through $, ng, { }, K and &lt;/&gt; while the Engineer stares down at it, and lands back on React on "then".
  **1:27.4** School Data Sync carries Windows Phone on, kicking: "I'm not dead yet!" **1:28.6** Into the cart anyway
  as it passes, and School Data Sync follows it off.
- **1:29.8 "We added flags to hide the flags that turned on other feature flags"** **1:30.6** One flag pops up out of
  the stage. **1:31.3** The Engineer plants a second in front of it with the cane, to hide it. **1:32** Flags sprout
  from flags, doubling: flag_v2, hide_old, enable_flags, kill_switch, do_not_ship. Bunting strings across from the
  flies, the heap rises, and by **1:35.5** only the cane pokes out of the top, waving.
- **1:36.4 "We queried Kusto late at night"** Night, stars, and the moon on its string, the Skilling rocket still in
  its eye. The Engineer, in a nightcap over the headset, types at a typewriter, KQL rolling up the paper a line at a
  time: StormEvents, where Timestamp > ago(1d), summarize count() by bin(Timestamp, 1h), render timechart. The Rubber
  Duck nods beside the keys in a nightcap of its own; the Lamp holds its beam on the work.
- **1:39.6 "Declared the telemetry"** The camera pushes in on Clippy in a striped deckchair among four brass gauges on
  fire: Latency, Errors, CPU, Sev. **1:40.4** The Errors needle spins off its pivot. **1:41.5 "looks alright"** Clippy
  raises his tea: "Looks alright!"
- **1:43 "The build went green"** The camera pulls back; the sea rises in three rows of waves and the railway signal
  drops to green. **1:44.5 "we shipped the code"** HMS Code steams in, the Engineer on deck with the cane to the eye
  like a telescope. Clippy pops up at the right: "It looks like you're shipping on a Friday."
- **1:45.8 "…then watched another incident unfold"** The sky darkens. The Kraken of IcM rises behind the ship, its arms
  tagged Sev 2, closes on it and drags it under. Sad Lady pops up. The act card's slip now reads INCIDENT, and only the
  cane is left, bobbing in the waves.

## Act III: AI First

- **1:49.3 "So long…"** Copilot leads the kick line from the middle; the Engineer has been moved to the end. A hot-air
  balloon drifts across the back: HYBRID: BEST OF BOTH WORLDS.
- **1:52.8 "For all the context windows broken"** Three sash windows fly in: 8K, 128K and 1M. The Engineer hauls in a
  scroll, THE ENTIRE MONOREPO, and shoves it at 128K, which shatters on "broken"; then at 1M, which shatters too. Sad
  Lady again.
- **1:56.1 "Copilot said"** The camera pushes in on Copilot on a SOAP box, in a deerstalker, with a magnifying glass.
  **1:57.3 "I found the cause!"** The glass swings to the Engineer, who points the cane at themselves.
- **1:58.9 "Then changed seventeen files just because"** The MICROSLOP cauldron bubbles over a fire, its four coloured
  squares melting down its side. Copilot ladles slop into seventeen manila folders lined up across the stage, one every
  tenth of a second, while a counter runs to +4,812 −3. **2:01.1 "because"** Copilot shrugs: "Just because." The
  Engineer watches it drip.
- **2:02.5 "So long…"** Copilot sprays graffiti on the act card, and AI First becomes AI Everything. The agents join the
  back of the kick line, kicking a little too high.
- **2:06 "For every agent we've awoken"** The laboratory. Copilot, in goggles, throws the knife switch marked AWAKEN
  AGENTS; lightning cracks from the Tesla coils and the agents swing up to stand on their slabs, one, two, three. **2:07.5** The
  org chart rolls down from the flies and its seats turn over to agents one at a time, the Engineer's, You, last. The
  Engineer's hands are up, the cane on the hood.
- **2:09.3 "They planned, they reasoned, they reviewed"** The agents in a line, kicking: "planned", a blueprint, _The
  Plan_; "reasoned", "Thought for 47 seconds…"; "reviewed", a monocle and a green LGTM stamp; and a fourth with two
  monocles, reviewing the reviewer.
- **2:12.4 "And occasionally compiled too!"** The camera pushes in on a brass console. "Build failed, 17 errors" turns,
  on "compiled", to "Build succeeded, 0 errors. Somehow." The agents throw their arms up; Solitaire cards bounce across
  the backcloth, trails and all; and the velvet comes off a plaque: _On this spot in 2026 the build succeeded._

## Act IV: Do Less

- **2:15.7 "There's always one more meeting due"** The boardroom: green stripes, panelling, a GROWTH MINDSET sampler and
  a clock. The Engineer waits by a door marked Meeting Room, leaning on the cane. **2:17.7 "meeting"** The door bursts
  open and three Cardinals pile out: "NOBODY EXPECTS THE REORG!" They riffle the org chart's cards between them.
  **2:19** On Do Less, everyone lies flat for a beat.
- **2:19.4 "One more preview to push through"** A klaxon. Do Less is struck out for Speed and Urgency, and everything
  goes at double speed: the cut-outs drop from twos to ones under a red pulse. The Engineer bulldozes a giant PREVIEW
  crate across the stage and squeezes it through the meeting-room door on "through". Overhead, a biplane tows RTO IS
  THE WAY TO GO, and a tiny one behind it tows the small print, (3 DAYS A WEEK).
- **2:22.8 "One more thread with forty replies"** The Unicorn gallops in with a pennant: 1 Billion Users! A Teams
  thread, _Quick sync about the sync_, unrolls from the flies: +1, Looping in @everyone, Following, Let's take this
  offline, +1, Any update?, Thanks!, +1, Bumping this, the count running up to 40 replies.
- **2:25.7 "And still no one knows the how or why"** A Loop quiz drops in: "What did we decide?" A. Ship it, B. Don't
  ship it, C. Ship it later, D. Take it offline. The votes come in dead even, 25% each. **2:28.4** Question marks pop
  over every head, and the Engineer holds the cane up crook first, a token underneath for the dot.
- **2:30.4 "'Quick question' never once was quick"** A chalkboard: GOAL: 1,000,000,000 USERS. Math Coach: "Quick
  question…" **2:31.9** and starts rubbing out the zeros, very slowly, each one leaving a chalky ghost. The boardroom
  clock spins; cobwebs grow between the Engineer and the cane.
- **2:33.8 "'Small change' was rarely quite that slick"** The camera pushes in. Down to 1,000,000, Math Coach chalks the
  1 into a yellow 8, the 1 still showing through: 8,000,000 USERS (rounded up). **2:35.2** The Engineer, standing
  clear of the board, points the cane at the 8 and turns to the audience. **2:36.2** A gold star.
- **2:37.4 "And somewhere deep in A-D-O"** A trapdoor: the boardroom slides up out of sight and we go down into the
  backlog dungeon, all stone, chains and guttering torches. The Octocat leads the way down a wooden stair from the
  wings with a torch; the Engineer follows a tread at a time, one foot past the other, the cane tapping as he goes.
- **2:42.1 "A task left from eight years ago"** A skeleton chained beside a work item: Update README, Created: 2018,
  State: Active, Assigned to: nobody. It waves. Cobwebs. **2:44.8** The Engineer prods the card with the cane and it
  crumbles to dust; the skeleton's jaw drops.

## Interlude: Sincerely

2:45.7 to 2:48.5, the music softening.

- A bare, dark stage. Clippy at a newsreader's desk, The News: "And now for something completely sincere." The Lamp
  warms its light; in the pit the Pink Octopus takes up a harp.
- **2:46.8** The Engineer pulls the headset down round the neck and leans on the cane.

## Act V: The People

Played straight, in amber light, the headset round the neck.

- **2:48.5 "But underneath the builds and on-calls"** A cutaway under the stage: the crew who hold the show up, in
  silhouette, turning the capstan and hauling the lines; one asleep in a hammock with a pager on their chest; the clock
  at 3 a.m. The Engineer kneels on the boards above, looking down at them.
- **2:52.5 "The stand-ups, specs, and Teams app stalls"** Three oval vignettes in gilt frames, one on each: the
  stand-up, five people on their feet in a ring; the specs, a stack with a sticky note on top; Teams, loading.
- **2:56.5 "Were people I was lucky to know"** A chain of paper dolls unfolds across the stage from the Engineer's
  hand: twelve colleagues cut from the same sheet, no two heads the same.
- **3:00 "And that's the part that's hard to let go"** The camera pushes in on the Engineer holding the nearest doll's
  hand. **3:02.4 "let go"** The chain folds back up and away.
- **3:04.6 "I learned a lot"** Study Guide walks on with a flashcard: "What did you learn?" It flips over: "A lot." **3:05.7 "I built
  a lot"** The card flies out and a tower of projects stacks up block by block, from the bottom: Windows Phone,
  Microsoft Sales Compensation, Microsoft Professional Program, Microsoft Virtual Academy, Project Lagro, Career Coach,
  Worldwide Learning R&D and Enterprise Skills Initiative; then MSAL React, a little block off to one side; and on it,
  teetering like the xkcd comic's tower on its one small library, School Data Sync, Learning Activities, Copilot
  Notebooks and Study Guide.
- **3:06.6 "I probably cached more than I ought"** A squirrel scampers on and stuffs acorns marked CACHE into the hoodie
  pocket beside the crystal, and winks on "ought".
- **3:08.5 "And after ten good years, it seems"** A sunset flies in. The Engineer takes the crystal out of the pocket
  and holds it up to the light, and it splits the sunset into a rainbow across the stage.
- **3:12.2 "It's time to close a few more Teams"** A row of doors: General, Random, Stand-up, On-call, Lunch? They close
  one a beat from the right while the stage darkens down to one narrowing spot. The Engineer crosses to the last,
  General, and closes it gently with the crook.
- **3:18.8** The Lamp clicks off. Blackout.

## Grand Finale: One Microsoft

- **3:19.5 "So long…"** The lights slam on. The whole company on two tiers of risers before the sunburst and the
  marquee, confetti from cannons either side, the camera back far enough to see the choir in the boxes and the Octopus
  conducting in the pit. Agents, Cardinals and the SFI Guard at the top; the Unicorn, Math Coach, the quartet, Study
  Guide, School Data Sync and the Octocat in the middle; the Rubber Duck in a bow tie, Reading Coach, the Engineer,
  Clippy and Copilot at the front.
- **3:23.1 "For every feature built and broken"** A vase labelled FEATURE assembles itself on a plinth from flying
  pieces, and smashes on "broken". Sad Lady, one last time.
- **3:26.4 "Then fixed"** The pieces fly back together, gold in every crack. **3:27.4 "then shipped"** HMS Code,
  bandaged, sails across the back on a wave. **3:28.2 "then flighted wide"** Five balloons, RING 0 to RING 4, rise and
  spread wide, and a volley of Skilling rockets goes up, every one into the moon.
- **3:29.7 "With one last hotfix on the side"** The camera pushes in on the Octocat, butler for the evening, with a
  silver cloche. It lifts on a flaming chilli labelled HOTFIX, on a side plate. The Engineer eats it; steam from both
  ears.
- **3:32.8 "So long…"** The biggest kick line of the night: everyone, agents and all, Windows Phone back from the cart,
  a Cardinal at each side of the back, the Guard and the duck kicking at the front ends, more confetti.
- **3:36.3 "For every friendship, laugh and moment"** Paper dolls unfold from either end of the line, and the cast
  joins hands with them, swaying.
- **3:39.5 "The final pull request is through…"** The Octocat hands over one last envelope, Final PR, and a COMPLETE
  MERGE lever rolls on. **3:41.2** The Engineer hooks it with the cane and pulls on "through": the Octocat scurries
  off, fireworks, confetti, and the Token Meter runs past 99,999,999, strains and bursts, throwing springs, bolts, cogs
  and number wheels across the stage. The camera pulls back, and **3:43.6** the
  house curtain comes down on the last chord.

## Epilogue: OOF

3:45.9 to 3:53.9, spoken, dry, in front of the curtain in the Lamp's one spot.

- The Engineer, hood up and headset over it, carries the leaving box in both hands: a plant, both crystals, the Rubber
  Duck peeking out, OOF on the side. The cane hangs on the hood; the badge reel at the hip is empty.
- **3:46 "And if anything breaks after Tuesday…"** **3:47.3** A pager on the floor starts buzzing: SEV 1. The Engineer
  turns to look at it.
- **3:48.8 (pause)** They stare at each other. The duck looks from one to the other.
- **3:50** The badge waddles in with its suitcase to the stage door at the right. **3:51.6 "I no longer have
  access."** It taps itself on the reader: red light, ACCESS DENIED. It hops. **3:51.9** The SFI Guard lowers his pike
  across the door, and Sad Lady pops up. **3:52.1** The badge bounds back across the stage in three hops to the
  Engineer's side.
- **3:52.3** The Engineer shrugs, tucks the box under one arm, hooks the buzzing pager with the crook and lobs it to
  Copilot, who has popped up through the curtain.
- **3:53** The Engineer and the badge walk off left together, Chaplin style, the cane twirling. Clippy pops up from the
  wings: "It looks like you're leaving." The iris closes on the cane.

## Curtain call

- **3:53.9 "SO LOOOOONG!"** The iris blows open from the cane and the curtain flies out on the whole company bowing,
  one long bow every two bars, in three rows. At the back two agents, a Cardinal, the Colonel, the Unicorn, the skeleton
  (waving) and the Guard; in the middle Math Coach, the quartet, School Data Sync, the Octocat and the Lamp; at the
  front Windows Phone, Reading Coach, Clippy, the Engineer, Copilot, Study Guide, the Rubber Duck, the squirrel and the
  badge. The camera pulls back to the whole house.
- **3:54.6** Roses and tokens land on the stage. **3:56.5** A dolphin pops up in the stalls and waves a flipper.
  **3:57** Sad Lady rises at the right, and her bubble finally smiles. In the left box the bent cherub bows at an angle,
  plaster and all.
- **4:00.4** The first patent cube, flicked into the flies in Act I, finally comes down, straight into the Engineer's
  hand.
- **4:10.5 "So…"** Everyone stops bowing and looks up. The stage darkens, and a shadow spreads over the company as a
  giant foot comes down out of the sky: a classical one, varnished and cracked, cut out of an old master, swaying as it
  hangs there.
- **4:12.4 "…long!"** It stamps the lot flat, squashing as it lands. Dust, and the picture shakes.

## Credits

After the music, silent-film title cards, white on black in a scrolled border: THE END, with the tokens spent, more
than the meter could count; The EDU
Players were; Also appearing; Directed by Mr. Opus; and "No agents were harmed in the making of this farewell. Several
were rebooted."
