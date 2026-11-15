# Ask the Machines: submission notes

Drafts for the Space Apps project page, plus deploy steps. Edit anything that doesn't sound like the team. Lines marked **TEAM** need a human answer before you submit.

## Project name

Ask the Machines

## High-level project summary (short)

NASA has left machines all over the solar system. Some sit silent on the Moon. Some are buried in Martian dust. Two are still phoning home from between the stars. Ask the Machines lets kids aged 9 to 14 meet twelve of them. Each machine tells its own story in first person, every fact links to the NASA page it came from, and a live counter shows how far Voyager 1 is from Earth right now. Kids can spin 3D models, play a mini-game in each world, and ask Apollo, our astronaut guide, anything about the missions. We built it so the hardware NASA left behind feels less like junk and more like a cast of characters worth remembering.

## Detailed project description

**What it does.** Ask the Machines is a storytelling website with three worlds: the Moon, Mars and the outer solar system. Each world holds four machines on a trail. You read a story, it unlocks the next one, and when you finish all four you unlock a mini-game.

- **Stories.** Twelve machines, from Surveyor 3 (1967) to New Horizons. Each story has four parts: who I am, how I worked, what I found, where I am now. A read-aloud button helps younger readers.
- **Fact check.** Under every story is a list of the facts behind it, each with a link to its NASA source. There are 58 facts in total.
- **Live NASA data.** A counter on the home page and the Voyager 1 story shows Voyager 1's distance from Earth and how long a radio signal takes to get there. This week it counts down to a real milestone: NASA says Voyager 1 reaches one light-day from Earth on November 18, 2026.
- **Mission Lab.** Five 3D models you can rotate and zoom.
- **Mini-games.** Pack the Lunar Module, keep Opportunity's solar panels facing the Sun through a dust storm, and tune a radio dish to find Voyager 1.
- **Sound.** A quiet space theme and small sounds for taps, page changes, chat messages and finished stories. The music fades down during read-aloud and videos, and one button mutes everything.
- **Apollo.** A chat guide that answers questions using only our NASA-sourced story notes. If the AI model is unreachable, Apollo still answers straight from the notes, so the chat never goes dark.

**How it works.** The site is an Angular app with a small Express server. Stories live in one JSON file, which feeds the reader, the trail, the chat and the credits page, so a fact is written once and checked once. 3D worlds and models use Three.js. The Voyager counter starts from NASA's published milestone (25.902 billion km on November 18, 2026) and NASA's published speed, then accounts for Earth's own trip around the Sun.

**Why it matters.** The challenge asks for stories that introduce school-age space fans to hardware NASA left behind and the science it made possible. Kids remember characters better than spec sheets. Giving Opportunity a voice, then showing the NASA record behind every line, lets a ten-year-old enjoy the story and trust it too.

**What we'd do next.** More machines (Spirit, the Viking landers, Pioneer 11), more languages, and a classroom mode for teachers.

**Tools and languages.** TypeScript, Angular, Three.js, Express, HTML and CSS.

## NASA data

We used NASA mission records as the backbone of every story, and each fact in the app links to its source.

- **NASA Science and JPL mission pages and news releases** for dates, distances, instruments and discoveries (full list under References).
- **NASA's Voyager status page** for the live distance counter. We anchor to NASA's published one-light-day milestone and speed, then compute the current distance in the browser.
- **NASA Technical Reports Server (NTRS)** for the Surveyor III preliminary report and the ALSEP Termination Report.
- **NSSDCA** for the Apollo Lunar Roving Vehicle.
- **NASA and JPL videos** on YouTube, embedded at the end of each story.
- **NASA 3D Resources** for the Apollo Lunar Module and Voyager models and the Earth, Moon and Mars globes. Three Mars models come from Sketchfab artists under CC BY 4.0 (see References).

## Space Agency Partner and other data

- U.S. Congress, Public Law 116-275 (One Small Step to Protect Human Heritage in Space Act), for the Apollo site protection fact.
- Smithsonian National Air and Space Museum, for the lunar rover's remote-controlled TV camera.
- **TEAM:** add any partner-agency data if you used some. If not, write "None".

## Use of artificial intelligence

We used AI in four ways and want to be clear about each.

1. **Apollo, the in-app guide.** Apollo's answers come from an NVIDIA Nemotron language model (with OpenAI as an optional backup). The model is instructed to use only our story notes, which come from NASA sources, and to say "I don't know that yet" otherwise. If no model is available, Apollo answers directly from the notes without AI.
2. **Building the site.** We used AI coding assistants, including Anthropic's Claude, to help write, review and test code, shrink the 3D model files, and cross-check story facts against NASA pages. Team members reviewed the output.
3. **Writing.** The first-person voice of each machine is creative writing. The facts are from NASA and are listed with links.

