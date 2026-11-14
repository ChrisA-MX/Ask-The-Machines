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
- Leaflet with NASA/JPL Solar System Trek planetary imagery
- Express and Angular SSR for the Node server
- OpenAI Responses API for chat replies

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
      artifact-map/                Leaflet Moon/Mars map and story modal
      apollo-game/                 CDK gear-sorting mini-game
    mission-lab/                   Page combining the map and mini-game
    storyline/                     3D world carousel, machine trails, and progress
      machines.data.ts             Typed Moon/Mars/Outer world and machine data
      world-carousel/              Lazy-loaded, SSR-safe Three.js world carousel
      story-page/                  Lazy story reader route and click-to-play video
      space-doodle/                Inline SVG space decorations
    worlds/                        Cached world service and copied procedural generator
      worlds.service.ts             App-lifetime cache, device quality, generation timings
      worlds/                       Moon, Mars, and Outer System procedural worlds
      utils/                        Simplex-noise helpers used by the generator
    services/
      chat.service.ts               Browser adapter for POST /chat
      progress.service.ts           Completed story IDs shared with Apollo chat
      player-profile.service.ts     Player avatar name, defaulting to Apollo
      chat-availability.service.ts  Busy state for Apollo's rescue activity
  shared/machine-facts.ts          Server-shared, source-backed story facts
  server/chat-knowledge.ts         Completed-ID validation and per-request prompt
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
| `/missions` | Mission Lab | Planetary artifact map and Apollo cargo mini-game. |

Story links navigate to `/storylines/:worldId/:machineId` in the same tab. This route is client-rendered for direct visits and refreshes; it validates the world and machine slug, shows locked/not-found states, and sets story-specific title metadata. Browser Back returns to the trail and restores the world and focused node from in-memory navigation state. There is no custom not-found route outside this story route. The navigation's About links point to `#about`, but no page currently has an element with that ID.

## Frontend features

### Shared stage and landing page

`Stage` is a CSS illustration of stars, Earth, and the Moon. It is static: the planned scroll timeline, spacecraft travel, machine sprites, and GSAP/ScrollTrigger animation are not implemented. The landing page is also static and currently links visitors into the placeholder story list or the Mission Lab.

### Story selection page

`Storyline` opens with a 3D carousel rather than a flat world map. `WorldCarousel` dynamically imports Three.js after the browser render, then asks the root `WorldsService` to dynamically load `src/app/worlds/worlds/index.ts`. The service creates Moon, Mars, and Outer System once per quality tier and reuses those generated objects when the route is revisited. It disposes them when the app injector is destroyed. Procedural texture generation runs in chunks after the page renders; the carousel displays a preparation state and a retry message if setup fails.

The Moon and Mars use generated relief and color maps rather than image files. The Moon includes maria and crater/ray detail; Mars generates terrain including its large canyon and polar regions. The Outer System generator supplies a gas giant, rings, stars, and an asteroid belt; the carousel adds four small orbiting satellites because the supplied module does not currently create any. Its star field is scaled down from the module's 40â€“50 unit radius to fit the carousel. Rear worlds use a separate transparent dark shell, so their generated materials remain intact. The carousel provides the Apollo 11 site as a glowing, keyboard accessible marker and hides it when the point is on the far side of the Moon.

Controls include previous/next arrows, left/right keys, dots, and horizontal drag/swipe; the wheel remains available for page scrolling. Each world spins during carousel transitions. Reduced-motion and WebGL-unavailable environments get a labeled CSS carousel. The canvas is transparent over the shared Stage backdrop and is capped at 2Ã— device pixel ratio. Rendering pauses when the tab is hidden or the carousel is off screen. The world taglines and completion labels remain HTML, and locked worlds show a hint instead of opening.

Quality is `low` on narrow screens and lower-core devices, and `medium` on desktop. The module describes low/medium/high texture sizes as 1024Ã—512, 2048Ã—1024, and 4096Ã—2048. `WorldsService` records first-ready time for each world and prints those measurements and a one-time quality note to the debug console. The copied module's `setQuality()` method is currently a warning-only stub, so a large viewport tier change selects or creates a cached set at the new tier instead of calling that method. No external textures are required or downloaded.

