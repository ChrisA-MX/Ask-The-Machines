# Ask the Machines

An Angular storytelling prototype for **Abandoned, but Not Forgotten**, a NASA Space Apps Challenge project about equipment left on the Moon, Mars, and elsewhere in the solar system. The intended audience is school-age space enthusiasts.

This README describes the code as it exists now. It separates working features from ideas in the project plan that have not been implemented yet.

## Contents

- [Technology](#technology)
- [Application structure](#application-structure)
- [Current routes](#current-routes)
- [Frontend features](#frontend-features)
- [Adding a roadmap machine](#adding-a-roadmap-machine)
- [Chat backend](#chat-backend)
- [Run the project](#run-the-project)
- [What works and what is unfinished](#what-works-and-what-is-unfinished)
- [Tests and build](#tests-and-build)

## Technology

- Angular standalone components, TypeScript, HTML, CSS, and SCSS
- Angular Router and HttpClient
- Angular CDK drag and drop
- Express and Angular SSR for the Node server
- NVIDIA Nemotron chat completions, with OpenAI and local story fallbacks

Dependencies are recorded in `package.json` and `package-lock.json`. To install from a fresh checkout:

```bash
npm install
```

## Application structure

```text
src/
  app/
    app.ts                         Root application shell
    app.routes.ts                  Client routes
    components/
      stage/                       Shared CSS space backdrop
      landing/                     Home page and entry links
      chat-widget/                 Floating Apollo chat and accessible launcher
      animated-sprite/             JSON-configured Apollo sprite-sheet player
      apollo-game/                 CDK gear-sorting mini-game
    mission-lab/                   Responsive 3D model lab
      machine-viewer.ts/html/scss  Lazy Three.js model viewer
      data/lab-models.ts           Five model labels, descriptions and story links
    storyline/                     3D world carousel, machine trails, and progress
      machines.data.ts             Typed adapters for the JSON story source
    data/machine-stories.json       Single source of truth for story copy and facts
      world-carousel/              Lazy-loaded, SSR-safe Three.js world carousel
      story-page/                  Lazy story reader route and click-to-play video
      space-doodle/                Inline SVG space decorations
    worlds/                        Cached world service and copied procedural generator
      worlds.service.ts             App-lifetime cache, device quality, generation timings
      worlds/                       Moon, Mars, and Outer System procedural worlds
      utils/                        Simplex-noise helpers used by the generator
    services/
      chat.service.ts               Browser adapter for POST /chat
      progress.service.ts           Story and mini-game progress
      player-profile.service.ts     Player avatar name, defaulting to Apollo
      chat-availability.service.ts  Busy state for Apollo's rescue activity
  server/chat-knowledge.ts         Story retrieval, aliases, prompts, local replies
  server/chat-provider.ts          NVIDIA/OpenAI/local provider chain
  server/chat-rate-limit.ts        In-memory per-IP request limit
  server.ts                        Express API, static files, and Angular SSR
  main.ts                          Browser bootstrap
  main.server.ts                   Server-rendered Angular bootstrap
```

The root component always renders `Stage`, then the active router page, then Apollo's `ChatWidget`. The stage provides a background behind every page. The chatbot avatar is shared across routes. The app is configured for server rendering and hydration; `src/app/app.routes.server.ts` prerenders the configured routes.

## Current routes

| URL | Page | Current state |
| --- | --- | --- |
| `/` | Landing | Headline, intro, and links to Stories and Mission Lab. |
| `/storylines` | 3D world carousel and machine stories | Moon (4), Mars (4), and Outer Solar System (4), each followed by a locked-until-ready mini-game stop. |
| `/storylines/:worldId/:machineId` | Story reader | Lazy, direct-load story page with validation, progress lock, fact sources, speech playback, and opt-in video embeds. |
| `/missions` | Mission Lab | Five-model 3D viewer with controls and story links. |

Story links navigate to `/storylines/:worldId/:machineId` in the same tab. This route is client-rendered for direct visits and refreshes; it validates the world and machine slug, shows locked/not-found states, and sets story-specific title metadata. Browser Back returns to the trail and restores the world and focused node from in-memory navigation state. There is no custom not-found route outside this story route. The navigation's About links point to `#about`, but no page currently has an element with that ID.

## Frontend features

### Shared stage and landing page

`Stage` is a CSS illustration of stars, Earth, and the Moon. It is static: the planned scroll timeline, spacecraft travel, machine sprites, and GSAP/ScrollTrigger animation are not implemented. The landing page is also static and currently links visitors into the placeholder story list or the Mission Lab.

### Story selection page

`Storyline` opens with a 3D carousel rather than a flat world map. `WorldCarousel` dynamically imports Three.js after the browser render, then asks the root `WorldsService` to dynamically load `src/app/worlds/worlds/index.ts`. The service creates Moon, Mars, and Outer System once per quality tier and reuses those generated objects when the route is revisited. It disposes them when the app injector is destroyed. Procedural texture generation runs in chunks after the page renders; the carousel displays a preparation state and a retry message if setup fails.

The Moon and Mars use generated relief and color maps rather than image files. The Moon includes maria and crater/ray detail; Mars generates terrain including its large canyon and polar regions. The Outer System generator supplies a gas giant, rings, stars, and an asteroid belt; the carousel adds four small orbiting satellites because the supplied module does not currently create any. Its star field is scaled down from the module's 40â€“50 unit radius to fit the carousel. Rear worlds use a separate transparent dark shell, so their generated materials remain intact. The carousel provides the Apollo 11 site as a glowing, keyboard accessible marker and hides it when the point is on the far side of the Moon.

Controls include previous/next arrows, left/right keys, dots, and horizontal drag/swipe; the wheel remains available for page scrolling. Each world spins during carousel transitions. Reduced-motion and WebGL-unavailable environments get a labeled CSS carousel. The canvas is transparent over the shared Stage backdrop and is capped at 2Ã— device pixel ratio. Rendering pauses when the tab is hidden or the carousel is off screen. The world taglines and completion labels remain HTML, and locked worlds show a hint instead of opening.

Quality is `low` on narrow screens and lower-core devices, and `medium` on desktop. The module describes low/medium/high texture sizes as 1024Ã—512, 2048Ã—1024, and 4096Ã—2048. `WorldsService` records first-ready time for each world and prints those measurements and a one-time quality note to the debug console. The copied module's `setQuality()` method is currently a warning-only stub, so a large viewport tier change selects or creates a cached set at the new tier instead of calling that method. No external textures are required or downloaded.

Story copy is authored once in `src/app/data/machine-stories.json`. `machines.data.ts` adapts its records for the carousel, trail, story reader, mini-games, and chat; do not duplicate or paraphrase story text there. Each world currently has four chronological stories (twelve total). Progress keeps its existing stable IDs in the versioned `ask-the-machines-world-progress-v2` local-storage record, even when a story's URL slug differs.

Each trail has five stops: four story nodes and a fifth mini-game node. The SVG path is generated for all five, and the browser positions every node with `getPointAtLength()`. Story completion unlocks stories in order and unlocks the mini-game after all four stories. The next world unlocks when all four stories in the prior world are complete; the `WORLD_UNLOCK_REQUIRES_MINI_GAME` constant in `storyline.ts` can require its game too. `Unlock all (demo)` marks all stories and games complete; `Reset progress` clears both.

Add a future world by extending `WorldId`, `WORLDS`, and the `WorldsService` id list, then add its generator and carousel-specific presentation in `src/app/worlds/worlds/` and `WorldCarousel`. Carousel angles, wraparound, and dots use the world count. The CSS circles remain a device fallback and should receive a matching gradient class for a fourth world.

The story reader displays the JSON sections in order, followed by an optional sidebar, the preserved video metadata, current status, a creative-voice note, and a fact-check list. Sentence splitting is used only to lay out the existing text; the source copy is not rewritten. Empty source URLs render as plain source names, and are listed by `npm run check:stories` so they can be filled later. The reader uses the neutral placeholder at `public/roadmap/unresearched.svg` until image paths are supplied.

Machine previews appear on hover, keyboard focus, or touch activation. The mini-game preview follows the same interaction and explains that all four stories are needed to unlock it. Opening a story navigates to a full-page reader with first-person sections, fact-check sources, speech synthesis when supported, previous/next navigation, and reading progress. YouTube thumbnails are lazy-loaded; an iframe is created only after Play is pressed. It is removed on route exit, and an embed timeout leaves the direct YouTube link available. First-person narration is marked as creative voice. Story completion records progress and unlocks the next story.
### World mini-games

The mini-game shell and activities are loaded through an Angular `@defer` block. Each activity has instructions, keyboard/touch controls, replay, a short timer, an accessible status message, and a completion badge stored with world progress. The badge appears on its carousel card.

- The Moon trail reuses the shared Apollo cargo activity. Players drag gear or select it and use “Leave on the Moon” / “Bring home” buttons. It remains a simplified learning activity, not a historical loading manifest.
- Mars is a solar-panel alignment activity. A slider or arrow keys adjusts the panel to track the moving Sun; a dust storm starts halfway through. Opportunity and InSight facts appear after success.
- Outer Solar System is a radio-tuning activity. A slider or arrow keys moves the signal meter; locking onto Voyager 1 completes it. The success view links to NASA mission status and says the signal takes many hours to reach Earth without claiming a distance.

### Adding a roadmap machine

Edit the corresponding entry in `src/app/data/machine-stories.json` to add or update a machine story. Keep the reader copy in the JSON, add a `STORY_VIDEOS` entry in `machines.data.ts` if it needs a video, and use `npm run check:stories` to validate required fields, fact sources, world counts, and video roster alignment. The current neutral image is selected by the adapter until image paths are added.

### Mission Lab 3D machine viewer

Mission Lab presents five GLB models configured in `src/app/data/lab-models.ts`. Angular serves the files from `src/assets/machines/` at `/assets/machines/` in development, production, and SSR output. The viewer dynamically imports Three.js, OrbitControls, RoomEnvironment, GLTFLoader, MeshoptDecoder, and (for Draco models) DRACOLoader after browser rendering. A local Draco decoder lives in `src/assets/machines/draco/gltf/`; the viewer uses the document base URL when constructing asset paths.

The selected model is normalized and centered, while the previous model stays visible until its replacement loads. The viewer includes orbit, zoom, pan, keyboard controls, fullscreen when available, progress, retry, WebGL fallback, cache reuse, offscreen pausing, and reduced-motion handling. `npm run check:lab` confirms that every configured GLB exists in the served asset folder and lists models without supplied credits. The Apollo cargo game remains shared by the Moon trail mini-game but no longer appears on `/missions`.

### Apollo cargo mini-game

`ApolloGame` uses Angular CDK drag and drop with two connected lists: Lunar Module and Lunar Surface/discard pile. The sample items are Portable Life Support System, Lunar Overshoes, and Emesis Bags. Moving all three to the discard pile displays:

> Weight limit reached! You have room for the Moon Rocks. Lift-off successful!

The game can be reset, and moving an item back to the Lunar Module removes the completed state. This is a simplified learning activity: it has no item masses or payload calculation and is not a historically accurate Apollo loading record. Its state exists only in the browser and resets when the page is reloaded.

The game and Apollo chat use the sprite sheet generated by `npm run apollo-sprites`. The script reads the raw PNG strips from `public/assets/game/astronauts/raw/` or the existing legacy `public/assests/game/astronauts/raw/` directory, and writes the sheet, row configuration, and previews into `public/assets/game/astronauts/`. It requires Python with Pillow and NumPy; raw strips are never modified. The player loads frame counts and timing from `apollo-sprites.json`, and supports loop and ping-pong playback. Idle currently uses the first three frames to avoid the remaining frames' body turn.

### Chat widget

Apollo appears on every route as a fixed sprite-sheet avatar with a soft glow; if the JSON or image cannot load, the prior round launcher remains available. Hover or keyboard focus starts the wave and displays â€œHello Explorer, I'm Apollo.â€ On touch devices, the greeting appears once per browser session after four seconds. The configured profile name defaults to `Apollo`; the name is not sent to the server. Reduced-motion mode shows a static wave frame.

Activating Apollo opens a labeled dialog, focuses the question field, supports Escape and close-button dismissal, and returns focus to Apollo. The header avatar is Apollo; the sprite reacts happily to a reply and sadly to a connection error, then returns to idle. The cargo game's active drag marks Apollo busy and disables the launcher accessibly. The chat starts with suggested questions, keeps messages in component memory, sends the last six conversation messages, and shows a typing indicator. On machine story pages its suggestions are tailored to the current story. The transcript is not saved after reload; there is no reset button or streaming response display.

## Chat backend

The Express app in `src/server.ts` defines `POST /chat` before serving static browser files and handing page requests to Angular SSR. The server reads `.env` when present or uses environment variables injected by the host. NVIDIA Nemotron is the primary provider; OpenAI Responses is tried only when `OPENAI_API_KEY` is set, then a local story excerpt supplies a no-key fallback. Provider keys never enter Angular code or responses.

### Request and response

Request:

```json
{
  "message": "What happened at Tranquility Base?",
  "history": [{ "role": "user", "content": "Tell me about Eagle." }],
  "machineId": "apollo-11-eagle"
}
```

Successful response:

```json
{
  "reply": "A short answer from Apollo.",
  "suggestions": ["What did Eagle find?", "Is Eagle still working?", "How did Eagle work?"]
}
```

The server rejects empty questions and questions over 300 characters, validates text-only history, and caps history at six messages. The JSON body parser has a 12 KB limit. Calls have a 15-second timeout; HTTP 429 and 5xx responses get one short retry. NVIDIA uses a 350-token output limit and disables thinking. A 400 response retries once without `chat_template_kwargs`. Reasoning fields and `<think>` blocks are never displayed. Provider logs contain status and a short category, not keys or question text. Responses are rendered as Angular text interpolation, never HTML.

### Knowledge and answer limits

`src/app/data/machine-stories.json` is the source of truth and is imported once by the server. Keyword and alias matching ranks machines against the question and the last two user turns; an active story's `machineId` is pinned first. The prompt contains a compact index of all 12 stories and full text for up to three relevant machines, plus world introductions and connect-the-dots text. Apollo uses simple third-person language, identifies creative voice, avoids unsupported claims, and points Voyager distance questions to NASA's live status page without stating a number. If both remote providers are unavailable or unconfigured, the server chooses a relevant machine section and returns a local excerpt; with no match it says it does not know yet.

Machine stories are educational public content, not confidential data. The model is instructed to use only the retrieved story notes and index, but generated text can still be wrong; check source citations in the story reader for authoritative details.

### Limits and operations

- Create a local `.env` from `.env.example`; set `NVIDIA_API_KEY`, optionally choose `NVIDIA_MODEL`, and optionally set `OPENAI_API_KEY` for the secondary provider. `.env` is git-ignored.
- The rate limit is 20 requests per IP per minute, held in an in-memory map. It resets when the process restarts and is not shared across multiple server instances.
- There is no user authentication, database, persistent chat history, streaming, or durable abuse monitoring.
- The server does not configure Express `trust proxy`; depending on the hosting setup, `req.ip` may not represent the original visitor IP.
- Chat history is limited to six messages and remains only in browser memory; the server does not store conversations.
- If NVIDIA fails and no OpenAI key is configured, Apollo still returns a local story-based response. Remote model quality and availability depend on valid keys, model access, network access, and provider availability.

## Run the project

### Development

The project uses Angular CLI's development server. Copy `.env.example` to `.env` and add your NVIDIA key; OpenAI is optional:

```powershell
Copy-Item .env.example .env
# Edit .env and set NVIDIA_API_KEY. Optionally set OPENAI_API_KEY.
npm start
```

Open `http://localhost:4200/`. `NVIDIA_MODEL` is optional and defaults to `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`. Do not put API keys in Angular source, browser environment files, or a committed `.env` file.

### Production server

```bash
npm run build
```

Set `NVIDIA_API_KEY` and optionally `NVIDIA_MODEL` in the Node hosting environment. Set `OPENAI_API_KEY` if the secondary provider should be enabled, then run:

```bash
npm run serve:ssr:ask-the-machine-app
```

The server listens on `PORT` when provided, otherwise port `4000`. The project has no hosting-provider deployment configuration yet; deploy the built Angular/Express server to a Node-capable host and configure the secret there.

## What works and what is unfinished

### Implemented

- Standalone Angular pages and client routing for `/`, `/storylines`, `/storylines/:worldId/:machineId`, and `/missions`.
- Shared static space backdrop and floating Apollo chat widget with accessible dialogs, sprite reactions, reduced-motion handling, and busy-state support.
- Lazy, generated Moon/Mars/Outer worlds with route-level object reuse, loading/error states, responsive quality, fallback carousel, and Apollo 11 marker.
- The Mission Lab 3D viewer with five machine models, accessible controls, local Draco support, and links into machine stories and trails.
- Angular CDK drag/drop interaction, progress count, completion message, and game reset.
- Express `POST /chat` with NVIDIA → optional OpenAI → local story fallback, request validation, per-IP throttling, retrieval, and short recent history.
- Server rendering and prerender configuration.

### Not implemented or incomplete

- Scroll-driven spacecraft journeys, timeline progress, machine sprites, and reveal-on-arrival stories.
- The procedural worlds and satellite layout are educational illustrations, not dimensionally accurate planetary orbits or NASA terrain datasets.
- The supplied world module's `setQuality()` is not implemented; the app creates/reuses worlds per tier instead. Its module-level Moon/Mars texture cache is not cleared by `World.dispose()`, despite the README's full-cleanup claim.
- Verified NASA details and source links for machine entries that currently carry TODO fields.
- Machine-specific conversation history and model conversation memory.
- PDF ingestion or a vector database for the chatbot; current story retrieval is keyword and alias based.
- Persistent user/game state, a database, authentication, or production-grade distributed rate limiting.
- A custom 404 page and working About section targets.

## Tests and build

Build the application with:

```bash
npm run build
```

Run the Angular unit-test runner with:

```bash
npm test
```

The current suite covers the app shell, world-carousel behavior, world-service caching and teardown, story counts, unlock rules, mini-game progress, trail path points, preview-card placement, Mission Lab configuration, and chat retrieval/provider payload/fallback/rate-limit behavior. The Express endpoint's end-to-end HTTP behavior still lacks an integration test.

## Added on 15 November 2026

- **Fact sources.** Every fact in `src/app/data/machine-stories.json` now has a `sourceUrl`, and all twelve stories are marked `verified`. `npm run check:stories` reports no missing links.
- **Live Voyager 1 counter.** `src/app/components/voyager-tracker/` shows Voyager 1's distance from Earth and the signal travel time. It is anchored to NASA's published one-light-day milestone (18 November 2026) and appears on the landing page, the Voyager 1 story and the About page.
- **About and credits page** at `/about`, generated from the story data, `src/app/data/lab-models.ts` and `src/app/data/credits.ts`. Add artwork and 3D model credits there.
- **Not-found page.** Unknown addresses render a 404 page and return HTTP 404.
- **Chat that never goes dark.** If `POST /chat` fails or is rate limited, `ChatService` answers in the browser from the bundled story notes (`src/app/services/local-apollo.ts`).
- **Deploy fix.** `angular.json` had an empty `security.allowedHosts`, so the production server answered every page with HTTP 400. Common hosting domains are now allowed; set `NG_ALLOWED_HOSTS` for a custom domain. The server also trusts one proxy so the chat rate limit is per visitor.
- **Smaller 3D files.** The rover, both Ingenuity models and the Earth, Moon and Mars globes were recompressed with glTF-Transform (WebP textures, Meshopt geometry for Mission Lab models): about 65 MB down to about 9 MB. Originals are in Git history.
- Draft submission text and deploy steps are in `SUBMISSION.md`.
- **Sound.** `src/app/services/sound.service.ts` generates every sound with the Web Audio API (no audio files): a quiet ambient theme that starts on the first click or key press, plus sounds for taps, page changes, chat messages, finished stories and mini-game badges. The theme fades down during read-aloud and video, and pauses when the tab is hidden. `src/app/components/sound-toggle/` is the mute button (bottom left, choice saved on the device). Volume lives in `MUSIC_LEVEL` near the top of the service.