4. **Artwork.** The twelve machine illustrations and the Apollo astronaut sprites were generated by our team with Google Gemini. They are illustrations, not NASA photographs, and contain no NASA logos. Every machine illustration carries a visible "AI-generated image" watermark, and the chat panel labels Apollo's artwork as AI-generated. The loading animation was made by the team with help from Gemini.

- **TEAM:** name any other AI tools you used, if there are any.

## References

**NASA and other sources behind the stories**
- NASA Science: Surveyor 3: https://science.nasa.gov/mission/surveyor-3
- NASA SP-146, Surveyor III: A Preliminary Report: https://ntrs.nasa.gov/citations/19670023253
- NASA Science: Footpads and Footprints: https://solarsystem.nasa.gov/news/1111/footpads-and-footprints-humans-and-machine-meet-on-the-moon
- NASA: Apollo 11 mission: https://www.nasa.gov/mission/apollo-11/
- NASA JPL: Apollo 11 Experiment Continues to Return Valuable Data: https://www.jpl.nasa.gov/news/apollo-11-experiment-continues-to-return-valuable-data/
- U.S. Congress: Public Law 116-275: https://www.congress.gov/116/plaws/publ275/PLAW-116publ275.htm
- NASA NSSDCA: The Apollo Lunar Roving Vehicle: https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo_lrv.html
- NASA: Duct Tape Saves the Day!: https://www.nasa.gov/image-article/duct-tape-saves-day/
- Smithsonian National Air and Space Museum: https://airandspace.si.edu/node/27575
- NASA SP-4029: Lunar Surface Experiments: https://www.nasa.gov/wp-content/uploads/static/history/SP-4029/Apollo_18-33_Lunar_Surface_Experiments.htm
- NASA: ALSEP Termination Report: https://ntrs.nasa.gov/citations/19790014808
- NASA Science: Mars Pathfinder: https://science.nasa.gov/mission/mars-pathfinder/
- NASA Science: Opportunity: https://science.nasa.gov/mission/mer-opportunity/
- NASA Science: Six Things to Know About Opportunity: https://science.nasa.gov/missions/mer/six-things-to-know-about-nasas-opportunity-rover/
- NASA JPL: Opportunity Rover Mission on Mars Comes to End: https://www.jpl.nasa.gov/news/nasas-opportunity-rover-mission-on-mars-comes-to-end/
- NASA Science: Spirit: https://science.nasa.gov/mission/mer-spirit/
- NASA Science: InSight Lander: https://science.nasa.gov/mission/insight/
- NASA JPL: How InSight Revealed the Heart of Mars: https://www.jpl.nasa.gov/edu/resources/teachable-moment/how-insight-revealed-the-heart-of-mars/
- NASA JPL: NASA Retires InSight Mars Lander Mission: https://www.jpl.nasa.gov/news/nasa-retires-insight-mars-lander-mission-after-years-of-science
- NASA JPL: Ingenuity Helicopter Mission Ends: https://www.jpl.nasa.gov/news/after-three-years-on-mars-nasas-ingenuity-helicopter-mission-ends/
- NASA Science: Pioneer 10: https://science.nasa.gov/mission/pioneer-10
- NASA Science: Pioneer 10 Sends Last Signal: https://science.nasa.gov/missions/pioneer/pioneer-10-sends-last-signal/
- NASA Science: Voyager 1: https://science.nasa.gov/mission/voyager/voyager-1/
- NASA JPL: Voyager 1 Resumes Sending Engineering Updates: https://www.jpl.nasa.gov/news/nasas-voyager-1-resumes-sending-engineering-updates-to-earth/
- NASA Science: Where Are Voyager 1 and Voyager 2 Now?: https://science.nasa.gov/mission/voyager/where-are-voyager-1-and-voyager-2-now/
- NASA Science: Voyager 2: https://science.nasa.gov/mission/voyager/voyager-2
- NASA JPL: NASA Turns Off Science Instrument to Save Voyager 2 Power: https://www.jpl.nasa.gov/news/nasa-turns-off-science-instrument-to-save-voyager-2-power
- NASA JPL: Voyager 2 Communications Pause: https://www.jpl.nasa.gov/news/nasa-mission-update-voyager-2-communications-pause/
- NASA Science: New Horizons: https://science.nasa.gov/mission/new-horizons/