The world data lives in `src/app/storyline/machines.data.ts`: each world has four chronological story machines, for twelve stories total. Moon: Surveyor 3, Apollo 11 Eagle descent stage/retroreflector, Lunar Roving Vehicles, and Apollo 17 ALSEP. Mars: Sojourner, Opportunity, InSight, and Ingenuity; Spirit is included in Opportunity's story rather than as its own stop. Outer Solar System: Pioneer 10, Voyager 1, Voyager 2, and New Horizons. Removed machine IDs are filtered out during migration. Progress is stored in the versioned `ask-the-machines-world-progress-v2` local-storage record.

Each trail has five stops: four story nodes and a fifth mini-game node. The SVG path is generated for all five, and the browser positions every node with `getPointAtLength()`. Story completion unlocks stories in order and unlocks the mini-game after all four stories. The next world unlocks when all four stories in the prior world are complete; the `WORLD_UNLOCK_REQUIRES_MINI_GAME` constant in `storyline.ts` can require its game too. `Unlock all (demo)` marks all stories and games complete; `Reset progress` clears both.

Add a future world by extending `WorldId`, `WORLDS`, and the `WorldsService` id list, then add its generator and carousel-specific presentation in `src/app/worlds/worlds/` and `WorldCarousel`. Carousel angles, wraparound, and dots use the world count. The CSS circles remain a device fallback and should receive a matching gradient class for a fourth world.

Apollo 11 and Opportunity reuse the existing map copy and sources, with the supplied Opportunity distance/dust-storm fact added. Other machine entries use only the supplied seed text; unprovided fields are marked `TODO: verify with NASA source`, and unknown source URLs are empty. Every entry has an `imageKey` and currently uses the neutral placeholder at `public/roadmap/unresearched.svg` until image paths are supplied.

Machine previews appear on hover, keyboard focus, or touch activation. The mini-game preview follows the same interaction and explains that all four stories are needed to unlock it. Opening a story navigates to a full-page reader with first-person sections, fact-check sources, speech synthesis when supported, previous/next navigation, and reading progress. YouTube thumbnails are lazy-loaded; an iframe is created only after Play is pressed. It is removed on route exit, and an embed timeout leaves the direct YouTube link available. First-person narration is marked as creative voice. Story completion records progress and unlocks the next story.
### World mini-games

The mini-game shell and activities are loaded through an Angular `@defer` block. Each activity has instructions, keyboard/touch controls, replay, a short timer, an accessible status message, and a completion badge stored with world progress. The badge appears on its carousel card.

- Moon reuses the Mission Lab Apollo cargo activity. Players drag gear or select it and use “Leave on the Moon” / “Bring home” buttons. This remains a simplified learning activity, not a historical loading manifest.
- Mars is a solar-panel alignment activity. A slider or arrow keys adjusts the panel to track the moving Sun; a dust storm starts halfway through. Opportunity and InSight facts appear after success.
- Outer Solar System is a radio-tuning activity. A slider or arrow keys moves the signal meter; locking onto Voyager 1 completes it. The success view links to NASA mission status and says the signal takes many hours to reach Earth without claiming a distance.

### Adding a roadmap machine

Add a `MachineStory` record to the appropriate world's `machines` array in `src/app/storyline/machines.data.ts`. Include its unique `id` and `imageKey`; replace `TODO: verify with NASA source` fields only after checking a NASA source. Put the image in `public/` and update the `image` path. The world scene derives its node count and path spacing from `machines.length`.

### Planetary artifact map

`ArtifactMap` dynamically imports Leaflet after the browser renders. This avoids running Leaflet's browser-only DOM code during server rendering. The map can switch between NASA/JPL lunar and Mars surface tiles and displays one marker on the selected planet:

