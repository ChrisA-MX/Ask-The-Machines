# AskTheMachineApp

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.1.7.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Chat backend

The Express server exposes `POST /chat` and calls the OpenAI Responses API from the server. The API key must stay in the server environment; never add it to Angular files or `src/environments`.

Request:

```json
{ "machineId": "project-guide", "message": "What is this project about?" }
```

Success response:

```json
{ "reply": "..." }
```

For local development, set your key in the shell before starting the app. In PowerShell:

```powershell
$env:OPENAI_API_KEY = "your-key"
$env:OPENAI_MODEL = "gpt-4.1-mini"
npm start
```

For deployment, set `OPENAI_API_KEY` and optionally `OPENAI_MODEL` in the hosting provider's server environment settings. Do not commit `.env`. The endpoint limits each message to 1,000 characters and applies a basic per-IP request limit. Answers are grounded in the project plan; mission-specific facts should be added only after the team chooses machines and prepares verified fact sheets.

## Mission lab

Open `/missions` to explore the planetary artifact map and Apollo cargo mini-game. The map uses NASA/JPL Solar System Trek lunar and Mars tiles and loads Leaflet only in the browser so it remains compatible with the current server-rendered build. Artifact stories include source links; replace the marked mock story content with the team's final researched copy.

The game uses Angular CDK drag and drop. Its cargo list is sample gameplay data, not a historical Apollo load manifest.

To add these dependencies to a fresh checkout:

```bash
npm install @angular/cdk leaflet
npm install --save-dev @types/leaflet sass
```

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
"# Ask-The-Machines" 