**Videos**
- Surveyor III Sample Scoop--a Piece of a Real Lunar Spacecraft (NASA): https://www.youtube.com/watch?v=jeOTJd5GZYk
- Apollo 11 Descent: Film and LRO Imagery (NASA): https://www.youtube.com/watch?v=YKXw_3Pblh8
- Apollo 15 Lunar Rover Moon Landing Footage Upscaled and Interpolated to 60 FPS (NASA footage restoration): https://www.youtube.com/watch?v=QJW2Za9sg0c
- ALSEP: Apollo's Unsung Experiments (NASA): https://www.youtube.com/watch?v=V_EWCVqNFSk
- NASA at Mars: 20 years of 24/7 exploration (NASA): https://www.youtube.com/watch?v=JXZa8cmab1g
- Opportunity's 15-Year Mission to Find Water on Mars (NASA): https://www.youtube.com/watch?v=WjVjS98BBA4
- Listen to NASA's InSight at Work on Mars (NASA): https://www.youtube.com/watch?v=m9cCuW9nIQg
- Watch Ingenuity's highlights as NASA's Mars helicopter mission ends after 72 flights (NASA): https://www.youtube.com/watch?v=D0fkI8mO1LA
- Astronomers Track a Deep-Space Anomaly in NASA's Pioneer 10 and 11 Missions (NASA): https://www.youtube.com/watch?v=70gb4w5zY00
- Voyager Reaches Interstellar Space (NASA): https://www.youtube.com/watch?v=L4hf8HyP0LI
- NASA's Voyager 2 Probe Enters Interstellar Space (NASA): https://www.youtube.com/watch?v=HzGTYwZEOLs
- New Horizons Flyover of Pluto (NASA): https://www.youtube.com/watch?v=g1fPhhTT2Oo

**Code and fonts**
- Angular, Angular CDK and Angular SSR (MIT): https://angular.dev/
- Three.js (MIT): https://threejs.org/
- Draco 3D compression (Apache-2.0): https://github.com/google/draco
- meshoptimizer (MIT): https://github.com/zeux/meshoptimizer
- glTF-Transform (MIT), used to compress models: https://gltf-transform.dev/
- Express (MIT): https://expressjs.com/
- dotLottie Web (MIT): https://github.com/LottieFiles/dotlottie-web
- RxJS (Apache-2.0): https://rxjs.dev/
- DM Sans and Space Grotesk via Google Fonts (SIL Open Font License): https://fonts.google.com/
- NASA media usage guidelines: https://www.nasa.gov/nasa-brand-center/images-and-media/

**3D models**
- Apollo Lunar Module, NASA / Michael D. Carbajal, NASA 3D Resources: https://science.nasa.gov/3d-resources/apollo-lunar-module/
- Voyager, NASA 3D Resources: https://science.nasa.gov/3d-resources/voyager/ (**TEAM:** confirm this is the page it was downloaded from)
- Earth, Moon and Mars globes (files Earth_1_12756.glb, Moon_1_3474.glb, Mars_1_6792.glb), NASA Visualization Technology Applications and Development (VTAD), NASA 3D Resources: https://science.nasa.gov/3d-resources/ (**TEAM:** confirm, and swap in the exact page links if you have them)
- "Mars Rover" by Rasmus.Eist, CC BY 4.0: https://sketchfab.com/3d-models/mars-rover-c335b137a3564b33baf2dbac5502d1b9
- "Mars Ingenuity Helicopter" by Marco_Romero, CC BY 4.0: https://sketchfab.com/3d-models/mars-ingenuity-helicopter-201020c6e7e04440a7a956abeda32040
- "Ingenuity Flight" by Sakado (HermanKruger), CC BY 4.0: https://sketchfab.com/3d-models/ingenuity-flight-2656b588baae44198e0d1b3125b77208
- CC BY 4.0 licence: https://creativecommons.org/licenses/by/4.0/ . We compressed the three Sketchfab models for faster loading and made no other changes.

**Original artwork**
- Machine illustrations (`public/assets/mac_images`) and Apollo astronaut sprites: AI-generated by the team with Google Gemini (https://gemini.google.com/). Loading animation: made by the team with help from Gemini.

**Sound**
- Sound effects and theme music are original and generated in the browser with the Web Audio API (https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API). No recordings or samples are used.

## Deploying (needs a Node host, not a static one)

The chat needs the Express server, so use Render, Railway or similar.

1. Push your branch to GitHub.
2. On Render: New, Web Service, pick the repo and branch.
3. Build command: `npm ci && npm run build`
4. Start command: `npm run serve:ssr:ask-the-machine-app`
5. Environment variables: `NVIDIA_API_KEY` (required for AI answers), `NVIDIA_MODEL` (optional).
6. If you use your own domain, also set `NG_ALLOWED_HOSTS=yourdomain.com`. Addresses ending in onrender.com, up.railway.app, netlify.app, vercel.app and fly.dev are already allowed.
7. Open the site, ask Apollo a question, and check `/about` and a made-up address such as `/nope` (it should show the 404 page).

Free Render services sleep after a while and take up to a minute to wake. Open the link yourself shortly before judging starts.