- Apollo 11 Lunar Module descent stage at Tranquility Base, using the coordinates in the [NASA Apollo 11 summary](https://www.nasa.gov/wp-content/uploads/static/history/SP-4029/Apollo_11a_Summary.htm).
- Opportunity in the Endeavour Crater area. Its marker is approximate, not a claim about the rover's exact position; the site summary links to a [USGS Endeavour Crater reference](https://www.usgs.gov/publications/context-ancient-aqueous-environments-mars-situ-geologic-mapping-endeavour-crater).

Selecting a marker opens a space-themed story modal with a motion-graphics/video placeholder, short copy, a field fact, and an external source link. The stories are hard-coded in the component; they are not loaded from the project PDF, a CMS, or an API. Tile imagery comes from NASA/JPL Solar System Treks and requires an internet connection. Map initialization errors are shown in the UI, but tile download failures do not currently have a dedicated error message or retry control.

### Apollo cargo mini-game

`ApolloGame` uses Angular CDK drag and drop with two connected lists: Lunar Module and Lunar Surface/discard pile. The sample items are Portable Life Support System, Lunar Overshoes, and Emesis Bags. Moving all three to the discard pile displays:

> Weight limit reached! You have room for the Moon Rocks. Lift-off successful!

The game can be reset, and moving an item back to the Lunar Module removes the completed state. This is a simplified learning activity: it has no item masses or payload calculation and is not a historically accurate Apollo loading record. Its state exists only in the browser and resets when the page is reloaded.

The game and Apollo chat use the sprite sheet generated by `npm run apollo-sprites`. The script reads the raw PNG strips from `public/assets/game/astronauts/raw/` or the existing legacy `public/assests/game/astronauts/raw/` directory, and writes the sheet, row configuration, and previews into `public/assets/game/astronauts/`. It requires Python with Pillow and NumPy; raw strips are never modified. The player loads frame counts and timing from `apollo-sprites.json`, and supports loop and ping-pong playback. Idle currently uses the first three frames to avoid the remaining frames' body turn.

### Chat widget

Apollo appears on every route as a fixed sprite-sheet avatar with a soft glow; if the JSON or image cannot load, the prior round launcher remains available. Hover or keyboard focus starts the wave and displays â€œHello Explorer, I'm Apollo.â€ On touch devices, the greeting appears once per browser session after four seconds. The configured profile name defaults to `Apollo`; the name is not sent to the server. Reduced-motion mode shows a static wave frame.

Activating Apollo opens a labeled dialog, focuses the question field, supports Escape and close-button dismissal, and returns focus to Apollo. The header avatar is Apollo; the sprite reacts happily to a reply and sadly to a connection error, then returns to idle. The cargo game's active drag marks Apollo busy and disables the launcher accessibly. The chat starts with suggested questions, keeps messages in component memory, and sends one request at a time. The transcript is not saved after reload, and previous turns are not sent as model conversation history. Errors show a generic connection message; there is no retry button, reset button, or streaming response display. The current app has no separate wrong-answer or boss-battle state.

## Chat backend

The Express app in `src/server.ts` defines `POST /chat` before serving static browser files and handing page requests to Angular SSR. It calls the OpenAI Responses API from the server, so `OPENAI_API_KEY` is never sent to Angular. `src/shared/machine-facts.ts` derives the facts available to the server from the story data; only stories with a source URL and no TODO fields are included.

### Request and response

Request:

```json
{
  "message": "What happened at Tranquility Base?",
  "completedMachineIds": ["apollo-lm"]
}
```

Successful response:

```json
{
  "reply": "A short answer from Apollo."
}
```

The server rejects empty questions and questions over 1,000 characters. Completed IDs are checked against the 12 supported story IDs; unknown values are dropped and duplicates removed. The browser sends no profile name or other profile data. The JSON body parser has a 4 KB limit. The model call has a 30-second timeout, a 220-token output limit, and sends `store: false` to the Responses API. Provider failures are logged server-side and returned to the browser as a generic error.

### Knowledge and answer limits

For each request, Apollo's system prompt includes general project notes, verified facts only for the completed machine IDs, and the names of locked stories without their facts. Apollo is instructed to speak in first person, use short child-friendly answers, refuse details about locked stories, and admit when supplied facts do not answer a question. Stories with TODO fields or no source URL contribute no facts. The project PDF is not parsed at runtime, and there is no search index or retrieval system.

`completedMachineIds` comes from browser storage, so this completion lock is a game rule and not a security boundary. A user can alter the request and mark a story complete. Never use this client-controlled lock to protect confidential information.

### Limits and operations

- The API key is read from the Node process environment. `.env.example` is a template; the app does not automatically load a `.env` file.
- The rate limit is 20 requests per IP per 10 minutes, held in an in-memory map. It resets when the process restarts and is not shared across multiple server instances.
- There is no user authentication, database, persistent chat history, streaming, or durable abuse monitoring.
- The server does not configure Express `trust proxy`; depending on the hosting setup, `req.ip` may not represent the original visitor IP.
- Requests send the latest user message to OpenAI. The endpoint does not pass prior messages or use the Responses API's stored conversation state.
- Without `OPENAI_API_KEY`, the endpoint returns HTTP 503. External model access also depends on a valid key, enabled model, network access, and the provider account's availability.

## Run the project

### Development

The project uses Angular CLI's development server. On PowerShell, set the server variables in the same shell before launching:

```powershell
$env:OPENAI_API_KEY = "your-server-side-key"
$env:OPENAI_MODEL = "gpt-4.1-mini"
npm start
```

Open `http://localhost:4200/`. The `OPENAI_MODEL` variable is optional; the server defaults to `gpt-4.1-mini`. Do not put the API key in Angular source, a browser environment file, or a committed `.env` file.

### Production server

```bash
npm run build
```

Set `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`) in the Node hosting environment, then run:

