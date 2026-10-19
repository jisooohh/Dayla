# Third-party notices

## Project-1 design adaptation

- Source: https://github.com/Atharvsinh-codez/Project-1
- Reviewed commit: `7f0d2406cf7af012386ebbea0ee47e0383251cb8` (`Create LICENSE`).
- Root license: MIT, Copyright (c) 2026 Project-1 By Atharvsinh Jadav.
- Complete preserved license: [docs/licenses/Project-1-MIT.txt](docs/licenses/Project-1-MIT.txt).

The upstream README still contains a proprietary / all-rights-reserved statement. This inconsistency is disclosed; the explicit root MIT license at the identified commit is the permission used for this source adaptation. No permission is asserted for third-party assets in that repository.

Actual adaptations:

| Upstream source                     | Dayla destination                             | Adaptation                                                                       |
| ----------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------- |
| `app/globals.css`                   | `src/client/styles.css`                       | Cream `#f9efe3` canvas and warm neutral palette                                  |
| `app/(protected)/layout.tsx`        | `src/client/App.tsx`, `styles.css`            | White sidebar, separate content panel, orange active marker                      |
| `components/dashboard/StatCard.tsx` | `src/client/features/Today.tsx`, `styles.css` | Rounded orange/cream card hierarchy, adapted into clock and next-response panels |

Dayla replaces trading/navigation content with Korean daily support, increases control sizes, adds responsive reflow, and uses dark text on orange plus a darker primary action for contrast. The Dayla wordmark and favicon are original. No upstream photos, Obsidianui branding, screenshots, external fonts, authentication or trading logic are distributed.

## Direct runtime dependencies

Versions and license declarations below were read from the installed packages. Each package retains its own copyright and complete license in its npm distribution. Exact direct and transitive versions are in `package-lock.json`.

| Package        | Version | License |
| -------------- | ------- | ------- |
| better-sqlite3 | 12.4.1  | MIT     |
| express        | 5.3.0   | MIT     |
| lucide-react   | 1.59.0  | ISC     |
| node-cron      | 4.6.0   | ISC     |
| react          | 19.3.1  | MIT     |
| react-dom      | 19.3.1  | MIT     |
| rss-parser     | 3.13.0  | MIT     |
| zod            | 4.6.7   | MIT     |

Lucide icons include the Lucide ISC license and Feather-derived MIT material; keep the package LICENSE with redistributed bundles. React and React DOM MIT notices are also preserved in [docs/licenses](docs/licenses).

Cline is not installed as a Dayla dependency and no Cline source is redistributed. The initial implementation was performed by Codex after the user explicitly decoupled Cline authentication from development.