```bash
npm run serve:ssr:ask-the-machine-app
```

The server listens on `PORT` when provided, otherwise port `4000`. The project has no hosting-provider deployment configuration yet; deploy the built Angular/Express server to a Node-capable host and configure the secret there.

## What works and what is unfinished

### Implemented

- Standalone Angular pages and client routing for `/`, `/storylines`, `/storylines/:worldId/:machineId`, and `/missions`.
- Shared static space backdrop and floating Apollo chat widget with accessible dialogs, sprite reactions, reduced-motion handling, and busy-state support.
- Lazy, generated Moon/Mars/Outer worlds with route-level object reuse, loading/error states, responsive quality, fallback carousel, and Apollo 11 marker.
- Browser-only Leaflet initialization, Moon/Mars tile switching, artifact markers, story modal, and source links.
- Angular CDK drag/drop interaction, progress count, completion message, and game reset.
- Express `POST /chat` integration with request checks, a server-side provider call, and a per-request, completed-story-aware Apollo prompt.
- Server rendering and prerender configuration.

### Not implemented or incomplete

- Scroll-driven spacecraft journeys, timeline progress, machine sprites, and reveal-on-arrival stories.
- The procedural worlds and satellite layout are educational illustrations, not dimensionally accurate planetary orbits or NASA terrain datasets.
- The supplied world module's `setQuality()` is not implemented; the app creates/reuses worlds per tier instead. Its module-level Moon/Mars texture cache is not cleared by `World.dispose()`, despite the README's full-cleanup claim.
- Verified NASA details and source links for machine entries that currently carry TODO fields.
- Machine-specific conversation history and model conversation memory.
- PDF ingestion or source retrieval for the chatbot; it uses general project notes and source-backed stories that have no TODO fields.
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

The current suite covers the app shell, world-carousel wraparound/keyboard/locked entry, world-service caching and teardown, server-side import guard, story counts, sequential unlock rules, mini-game unlock and progress migration, equal-distance path points for five trail stops, and preview-card placement. The planetary artifact map, cargo drag/drop mechanics, chat widget, and Express endpoint still lack behavior-level tests.
